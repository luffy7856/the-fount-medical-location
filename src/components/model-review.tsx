'use client';
import { useState, type FormEvent } from 'react';
import { specialties } from '@/data/specialties';
import { CLINICAL_MODEL_VERSION } from '@/data/clinical-evaluation';
import './model-review.css';

type RecordEntry = { id: string; recordedAt: string; modelVersion: string; values: Record<string, string>; consent: boolean };
const STORAGE = 'fount-model-review-v1';
export default function ModelReview() {
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [message, setMessage] = useState('');
  const [loaded, setLoaded] = useState(false);
  function load() {
    try { const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (!Array.isArray(saved)) throw new Error(); setRecords(saved); setLoaded(true);
      setMessage(`${saved.length}건의 기록을 불러왔습니다.`);
    } catch { setMessage('저장 기록을 읽지 못했습니다. 브라우저 저장 설정을 확인해주세요.'); }
  }
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget;
    const data = new FormData(form);
    try {
      const prior = JSON.parse(localStorage.getItem(STORAGE) || '[]');
      if (!Array.isArray(prior)) throw new Error();
      const record: RecordEntry = { id: crypto.randomUUID(), recordedAt: new Date().toISOString(), modelVersion: CLINICAL_MODEL_VERSION,
        values: Object.fromEntries(Array.from(data.entries()).filter(([key]) => key !== 'consent').map(([key, value]) => [key, String(value)])), consent: data.get('consent') === 'on' };
      const next = [record, ...prior]; localStorage.setItem(STORAGE, JSON.stringify(next));
      setRecords(next); setLoaded(true); setMessage('이 브라우저에 저장했습니다. 파일로 내보내 다른 곳에도 보관해주세요.'); form.reset();
    } catch { setMessage('저장하지 못했습니다. 입력 내용은 화면에 그대로 남아 있습니다.'); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ schemaVersion: 1, records }, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'the-fount-model-review.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="model-review"><a href="/location">← 입지분석으로 돌아가기</a><header><span>THE FOUNT · 내부 검토</span><h1>현장의 판단을 모읍니다</h1><p>서울·경기 후보지의 컨설턴트 의견과 개원 후 결과를 기록하세요. 자료는 이 브라우저에 저장되며, 점수에 자동 반영되지 않습니다.</p></header>
    <form onSubmit={save}><section><h2>어떤 후보지인가요?</h2><div className="review-grid">
      <label>사례 이름<input name="caseName" required maxLength={100} placeholder="예: 분당 후보지 A (익명)" /></label>
      <label>지역<select name="region"><option>서울</option><option>경기</option></select></label>
      <label>후보지 주소<input name="address" required maxLength={200} /></label>
      <label>진료과<select name="specialty">{specialties.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>개원 시점<input name="openingMonth" type="month" /></label>
      <label>기존 분석 번호 (있는 경우)<input name="analysisId" maxLength={100} /></label>
    </div></section><section><h2>컨설턴트는 어떻게 판단했나요?</h2><div className="review-grid">
      <label>추천 여부<select name="recommendation"><option value="">아직 의견을 받지 않음</option><option>추천</option><option>조건부 추천</option><option>보류</option><option>비추천</option></select></label>
      <label>다른 후보지와 비교 순위<input name="ranking" placeholder="예: A가 B보다 유리" maxLength={200} /></label>
    </div><label>추천하거나 탈락시킨 핵심 이유<textarea name="reason" rows={3} maxLength={3000} /></label>
    <label>어떤 조건이면 판단이 바뀌나요?<textarea name="reversal" rows={3} placeholder="예: 주차 확보 시 검토 가능, 월세가 낮아지면 A 추천" maxLength={3000} /></label>
    <label>현장에서 확인한 내용 / 질문 답변<textarea name="observations" rows={4} maxLength={10000} placeholder="인구, 경쟁병원 규모, 간판, 주차, 동선, 개발계획 등" /></label></section>
    <section><h2>실제 개원 결과가 있나요?</h2><p>자료가 있는 달만 추가하세요. 환자 이름 등 개인별 진료정보는 입력하지 않습니다.</p><div className="review-grid">
      <label>실적 기준 월<input name="outcomeMonth" type="month" /></label>
      <label>월 진료 방문 건수<input name="visits" type="number" min={0} step={1} /></label>
      <label>월매출 (만원)<input name="revenueManwon" type="number" min={0} step="0.1" /></label>
      <label>월세·관리비 합계 (만원)<input name="rentManwon" type="number" min={0} step="0.1" /></label>
      <label>월 영업이익 (만원)<input name="profitManwon" type="number" step="0.1" /></label>
      <label>확인 방법<input name="evidence" maxLength={200} placeholder="예: 원장님 제공 월별 정산표" /></label>
    </div><label>예상과 달랐던 점<textarea name="outcomeNotes" rows={3} maxLength={3000} /></label>
    <label className="review-consent"><input name="consent" type="checkbox" />제공자의 허락을 확인했으며, 이 기록을 모델 개선에 활용할 수 있습니다.</label></section>
    <button type="submit">이 브라우저에 검토 기록 저장</button></form>
    <p role="status" aria-live="polite">{message}</p><section><h2>저장 기록</h2><div className="review-actions"><button onClick={load}>이 브라우저 기록 불러오기</button><button disabled={!loaded || !records.length} onClick={download}>기록 파일 내보내기</button></div>
    {records.map(record => <article key={record.id}><b>{record.values.caseName}</b><p>{record.values.region} · {record.values.specialty} · {record.values.recommendation || '의견 대기'}</p><small>{record.consent ? '개선 활용 동의 확인' : '개선 활용 동의 미확인'}</small></article>)}</section>
  </main>;
}
