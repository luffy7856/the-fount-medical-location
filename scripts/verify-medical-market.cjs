const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, file);
const { deriveMedicalMarket } = require('../src/data/medical-market.ts');

const metrics = [
  ['접근성', 86], ['소비력', 95], ['경쟁환경', 7], ['잠재환자 수요', 84],
].map(([label, value]) => ({ label, value, note: '', color: '' }));
const gangnam = {
  specialty: '피부과', metrics,
  counts: { matchingSpecialty: 194 },
  demographics: { workerPopulation: 176522 },
  livingPopulation: { status: 'available', total: 271272 },
};
const dense = deriveMedicalMarket(gangnam, 26490);
assert(dense.outsidePopulation > 20000);
assert(dense.clusterDemandMultiplier > 2.5);
assert(dense.competitionSensitivity < 1);
assert.equal(dense.reachablePopulation, dense.localTargetPopulation + dense.outsidePopulation);

const sparse = deriveMedicalMarket({
  ...gangnam,
  counts: { matchingSpecialty: 2 },
  demographics: { workerPopulation: 0 },
  livingPopulation: { status: 'no_data' },
  metrics: metrics.map(metric => ({ ...metric, value: 50 })),
}, 200);
assert.equal(sparse.outsidePopulation, 0);
assert.equal(sparse.reachablePopulation, 200);
assert(sparse.clusterDemandMultiplier < dense.clusterDemandMultiplier);

const pediatric = deriveMedicalMarket({ ...gangnam, specialty: '소아청소년과' }, 26490);
assert(pediatric.outsidePopulation < dense.outsidePopulation);
assert(pediatric.clusterDemandMultiplier < dense.clusterDemandMultiplier);
console.log('PASS: cluster attraction is specialty-specific, non-linear and cannot create demand without observed population');
