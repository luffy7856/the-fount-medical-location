import type { LocationAnalysis } from './location-types';

type MarketProfile = {
  workerReach: number;
  livingReach: number;
  clusterAffinity: number;
  competitionSensitivity: number;
};

const DEFAULT_PROFILE: MarketProfile = {
  workerReach: .04,
  livingReach: .025,
  clusterAffinity: .12,
  competitionSensitivity: 1,
};

const MARKET_PROFILES: Record<string, MarketProfile> = {
  피부과: { workerReach: .12, livingReach: .08, clusterAffinity: .55, competitionSensitivity: .55 },
  성형외과: { workerReach: .14, livingReach: .09, clusterAffinity: .65, competitionSensitivity: .50 },
  치과: { workerReach: .08, livingReach: .05, clusterAffinity: .35, competitionSensitivity: .70 },
  안과: { workerReach: .06, livingReach: .04, clusterAffinity: .25, competitionSensitivity: .78 },
  산부인과: { workerReach: .05, livingReach: .035, clusterAffinity: .20, competitionSensitivity: .82 },
  정형외과: { workerReach: .04, livingReach: .03, clusterAffinity: .16, competitionSensitivity: .88 },
  비뇨기과: { workerReach: .05, livingReach: .035, clusterAffinity: .18, competitionSensitivity: .85 },
  한의원: { workerReach: .04, livingReach: .03, clusterAffinity: .15, competitionSensitivity: .90 },
  내과: { workerReach: .035, livingReach: .025, clusterAffinity: .08, competitionSensitivity: 1.05 },
  이비인후과: { workerReach: .03, livingReach: .02, clusterAffinity: .07, competitionSensitivity: 1.05 },
  소아청소년과: { workerReach: .015, livingReach: .015, clusterAffinity: .04, competitionSensitivity: 1.10 },
};

const metricValue = (analysis: LocationAnalysis, label: string, fallback: number) =>
  analysis.metrics.find(metric => metric.label === label)?.value ?? fallback;

/**
 * Separates local patients, outside inflow and medical-district attraction.
 * Resident, worker and living-population datasets overlap, so worker/living
 * contributions are never added together; the stronger observed signal wins.
 */
export function deriveMedicalMarket(analysis: LocationAnalysis, localTargetPopulation: number) {
  const profile = MARKET_PROFILES[analysis.specialty] ?? DEFAULT_PROFILE;
  const workers = analysis.demographics?.workerPopulation ?? 0;
  const living = analysis.livingPopulation?.status === 'available'
    ? analysis.livingPopulation.total ?? 0
    : 0;
  const outsidePopulation = Math.round(Math.max(
    workers * profile.workerReach,
    living * profile.livingReach,
  ));
  const competitorCount = Math.max(0, analysis.counts.matchingSpecialty);
  // A destination effect starts gradually once a specialty is visibly clustered.
  // Density is unbounded here but the final demand multiplier is capped below.
  const clusterDensity = Math.max(0, Math.log1p(competitorCount / 10));
  const access = metricValue(analysis, '접근성', 50) / 100;
  const consumer = metricValue(analysis, '소비력', 50) / 100;
  const placeQuality = .5 + access * .35 + consumer * .15;
  const clusterBonus = profile.clusterAffinity * clusterDensity * placeQuality;
  const clusterDemandMultiplier = 1 + Math.min(2, Math.max(0, clusterBonus));

  return {
    localTargetPopulation,
    outsidePopulation,
    reachablePopulation: localTargetPopulation + outsidePopulation,
    clusterDensity,
    clusterDemandMultiplier,
    competitionSensitivity: profile.competitionSensitivity,
    competitorCount,
  };
}
