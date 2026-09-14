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
  const d=a.demographics, p=a.regionalProfile;
  const fmt=(n:number)=>Math.round(n).toLocaleString('ko-KR');
  const pct=(n:number,total:number)=>(n/total*100).toFixed(1)+'%';
  const sections: {title:string;text:string;source:string}[]=[];
  const focus=a.specialty==='피부과'||a.specialty==='성형외과'?'미용 중심 진료와 질환 중심 진료는 대상 환자와 방문 목적이 다릅니다. 연령 구성과 소비 지표를 진료 모델에 맞춰 비교하세요.':a.specialty==='소아청소년과'?'아동 인구와 학교·보육시설을 함께 보고 실제 가족 거주와 반복 방문 가능성을 비교하세요.':a.specialty==='정형외과'||a.specialty==='내과'?'중장년·고령층의 거주 규모와 직장 수요를 함께 보고 반복 방문 접근성을 비교하세요.':'목표 진료 대상의 연령대와 실제 방문 동선을 함께 비교하세요.';
  if(d&&d.residentPopulation>0){
    const sameYear=p?.year===d.year;
    const groups: ReadonlyArray<readonly [string,number|undefined]>=sameYear&&p ? [
      ['15세 미만',p.childPopulation],['20~39세',p.youngAdultPopulation],['40~59세',p.middleAgePopulation],['65세 이상',p.seniorPopulation]
    ] as const : [];
    const ages=groups.filter((item):item is readonly [string,number]=>typeof item[1]==='number').map(([label,n])=>`${label} ${pct(n,d.residentPopulation)}`).join(', ');
    const sex=sameYear&&p?.malePopulation!==undefined&&p.femalePopulation!==undefined ? `남성 ${pct(p.malePopulation,d.residentPopulation)}, 여성 ${pct(p.femalePopulation,d.residentPopulation)}입니다. ` : '';
    sections.push({title:`환자층과 ${a.specialty} 수요`,text:`${d.areaName}의 거주인구는 ${fmt(d.residentPopulation)}명입니다. ${sex}${ages ? `주요 연령대는 ${ages}입니다. `:''}${focus}`,source:`SGIS ${d.year}년 · 행정동 전체 주민 기준. 연령 구간은 일부만 표시하며 실제 방문환자 비율은 아닙니다.`});
    const ratio=d.workerPopulation/d.residentPopulation;
    sections.push({title:'거주 수요와 직장 수요의 균형',text:`거주인구 ${fmt(d.residentPopulation)}명에 비해 사업체 종사자는 ${fmt(d.workerPopulation)}명으로, 거주인구 규모의 약 ${ratio.toFixed(1)}배입니다. ${ratio>=1.5?'직장 수요의 규모가 커 평일 점심·퇴근 시간 진료와 건물 앞 동선을 특히 살펴볼 만합니다.':ratio<=.7?'주거 수요의 규모가 상대적으로 커 생활권 안에서 반복 방문할 환자층과 주말 진료 수요를 살펴볼 만합니다.':'주거와 직장 수요를 함께 고려하고 평일·주말의 진료시간을 비교할 만합니다.'} 두 집계는 서로 겹칠 수 있어 합쳐서 고유 환자 수나 인구 비율로 계산하지 않습니다.`,source:`SGIS ${d.year}년 · ${d.areaName} 주민·사업체 종사자 규모 비교`});
  }else sections.push({title:'환자층과 생활권',text:'현재 이 지역의 연령·성별·거주 및 종사자 자료가 충분하지 않습니다. 목표 환자층이 실제로 생활하고 이동하는 범위를 현장에서 확인해야 합니다.',source:'확보된 인구자료 범위에서만 해석합니다.'});
  const facilities=p ? [p.elementarySchools!==undefined?`초등학교 ${fmt(p.elementarySchools)}곳`:'',p.childcareFacilities!==undefined?`어린이집·유치원 ${fmt(p.childcareFacilities)}곳`:''].filter(Boolean).join(', ') : '';
  sections.push({title:'주변 상권과 생활환경',text:`${p?.character?`확인된 인구와 시설 특성에서는 '${p.character}' 유형으로 해석됩니다.`:'상권 유형은 주변 주거·업무시설과 실제 보행 동선을 함께 확인해야 합니다.'}${facilities?` 선택 반경 안에서 ${facilities}이 검색되었습니다. 학교·보육시설 수는 가족 생활권의 참고 신호이며 소아 진료 수요를 보장하지는 않습니다.`:''} 상가 업종 구성과 아파트 입주율이 확인되지 않은 경우 특정 상권이나 신도시·구도심으로 단정하지 않습니다.`,source:`지역 특성: SGIS · 시설: ${a.provider==='kakao'?'Kakao Local':'OpenStreetMap'} 장소검색 · 반경 ${fmt(a.radiusMeters)}m`});
  const competition=a.metrics.find(m=>m.label==='경쟁환경');
  const consumer=a.consumerPower;
  const consumerText=consumer?.status==='available'&&consumer.percentile!==undefined?`지역 소비총액은 서울 행정동 비교에서 ${consumer.percentile}백분위입니다. 소비총액이 큰 지역이라도 개별 환자의 지불 여력이나 병원 객단가와 같지는 않습니다. `:'';
  sections.push({title:'경쟁과 진료 포지셔닝',text:`반경 ${fmt(a.radiusMeters)}m에서 ${a.specialty} 직접 경쟁 장소 ${fmt(a.counts.matchingSpecialty)}곳${a.countLimits?.matchingSpecialty?' 이상':''}이 확인됩니다. ${competition?.value!==null&&competition?.value!==undefined&&competition.value<50?'경쟁 부담이 큰 편이므로 세부 진료, 가격대, 운영시간이 얼마나 겹치는지 비교하고 환자가 선택할 이유를 구체화해야 합니다.':'병원 수만으로 유불리를 결정하기보다 같은 과의 세부 진료와 환자층이 겹치는지 비교해야 합니다.'} ${consumerText}`,source:`경쟁: 장소명·분류 검색 기준${consumer?.status==='available'?` · 소비: ${consumer.source} ${consumer.referencePeriod||''}`:''}`});
  const dev=a.developmentPlans;
  const plans=dev?.status==='available'?dev.plans.slice(0,3):[];
  const f=a.growthForecast;
  const base=f?.historical.find(point=>point.year===f.baseYear),last=f?.projected[f.projected.length-1];
  const projection=f?.status==='available'&&base&&last&&base.residentPopulation>0 ? ` 최근 자료 추세를 연장하면 ${f.baseYear}년 대비 ${last.year}년 거주인구는 ${Math.abs((last.residentPopulation/base.residentPopulation-1)*100).toFixed(1)}% ${last.residentPopulation>=base.residentPopulation?'증가':'감소'}하는 시나리오입니다. 이는 과거 추세의 연장이며 개발사업 효과를 반영한 확정 예측은 아닙니다.`:'';
  sections.push({title:'개발계획과 향후 변화',text:(plans.length?`확인된 계획은 ${plans.map(plan=>`${plan.name}(${plan.status}${plan.targetDate?`, 목표 ${plan.targetDate}`:''})`).join(', ')}입니다. 계획 존재만으로 호재나 환자 증가를 단정할 수 없으며 일정·사업 범위와 실제 입주 시점을 확인해야 합니다.`:'현재 확보된 자료만으로 특정 아파트 입주·재개발·교통 확장을 개발 호재로 제시할 수는 없습니다. 계약 전 확정 사업의 위치와 일정, 실제 입주 여부를 확인하세요.')+projection,source:[plans.length?`${dev?.source} ${dev?.referenceDate||''}`:'확인된 개발사업만 반영',f?.status==='available'?`SGIS · ${f.model}`:''].filter(Boolean).join(' · ')});
  return sections;
}
