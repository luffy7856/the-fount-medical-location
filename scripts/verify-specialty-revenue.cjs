const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, file);

const { estimateVisitRevenue, openingInputsWithVisitRevenue } = require('../src/data/specialty-revenue.ts');
const { DEFAULT_OPENING_INPUTS } = require('../src/data/opening-plan.ts');

const dental = estimateVisitRevenue({ specialty: '치과' });
assert.equal(dental.insuredPerVisitWon, 103900);
assert.equal(dental.nonCoveredExpectedWon, 90000);
assert.equal(dental.totalPerVisitWon, 193900);

const low = estimateVisitRevenue({ specialty: '치과', consumerPower: { status: 'available', percentile: 0 } });
const high = estimateVisitRevenue({ specialty: '치과', consumerPower: { status: 'available', percentile: 100 } });
assert.equal(low.insuredPerVisitWon, high.insuredPerVisitWon);
assert(low.totalPerVisitWon < dental.totalPerVisitWon);
assert(high.totalPerVisitWon > dental.totalPerVisitWon);
assert.equal(low.regionalMultiplier, .9);
assert.equal(high.regionalMultiplier, 1.1);

const automatic = openingInputsWithVisitRevenue({ specialty: '치과' }, DEFAULT_OPENING_INPUTS);
assert.equal(automatic.automatic, true);
assert.equal(automatic.inputs.revenuePerPatient, 19.39);
const manual = openingInputsWithVisitRevenue({ specialty: '치과' }, { ...DEFAULT_OPENING_INPUTS, revenuePerPatient: 22 });
assert.equal(manual.automatic, false);
assert.equal(manual.inputs.revenuePerPatient, 22);

// The three previously reviewed dental locations had 218, 343 and 360 expected
// monthly visits. With the specialty mix they no longer imply sub-5억원 revenue
// except the weakest site, which sits near the user's observed lower boundary.
const annualEok = [218, 343, 360].map(visits => visits * dental.totalPerVisitWon * 12 / 100000000);
assert(annualEok[0] >= 5 && annualEok[0] < 6);
assert(annualEok[1] >= 7 && annualEok[2] >= 8);

console.log('PASS: specialty insured + non-covered mix, bounded regional adjustment, manual override and dental revenue anchors');
console.log(JSON.stringify({ dental, annualEok: annualEok.map(value => Number(value.toFixed(2))) }, null, 2));

