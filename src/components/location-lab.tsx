"use client";

import dynamic from "next/dynamic";
import { ForecastLines } from "./forecast-lines";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Check, ChevronDown, ChevronRight,
  Building2, Calculator, Coins, Download, GitCompareArrows, Hospital, Layers3,
  ExternalLink, LocateFixed, MapPin, Menu, Pause, Play, Printer, Search, ShieldCheck, Sparkles, TimerReset, TrendingUp, Users, X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { specialties, matchesSpecialty, type Specialty } from "@/data/specialties";
import type { AiInsightItem, AiInterpretation, LivingPopulation, LocationAnalysis, LiveMetric, LivePlace } from "@/data/location-types";
import { analysisStorageId, loadSavedAnalyses, mergeSavedAnalysis, storeSavedAnalyses } from "@/data/saved-analyses";
import { DEFAULT_OPENING_INPUTS, normalizeOpeningInputs, type OpeningInputs } from "@/data/opening-plan";
import { FinancialPlanningPanel } from "./financial-planning-panel";
import { ViabilityPanel } from "./viability-panel";
import { locationResult, locationNarrative } from "@/data/location-result";
import { populationScoreCap } from "@/data/location-score-v2";
import { refineClinicalAnalysis, clinicalScoreLabel } from '@/data/clinical-evaluation';
import { ForecastDrivers } from './forecast-drivers';

const LiveMap = dynamic(() => import("./live-map"), { ssr: false, loading: () => <div className="map-loading"><Activity className="spin" /> 지도를 불러오는 중</div> });

type PanelTab = "overview" | "competitors" | "forecast" | "profitability" | "compare";

const EMPTY_ANALYSIS: LocationAnalysis = {
  mode: "live", provider: "openstreetmap", analyzedAt: new Date(0).toISOString(),
  location: { displayName: "분석할 주소를 입력해주세요", latitude: 37.5665, longitude: 126.9780 },
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

async function fetchOsmInBrowser(query: string, signal?: AbortSignal) {
  const endpoints = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.osm.jp/api/interpreter"];
  for (const endpoint of endpoints) {
    try {
      signal?.throwIfAborted();
      const response = await fetch(`${endpoint}?data=${encodeURIComponent(query)}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(9000)]) : AbortSignal.timeout(9000) });
      if (response.ok) return await response.json();
    } catch { signal?.throwIfAborted(); /* CORS 또는 혼잡 시 다음 공개 서버로 전환 */ }
  }
  throw new Error("공개 지도 데이터가 혼잡합니다. 잠시 후 다시 분석해주세요.");
}

async function readAnalysisResponse<T>(response: Response, fallbackMessage: string): Promise<T> {
  const text = await response.text();
  let data: (T & { error?: string }) | null = null;
  if (text.trim()) {
    try { data = JSON.parse(text) as T & { error?: string }; }
    catch {
      throw new Error(response.status >= 500
        ? "공공데이터 연결이 평소보다 늦어지고 있습니다. 잠시 후 다시 분석해주세요."
        : fallbackMessage);
    }
  }
  if (!response.ok) {
    throw new Error(data?.error || (response.status >= 500
      ? "공공데이터 연결이 평소보다 늦어지고 있습니다. 잠시 후 다시 분석해주세요."
      : fallbackMessage));
  }
  if (!data) throw new Error(fallbackMessage);
  return data;
}

function Brand() {
  return <a className="brand fount-logo" href="/location" aria-label="입지분석 첫 화면"><span>THE</span> FOUNT<small>MEDICAL LOCATION</small></a>;
}

function MetricBars({ metrics }: { metrics: LiveMetric[] }) {
  const connected = metrics.filter((metric): metric is LiveMetric & { value: number } => metric.value !== null);
  return <div className="score-bars">{connected.map(metric => <div className="score-row" key={metric.label}>
    <span>{metric.label}</span><div><i style={{ width: `${Math.max(metric.value, 3)}%`, background: metric.color }} /></div><b>{metric.label === "경쟁환경" && metric.value === 0 ? "과밀" : metric.value}</b>
  </div>)}</div>;
}

const FACTOR_WEIGHTS: Record<string, number> = { "잠재환자 수요": 25, "경쟁환경": 20, "소비력": 15, "접근성": 15, "비용효율": 10, "성장성": 15 };

function calculateObservedScore(metrics: LiveMetric[]) {
  const connected = metrics.filter((metric): metric is LiveMetric & { value: number } => metric.value !== null);
  const totalWeight = connected.reduce((sum, metric) => sum + (FACTOR_WEIGHTS[metric.label] || 0), 0);
  if (totalWeight < 70 || !connected.some(metric => metric.label === "잠재환자 수요") || !connected.some(metric => metric.label === "경쟁환경")) return 0;
  return Math.round(connected.reduce((sum, metric) => sum + metric.value * (FACTOR_WEIGHTS[metric.label] || 0), 0) / totalWeight);
}

function DecisionEvidence({ analysis }: { analysis: LocationAnalysis }) {
  const result = locationResult(analysis);
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
    <div className="panel-title"><div><span>01 · LOCATION SUMMARY</span><h3>이 입지, 우리 병원에 맞을까요?</h3></div></div>
    <article className={`final-decision ${result.tone}`}><span>{analysis.specialty} 개원 판단</span><h3>{result.label}</h3><p>{result.text}</p></article>
    <div className="result-reasons"><b>이렇게 판단한 핵심 이유</b><ol>{result.reasons.length ? result.reasons.map(reason => <li key={reason}>{reason}</li>) : <li>주소 분석을 완료하면 확인된 지역 자료를 바탕으로 이유를 보여드립니다.</li>}</ol></div>
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
    </details>
  </section>;
}

function populationShare(value: number | undefined, total: number | undefined) {
  return value !== undefined && total ? `${Math.round(value / total * 1000) / 10}%` : "—";
}

function RegionalProfileBlock({ analysis }: { analysis: LocationAnalysis }) {
  const result = locationResult(analysis);
  const profile = analysis.regionalProfile;
  const total = analysis.demographics?.residentPopulation;
  if (!profile) return <section className="panel-section regional-profile"><div className="panel-title"><div><span>02 · PATIENTS & AREA</span><h3>이 지역에는 어떤 환자가 있나요?</h3></div></div><p className="score-disclaimer">이 지역의 연령·성별 자료가 충분하지 않아 환자층을 단정하지 않았습니다. 실제 진료 대상과 주변 주거·직장 생활권을 확인해보세요.</p></section>;
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
    <div className="panel-title"><div><span>02 · PATIENTS & AREA</span><h3>이 지역에는 어떤 환자가 있나요?</h3></div></div>
    <article className="region-character"><span>{profile.areaName} · {profile.year}년</span><h3>{profile.character}</h3></article>
    <div className="regional-facts">{facts.map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}</div>
    <details className="evidence-details"><summary>인구와 시설 자료 기준</summary><p className="factor-source">인구는 {profile.year}년 {profile.areaName} 전체 주민입니다. 학교·보육시설은 주변 {analysis.radiusMeters.toLocaleString()}m의 지도 검색 결과입니다. 표시된 연령 구간은 전체 연령을 모두 포함하지 않습니다.</p></details>
  </section>;
}

function OperatingResult({ analysis, showContractChecks = true }: { analysis: LocationAnalysis; showContractChecks?: boolean }) {
  const result = locationResult(analysis);
  return <>
    <section className="panel-section operating-result"><div className="panel-title"><div><span>03 · OPERATING CONDITIONS</span><h3>환자가 오기 쉽고, 운영하기 좋은 자리인가요?</h3></div></div>
      <MetricBars metrics={analysis.metrics} />
      <details className="evidence-details"><summary>항목별 데이터 근거 보기</summary>{analysis.metrics.filter(metric=>metric.value!==null).map(metric=><p className="factor-source" key={metric.label}><b>{metric.label}</b> · {metric.note}</p>)}</details>
    </section>
    <section className="panel-section location-narrative"><div className="panel-title"><div><span>이 자리의 특징</span><h3>{analysis.specialty} 개원 관점에서 이 지역은 어떤 곳인가요?</h3></div></div>{analysis.analyzedAt === new Date(0).toISOString() ? <p className="narrative-intro">주소 분석을 완료하거나 지도에서 지점을 선택하면 이 지역의 특징을 보여드립니다.</p> : <><p className="narrative-intro">주변 환자층, 생활시간, 같은 과 병원, 교통과 앞으로의 변화를 차례로 살펴봤습니다.</p>{locationNarrative(analysis).map(section=><article key={section.title}><h4>{section.title}</h4><p>{section.text}</p><details className="narrative-source"><summary>자료 기준 보기</summary><small>{section.source}</small></details></article>)}</>}</section>
    {showContractChecks && <section className="panel-section contract-checks"><div className="panel-title"><div><span>04 · BEFORE YOU SIGN</span><h3>계약 전에 무엇을 확인해야 하나요?</h3></div></div>
      {result.checks.map((check, index) => <article key={check.title}><h4><span>{String(index + 1).padStart(2, '0')}</span>{check.title}</h4><p>{check.action}</p><small>{check.decision}</small></article>)}
    </section>}
  </>;
}

function formatCount(analysis: LocationAnalysis, key: keyof LocationAnalysis["counts"]) {
  if (analysis.analyzedAt === new Date(0).toISOString()) return "—";
  return `${analysis.counts[key]}곳${analysis.countLimits?.[key] ? " 이상" : ""}`;
}

function withLivingPopulation(analysis: LocationAnalysis, livingPopulation: LivingPopulation): LocationAnalysis {
  const metrics = analysis.metrics.map(metric => ({ ...metric }));
  if (livingPopulation.status === "available" && livingPopulation.total !== undefined) {
    const demographicDemand = analysis.demographics ? Math.max(0, Math.min(100, Math.round(38 + (analysis.demographics.residentPopulation + analysis.demographics.workerPopulation * .55) / 1600))) : null;
    const livingDemand = Math.max(0, Math.min(100, Math.round(35 + livingPopulation.total / 900)));
    const demand = demographicDemand === null ? livingDemand : Math.round(demographicDemand * .55 + livingDemand * .45);
    metrics[0] = { ...metrics[0], value: demand, note: `${livingPopulation.referenceDate} ${String(livingPopulation.hour).padStart(2, "0")}시 생활인구 반영` };
    const observedScore = Math.min(calculateObservedScore(metrics), populationScoreCap(analysis.demographics, livingPopulation));
    return { ...analysis, livingPopulation, metrics, observedScore, grade: !observedScore ? "—" : observedScore >= 85 ? "A" : observedScore >= 75 ? "B+" : observedScore >= 65 ? "B" : "C" };
  }
  return { ...analysis, livingPopulation };
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
    <div className="ai-heading"><Sparkles /><div><span>지역 정보를 함께 살펴봤습니다</span><h3>이 지역을 쉽게 설명하면</h3></div><em className={loading ? "loading" : ""}>{loading && <Activity className="spin" />}{label}</em></div>
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

function OverviewPanel({ analysis, onTab, aiLoading, embedded = false }: { analysis: LocationAnalysis; onTab: (tab: PanelTab) => void; aiLoading: boolean; embedded?: boolean }) {
  const stats = [
    ["주변 의료기관", formatCount(analysis, "medical"), "진료시설이 모여 있는 정도"],
    [`주변 ${analysis.specialty}`, formatCount(analysis, "matchingSpecialty"), "같은 진료과와의 경쟁"],
    ["주변 약국", formatCount(analysis, "pharmacy"), "진료 뒤 약국 이용 편의"],
    ["지하철역", formatCount(analysis, "transit"), "대중교통으로 오는 길"],
    ["주차시설", formatCount(analysis, "parking"), "차량 방문 편의"],
    ["살펴본 주변 범위", `${analysis.radiusMeters.toLocaleString()}m`, "선택한 주소 주변"],
    ...(analysis.demographics ? [["이 지역 주민", `${analysis.demographics.residentPopulation.toLocaleString()}명`, analysis.demographics.areaName], ["이 지역 직장인", `${analysis.demographics.workerPopulation.toLocaleString()}명`, "사업체 종사자 수"]] : []),
    ...(analysis.livingPopulation?.status === "available" ? [["선택한 시간의 주변 인구", `${analysis.livingPopulation.total?.toLocaleString()}명`, `${String(analysis.livingPopulation.hour).padStart(2, "0")}시 기준`]] : []),
    ...(analysis.consumerPower?.status === "available" && analysis.consumerPower.percentile !== undefined ? [["지역 소비 수준", `상위 ${Math.max(1, 100 - analysis.consumerPower.percentile)}%`, "서울의 다른 지역과 비교"]] : []),
    ...(analysis.rentMarket?.status === "available" ? [["공표 상가 평당 월세", `${analysis.rentMarket.monthlyRentPerPyeongManwon?.toLocaleString()}만원`, `${analysis.rentMarket.spatialUnit || "지역 집계"} 참고값 · 계약 전 호실 견적과 비교`]] : []),
    ...(analysis.developmentPlans?.status === "available" ? [["주변에서 확인된 계획", `${analysis.developmentPlans.plans.length}건`, "진행 위치와 시기 확인"]] : [])
  ];
  return <div className="panel-content">
    {embedded && <div className="section-intro"><span>지역에서 확인한 내용</span><h2>어떤 환자가 있고, 경쟁은 어느 정도인가요?</h2></div>}
    {!embedded && <div className="location-heading"><div><span><MapPin /> {analysis.analyzedAt === new Date(0).toISOString() ? "분석할 위치" : "실제 분석 지역"}</span><h2>{analysis.location.displayName.split(",")[0]}</h2><p>{analysis.specialty} · 반경 {analysis.radiusMeters.toLocaleString()}m</p>{analysis.location.precision === "street" && <p className="location-precision-note">도로 주변을 찾았습니다. 정확한 건물 위치는 지도에서 클릭해 지정해주세요.</p>}</div></div>}
    {!embedded && <DecisionEvidence analysis={analysis} />}
    {!embedded && <div className="score-hero live-score"><div className="gauge" style={{ background: `conic-gradient(#35d0b0 0 ${analysis.observedScore}%,rgba(255,255,255,.15) ${analysis.observedScore}%)` }}><div><b>{analysis.observedScore || "—"}</b><small>/100</small></div></div><div><span>자리의 기본 조건</span><h3>{!analysis.observedScore ? "주요 지역 자료를 더 확인해야 합니다" : analysis.confidence < 90 ? "다른 자리와 비교해보세요" : `${analysis.grade} 등급`}</h3><p>{analysis.observedScore ? <>현재 확인할 수 있는 자료로 계산한 <b>참고점수</b></> : "환자 수요와 같은 과 경쟁이 확인돼야 점수를 보여드립니다."}</p></div><div className="confidence"><ShieldCheck /><span>확인한 자료</span><b>{analysis.confidence}%</b><small>자료 확보 정도</small></div></div>}
    {!embedded && analysis.observedScore > 0 && <p className="score-disclaimer">이 점수는 다른 자리와 비교할 때 참고해주세요. 실제 개원 판단은 건물과 임대 조건을 함께 확인해야 합니다.</p>}
    <div className="stats-grid">{stats.map(([label, value, meta]) => <article key={label}><span>{label}</span><b>{value}</b><small>{meta}</small></article>)}</div>
    <RegionalProfileBlock analysis={analysis} />
    <OperatingResult analysis={analysis} showContractChecks={!embedded} />
    {!embedded && <button className="profitability-entry" type="button" onClick={() => onTab("profitability")}><span><Calculator /><b>수익성은 입력값으로 직접 확인하세요</b><small>환자 수와 운영비를 입력하면 손익분기점·잔여현금·회수기간을 비교할 수 있습니다.</small></span><ChevronRight /></button>}
    {!embedded && <section className="panel-section next-step"><span>THE FOUNT NEXT STEP</span><h3>지도 결과를 실제 개원계획으로 연결하세요</h3><p>입지·개원자금·인건비·장비·세금·손익분기점을 함께 검토합니다.</p><a className="next-step-link" href="https://www.thefount.co.kr/" target="_blank" rel="noopener noreferrer">정밀 개원분석 상담하기 <ArrowRight /></a></section>}
    {!embedded && <section className="source-note"><b>확인에 사용한 자료</b><div><span>주변 지도 정보</span>{analysis.hiraMedical?.status === "available" && <span>건강보험심사평가원</span>}{analysis.demographics && <span>지역 인구 {analysis.demographics.year}</span>}{analysis.livingPopulation?.status === "available" && <span>시간대별 주변 인구</span>}{analysis.consumerPower?.status === "available" && <span>지역 소비 수준</span>}{analysis.rentMarket?.status === "available" && <span>상가 임대료</span>}{analysis.developmentPlans?.status === "available" && <span>주변 개발계획</span>}</div><small>{formatAnalysisTime(analysis.analyzedAt)} 기준 · 공개자료의 등록 시점에 따라 실제 현장과 차이가 있을 수 있습니다.</small></section>}
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
  const hospitals = analysis.places.filter(place => place.kind === "hospital" && matchesSpecialty(place.name, place.specialty, analysis.specialty)).sort((a, b) => a.distanceMeters - b.distanceMeters);
  const current = hospitals.find(place => place.id === selected?.id) || hospitals[0];
  const analyzed = analysis.analyzedAt !== new Date(0).toISOString();
  return <div className="panel-content"><div className="section-intro"><span>주변의 같은 진료과</span><h2>{analysis.specialty === "기타" ? "전체 의료기관" : `${analysis.specialty} 경쟁병원`} {analyzed ? `${hospitals.length}곳` : "분석 대기"}</h2><p>선택한 주소에서 {analysis.radiusMeters.toLocaleString()}m 안에 있는 같은 진료과를 보여드립니다.</p><small className="source-split">병원 이름과 등록 분류를 기준으로 찾았습니다. 실제 진료내용과 전문의 여부는 해당 병원에서 다시 확인해주세요.</small>{analysis.specialty === "비뇨기과" && <small className="source-split">‘비뇨기과’와 ‘비뇨의학과’ 명칭을 함께 찾습니다.</small>}</div>
    <p className="source-split">{!analyzed ? '아직 주소를 분석하지 않았습니다.' : `지도에서 확인한 ${hospitals.length}곳의 목록입니다.${(analysis.mapCountLimits || analysis.countLimits)?.matchingSpecialty ? ' 검색 제공자의 한도에 도달해 추가 기관이 누락될 수 있습니다.' : ''}${analysis.hiraMedical?.matchingSpecialtyCount !== undefined ? ` HIRA 신고 기준은 ${analysis.hiraMedical.matchingSpecialtyCount}곳이며, 등록 시점·기관 분류가 달라 지도 목록과 일치하지 않을 수 있습니다.` : ''} 기존 병원의 주소를 분석하면 그 병원도 목록에 포함될 수 있습니다.`}</p>
    {current && <><div className="hospital-detail"><div className="hospital-avatar"><Hospital /></div><div><span>선택한 실제 의료기관</span><h3>{current.name}</h3><p>{current.specialty || "의료기관"} · {current.distanceMeters.toLocaleString()}m</p></div><b>LIVE</b></div><div className="detail-grid"><span>거리 <b>{current.distanceMeters.toLocaleString()}m</b></span><span>출처 <b>{analysis.provider === "kakao" ? "Kakao" : "OSM"}</b></span><span className="wide">주소 <b>{current.address || "공개 주소 없음"}</b></span></div></>}
    <div className="list-heading"><h3>거리순 의료기관</h3><span>{hospitals.length > 40 ? `가까운 40곳 / 전체 ${hospitals.length}곳 · 카카오맵에서 보기` : "클릭하면 카카오맵에서 열립니다"}</span></div><div className="hospital-list">{hospitals.length ? hospitals.slice(0, 40).map(place => <a key={place.id} href={kakaoPlaceLink(place)} target="_blank" rel="noopener noreferrer" aria-label={`${place.name} 카카오맵에서 보기 (새 탭)`} className={current?.id === place.id ? "active" : ""} onClick={() => onSelect(place)}><span className="dot age-fresh" /><div><b>{place.name}</b><small>{place.specialty || "의료기관"} · {place.distanceMeters.toLocaleString()}m</small></div><strong>{place.distanceMeters}m</strong><ExternalLink /></a>) : <div className="empty-state">{!analyzed ? "주소를 입력한 뒤 분석하기를 눌러주세요." : "지도 검색에서 확인된 기관이 없습니다. 실제 기관 부재를 뜻하지 않으며 HIRA 자료와 현장을 함께 확인해주세요."}</div>}</div>
  </div>;
}

function DevelopmentOutlook({ analysis }: { analysis: LocationAnalysis }) {
  const data = analysis.developmentPlans;
  if (!data || data.status !== "available" || !data.plans.length) return null;
  const currentYear = new Date().getFullYear();
  const scheduled = data.plans.filter(plan => {
    if (plan.evidenceLevel) return plan.evidenceLevel === "confirmed_schedule";
    const years = Array.from((plan.targetDate || "").matchAll(/(?:19|20)\d{2}/g), match => Number(match[0]));
    return years.some(year => year >= currentYear && year <= currentYear + 3) && /확정|승인|착공|공사|진행|예정/i.test(plan.status);
  });
  const references = data.plans.filter(plan => !scheduled.includes(plan));
  const impactLabel = (impact?: string) => impact === "housing" ? "주거·입주" : impact === "transport" ? "교통" : impact === "commercial" ? "업무·상업" : impact === "renewal" ? "정비사업" : "지역계획";
  return <section className="development-outlook">
    <div className="development-outlook-heading"><div><span>DEVELOPMENT OUTLOOK</span><h3>주변 개발계획을 나누어 확인했습니다</h3></div><b>{data.plans.length}건</b></div>
    <div className="development-outlook-summary">
      <article className={scheduled.length ? "active" : ""}><span>일정까지 확인된 계획</span><b>{scheduled.length}건</b><p>{scheduled.length ? "3년 전망의 보조 신호로 반영" : "현재 점수에 더한 계획 없음"}</p></article>
      <article><span>계획구역·검토 단계</span><b>{references.length}건</b><p>점수에 더하지 않고 참고만 표시</p></article>
    </div>
    <div className="development-list">{data.plans.slice(0, 8).map(plan => {
      const reflected = scheduled.includes(plan);
      return <article key={plan.id} className={reflected ? "reflected" : "reference"}><Building2 /><div><b>{plan.name}</b><span>{impactLabel(plan.impact)} · {plan.category} · {plan.status}{plan.targetDate ? ` · ${plan.targetDate}` : " · 일정 미확인"}</span></div><em>{reflected ? "전망 반영" : plan.distanceMeters !== undefined ? `${plan.distanceMeters.toLocaleString()}m` : "참고"}</em></article>;
    })}</div>
    <small>{data.scoreBasis || "일정과 진행상태가 함께 확인된 계획만 성장성 판단에 반영합니다."}</small>
  </section>;
}

function ForecastPanel({ analysis }: { analysis: LocationAnalysis }) {
  const forecast = analysis.growthForecast;
  if (!forecast || forecast.status !== "available") {
    return <div className="panel-content"><div className="section-intro"><span>앞으로의 변화</span><h2>3년 뒤 모습을 계산할 자료가 부족합니다</h2><p>확인되지 않은 전망을 임의로 보여드리지 않습니다.</p></div><div className="honest-placeholder"><BarChart3 /><h3>최근 몇 년의 지역 변화가 더 필요합니다</h3><p>{forecast?.message || "이 지역의 연도별 인구·직장인·사업체 변화를 아직 충분히 확인하지 못했습니다."}</p><ul><li>새 아파트 입주와 주택 공급</li><li>재개발·재건축·신축건물</li><li>새 지하철과 도로 계획</li><li>병원의 개원·폐업 흐름</li></ul></div><DevelopmentOutlook analysis={analysis} /></div>;
  }
  const base = forecast.historical.at(-1)!;
  const trendLabel = (value: number) => value > .05 ? `+${value}%` : `${value}%`;
  const changeFromBase = (value: number, original: number) => original > 0 ? (value / original - 1) * 100 : 0;
  return <div className="panel-content forecast-panel">
    <div className="section-intro"><span>앞으로의 지역 변화</span><h2>{forecast.forecastYears[0]}~{forecast.forecastYears[2]} 3년 전망</h2><p>{forecast.areaName}의 최근 인구와 직장인 변화를 바탕으로 계산했습니다.</p></div>
    <div className="forecast-score-card"><div><span>성장성 참고점수</span><b>{forecast.growthScore}<small>/100</small></b></div><p>{forecast.message}</p></div>
    <div className="forecast-rate-grid">
      <article><span>거주인구 연간 변화</span><b className={forecast.annualChange.residentPopulation < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.residentPopulation)}</b></article>
      <article><span>이 지역 직장인 연간 변화</span><b className={forecast.annualChange.workerPopulation < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.workerPopulation)}</b></article>
      <article><span>사업체 연간 변화</span><b className={forecast.annualChange.businesses < 0 ? "down" : "up"}>{trendLabel(forecast.annualChange.businesses)}</b></article>
    </div>
    <ForecastLines forecast={forecast} />
    <ForecastDrivers analysis={analysis} />
    <div className="forecast-years">{forecast.projected.map(point => <article key={point.year}>
      <div><span>{point.year}</span><em>추정</em></div>
      <dl><div><dt>거주인구</dt><dd>{point.residentPopulation.toLocaleString()}명 <small>{trendLabel(Math.round(changeFromBase(point.residentPopulation, base.residentPopulation) * 10) / 10)}</small></dd></div><div><dt>이 지역 직장인</dt><dd>{point.workerPopulation.toLocaleString()}명 <small>{trendLabel(Math.round(changeFromBase(point.workerPopulation, base.workerPopulation) * 10) / 10)}</small></dd></div><div><dt>사업체</dt><dd>{point.businesses.toLocaleString()}개 <small>{trendLabel(Math.round(changeFromBase(point.businesses, base.businesses) * 10) / 10)}</small></dd></div></dl>
    </article>)}</div>
    <section className="forecast-history"><h3>계산에 사용한 실제 통계</h3>{forecast.historical.map(point => <div key={point.year}><b>{point.year}</b><span>거주 {point.residentPopulation.toLocaleString()}명</span><span>이 지역 직장인 {point.workerPopulation.toLocaleString()}명</span><span>사업체 {point.businesses.toLocaleString()}개</span></div>)}</section>
    <DevelopmentOutlook analysis={analysis} />
    <div className="forecast-warning"><AlertTriangle /><p><b>통계 전망과 개발계획은 다르게 계산합니다.</b> 인구·직장인·사업체는 SGIS의 최근 변화 흐름을 적용한 추정치입니다. 개발계획은 일정과 진행상태가 함께 확인된 경우에만 보조 신호로 반영하고, 계획구역 지정만 확인된 자료는 점수에 더하지 않습니다.</p></div>
    <section className="source-note"><b>출처와 산식</b><div><span>SGIS 실제 통계</span><span>{forecast.model}</span><span>행정동 단위</span></div><small>기준연도 {forecast.baseYear}년 · 선택 반경과 행정동 범위는 일치하지 않을 수 있습니다.</small></section>
  </div>;
}

function SavedAnalysisList({ saved, onOpen, onRemove, onClear }: { saved: LocationAnalysis[]; onOpen: (analysis: LocationAnalysis) => void; onRemove: (id: string) => void; onClear: () => void }) {
  if (!saved.length) return null;
  return <section className="saved-analysis-list">
    <div><div><span>SAVED ON THIS DEVICE</span><h3>최근 분석 기록</h3></div><button type="button" onClick={onClear}>전체 삭제</button></div>
    <p>이 브라우저에만 최대 8개까지 저장됩니다.</p>
    <div>{[...saved].reverse().map(item => <article key={analysisStorageId(item)}>
      <button type="button" onClick={() => onOpen(item)}><MapPin /><span><b>{item.location.displayName.split(",")[0]}</b><small>{item.specialty} · 반경 {item.radiusMeters.toLocaleString()}m · {formatAnalysisTime(item.analyzedAt)}</small></span><strong>{clinicalScoreLabel(refineClinicalAnalysis(item))}</strong><ChevronRight /></button>
      <button type="button" aria-label={`${item.location.displayName.split(",")[0]} 저장 기록 삭제`} onClick={() => onRemove(analysisStorageId(item))}><X /></button>
    </article>)}</div>
  </section>;
}

function ComparePanel({ saved, onOpen, onRemove, onClear }: { saved: LocationAnalysis[]; onOpen: (analysis: LocationAnalysis) => void; onRemove: (id: string) => void; onClear: () => void }) {
  const [candidateIds, setCandidateIds] = useState<{ a?: string; b?: string }>({});
  const [pickerSlot, setPickerSlot] = useState<"a" | "b" | null>(null);
  useEffect(() => {
    const ids = saved.map(analysisStorageId);
    setCandidateIds(current => {
      const currentA = current.a && ids.includes(current.a) ? current.a : undefined;
      const currentB = current.b && ids.includes(current.b) && current.b !== currentA ? current.b : undefined;
      if (currentA && (currentB || ids.length < 2)) return { a: currentA, b: currentB };
      return ids.length >= 2 ? { a: ids.at(-2), b: ids.at(-1) } : { a: ids[0] };
    });
  }, [saved]);

  const selectCandidate = (slot: "a" | "b", item: LocationAnalysis) => {
    const id = analysisStorageId(item);
    setCandidateIds(current => slot === "a"
      ? { a: id, b: current.b === id ? undefined : current.b }
      : { a: current.a === id ? undefined : current.a, b: id });
    setPickerSlot(null);
  };
  const candidateA = saved.find(item => analysisStorageId(item) === candidateIds.a);
  const candidateB = saved.find(item => analysisStorageId(item) === candidateIds.b);
  const history = <SavedAnalysisList saved={saved} onOpen={onOpen} onRemove={onRemove} onClear={onClear} />;
  const renderCandidate = (slot: "a" | "b", item?: LocationAnalysis, recommended = false) => <button type="button" className={`compare-candidate ${recommended ? "recommended" : ""}`} onClick={() => setPickerSlot(slot)}>
    <i>{slot.toUpperCase()}</i>{item ? <><span>{item.specialty}</span><h3>{item.location.displayName.split(",")[0]}</h3><b>{clinicalScoreLabel(refineClinicalAnalysis(item))}</b><small>눌러서 후보지 변경</small></> : <><span>후보지 선택</span><h3>분석 기록에서 선택하세요</h3><b>＋</b><small>눌러서 선택</small></>}
  </button>;
  const picker = pickerSlot && <section className="compare-candidate-picker">
    <div><div><span>{pickerSlot.toUpperCase()} CANDIDATE</span><h3>{pickerSlot.toUpperCase()} 후보지 선택</h3></div><button type="button" aria-label="후보지 선택 닫기" onClick={() => setPickerSlot(null)}><X /></button></div>
    <p>최근 분석 기록에서 비교할 장소를 선택하세요.</p>
    <div>{[...saved].reverse().map(item => {
      const id = analysisStorageId(item);
      const selected = candidateIds[pickerSlot] === id;
      const usedByOther = pickerSlot === "a" ? candidateIds.b === id : candidateIds.a === id;
      return <button type="button" key={id} disabled={usedByOther} className={selected ? "selected" : ""} onClick={() => selectCandidate(pickerSlot, item)}>
        <MapPin /><span><b>{item.location.displayName.split(",")[0]}</b><small>{item.specialty} · 반경 {item.radiusMeters.toLocaleString()}m</small></span><strong>{clinicalScoreLabel(refineClinicalAnalysis(item))}</strong>{selected ? <Check /> : <ChevronRight />}
      </button>;
    })}</div>
  </section>;

  if (!candidateA || !candidateB) return <div className="panel-content"><div className="section-intro"><span>후보지 나란히 보기</span><h2>비교할 두 후보지를 선택하세요</h2><p>후보지 박스를 누르면 기존 분석 기록에서 장소를 선택할 수 있습니다.</p></div><div className="compare-head">{renderCandidate("a", candidateA)}<GitCompareArrows />{renderCandidate("b", candidateB)}</div>{picker}<div className="honest-placeholder"><GitCompareArrows /><h3>{saved.length ? "비교할 후보지가 한 곳 더 필요합니다" : "아직 분석 기록이 없습니다"}</h3><p>주소를 분석한 뒤 후보지 박스를 눌러 A와 B를 선택하세요.</p></div>{history}</div>;

  const a = refineClinicalAnalysis(candidateA);
  const b = refineClinicalAnalysis(candidateB);
  const metricLabels = ["잠재환자 수요", "경쟁환경", "접근성", "비용효율", "성장성"];
  const metricRows = metricLabels.map(label => ({ label, a: a.metrics.find(metric => metric.label === label)?.value, b: b.metrics.find(metric => metric.label === label)?.value }));
  const rows: [string, string | number, string | number][] = [["전체 의료기관", formatCount(a, "medical"), formatCount(b, "medical")], [`${b.specialty} 경쟁병원`, formatCount(a, "matchingSpecialty"), formatCount(b, "matchingSpecialty")], ["지하철역", formatCount(a, "transit"), formatCount(b, "transit")], ["약국", formatCount(a, "pharmacy"), formatCount(b, "pharmacy")], ["주차시설", formatCount(a, "parking"), formatCount(b, "parking")]];
  return <div className="panel-content"><div className="section-intro"><span>후보지 나란히 보기</span><h2>두 후보지 비교</h2><p>후보지 박스를 누르면 기존 분석 기록에서 비교 장소를 바꿀 수 있습니다.</p></div><div className="compare-head">{renderCandidate("a", a)}<GitCompareArrows />{renderCandidate("b", b, b.observedScore >= a.observedScore + 3)}</div>{picker}<section className="compare-score-chart"><div className="compare-chart-heading"><div><span>LOCATION SCORE</span><h3>핵심 입지점수 비교</h3></div><div><i className="candidate-a" />A<i className="candidate-b" />B</div></div>{metricRows.map(row => <div className="compare-metric-row" key={row.label}><span>{row.label}</span><div className="compare-metric-bar candidate-a"><i style={{ width: `${row.a ?? 0}%` }} /><b>{row.a ?? "—"}</b></div><div className="compare-metric-bar candidate-b"><i style={{ width: `${row.b ?? 0}%` }} /><b>{row.b ?? "—"}</b></div></div>)}</section><section className="compare-facilities"><h3>주변 조건 비교</h3><div className="compare-table">{rows.map(([label, av, bv]) => <div key={label}><b>{av}</b><span>{label}</span><b>{bv}</b></div>)}</div></section><div className="ai-compare"><Sparkles /><div><span>비교할 때 참고하세요</span><p>점수가 높은 항목만 보지 말고 선택한 진료과의 환자 수요, 경쟁 강도와 실제 월세를 함께 비교하세요.</p></div></div>{history}</div>;
}

export default function LocationLab() {
  const [addressInput, setAddressInput] = useState("");
  const [specialty, setSpecialty] = useState<Specialty>("피부과");
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [rawAnalysis, setAnalysis] = useState<LocationAnalysis>(EMPTY_ANALYSIS);
  const analysis = useMemo(() => refineClinicalAnalysis(rawAnalysis), [rawAnalysis]);
  const [saved, setSaved] = useState<LocationAnalysis[]>([]);
  const [savedReady, setSavedReady] = useState(false);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [selectedPlace, setSelectedPlace] = useState<LivePlace | null>(null);
  const [layerOpen, setLayerOpen] = useState(false);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSeconds, setLoadingSeconds] = useState(0);
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
  const analysisRequestRef = useRef(0);
  const analysisAbortRef = useRef<AbortController | null>(null);
  const specialtySelectRef = useRef<HTMLSelectElement>(null);
  const radiusSelectRef = useRef<HTMLSelectElement>(null);
  const analysisPanelRef = useRef<HTMLElement>(null);
  const changeTab = useCallback((nextTab: PanelTab) => {
    setTab(nextTab);
    requestAnimationFrame(() => {
      const panel = analysisPanelRef.current;
      if (!panel) return;

      if (window.matchMedia("(max-width: 800px)").matches) {
        const tabs = panel.querySelector<HTMLElement>(".panel-tabs");
        if (!tabs) return;
        const stickyHeaderHeight = 58;
        const top = window.scrollY + tabs.getBoundingClientRect().top - stickyHeaderHeight;
        window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        return;
      }

      panel.scrollTo({ top: 0, behavior: "auto" });
    });
  }, []);
  const openPicker = (ref: { current: HTMLSelectElement | null }) => {
    const select = ref.current as (HTMLSelectElement & { showPicker?: () => void }) | null;
    if (select?.showPicker) select.showPicker();
    else { select?.focus(); select?.click(); }
  };

  const loadAiInsight = useCallback(async (source: LocationAnalysis) => {
    const requestId = ++aiInsightRequestRef.current;
    setAiLoading(true);
    try {
      const response = await fetch("/location/api/ai-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: { ...source, places: [] }, language: document.documentElement.lang })
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

  useEffect(() => {
    if (rawAnalysis.mode !== "live" || rawAnalysis.analyzedAt === new Date(0).toISOString()) return;
    const refreshLanguage = () => { void loadAiInsight(rawAnalysis); };
    document.addEventListener("fount-language-change", refreshLanguage);
    return () => document.removeEventListener("fount-language-change", refreshLanguage);
  }, [rawAnalysis, loadAiInsight]);

  const runAnalysis = useCallback(async (payload: { address?: string; latitude?: number; longitude?: number; specialty?: Specialty; radiusMeters?: number }) => {
    const requestId = ++analysisRequestRef.current;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    aiInsightRequestRef.current += 1; setAiLoading(false); setLoading(true); setLoadingSeconds(0); setError(""); setSelectedPlace(null);
    // 새 주소 분석은 이전에 입력했던 운영조건을 이어받지 않고 표준 예시부터 시작합니다.
    setOpeningInputs({ ...DEFAULT_OPENING_INPUTS });
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
      const response = await fetch("/location/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(requestBody), signal: controller.signal });
      let result = await readAnalysisResponse<LocationAnalysis>(response, "분석 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.");
      if (result.needsClientFetch && result.osmQuery) {
        const liveData = await fetchOsmInBrowser(result.osmQuery, controller.signal);
        const completedResponse = await fetch("/location/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: result.location.displayName, latitude: result.location.latitude, longitude: result.location.longitude, specialty: result.specialty, radiusMeters: result.radiusMeters, osmElements: liveData.elements || [] }), signal: controller.signal });
        result = await readAnalysisResponse<LocationAnalysis>(completedResponse, "조회 결과를 분석하지 못했습니다. 잠시 후 다시 시도해주세요.");
      }
      if (requestId !== analysisRequestRef.current || controller.signal.aborted) return;
      setAnalysis(result); setSpecialty(result.specialty); setAddressInput(result.location.displayName.split(",")[0]); setSaved(current => mergeSavedAnalysis(current, result)); setTab("overview"); setMobileFilter(false); void loadAiInsight(result);
    } catch (caught) { if (requestId === analysisRequestRef.current && !controller.signal.aborted) setError(caught instanceof Error ? caught.message : "분석 중 오류가 발생했습니다."); }
    finally { if (requestId === analysisRequestRef.current) setLoading(false); }
  }, [specialty, radiusMeters, populationDate, populationHour, loadAiInsight]);

  useEffect(() => () => { analysisAbortRef.current?.abort(); aiInsightRequestRef.current += 1; }, []);

  useEffect(() => {
    if (!loading) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setLoadingSeconds(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => { setSaved(loadSavedAnalyses()); setSavedReady(true); }, []);
  useEffect(() => { if (savedReady) storeSavedAnalyses(saved); }, [saved, savedReady]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const address = addressInput.trim();
    if (!address) {
      setError("분석할 주소나 건물 이름을 입력해주세요.");
      return;
    }
    void runAnalysis({ address });
  };
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
      const response = await fetch("/location/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, openingInputs: normalizeOpeningInputs(openingInputs) })
      });
      if (!response.ok) {
        const message = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(message?.error || (response.status === 413 ? "보고서 분량이 큽니다. 분석 반경을 줄인 뒤 다시 시도해주세요." : response.status === 504 ? "보고서 생성 시간이 초과되었습니다. 잠시 후 다시 시도해주세요." : `보고서를 생성하지 못했습니다. 다시 시도해주세요. (오류 ${response.status})`));
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
    setAnalysis(item); setSpecialty(item.specialty); setRadiusMeters(item.radiusMeters); setAddressInput(item.location.displayName.split(",")[0]); setOpeningInputs({...DEFAULT_OPENING_INPUTS}); setSelectedPlace(null); setTab("overview");
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
        const response = await fetch("/location/api/living-population", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ administrativeCode, date: populationDate, hour: populationHour, latitude: analysis.location.latitude, longitude: analysis.location.longitude, radiusMeters: analysis.radiusMeters }), signal: controller.signal });
        const result = await response.json() as LivingPopulation;
        if (response.ok && !controller.signal.aborted) setAnalysis(current => current.location.latitude === analysis.location.latitude && current.location.longitude === analysis.location.longitude && current.radiusMeters === analysis.radiusMeters ? withLivingPopulation(current, result) : current);
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
    <header className="app-header"><Brand /><div className="header-status"><span><i /> 실시간 분석</span><h1 style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>병원 입지분석</h1></div><nav><button disabled={reportDownloading} onClick={() => void downloadReport()}>{reportDownloading ? <Activity className="spin" /> : <Download />} <span className="report-download-label">분석레포트 다운로드</span></button><button className="print-action" onClick={printReport} title="현재 화면 인쇄"><Printer /> 프린트</button></nav><a className="fount-home-link" href="https://www.thefount.co.kr/">더파운트 홈페이지 ↗</a><button aria-label={mobileFilter ? "검색 조건 닫기" : "검색 조건 열기"} aria-expanded={mobileFilter} className="mobile-menu" onClick={() => setMobileFilter(!mobileFilter)}>{mobileFilter ? <X /> : <Menu />}</button></header>
    <form className={`filter-bar live-filter ${mobileFilter ? "mobile-open" : ""}`} onSubmit={submit}>
      <label className="search-field"><Search /><input aria-label="분석할 주소" value={addressInput} onChange={event => setAddressInput(event.target.value)} placeholder="알아볼 주소나 건물 이름을 입력하세요" /><button type="button" aria-label="현재 위치로 분석" title="현재 위치" onClick={useCurrentLocation}><LocateFixed /></button></label>
      <div className="filter-picker"><span>진료과</span><select ref={specialtySelectRef} aria-label="진료과 선택" value={specialty} onChange={event => setSpecialty(event.target.value as Specialty)}>{specialties.map(item => <option key={item}>{item}</option>)}</select><button type="button" aria-label="진료과 메뉴 열기" onClick={() => openPicker(specialtySelectRef)}><ChevronDown /></button></div>
      <div className="filter-picker"><span>주변 범위</span><select ref={radiusSelectRef} aria-label="주변 범위 선택" value={radiusMeters} onChange={event => setRadiusMeters(Number(event.target.value))}>{[[300, "가까운 주변 300m"], [500, "걸어서 약 7분 500m"], [1000, "주변 생활권 1km"], [3000, "넓은 지역 3km"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" aria-label="주변 범위 메뉴 열기" onClick={() => openPicker(radiusSelectRef)}><ChevronDown /></button></div>
      <button className="analyze-button" type="submit">{loading ? <Activity className="spin" /> : <BarChart3 />} 이 주소 분석하기</button>
    </form>
    {error && <div className="error-banner" role="alert" aria-live="assertive"><AlertTriangle /><span>{error}</span><button aria-label="오류 안내 닫기" onClick={() => setError("")}><X /></button></div>}
    <div className="workspace">
      <section className="map-area">
        <LiveMap analysis={analysis} activeKinds={activeKinds} populationActive={populationActive} selected={selectedPlace} onPlace={place => { setSelectedPlace(place); if (place.kind === "hospital") setTab("competitors"); }} onSelectCoordinate={(latitude, longitude) => void runAnalysis({ latitude, longitude })} />
        <div className="map-summary"><span>{analysis.specialty} · 주변 {radiusLabel}</span><b>의료기관 {formatCount(analysis, "medical")}</b><em>지도 정보</em></div>
<div className="layer-control"><button className="layer-trigger" onClick={() => setLayerOpen(!layerOpen)}><Layers3 /> 지도에서 볼 정보 <b>{activeKinds.size + (populationActive ? 1 : 0)}</b><ChevronDown /></button>{layerOpen && <div className="layer-menu"><div><b>지도에서 볼 정보</b><button onClick={() => setLayerOpen(false)}><X /></button></div><label><input type="checkbox" checked={populationActive} onChange={() => setPopulationActive(current => !current)} /><i className="population-dot" /><span>시간대별 주변 인구</span><em>{analysis.livingPopulation?.status === "available" ? "확인됨" : analysis.livingPopulation?.status === "not_configured" ? "준비 중" : analysis.livingPopulation?.status === "unsupported" ? "제공 지역 아님" : analysis.livingPopulation?.status === "no_data" ? "자료 없음" : "확인 중"}</em></label>{LIVE_LAYERS.map(layer => <label key={layer.id}><input type="checkbox" checked={activeKinds.has(layer.id)} onChange={() => toggleLayer(layer.id)} /><i style={{ background: layer.color }} /><span>{layer.label}</span></label>)}<small>{analysis.livingPopulation?.message || "지도에서 원하는 곳을 누른 뒤 ‘이 지역 분석하기’를 선택하세요."}</small></div>}</div>
        {analysis.livingPopulation && <div className={`timeline population-timeline ${analysis.livingPopulation.status}`}>
          <button type="button" disabled={analysis.livingPopulation.status !== "available"} onClick={() => setPlaying(current => !current)} title="시간대 재생">{populationLoading ? <Activity className="spin" /> : playing ? <Pause /> : <Play />}</button>
          <div className="time-copy"><b>{analysis.livingPopulation.status === "available" ? `${String(populationHour).padStart(2, "0")}:00` : "생활인구"}</b><span>{analysis.livingPopulation.status === "available" ? `${analysis.livingPopulation.total?.toLocaleString()}명 · ${analysis.livingPopulation.spatialUnit} ${analysis.livingPopulation.spatialUnit === "250m 격자" ? "반경 합계" : "집계"}` : analysis.livingPopulation.message}</span></div>
          {analysis.livingPopulation.status === "available" ? <><input aria-label="생활인구 시간대" type="range" min="6" max="23" value={populationHour} onChange={event => setPopulationHour(Number(event.target.value))} /><div className="time-ticks"><span>06시</span><span>12시</span><span>18시</span><span>23시</span></div></> : <div className="population-unavailable"><Users /><span>{analysis.livingPopulation.message}</span></div>}
          <small className="population-provenance">서울특별시 서울 생활인구 · {analysis.livingPopulation.referenceDate || populationDate} · {analysis.livingPopulation.spatialUnit === "250m 격자" ? "250m 격자 실제값" : "행정동 실제 총계 · 지도 격자는 시설 접근성 기반 공간분포 추정"}</small>
        </div>}
        {populationActive && analysis.livingPopulation?.status === "available" && <div className="population-density-legend"><b>{analysis.livingPopulation.spatialUnit === "250m 격자" ? "250m 격자 실제 생활인구" : "생활인구 추정 밀도지수"}</b>{analysis.livingPopulation.densityBreaks ? <><span><i className="density-low" />낮음 ≤{analysis.livingPopulation.densityBreaks[0].toLocaleString()}명</span><span><i className="density-normal" />보통 ≤{analysis.livingPopulation.densityBreaks[1].toLocaleString()}명</span><span><i className="density-high" />높음 ≤{analysis.livingPopulation.densityBreaks[2].toLocaleString()}명</span><span><i className="density-very-high" />매우 높음 &gt;{analysis.livingPopulation.densityBreaks[2].toLocaleString()}명</span><small>색상 기준은 선택 반경 내 격자 사분위수 · 격자 클릭 시 실제 숫자 확인</small></> : <><span><i className="density-low" />낮음 0–39</span><span><i className="density-normal" />보통 40–59</span><span><i className="density-high" />높음 60–79</span><span><i className="density-very-high" />매우 높음 80–100</span><small>격자 클릭 시 숫자 확인 · 행정동 실제 총계 기반 공간분포 추정</small></>}</div>}
        <div className={`live-map-note ${analysis.livingPopulation ? "with-timeline" : ""}`}><span><i className="hospital-dot" /> 의료기관</span><span><i className="pharmacy-dot" /> 약국</span><span><i className="transit-dot" /> 지하철역</span><span><i className="parking-dot" /> 주차</span>{analysis.livingPopulation?.status === "available" && <span><i className="population-dot" /> 시간대별 인구 분포</span>}</div>
      </section>
      <aside ref={analysisPanelRef} className="analysis-panel">
        <div className="print-report-header"><Brand /><span>병원 입지·개원수익성 리포트</span><small>발행 {formatAnalysisTime(analysis.analyzedAt)}</small></div>
        <div className="sheet-handle" />
        <nav className="panel-tabs" aria-label="분석 결과 메뉴">
          <button type="button" className={tab === "overview" ? "active" : ""} aria-pressed={tab === "overview"} onClick={() => changeTab("overview")}><BarChart3 /><span>입지·개원 판단</span></button>
          <button type="button" className={tab === "competitors" ? "active" : ""} aria-pressed={tab === "competitors"} onClick={() => changeTab("competitors")}><Hospital /><span>경쟁병원</span></button>
          <button type="button" className={tab === "forecast" ? "active" : ""} aria-pressed={tab === "forecast"} onClick={() => changeTab("forecast")}><TrendingUp /><span>3년전망</span></button>
          <button type="button" className={tab === "profitability" ? "active" : ""} aria-pressed={tab === "profitability"} onClick={() => changeTab("profitability")}><Calculator /><span>수익성</span></button>
          <button type="button" className={tab === "compare" ? "active" : ""} aria-pressed={tab === "compare"} onClick={() => changeTab("compare")}><GitCompareArrows /><span>후보지 비교</span></button>
        </nav>
        <div key={tab} className="panel-view">
          {tab === "overview" && <><ViabilityPanel analysis={analysis} inputs={openingInputs} mode="summary" /><OverviewPanel analysis={analysis} onTab={changeTab} aiLoading={aiLoading} embedded /><ViabilityPanel key={`${analysis.location.latitude}:${analysis.location.longitude}:${analysis.specialty}`} analysis={analysis} inputs={openingInputs} onLoad={openSavedAnalysis} onOpenProfitability={() => changeTab("profitability")} mode="details" /></>}
          {tab === "competitors" && <CompetitorPanel analysis={analysis} selected={selectedPlace} onSelect={setSelectedPlace} />}
          {tab === "forecast" && <ForecastPanel analysis={analysis} />}
          {tab === "profitability" && <div className="panel-content"><FinancialPlanningPanel analysis={analysis} inputs={openingInputs} onChange={setOpeningInputs} /></div>}
          {tab === "compare" && <ComparePanel saved={saved} onOpen={openSavedAnalysis} onRemove={removeSavedAnalysis} onClear={() => setSaved([])} />}
        </div>
      </aside>
    </div>
    {loading && <div className="loading-mask" role="status" aria-live="polite"><div className="analysis-loading-card">
      <div className="analysis-loading-icon"><Activity className="spin" /></div>
      <small>분석 진행 중 · {loadingSeconds}초</small>
      <b>{specialty} 개원 입지를 분석하고 있습니다</b>
      <strong>보통 5~20초 정도 걸립니다.</strong>
      <span>주소·주변 병원·인구·교통·생활 데이터를 순서대로 확인하고 있습니다.</span>
      <div className="analysis-loading-steps"><i>주소 확인</i><i>주변 병원</i><i>지역 데이터</i></div>
      <em>공공데이터 연결 상황에 따라 조금 더 걸릴 수 있어요.</em>
    </div></div>}
  </main>;
}
