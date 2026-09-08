"use client";

import {
  Activity, AlertTriangle, ArrowRight, BarChart3, Building2, Check, ChevronDown,
  ChevronRight, GitCompareArrows, Hospital, Layers3, LocateFixed, MapPin, Menu,
  Minus, Pause, Play, Plus, Route, Search, ShieldCheck, Sparkles, TrainFront,
  Users, X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { comparison, dataSources, hospitals, layers, recommendations, regionStats, scoreMetrics, specialties, type HospitalPoint, type Specialty } from "@/data/mock-location";

type PanelTab = "overview" | "competitors" | "forecast" | "compare";

function Brand() {
  return <a className="brand" href="#top"><span className="brand-symbol"><LocateFixed /></span><span><b>THE FOUNT</b><small>MEDICAL LOCATION</small></span></a>;
}

function MapCanvas({ hour, activeLayers, radius, selectedHospital, onHospital, onMapSelect }: {
  hour: number; activeLayers: Set<string>; radius: string;
  selectedHospital: HospitalPoint | null; onHospital: (hospital: HospitalPoint) => void; onMapSelect: () => void;
}) {
  const heatShift = hour < 9 ? -5 : hour < 15 ? 4 : hour < 20 ? 10 : -1;
  return <div className="map-canvas" aria-label="서울 강남구 역삼동 데모 지도">
    <svg className="map-base" viewBox="0 0 1000 720" preserveAspectRatio="none" role="img" aria-label="역삼동 일대의 의료 입지분석 데모 지도">
      <rect width="1000" height="720" fill="#edf1f2" />
      <g fill="#f8f9f8" stroke="#dbe1e2" strokeWidth="2">
        <path d="M0 20H205L250 150 190 262 0 240Z"/><path d="M230 0H480L460 150 275 140Z"/><path d="M505 0H735L690 132 485 150Z"/><path d="M760 0H1000V175L720 145Z"/>
        <path d="M0 275L195 292 250 410 150 510 0 490Z"/><path d="M230 285L455 185 480 390 275 430Z"/><path d="M505 180L680 165 720 380 510 400Z"/><path d="M715 190L1000 205V420L755 390Z"/>
        <path d="M0 520L145 535 205 720H0Z"/><path d="M175 535L300 455 455 470 465 720H235Z"/><path d="M495 440L720 420 690 720H495Z"/><path d="M755 445L1000 450V720H730Z"/>
      </g>
      <g fill="#dce9e2"><path d="M95 84h76v70H95z"/><path d="M815 265h92v80h-92z"/><path d="M78 573h105v84H78z"/></g>
      <g fill="#dfe5e7"><rect x="278" y="48" width="58" height="62" rx="3"/><rect x="350" y="35" width="77" height="77" rx="3"/><rect x="540" y="49" width="70" height="70" rx="3"/><rect x="625" y="28" width="54" height="92" rx="3"/><rect x="86" y="328" width="66" height="99" rx="3"/><rect x="306" y="318" width="88" height="60" rx="3"/><rect x="805" y="472" width="58" height="91" rx="3"/><rect x="875" y="489" width="78" height="67" rx="3"/></g>
      <g fill="none" strokeLinecap="round"><path d="M-20 255C180 235 315 235 500 285S790 320 1020 280" stroke="#fff" strokeWidth="34"/><path d="M-20 255C180 235 315 235 500 285S790 320 1020 280" stroke="#c9d2d5" strokeWidth="2"/><path d="M210 -20C225 130 280 245 340 340S430 560 440 740" stroke="#fff" strokeWidth="28"/><path d="M210 -20C225 130 280 245 340 340S430 560 440 740" stroke="#c9d2d5" strokeWidth="2"/><path d="M720 -20C670 170 675 275 715 390S790 565 760 740" stroke="#fff" strokeWidth="24"/><path d="M720 -20C670 170 675 275 715 390S790 565 760 740" stroke="#c9d2d5" strokeWidth="2"/></g>
      {activeLayers.has("transit") && <g><path d="M-10 640C210 590 355 600 500 610S780 650 1010 590" fill="none" stroke="#91a9bd" strokeWidth="8" strokeDasharray="4 7"/><circle cx="425" cy="610" r="14" fill="#42a066" stroke="white" strokeWidth="4"/><text x="445" y="616" className="map-label strong">역삼역</text></g>}
      <g className="map-labels"><text x="435" y="230">테헤란로</text><text x="285" y="485">언주로</text><text x="785" y="416">선릉로</text><text x="92" y="120">도곡근린공원</text></g>
    </svg>
    {activeLayers.has("footfall") && <div className={`heat-layer heat-${hour}`} aria-hidden="true"><span style={{ left: `${34 + heatShift}%`, top: "37%" }} /><span style={{ left: `${59 + heatShift / 2}%`, top: "45%" }} /><span style={{ left: `${48 - heatShift / 3}%`, top: "68%" }} /><span style={{ left: "74%", top: `${30 + heatShift / 2}%` }} /></div>}
    <button className="selected-zone" style={{ left: "50%", top: "48%" }} onClick={onMapSelect} aria-label="선택 위치 변경"><span className="catchment outer"/><span className="catchment middle"/><span className="catchment inner"/><span className="center-pin"><MapPin /></span></button>
    <div className="zone-label"><b>분석 후보지</b><span>반경 {radius}</span></div>
    {activeLayers.has("hospital") && hospitals.map((hospital) => <button key={hospital.id} className={`hospital-marker age-${hospital.years > 10 ? "old" : hospital.years > 5 ? "mid" : hospital.years > 2 ? "new" : "fresh"} ${selectedHospital?.id === hospital.id ? "active" : ""}`} style={{ left: `${hospital.x}%`, top: `${hospital.y}%`, width: `${28 + hospital.doctors * 3}px`, height: `${28 + hospital.doctors * 3}px` }} onClick={() => onHospital(hospital)} aria-label={`${hospital.name} 상세 보기`}><Hospital /></button>)}
    {activeLayers.has("apartment") && <><span className="map-badge apartment" style={{left:"18%",top:"19%"}}><Building2/> 1,240세대</span><span className="map-badge apartment" style={{left:"77%",top:"62%"}}><Building2/> 860세대</span></>}
    {activeLayers.has("development") && <span className="map-badge development" style={{left:"70%",top:"17%"}}><TrainFront/> GTX 환승계획</span>}
    {activeLayers.has("building") && <span className="map-badge building" style={{left:"14%",top:"72%"}}><Building2/> 2027 신축</span>}
    <div className="map-scale">100 m</div>
  </div>;
}

function ScoreBars() {
  return <div className="score-bars">{scoreMetrics.map(metric => <div className="score-row" key={metric.label}><span>{metric.label}</span><div><i style={{width:`${metric.value}%`,background:metric.color}}/></div><b>{metric.value}</b></div>)}</div>;
}

function OverviewPanel({ address, specialty, onSpecialty, onTab }: { address: string; specialty: Specialty; onSpecialty: (s: Specialty) => void; onTab: (tab: PanelTab) => void }) {
  return <div className="panel-content">
    <div className="location-heading"><div><span><MapPin/> 선택 지역</span><h2>{address || "서울 강남구 역삼동"}</h2><p>{specialty} · 반경 1km · 최근 1년</p></div><button title="후보지 저장">☆</button></div>
    <div className="score-hero"><div className="gauge"><div><b>82</b><small>/100</small></div></div><div><span>MEDICAL LOCATION SCORE</span><h3>A 등급</h3><p>전국 동일 진료과 기준 <b>상위 18%</b></p></div><div className="confidence"><ShieldCheck/><span>Data Confidence</span><b>92%</b></div></div>
    <div className="stats-grid">{regionStats.map(([label,value,meta]) => <article key={label}><span>{label}</span><b>{value}</b><small>{meta}</small></article>)}</div>
    <section className="panel-section"><div className="panel-title"><div><span>6 FACTORS</span><h3>분야별 입지점수</h3></div><button onClick={() => onTab("forecast")}>상세 <ChevronRight/></button></div><ScoreBars/></section>
    <section className="panel-section ai-insight"><div className="ai-heading"><Sparkles/><div><span>AI LOCATION INSIGHT</span><h3>이 지역에 대한 해석</h3></div></div><p>30~40대 직장인과 고소득 소비층이 많아 피부미용 수요가 높습니다. 다만 반경 1km 내 피부과가 17개 있어 신규 진입 경쟁은 강합니다. 저가형 시술보다 객단가와 재방문율을 높이는 프리미엄 전략이 적합합니다.</p><div className="pros-cons"><div><b><Check/> 강점</b><span>직장인구 상위 10%</span><span>30~40대 비중 높음</span><span>소비력 상위 15%</span></div><div><b><AlertTriangle/> 위험요인</b><span>경쟁 피부과 17개</span><span>최근 3년 신규개원 +6</span><span>임대료 높은 수준</span></div></div></section>
    <section className="panel-section"><div className="panel-title"><div><span>SPECIALTY FIT</span><h3>이 지역 추천 진료과</h3></div><button onClick={() => onSpecialty("정형외과")}>AI 추천받기</button></div><div className="recommend-list">{recommendations.map(([name, score], index) => <button key={name} onClick={() => onSpecialty(name)}><i>{index+1}</i><span>{name}</span><div><em style={{width:`${score}%`}}/></div><b>{score}</b></button>)}</div><button className="ask-ai" onClick={() => onSpecialty("정형외과")}><Sparkles/> 이 동네에는 어떤 병원이 좋을까? <ArrowRight/></button></section>
    <section className="panel-section next-step"><span>THE FOUNT NEXT STEP</span><h3>이 병원은 실제로 돈을 벌 수 있을까요?</h3><p>임대료, 인력, 장비비와 예상 환자수를 연결해 월매출과 손익분기점을 확인하세요.</p><button>병원 수익성 분석하기 <ArrowRight/></button></section>
    <section className="platform-note"><b>Medical CFO Platform</b><p>좋은 입지를 찾는 것에서 끝나지 않습니다. 개원자금·닥터론·인건비·장비·세금·경영·자산관리까지 더파운트가 연결합니다.</p></section>
    <section className="source-note"><b>데이터 출처</b><div>{dataSources.map(source=><span key={source}>{source}</span>)}</div><small>민간 정밀데이터는 제휴 및 계약 범위에 따라 추후 연동됩니다.</small></section>
  </div>;
}

function CompetitorPanel({ selected, onSelect }: { selected: HospitalPoint | null; onSelect: (h: HospitalPoint) => void }) {
  const hospital = selected || hospitals[0];
  return <div className="panel-content"><div className="section-intro"><span>COMPETITOR MAP</span><h2>경쟁병원 17개</h2><p>피부과 · 반경 1km · 경쟁강도 <b className="danger">높음</b></p></div><div className="density-row"><article><span>500m</span><b>12개</b></article><article><span>1km</span><b>17개</b></article><article><span>최근 개원</span><b>+6</b></article></div><div className="hospital-detail"><div className="hospital-avatar"><Hospital/></div><div><span>선택한 경쟁병원</span><h3>{hospital.name}</h3><p>{hospital.specialty} · {hospital.distance}</p></div><b>{hospital.strength}</b></div><div className="detail-grid"><span>개원기간 <b>{hospital.years}년</b></span><span>의사 수 <b>{hospital.doctors}명</b></span><span>병상 수 <b>{hospital.beds || "없음"}</b></span><span>리뷰 지표 <b>{hospital.reviews.toLocaleString()}</b></span><span>예상 환자흡수력 <b>{hospital.absorption}</b></span><span>온라인 노출도 <b>상위 14%</b></span></div><div className="list-heading"><h3>반경 내 주요 병원</h3><span>원의 크기: 규모 · 색상: 개원연차</span></div><div className="hospital-list">{hospitals.map(h => <button key={h.id} className={hospital.id === h.id ? "active" : ""} onClick={() => onSelect(h)}><span className={`dot age-${h.years > 10 ? "old" : h.years > 5 ? "mid" : h.years > 2 ? "new" : "fresh"}`}/><div><b>{h.name}</b><small>{h.specialty} · 의사 {h.doctors}명 · {h.distance}</small></div><strong>{h.absorption}</strong><ChevronRight/></button>)}</div></div>;
}

function ForecastPanel() {
  return <div className="panel-content"><div className="section-intro"><span>3-YEAR FORECAST</span><h2>상권전망 <b className="up">상승</b></h2><p>인구·개발·교통·경쟁 변화를 종합한 데모 전망입니다.</p></div><div className="forecast-chart"><svg viewBox="0 0 430 210"><defs><linearGradient id="forecastArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2b8dcc" stopOpacity=".28"/><stop offset="1" stopColor="#2b8dcc" stopOpacity="0"/></linearGradient></defs><path d="M25 165 C95 156 132 139 160 130 S255 104 285 85 S360 65 405 36 L405 188H25Z" fill="url(#forecastArea)"/><path d="M25 165 C95 156 132 139 160 130 S255 104 285 85 S360 65 405 36" fill="none" stroke="#2b8dcc" strokeWidth="4" strokeLinecap="round"/>{[[25,165],[160,130],[285,85],[405,36]].map(([x,y],i)=><g key={x}><circle cx={x} cy={y} r="6" fill="#fff" stroke={i===3?"#16a085":"#2b8dcc"} strokeWidth="4"/><text x={x} y={y-15} textAnchor="middle">{78+i*3}</text></g>)}</svg><div><span>현재</span><span>1년 후</span><span>2년 후</span><span>3년 후</span></div></div><div className="forecast-reasons"><h3>상승을 만드는 주요 변화</h3><article><Building2/><div><b>신규 아파트 2,400세대</b><span>2027~2028년 순차 입주 예정</span></div><em>+4.2</em></article><article><TrainFront/><div><b>광역교통망 연장 예정</b><span>역세권 접근성 개선 기대</span></div><em>+2.8</em></article><article><Users/><div><b>직장인구 증가</b><span>오피스 공급과 업무지구 확장</span></div><em>+2.1</em></article><article className="risk"><Hospital/><div><b>경쟁병원 증가</b><span>최근 3년 신규개원 6개</span></div><em>-1.4</em></article></div><div className="catchment-card"><div><Route/><span>진료권 분석</span><h3>환자는 어디에서 올까요?</h3></div><ul><li><i/>1차 진료권 <b>500m · 42%</b></li><li><i/>2차 진료권 <b>1.5km · 38%</b></li><li><i/>3차 진료권 <b>3km · 20%</b></li></ul><p>선택한 진료과와 교통 접근성에 따라 진료권 범위가 달라집니다.</p></div></div>;
}

function ComparePanel() {
  return <div className="panel-content"><div className="section-intro"><span>CANDIDATE COMPARE</span><h2>후보지 A vs B</h2><p>같은 기준으로 비교하면 선택이 더 선명해집니다.</p></div><div className="compare-head"><article><i>A</i><span>서울 강남구</span><h3>강남역 4번 출구</h3><b>82</b></article><GitCompareArrows/><article className="recommended"><i>B</i><span>서울 서초구</span><h3>교대역 8번 출구</h3><b>84</b><em>AI 추천</em></article></div><div className="compare-table">{comparison.map(([label,a,b])=><div key={label}><b>{a}</b><span>{label}</span><b>{b}</b></div>)}</div><div className="ai-compare"><Sparkles/><div><span>AI 비교 해석</span><p>강남역은 잠재수요와 소비력이 높지만 경쟁과 임대료 부담이 큽니다. 교대역은 비용효율과 성장성이 높아 초기 수익성 측면에서 조금 더 유리합니다.</p></div></div><button className="add-candidate"><Plus/> 지도에서 비교 후보지 추가</button></div>;
}

export default function LocationLab() {
  const [addressInput, setAddressInput] = useState("서울 강남구 테헤란로 123");
  const [address, setAddress] = useState("서울 강남구 역삼동");
  const [specialty, setSpecialty] = useState<Specialty>("피부과");
  const [radius, setRadius] = useState("1km");
  const [period, setPeriod] = useState("최근 1년");
  const [day, setDay] = useState("전체 요일");
  const [timeBand, setTimeBand] = useState("전체 시간");
  const [hour, setHour] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [tab, setTab] = useState<PanelTab>("overview");
  const [selectedHospital, setSelectedHospital] = useState<HospitalPoint | null>(null);
  const [layerOpen, setLayerOpen] = useState(true);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeLayers, setActiveLayers] = useState(() => new Set(layers.filter(l => l.defaultOn).map(l => l.id)));
  const filteredHospitals = useMemo(() => hospitals.filter(h => h.specialty === specialty || specialty === "기타"), [specialty]);
  const analyze = (nextAddress = addressInput, nextSpecialty = specialty) => { if (!nextAddress.trim()) return; setLoading(true); setSpecialty(nextSpecialty); setSelectedHospital(null); window.setTimeout(() => { setAddress(nextAddress.includes("강남") ? "서울 강남구 역삼동" : nextAddress); setTab("overview"); setLoading(false); }, 700); };
  const submit = (event: FormEvent) => { event.preventDefault(); analyze(); };
  const toggleLayer = (id: string) => setActiveLayers(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
  useEffect(() => { if (!playing) return; const timer = window.setInterval(() => setHour(current => current >= 24 ? 6 : current + 1), 550); return () => window.clearInterval(timer); }, [playing]);
  useEffect(() => { setTimeBand(hour < 10 ? "오전" : hour < 14 ? "점심" : hour < 18 ? "오후" : hour < 22 ? "저녁" : "직접 선택"); }, [hour]);
  useEffect(() => { type Ctx = { registerTool: (tool: {name:string;title:string;description:string;inputSchema:object;annotations:object;execute:(input:unknown)=>Promise<object>}, options:{signal:AbortSignal}) => void | Promise<void> }; const context = (document as unknown as {modelContext?:Ctx}).modelContext; if (!context?.registerTool) return; const lifecycle = new AbortController(); void Promise.resolve(context.registerTool({name:"analyze_medical_location_demo",title:"병원 입지 데모 분석",description:"주소와 진료과를 적용해 지도와 분석 패널을 갱신합니다.",inputSchema:{type:"object",properties:{address:{type:"string",minLength:2},specialty:{type:"string",enum:specialties}},required:["address","specialty"],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},async execute(input){const value=input as {address?:unknown;specialty?:unknown};if(typeof value.address!=="string"||typeof value.specialty!=="string"||!specialties.includes(value.specialty as Specialty))throw new Error("주소와 지원 진료과를 확인해주세요.");analyze(value.address,value.specialty as Specialty);return{status:"started",mode:"mock-data",address:value.address,specialty:value.specialty};}},{signal:lifecycle.signal})).catch(()=>undefined); return()=>lifecycle.abort(); },[]);

  return <main id="top" className="app-shell">
    <header className="app-header"><Brand/><div className="header-status"><span><i/> DEMO DATA</span><b>병원 개원 입지분석</b></div><nav><button>후보지</button><button>리포트</button><button>개원 수익성</button><button className="account">TF</button></nav><button className="mobile-menu" onClick={()=>setMobileFilter(!mobileFilter)}>{mobileFilter?<X/>:<Menu/>}</button></header>
    <form className={`filter-bar ${mobileFilter?"mobile-open":""}`} onSubmit={submit}>
      <label className="search-field"><Search/><input value={addressInput} onChange={e=>setAddressInput(e.target.value)} placeholder="주소, 건물명, 역 이름 검색"/><button type="button" title="현재 위치"><LocateFixed/></button></label>
      <label><span>진료과</span><select value={specialty} onChange={e=>setSpecialty(e.target.value as Specialty)}>{specialties.map(s=><option key={s}>{s}</option>)}</select><ChevronDown/></label>
      <label><span>분석 반경</span><select value={radius} onChange={e=>setRadius(e.target.value)}>{["300m","500m","1km","3km"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown/></label>
      <label><span>기간</span><select value={period} onChange={e=>setPeriod(e.target.value)}>{["최근 1개월","최근 3개월","최근 6개월","최근 1년","최근 3년"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown/></label>
      <label><span>요일</span><select value={day} onChange={e=>setDay(e.target.value)}>{["전체 요일","평일","주말","월요일","화요일","수요일","목요일","금요일","토요일","일요일"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown/></label>
      <label><span>시간</span><select value={timeBand} onChange={e=>setTimeBand(e.target.value)}>{["전체 시간","오전","점심","오후","저녁","직접 선택"].map(s=><option key={s}>{s}</option>)}</select><ChevronDown/></label>
      <button className="analyze-button" type="submit">{loading?<Activity className="spin"/>:<BarChart3/>} 분석하기</button>
    </form>
    <div className="workspace">
      <section className="map-area">
        <MapCanvas hour={hour} activeLayers={activeLayers} radius={radius} selectedHospital={selectedHospital} onHospital={hospital=>{setSelectedHospital(hospital);setTab("competitors")}} onMapSelect={()=>{setAddress("서울 강남구 역삼동 642-19");setTab("overview")}}/>
        <div className="map-tools left"><button><Plus/></button><button><Minus/></button><button><LocateFixed/></button></div>
        <div className="map-summary"><span>{specialty} · 반경 {radius}</span><b>경쟁병원 {filteredHospitals.length || 17}개</b><em>경쟁강도 높음</em></div>
        <div className="layer-control"><button className="layer-trigger" onClick={()=>setLayerOpen(!layerOpen)}><Layers3/> 지도 레이어 <b>{activeLayers.size}</b><ChevronDown/></button>{layerOpen&&<div className="layer-menu"><div><b>표시할 데이터</b><button onClick={()=>setLayerOpen(false)}><X/></button></div>{layers.map(layer=><label key={layer.id}><input type="checkbox" checked={activeLayers.has(layer.id)} onChange={()=>toggleLayer(layer.id)}/><i style={{background:layer.color}}/><span>{layer.label}</span></label>)}<small>선택한 레이어는 샘플 데이터로 표시됩니다.</small></div>}</div>
        <div className="legend"><span><i className="old"/>10년 이상</span><span><i className="mid"/>5~10년</span><span><i className="new"/>2~5년</span><span><i className="fresh"/>2년 미만</span></div>
        <div className="timeline"><button onClick={()=>setPlaying(!playing)}>{playing?<Pause/>:<Play/>}</button><div className="time-copy"><b>{String(hour).padStart(2,"0")}:00</b><span>{playing?"하루 유동인구 흐름 재생 중":"시간대를 움직여 유동인구 변화를 확인하세요"}</span></div><input type="range" min="6" max="24" step="1" value={hour} onChange={e=>{setHour(Number(e.target.value));setPlaying(false)}}/><div className="time-ticks">{[6,9,12,15,18,21,24].map(t=><span key={t}>{String(t).padStart(2,"0")}</span>)}</div></div>
      </section>
      <aside className="analysis-panel"><div className="sheet-handle"/><div className="panel-tabs"><button className={tab==="overview"?"active":""} onClick={()=>setTab("overview")}>지역분석</button><button className={tab==="competitors"?"active":""} onClick={()=>setTab("competitors")}>경쟁병원</button><button className={tab==="forecast"?"active":""} onClick={()=>setTab("forecast")}>3년전망</button><button className={tab==="compare"?"active":""} onClick={()=>setTab("compare")}>후보지 비교</button></div>{tab==="overview"&&<OverviewPanel address={address} specialty={specialty} onSpecialty={s=>{setSpecialty(s);analyze(address,s)}} onTab={setTab}/>} {tab==="competitors"&&<CompetitorPanel selected={selectedHospital} onSelect={setSelectedHospital}/>} {tab==="forecast"&&<ForecastPanel/>} {tab==="compare"&&<ComparePanel/>}</aside>
    </div>
    {loading&&<div className="loading-mask"><div><Activity className="spin"/><b>{specialty} 개원 데이터를 분석하고 있습니다</b><span>의료수요 · 경쟁병원 · 유동인구 · 성장성</span></div></div>}
  </main>;
}
