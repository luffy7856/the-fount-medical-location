import type { LocationAnalysis, LivePlace } from './location-types';
import { matchesSpecialty } from './specialties';

export const CLINICAL_MODEL_VERSION = 'seoul-gyeonggi-2026-09-16-experimental';
export function serviceRegion(analysis: LocationAnalysis): 'seoul' | 'gyeonggi' | 'outside' {
  const address = analysis.location.displayName;
  if (/(서울|Seoul)/i.test(address)) return 'seoul';
  if (/(경기도|경기\s|Gyeonggi)/i.test(address)) return 'gyeonggi';
  return 'outside';
}

/** Weights of the location score shown to users (sum 100). Missing factors are held at a neutral 50. */
export const CLINICAL_SCORE_WEIGHTS: Record<string, number> = { '잠재환자 수요': 35, '경쟁환경': 25, '소비력': 10, '접근성': 15, '비용효율': 10, '성장성': 5 };

/** No made-up age percentages. A recorded zero must remain zero. */
export function clinicalDemand(analysis: LocationAnalysis) {
  const p = analysis.regionalProfile;
  const residents = analysis.demographics?.residentPopulation;
  if (!p || residents === undefined || !Number.isFinite(residents)) return null;
  const ages = analysis.specialty === '소아청소년과' ? [p.childPopulation] :
    analysis.specialty === '치과'
      ? [p.childPopulation, p.youngAdultPopulation, p.middleAgePopulation, p.seniorPopulation] :
    ['내과','정형외과','비뇨기과','안과','이비인후과','한의원'].includes(analysis.specialty)
      ? [p.middleAgePopulation, p.seniorPopulation] : [p.youngAdultPopulation, p.middleAgePopulation];
  if (ages.some(value => value === undefined || !Number.isFinite(value) || value < 0)) return null;
  const target = Math.min(residents, ages.reduce<number>((sum, value) => sum + (value ?? 0), 0));
  // A small-radius headcount can constrain the administrative-area estimate, never inflate it.
  // Administrative residents and hourly grid population are not interchangeable.
  const localCeiling = residents;
  return { target: Math.min(target, localCeiling), residents, localCeiling };
}

/** Total physicians are a conservative size proxy, not matching-specialty specialists. */
export function competitorStrength(place: LivePlace) {
  const count = place.medicalCapacity?.doctorCount;
  if (count === undefined || !Number.isFinite(count) || count < 1) return 1;
  // Do not treat every doctor in a general hospital as a direct competitor.
  if (!place.medicalCapacity?.institutionType?.includes('의원')) return 1;
  return Math.sqrt(Math.min(count, 16));
}

export function clinicalCompetitors(analysis: LocationAnalysis) {
  return analysis.places.filter(place => place.kind === 'hospital' &&
    matchesSpecialty(place.name, place.specialty, analysis.specialty));
}

/** Recompute from evidence so saved analyses and timeline updates use the same rules. */
export function refineClinicalAnalysis(analysis: LocationAnalysis): LocationAnalysis {
  const demand = clinicalDemand(analysis);
  const rivals = clinicalCompetitors(analysis);
  const effectiveCount = Math.max(analysis.counts.matchingSpecialty, rivals.length) +
    rivals.reduce((sum, place) => sum + competitorStrength(place) - 1, 0);
  const demandScore = demand === null ? null : Math.round(100 * demand.target / (demand.target + 5000));
  const competitionUpper = demand === null || analysis.provider !== 'kakao' ? null :
    Math.round(Math.min(demandScore!, 100 * demand.target / (demand.target + 1500 * (effectiveCount + 1))));
  // A truncated Kakao result is still useful evidence: it means at least the displayed
  // number of same-specialty clinics exists. Treat that lower bound conservatively
  // instead of hiding both user-facing scores in dense medical districts.
  const competitionScore = competitionUpper === null ? null : analysis.countLimits?.matchingSpecialty
    ? Math.min(competitionUpper, 15)
    : competitionUpper;
  const metrics = analysis.metrics.map(metric => metric.label === '잠재환자 수요'
    ? { ...metric, value: demandScore, note: '선택 진료과의 주요 연령층 규모' }
    : metric.label === '경쟁환경' ? { ...metric, value: competitionScore,
      note: analysis.countLimits?.matchingSpecialty
        ? '확인된 최소 병원 수를 기준으로 보수적으로 계산'
        : '환자층 규모와 같은 과 병원의 수·확인된 의원 규모' } : metric);
  const weights = CLINICAL_SCORE_WEIGHTS;
  const present = metrics.filter(metric => metric.value !== null && Number.isFinite(metric.value));
  const totalWeight = present.reduce((sum, metric) => sum + (weights[metric.label] ?? 0), 0);
  const hasCoreEvidence = demand !== null && competitionScore !== null;
  const ready = serviceRegion(analysis) !== 'outside' && hasCoreEvidence && totalWeight >= 60;
  const cap = demand === null ? 0 : demand.target < 500 ? 35 : demand.target < 1500 ? 55 : 100;
  const known = present.reduce((sum, metric) => sum + Math.max(0, Math.min(100, metric.value!)) * (weights[metric.label] ?? 0), 0);
  // Unknown factors stay unknown. Endpoints are mathematical bounds, not probability intervals.
  const unknownUpper = Object.entries(weights).reduce((sum, [label, weight]) => {
    if (present.some(metric => metric.label === label)) return sum;
    return sum + weight * (label === '경쟁환경' ? competitionUpper ?? 100 : 100);
  }, 0);
  const lower = Math.round(Math.min(cap, known / 100));
  const upper = Math.round(Math.min(cap, (known + unknownUpper) / 100));
  const scoreRange = ready ? { lower, upper, partial: totalWeight < 100, coverage: totalWeight } : undefined;
  // The user sees one comparison score. Missing secondary factors are held at a neutral
  // 50 rather than being treated as either zero or perfect, while demand and competition
  // remain mandatory. The internal bounds are kept only for audit and model review.
  const neutralUnknown = Math.max(0, 100 - totalWeight) * 50;
  const observedScore = ready ? Math.round(Math.min(cap, (known + neutralUnknown) / 100)) : 0;
  return { ...analysis, metrics, observedScore, scoreRange,
    grade: !ready ? '—' : observedScore >= 85 ? 'A' : observedScore >= 75 ? 'B+' : observedScore >= 65 ? 'B' : 'C' };
}

export function clinicalScoreLabel(analysis: LocationAnalysis) {
  return analysis.scoreRange ? String(analysis.observedScore) : '—';
}
