import type { LocationAnalysis } from './location-types';
import { DEFAULT_OPENING_INPUTS, type OpeningInputs } from './opening-plan';

type RevenueContext = Pick<LocationAnalysis, 'specialty'> & Partial<Pick<LocationAnalysis, 'consumerPower'>>;

type SpecialtyRevenueProfile = {
  insuredPerVisitWon: number;
  nonCoveredExpectedWon: number;
  reference: string;
};

export type VisitRevenueEstimate = {
  specialty: string;
  insuredPerVisitWon: number;
  nonCoveredExpectedWon: number;
  regionalMultiplier: number;
  totalPerVisitWon: number;
  reference: string;
};

/*
 * Insured values are national per-visit anchors calculated from HIRA visit days
 * and medical expenses. The non-covered amount is an effective visit-average,
 * not a procedure price: it spreads an expected specialty treatment mix across
 * every visit. It stays explicit so later clinic outcomes can replace it without
 * changing the profitability engine.
 */
const SPECIALTY_REVENUE: Record<string, SpecialtyRevenueProfile> = {
  '내과': { insuredPerVisitWon: 40700, nonCoveredExpectedWon: 5000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '정형외과': { insuredPerVisitWon: 44900, nonCoveredExpectedWon: 25000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '피부과': { insuredPerVisitWon: 29700, nonCoveredExpectedWon: 100000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '성형외과': { insuredPerVisitWon: 35700, nonCoveredExpectedWon: 230000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '소아청소년과': { insuredPerVisitWon: 19600, nonCoveredExpectedWon: 2000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '치과': { insuredPerVisitWon: 103900, nonCoveredExpectedWon: 90000, reference: 'HIRA 치과의원 진료비 통계·비급여 공개자료' },
  '한의원': { insuredPerVisitWon: 45000, nonCoveredExpectedWon: 10000, reference: 'HIRA 한의원 진료비 통계' },
  '산부인과': { insuredPerVisitWon: 89100, nonCoveredExpectedWon: 25000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '안과': { insuredPerVisitWon: 67600, nonCoveredExpectedWon: 22000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '이비인후과': { insuredPerVisitWon: 29400, nonCoveredExpectedWon: 5000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '비뇨기과': { insuredPerVisitWon: 56500, nonCoveredExpectedWon: 18000, reference: 'HIRA 의원 표시과목별 진료일수·진료비' },
  '검진센터': { insuredPerVisitWon: 70000, nonCoveredExpectedWon: 85000, reference: 'HIRA 진료비 통계·검진 혼합진료 시험 기준' },
  '기타': { insuredPerVisitWon: 40000, nonCoveredExpectedWon: 10000, reference: 'HIRA 의원 전체 진료비 시험 기준' },
};

const roundHundred = (value: number) => Math.round(value / 100) * 100;

export function estimateVisitRevenue(context: RevenueContext): VisitRevenueEstimate {
  const profile = SPECIALTY_REVENUE[context.specialty] ?? SPECIALTY_REVENUE['기타'];
  const percentile = context.consumerPower?.status === 'available'
    ? context.consumerPower.medicalPercentile ?? context.consumerPower.percentile ?? 50
    : 50;
  // Regional consumption adjusts only the non-covered mix and is deliberately
  // limited to +/-10%; insured fees are not changed by local purchasing power.
  const regionalMultiplier = Math.max(.9, Math.min(1.1, .9 + percentile / 500));
  const adjustedNonCovered = roundHundred(profile.nonCoveredExpectedWon * regionalMultiplier);
  return {
    specialty: context.specialty,
    insuredPerVisitWon: profile.insuredPerVisitWon,
    nonCoveredExpectedWon: adjustedNonCovered,
    regionalMultiplier,
    totalPerVisitWon: roundHundred(profile.insuredPerVisitWon + adjustedNonCovered),
    reference: profile.reference,
  };
}

export function openingInputsWithVisitRevenue(context: RevenueContext, inputs: OpeningInputs) {
  const estimate = estimateVisitRevenue(context);
  const automatic = Math.abs(inputs.revenuePerPatient - DEFAULT_OPENING_INPUTS.revenuePerPatient) < .0001;
  return {
    automatic,
    estimate,
    inputs: automatic ? { ...inputs, revenuePerPatient: estimate.totalPerVisitWon / 10000 } : inputs,
  };
}

