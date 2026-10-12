'use client';
import { useState } from 'react';
import { ViabilityPanel } from '@/components/viability-panel';
import { FinancialPlanningPanel } from '@/components/financial-planning-panel';
import { DEFAULT_OPENING_INPUTS } from '@/data/opening-plan';
import type { LocationAnalysis } from '@/data/location-types';
import { refineClinicalAnalysis } from '@/data/clinical-evaluation';

const fixture:LocationAnalysis={
  mode:'live',provider:'kakao',analyzedAt:'2026-09-14T00:00:00.000Z',specialty:'피부과',radiusMeters:1000,
  location:{displayName:'서울 · 디자인 검토용 후보지 (가상 자료)',latitude:37.5,longitude:127.03},
  places:[1,2,3].map(n=>({id:String(n),name:`예시 피부과 ${n}`,kind:'hospital',specialty:'피부과',latitude:37.5,longitude:127.03,distanceMeters:n*100})),
  counts:{medical:3,matchingSpecialty:3,pharmacy:8,transit:2,parking:2},metrics:[],observedScore:80,grade:'B',confidence:92,
  demographics:{source:'SGIS',year:2025,areaName:'예시 지역',administrativeCode:'00000000',residentPopulation:28400,workerPopulation:36100,households:13700,businesses:4200,averageAge:41.2},
  regionalProfile:{source:'SGIS · Kakao Local',year:2025,areaName:'예시 지역',malePopulation:13700,femalePopulation:14700,childPopulation:2800,youngAdultPopulation:9200,middleAgePopulation:11200,seniorPopulation:5200,elementarySchools:3,childcareFacilities:9,character:'주거·업무 혼합지역',characterReason:'거주인구와 직장인구가 함께 있는 지역입니다.',specialtyFit:['20~50대 생활인구를 함께 살펴볼 수 있습니다.'],doctorChecks:['건물 앞 실제 통행량과 주차를 확인하세요.']},
  growthForecast:{status:'available',source:'SGIS',model:'최근 3개년 선형 추세 외삽',areaName:'예시 지역',baseYear:2025,forecastYears:[2026,2027,2028],historical:[],projected:[],annualChange:{residentPopulation:1.8,workerPopulation:2.4,businesses:1.1},growthScore:72,message:'최근 인구와 직장인 흐름은 완만한 상승세입니다.'},
  insight:'검토용 예시',strengths:[],risks:[],limitations:['실제 분석 데이터 아님'],
};
export default function ViabilityPreview(){
  const [inputs,setInputs]=useState(DEFAULT_OPENING_INPUTS);
  const [scenario,setScenario]=useState('normal');
  const sample: LocationAnalysis = { ...fixture, metrics: ['잠재환자 수요','경쟁환경','소비력','접근성','비용효율','성장성'].map(label => ({label,value:75,note:'가상 자료',color:'#169e91'})),
    regionalProfile: scenario === 'missing' ? undefined : { ...fixture.regionalProfile!,
      youngAdultPopulation: scenario === 'sparse' ? 100 : 9200, middleAgePopulation: scenario === 'sparse' ? 150 : 11200 },
    demographics: { ...fixture.demographics!, residentPopulation: scenario === 'sparse' ? 900 : 28400 },
    places: fixture.places.map(place => ({...place,medicalCapacity:{source:'HIRA',institutionType:'의원',doctorCount:scenario === 'large' ? 8 : 1,referenceDate:'가상 시험'}})) };
  const analysis = refineClinicalAnalysis(sample);
  return <main className="viability-preview" style={{maxWidth:820,margin:'0 auto',padding:'24px 12px',background:'#f7fafb',minHeight:'100vh'}}>
    <div style={{padding:20,border:'1px solid #d9e4e8',borderRadius:12,background:'white',lineHeight:1.8}}><b>THE FOUNT · 개원 사업성 화면 미리보기</b><p>아래 숫자는 화면 확인을 위한 예시입니다. 실제 서비스에서는 주소와 진료과를 선택하면 나머지 항목을 자동으로 계산합니다.</p><a href="/location">지도 기반 분석 화면으로 돌아가기 →</a></div>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',padding:'20px 0'}}>{[['normal','기본 후보지'],['sparse','환자층이 적은 지역'],['large','큰 경쟁의원이 있는 지역'],['missing','연령 자료가 없는 지역']].map(([value,label])=><button key={value} type="button" onClick={()=>setScenario(value)} aria-pressed={scenario===value} style={{padding:'10px 14px',border:'1px solid #bbd5d1',borderRadius:8,background:scenario===value?'#125e62':'white',color:scenario===value?'white':'#163347'}}>{label}</button>)}</div>
    <ViabilityPanel analysis={analysis} inputs={inputs} mode="summary"/>
    <ViabilityPanel analysis={analysis} inputs={inputs} mode="details"/>
    <p style={{padding:20}}><a href="/location/preview/model-review">컨설턴트 의견·실제 개원 결과 기록하기 →</a></p>
    <details style={{padding:20,border:'1px solid #dae4e8',borderRadius:12,background:'white'}}><summary style={{cursor:'pointer',fontWeight:700}}>운영계획 숫자를 자세히 바꾸기</summary><FinancialPlanningPanel analysis={fixture} inputs={inputs} onChange={setInputs}/></details>
  </main>;
}
