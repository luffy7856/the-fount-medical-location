import type { LocationAnalysis } from "./location-types";
import type { Specialty } from "./specialties";

export type OpeningInputs = {
  floor: number;
  areaPyeong: number;
  depositManwon: number;
  monthlyRentManwon: number;
  openingBudgetManwon: number;
  monthlyPayrollManwon: number;
  monthlyMarketingManwon: number;
};

const SPECIALTY_FINANCE: Record<Specialty, { revenuePerPyeong: number; benchmarkCapitalPerPyeong: number; variableCostRate: number; otherFixedPerPyeong: number }> = {
  "내과": { revenuePerPyeong: 215, benchmarkCapitalPerPyeong: 780, variableCostRate: .16, otherFixedPerPyeong: 24 },
  "정형외과": { revenuePerPyeong: 290, benchmarkCapitalPerPyeong: 1250, variableCostRate: .2, otherFixedPerPyeong: 31 },
  "피부과": { revenuePerPyeong: 390, benchmarkCapitalPerPyeong: 1650, variableCostRate: .27, otherFixedPerPyeong: 38 },
  "성형외과": { revenuePerPyeong: 420, benchmarkCapitalPerPyeong: 1900, variableCostRate: .3, otherFixedPerPyeong: 42 },
  "소아청소년과": { revenuePerPyeong: 190, benchmarkCapitalPerPyeong: 720, variableCostRate: .15, otherFixedPerPyeong: 23 },
  "치과": { revenuePerPyeong: 330, benchmarkCapitalPerPyeong: 1800, variableCostRate: .24, otherFixedPerPyeong: 36 },
  "한의원": { revenuePerPyeong: 205, benchmarkCapitalPerPyeong: 680, variableCostRate: .18, otherFixedPerPyeong: 22 },
  "산부인과": { revenuePerPyeong: 250, benchmarkCapitalPerPyeong: 1300, variableCostRate: .2, otherFixedPerPyeong: 32 },
  "안과": { revenuePerPyeong: 315, benchmarkCapitalPerPyeong: 1750, variableCostRate: .23, otherFixedPerPyeong: 36 },
  "이비인후과": { revenuePerPyeong: 225, benchmarkCapitalPerPyeong: 860, variableCostRate: .16, otherFixedPerPyeong: 25 },
  "기타": { revenuePerPyeong: 230, benchmarkCapitalPerPyeong: 1000, variableCostRate: .2, otherFixedPerPyeong: 28 }
};

export const DEFAULT_OPENING_INPUTS: OpeningInputs = {
  floor: 3,
  areaPyeong: 50,
  depositManwon: 10000,
  monthlyRentManwon: 700,
  openingBudgetManwon: 50000,
  monthlyPayrollManwon: 2500,
  monthlyMarketingManwon: 500
};

export function calculateOpeningPlan(analysis: Pick<LocationAnalysis, "specialty" | "observedScore">, inputs: OpeningInputs) {
  const benchmark = SPECIALTY_FINANCE[analysis.specialty];
  const floorFactor = inputs.floor <= 0 ? .82 : inputs.floor === 1 ? 1.06 : inputs.floor === 2 ? 1 : inputs.floor === 3 ? .96 : .9;
  const locationFactor = .78 + Math.min(Math.max(analysis.observedScore, 45), 95) / 220;
  const expectedRevenue = Math.round(inputs.areaPyeong * benchmark.revenuePerPyeong * floorFactor * locationFactor);
  const variableCost = expectedRevenue * benchmark.variableCostRate;
  const otherFixed = inputs.areaPyeong * benchmark.otherFixedPerPyeong;
  const monthlyOperatingProfit = Math.round(expectedRevenue - variableCost - inputs.monthlyRentManwon - inputs.monthlyPayrollManwon - inputs.monthlyMarketingManwon - otherFixed);
  const totalCashInvestment = inputs.depositManwon + inputs.openingBudgetManwon;
  const benchmarkCapital = Math.round(inputs.areaPyeong * benchmark.benchmarkCapitalPerPyeong);
  const paybackMonths = monthlyOperatingProfit > 0 ? Math.ceil(totalCashInvestment / monthlyOperatingProfit) : null;

  return {
    expectedRevenue,
    revenueLow: Math.round(expectedRevenue * .85),
    revenueHigh: Math.round(expectedRevenue * 1.15),
    monthlyOperatingProfit,
    totalCashInvestment,
    benchmarkCapital,
    paybackMonths,
    rentRatio: expectedRevenue > 0 ? Math.round(inputs.monthlyRentManwon / expectedRevenue * 1000) / 10 : 0,
    // The area benchmark covers facilities/equipment, not the refundable deposit.
    capitalDifference: benchmarkCapital > 0 ? Math.round((inputs.openingBudgetManwon / benchmarkCapital - 1) * 100) : 0
  };
}
