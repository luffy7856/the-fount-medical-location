/** Experimental scenario engine. Scores are not calibrated success probabilities. */
export type ViabilityAssumptions = {
  targetPopulation: number; monthlyUtilization: number; retention: number; inflowVisits: number;
  catchmentFactor: number; entrantAttraction: number; outsideAttraction: number;
  clusterDemandMultiplier: number; competitionSensitivity: number;
  revenuePerVisitWon: number; fixedCostWon: number; variableRate: number;
  monthlyCapacity: number; uncertainty: number; riskMultiplier: number; futureDemandFactor: number;
  startupCapitalWon: number; monthlyRentWon: number; monthlyDebtPrincipalWon: number;
};
export type CompetitorInput = { id: string; name: string; travelMinutes: number; attraction: number; evidence: 'assumption' | 'observed' };
export type ViabilityModel = { version: string; specialty: string; status: 'experimental'; decay: Array<{ minutes: number; factor: number }>; defaults: ViabilityAssumptions };
export const VIABILITY_DEFAULTS: ViabilityAssumptions = {
  targetPopulation: 0, monthlyUtilization: .12, retention: .7, inflowVisits: 0,
  catchmentFactor: .75, entrantAttraction: 1, outsideAttraction: 1,
  clusterDemandMultiplier: 1, competitionSensitivity: 1,
  revenuePerVisitWon: 80000, fixedCostWon: 41000000, variableRate: .2,
  monthlyCapacity: 1080, uncertainty: .3, riskMultiplier: 1, futureDemandFactor: 1,
  startupCapitalWon: 0, monthlyRentWon: 0, monthlyDebtPrincipalWon: 0,
};
const finite = (n: number, lo: number, hi: number) => {
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error('사업성 가정의 입력 범위를 확인해주세요.');
  return n;
};
export function validateAssumptions(a: ViabilityAssumptions) {
  for (const k of ['targetPopulation','inflowVisits','fixedCostWon','monthlyCapacity','startupCapitalWon','monthlyRentWon','monthlyDebtPrincipalWon'] as const) finite(a[k],0,1e10);
  for (const k of ['monthlyUtilization','retention','catchmentFactor','variableRate','uncertainty','riskMultiplier'] as const) finite(a[k],0,1);
  finite(a.revenuePerVisitWon,0,1e8); finite(a.entrantAttraction,.01,100); finite(a.outsideAttraction,.01,100);
  finite(a.futureDemandFactor,0,5);
  finite(a.clusterDemandMultiplier,.5,3); finite(a.competitionSensitivity,.25,1.5);
  return a;
}
export function distanceDecay(minutes: number, curve: ViabilityModel['decay']) {
  finite(minutes,0,10000);
  validateDecay(curve);
  return curve.find(b=>minutes <= b.minutes)?.factor ?? 0;
}
export function validateDecay(curve: ViabilityModel['decay']) {
  if (!Array.isArray(curve) || !curve.length || curve.length>50) throw new Error('거리감쇠 설정을 확인해주세요.');
  let previousMinutes=-1, previousFactor=1;
  for (const band of curve) {
    finite(band.minutes,0,10000); finite(band.factor,0,1);
    if (band.minutes<=previousMinutes || band.factor>previousFactor) throw new Error('이동시간은 오름차순, 거리 보정은 내림차순으로 설정해주세요.');
    previousMinutes=band.minutes; previousFactor=band.factor;
  }
  return curve;
}
export function validateModel(model: ViabilityModel) {
  if (!model || typeof model.version!=='string' || !model.version.trim() || model.version.length>120 || typeof model.specialty!=='string' || !model.specialty.trim() || model.status!=='experimental') throw new Error('모델 버전과 진료과를 확인해주세요.');
  validateDecay(model.decay); validateAssumptions(model.defaults);
  return model;
}
export function viabilityGate(coverage: number) {
  return coverage < .6 ? 40 : coverage < .8 ? 60 : coverage < 1 ? 75 : coverage < 1.2 ? 90 : 100;
}
function scoreByBands(value: number, bands: Array<[number, number]>) {
  if (!Number.isFinite(value)) return bands.at(-1)![1];
  if (value <= bands[0][0]) return bands[0][1];
  for (let index = 1; index < bands.length; index += 1) {
    const [rightValue, rightScore] = bands[index];
    const [leftValue, leftScore] = bands[index - 1];
    if (value <= rightValue) {
      const progress = (value - leftValue) / (rightValue - leftValue);
      return leftScore + (rightScore - leftScore) * progress;
    }
  }
  return bands.at(-1)![1];
}
export function calculateViability(raw: ViabilityAssumptions, competitors: CompetitorInput[], model: ViabilityModel) {
  validateModel(model);
  if (competitors.length>5000 || new Set(competitors.map(c=>c.id)).size!==competitors.length) throw new Error('중복 경쟁병원 또는 분석 한도를 확인해주세요.');
  // Defaults keep older saved scenarios readable when the score model gains a new input.
  const a = validateAssumptions({ ...VIABILITY_DEFAULTS, ...raw });
  const powers = competitors.map(c=>({...c,power:finite(c.attraction,.01,100)*distanceDecay(c.travelMinutes,model.decay)}));
  const rawCompetitorPower = powers.reduce((sum, competitor) => sum + competitor.power, 0);
  // Patients compare a limited practical choice set. Once a medical district is
  // established, every additional provider must not divide the market linearly.
  // Specialty sensitivity keeps local-care specialties more competition-heavy.
  const effectiveCompetitorPower = Math.log1p(rawCompetitorPower) * (1 + a.competitionSensitivity);
  const denominator = a.entrantAttraction + a.outsideAttraction + effectiveCompetitorPower;
  const share = a.entrantAttraction / denominator;
  // Competing clinics absorb demand once via choice shares, not a second residual-demand discount.
  const medicalVisits = a.targetPopulation*a.monthlyUtilization;
  const catchmentVisits = medicalVisits*a.catchmentFactor;
  const retainedVisits = catchmentVisits*a.retention;
  const marketVisits = (retainedVisits+a.inflowVisits)*a.clusterDemandMultiplier;
  const visits = Math.min(a.monthlyCapacity,marketVisits*share);
  const low = Math.min(a.monthlyCapacity,visits*(1-a.uncertainty));
  const high = Math.min(a.monthlyCapacity,marketVisits*share*(1+a.uncertainty));
  const contribution = a.revenuePerVisitWon*(1-a.variableRate);
  const bepVisits = contribution>0 && a.fixedCostWon>0 ? a.fixedCostWon/contribution : null;
  const coverage = bepVisits === null ? null : visits/bepVisits;
  const cap = coverage === null ? null : viabilityGate(coverage);
  const revenueWon = visits*a.revenuePerVisitWon;
  const operatingSurplusWon = visits*contribution-a.fixedCostWon;
  const lowCoverage = bepVisits === null ? null : low/bepVisits;
  const downsideSurplusWon = low*contribution-a.fixedCostWon-a.monthlyDebtPrincipalWon;
  const operatingMargin = revenueWon > 0 ? operatingSurplusWon/revenueWon : operatingSurplusWon < 0 ? -1 : 0;
  const rentRatio = revenueWon > 0 ? a.monthlyRentWon/revenueWon : a.monthlyRentWon > 0 ? 1 : 0;
  const paybackMonths = a.startupCapitalWon === 0 ? 0 : operatingSurplusWon > 0 ? a.startupCapitalWon/operatingSurplusWon : null;
  const debtCoverage = a.monthlyDebtPrincipalWon === 0
    ? (operatingSurplusWon >= 0 ? Number.POSITIVE_INFINITY : 0)
    : Math.max(0, operatingSurplusWon)/a.monthlyDebtPrincipalWon;
  const scoreParts = bepVisits === null || coverage === null || lowCoverage === null || operatingMargin === null ? null : {
    breakEven: scoreByBands(coverage, [[0,0],[.6,20],[.8,40],[1,60],[1.2,80],[1.5,100]]),
    downside: scoreByBands(lowCoverage, [[0,0],[.6,20],[.8,40],[1,65],[1.2,85],[1.5,100]]),
    margin: scoreByBands(operatingMargin, [[-.2,0],[0,20],[.05,40],[.1,60],[.2,80],[.3,100]]),
    payback: a.startupCapitalWon === 0 ? 50 : paybackMonths === null ? 0 : scoreByBands(paybackMonths, [[0,100],[36,100],[48,85],[60,70],[84,50],[120,25],[180,0]]),
    rent: rentRatio === null ? 0 : a.monthlyRentWon === 0 ? 50 : scoreByBands(rentRatio, [[0,100],[.05,100],[.1,80],[.15,60],[.2,35],[.3,0]]),
    debt: scoreByBands(debtCoverage, [[0,0],[.8,20],[1,45],[1.2,60],[1.5,80],[2,100]]),
  };
  const composite = scoreParts === null ? null :
    scoreParts.breakEven*.30 + scoreParts.downside*.20 + scoreParts.margin*.20 +
    scoreParts.payback*.15 + scoreParts.rent*.10 + scoreParts.debt*.05;
  // Break-even coverage remains a hard ceiling: attractive surroundings cannot rescue
  // an operating plan that does not cover its monthly costs.
  const score = cap===null || composite===null ? null : visits === 0 ? 0 : Math.round(Math.max(0,Math.min(cap,composite*a.riskMultiplier)));
  const futureVisits = Math.min(a.monthlyCapacity,marketVisits*a.futureDemandFactor*share);
  const futureCoverage = bepVisits===null?null:futureVisits/bepVisits;
  const futureScore = futureCoverage===null || score===null ? null : Math.round(Math.max(0,Math.min(100,
    score + scoreByBands(futureCoverage-coverage!, [[-.5,-25],[0,0],[.25,10],[.5,20]])
  )));
  return { modelVersion:model.version, medicalVisits,catchmentVisits,retainedVisits,marketVisits,share,
    visits,low,high,bepVisits,coverage,cap,score,futureScore,
    revenueWon,operatingSurplusWon,lowCoverage,downsideSurplusWon,operatingMargin,rentRatio,paybackMonths,debtCoverage,scoreParts,
    rawCompetitorPower,effectiveCompetitorPower,clusterDemandMultiplier:a.clusterDemandMultiplier,
    competitors:powers.map(c=>({...c,share:(rawCompetitorPower > 0 ? effectiveCompetitorPower * c.power / rawCompetitorPower : 0)/denominator})),outsideShare:a.outsideAttraction/denominator,
    verdict:coverage===null?'산정 조건 확인':coverage<.8?'수요·비용 재검토':coverage<1?'손익분기점 미달':low<(bepVisits??0)?'조건부 검토':'추가 검토 가능',
    caveats:['예상 환자는 고유 환자 수가 아닌 월 진료 방문 건수입니다.','예측범위는 입력한 변동폭이며 통계적 신뢰구간이 아닙니다.','직장인과 생활인구는 서로 겹칠 수 있어 더 큰 한쪽만 외부 환자 가능성에 반영합니다.','의료상권 유입 효과와 경쟁 포화계수는 실제 병원 성과자료로 추가 보정해야 하는 시험 기준입니다.','보험·비급여 믹스, 실제 이동시간과 의료이용률 검증 전의 가정 시뮬레이션입니다.','사업성 점수는 성공 확률이 아니며 영업잉여는 세전·원금상환 전입니다.'],
  };
}
