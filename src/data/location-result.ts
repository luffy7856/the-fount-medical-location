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
