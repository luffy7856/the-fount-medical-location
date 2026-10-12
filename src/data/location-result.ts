import type { LocationAnalysis } from './location-types';

// Shared editorial model for the screen and PDF; scores and source data stay intact.
export function distinctNotes(notes: string[], limit = 6) {
  const accepted: string[] = [];
  const normalize = (text: string) => text.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
  const pairs = (text: string) => new Set(Array.from({ length: Math.max(0, text.length - 1) }, (_, i) => text.slice(i, i + 2)));
  for (const note of notes.filter(Boolean)) {
    const key = normalize(note), words = pairs(key);
    if (accepted.some(previous => {
      const other = normalize(previous), otherWords = pairs(other);
      const common = Array.from(words).filter(word => otherWords.has(word)).length;
      return key.includes(other) || other.includes(key) || common / Math.max(1, Math.min(words.size, otherWords.size)) > .72;
    })) continue;
    accepted.push(note);
    if (accepted.length >= limit) break;
  }
  return accepted;
}

export function locationResult(a: LocationAnalysis) {
  const enough = a.confidence >= 90 && a.metrics.filter(m => m.value !== null).length >= 4;
  const label = !enough ? '다른 후보지와 비교하며 검토하세요' : a.observedScore >= 75 ? '현장 확인을 우선 진행할 후보지입니다' : a.observedScore >= 60 ? '장점과 부담을 비교한 뒤 결정하세요' : '다른 자리도 함께 찾아보세요';
  const text = !enough ? '확인된 자료로 후보지의 특징은 볼 수 있지만, 계약을 결정하기에는 아직 확인할 조건이 남아 있습니다.' : a.observedScore >= 75 ? '확인된 수요와 운영 조건에서 좋은 신호가 있습니다. 건물 접근성과 실제 임대조건까지 맞는지 확인해보세요.' : a.observedScore >= 60 ? '유리한 조건과 부담 요인이 함께 있습니다. 진료 차별화와 월 고정비를 다른 후보지와 비교해보세요.' : '현재 확인된 조건에서는 부담이 큽니다. 같은 진료과의 다른 후보지와 비용·환자층을 비교해보세요.';
  const strengths = a.aiInterpretation?.strengths.map(item => item.text) || a.strengths;
  const risks = a.aiInterpretation?.risks.map(item => item.text) || a.risks;
  const reasons = distinctNotes([strengths[0], risks[0], a.regionalProfile?.characterReason || ''].filter(Boolean), 3);
  const patientNotes = distinctNotes([...reasons, ...(a.regionalProfile?.specialtyFit || [])], 6).filter(note => !reasons.includes(note)).slice(0, 3);
  const operatingMetrics = a.metrics.filter(m => ['경쟁환경', '소비력', '접근성', '비용효율', '성장성'].includes(m.label));
  const checks = [
    { title: '목표 환자층의 실제 동선', action: '평일 점심·퇴근 시간과 주말에 건물 앞을 방문해 연령대, 보행량, 출입 동선을 비교하세요.', decision: '주요 환자층이 진료시간에 이 건물까지 오는지 확인되면 수요 가정을 구체화할 수 있습니다.' },
    { title: '경쟁병원과 다른 진료 이유', action: `가까운 ${a.specialty} 병원의 세부 진료, 가격대, 운영시간과 대기 수준을 확인하세요.`, decision: '진료 범위와 환자층이 겹친다면 차별화 전략을 먼저 정하고 후보지를 비교하세요.' },
    { title: '층·주차·간판의 접근성', action: '입주 층, 엘리베이터, 장애인 접근, 주차 가능 대수와 간판 노출을 직접 확인하세요.', decision: '지도상 접근성이 좋아도 건물 출입이 불편하면 환자 방문에는 불리할 수 있습니다.' },
    { title: '실제 임대료와 감당할 환자 수', action: '보증금·월세·관리비·공사비 견적을 받아 수익성 메뉴에 입력하세요.', decision: '손익분기 환자 수를 감당하기 어렵다면 면적·비용을 조정하거나 다른 후보지를 검토하세요.' }
  ];
  return { label, text, tone: !enough ? 'hold' : a.observedScore >= 75 ? 'positive' : a.observedScore >= 60 ? 'neutral' : 'negative', reasons, patientNotes, operatingMetrics, checks };
}

export function locationNarrative(a: LocationAnalysis) {
  const d = a.demographics, p = a.regionalProfile;
  const fmt = (n: number) => Math.round(n).toLocaleString('ko-KR');
  const pct = (n: number, total: number) => `${Math.round(n / total * 1000) / 10}%`;
  const sections: { title: string; text: string; source: string }[] = [];
  const sameYear = Boolean(d && p && d.year === p.year);
  const ageShare = (value: number | undefined) => sameYear && d && d.residentPopulation > 0 && value !== undefined ? pct(value, d.residentPopulation) : null;

  if (d && d.residentPopulation > 0) {
    const child = ageShare(p?.childPopulation), young = ageShare(p?.youngAdultPopulation);
    const middle = ageShare(p?.middleAgePopulation), senior = ageShare(p?.seniorPopulation);
    const ageLine = [child && `15세 미만 ${child}`, young && `20~39세 ${young}`, middle && `40~59세 ${middle}`, senior && `65세 이상 ${senior}`].filter(Boolean).join(', ');
    const sexLine = sameYear && p?.malePopulation !== undefined && p.femalePopulation !== undefined
      ? ` 남성 ${pct(p.malePopulation, d.residentPopulation)}, 여성 ${pct(p.femalePopulation, d.residentPopulation)}입니다.` : '';
    const specialtyLine = a.specialty === '소아청소년과' && child ? `소아청소년과에서는 15세 미만 주민 ${child}와 주변 학교·보육시설을 함께 볼 만합니다.`
      : ['내과', '정형외과', '한의원', '안과', '비뇨기과'].includes(a.specialty) && (middle || senior) ? `${a.specialty}에서는 중장년·고령 주민 비중이 진료 대상과 맞는지 살펴볼 만합니다.`
      : ['피부과', '성형외과'].includes(a.specialty) && young ? `${a.specialty}에서는 20~39세 주민 ${young}와 직장인 생활권의 시간대를 함께 살펴볼 만합니다.`
      : `이 연령 구성이 ${a.specialty}의 주된 진료 대상과 맞는지 볼 수 있습니다.`;
    sections.push({
      title: '이 지역에는 어떤 사람이 살까요?',
      text: `${d.areaName}에는 ${fmt(d.residentPopulation)}명이 거주합니다.${sexLine}${ageLine ? ` 주요 연령대는 ${ageLine}입니다.` : ''} ${specialtyLine}`,
      source: `지역 주민 통계 ${d.year}년 · ${d.areaName} 전체 주민 기준. 실제 병원 방문자 수가 아닙니다.`,
    });
    const ratio = d.workerPopulation / d.residentPopulation;
    const rhythm = ratio >= 1.5 ? '평일 낮에는 직장인 방문을 기대할 수 있고, 퇴근 뒤·주말은 따로 살펴볼 필요가 있습니다.'
      : ratio <= .7 ? '주민의 반복 방문이 중요한 생활권으로, 집에서 병원까지 오는 길과 주말 진료를 살펴볼 만합니다.'
      : '주민과 직장인 생활이 함께 있는 곳으로, 평일 낮과 저녁의 환자 흐름을 나누어 볼 만합니다.';
    const live = a.livingPopulation?.status === 'available' && a.livingPopulation.total !== undefined
      ? ` 선택한 ${String(a.livingPopulation.hour).padStart(2, '0')}시에는 주변에 약 ${fmt(a.livingPopulation.total)}명이 머무는 것으로 집계됩니다.` : '';
    sections.push({
      title: '주거지인가요, 직장인 생활권인가요?',
      text: `거주 주민 ${fmt(d.residentPopulation)}명, 지역 사업체 종사자 ${fmt(d.workerPopulation)}명입니다. ${rhythm}${live}`,
      source: `지역 주민·사업체 종사자 ${d.year}년. 두 집계는 겹칠 수 있으며 실제 환자 수로 합산하지 않습니다.${live ? ' 시간대별 주변 인구는 서울시 생활인구 자료입니다.' : ''}`,
    });
  } else {
    sections.push({ title: '이 지역에는 어떤 사람이 살까요?', text: '주변 주민의 연령과 직장인 규모를 아직 확인하지 못했습니다. 가까운 주거지와 업무시설, 진료시간대의 사람 흐름부터 살펴볼 자리입니다.', source: '지역 인구 자료 미확보' });
  }

  const schools = p?.elementarySchools !== undefined ? `초등학교 ${fmt(p.elementarySchools)}곳` : '';
  const care = p?.childcareFacilities !== undefined ? `어린이집·유치원 ${fmt(p.childcareFacilities)}곳` : '';
  const facilities = [schools, care].filter(Boolean).join(', ');
  const familyLine = facilities ? `선택한 주변 범위에는 ${facilities}이 있습니다.${a.specialty === '소아청소년과' ? ' 가족 단위 방문을 생각할 때 학교와 집에서 이 건물까지 오는 길이 중요합니다.' : ''}` : '';
  sections.push({
    title: '주변은 어떤 생활권인가요?',
    text: `${p?.character ? `${p.character}으로 보입니다. ${p.characterReason}` : '주변 주거지와 업무시설의 비중을 더 확인해야 합니다.'} ${familyLine}`,
    source: `지역 성격은 주민·직장인 자료를 바탕으로 분류했습니다. 학교·보육시설은 주변 ${fmt(a.radiusMeters)}m의 지도 검색 결과입니다.`,
  });

  const competing = a.counts.matchingSpecialty;
  const competitionScore = a.metrics.find(metric => metric.label === '경쟁환경')?.value;
  const competitionLine = competitionScore !== null && competitionScore !== undefined && competitionScore < 50
    ? '같은 과 병원이 촘촘해 신규 개원 시 진료내용과 운영시간의 차별화가 중요합니다.'
    : competing === 0 ? '현재 등록된 같은 과 병원은 찾지 못했습니다. 환자 수요와 가까운 생활권의 병원을 함께 살펴볼 자리입니다.'
      : '가까운 병원들이 어떤 진료를 주로 하는지 비교하면 이 자리의 틈을 더 구체적으로 찾을 수 있습니다.';
  const consumer = a.consumerPower;
  const consumerLine = consumer?.status === 'available' && consumer.percentile !== undefined
    ? `지역 소비 활동은 비교 지역 중 ${consumer.percentile >= 70 ? '활발한' : consumer.percentile <= 30 ? '낮은' : '중간'} 편입니다.${consumer.medicalPercentile !== undefined ? ` 의료 관련 소비도 함께 확인됐습니다.` : ''}` : '';
  sections.push({
    title: '같은 과 병원과 지역 소비는 어떤가요?',
    text: `주변 ${fmt(a.radiusMeters)}m에서 ${a.specialty} 병원 ${fmt(competing)}곳${a.countLimits?.matchingSpecialty ? ' 이상' : ''}이 검색됩니다. ${competitionLine} ${consumerLine}`,
    source: `같은 진료과는 병원명·분류 검색 기준.${consumerLine ? ` 소비는 ${consumer?.source} ${consumer?.referencePeriod || ''} 기준으로, 병원 매출이나 환자 1명의 지출액과 다릅니다.` : ''}`,
  });

  const transit = a.counts.transit, parking = a.counts.parking;
  const rent = a.rentMarket;
  const rentLine = rent?.status === 'available' && rent.monthlyRentPerPyeongManwon !== undefined
    ? `주변 상가의 평당 월세 참고값은 ${rent.monthlyRentPerPyeongManwon.toLocaleString('ko-KR')}만원입니다.` : '이 호실의 실제 월세는 아직 입력되지 않았습니다.';
  sections.push({
    title: '환자가 오기 쉽고 월세를 감당할 만한가요?',
    text: `주변 지하철역 ${fmt(transit)}곳, 등록된 주차시설 ${fmt(parking)}곳을 확인했습니다. ${transit >= 2 ? '대중교통으로 오는 환자의 동선을 살펴볼 만합니다.' : parking >= 2 ? '차량으로 오는 환자의 주차와 건물 출입을 살펴볼 만합니다.' : '건물 앞 보행 동선과 주차 가능 여부가 중요합니다.'} ${rentLine}`,
    source: `역·주차시설은 주변 ${fmt(a.radiusMeters)}m 지도 검색 기준. 주차시설 수는 해당 건물의 주차 가능 대수가 아닙니다.${rentLine && rent?.status === 'available' ? ` 월세는 ${rent.source}의 지역 참고값으로 실제 계약서 금액과 다릅니다.` : ''}`,
  });

  const plans = a.developmentPlans?.status === 'available' ? a.developmentPlans.plans.slice(0, 3) : [];
  const f = a.growthForecast;
  const base = f?.historical.find(point => point.year === f.baseYear), last = f?.projected.at(-1);
  const trend = f?.status === 'available' && base && last && base.residentPopulation > 0
    ? `최근 지역 변화가 이어진다면 ${last.year}년 주민은 ${f.baseYear}년보다 ${last.residentPopulation >= base.residentPopulation ? '늘어나는' : '줄어드는'} 흐름으로 보입니다.` : '';
  const planLine = plans.length ? `주변에서 확인된 계획은 ${plans.map(plan => plan.name).join(', ')}입니다.` : '';
  sections.push({
    title: '앞으로 이 지역은 어떻게 달라질까요?',
    text: `${trend || '최근 몇 년의 지역 변화를 충분히 확인하지 못했습니다.'} ${planLine || '현재 확보한 자료에서 구체적인 개발계획은 확인되지 않았습니다.'}${plans.length ? ' 계획 위치와 실제 진행시기를 확인하면 개원 시점에 미칠 영향을 더 구체적으로 볼 수 있습니다.' : ''}`,
    source: `${f?.status === 'available' ? `지역 주민 추세 ${f.baseYear}년 기준. 향후 값은 최근 흐름을 연장한 추정입니다.` : '연도별 지역 자료 부족.'} ${plans.length ? `${a.developmentPlans?.source}의 계획구역 정보이며 준공·입주가 확정됐다는 뜻은 아닙니다.` : ''}`,
  });
  return sections;
}
