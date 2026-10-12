const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, file);
const { refineClinicalAnalysis, clinicalDemand, competitorStrength } = require('../src/data/clinical-evaluation.ts');
const { deriveMedicalMarket } = require('../src/data/medical-market.ts');
const { calculateViability } = require('../src/data/viability-engine.ts');
const { modelFor } = require('../src/data/viability-models.ts');
const { matchesSpecialty } = require('../src/data/specialties.ts');
const { DEFAULT_OPENING_INPUTS: inputs } = require('../src/data/opening-plan.ts');
const { openingInputsWithVisitRevenue } = require('../src/data/specialty-revenue.ts');

const addresses = ['서울특별시 강서구 양천로 390', '서울특별시 영등포구 영중로 15', '서울특별시 용산구 한강대로 23'];

(async () => {
  const rows = [];
  for (const address of addresses) {
    const response = await fetch('https://the-fount-medical-location.vercel.app/api/analyze', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, specialty: '치과', radiusMeters: 1000 }),
    });
    if (!response.ok) throw new Error(`${address}: ${response.status}`);
    const analysis = refineClinicalAnalysis(await response.json());
    const targetPopulation = clinicalDemand(analysis)?.target ?? 0;
    const market = deriveMedicalMarket(analysis, targetPopulation);
    const model = modelFor('치과');
    const priced = openingInputsWithVisitRevenue(analysis, inputs);
    const fixedCostWon = (inputs.monthlyRentManwon + inputs.monthlyPayrollManwon + inputs.monthlyMarketingManwon +
      inputs.monthlyOtherCost + Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) *
      inputs.annualInterest / 1200) * 10000;
    const competitors = analysis.places.filter(place => place.kind === 'hospital' &&
      matchesSpecialty(place.name, place.specialty, '치과')).map(place => ({
      id: place.id, name: place.name, travelMinutes: Math.max(1, place.distanceMeters / 80),
      attraction: competitorStrength(place), evidence: 'observed',
    }));
    const result = calculateViability({
      ...model.defaults,
      targetPopulation,
      inflowVisits: market.outsidePopulation * model.defaults.monthlyUtilization * model.defaults.catchmentFactor * model.defaults.retention,
      clusterDemandMultiplier: market.clusterDemandMultiplier,
      competitionSensitivity: market.competitionSensitivity,
      revenuePerVisitWon: priced.inputs.revenuePerPatient * 10000,
      fixedCostWon,
      variableRate: inputs.variablePercent / 100,
      monthlyCapacity: inputs.dailyPatients * inputs.clinicDays,
      futureDemandFactor: 1,
      riskMultiplier: 1,
      startupCapitalWon: (inputs.depositManwon + inputs.openingBudgetManwon) * 10000,
      monthlyRentWon: inputs.monthlyRentManwon * 10000,
      monthlyDebtPrincipalWon: Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) / inputs.loanMonths * 10000,
    }, competitors, model);
    const publicRentManwon = analysis.rentMarket?.status === 'available' && analysis.rentMarket.monthlyRentPerPyeongManwon
      ? analysis.rentMarket.monthlyRentPerPyeongManwon * inputs.areaPyeong : inputs.monthlyRentManwon;
    const auditedFixedCostWon = (publicRentManwon + inputs.monthlyPayrollManwon + inputs.monthlyMarketingManwon +
      inputs.monthlyOtherCost + Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) *
      inputs.annualInterest / 1200) * 10000;
    const audited = calculateViability({
      ...model.defaults,
      targetPopulation,
      inflowVisits: market.outsidePopulation * model.defaults.monthlyUtilization * model.defaults.catchmentFactor * model.defaults.retention,
      clusterDemandMultiplier: market.clusterDemandMultiplier,
      competitionSensitivity: market.competitionSensitivity,
      revenuePerVisitWon: priced.inputs.revenuePerPatient * 10000,
      fixedCostWon: auditedFixedCostWon,
      variableRate: .25,
      monthlyCapacity: inputs.dailyPatients * inputs.clinicDays,
      futureDemandFactor: 1,
      riskMultiplier: 1,
      startupCapitalWon: (inputs.depositManwon + inputs.openingBudgetManwon) * 10000,
      monthlyRentWon: publicRentManwon * 10000,
      monthlyDebtPrincipalWon: Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) / inputs.loanMonths * 10000,
    }, competitors, model);
    rows.push({ address, regionScore: analysis.observedScore, visitRevenueManwon: priced.inputs.revenuePerPatient,
      visits: Math.round(result.visits), annualRevenueEok: Number((result.revenueWon * 12 / 100000000).toFixed(2)),
      rentPerPyeongManwon: analysis.rentMarket?.monthlyRentPerPyeongManwon ?? null,
      rentArea: analysis.rentMarket?.spatialUnit ?? null,
      breakEvenVisits: Math.ceil(result.bepVisits), businessScore: result.score,
      auditedBreakEven: Math.ceil(audited.bepVisits), auditedScore: audited.score, verdict: result.verdict });
  }
  console.table(rows);
})().catch(error => { console.error(error); process.exit(1); });
