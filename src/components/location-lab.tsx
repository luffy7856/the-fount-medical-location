"use client";

import dynamic from "next/dynamic";
import { ForecastLines } from "./forecast-lines";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Check, ChevronDown, ChevronRight,
  Building2, Calculator, Coins, Download, GitCompareArrows, Hospital, Layers3,
  ExternalLink, LocateFixed, MapPin, Menu, Pause, Play, Printer, Search, ShieldCheck, Sparkles, TimerReset, TrendingUp, Users, X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { specialties, type Specialty } from "@/data/specialties";
import type { AiInsightItem, AiInterpretation, LivingPopulation, LocationAnalysis, LiveMetric, LivePlace } from "@/data/location-types";
import { analysisStorageId, loadSavedAnalyses, mergeSavedAnalysis, storeSavedAnalyses } from "@/data/saved-analyses";
import { calculateOpeningPlan, DEFAULT_OPENING_INPUTS, type OpeningInputs } from "@/data/opening-plan";

const LiveMap = dynamic(() => import("./live-map"), { ssr: false, loading: () => <div className="map-loading"><Activity className="spin" /> 지도를 불러오는 중</div> });

type PanelTab = "overview" | "competitors" | "forecast" | "profitability" | "compare";

const EMPTY_ANALYSIS: LocationAnalysis = {
  mode: "live", provider: "openstreetmap", analyzedAt: new Date(0).toISOString(),
  location: { displayName: "서울 강남구 역삼동", latitude: 37.5007, longitude: 127.0365 },
  specialty: "피부과", radiusMeters: 1000, places: [],
  counts: { medical: 0, matchingSpecialty: 0, pharmacy: 0, transit: 0, parking: 0 },
  metrics: [
    { label: "잠재환자 수요", value: null, note: "인구 데이터 연동 필요", color: "#169e91" },
    { label: "경쟁환경", value: null, note: "분석 대기", color: "#f26b4a" },
    { label: "소비력", value: null, note: "소비 데이터 연동 필요", color: "#8b66d2" },
    { label: "접근성", value: null, note: "분석 대기", color: "#3f8fe6" },
    { label: "비용효율", value: null, note: "임대료 데이터 연동 필요", color: "#e5a33f" },
    { label: "성장성", value: null, note: "개발계획 데이터 연동 필요", color: "#347bc6" }
  ],
  observedScore: 0, grade: "-", confidence: 0,
  insight: "주소를 분석하면 실제 공개 지도 데이터가 표시됩니다.", strengths: [], risks: [], limitations: [],
  dataConnections: [
    { id: "hira", label: "HIRA 공식 의료기관", status: "not_configured", source: "건강보험심사평가원 병원정보서비스", message: "분석 후 승인키 연결 상태를 확인합니다.", requiredEnvironmentVariables: ["HIRA_SERVICE_KEY"], setupUrl: "https://www.data.go.kr/data/15001698/openapi.do" },
    { id: "consumer", label: "소비력", status: "not_configured", source: "서울시 상권분석서비스(소비-행정동)", message: "분석 후 서울시 소비 데이터 상태를 확인합니다.", requiredEnvironmentVariables: ["SEOUL_OPEN_DATA_API_KEY"], setupUrl: "https://data.seoul.go.kr/dataList/OA-22166/S/1/datasetView.do" },
    { id: "rent", label: "상가 임대료", status: "not_configured", source: "상업용 부동산 임대 데이터 공급자", message: "승인된 임대료 공급자 연결이 필요합니다.", requiredEnvironmentVariables: ["COMMERCIAL_RENT_API_KEY", "COMMERCIAL_RENT_API_URL_TEMPLATE"], setupUrl: "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EC%83%81%EA%B0%80%20%EC%9E%84%EB%8C%80%EB%A3%8C" },
    { id: "development", label: "개발·계획 공간", status: "not_configured", source: "VWorld 2D 데이터 API", message: "VWorld 운영키 승인 후 공식 계획공간 정보가 표시됩니다.", requiredEnvironmentVariables: ["VWORLD_API_KEY"], setupUrl: "https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do" }
  ]
};

const LIVE_LAYERS = [
  { id: "hospital", label: "의료기관", color: "#e55e48" },
  { id: "pharmacy", label: "약국", color: "#3182ce" },
  { id: "transit", label: "지하철역", color: "#0f937d" },
  { id: "parking", label: "주차시설", color: "#805ad5" },
  { id: "development", label: "개발·계획 공간", color: "#d28c24" }
];

function defaultPopulationDate() {
  const now = new Date();
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  seoul.setDate(seoul.getDate() - 4);
  return `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, "0")}-${String(seoul.getDate()).padStart(2, "0")}`;
}

function formatAnalysisTime(value: string) {
  if (value === new Date(0).toISOString()) return "분석 대기";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).format(new Date(value));
}

async function fetchOsmInBrowser(query: string) {
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.osm.jp/api/interpreter"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal: AbortSignal.timeout(9000) });
      if (response.ok) return await response.json();
    } catch { /* CORS 또는 혼잡 시 다음 공개 서버로 전환 */ }
  }
  throw new Error("공개 지도 데이터가 혼잡합니다. 잠시 후 다시 분석해주세요.");
}

function Brand() {
  return <a className="brand" href="#top"><span className="brand-symbol"><LocateFixed /></span><span><b>THE FOUNT</b><small>MEDICAL LOCATION</small></span></a>;
}

function MetricBars({ metrics }: { metrics: LiveMetric[] }) {
  const connected = metrics.filter((metric): metric is LiveMetric & { value: number } => metric.value !== null);
  return <div className="score-bars">{connected.map(metric => <div className="score-row" key={metric.label}>
    <span>{metric.label}</span><div title={metric.note}><i style={{ width: `${Math.max(metric.value, 3)}%`, background: metric.color }} /></div><b>{metric.label === "경쟁환경" && metric.value === 0 ? "과밀" : metric.value}</b>
  </div>)}</div>;
}

const FACTOR_WEIGHTS: Record<string, number> = { "잠재환자 수요": 25, "경쟁환경": 20, "소비력": 15, "접근성": 15, "비용효율": 10, "성장성": 15 };

function calculateObservedScore(metrics: LiveMetric[]) {
  const connected = metrics.filter((metric): metric is LiveMetric & { value: number } => metric.value !== null);
  const totalWeight = connected.reduce((sum, metric) => sum + (FACTOR_WEIGHTS[metric.label] || 0), 0);
  return totalWeight ? Math.round(connected.reduce((sum, metric) => sum + metric.value * (FACTOR_WEIGHTS[metric.label] || 0), 0) / totalWeight) : 0;
}

function DecisionEvidence({ analysis }: { analysis: LocationAnalysis }) {
  const connected = analysis.metrics.filter(metric => metric.value !== null);
  const excluded = analysis.metrics.filter(metric => metric.value === null).map(metric => metric.label);
  const connectedWeight = connected.reduce((sum, metric) => sum + (FACTOR_WEIGHTS[metric.label] || 0), 0);
  const decision = analysis.confidence < 90
    ? { label: "비교 후보로 보세요", tone: "hold", text: "지금 바로 계약을 결정하기보다, 같은 진료과의 다른 후보지 한두 곳과 나란히 비교하기 좋은 단계입니다." }
    : analysis.observedScore >= 75
      ? { label: "우선 현장확인 후보", tone: "positive", text: "수요와 접근성 등에서 좋은 신호가 더 많습니다. 실제 건물과 경쟁병원을 확인할 가치가 있는 후보지입니다." }
      : analysis.observedScore >= 60
        ? { label: "다른 후보와 비교", tone: "neutral", text: "장점도 있지만 경쟁이나 비용 부담도 있습니다. 한 곳만 보고 결정하지 말고 다른 자리와 조건을 비교하세요." }
        : { label: "다른 자리도 함께 검토", tone: "negative", text: "현재 자료에서는 부담 요인이 더 크게 보입니다. 계약 전에 대체 후보지를 먼저 찾아 비교하는 편이 안전합니다." };
  return <section className="panel-section decision-evidence">
    <div className="panel-title"><div><span>EVIDENCE TO DECISION</span><h3>입지 판단 근거와 최종 결론</h3></div></div>
    <article className={`final-decision ${decision.tone}`}><span>쉽게 보는 최종 결론</span><h3>{decision.label}</h3><p>{decision.text}</p><small>입지 참고점수 {analysis.observedScore}점 · 확인된 자료 반영 {analysis.confidence}% · 반경 {analysis.radiusMeters.toLocaleString()}m</small></article>
    <details className="evidence-details">
      <summary>점수 산정 근거 보기</summary>
      <div className="evidence-flow"><span>실제 원자료</span><ArrowRight /><span>항목별 0~100</span><ArrowRight /><span>가중평균</span><ArrowRight /><strong>{decision.label}</strong></div>
      <div className="evidence-table">
        <div className="head"><span>판단항목</span><span>가중치</span><span>점수·근거</span></div>
        {connected.map(metric => <div key={metric.label}>
          <b>{metric.label}</b><span>{FACTOR_WEIGHTS[metric.label]}%</span><p><strong>{metric.label === "경쟁환경" && metric.value === 0 ? "과밀" : metric.value}</strong><small>{metric.note}</small></p>
        </div>)}
      </div>
      <div className="weight-coverage"><div><i style={{ width: `${connectedWeight}%` }} /></div><span>전체 가중치 중 {connectedWeight}% 반영{excluded.length ? ` · ${excluded.join("·")}은 현재 산정에서 제외` : ""}</span></div>
      {analysis.limitations.length > 0 && <div className="analysis-limitations"><b>함께 확인할 조건</b><ul>{analysis.limitations.map(item => <li key={item}>{item}</li>)}</ul></div>}
    </details>
  </section>;
}

function populationShare(value: number | undefined, total: number | undefined) {
  return value !== undefined && total ? `${Math.round(value / total * 1000) / 10}%` : "—";
}

function RegionalProfileBlock({ analysis }: { analysis: LocationAnalysis }) {
  const profile = analysis.regionalProfile;
  const total = analysis.demographics?.residentPopulation;
  if (!profile) return null;
  const facts = [
    ["남성", populationShare(profile.malePopulation, total)],
    ["여성", populationShare(profile.femalePopulation, total)],
    ["15세 미만", populationShare(profile.childPopulation, total)],
    ["20~39세", populationShare(profile.youngAdultPopulation, total)],
    ["40~59세", populationShare(profile.middleAgePopulation, total)],
    ["65세 이상", populationShare(profile.seniorPopulation, total)],
    ["초등학교", profile.elementarySchools !== undefined ? `${profile.elementarySchools}곳` : "—"],
    ["어린이집·유치원", profile.childcareFacilities !== undefined ? `${profile.childcareFacilities}곳` : "—"]
  ];
  return <section className="panel-section regional-profile">
    <div className="panel-title"><div><span>WHO LIVES HERE?</span><h3>이 지역은 어떤 곳인가요?</h3></div></div>
    <article className="region-character"><span>{profile.areaName} · {profile.year}년</span><h3>{profile.character}</h3><p>{profile.characterReason}</p></article>
    <div className="regional-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <p className="score-disclaimer">인구 비율: {profile.year}년 {profile.areaName} 전체 주민 기준 · 시설 수: 선택 반경 {analysis.radiusMeters.toLocaleString()}m 내 검색 결과. 연령 구간은 주요 환자층을 보여주며 합계가 100%인 구분표는 아닙니다.</p>
    <div className="specialty-fit"><b>{analysis.specialty} 관점에서 보면</b>{profile.specialtyFit.map(item => <p key={item}>{item}</p>)}</div>
    <div className="doctor-checks"><b><Search /> 원장님이 현장에서 확인할 것</b><ol>{profile.doctorChecks.map(item => <li key={item}>{item}</li>)}</ol></div>
  </section>;
}

function formatCount(analysis: LocationAnalysis, key: keyof LocationAnalysis["counts"]) {
  return `${analysis.counts[key]}곳${analysis.countLimits?.[key] ? " 이상" : ""}`;
}

function withLivingPopulation(analysis: LocationAnalysis, livingPopulation: LivingPopulation): LocationAnalysis {
  const metrics = analysis.metrics.map(metric => ({ ...metric }));
  if (livingPopulation.status === "available" && livingPopulation.total !== undefined) {
    const demographicDemand = analysis.demographics ? Math.max(0, Math.min(100, Math.round(38 + (analysis.demographics.residentPopulation + analysis.demographics.workerPopulation * .55) / 1600))) : null;
    const livingDemand = Math.max(0, Math.min(100, Math.round(35 + livingPopulation.total / 900)));
    const demand = demographicDemand === null ? livingDemand : Math.round(demographicDemand * .55 + livingDemand * .45);
    metrics[0] = { ...metrics[0], value: demand, note: `${livingPopulation.referenceDate} ${String(livingPopulation.hour).padStart(2, "0")}시 생활인구 반영` };
    const observedScore = calculateObservedScore(metrics);
    return { ...analysis, livingPopulation, metrics, observedScore, grade: observedScore >= 85 ? "A" : observedScore >= 75 ? "B+" : observedScore >= 65 ? "B" : "C" };
  }
  return { ...analysis, livingPopulation };
}

function FinancialPlanningPanel({ analysis, inputs, onChange, compact = false }: { analysis: LocationAnalysis; inputs: OpeningInputs; onChange: (value: OpeningInputs) => void; compact?: boolean }) {
  const result = calculateOpeningPlan(analysis, inputs);
  const update = (key: keyof OpeningInputs, value: number) => onChange({ ...inputs, [key]: Number.isFinite(value) ? value : 0 });
  const fields: [keyof OpeningInputs, string, string][] = [
    ["floor", "입주 층", "층"], ["areaPyeong", "전용면적", "평"], ["depositManwon", "보증금", "만원"],
    ["monthlyRentManwon", "월세", "만원/월"], ["openingBudgetManwon", "시설·장비 등 개원자금", "만원"],
    ["monthlyPayrollManwon", "예상 월 인건비", "만원/월"], ["monthlyMarketingManwon", "예상 월 마케팅비", "만원/월"]
  ];
  const compactMoney = (value: number) => value >= 10000 ? `${(value / 10000).toFixed(1)}억원` : `${value.toLocaleString()}만원`;
  return <section className={`panel-section feasibility-card ${compact ? "compact" : ""}`}>
    <div className="feasibility-heading"><div><span>OPENING FEASIBILITY</span><h3>입지와 개원자금을 함께 비교합니다</h3><p>{analysis.specialty} 기준 참고모형에 층·면적·임대조건과 현재 입지 관측점수를 반영합니다.</p></div><Calculator /></div>
    <div className="opening-input-grid">{fields.map(([key, label, unit]) => <label key={key}><span>{label}</span><div><input type="number" min={key === "floor" ? -2 : 0} value={inputs[key]} onChange={event => update(key, Number(event.target.value))} /><small>{unit}</small></div></label>)}</div>
    <div className="estimate-notice"><AlertTriangle /><p><b>입력값 기반 사전 시뮬레이션</b><span>아래 결과는 후보지 비교를 돕는 참고 범위이며 실제 매출·수익이나 대출심사 결과를 보장하지 않습니다.</span></p></div>
    <div className="feasibility-results">
      <article className="revenue-range"><Building2 /><span>월매출 참고범위</span><b>{compactMoney(result.revenueLow)}~{compactMoney(result.revenueHigh)}</b><small>중간 참고값 {compactMoney(result.expectedRevenue)} · 입력값 변경 시 재계산</small></article>
      <article><Coins /><span>월 영업잉여 참고값</span><b className={result.monthlyOperatingProfit <= 0 ? "negative" : ""}>{result.monthlyOperatingProfit.toLocaleString()}만원</b><small>세금·대출원리금·원장 보수 전</small></article>
      <article><TimerReset /><span>투자회수 참고값</span><b>{result.paybackMonths ? `${result.paybackMonths}개월` : "추가 검토"}</b><small>보증금 포함 총투자액 기준</small></article>
    </div>
    <div className="benchmark-strip"><div><span>입력 총투자액</span><b>{result.totalCashInvestment.toLocaleString()}만원</b></div><ArrowRight /><div><span>{analysis.specialty} 면적 기준 참고 개원자금</span><b>{result.benchmarkCapital.toLocaleString()}만원</b></div><div className={result.capitalDifference > 10 ? "warning" : "healthy"}><span>참고값 대비</span><b>{result.capitalDifference > 0 ? "+" : ""}{result.capitalDifference}%</b></div></div>
    <div className="planning-notes"><span>월세/예상매출 {result.rentRatio}%</span><span>{inputs.floor}층 입지 보정 반영</span><span>입지점수 {analysis.observedScore || "—"}점 반영</span></div>
    <p className="estimate-disclaimer">실제 개원 전에는 상권·수가·장비·인력·운영일수와 금융조건을 별도로 검증해야 합니다.</p>
  </section>;
}

function evidenceNames(interpretation: AiInterpretation, item: AiInsightItem) {
  const byId = new Map(interpretation.evidence.map(fact => [fact.id, fact.label]));
  return item.evidenceIds.map(id => byId.get(id)).filter((label): label is string => Boolean(label));
}

function GroundedInsight({ analysis, loading }: { analysis: LocationAnalysis; loading: boolean }) {
  const interpretation = analysis.aiInterpretation;
  const summary = interpretation?.summary || analysis.insight;
  const strengths = interpretation?.strengths || analysis.strengths.map(text => ({ text, evidenceIds: [] }));
  const risks = interpretation?.risks || analysis.risks.map(text => ({ text, evidenceIds: [] }));
  const nextChecks = interpretation?.nextChecks || [];
  const label = loading ? "AI 해석 중" : interpretation?.status === "generated" ? "AI 근거 해석" : "규칙 기반 해석";
  const summarySources = interpretation ? interpretation.summaryEvidenceIds.map(id => interpretation.evidence.find(fact => fact.id === id)?.label).filter((value): value is string => Boolean(value)) : [];
  const renderItems = (items: AiInsightItem[]) => items.map(item => <span key={item.text}><i>{item.text}</i>{interpretation && evidenceNames(interpretation, item).length > 0 && <small>근거 · {evidenceNames(interpretation, item).join(" · ")}</small>}</span>);
  return <section className={`panel-section ai-insight ${interpretation?.status || "pending"}`}>
    <div className="ai-heading"><Sparkles /><div><span>GROUNDED LOCATION INTERPRETATION</span><h3>현재 데이터에 대한 해석</h3></div><em className={loading ? "loading" : ""}>{loading && <Activity className="spin" />}{label}</em></div>
    <p>{summary}</p>
    {summarySources.length > 0 && <div className="insight-sources">{summarySources.map(source => <small key={source}>{source}</small>)}</div>}
    <div className={`pros-cons ${nextChecks.length ? "three-columns" : ""}`}>
      <div><b><Check /> 확인된 신호</b>{renderItems(strengths)}</div>
      <div><b><AlertTriangle /> 확인 필요</b>{renderItems(risks)}</div>
      {nextChecks.length > 0 && <div className="next-checks"><b><Search /> 원장님이 확인할 것</b>{renderItems(nextChecks)}</div>}
    </div>
    <p className="insight-status">{interpretation?.message || "분석 완료 후 연결된 자료만으로 AI 해석을 요청합니다."}</p>
  </section>;
}

function OverviewPanel({ analysis, onTab, aiLoading }: { analysis: LocationAnalysis; onTab: (tab: PanelTab) => void; aiLoading: boolean }) {
  const stats = [
    ["전체 의료기관", formatCount(analysis, "medical"), analysis.hiraMedical?.status === "available" ? "HIRA 신고 기준 공식 수" : analysis.countLimits?.medical ? "카카오 조회 상한 도달" : "Kakao 장소검색 기준"],
    [`${analysis.specialty} 직접 경쟁`, formatCount(analysis, "matchingSpecialty"), "Kakao 분류·검색 기준"],
    ["약국", formatCount(analysis, "pharmacy"), analysis.hiraMedical?.pharmacyCount !== undefined ? "HIRA 약국정보 기준" : analysis.countLimits?.pharmacy ? "카카오 조회 상한 도달" : "Kakao 장소검색 기준"],
    ["지하철역", formatCount(analysis, "transit"), "카카오 역 카테고리"],
    ["주차시설", formatCount(analysis, "parking"), analysis.countLimits?.parking ? "카카오 조회 상한 도달" : "공개 등록 기준"],
    ["분석 반경", `${analysis.radiusMeters.toLocaleString()}m`, analysis.provider === "kakao" ? "Kakao Local" : "OpenStreetMap"],
    ...(analysis.demographics ? [["거주인구", `${analysis.demographics.residentPopulation.toLocaleString()}명`, `${analysis.demographics.areaName} · SGIS ${analysis.demographics.year}`], ["종사자", `${analysis.demographics.workerPopulation.toLocaleString()}명`, `${analysis.demographics.businesses.toLocaleString()}개 사업체`]] : []),
    ...(analysis.livingPopulation?.status === "available" ? [["생활인구", `${analysis.livingPopulation.total?.toLocaleString()}명`, `${analysis.livingPopulation.referenceDate} ${String(analysis.livingPopulation.hour).padStart(2, "0")}시 · 서울시`]] : []),
    ...(analysis.consumerPower?.status === "available" ? [["소비력 백분위", `${analysis.consumerPower.percentile}%`, `${analysis.consumerPower.areaName || "행정동"} · ${analysis.consumerPower.referencePeriod || "최신"}`]] : []),
    ...(analysis.rentMarket?.status === "available" ? [["평당 월세 참고값", `${analysis.rentMarket.monthlyRentPerPyeongManwon?.toLocaleString()}만원`, analysis.rentMarket.spatialUnit]] : []),
    ...(analysis.developmentPlans?.status === "available" ? [["개발·계획 공간", `${analysis.developmentPlans.plans.length}건`, `반경 ${analysis.developmentPlans.radiusMeters.toLocaleString()}m`]] : [])
  ];
  const excluded = analysis.metrics.filter(metric => metric.value === null).map(metric => metric.label);
  return <div className="panel-content">
    <div className="location-heading"><div><span><MapPin /> 실제 분석 지역</span><h2>{analysis.location.displayName.split(",")[0]}</h2><p>{analysis.specialty} · 반경 {analysis.radiusMeters.toLocaleString()}m</p></div></div>
    <div className="score-hero live-score"><div className="gauge" style={{ background: `conic-gradient(#35d0b0 0 ${analysis.observedScore}%,rgba(255,255,255,.15) ${analysis.observedScore}%)` }}><div><b>{analysis.observedScore || "—"}</b><small>/100</small></div></div><div><span>MEDICAL LOCATION SCORE</span><h3>{analysis.confidence < 90 ? "후보지 비교용" : `${analysis.grade} 등급`}</h3><p>확인된 실제 데이터만 반영한 <b>참고점수</b></p></div><div className="confidence"><ShieldCheck /><span>반영 범위</span><b>{analysis.confidence}%</b><small>정확도 아님</small></div></div>
    <p className="score-disclaimer">이 점수는 개원 성공확률이 아니라 후보지 비교용 지표입니다.{excluded.length ? ` ${excluded.join("·")}은 자료가 확보되기 전까지 점수 산정에서 제외됩니다.` : " 모든 핵심 항목이 반영되었습니다."}</p>
    <div className="stats-grid">{stats.map(([label, value, meta]) => <article key={label}><span>{label}</span><b>{value}</b><small>{meta}</small></article>)}</div>
    <section className="panel-section"><div className="panel-title"><div><span>ANALYSIS FACTORS</span><h3>현재 확인된 핵심 지표</h3></div><button onClick={() => onTab("competitors")}>경쟁병원 <ChevronRight /></button></div><MetricBars metrics={analysis.metrics} /></section>
    <RegionalProfileBlock analysis={analysis} />
    <DecisionEvidence analysis={analysis} />
    <GroundedInsight analysis={analysis} loading={aiLoading} />
    <button className="profitability-entry" type="button" onClick={() => onTab("profitability")}><span><Calculator /><b>수익성은 입력값으로 직접 확인하세요</b><small>면적·월세·개원자금을 입력하면 참고 매출범위와 회수기간을 계산합니다.</small></span><ChevronRight /></button>
    <section className="panel-section next-step"><span>THE FOUNT NEXT STEP</span><h3>지도 결과를 실제 개원계획으로 연결하세요</h3><p>입지·개원자금·인건비·장비·세금·손익분기점을 함께 검토합니다.</p><a className="next-step-link" href="https://www.thefount.co.kr/" target="_blank" rel="noopener noreferrer">정밀 개원분석 상담하기 <ArrowRight /></a></section>
    <section className="source-note"><b>현재 사용 데이터</b><div><span>{analysis.provider === "kakao" ? "Kakao Local API" : "OpenStreetMap"}</span>{analysis.hiraMedical?.status === "available" && <span>HIRA 공식 수치</span>}{analysis.demographics && <span>SGIS {analysis.demographics.year}</span>}{analysis.livingPopulation?.status === "available" && <span>서울 생활인구</span>}{analysis.consumerPower?.status === "available" && <span>서울시 소비</span>}{analysis.rentMarket?.status === "available" && <span>상가 임대료</span>}{analysis.developmentPlans?.status === "available" && <span>개발계획</span>}</div><small>분석 시각 {formatAnalysisTime(analysis.analyzedAt)}{analysis.livingPopulation?.status === "available" ? ` · 생활인구 공간 단위: ${analysis.livingPopulation.spatialUnit}${analysis.livingPopulation.spatialUnit === "250m 격자" ? "(고유 격자 합계)" : "(행정동 집계)"}` : ""} · 공개 데이터의 등록 상태에 따라 현장과 차이가 있을 수 있습니다.</small></section>
    <PrintAppendix analysis={analysis} />
  </div>;
}

function PrintAppendix({ analysis }: { analysis: LocationAnalysis }) {
  const hospitals = analysis.places.filter(place => place.kind === "hospital").slice(0, 12);
  return <div className="print-only-sections">
    <section className="print-appendix-section">
      <div className="section-intro"><span>COMPETITION APPENDIX</span><h2>경쟁 의료기관 근거</h2><p>{analysis.specialty} · 반경 {analysis.radiusMeters.toLocaleString()}m · 거리순 주요 12곳</p></div>
      <div className="print-competitor-summary"><article><span>전체 의료기관</span><b>{formatCount(analysis, "medical")}</b></article><article><span>{analysis.specialty}</span><b>{formatCount(analysis, "matchingSpecialty")}</b></article><article><span>약국</span><b>{formatCount(analysis, "pharmacy")}</b></article></div>
      <table className="print-competitor-table"><thead><tr><th>의료기관</th><th>분류</th><th>거리</th><th>주소</th></tr></thead><tbody>{hospitals.map(place => <tr key={place.id}><td>{place.name}</td><td>{place.specialty || "의료기관"}</td><td>{place.distanceMeters.toLocaleString()}m</td><td>{place.address || "공개 주소 없음"}</td></tr>)}</tbody></table>
      <small className="print-source-line">{analysis.hiraMedical?.status === "available" ? "전체 기관 수: HIRA 신고 기준 · 직접 경쟁 수와 위치·장소명: Kakao 분류·검색 기준" : "기관 수·직접 경쟁 수·위치·장소명: Kakao 분류·검색 기준"}</small>
    </section>
    <section className="print-appendix-section print-forecast-section"><ForecastPanel analysis={analysis} /></section>
  </div>;
}

function kakaoPlaceLink(place: LivePlace) {
  if (place.url) {
    try {
      const url = new URL(place.url);
      if (["place.map.kakao.com", "map.kakao.com"].includes(url.hostname) && ["http:", "https:"].includes(url.protocol)) {
        url.protocol = "https:";
        return url.href;
      }
    } catch { /* Use the verified location when a place URL is unavailable. */ }
  }
  return `https://map.kakao.com/link/map/${encodeURIComponent(place.name)},${place.latitude},${place.longitude}`;
}

function CompetitorPanel({ analysis, selected, onSelect }: { analysis: LocationAnalysis; selected: LivePlace | null; onSelect: (place: LivePlace) => void }) {
  const hospitals = analysis.places.filter(place => place.kind === "hospital");
  const current = selected?.kind === "hospital" ? selected : hospitals[0];
  return <div className="panel-content"><div className="section-intro"><span>LIVE COMPETITOR MAP</span><h2>의료기관 {formatCount(analysis, "medical")}</h2><p>지도 표시 {hospitals.length}곳 · {analysis.specialty} {analysis.hiraMedical?.status === "available" ? "공식 수" : "검색"} {formatCount(analysis, "matchingSpecialty")} · 반경 {analysis.radiusMeters.toLocaleString()}m</p>{analysis.hiraMedical?.status === "available" && <small className="source-split">숫자: HIRA 신고 기준 · 위치·장소명: Kakao 장소검색</small>}</div>
    {current && <><div className="hospital-detail"><div className="hospital-avatar"><Hospital /></div><div><span>선택한 실제 의료기관</span><h3>{current.name}</h3><p>{current.specialty || "의료기관"} · {current.distanceMeters.toLocaleString()}m</p></div><b>LIVE</b></div><div className="detail-grid"><span>거리 <b>{current.distanceMeters.toLocaleString()}m</b></span><span>출처 <b>{analysis.provider === "kakao" ? "Kakao" : "OSM"}</b></span><span className="wide">주소 <b>{current.address || "공개 주소 없음"}</b></span></div></>}
    <div className="list-heading"><h3>거리순 의료기관</h3><span>클릭하면 카카오맵에서 열립니다</span></div><div className="hospital-list">{hospitals.length ? hospitals.slice(0, 40).map(place => <a key={place.id} href={kakaoPlaceLink(place)} target="_blank" rel="noopener noreferrer" aria-label={`${place.name} 카카오맵에서 보기 (새 탭)`} className={current?.id === place.id ? "active" : ""} onClick={() => onSelect(place)}><span className="dot age-fresh" /><div><b>{place.name}</b><small>{place.specialty || "의료기관"} · {place.distanceMeters.toLocaleString()}m</small></div><strong>{place.distanceMeters}m</strong><ExternalLink /></a>) : <div className="empty-state">반경 내 공개 등록 의료기관을 찾지 못했습니다.</div>}</div>
  </div>;
}

function ForecastPanel({ analysis }: { analysis: LocationAnalysis }) {
  const forecast = analysis.growthForecast;
  if (!forecast || forecast.status !== "available") {
    const plans = analysis.developmentPlans?.status === "available" ? analysis.developmentPlans.plans : [];
    return <div className="panel-content"><div className="section-intro"><span>DATA CONNECTION</span><h2>3년 전망 데이터 준비</h2><p>가상의 전망 수치는 표시하지 않습니다.</p></div><div className="honest-placeholder"><BarChart3 /><h3>연도별 SGIS 통계가 필요합니다</h3><p>{forecast?.message || "해당 위치의 최근 연도별 인구·종사자·사업체 통계를 불러오지 못했습니다."}</p><ul><li>신규 아파트 입주와 주택 공급</li><li>재개발·재건축·신축건물</li><li>교통망 개통 계획</li><li>의료기관 개폐업 추세</li></ul></div>{plans.length > 0 && <section className="development-list"><h3>현재 확인 가능한 개발·계획 공간정보</h3>{plans.slice(0, 8).map(plan => <article key={plan.id}><Building2 /><div><b>{plan.name}</b><span>{plan.category} · {plan.status}{plan.targetDate ? ` · ${plan.targetDate}` : ""}</span></div><em>{plan.distanceMeters !== undefined ? `${plan.distanceMeters.toLocaleString()}m` : "공개자료"}</em></article>)}</section>}</div>;
  }
  const base = forecast.historical.at(-1)!;
  const trendLabel = (value: number) => value > .05 ? `+${value}%` : `${value}%`;
  const changeFromBase = (value: number, original: number) => original > 0 ? (value / original - 1) * 100 : 0;
  return <div className="panel-content forecast-panel">
    <div className="section-intro"><span>SGIS TREND FORECAST</span><h2>{forecast.forecastYears[0]}~{forecast.forecastYears[2]} 3년 전망</h2><p>{forecast.areaName} · 실제 과거 통계 기반 추정</p></div>
    <div className="forecast-score-card"><div><span>성장성 참고점수</span><b>{forecast.growthScore}<small>/100</small></b></div><p>{forecast.message}</p></div>
    <div className="forecast-rate-grid">
      <article><span>거주인구 연간 변화</span><b className={forecast.annualChange.residentPopulation < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.residentPopulation)}</b></article>
      <article><span>종사자 연간 변화</span><b className={forecast.annualChange.workerPopulation < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.workerPopulation)}</b></article>
      <article><span>사업체 연간 변화</span><b className={forecast.annualChange.businesses < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.businesses)}</b></article>
    </div>
    <ForecastLines forecast={forecast} />
    <div className="forecast-years">{forecast.projected.map(point => <article key={point.year}>
      <div><span>{point.year}</span><em>추정</em></div>
      <dl><div><dt>거주인구</dt><dd>{point.residentPopulation.toLocaleString()}명 <small>{trendLabel(Math.round(changeFromBase(point.residentPopulation, base.residentPopulation) * 10) / 10)}</small></dd></div><div><dt>종사자</dt><dd>{point.workerPopulation.toLocaleString()}명 <small>{trendLabel(Math.round(changeFromBase(point.workerPopulation, base.workerPopulation) * 10) / 10)}</small></dd></div><div><dt>사업체</dt><dd>{point.businesses.toLocaleString()}개 <small>{trendLabel(Math.round(changeFromBase(point.businesses, base.businesses) * 10) / 10)}</small></dd></div></dl>
    </article>)}</div>
    <section className="forecast-history"><h3>계산에 사용한 실제 통계</h3>{forecast.historical.map(point => <div key={point.year}><b>{point.year}</b><span>거주 {point.residentPopulation.toLocaleString()}명</span><span>종사자 {point.workerPopulation.toLocaleString()}명</span><span>사업체 {point.businesses.toLocaleString()}개</span></div>)}</section>
    {analysis.developmentPlans?.status === "available" && <section className="development-list"><h3>반경 내 개발·계획 공간정보</h3>{analysis.developmentPlans.plans.slice(0, 8).map(plan => <article key={plan.id}><Building2 /><div><b>{plan.name}</b><span>{plan.category} · {plan.status}{plan.targetDate ? ` · ${plan.targetDate}` : ""}</span></div><em>{plan.distanceMeters !== undefined ? `${plan.distanceMeters.toLocaleString()}m` : "공개자료"}</em></article>)}</section>}
    <div className="forecast-warning"><AlertTriangle /><p><b>전망값은 보장 수치가 아닙니다.</b> SGIS 행정동 통계의 최근 변화량을 선형 적용한 추정치입니다. {analysis.developmentPlans?.status === "available" ? analysis.developmentPlans.score !== undefined ? `일정·진행상태가 확인된 공개 계획 ${analysis.developmentPlans.plans.length}건을 별도 성장성 신호로 반영했습니다.` : `VWorld 계획공간 ${analysis.developmentPlans.plans.length}건은 참고자료로 표시하며, 확정 일정이 없어 성장성 점수에는 반영하지 않습니다.` : "개발계획 승인키 연결 전에는 아파트 입주·재개발·교통망 계획이 포함되지 않습니다."}</p></div>
    <section className="source-note"><b>출처와 산식</b><div><span>SGIS 실제 통계</span><span>{forecast.model}</span><span>행정동 단위</span></div><small>기준연도 {forecast.baseYear}년 · 선택 반경과 행정동 범위는 일치하지 않을 수 있습니다.</small></section>
  </div>;
}

function SavedAnalysisList({ saved, onOpen, onRemove, onClear }: { saved: LocationAnalysis[]; onOpen: (analysis: LocationAnalysis) => void; onRemove: (id: string) => void; onClear: () => void }) {
  if (!saved.length) return null;
  return <section className="saved-analysis-list">
    <div><div><span>SAVED ON THIS DEVICE</span><h3>최근 분석 기록</h3></div><button type="button" onClick={onClear}>전체 삭제</button></div>
    <p>이 브라우저에만 최대 8개까지 저장됩니다.</p>
    <div>{[...saved].reverse().map(item => <article key={analysisStorageId(item)}>
      <button type="button" onClick={() => onOpen(item)}><MapPin /><span><b>{item.location.displayName.split(",")[0]}</b><small>{item.specialty} · 반경 {item.radiusMeters.toLocaleString()}m · {formatAnalysisTime(item.analyzedAt)}</small></span><strong>{item.observedScore || "—"}</strong><ChevronRight /></button>
      <button type="button" aria-label={`${item.location.displayName.split(",")[0]} 저장 기록 삭제`} onClick={() => onRemove(analysisStorageId(item))}><X /></button>
    </article>)}</div>
  </section>;
}

function ComparePanel({ saved, onOpen, onRemove, onClear }: { saved: LocationAnalysis[]; onOpen: (analysis: LocationAnalysis) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const candidates = saved.slice(-2);
  const history = <SavedAnalysisList saved={saved} onOpen={onOpen} onRemove={onRemove} onClear={onClear} />;
  if (candidates.length < 2) return <div className="panel-content"><div className="section-intro"><span>LIVE COMPARE</span><h2>후보지를 한 곳 더 분석하세요</h2><p>서로 다른 두 주소를 분석하면 실제 조회 결과를 비교합니다.</p></div><div className="honest-placeholder"><GitCompareArrows /><h3>{candidates.length ? "첫 번째 후보지가 저장되었습니다" : "비교할 후보지가 없습니다"}</h3><p>주소를 변경해 분석하기를 누르면 최근 두 후보지의 의료기관·교통·주차 데이터를 비교할 수 있습니다.</p></div>{history}</div>;
  const [a, b] = candidates;
  const rows: [string, string | number, string | number][] = [["전체 의료기관", formatCount(a, "medical"), formatCount(b, "medical")], [`${b.specialty} 검색`, formatCount(a, "matchingSpecialty"), formatCount(b, "matchingSpecialty")], ["지하철역", formatCount(a, "transit"), formatCount(b, "transit")], ["약국", formatCount(a, "pharmacy"), formatCount(b, "pharmacy")], ["주차시설", formatCount(a, "parking"), formatCount(b, "parking")], ["베타 관측점수", a.observedScore, b.observedScore]];
  return <div className="panel-content"><div className="section-intro"><span>LIVE CANDIDATE COMPARE</span><h2>실제 후보지 비교</h2><p>동일한 공개 데이터 기준으로 비교합니다.</p></div><div className="compare-head"><article><i>A</i><span>{a.specialty}</span><h3>{a.location.displayName.split(",")[0]}</h3><b>{a.observedScore}</b></article><GitCompareArrows /><article className={b.observedScore >= a.observedScore ? "recommended" : ""}><i>B</i><span>{b.specialty}</span><h3>{b.location.displayName.split(",")[0]}</h3><b>{b.observedScore}</b></article></div><div className="compare-table">{rows.map(([label, av, bv]) => <div key={label}><b>{av}</b><span>{label}</span><b>{bv}</b></div>)}</div><div className="ai-compare"><Sparkles /><div><span>비교 참고</span><p>현재 비교는 공개 지도에서 확인되는 경쟁시설과 접근성만 반영합니다. 매출·임대료·인구 데이터를 연결한 뒤 최종 후보지를 결정하세요.</p></div></div>{history}</div>;
}

export default function LocationLab() {
  const [addressInput, setAddressInput] = useState("서울특별시 강남구 테헤란로 123");
  const [specialty, setSpecialty] = useState<Specialty>("피부과");
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [analysis, setAnalysis] = useState<LocationAnalysis>(EMPTY_ANALYSIS);
  const [saved, setSaved] = useState<LocationAnalysis[]>([]);
  const [savedReady, setSavedReady] = useState(false);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [selectedPlace, setSelectedPlace] = useState<LivePlace | null>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [openingInputs, setOpeningInputs] = useState<OpeningInputs>(DEFAULT_OPENING_INPUTS);
  const [activeKinds, setActiveKinds] = useState(() => new Set(LIVE_LAYERS.map(layer => layer.id)));
  const [populationActive, setPopulationActive] = useState(true);
  const [populationDate, setPopulationDate] = useState(defaultPopulationDate);
  const [populationHour, setPopulationHour] = useState(12);
  const [populationLoading, setPopulationLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reportDownloading, setReportDownloading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const aiInsightRequestRef = useRef(0);
  const specialtySelectRef = useRef<HTMLSelectElement>(null);
  const radiusSelectRef = useRef<HTMLSelectElement>(null);
  const openPicker = (ref: { current: HTMLSelectElement | null }) => {
    const select = ref.current as (HTMLSelectElement & { showPicker?: () => void }) | null;
    if (select?.showPicker) select.showPicker();
    else { select?.focus(); select?.click(); }
  };

  const loadAiInsight = useCallback(async (source: LocationAnalysis) => {
    const requestId = ++aiInsightRequestRef.current;
    setAiLoading(true);
    try {
      const response = await fetch("/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: { ...source, places: [] } })
      });
      const interpretation = await response.json() as AiInterpretation & { error?: string };
      if (!response.ok) throw new Error(interpretation.error || "AI 해석을 불러오지 못했습니다.");
      if (requestId !== aiInsightRequestRef.current) return;
      setAnalysis(current => current.analyzedAt === source.analyzedAt ? { ...current, aiInterpretation: interpretation } : current);
      setSaved(current => mergeSavedAnalysis(current, { ...source, aiInterpretation: interpretation }));
    } catch {
      // 핵심 분석은 그대로 유지하고 서버의 다음 요청에서 안전한 대체 해석을 다시 시도합니다.
    } finally {
      if (requestId === aiInsightRequestRef.current) setAiLoading(false);
    }
  }, []);

  const runAnalysis = useCallback(async (payload: { address?: string; latitude?: number; longitude?: number; specialty?: Specialty; radiusMeters?: number }) => {
    aiInsightRequestRef.current += 1; setAiLoading(false); setLoading(true); setError(""); setSelectedPlace(null);
    try {
      const requestBody = {
        ...(typeof payload.address === "string" ? { address: payload.address } : {}),
        latitude: payload.latitude,
        longitude: payload.longitude,
        specialty: payload.specialty ?? specialty,
        radiusMeters: payload.radiusMeters ?? radiusMeters,
        populationDate,
        populationHour
      };
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "분석 데이터를 불러오지 못했습니다.");
      let result = data as LocationAnalysis;
      if (result.needsClientFetch && result.osmQuery) {
        const liveData = await fetchOsmInBrowser(result.osmQuery);
        const completedResponse = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: result.location.displayName, latitude: result.location.latitude, longitude: result.location.longitude, specialty: result.specialty, radiusMeters: result.radiusMeters, osmElements: liveData.elements || [] }) });
        const completed = await completedResponse.json();
        if (!completedResponse.ok) throw new Error(completed.error || "조회 결과를 분석하지 못했습니다.");
        result = completed as LocationAnalysis;
      }
      setAnalysis(result); setSpecialty(result.specialty); setAddressInput(result.location.displayName.split(",")[0]); setSaved(current => mergeSavedAnalysis(current, result)); setTab("overview"); setMobileFilter(false); void loadAiInsight(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "분석 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  }, [specialty, radiusMeters, populationDate, populationHour, loadAiInsight]);

  useEffect(() => { setSaved(loadSavedAnalyses()); setSavedReady(true); }, []);
  useEffect(() => { if (savedReady) storeSavedAnalyses(saved); }, [saved, savedReady]);
  useEffect(() => { void runAnalysis({ address: "서울특별시 강남구 테헤란로 123" }); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); void runAnalysis({ address: addressInput }); };
  const toggleLayer = (id: string) => setActiveKinds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const useCurrentLocation = () => navigator.geolocation?.getCurrentPosition(position => void runAnalysis({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => setError("현재 위치 권한을 확인해주세요."));
  const printReport = () => {
    setTab("overview");
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()));
  };
  const downloadReport = async () => {
    if (!analysis.analyzedAt || analysis.analyzedAt === new Date(0).toISOString()) {
      setError("주소 분석이 완료된 후 PDF 보고서를 내려받을 수 있습니다.");
      return;
    }
    setReportDownloading(true); setError("");
    try {
      const response = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, openingInputs })
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(message?.error || "PDF 보고서를 생성하지 못했습니다.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
      anchor.href = url;
      anchor.download = `the-fount-location-report-${stamp}.pdf`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "PDF 보고서를 생성하지 못했습니다.");
    } finally { setReportDownloading(false); }
  };
  const openSavedAnalysis = (item: LocationAnalysis) => {
    setAnalysis(item); setSpecialty(item.specialty); setRadiusMeters(item.radiusMeters); setAddressInput(item.location.displayName.split(",")[0]); setSelectedPlace(null); setTab("overview");
  };
  const removeSavedAnalysis = (id: string) => setSaved(current => current.filter(item => analysisStorageId(item) !== id));
  const radiusLabel = useMemo(() => radiusMeters >= 1000 ? `${radiusMeters / 1000}km` : `${radiusMeters}m`, [radiusMeters]);

  useEffect(() => {
    const administrativeCode = analysis.livingPopulation?.administrativeCode || analysis.demographics?.administrativeCode;
    if (!administrativeCode || analysis.analyzedAt === new Date(0).toISOString()) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPopulationLoading(true);
      try {
        const response = await fetch("/api/living-population", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ administrativeCode, date: populationDate, hour: populationHour, latitude: analysis.location.latitude, longitude: analysis.location.longitude, radiusMeters: analysis.radiusMeters }), signal: controller.signal });
        const result = await response.json() as LivingPopulation;
        if (response.ok) setAnalysis(current => withLivingPopulation(current, result));
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("생활인구 시간대 데이터를 갱신하지 못했습니다.");
      } finally { if (!controller.signal.aborted) setPopulationLoading(false); }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [analysis.livingPopulation?.administrativeCode, analysis.demographics?.administrativeCode, analysis.location.latitude, analysis.location.longitude, analysis.radiusMeters, populationDate, populationHour]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPopulationHour(current => current >= 23 ? 6 : current + 1), 1200);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    type Ctx = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => Promise<object> }, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as unknown as { modelContext?: Ctx }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "analyze_medical_location", title: "병원 입지 실제 데이터 분석", description: "주소와 진료과를 기준으로 실제 공개 지도 데이터를 조회합니다.", inputSchema: { type: "object", properties: { address: { type: "string", minLength: 2 }, specialty: { type: "string", enum: specialties } }, required: ["address", "specialty"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const value = input as { address?: unknown; specialty?: unknown }; if (typeof value.address !== "string" || typeof value.specialty !== "string" || !specialties.includes(value.specialty as Specialty)) throw new Error("주소와 진료과를 확인해주세요."); void runAnalysis({ address: value.address, specialty: value.specialty as Specialty }); return { status: "started", mode: "live-data", address: value.address, specialty: value.specialty }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runAnalysis]);

  return <main id="top" className="app-shell">
    <header className="app-header"><Brand /><div className="header-status"><span><i /> LIVE BETA</span><b>실제 공개 데이터 기반</b></div><nav><button disabled={reportDownloading} onClick={() => void downloadReport()}>{reportDownloading ? <Activity className="spin" /> : <Download />} PDF 다운로드</button><button className="print-action" onClick={printReport} title="현재 화면 인쇄"><Printer /> 프린트</button></nav><button className="mobile-menu" onClick={() => setMobileFilter(!mobileFilter)}>{mobileFilter ? <X /> : <Menu />}</button></header>
    <form className={`filter-bar live-filter ${mobileFilter ? "mobile-open" : ""}`} onSubmit={submit}>
      <label className="search-field"><Search /><input value={addressInput} onChange={event => setAddressInput(event.target.value)} placeholder="도로명 주소, 건물명, 역 이름 검색" /><button type="button" title="현재 위치" onClick={useCurrentLocation}><LocateFixed /></button></label>
      <div className="filter-picker"><span>진료과</span><select ref={specialtySelectRef} aria-label="진료과 선택" value={specialty} onChange={event => setSpecialty(event.target.value as Specialty)}>{specialties.map(item => <option key={item}>{item}</option>)}</select><button type="button" aria-label="진료과 메뉴 열기" onClick={() => openPicker(specialtySelectRef)}><ChevronDown /></button></div>
      <div className="filter-picker"><span>분석 반경</span><select ref={radiusSelectRef} aria-label="분석 반경 선택" value={radiusMeters} onChange={event => setRadiusMeters(Number(event.target.value))}>{[[300, "300m"], [500, "500m"], [1000, "1km"], [3000, "3km"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" aria-label="분석 반경 메뉴 열기" onClick={() => openPicker(radiusSelectRef)}><ChevronDown /></button></div>
      <label className="population-date"><span>생활인구 기준일</span><input type="date" value={populationDate} onChange={event => setPopulationDate(event.target.value)} /></label>
      <button className="analyze-button" type="submit">{loading ? <Activity className="spin" /> : <BarChart3 />} 실제 데이터 분석</button>
    </form>
    {error && <div className="error-banner"><AlertTriangle />{error}<button onClick={() => setError("")}><X /></button></div>}
    <div className="workspace">
      <section className="map-area">
        <LiveMap analysis={analysis} activeKinds={activeKinds} populationActive={populationActive} selected={selectedPlace} onPlace={place => { setSelectedPlace(place); if (place.kind === "hospital") setTab("competitors"); }} onSelectCoordinate={(latitude, longitude) => void runAnalysis({ latitude, longitude })} />
        <div className="map-summary"><span>{analysis.specialty} · 반경 {radiusLabel}</span><b>의료기관 {formatCount(analysis, "medical")}</b><em>{analysis.provider === "kakao" ? "KAKAO LIVE" : "OSM LIVE"}</em></div>
        <div className="layer-control"><button className="layer-trigger" onClick={() => setLayerOpen(!layerOpen)}><Layers3 /> 실제 지도 레이어 <b>{activeKinds.size + (populationActive ? 1 : 0)}</b><ChevronDown /></button>{layerOpen && <div className="layer-menu"><div><b>표시할 실제 데이터</b><button onClick={() => setLayerOpen(false)}><X /></button></div><label><input type="checkbox" checked={populationActive} onChange={() => setPopulationActive(current => !current)} /><i className="population-dot" /><span>서울 생활인구</span><em>{analysis.livingPopulation?.status === "available" ? "실제" : analysis.livingPopulation?.status === "not_configured" ? "연결 필요" : analysis.livingPopulation?.status === "unsupported" ? "지역 미지원" : analysis.livingPopulation?.status === "no_data" ? "자료 없음" : "확인 중"}</em></label>{LIVE_LAYERS.map(layer => <label key={layer.id}><input type="checkbox" checked={activeKinds.has(layer.id)} onChange={() => toggleLayer(layer.id)} /><i style={{ background: layer.color }} /><span>{layer.label}</span></label>)}<small>{analysis.livingPopulation?.message || "지도 클릭 시 해당 좌표를 새로 분석합니다."}</small></div>}</div>
        {analysis.livingPopulation && <div className={`timeline population-timeline ${analysis.livingPopulation.status}`}>
          <button type="button" disabled={analysis.livingPopulation.status !== "available"} onClick={() => setPlaying(current => !current)} title="시간대 재생">{populationLoading ? <Activity className="spin" /> : playing ? <Pause /> : <Play />}</button>
          <div className="time-copy"><b>{analysis.livingPopulation.status === "available" ? `${String(populationHour).padStart(2, "0")}:00` : "생활인구"}</b><span>{analysis.livingPopulation.status === "available" ? `${analysis.livingPopulation.total?.toLocaleString()}명 · ${analysis.livingPopulation.spatialUnit} ${analysis.livingPopulation.spatialUnit === "250m 격자" ? "반경 합계" : "집계"}` : analysis.livingPopulation.message}</span></div>
          {analysis.livingPopulation.status === "available" ? <><input aria-label="생활인구 시간대" type="range" min="6" max="23" value={populationHour} onChange={event => setPopulationHour(Number(event.target.value))} /><div className="time-ticks"><span>06시</span><span>12시</span><span>18시</span><span>23시</span></div></> : <div className="population-unavailable"><Users /><span>{analysis.livingPopulation.message}</span></div>}
          <small className="population-provenance">서울특별시 서울 생활인구 · {analysis.livingPopulation.referenceDate || populationDate} · {analysis.livingPopulation.spatialUnit === "250m 격자" ? "250m 격자 실제값" : "행정동 실제 총계 · 지도 격자는 시설 접근성 기반 공간분포 추정"}</small>
        </div>}
        {populationActive && analysis.livingPopulation?.status === "available" && <div className="population-density-legend"><b>{analysis.livingPopulation.spatialUnit === "250m 격자" ? "250m 격자 실제 생활인구" : "생활인구 추정 밀도지수"}</b>{analysis.livingPopulation.densityBreaks ? <><span><i className="density-low" />낮음 ≤{analysis.livingPopulation.densityBreaks[0].toLocaleString()}명</span><span><i className="density-normal" />보통 ≤{analysis.livingPopulation.densityBreaks[1].toLocaleString()}명</span><span><i className="density-high" />높음 ≤{analysis.livingPopulation.densityBreaks[2].toLocaleString()}명</span><span><i className="density-very-high" />매우 높음 &gt;{analysis.livingPopulation.densityBreaks[2].toLocaleString()}명</span><small>색상 기준은 선택 반경 내 격자 사분위수 · 격자 클릭 시 실제 숫자 확인</small></> : <><span><i className="density-low" />낮음 0–39</span><span><i className="density-normal" />보통 40–59</span><span><i className="density-high" />높음 60–79</span><span><i className="density-very-high" />매우 높음 80–100</span><small>격자 클릭 시 숫자 확인 · 행정동 실제 총계 기반 공간분포 추정</small></>}</div>}
        <div className={`live-map-note ${analysis.livingPopulation ? "with-timeline" : ""}`}><span><i className="hospital-dot" /> 의료기관</span><span><i className="pharmacy-dot" /> 약국</span><span><i className="transit-dot" /> 지하철역</span><span><i className="parking-dot" /> 주차</span>{analysis.livingPopulation?.status === "available" && <span><i className="population-dot" /> {analysis.livingPopulation.spatialUnit === "250m 격자" ? "생활인구 실제밀도" : "생활인구 추정밀도"}</span>}</div>
      </section>
      <aside className="analysis-panel">
        <div className="print-report-header"><Brand /><span>병원 입지·개원수익성 리포트</span><small>발행 {formatAnalysisTime(analysis.analyzedAt)}</small></div>
        <div className="sheet-handle" />
        <nav className="panel-tabs" aria-label="분석 결과 메뉴">
          <button type="button" className={tab === "overview" ? "active" : ""} aria-pressed={tab === "overview"} onClick={() => setTab("overview")}><BarChart3 /><span>지역분석</span></button>
          <button type="button" className={tab === "competitors" ? "active" : ""} aria-pressed={tab === "competitors"} onClick={() => setTab("competitors")}><Hospital /><span>경쟁병원</span></button>
          <button type="button" className={tab === "forecast" ? "active" : ""} aria-pressed={tab === "forecast"} onClick={() => setTab("forecast")}><TrendingUp /><span>3년전망</span></button>
          <button type="button" className={tab === "profitability" ? "active" : ""} aria-pressed={tab === "profitability"} onClick={() => setTab("profitability")}><Calculator /><span>수익성</span></button>
          <button type="button" className={tab === "compare" ? "active" : ""} aria-pressed={tab === "compare"} onClick={() => setTab("compare")}><GitCompareArrows /><span>후보지 비교</span></button>
          <button type="button" className="mobile-print mobile-download" disabled={reportDownloading} onClick={() => void downloadReport()} title="PDF 보고서 다운로드">{reportDownloading ? <Activity className="spin" /> : <Download />}</button>
          <button type="button" className="mobile-print" onClick={printReport} title="현재 화면 인쇄"><Printer /></button>
        </nav>
        <div key={tab} className="panel-view">
          {tab === "overview" && <OverviewPanel analysis={analysis} onTab={setTab} aiLoading={aiLoading} />}
          {tab === "competitors" && <CompetitorPanel analysis={analysis} selected={selectedPlace} onSelect={setSelectedPlace} />}
          {tab === "forecast" && <ForecastPanel analysis={analysis} />}
          {tab === "profitability" && <div className="panel-content"><div className="section-intro"><span>OPENING RETURN MODEL</span><h2>개원 수익성·회수기간</h2><p>후보지의 임대조건과 개원자금을 입력해 진료과별 참고값과 비교하세요.</p></div><FinancialPlanningPanel analysis={analysis} inputs={openingInputs} onChange={setOpeningInputs} /></div>}
          {tab === "compare" && <ComparePanel saved={saved} onOpen={openSavedAnalysis} onRemove={removeSavedAnalysis} onClear={() => setSaved([])} />}
        </div>
      </aside>
    </div>
    {loading && <div className="loading-mask"><div><Activity className="spin" /><b>{specialty} 주변 실제 데이터를 조회하고 있습니다</b><span>주소 좌표 · 의료기관 · 약국 · 지하철역 · 주차 · 서울 생활인구</span></div></div>}
  </main>;
}
