import type { LiveMetric } from './location-types';

/** Experimental opening score. Weights are provisional until real clinic outcomes calibrate them. */
export const OPENING_SCORE_WEIGHTS = {
  viability: 40,
  '잠재환자 수요': 20,
  '경쟁환경': 15,
  '소비력': 8,
  '접근성': 7,
  '비용효율': 5,
  '성장성': 5,
} as const;

/** Use available headcounts to prevent a nearly empty area receiving a high location grade. */
export function populationScoreCap(demographics?: { residentPopulation: number; workerPopulation: number },
  livingPopulation?: { status: string; total?: number }) {
  const observed = [
    demographics ? demographics.residentPopulation + demographics.workerPopulation * .55 : null,
    livingPopulation?.status === 'available' && livingPopulation.total !== undefined ? livingPopulation.total : null,
  ].filter((value): value is number => value !== null && Number.isFinite(value));
  if (!observed.length) return 100; // Absence of headcounts is handled by the existing score-readiness check.
  const availablePopulation = Math.max(...observed);
  return availablePopulation < 1000 ? 40 : availablePopulation < 3000 ? 60 : 100;
}

export function openingScoreV2(metrics: LiveMetric[], viability: {
  score: number | null;
  coverage: number | null;
  visits: number;
  bepVisits: number | null;
}, targetPopulation: number) {
  // No observed patient base or no break-even estimate: don't invent a score.
  if (!Number.isFinite(targetPopulation) || targetPopulation <= 0 || viability.score === null ||
    viability.coverage === null || viability.bepVisits === null || !Number.isFinite(viability.visits)) return null;
  const factors = metrics.filter((item): item is LiveMetric & { value: number } => item.value !== null &&
    Object.prototype.hasOwnProperty.call(OPENING_SCORE_WEIGHTS, item.label));
  if (!factors.some(item => item.label === '잠재환자 수요') || !factors.some(item => item.label === '경쟁환경')) return null;
  const connectedWeight = factors.reduce((sum, item) => sum + OPENING_SCORE_WEIGHTS[item.label as keyof typeof OPENING_SCORE_WEIGHTS], 0);
  // Demand, competition and at least one other regional factor must be connected.
  if (connectedWeight < 42) return null;
  const weighted = (viability.score * OPENING_SCORE_WEIGHTS.viability + factors.reduce((sum, item) =>
    sum + item.value * OPENING_SCORE_WEIGHTS[item.label as keyof typeof OPENING_SCORE_WEIGHTS], 0)) /
    (OPENING_SCORE_WEIGHTS.viability + connectedWeight);
  // A small patient base or visits far below break-even must not earn a high grade from affluent surroundings.
  const demandCap = targetPopulation < 500 ? 40 : targetPopulation < 1500 ? 60 : 100;
  const operatingCap = viability.coverage < .6 ? 40 : viability.coverage < .8 ? 60 : viability.coverage < 1 ? 75 : 100;
  return Math.round(Math.max(0, Math.min(100, weighted, demandCap, operatingCap)));
}
