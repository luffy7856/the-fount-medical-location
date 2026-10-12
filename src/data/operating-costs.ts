import type { LocationAnalysis } from './location-types';
import { normalizeOpeningInputs, type OpeningInputs } from './opening-plan';

type CostContext = Pick<LocationAnalysis, 'location'> & Partial<Pick<LocationAnalysis, 'rentMarket'>>;

export type RegionalOperatingCostBasis = {
  regionLabel: string;
  rentPerPyeongManwon: number;
  managementPerPyeongManwon: number;
  payrollPerStaffManwon: number;
  rentSource: string;
};

const rounded = (value: number) => Math.round(value * 10) / 10;

function regionOf(displayName: string) {
  if (/서울/.test(displayName)) return 'seoul';
  if (/경기|인천/.test(displayName)) return 'capital';
  return 'other';
}

export function regionalOperatingCostBasis(context: CostContext): RegionalOperatingCostBasis {
  const region = regionOf(context.location.displayName);
  const publishedRent = context.rentMarket?.status === 'available' &&
    typeof context.rentMarket.monthlyRentPerPyeongManwon === 'number' &&
    context.rentMarket.monthlyRentPerPyeongManwon > 0
      ? context.rentMarket.monthlyRentPerPyeongManwon
      : null;
  const fallback = region === 'seoul'
    ? { regionLabel: '서울', rent: 14, management: 2.2, payroll: 500 }
    : region === 'capital'
      ? { regionLabel: '경기·인천', rent: 10.5, management: 1.8, payroll: 470 }
      : { regionLabel: '기타 지역', rent: 8, management: 1.5, payroll: 450 };

  return {
    regionLabel: fallback.regionLabel,
    rentPerPyeongManwon: rounded(publishedRent ?? fallback.rent),
    managementPerPyeongManwon: fallback.management,
    payrollPerStaffManwon: fallback.payroll,
    rentSource: publishedRent
      ? `${context.rentMarket?.source || '지역 상가 임대료 자료'} · ${context.rentMarket?.spatialUnit || '지역 참고값'}`
      : `${fallback.regionLabel} 기본 참고값`,
  };
}

export function applyAutomaticOperatingCosts(context: CostContext, raw: OpeningInputs): OpeningInputs {
  const inputs = normalizeOpeningInputs(raw);
  if (inputs.autoOperatingCosts < .5) return inputs;
  const basis = regionalOperatingCostBasis(context);
  return {
    ...inputs,
    monthlyRentManwon: Math.round(inputs.areaPyeong * basis.rentPerPyeongManwon),
    monthlyManagementManwon: Math.round(inputs.areaPyeong * basis.managementPerPyeongManwon),
    monthlyPayrollManwon: Math.round(inputs.staffCount * basis.payrollPerStaffManwon),
  };
}
