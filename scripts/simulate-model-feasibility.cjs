// Synthetic feasibility checks only. Not observed clinic outcomes or a validated score.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }).outputText,
  file,
);

const { calculateViability, VIABILITY_DEFAULTS } = require('../src/data/viability-engine.ts');
const { modelFor } = require('../src/data/viability-models.ts');

const model = modelFor('정형외과');
const baseline = {
  ...VIABILITY_DEFAULTS,
  monthlyUtilization: 0.12,
  retention: 0.7,
  catchmentFactor: 0.75,
  revenuePerVisitWon: 80000,
  fixedCostWon: 32000000,
  monthlyCapacity: 1200,
  uncertainty: 0.3,
};

function clinic(id, doctors, minutes, options = {}) {
  return {
    id,
    name: id,
    travelMinutes: minutes,
    doctors,
    relevantEquipment: Boolean(options.relevantEquipment),
    beds: options.beds || 0,
    bedRelevant: Boolean(options.bedRelevant),
    specialtyOverlap: options.specialtyOverlap === undefined ? 1 : options.specialtyOverlap,
  };
}

function illustrativeStrength(competitor) {
  // Illustrative supplier-capacity rule, not a learned coefficient.
  const doctors = Math.max(1, competitor.doctors || 1);
  const physicianComponent = 0.6 + 0.4 * Math.min(doctors, 8);
  const equipmentComponent = competitor.relevantEquipment ? 1.25 : 1;
  const bedComponent = competitor.bedRelevant ? 1 + Math.min(competitor.beds, 100) / 500 : 1;
  return Math.max(0.01, Math.min(100,
    physicianComponent * equipmentComponent * bedComponent * competitor.specialtyOverlap));
}

function run(targetPopulation, competitors, overrides = {}, improved = false) {
  if (targetPopulation === null) return null;
  const inputs = { ...baseline, ...overrides, targetPopulation };
  const supplied = competitors.map((competitor) => ({
    id: competitor.id,
    name: competitor.name,
    travelMinutes: competitor.travelMinutes,
    attraction: improved ? illustrativeStrength(competitor) : 1,
    evidence: 'assumption',
  }));
  const result = calculateViability(inputs, supplied, model);
  if (!improved) return result;
  // Absolute opportunity gate: even with no nearby rivals, demand must cover costs.
  const upperBound = calculateViability(inputs, [], model).visits;
  const decisionScore = upperBound < (result.bepVisits || Infinity)
    ? Math.min(result.score || 0, 40)
    : result.score;
  return { ...result, upperBound, decisionScore };
}

const scenarios = [
  { name: '거주인구 부족·경쟁 2곳', demand: 900, rivals: [clinic('a', 1, 5), clinic('b', 1, 8)] },
  { name: '인구 충분·작은 경쟁 2곳', demand: 30000, rivals: [clinic('a', 1, 5), clinic('b', 1, 8)] },
  { name: '인구 충분·큰 경쟁 2곳', demand: 30000, rivals: [clinic('a', 6, 5, { relevantEquipment: true, beds: 60, bedRelevant: true }), clinic('b', 5, 8, { relevantEquipment: true })] },
  { name: '주거 적음·검증된 직장 수요', demand: 7000, rivals: [clinic('a', 1, 8)] },
  { name: '환자층 있음·월세 부담 큼', demand: 30000, rivals: [clinic('a', 1, 5)], overrides: { fixedCostWon: 70000000 } },
  { name: '병상·MRI가 진료에 무관', demand: 30000, rivals: [clinic('a', 2, 5, { beds: 100, relevantEquipment: false, bedRelevant: false })] },
  { name: '필수 환자 자료 없음', demand: null, rivals: [clinic('a', 1, 5)] },
];

for (const scenario of scenarios) {
  const current = run(scenario.demand, scenario.rivals, scenario.overrides, false);
  const improved = run(scenario.demand, scenario.rivals, scenario.overrides, true);
  const row = {
    scenario: scenario.name,
    currentVisits: current ? Math.round(current.visits) : null,
    currentScore: current?.score ?? null,
    capacityAwareVisits: improved ? Math.round(improved.visits) : null,
    capacityAwareScore: improved?.decisionScore ?? null,
    absoluteDemandCeilingVisits: improved ? Math.round(improved.upperBound) : null,
    breakEvenVisits: improved?.bepVisits ? Math.ceil(improved.bepVisits) : null,
  };
  process.stdout.write(`${JSON.stringify(row)}\n`);
}

const sparse = scenarios[0];
assert(run(sparse.demand, sparse.rivals, {}, true).decisionScore <= 40);
assert(run(scenarios[2].demand, scenarios[2].rivals, {}, true).visits <
  run(scenarios[1].demand, scenarios[1].rivals, {}, true).visits);
assert.equal(run(scenarios[5].demand, scenarios[5].rivals, {}, true).visits,
  run(scenarios[5].demand, [clinic('a', 2, 5)], {}, true).visits);
assert(run(scenarios[4].demand, scenarios[4].rivals, scenarios[4].overrides, true).decisionScore <
  run(scenarios[1].demand, scenarios[1].rivals, {}, true).decisionScore);
assert.equal(run(null, scenarios[6].rivals, {}, true), null);
process.stdout.write('PASS: synthetic demand floor, competitor size, irrelevant equipment, cost, missing-data checks\n');
