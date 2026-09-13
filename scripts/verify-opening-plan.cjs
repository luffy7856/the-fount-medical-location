// Run with: node scripts/verify-opening-plan.cjs
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const Module = require('node:module');
const ts = require('typescript');
const source = path.join(__dirname, '../src/data/opening-plan.ts');
const compiled = new Module(source);
compiled._compile(ts.transpileModule(fs.readFileSync(source, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS }
}).outputText, source);
const { calculateOpeningPlan: calculate, DEFAULT_OPENING_INPUTS: inputs } = compiled.exports;
const analysis = { specialty: '소아청소년과', observedScore: 64 };
const baseline = calculate(analysis, inputs);
assert(Number.isFinite(calculate({ ...analysis, specialty: '비뇨기과' }, inputs).totalCashInvestment));
const higherDeposit = calculate(analysis, { ...inputs, depositManwon: inputs.depositManwon + 10000 });
assert.equal(higherDeposit.capitalDifference, baseline.capitalDifference);
assert.equal(higherDeposit.totalCashInvestment, baseline.totalCashInvestment + 10000);
assert(higherDeposit.paybackMonths >= baseline.paybackMonths);
const higherRent = calculate(analysis, { ...inputs, monthlyRentManwon: inputs.monthlyRentManwon + 1000 });
assert.equal(higherRent.monthlyOperatingProfit, baseline.monthlyOperatingProfit - 1000);
assert.equal(calculate(analysis, { ...inputs, monthlyPayrollManwon: 1000000 }).paybackMonths, null);
console.log('PASS: deposit comparability, investment, payback, rent sensitivity, loss scenario');
