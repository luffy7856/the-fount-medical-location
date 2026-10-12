const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { openingScoreV2, populationScoreCap } = require('../src/data/location-score-v2.ts');
const metrics = [
  ['잠재환자 수요', 90], ['경쟁환경', 85], ['소비력', 95],
  ['접근성', 95], ['비용효율', 90], ['성장성', 90],
].map(([label, value]) => ({ label, value, color: '#000', note: '' }));
const viable = { score: 85, coverage: 1.3, visits: 1000, bepVisits: 500 };
assert(openingScoreV2(metrics, viable, 10000) >= 80);
assert(openingScoreV2(metrics, { ...viable, score: 0, coverage: 0, visits: 0 }, 10000) <= 40);
assert(openingScoreV2(metrics, viable, 100) <= 40);
assert.equal(openingScoreV2(metrics, viable, 0), null);
assert.equal(openingScoreV2(metrics, { ...viable, bepVisits: null }, 10000), null);
assert.equal(openingScoreV2(metrics.map(item => item.label === '잠재환자 수요' ? { ...item, value: null } : item), viable, 10000), null);
assert.equal(populationScoreCap({ residentPopulation: 0, workerPopulation: 0 }), 40);
assert.equal(populationScoreCap({ residentPopulation: 0, workerPopulation: 0 }, { status: 'available', total: 9000 }), 100);
assert.equal(populationScoreCap(), 100);
console.log('PASS: low or absent patient demand cannot produce a high experimental opening score');
