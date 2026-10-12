'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import type { LocationAnalysis } from '@/data/location-types';
import { DEFAULT_OPENING_INPUTS, type OpeningInputs } from '@/data/opening-plan';
import { calculateViability, type ViabilityAssumptions } from '@/data/viability-engine';
import { modelFor } from '@/data/viability-models';
import { openingScoreV2 } from '@/data/location-score-v2';
import { matchesSpecialty } from '@/data/specialties';
import { clinicalDemand, competitorStrength, serviceRegion, clinicalScoreLabel } from '@/data/clinical-evaluation';
import { deriveMedicalMarket } from '@/data/medical-market';
import { openingInputsWithVisitRevenue } from '@/data/specialty-revenue';
import { applyAutomaticOperatingCosts } from '@/data/operating-costs';
import { AnalysisSavePanel } from './analysis-save-panel';
import './viability.css';

const SENIOR_SPECIALTIES = new Set(['내과', '정형외과', '비뇨기과', '안과', '이비인후과', '한의원']);
const SITE_CHECK_GROUPS = [
  {
    id: 'visibility', title: '01. 가시성·진입 동선', description: '환자가 병원을 발견하고 들어오는 과정',
    items: [
      ['road-sign', '주요 도로와 횡단보도에서 병원 간판 자리가 잘 보이나요?'],
      ['sign-rights', '건물 외부·입구·엘리베이터에 간판을 설치할 수 있나요?'],
      ['entrance', '1층 입구가 쉽게 보이고 처음 오는 환자도 찾기 쉬운가요?'],
      ['walking-route', '역·버스정류장·주차장에서 건물까지 보행 동선이 편한가요?'],
      ['barrier-free', '계단·턱·경사로가 고령자와 유모차 이용에 불편하지 않나요?'],
    ],
  },
  {
    id: 'parking', title: '02. 주차·차량 접근', description: '실제 내원의 편의와 회전율을 좌우하는 조건',
    items: [
      ['parking-count', '병원 이용 시간에 환자가 쓸 수 있는 주차면이 충분한가요?'],
      ['parking-entry', '주차장 진·출입과 차량 회전이 어렵지 않은가요?'],
      ['parking-type', '기계식 주차일 경우 SUV·대형 차량도 이용할 수 있나요?'],
      ['parking-fee', '무료 주차시간과 초과요금이 예상 진료시간에 맞나요?'],
      ['drop-off', '택시·보호자 차량이 환자를 안전하게 내려줄 공간이 있나요?'],
    ],
  },
  {
    id: 'patients', title: '03. 환자층·유동 확인', description: '숫자와 실제 거리의 분위기가 같은지 확인',
    items: [
      ['weekday-flow', '평일 오전·점심·오후의 실제 통행량을 두 번 이상 봤나요?'],
      ['weekend-flow', '주말 진료가 중요하다면 주말 통행량도 확인했나요?'],
      ['target-age', '진료과의 주요 환자 연령대가 실제로 많이 보이나요?'],
      ['resident-worker', '거주자·직장인·학생 중 어떤 사람이 많은 지역인지 확인했나요?'],
      ['nearby-demand', '아파트·학교·학원·오피스 등 환자 유입 시설이 실제 운영 중인가요?'],
    ],
  },
  {
    id: 'building', title: '04. 건물·진료 환경', description: '인테리어 전에 반드시 확인할 시설과 설비',
    items: [
      ['elevator', '엘리베이터 대수·크기·대기시간이 환자 수요에 맞나요?'],
      ['floor-layout', '전용면적·실제 형태·층고가 원하는 진료실 배치에 맞나요?'],
      ['utilities', '전기용량·급배수·냉난방·환기 시설을 확인했나요?'],
      ['medical-use', '건축물 용도와 관리규약상 해당 진료과 개설이 가능한가요?'],
      ['safety', '화재대피·장애인 편의시설·화장실 조건이 진료에 적합한가요?'],
    ],
  },
  {
    id: 'network', title: '05. 경쟁·주변 상권', description: '경쟁 뿐 아니라 함께 환자를 모을 조건까지 확인',
    items: [
      ['same-building', '같은 건물에 동일 진료과나 환자층이 겹치는 병원이 있나요?'],
      ['competitor-visit', '가까운 경쟁병원의 가시성·규모·환자 대기정도를 직접 봤나요?'],
      ['pharmacy', '같은 건물이나 도보권에 조제 가능한 약국이 있나요?'],
      ['synergy', '검사·영상·재활·상급병원 등 연계할 의료기관이 주변에 있나요?'],
      ['commercial-fit', '주변 상가와 건물의 이미지가 예정한 진료 가격과 브랜드에 맞나요?'],
    ],
  },
  {
    id: 'contract', title: '06. 계약·고정비', description: '수익성을 바꾸는 실제 조건을 서류로 확인',
    items: [
      ['rent-cost', '보증금·월세·관리비·권리금의 정확한 금액을 받았나요?'],
      ['management-detail', '관리비에 포함된 항목과 별도 부담 비용을 확인했나요?'],
      ['free-rent', '인테리어 기간의 무상임대·임대료 인상 조건을 협의했나요?'],
      ['exclusive', '동일 진료과의 건물 내 추가 입점 제한을 계약서에 넣을 수 있나요?'],
      ['restoration', '원상복구·중도해지·시설비 분담 범위를 서면으로 확인했나요?'],
    ],
  },
] as const;

const SITE_CHECK_COUNT = SITE_CHECK_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

function targetPopulationFor(analysis: LocationAnalysis) {
  return clinicalDemand(analysis)?.target ?? 0;
}

function hasCustomOpeningPlan(inputs: OpeningInputs) {
  return (Object.keys(DEFAULT_OPENING_INPUTS) as Array<keyof OpeningInputs>)
    .some(key => inputs[key] !== DEFAULT_OPENING_INPUTS[key]);
}

function easyVerdict(score: number | null, coverage: number | null) {
  if (score === null || coverage === null) return '현재 자료로는 판단하기 어렵습니다.';
  if (coverage < 0.8) return '예상 환자가 부족할 수 있어 비용 계획을 낮춰야 합니다.';
  if (coverage < 1) return '손익분기점에 가까워 임대료와 환자 확보 계획을 더 확인해야 합니다.';
  if (score >= 75) return '환자 수요와 운영비를 함께 보면 긍정적으로 검토할 만합니다.';
  return '개원 후보지로 검토할 수 있지만 현장 확인이 더 필요합니다.';
}

function combinedVerdict(regionScore: number, businessScore: number | null, coverage: number | null) {
  if (!regionScore || businessScore === null || coverage === null) return {
    title: '두 가지를 함께 판단할 자료를 확인하고 있습니다.',
    text: '주변 환자층과 예상 운영비가 확인되면 이 자리의 장점과 부담을 함께 설명해드립니다.',
  };
  if (coverage < .8) return {
    title: '지역 여건과 별개로, 예상 환자가 운영비를 감당하기 어려울 수 있습니다.',
    text: '교통이나 소비 수준이 좋아도 예상 진료가 손익분기점에 크게 못 미칩니다. 월세와 인력 계획을 낮추거나 다른 후보지를 함께 비교해보세요.',
  };
  if (coverage < 1) return {
    title: '후보지로 검토할 수 있지만, 운영비부터 다시 확인해야 합니다.',
    text: '주변 여건과 예상 환자를 함께 보면 가능성은 있습니다. 다만 현재 운영 계획에서는 손익분기점에 못 미쳐 실제 임대료와 목표 환자 수를 확인해야 합니다.',
  };
  if (regionScore < 60) return {
    title: '수익성 계산은 가능성이 있지만, 지역의 약점도 살펴야 합니다.',
    text: '예상 진료는 운영비를 넘길 수 있어도 주변 수요·경쟁·접근 조건에는 부담이 있습니다. 어떤 환자가 이 건물까지 올지 현장에서 확인하세요.',
  };
  if (regionScore >= 75 && businessScore >= 75) return {
    title: '지역 여건과 운영 계획 모두 긍정적입니다.',
    text: '다음 단계에서는 실제 임대 조건, 주차와 건물 접근성을 확인해 예상 수익이 유지되는지 살펴보세요.',
  };
  return {
    title: '입지와 사업성을 함께 비교해볼 만한 후보지입니다.',
    text: '두 점수의 장점과 부담이 다를 수 있습니다. 예상 진료·월세와 주변 경쟁을 다른 후보지와 나란히 비교해보세요.',
  };
}

export function ViabilityPanel({ analysis, inputs, onLoad, onOpenProfitability, mode = 'standalone' }: {
  analysis: LocationAnalysis;
  inputs: OpeningInputs;
  onLoad?: (analysis: LocationAnalysis) => void;
  onOpenProfitability?: () => void;
  mode?: 'standalone' | 'summary' | 'details';
}) {
  const model = modelFor(analysis.specialty);
  const operatingInputs = applyAutomaticOperatingCosts(analysis, inputs);
  const visitRevenue = openingInputsWithVisitRevenue(analysis, operatingInputs);
  const targetPopulation = targetPopulationFor(analysis);
  const market = deriveMedicalMarket(analysis, targetPopulation);
  const fixedCostWon = (
    operatingInputs.monthlyRentManwon +
    operatingInputs.monthlyManagementManwon +
    operatingInputs.monthlyPayrollManwon +
    operatingInputs.monthlyMarketingManwon +
    operatingInputs.monthlyOtherCost +
    Math.min(operatingInputs.loanAmount, operatingInputs.depositManwon + operatingInputs.openingBudgetManwon) * operatingInputs.annualInterest / 1200
  ) * 10000;
  const growthScore = analysis.growthForecast?.status === 'available' ? analysis.growthForecast.growthScore ?? 50 : 50;
  const futureDemandFactor = analysis.growthForecast?.status === 'available'
    ? Math.max(0.85, Math.min(1.25, 0.9 + growthScore / 500)) : 1;
  const parkingMatters = SENIOR_SPECIALTIES.has(analysis.specialty);

  const assumptions: ViabilityAssumptions = {
    ...model.defaults,
    targetPopulation,
    inflowVisits: market.outsidePopulation * model.defaults.monthlyUtilization *
      model.defaults.catchmentFactor * model.defaults.retention,
    clusterDemandMultiplier: market.clusterDemandMultiplier,
    competitionSensitivity: market.competitionSensitivity,
    revenuePerVisitWon: visitRevenue.inputs.revenuePerPatient * 10000,
    fixedCostWon,
    variableRate: operatingInputs.variablePercent / 100,
    monthlyCapacity: operatingInputs.dailyPatients * operatingInputs.clinicDays,
    futureDemandFactor,
    riskMultiplier: parkingMatters && analysis.counts.parking === 0 ? 0.9 : 1,
    startupCapitalWon: (operatingInputs.depositManwon + operatingInputs.openingBudgetManwon) * 10000,
    monthlyRentWon: operatingInputs.monthlyRentManwon * 10000,
    monthlyDebtPrincipalWon: Math.min(operatingInputs.loanAmount, operatingInputs.depositManwon + operatingInputs.openingBudgetManwon) /
      Math.max(1, operatingInputs.loanMonths) * 10000,
  };

  const competitors = useMemo(() => analysis.places
    .filter(place => place.kind === 'hospital' && matchesSpecialty(place.name, place.specialty, analysis.specialty))
    .map(place => ({
      id: place.id,
      name: place.name,
      travelMinutes: Math.max(1, place.distanceMeters / 80),
      attraction: competitorStrength(place),
      evidence: 'assumption' as const,
    })), [analysis]);

  const result = calculateViability(assumptions, competitors, model);
  const region = serviceRegion(analysis);
  const ready = region !== 'outside' && clinicalDemand(analysis) !== null &&
    analysis.provider === 'kakao' && result.bepVisits !== null && result.score !== null;
  const customPlan = hasCustomOpeningPlan(inputs);
  const analyzed = analysis.analyzedAt !== new Date(0).toISOString();
  const coverage = result.coverage === null ? 0 : Math.round(result.coverage * 100);
  const newScore = customPlan ? openingScoreV2(analysis.metrics, result, market.reachablePopulation) : null;
  const verdict = customPlan
    ? combinedVerdict(analysis.observedScore, ready ? result.score : null, result.coverage)
    : {
      title: analyzed ? '공개 지역 자료를 조회했습니다. 개원 사업성은 운영계획 입력이 필요합니다.' : '주소 분석 후 지역 여건과 운영계획을 함께 확인합니다.',
      text: `50평·직원 5명의 자동 예시는 실제 ${analysis.specialty} 규모나 채용계획과 다를 수 있어 사업성 점수로 확정하지 않습니다. 실제 면적·직원 수·월세를 입력해 확인하세요.`,
    };
  const siteKey = `${analysis.location.latitude.toFixed(5)}:${analysis.location.longitude.toFixed(5)}:${analysis.specialty}`;
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [siteNotes, setSiteNotes] = useState('');
  const [photos, setPhotos] = useState<Array<{ name: string; url: string }>>([]);
  useEffect(() => {
    setPhotos([]);
    try {
      setChecked(JSON.parse(localStorage.getItem(`fount-site-checks:${siteKey}`) || '{}'));
      setSiteNotes(localStorage.getItem(`fount-site-notes:${siteKey}`) || '');
    } catch { setChecked({}); setSiteNotes(''); }
  }, [siteKey]);
  useEffect(() => () => { photos.forEach(photo => URL.revokeObjectURL(photo.url)); }, [photos]);
  function toggleCheck(id: string) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try { localStorage.setItem(`fount-site-checks:${siteKey}`, JSON.stringify(next)); } catch { /* Browsing without storage still works. */ }
  }
  function updateSiteNotes(value: string) {
    setSiteNotes(value);
    try { localStorage.setItem(`fount-site-notes:${siteKey}`, value); } catch { /* Browsing without storage still works. */ }
  }
  function removePhoto(url: string) {
    URL.revokeObjectURL(url);
    setPhotos(current => current.filter(photo => photo.url !== url));
  }
  const checkedCount = Object.values(checked).filter(Boolean).length;

  if (mode === 'summary') return <section className="viability viability-combined-summary">
    <header>
      <span>입지·개원 판단</span>
      <h2>이 자리, 우리 병원에 맞을까요?</h2>
      <p>{analysis.location.displayName.split(',')[0]} · {analysis.specialty} · 주변 {analysis.radiusMeters.toLocaleString()}m</p>
      <div className="region-focus">서울·경기 집중 분석 <span>{!analyzed ? '주소 분석 전' : region === 'seoul' ? '서울' : region === 'gyeonggi' ? '경기' : '현재 집중 분석 지역 밖입니다'}</span></div>
    </header>
    <div className="viability-metrics">
      <article><span>지역 여건</span><strong>{clinicalScoreLabel(analysis)}<small> / 100</small></strong><small>환자층·경쟁·교통·지역 성장</small></article>
      <article><span>개원 사업성 · 시험 계산</span><strong>{customPlan && ready ? result.score : '입력 필요'}{customPlan && ready && <small> / 100</small>}</strong><small>예상 환자·운영비·월세·투자금 회수</small></article>
    </div>
    <div className="viability-combined-verdict"><span>두 가지를 함께 보면</span><h3>{verdict.title}</h3><p>{verdict.text}</p>
      <small>자동 예시는 {operatingInputs.areaPyeong}평·직원 {operatingInputs.staffCount}명, 월 고정비 약 {Math.round(fixedCostWon / 10000).toLocaleString()}만원입니다. 실제 운영계획을 입력하기 전에는 사업성 점수를 확정하지 않습니다.</small>
    </div>
  </section>;

  return <section className={`viability ${mode === 'details' ? 'viability-details' : ''}`}>
    <header>
      <span>THE FOUNT 개원 가능성 분석</span>
      <h2>{mode === 'details' ? '예상 환자와 운영비를 더 자세히 보면' : <>이 자리에서 환자를 확보하고,<br />운영비를 감당할 수 있을까요?</>}</h2>
      <p>{analyzed ? '공개 지역 자료와 입력한 운영 조건으로 예상 환자·매출·비용을 계산하는 참고 시뮬레이션입니다. 자료가 부족하면 점수를 확정하지 않습니다.' : '주소와 진료과를 선택하고 분석하면 공개 지역 자료를 보여드립니다. 아직 분석이나 매출 추정이 완료되지 않았습니다.'}</p>
    </header>

    {mode === 'standalone' && <div className="viability-new-score" role="status">
      <span>진료과 반영 종합점수 · 시험 계산</span>
      <strong>{newScore === null ? '—' : `${newScore} / 100`}</strong>
      <p>{newScore === null ? '주변 환자 수요와 운영비를 확인한 뒤 점수를 보여드립니다.' :
        newScore < 40 ? '환자 수요 또는 운영비 부담이 커서 다른 후보지도 함께 살펴보세요.' :
        newScore < 75 ? '가능성은 있지만 환자 확보와 비용 조건을 더 확인해보세요.' :
        '후보지로 검토할 만합니다. 실제 건물 조건도 확인해보세요.'}</p>
      <small>환자 수요 20 · 경쟁 15 · 개원 사업성 40 · 소비 8 · 교통 7 · 월세 5 · 성장 5. 자료가 없는 항목은 제외합니다.</small>
    </div>}
    {mode === 'standalone' && <div className="viability-metrics">
      <article><span>자리의 기본 조건</span><strong>{clinicalScoreLabel(analysis)}</strong><small>교통·인구·경쟁·성장 여건</small></article>
      <article><span>개원 사업성</span><strong>{customPlan && ready ? result.score : '—'}</strong><small>{customPlan && ready ? easyVerdict(result.score, result.coverage) : '실제 운영계획을 입력해주세요.'}</small></article>
    </div>}

    {!ready && <div className="viability-point"><h3>{region === 'outside' ? '서울·경기 후보지를 먼저 분석해보세요' : '환자 규모를 더 확인한 뒤 판단하겠습니다'}</h3><p>{region === 'outside' ? '현재는 서울과 경기 지역을 중심으로 분석을 제공하고 있습니다.' : '주변 병원이 적다는 이유만으로 좋은 자리라고 판단하지 않습니다. 주요 연령층과 같은 과 병원의 확인이 필요합니다.'}</p></div>}
    {ready && !customPlan && <div className="viability-point"><h3>자동 예시는 사업성 점수로 확정하지 않습니다</h3><p>현재 예시는 {operatingInputs.areaPyeong}평·직원 {operatingInputs.staffCount}명으로 월 고정비 약 {Math.round(fixedCostWon / 10000).toLocaleString()}만원을 가정합니다. 진료과와 개원 형태에 따라 크게 달라지므로 실제 면적·직원 수·월세를 입력한 뒤 점수를 확인하세요.</p></div>}
    {ready && <>
      <div className="viability-metrics">
        <article><span>한 달 예상 진료</span><strong>{Math.round(result.visits).toLocaleString()}건</strong><small>예상 범위 {Math.round(result.low).toLocaleString()}~{Math.round(result.high).toLocaleString()}건</small></article>
        <article><span>적자를 피하려면</span><strong>{Math.ceil(result.bepVisits!).toLocaleString()}건</strong><small>예상 환자로 {coverage}% 충족</small></article>
        <article><span>한 달 예상 매출</span><strong>{Math.round(result.revenueWon / 10000).toLocaleString()}만원</strong><small>{visitRevenue.automatic ? `${analysis.specialty}·지역별 1회 매출 자동 반영` : '직접 입력한 1회 매출 반영'}</small></article>
        <article><span>초기 투자금 회수</span><strong>{result.paybackMonths === null ? '10년 이상' : result.paybackMonths === 0 ? '입력 필요' : `약 ${Math.ceil(result.paybackMonths)}개월`}</strong><small>자리 잡은 뒤의 영업이익 기준</small></article>
      </div>

      {mode === 'details' && customPlan && result.scoreParts && <details className="viability-score-details">
        <summary>개원 사업성 점수에 반영한 내용</summary>
        <div>{[
          ['손익분기점 여유', result.scoreParts.breakEven],
          ['환자가 적게 올 때의 버팀 정도', result.scoreParts.downside],
          ['영업이익 여유', result.scoreParts.margin],
          ['초기 투자금 회수기간', result.scoreParts.payback],
          ['월세 부담', result.scoreParts.rent],
          ['대출 원금 상환 부담', result.scoreParts.debt],
        ].map(([label, value]) => <p key={String(label)}><span>{label}</span><b>{Math.round(Number(value))}점</b></p>)}</div>
        <small>한 항목이 좋아도 예상 환자가 월 운영비를 감당하지 못하면 사업성 점수가 높아지지 않습니다.</small>
      </details>}

      <div className="viability-flow">
        <h3>예상 환자는 이렇게 계산했습니다</h3>
        {[
          ['지역의 주요 연령 인구', targetPopulation, '명'],
          ['직장인·방문 인구에서 추가로 보는 환자층', market.outsidePopulation, '명'],
          ['의료상권 유입까지 반영한 한 달 진료 수요', result.marketVisits, '건'],
          ['경쟁병원을 고려한 한 달 예상 진료', result.visits, '건'],
        ].map(([label, value, unit]) => <div key={String(label)}><span>{label}</span><b>{Math.round(Number(value)).toLocaleString()}{unit}</b></div>)}
        <p>원장님이 어려운 가중치를 직접 입력하지 않아도 선택한 진료과와 주변 자료를 기준으로 자동 계산합니다.</p>
        <p>병원이 모인 지역은 경쟁뿐 아니라 외부 환자를 끌어오는 의료상권 효과도 함께 반영했습니다. 병원 수가 늘어난다고 환자가 똑같이 나뉘지는 않습니다.</p>
        <p>{competitors.some(c => c.attraction > 1) ? '공식 의사 수가 확인된 주변 의원은 규모 차이도 함께 고려했습니다.' : '같은 과 병원의 위치와 거리를 함께 살펴봤습니다.'}</p>
        <p>{visitRevenue.automatic
          ? `1회 예상 매출은 ${Math.round(visitRevenue.estimate.totalPerVisitWon / 1000) / 10}만원입니다. 보험 진료 ${Math.round(visitRevenue.estimate.insuredPerVisitWon / 1000) / 10}만원에 ${analysis.specialty}의 비급여 진료 가능성과 이 지역의 의료소비 수준을 보수적으로 더했습니다.`
          : `1회 예상 매출은 원장님이 입력한 ${inputs.revenuePerPatient.toLocaleString()}만원을 사용했습니다.`}</p>
      </div>

      {mode === 'standalone' && <div className="viability-point">
        <h3>쉽게 말씀드리면</h3>
        <p>{easyVerdict(result.score, result.coverage)}</p>
        <p>{result.low < result.bepVisits!
          ? '예상 환자가 적게 오는 경우에는 적자가 날 수 있습니다. 계약 전 월세, 직원 수, 건물 앞 실제 통행량을 꼭 확인하세요.'
          : '보수적으로 보아도 운영비를 넘길 가능성이 있습니다. 다만 주차, 건물 접근성, 같은 건물의 경쟁 진료과를 현장에서 확인해야 합니다.'}</p>
      </div>}

      {onOpenProfitability && <button className="viability-next" type="button" onClick={onOpenProfitability}>내 운영계획으로 수익성 자세히 보기</button>}
    </>}

    <details className="viability-site">
      <summary>
        <span className="viability-site-icon" aria-hidden="true">현장</span>
        <span><small>FIELD VISIT NOTE</small><b>현장에서 확인할 내용</b><em>임장 체크리스트와 사진을 한 곳에 남겨보세요.</em></span>
        <strong>{checkedCount}/{SITE_CHECK_COUNT}</strong>
      </summary>
      <div className="viability-site-body">
        <div className="viability-site-guide"><b>원장님이 현장에서 직접 확인하면 좋은 항목입니다.</b><p>체크와 메모는 이 기기에 후보지별로 자동 보관됩니다. 객관적인 데이터 점수와는 구분하여 보여드립니다.</p></div>
        <div className="viability-check-groups">{SITE_CHECK_GROUPS.map(group => <section key={group.id}>
          <header><h4>{group.title}</h4><p>{group.description}</p></header>
          <div className="viability-checks">{group.items.map(([id, label]) =>
            <label key={id} className={checked[id] ? 'checked' : ''}><input type="checkbox" checked={Boolean(checked[id])} onChange={() => toggleCheck(id)} /><span>{label}</span></label>)}</div>
        </section>)}</div>
        <label className="viability-site-notes"><b>현장 메모</b><span>중개사에게 확인할 내용, 주변 분위기, 건물의 장·단점을 자유롭게 적어보세요.</span><textarea value={siteNotes} onChange={event => updateSiteNotes(event.target.value)} maxLength={2000} rows={5} placeholder="예) 점심시간 직장인 유동이 많음. 주차장 입구가 좁어 SUV 진입은 추가 확인 필요." /><small>{siteNotes.length.toLocaleString()} / 2,000자</small></label>
        <div className="viability-photo-area">
          <div><b>현장 사진</b><p>건물 전경, 간판 위치, 출입구, 주차장, 엘리베이터, 주변 상권을 찍어두면 후보지 비교에 도움이 됩니다.</p></div>
          <label className="viability-photo-input">사진 첨부하기
            <input type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={event => {
              const remaining = Math.max(0, 8 - photos.length);
              const files = Array.from(event.target.files || []).slice(0, remaining).filter(file => file.size <= 5 * 1024 * 1024);
              setPhotos(current => [...current, ...files.map(file => ({ name: file.name, url: URL.createObjectURL(file) }))]);
              event.target.value = '';
            }} />
          </label>
        </div>
        {photos.length > 0 && <div className="viability-photos">{photos.map(photo =>
          <figure key={photo.url}><Image src={photo.url} alt={`현장 사진: ${photo.name}`} width={480} height={320} unoptimized /><figcaption>{photo.name}</figcaption><button type="button" onClick={() => removePhoto(photo.url)} aria-label={`${photo.name} 사진 삭제`}>삭제</button></figure>)}</div>}
        <small className="viability-photo-notice">사진은 최대 8장·장당 5MB까지 미리 볼 수 있습니다. 현재 미리보기 사진은 아직 계정에 저장되지 않으므로 원본을 함께 보관해주세요.</small>
      </div>
    </details>

    <AnalysisSavePanel analysis={analysis} scenario={ready && customPlan ? { assumptions, competitors } : undefined} onLoad={onLoad} />
    {mode === 'details' && <div className="viability-consultation"><h3>숫자와 현장 조건이 맞는지 함께 확인해보세요</h3><p>더파운트의 정밀 개원분석에서 실제 임대조건과 진료계획을 검토할 수 있습니다.</p><a href="https://www.thefount.co.kr/contact" target="_blank" rel="noopener noreferrer">정밀 개원분석 상담하기</a></div>}
    <details>
      <summary>자동 계산에 사용한 기준 보기</summary>
      <p>주요 연령층, 직장인·방문 인구, 의료상권 유입, 같은 과 병원의 거리와 확인된 의원 규모, 예상 운영비를 반영했습니다. 개원 사업성은 손익분기점, 환자가 적게 올 때의 적자 위험, 영업이익, 투자금 회수기간, 월세와 대출 상환 부담을 함께 계산합니다.</p>
      <p>진료 이용 가능성과 기본 운영비에는 아직 검증되지 않은 예시 기준이 포함되어 있습니다. 현장 통행량과 실제 임대 조건도 확인하지 않았으므로 최종 계약 판단이 아닌 1차 후보지 비교에 사용해주세요.</p>
    </details>
  </section>;
}
