const fs=require('node:fs'),assert=require('node:assert/strict'),Module=require('node:module'),ts=require('typescript');
const file=require('node:path').join(__dirname,'../src/data/opening-plan.ts');
const compiled=new Module(file);compiled._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {calculateOpeningPlan:calc,DEFAULT_OPENING_INPUTS:defaults}=compiled.exports;
// Preserve the original loss-making fixture: negative outcomes must remain visible.
const d={...defaults,revenuePerPatient:5};
assert.equal(defaults.revenuePerPatient,8);
assert(calc({specialty:'내과',observedScore:0},defaults).monthlyCash>0);
const a={specialty:'내과',observedScore:82},r=calc(a,d);
assert.equal(r.expectedRevenue,5400);assert.equal(r.monthlyOperatingProfit,220);assert(Math.abs(r.monthlyCash-(-894.5833333333334))<1e-8);
assert.equal(r.breakEvenPatients,43);assert(r.cashBreakEvenPatients>=54);
assert.equal(r.months[0].revenue,2700);assert.equal(r.months[5].revenue,5400);
assert.equal(r.months[0].cash,-3065);assert.equal(r.months[1].interest,29500*.05/12);
assert.equal(r.months[11].cumulativeCash,r.months.reduce((s,m)=>s+m.cash,0));
assert(calc(a,d,.8).monthlyCash<r.monthlyCash);assert(calc(a,d,1.2).monthlyCash>r.monthlyCash);
assert.equal(calc({...a,observedScore:0},{...d,floor:1}).expectedRevenue,r.expectedRevenue);
assert.equal(calc(a,{...d,depositManwon:20000}).monthlyOperatingProfit,r.monthlyOperatingProfit);
assert.equal(calc(a,{...d,variablePercent:100}).breakEvenPatients,null);
assert.equal(calc(a,{...d,revenuePerPatient:0}).breakEvenPatients,null);
const noLoan=calc(a,{...d,loanAmount:0});assert.equal(noLoan.months[0].interest,0);assert.equal(noLoan.months[0].principal,0);
assert.equal(calc(a,{...d,dailyPatients:0}).paybackMonths,null);
assert.equal(calc(a,{...d,rampMonths:1}).months[0].revenue,r.expectedRevenue);
assert.equal(calc(a,{...d,loanAmount:999999}).loan,r.totalCashInvestment);
for(const key of Object.keys(d))assert(Number.isFinite(calc(a,{...d,[key]:NaN}).expectedRevenue));
const profitable=calc(a,{...d,dailyPatients:100,loanAmount:0,rampMonths:1,ownerWithdrawal:0});assert(profitable.paybackMonths>0&&profitable.paybackMonths<120);
console.log('PASS: patient-based revenue, break-even, ramp-up, loan amortization, cumulative cash, scenarios, payback, invalid inputs and no location/floor multiplier');
const {estimatedIncomeTax:tax,calculateFiveYearPlan:five}=compiled.exports;
for(const [base,expected] of [[0,0],[1400,84],[5000,624],[8800,1536],[15000,3706],[30000,9406],[50000,17406],[100000,38406],[110000,42906]])assert(Math.abs(tax(base)-expected)<.00001);
assert.equal(tax(-1000),0);
const fiveBase=five({...d,dailyPatients:65});
assert.equal(fiveBase.length,5);
assert(Math.abs(fiveBase[1].revenue-65*5*24*12*1.05)<.00001);
assert(Math.abs(fiveBase[1].cashCosts-(fiveBase[1].revenue*.2+4100*12*1.03))<.00001);
assert.equal(fiveBase[2].localTax,fiveBase[2].nationalTax*.1);
assert.equal(five({...d,dailyPatients:65,taxReserve:1000})[1].afterTaxCash,fiveBase[1].afterTaxCash);
const depreciated=five({...d,dailyPatients:65,annualDepreciation:1000});
assert.equal(fiveBase[1].operatingProfit-depreciated[1].operatingProfit,1000);
assert(depreciated[1].totalTax<fiveBase[1].totalTax);
assert(depreciated[1].afterTaxCash>fiveBase[1].afterTaxCash);
assert.equal(five({...d,dailyPatients:0})[1].totalTax,0);
console.log('PASS: all tax brackets, compound growth, cost growth, depreciation, losses, tax reserve not double counted');
const stable={...d,dailyPatients:65,annualRevenueGrowth:0,annualFixedGrowth:0};
const revised=calc(a,stable),annual=five(stable);
assert(revised.paybackMonths>60); // Previously misleading 38-month, pre-tax recovery.
assert(Math.abs(revised.months[11].cumulativeCash-annual[0].afterTaxCash)<1e-7);
assert.equal(calc(a,{...stable,taxReserve:1000}).paybackMonths,revised.paybackMonths);
const short=calc(a,{...stable,loanMonths:3});
assert.equal(short.monthlyCash,short.months[5].cash);
assert(short.monthlyCash>0);assert.equal(short.months[5].principal,0);
const financed=calc(a,{...d,loanAmount:60000});
assert.equal(financed.equity,0);assert(financed.reserve>0);
for(const rampMonths of [1,6,24,36])for(const loanMonths of [1,3,60]){
 const input={...stable,rampMonths,loanMonths};const plan=calc(a,input),yr=five(input);
 assert(Math.abs(plan.months[11].cumulativeCash-yr[0].afterTaxCash)<1e-7);
 for(const row of yr)assert(Math.abs(row.months.reduce((s,m)=>s+m.cash,0)-row.afterTaxCash)<1e-7);
 const required=plan.cashBreakEvenPatients;
 if(required!==null){assert(calc(a,{...input,dailyPatients:required}).monthlyCash>=-1e-7);if(required>0)assert(calc(a,{...input,dailyPatients:required-1}).monthlyCash<0);}
}
console.log('PASS: tax-inclusive recovery, annual/monthly reconciliation, target-month debt, all-debt reserve and break-even minimality');
