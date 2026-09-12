import type { AiInsightItem, AiInterpretation, LocationAnalysis } from "./location-types";

export type InsightEvidence = AiInterpretation["evidence"][number];

function addFact(facts: InsightEvidence[], id: string, label: string, value: string, source: string) {
  if (!value || facts.some(item => item.id === id)) return;
  facts.push({ id, label, value, source });
}

export function buildInsightEvidence(analysis: LocationAnalysis): InsightEvidence[] {
  const facts: InsightEvidence[] = [];
  const official = analysis.hiraMedical?.status === "available";
  addFact(facts, "location", "분석 조건", `${analysis.location.displayName.split(",")[0]} · ${analysis.specialty} · 반경 ${analysis.radiusMeters.toLocaleString()}m`, "사용자 선택");
  addFact(facts, "score", "베타 관측점수", `${analysis.observedScore}점 / ${analysis.grade}등급`, "연결 지표 가중평균");
  addFact(facts, "coverage", "데이터 충족률", `${analysis.confidence}% (예측 정확도 아님)`, "THE FOUNT 연결 상태");
  addFact(facts, "medical", "전체 의료기관", `${analysis.counts.medical.toLocaleString()}곳${analysis.countLimits?.medical ? " 이상" : ""}`, official ? "HIRA 신고 기준" : `${analysis.provider === "kakao" ? "Kakao" : "OpenStreetMap"} 장소검색`);
  addFact(facts, "specialty", `${analysis.specialty} 경쟁기관`, `${analysis.counts.matchingSpecialty.toLocaleString()}곳${analysis.countLimits?.matchingSpecialty ? " 이상" : ""}`, analysis.hiraMedical?.matchingSpecialtyCount !== undefined ? "HIRA 진료과목 코드" : "장소명·분류 검색");
  addFact(facts, "pharmacy", "약국", `${analysis.counts.pharmacy.toLocaleString()}곳${analysis.countLimits?.pharmacy ? " 이상" : ""}`, analysis.hiraMedical?.pharmacyCount !== undefined ? "HIRA 약국정보" : "장소검색");
  addFact(facts, "transit", "지하철역", `${analysis.counts.transit.toLocaleString()}곳`, "지도 장소검색");
  addFact(facts, "parking", "주차시설", `${analysis.counts.parking.toLocaleString()}곳${analysis.countLimits?.parking ? " 이상" : ""}`, "지도 장소검색");

  if (analysis.demographics) {
    addFact(facts, "resident", "거주인구", `${analysis.demographics.residentPopulation.toLocaleString()}명 · ${analysis.demographics.areaName} · ${analysis.demographics.year}년`, "SGIS 행정동 통계");
    addFact(facts, "worker", "종사자", `${analysis.demographics.workerPopulation.toLocaleString()}명 · 사업체 ${analysis.demographics.businesses.toLocaleString()}개`, "SGIS 행정동 통계");
  }
  if (analysis.livingPopulation?.status === "available") {
    addFact(facts, "living", "생활인구", `${analysis.livingPopulation.total?.toLocaleString()}명 · ${analysis.livingPopulation.referenceDate} ${String(analysis.livingPopulation.hour).padStart(2, "0")}시 · ${analysis.livingPopulation.spatialUnit}`, "서울특별시 서울 생활인구");
  }
  if (analysis.consumerPower?.status === "available") {
    addFact(facts, "consumer", "소비력", `소비총액 백분위 ${analysis.consumerPower.percentile}%${analysis.consumerPower.medicalPercentile !== undefined ? ` · 의료비 백분위 ${analysis.consumerPower.medicalPercentile}%` : ""}`, analysis.consumerPower.source);
  }
  if (analysis.rentMarket?.status === "available") {
    addFact(facts, "rent", "상가 임대료", `평당 월세 중앙값 ${analysis.rentMarket.monthlyRentPerPyeongManwon?.toLocaleString()}만원 · ${analysis.rentMarket.sampleCount?.toLocaleString()}개 표본`, analysis.rentMarket.source);
  }
  if (analysis.growthForecast?.status === "available") {
    const last = analysis.growthForecast.projected.at(-1);
    addFact(facts, "growth", "3년 통계 전망", last ? `${analysis.growthForecast.baseYear}년 이후 ${last.year}년 거주인구 ${last.residentPopulation.toLocaleString()}명 · 종사자 ${last.workerPopulation.toLocaleString()}명` : analysis.growthForecast.message, "SGIS 최근 3개년 선형 추세 외삽");
  }
  if (analysis.developmentPlans?.status === "available") {
    addFact(facts, "development", "주변 개발계획", `${analysis.developmentPlans.plans.length.toLocaleString()}건 · 반경 ${analysis.developmentPlans.radiusMeters.toLocaleString()}m`, analysis.developmentPlans.source);
  }
  analysis.metrics.filter(metric => metric.value !== null).forEach((metric, index) => {
    addFact(facts, `metric_${index}`, `${metric.label} 점수`, `${metric.value}점 · ${metric.note}`, "THE FOUNT 산식");
  });
  return facts.slice(0, 24);
}

function item(text: string, evidenceIds: string[]): AiInsightItem {
  return { text, evidenceIds };
}

export function buildRuleInterpretation(analysis: LocationAnalysis, status: AiInterpretation["status"] = "rules", message = "연결된 데이터로 규칙 기반 해석을 표시합니다."): AiInterpretation {
  const evidence = buildInsightEvidence(analysis);
  const evidenceIds = new Set(evidence.map(fact => fact.id));
  const strengths: AiInsightItem[] = analysis.strengths.slice(0, 3).map((text, index) => {
    const candidates = index === 0 ? ["living", "resident", "medical"] : index === 1 ? ["transit", "parking", "medical"] : ["pharmacy", "specialty", "medical"];
    return item(text, candidates.filter(id => evidenceIds.has(id)).slice(0, 2));
  });
  const risks: AiInsightItem[] = analysis.risks.slice(0, 3).map((text, index) => {
    const candidates = index === 0 ? ["specialty", "medical"] : index === 1 ? ["living", "resident", "coverage"] : ["coverage", "medical"];
    return item(text, candidates.filter(id => evidenceIds.has(id)).slice(0, 2));
  });
  const missing = analysis.dataConnections?.filter(connection => connection.status !== "available").slice(0, 3) || [];
  const nextChecks = missing.length
    ? missing.map(connection => item(`${connection.label} 데이터를 보강해 최종 판단 범위를 넓히세요.`, ["coverage"]))
    : [item("현장 보행 동선과 실제 임대조건을 대조한 뒤 최종 계약 여부를 결정하세요.", ["location", "coverage"])];
  return {
    status,
    provider: "rules",
    summary: analysis.insight,
    summaryEvidenceIds: ["location", "medical", "specialty", "score", "coverage"].filter(id => evidenceIds.has(id)),
    strengths,
    risks,
    nextChecks,
    evidence,
    generatedAt: new Date().toISOString(),
    message
  };
}

export function evidenceLabels(interpretation: AiInterpretation, ids: string[]) {
  const byId = new Map(interpretation.evidence.map(fact => [fact.id, fact.label]));
  return ids.map(id => byId.get(id)).filter((label): label is string => Boolean(label));
}
