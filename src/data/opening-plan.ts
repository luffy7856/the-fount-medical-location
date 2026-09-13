import type { LocationAnalysis } from './location-types';
export const DEFAULT_OPENING_INPUTS = {
  floor:3, areaPyeong:50, depositManwon:10000, monthlyRentManwon:700,
  openingBudgetManwon:50000, monthlyPayrollManwon:2500, monthlyMarketingManwon:500,
  dailyPatients:45, revenuePerPatient:8, clinicDays:24, variablePercent:20,
  monthlyOtherCost:400, loanAmount:30000, annualInterest:5, loanMonths:60,
  ownerWithdrawal:500, taxReserve:0, initialPercent:50, rampMonths:6,
  annualRevenueGrowth:5, annualFixedGrowth:3, annualDepreciation:0, annualIncomeDeduction:150,
};
export type OpeningInputs = typeof DEFAULT_OPENING_INPUTS;
export const INPUT_LIMITS: Record<keyof OpeningInputs,[number,number]> = {
  floor:[-5,200],areaPyeong:[1,5000],depositManwon:[0,10000000],monthlyRentManwon:[0,1000000],
  openingBudgetManwon:[0,10000000],monthlyPayrollManwon:[0,1000000],monthlyMarketingManwon:[0,1000000],
  dailyPatients:[0,5000],revenuePerPatient:[0,10000],clinicDays:[1,31],variablePercent:[0,100],
  monthlyOtherCost:[0,1000000],loanAmount:[0,10000000],annualInterest:[0,100],loanMonths:[1,600],
  ownerWithdrawal:[0,1000000],taxReserve:[0,1000000],initialPercent:[0,100],rampMonths:[1,36],
  annualRevenueGrowth:[-50,100],annualFixedGrowth:[-50,100],annualDepreciation:[0,10000000],annualIncomeDeduction:[0,10000000],
};
export function normalizeOpeningInputs(raw:Partial<OpeningInputs>):OpeningInputs {
  const result={...DEFAULT_OPENING_INPUTS};
  for(const key of Object.keys(result) as (keyof OpeningInputs)[]) {
    const value=raw[key];const [min,max]=INPUT_LIMITS[key];
    result[key]=typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(min,value)):result[key];
  }
  result.loanMonths=Math.round(result.loanMonths);result.rampMonths=Math.round(result.rampMonths);
  return result;
}
// User assumptions only: no location-score or floor multiplier predicts revenue.
export function calculateOpeningPlan(_analysis:Pick<LocationAnalysis,'specialty'|'observedScore'>,raw:OpeningInputs,patientFactor=1) {
  const i=normalizeOpeningInputs(raw);
  const years=calculateAnnualPlan(i,patientFactor,10);
  const unlevered=calculateAnnualPlan({...i,loanAmount:0,ownerWithdrawal:0},patientFactor,10);
  const schedule=years.flatMap(y=>y.months);
  const targetMonth=schedule[i.rampMonths-1];
  const expectedRevenue=targetMonth.revenue;
  const margin=1-i.variablePercent/100;
  const fixedCost=targetMonth.fixedCost;
  const totalCashInvestment=i.depositManwon+i.openingBudgetManwon;
  const loan=Math.min(i.loanAmount,totalCashInvestment),equity=totalCashInvestment-loan;
  let cumulativeCash=0,cumulativeOperating=0,lowestCash=0;
  let paybackMonths:number|null=equity===0?0:null;
  let totalPaybackMonths:number|null=totalCashInvestment===0?0:null;
  const months=Array.from({length:120},(_,index)=>{
    const month=index+1;
    const {revenue,operating,principal,interest,cash,tax}=schedule[index];
    cumulativeCash+=cash;cumulativeOperating+=unlevered[Math.floor(index/12)].months[index%12].cash;
    if(month<=12)lowestCash=Math.min(lowestCash,cumulativeCash);
    if(paybackMonths===null&&cumulativeCash>=equity)paybackMonths=month;
    if(totalPaybackMonths===null&&cumulativeOperating>=totalCashInvestment)totalPaybackMonths=month;
    return {month,revenue,operating,principal,interest,tax,cash,cumulativeCash};
  });
  const contribution=i.revenuePerPatient*i.clinicDays*margin*Math.pow(1+i.annualRevenueGrowth/100,Math.floor((i.rampMonths-1)/12));
  // Solve tax-inclusive break-even at the target month, with annual tax recalculated.
  const cashAt=(patients:number)=>calculateAnnualPlan({...i,dailyPatients:patients},1,Math.ceil(i.rampMonths/12)).at(-1)!.months[(i.rampMonths-1)%12].cash;
  let cashBreakEvenPatients:number|null=null;
  if(contribution>0&&cashAt(INPUT_LIMITS.dailyPatients[1])>=0){
    let lo=0,hi=INPUT_LIMITS.dailyPatients[1];
    while(lo<hi){const mid=Math.floor((lo+hi)/2);if(cashAt(mid)>=-1e-8)hi=mid;else lo=mid+1;}
    cashBreakEvenPatients=lo;
  }
  return {
    expectedRevenue,revenueLow:expectedRevenue*.8,revenueHigh:expectedRevenue*1.2,
    monthlyOperatingProfit:expectedRevenue*margin-fixedCost,
    monthlyCash:targetMonth.cash,targetMonth:i.rampMonths,
    breakEvenPatients:contribution>0?Math.ceil(fixedCost/contribution):null,
    cashBreakEvenPatients,
    totalCashInvestment,equity,loan,paybackMonths,totalPaybackMonths,reserve:Math.max(0,-lowestCash),
    months:months.slice(0,12),fixedCost,
    rentRatio:expectedRevenue>0?Math.round(i.monthlyRentManwon/expectedRevenue*1000)/10:0,
  };
}
// General progressive rates (2023 onward), checked 2026-09-13. Unit: KRW 10,000.
// Calculated tax before tax credits, reductions and prepayments.
export function estimatedIncomeTax(base:number) {
  const brackets=[[1400,.06,0],[5000,.15,126],[8800,.24,576],[15000,.35,1544],[30000,.38,1994],[50000,.40,2594],[100000,.42,3594],[Infinity,.45,6594]];
  const taxable=Number.isFinite(base)?Math.max(0,base):0;
  const [,rate,deduction]=brackets.find(([limit])=>taxable<=limit)!;
  return Math.max(0,taxable*rate-deduction);
}
function calculateAnnualPlan(raw:OpeningInputs,patientFactor=1,horizon=5) {
  const i=normalizeOpeningInputs(raw),loan=Math.min(i.loanAmount,i.depositManwon+i.openingBudgetManwon);
  const target=i.dailyPatients*patientFactor*i.revenuePerPatient*i.clinicDays;
  const fixed=i.monthlyRentManwon+i.monthlyPayrollManwon+i.monthlyMarketingManwon+i.monthlyOtherCost;
  return Array.from({length:horizon},(_,year)=>{
    let revenue=0,cashCosts=0,interest=0,principal=0;
    const monthly=[];
    for(let offset=0;offset<12;offset++) {
      const month=year*12+offset;
      const ramp=i.rampMonths===1?1:i.initialPercent/100+(1-i.initialPercent/100)*Math.min(month/(i.rampMonths-1),1);
      const sales=target*ramp*Math.pow(1+i.annualRevenueGrowth/100,year);
      const fixedCost=fixed*Math.pow(1+i.annualFixedGrowth/100,year);
      const cost=sales*i.variablePercent/100+fixedCost;
      const monthlyInterest=Math.max(0,loan-month*loan/i.loanMonths)*i.annualInterest/1200;
      const monthlyPrincipal=month<i.loanMonths?loan/i.loanMonths:0;
      revenue+=sales;cashCosts+=cost;interest+=monthlyInterest;principal+=monthlyPrincipal;
      monthly.push({revenue:sales,fixedCost,operating:sales-cost,interest:monthlyInterest,principal:monthlyPrincipal});
    }
    const operatingProfit=revenue-cashCosts-i.annualDepreciation;
    const businessIncome=operatingProfit-interest;
    const taxable=Math.max(0,businessIncome-i.annualIncomeDeduction);
    const nationalTax=estimatedIncomeTax(taxable),localTax=nationalTax*.1,totalTax=nationalTax+localTax;
    // Replace reserve transfers with estimated tax; do not deduct both.
    const afterTaxCash=revenue-cashCosts-interest-principal-i.ownerWithdrawal*12-totalTax;
    const months=monthly.map(m=>({...m,tax:totalTax/12,cash:m.operating-m.interest-m.principal-i.ownerWithdrawal-totalTax/12}));
    return {year:year+1,revenue,cashCosts,operatingProfit,interest,principal,businessIncome,taxable,nationalTax,localTax,totalTax,afterTaxCash,months};
  });
}
export function calculateFiveYearPlan(raw:OpeningInputs,patientFactor=1) {
  return calculateAnnualPlan(raw,patientFactor,5);
}
