import type { LocationAnalysis } from '@/data/location-types';
import { INPUT_LIMITS, type OpeningInputs } from '@/data/opening-plan';
import { specialties } from '@/data/specialties';
import { buildMedicalReport, REPORT_VERSION } from '@/lib/medical-report';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
type ReportPayload={analysis:LocationAnalysis;openingInputs:OpeningInputs};
function finite(value: unknown, min = -Infinity, max = Infinity): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function validPayload(value: unknown): value is ReportPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ReportPayload>;
  const analysis = payload.analysis;
  const inputs = payload.openingInputs;
  if (!analysis || typeof analysis !== "object" || !inputs || typeof inputs !== "object") return false;
  return analysis.mode === "live"
    && typeof analysis.analyzedAt === "string"
    && typeof analysis.location?.displayName === "string"
    && analysis.location.displayName.length <= 300
    && finite(analysis.location.latitude, -90, 90)
    && finite(analysis.location.longitude, -180, 180)
    && specialties.includes(analysis.specialty)
    && finite(analysis.radiusMeters, 100, 10000)
    && finite(analysis.observedScore, 0, 100)
    && finite(analysis.confidence, 0, 100)
    && Array.isArray(analysis.metrics) && analysis.metrics.length <= 12
    && analysis.metrics.every(item => typeof item?.label === "string" && item.label.length <= 80 && (item.value === null || finite(item.value, 0, 100)) && typeof item.note === "string" && item.note.length <= 500)
    && Array.isArray(analysis.strengths) && analysis.strengths.length <= 12
    && Array.isArray(analysis.risks) && analysis.risks.length <= 12
    && Array.isArray(analysis.limitations) && analysis.limitations.length <= 20
    && finite(inputs.floor, -5, 200)
    && finite(inputs.areaPyeong, 1, 5000)
    && finite(inputs.depositManwon, 0, 10000000)
    && finite(inputs.monthlyRentManwon, 0, 1000000)
    && finite(inputs.openingBudgetManwon, 0, 10000000)
    && finite(inputs.monthlyPayrollManwon, 0, 1000000)
    && finite(inputs.monthlyMarketingManwon, 0, 1000000)
    && (Object.keys(INPUT_LIMITS) as (keyof OpeningInputs)[]).every(key=>finite(inputs[key],...INPUT_LIMITS[key]))
    && Number.isInteger(inputs.loanMonths) && Number.isInteger(inputs.rampMonths);
}


function validDetails(a:LocationAnalysis) {
  const text=(v:unknown,max=2000):v is string=>typeof v==='string'&&v.length<=max;
  const strings=(v:unknown,max=20)=>Array.isArray(v)&&v.length<=max&&v.every(s=>text(s));
  if(!text(a.insight)||!strings(a.strengths,12)||!strings(a.risks,12)||!strings(a.limitations))return false;
  if(!Array.isArray(a.places)||a.places.length>5000||!a.places.every(p=>
    text(p.id,200)&&text(p.name,200)&&['hospital','pharmacy','transit','parking'].includes(p.kind)&&
    finite(p.latitude,-90,90)&&finite(p.longitude,-180,180)&&finite(p.distanceMeters,0,1e7)&&
    (p.specialty===undefined||text(p.specialty,500))&&(p.address===undefined||text(p.address,500))&&(p.url===undefined||text(p.url,2000))
  ))return false;
  if(!a.counts||!['medical','matchingSpecialty','pharmacy','transit','parking'].every(k=>finite(a.counts[k as keyof typeof a.counts],0,1e8)))return false;
  const p=a.regionalProfile,d=a.demographics,f=a.growthForecast;
  if(p&&(!text(p.areaName)||!text(p.character)||!text(p.characterReason)||!strings(p.specialtyFit)||!strings(p.doctorChecks)))return false;
  if(d&&(!text(d.areaName)||!finite(d.year,1900,2200)||!finite(d.residentPopulation,0,1e10)||!finite(d.workerPopulation,0,1e10)))return false;
  if(f?.status==='available'&&(!text(f.areaName)||!finite(f.baseYear,1900,2200)||
    !Array.isArray(f.historical)||!Array.isArray(f.projected)||f.historical.length>10||f.projected.length>5||
    ![...f.historical,...f.projected].every(x=>finite(x.year,1900,2200)&&['observed','projected'].includes(x.kind)&&finite(x.residentPopulation,0,1e10)&&finite(x.workerPopulation,0,1e10)&&finite(x.businesses,0,1e10))))return false;
  if(a.developmentPlans&&(!Array.isArray(a.developmentPlans.plans)||a.developmentPlans.plans.length>50||!a.developmentPlans.plans.every(p=>text(p.name)&&text(p.category)&&text(p.status)&&(p.targetDate===undefined||text(p.targetDate)))))return false;
  return true;
}
export async function POST(request:Request){
  if(Number(request.headers.get('content-length')||0)>1_000_000)return Response.json({error:'보고서 요청 데이터가 너무 큽니다.'},{status:413});
  try{
    const text=await request.text();
    if(Buffer.byteLength(text,'utf8')>1_000_000)return Response.json({error:'보고서 요청 데이터가 너무 큽니다.'},{status:413});
    let body:unknown;
    try{body=JSON.parse(text);}catch{return Response.json({error:'보고서 입력 형식을 확인해주세요.'},{status:400});}
    if(!validPayload(body)||!validDetails(body.analysis))return Response.json({error:'보고서 입력값을 확인해주세요.'},{status:400});
    const bytes=await buildMedicalReport(body.analysis,body.openingInputs);
    if(bytes.length>4_450_000)return Response.json({error:'보고서 분량이 너무 큽니다. 분석 반경을 줄인 뒤 다시 다운로드해주세요.'},{status:413});
    const stamp=new Date().toISOString().slice(0,10).replaceAll('-','');
    return new Response(Buffer.from(bytes),{headers:{
      'Content-Type':'application/pdf',
      'Content-Disposition':'attachment; filename="the-fount-location-report-'+stamp+'.pdf"',
      'Cache-Control':'private, no-store, max-age=0','X-Content-Type-Options':'nosniff','X-Report-Version':REPORT_VERSION
    }});
  }catch(error){
    console.error('report_generation_failed',error instanceof Error?error.message:'unknown');
    return Response.json({error:'PDF 보고서를 생성하지 못했습니다.'},{status:500});
  }
}
