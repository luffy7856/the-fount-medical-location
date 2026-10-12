import type { LocationAnalysis } from '@/data/location-types';

/** Observed drivers are separate from the population trend: no double-counted uplift. */
export function ForecastDrivers({analysis}:{analysis:LocationAnalysis}) {
  const history = [...(analysis.growthForecast?.ageHistory ?? [])].sort((a,b)=>a.year-b.year);
  const pediatric = analysis.specialty === '소아청소년과';
  const older = ['내과','정형외과','비뇨기과','안과','이비인후과','한의원'].includes(analysis.specialty);
  const groups = pediatric ? ['child'] as const : older ? ['middleAge','senior'] as const : ['youngAdult','middleAge'] as const;
  const points = history.flatMap(row=>groups.every(key=>typeof row[key]==='number' && Number.isFinite(row[key])) ? [{year:row.year,value:groups.reduce((sum,key)=>sum+row[key]!,0)}] : []);
  const first=points[0], last=points.at(-1);
  const change=first && last && last.year>first.year ? last.value-first.value : null;
  const plans=analysis.developmentPlans?.status==='available'?analysis.developmentPlans.plans:[];
  const housing=plans.filter(p=>/주택|아파트|주거|LH|재개발|재건축/.test(p.category+' '+p.name));
  const transport=plans.filter(p=>/교통|철도|지하철|도로|역세권/.test(p.category+' '+p.name));
  const scheduledHousing=housing.filter(p=>p.evidenceLevel==='confirmed_schedule');
  const scheduledTransport=transport.filter(p=>p.evidenceLevel==='confirmed_schedule');
  const rent=analysis.rentMarket;
  return <section className="forecast-history" aria-label="병원에 영향을 주는 추가 변화">
    <h3>우리 병원에 영향을 줄 다섯 가지 변화</h3>
    <article><h4>01 · 앞으로 주요 환자층이 늘어날까요?</h4>
      {change!==null && first && last ? <><p><b>{first.year}→{last.year} · {Math.abs(change).toLocaleString()}명 {change>0?'증가':change<0?'감소':'변화 없음'}</b></p><p>{analysis.specialty}의 주요 연령층이 {change>0?'늘어나는':change<0?'줄어드는':'유지되는'} 흐름입니다. 전체 인구 변화와 함께 환자 수요를 살펴보세요.</p><p>{points.map(p=>`${p.year}년 ${p.value.toLocaleString()}명`).join(' → ')}</p></> : <p>주요 환자층의 연도별 변화를 아직 확인하지 못했습니다.</p>}
    </article>
    <article><h4>02 · 새 아파트와 입주가 예정돼 있나요?</h4><p>{scheduledHousing.length ? `앞으로 3년 안에 일정과 진행상태가 확인된 주거 계획이 ${scheduledHousing.length}건 있습니다.` : housing.length ? `주거 관련 계획구역 ${housing.length}건은 확인됐지만, 3년 안의 입주 일정은 확인되지 않아 점수에는 더하지 않았습니다.` : '확인된 입주 일정이 없습니다. 입주가 없다는 뜻은 아닙니다.'}</p>{housing.slice(0,3).map(p=><p key={p.id}>{p.name} · {p.targetDate || '입주 시점 미확인'}</p>)}</article>
    <article><h4>03 · 같은 과 병원이 더 늘고 있나요?</h4><p>현재 주변 {analysis.specialty}는 {analysis.counts.matchingSpecialty}곳{analysis.countLimits?.matchingSpecialty?' 이상':''}입니다. 개원·폐업 이력과 의사 수의 연도별 자료가 확보되면 경쟁의 증가·감소를 함께 보여드립니다.</p></article>
    <article><h4>04 · 임대료와 빈 상가는 어떻게 변하나요?</h4><p>{rent?.status==='available' && rent.monthlyRentPerPyeongManwon!==undefined ? `현재 지역 참고 임대료는 평당 월 ${rent.monthlyRentPerPyeongManwon}만원입니다. (${rent.referenceDate || '공표 기준'})` : '지역 참고 임대료를 아직 확인하지 못했습니다.'} 임대료 상승률과 공실률 변화는 추가 자료가 필요합니다.</p></article>
    <article><h4>05 · 교통 개선이나 공사 영향을 받나요?</h4><p>{scheduledTransport.length ? `3년 안에 일정과 진행상태가 확인된 교통 계획 ${scheduledTransport.length}건을 확인했습니다.` : transport.length ? `교통 관련 계획 ${transport.length}건은 있지만, 3년 안의 개통 일정이 확인되지 않아 참고로만 보여드립니다.` : '확정된 교통 개통 일정을 아직 확인하지 못했습니다.'} 재개발은 장기 효과뿐 아니라 이주·공사 중 환자 감소도 확인해야 합니다.</p>{transport.slice(0,3).map(p=><p key={p.id}>{p.name} · {p.targetDate || '개통 시점 미확인'}</p>)}</article>
    <small>추가 변화는 위의 인구 추세 그래프와 별도로 살펴봅니다. 확인되지 않은 입주·개통 효과를 숫자로 더하지 않습니다.</small>
  </section>;
}
