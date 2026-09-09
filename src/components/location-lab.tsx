"use client";

import dynamic from "next/dynamic";
import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Check, ChevronDown, ChevronRight,
  GitCompareArrows, Hospital, Layers3, LocateFixed, MapPin, Menu, Search,
  ShieldCheck, Sparkles, X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { specialties, type Specialty } from "@/data/specialties";
import type { LocationAnalysis, LiveMetric, LivePlace } from "@/data/location-types";

const LiveMap = dynamic(() => import("./live-map"), { ssr: false, loading: () => <div className="map-loading"><Activity className="spin" /> 지도를 불러오는 중</div> });

type PanelTab = "overview" | "competitors" | "forecast" | "compare";

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
  insight: "주소를 분석하면 실제 공개 지도 데이터가 표시됩니다.", strengths: [], risks: [], limitations: []
};

const LIVE_LAYERS = [
  { id: "hospital", label: "의료기관", color: "#e55e48" },
  { id: "pharmacy", label: "약국", color: "#3182ce" },
  { id: "transit", label: "대중교통", color: "#0f937d" },
  { id: "parking", label: "주차시설", color: "#805ad5" }
];

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
  return <div className="score-bars">{metrics.map(metric => <div className={`score-row ${metric.value === null ? "pending" : ""}`} key={metric.label}>
    <span>{metric.label}</span><div>{metric.value === null ? <small>{metric.note}</small> : <i style={{ width: `${metric.value}%`, background: metric.color }} />}</div><b>{metric.value ?? "—"}</b>
  </div>)}</div>;
}

function OverviewPanel({ analysis, onTab }: { analysis: LocationAnalysis; onTab: (tab: PanelTab) => void }) {
  const stats = [
    ["전체 의료기관", `${analysis.counts.medical}곳`, "실시간 조회"],
    [`${analysis.specialty} 표식`, `${analysis.counts.matchingSpecialty}곳`, "명칭·분류 기준"],
    ["약국", `${analysis.counts.pharmacy}곳`, "반경 내"],
    ["대중교통", `${analysis.counts.transit}곳`, "역·정류장"],
    ["주차시설", `${analysis.counts.parking}곳`, "공개 등록 기준"],
    ["분석 반경", `${analysis.radiusMeters.toLocaleString()}m`, analysis.provider === "kakao" ? "Kakao Local" : "OpenStreetMap"]
  ];
  return <div className="panel-content">
    <div className="location-heading"><div><span><MapPin /> 실제 분석 지역</span><h2>{analysis.location.displayName.split(",")[0]}</h2><p>{analysis.specialty} · 반경 {analysis.radiusMeters.toLocaleString()}m</p></div></div>
    <div className="score-hero live-score"><div className="gauge" style={{ background: `conic-gradient(#35d0b0 0 ${analysis.observedScore}%,rgba(255,255,255,.15) ${analysis.observedScore}%)` }}><div><b>{analysis.observedScore || "—"}</b><small>/100</small></div></div><div><span>LIVE OBSERVED SCORE</span><h3>{analysis.grade} 등급</h3><p>현재 연결된 실제 데이터 범위의 <b>베타 관측점수</b></p></div><div className="confidence"><ShieldCheck /><span>Data Coverage</span><b>{analysis.confidence}%</b></div></div>
    <p className="score-disclaimer">유동인구·소득·임대료가 연결되기 전의 제한 점수입니다. 개원 타당성 최종점수로 사용하지 않습니다.</p>
    <div className="stats-grid">{stats.map(([label, value, meta]) => <article key={label}><span>{label}</span><b>{value}</b><small>{meta}</small></article>)}</div>
    <section className="panel-section"><div className="panel-title"><div><span>CONNECTED FACTORS</span><h3>실제 데이터 연결 현황</h3></div><button onClick={() => onTab("competitors")}>경쟁병원 <ChevronRight /></button></div><MetricBars metrics={analysis.metrics} /></section>
    <section className="panel-section ai-insight"><div className="ai-heading"><Sparkles /><div><span>LOCATION INTERPRETATION</span><h3>현재 데이터에 대한 해석</h3></div></div><p>{analysis.insight}</p><div className="pros-cons"><div><b><Check /> 확인된 신호</b>{analysis.strengths.map(item => <span key={item}>{item}</span>)}</div><div><b><AlertTriangle /> 확인 필요</b>{analysis.risks.map(item => <span key={item}>{item}</span>)}</div></div></section>
    <section className="panel-section data-coverage"><span>DATA ROADMAP</span><h3>정밀점수에 필요한 추가 데이터</h3><p>건강보험심사평가원·통계청·상권·임대료 API 인증키를 연결하면 잠재환자, 소비력, 비용효율, 성장성까지 실제 수치로 확장됩니다.</p></section>
    <section className="panel-section next-step"><span>THE FOUNT NEXT STEP</span><h3>지도 결과를 실제 개원계획으로 연결하세요</h3><p>입지·개원자금·인건비·장비·세금·손익분기점을 함께 검토합니다.</p><button>정밀 개원분석 상담하기 <ArrowRight /></button></section>
    <section className="source-note"><b>현재 사용 데이터</b><div><span>{analysis.provider === "kakao" ? "Kakao Local API" : "OpenStreetMap"}</span><span>실제 좌표</span><span>실제 등록 장소</span></div><small>분석 시각 {new Date(analysis.analyzedAt).toLocaleString("ko-KR")} · 공개 데이터의 등록 상태에 따라 현장과 차이가 있을 수 있습니다.</small></section>
  </div>;
}

function CompetitorPanel({ analysis, selected, onSelect }: { analysis: LocationAnalysis; selected: LivePlace | null; onSelect: (place: LivePlace) => void }) {
  const hospitals = analysis.places.filter(place => place.kind === "hospital");
  const current = selected?.kind === "hospital" ? selected : hospitals[0];
  return <div className="panel-content"><div className="section-intro"><span>LIVE COMPETITOR MAP</span><h2>의료기관 {hospitals.length}곳</h2><p>{analysis.specialty} 표식 {analysis.counts.matchingSpecialty}곳 · 반경 {analysis.radiusMeters.toLocaleString()}m</p></div>
    {current && <><div className="hospital-detail"><div className="hospital-avatar"><Hospital /></div><div><span>선택한 실제 의료기관</span><h3>{current.name}</h3><p>{current.specialty || "의료기관"} · {current.distanceMeters.toLocaleString()}m</p></div><b>LIVE</b></div><div className="detail-grid"><span>거리 <b>{current.distanceMeters.toLocaleString()}m</b></span><span>출처 <b>{analysis.provider === "kakao" ? "Kakao" : "OSM"}</b></span><span className="wide">주소 <b>{current.address || "공개 주소 없음"}</b></span></div></>}
    <div className="list-heading"><h3>거리순 의료기관</h3><span>공개 등록 데이터를 그대로 표시합니다</span></div><div className="hospital-list">{hospitals.length ? hospitals.slice(0, 40).map(place => <button key={place.id} className={current?.id === place.id ? "active" : ""} onClick={() => onSelect(place)}><span className="dot age-fresh" /><div><b>{place.name}</b><small>{place.specialty || "의료기관"} · {place.distanceMeters.toLocaleString()}m</small></div><strong>{place.distanceMeters}m</strong><ChevronRight /></button>) : <div className="empty-state">반경 내 공개 등록 의료기관을 찾지 못했습니다.</div>}</div>
  </div>;
}

function ForecastPanel() {
  return <div className="panel-content"><div className="section-intro"><span>DATA CONNECTION</span><h2>3년 전망 데이터 준비</h2><p>가상의 전망 수치는 더 이상 표시하지 않습니다.</p></div><div className="honest-placeholder"><BarChart3 /><h3>개발계획·인구추계 API가 필요합니다</h3><p>국토교통부, 통계청 및 지자체 개발계획 데이터를 연결한 뒤에만 실제 1·2·3년 전망을 계산합니다.</p><ul><li>신규 아파트 입주와 주택 공급</li><li>재개발·재건축·신축건물</li><li>교통망 개통 계획</li><li>의료기관 개폐업 추세</li></ul></div></div>;
}

function ComparePanel({ saved }: { saved: LocationAnalysis[] }) {
  const candidates = saved.slice(-2);
  if (candidates.length < 2) return <div className="panel-content"><div className="section-intro"><span>LIVE COMPARE</span><h2>후보지를 한 곳 더 분석하세요</h2><p>서로 다른 두 주소를 분석하면 실제 조회 결과를 비교합니다.</p></div><div className="honest-placeholder"><GitCompareArrows /><h3>{candidates.length ? "첫 번째 후보지가 저장되었습니다" : "비교할 후보지가 없습니다"}</h3><p>주소를 변경해 분석하기를 누르면 최근 두 후보지의 의료기관·교통·주차 데이터를 비교할 수 있습니다.</p></div></div>;
  const [a, b] = candidates;
  const rows: [string, number, number][] = [["전체 의료기관", a.counts.medical, b.counts.medical], [`${b.specialty} 표식`, a.counts.matchingSpecialty, b.counts.matchingSpecialty], ["대중교통", a.counts.transit, b.counts.transit], ["약국", a.counts.pharmacy, b.counts.pharmacy], ["주차시설", a.counts.parking, b.counts.parking], ["베타 관측점수", a.observedScore, b.observedScore]];
  return <div className="panel-content"><div className="section-intro"><span>LIVE CANDIDATE COMPARE</span><h2>실제 후보지 비교</h2><p>동일한 공개 데이터 기준으로 비교합니다.</p></div><div className="compare-head"><article><i>A</i><span>{a.specialty}</span><h3>{a.location.displayName.split(",")[0]}</h3><b>{a.observedScore}</b></article><GitCompareArrows /><article className={b.observedScore >= a.observedScore ? "recommended" : ""}><i>B</i><span>{b.specialty}</span><h3>{b.location.displayName.split(",")[0]}</h3><b>{b.observedScore}</b></article></div><div className="compare-table">{rows.map(([label, av, bv]) => <div key={label}><b>{av}</b><span>{label}</span><b>{bv}</b></div>)}</div><div className="ai-compare"><Sparkles /><div><span>비교 참고</span><p>현재 비교는 공개 지도에서 확인되는 경쟁시설과 접근성만 반영합니다. 매출·임대료·인구 데이터를 연결한 뒤 최종 후보지를 결정하세요.</p></div></div></div>;
}

export default function LocationLab() {
  const [addressInput, setAddressInput] = useState("서울특별시 강남구 테헤란로 123");
  const [specialty, setSpecialty] = useState<Specialty>("피부과");
  const [radiusMeters, setRadiusMeters] = useState(1000);
  const [analysis, setAnalysis] = useState<LocationAnalysis>(EMPTY_ANALYSIS);
  const [saved, setSaved] = useState<LocationAnalysis[]>([]);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [selectedPlace, setSelectedPlace] = useState<LivePlace | null>(null);
  const [layerOpen, setLayerOpen] = useState(true);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeKinds, setActiveKinds] = useState(() => new Set(LIVE_LAYERS.map(layer => layer.id)));

  const runAnalysis = useCallback(async (payload: { address?: string; latitude?: number; longitude?: number; specialty?: Specialty; radiusMeters?: number }) => {
    setLoading(true); setError(""); setSelectedPlace(null);
    try {
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address: payload.address ?? addressInput, latitude: payload.latitude, longitude: payload.longitude, specialty: payload.specialty ?? specialty, radiusMeters: payload.radiusMeters ?? radiusMeters }) });
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
      setAnalysis(result); setSpecialty(result.specialty); setAddressInput(result.location.displayName.split(",")[0]); setSaved(current => [...current.filter(item => item.location.latitude !== result.location.latitude || item.location.longitude !== result.location.longitude), result].slice(-4)); setTab("overview"); setMobileFilter(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "분석 중 오류가 발생했습니다."); }
    finally { setLoading(false); }
  }, [addressInput, specialty, radiusMeters]);

  useEffect(() => { void runAnalysis({ address: "서울특별시 강남구 테헤란로 123" }); }, []);
  const submit = (event: FormEvent) => { event.preventDefault(); void runAnalysis({ address: addressInput }); };
  const toggleLayer = (id: string) => setActiveKinds(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const useCurrentLocation = () => navigator.geolocation?.getCurrentPosition(position => void runAnalysis({ latitude: position.coords.latitude, longitude: position.coords.longitude }), () => setError("현재 위치 권한을 확인해주세요."));
  const radiusLabel = useMemo(() => radiusMeters >= 1000 ? `${radiusMeters / 1000}km` : `${radiusMeters}m`, [radiusMeters]);

  useEffect(() => {
    type Ctx = { registerTool: (tool: { name: string; title: string; description: string; inputSchema: object; annotations: object; execute: (input: unknown) => Promise<object> }, options: { signal: AbortSignal }) => void | Promise<void> };
    const context = (document as unknown as { modelContext?: Ctx }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(context.registerTool({ name: "analyze_medical_location", title: "병원 입지 실제 데이터 분석", description: "주소와 진료과를 기준으로 실제 공개 지도 데이터를 조회합니다.", inputSchema: { type: "object", properties: { address: { type: "string", minLength: 2 }, specialty: { type: "string", enum: specialties } }, required: ["address", "specialty"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const value = input as { address?: unknown; specialty?: unknown }; if (typeof value.address !== "string" || typeof value.specialty !== "string" || !specialties.includes(value.specialty as Specialty)) throw new Error("주소와 진료과를 확인해주세요."); void runAnalysis({ address: value.address, specialty: value.specialty as Specialty }); return { status: "started", mode: "live-data", address: value.address, specialty: value.specialty }; } }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, [runAnalysis]);

  return <main id="top" className="app-shell">
    <header className="app-header"><Brand /><div className="header-status"><span><i /> LIVE BETA</span><b>실제 공개 데이터 기반</b></div><nav><button onClick={() => setTab("compare")}>후보지</button><button onClick={() => setTab("overview")}>분석 리포트</button><button>개원 수익성</button><button className="account">TF</button></nav><button className="mobile-menu" onClick={() => setMobileFilter(!mobileFilter)}>{mobileFilter ? <X /> : <Menu />}</button></header>
    <form className={`filter-bar live-filter ${mobileFilter ? "mobile-open" : ""}`} onSubmit={submit}>
      <label className="search-field"><Search /><input value={addressInput} onChange={event => setAddressInput(event.target.value)} placeholder="도로명 주소, 건물명, 역 이름 검색" /><button type="button" title="현재 위치" onClick={useCurrentLocation}><LocateFixed /></button></label>
      <label><span>진료과</span><select value={specialty} onChange={event => setSpecialty(event.target.value as Specialty)}>{specialties.map(item => <option key={item}>{item}</option>)}</select><ChevronDown /></label>
      <label><span>분석 반경</span><select value={radiusMeters} onChange={event => setRadiusMeters(Number(event.target.value))}>{[[300, "300m"], [500, "500m"], [1000, "1km"], [3000, "3km"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown /></label>
      <button className="analyze-button" type="submit">{loading ? <Activity className="spin" /> : <BarChart3 />} 실제 데이터 분석</button>
    </form>
    {error && <div className="error-banner"><AlertTriangle />{error}<button onClick={() => setError("")}><X /></button></div>}
    <div className="workspace">
      <section className="map-area">
        <LiveMap analysis={analysis} activeKinds={activeKinds} selected={selectedPlace} onPlace={place => { setSelectedPlace(place); if (place.kind === "hospital") setTab("competitors"); }} onSelectCoordinate={(latitude, longitude) => void runAnalysis({ latitude, longitude })} />
        <div className="map-summary"><span>{analysis.specialty} · 반경 {radiusLabel}</span><b>의료기관 {analysis.counts.medical}곳</b><em>{analysis.provider === "kakao" ? "KAKAO LIVE" : "OSM LIVE"}</em></div>
        <div className="layer-control"><button className="layer-trigger" onClick={() => setLayerOpen(!layerOpen)}><Layers3 /> 실제 지도 레이어 <b>{activeKinds.size}</b><ChevronDown /></button>{layerOpen && <div className="layer-menu"><div><b>표시할 실제 데이터</b><button onClick={() => setLayerOpen(false)}><X /></button></div>{LIVE_LAYERS.map(layer => <label key={layer.id}><input type="checkbox" checked={activeKinds.has(layer.id)} onChange={() => toggleLayer(layer.id)} /><i style={{ background: layer.color }} /><span>{layer.label}</span></label>)}<small>지도 클릭 시 해당 좌표를 새로 분석합니다.</small></div>}</div>
        <div className="live-map-note"><span><i className="hospital-dot" /> 의료기관</span><span><i className="pharmacy-dot" /> 약국</span><span><i className="transit-dot" /> 교통</span><span><i className="parking-dot" /> 주차</span></div>
      </section>
      <aside className="analysis-panel"><div className="sheet-handle" /><div className="panel-tabs"><button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>지역분석</button><button className={tab === "competitors" ? "active" : ""} onClick={() => setTab("competitors")}>경쟁병원</button><button className={tab === "forecast" ? "active" : ""} onClick={() => setTab("forecast")}>3년전망</button><button className={tab === "compare" ? "active" : ""} onClick={() => setTab("compare")}>후보지 비교</button></div>{tab === "overview" && <OverviewPanel analysis={analysis} onTab={setTab} />}{tab === "competitors" && <CompetitorPanel analysis={analysis} selected={selectedPlace} onSelect={setSelectedPlace} />}{tab === "forecast" && <ForecastPanel />}{tab === "compare" && <ComparePanel saved={saved} />}</aside>
    </div>
    {loading && <div className="loading-mask"><div><Activity className="spin" /><b>{specialty} 주변 실제 데이터를 조회하고 있습니다</b><span>주소 좌표 · 의료기관 · 약국 · 교통 · 주차</span></div></div>}
  </main>;
}
