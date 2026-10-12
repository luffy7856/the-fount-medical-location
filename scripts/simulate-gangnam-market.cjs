const assert = require('node:assert/strict');
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

(async () => {
  const response = await fetch('https://the-fount-medical-location.vercel.app/api/analyze', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: '서울 강남구 테헤란로 123', specialty: '피부과', radiusMeters: 1000 }),
  });
  assert.equal(response.ok, true);
  const analysis = refineClinicalAnalysis(await response.json());
  const localTarget = clinicalDemand(analysis)?.target ?? 0;
  const market = deriveMedicalMarket(analysis, localTarget);
  const model = modelFor(analysis.specialty);
  const fixedCostWon = (inputs.monthlyRentManwon + inputs.monthlyPayrollManwon + inputs.monthlyMarketingManwon +
    inputs.monthlyOtherCost + Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) *
    inputs.annualInterest / 1200) * 10000;
  const competitors = analysis.places.filter(place => place.kind === 'hospital' &&
    matchesSpecialty(place.name, place.specialty, analysis.specialty)).map(place => ({
      id: place.id, name: place.name, travelMinutes: Math.max(1, place.distanceMeters / 80),
      attraction: competitorStrength(place), evidence: 'observed',
    }));
  const common = {
    ...model.defaults, targetPopulation: localTarget,
    revenuePerVisitWon: inputs.revenuePerPatient * 10000, fixedCostWon,
    variableRate: inputs.variablePercent / 100, monthlyCapacity: inputs.dailyPatients * inputs.clinicDays,
    startupCapitalWon: (inputs.depositManwon + inputs.openingBudgetManwon) * 10000,
    monthlyRentWon: inputs.monthlyRentManwon * 10000,
    monthlyDebtPrincipalWon: Math.min(inputs.loanAmount, inputs.depositManwon + inputs.openingBudgetManwon) /
      Math.max(1, inputs.loanMonths) * 10000,
  };
  const rawPower = competitors.reduce((sum, competitor) => sum + competitor.attraction, 0);
  const oldMarketVisits = localTarget * model.defaults.monthlyUtilization * model.defaults.catchmentFactor * model.defaults.retention;
  const oldVisits = Math.min(common.monthlyCapacity, oldMarketVisits * model.defaults.entrantAttraction /
    (model.defaults.entrantAttraction + model.defaults.outsideAttraction + rawPower));
  const improved = calculateViability({ ...common,
    inflowVisits: market.outsidePopulation * model.defaults.monthlyUtilization * model.defaults.catchmentFactor * model.defaults.retention,
    clusterDemandMultiplier: market.clusterDemandMultiplier,
    competitionSensitivity: market.competitionSensitivity,
  }, competitors, model);
  assert(improved.visits > oldVisits * 5);
  assert(improved.score !== null && improved.score > 0);
  assert(improved.visits < improved.marketVisits);
  console.log(JSON.stringify({
    directCompetitors: competitors.length,
    localTarget, outsidePopulation: market.outsidePopulation,
    clusterMultiplier: Number(market.clusterDemandMultiplier.toFixed(2)),
    old: { visits: Math.round(oldVisits), score: 0 },
    improved: { visits: Math.round(improved.visits), bepVisits: Math.ceil(improved.bepVisits), score: improved.score },
  }, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
