import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { persistAnalysis } from '@/providers/analysis-persistence';
import { calculateViability, type ViabilityAssumptions, type CompetitorInput } from '@/data/viability-engine';
import { modelFor } from '@/data/viability-models';
import type { LocationAnalysis } from '@/data/location-types';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'no-store'};
const text=z.string().max(10000);
const metric=z.object({label:text,value:z.number().finite().min(0).max(100).nullable(),note:text,color:z.string().max(50)});
const analysisSchema=z.object({
  mode:z.literal('live'),provider:z.enum(['kakao','openstreetmap']),analyzedAt:z.string().datetime(),specialty:z.string().min(1).max(100),radiusMeters:z.number().positive().max(3000),
  location:z.object({displayName:z.string().min(1).max(1000),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)}),
  places:z.array(z.object({id:text,name:text,kind:z.enum(['hospital','pharmacy','transit','parking']),specialty:text.optional(),latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180),distanceMeters:z.number().finite().min(0),address:text.optional(),url:z.string().url().refine(v=>v.startsWith('https://')||v.startsWith('http://')).transform(v=>v.replace(/^http:/,'https:')).optional()})).max(5000),
  counts:z.object({medical:z.number().nonnegative(),matchingSpecialty:z.number().nonnegative(),pharmacy:z.number().nonnegative(),transit:z.number().nonnegative(),parking:z.number().nonnegative()}),
  metrics:z.array(metric).max(30),observedScore:z.number().finite().min(0).max(100),grade:text,confidence:z.number().finite().min(0).max(100),insight:text,strengths:z.array(text).max(100),risks:z.array(text).max(100),limitations:z.array(text).max(100),
}).passthrough();
async function authorize(request:NextRequest) {
  const authorization=request.headers.get('authorization');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if(!url||!key)return {response:NextResponse.json({error:'저장 연결을 준비 중입니다.'},{status:503,headers})} as const;
  if(!authorization?.startsWith('Bearer '))return {response:NextResponse.json({error:'먼저 로그인해주세요.'},{status:401,headers})} as const;
  const response=await fetch(new URL('/auth/v1/user',url),{headers:{apikey:key,Authorization:authorization},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return {response:NextResponse.json({error:'로그인이 만료되었습니다. 다시 로그인해주세요.'},{status:401,headers})} as const;
  return {url,key,authorization} as const;
}
export async function POST(request:NextRequest) {
  try {
    const auth=await authorize(request);if('response' in auth)return auth.response;
    if(Number(request.headers.get('content-length')||0)>2000000)return NextResponse.json({error:'분석 자료가 너무 큽니다.'},{status:413,headers});
    const raw=await request.text();if(new TextEncoder().encode(raw).length>2000000)return NextResponse.json({error:'분석 자료가 너무 큽니다.'},{status:413,headers});
    const body=JSON.parse(raw);const analysis=analysisSchema.parse(body.analysis) as LocationAnalysis;
    let scenario:unknown;
    if(body.scenario){
      const model=modelFor(analysis.specialty);
      const assumptions=body.scenario.assumptions as ViabilityAssumptions;
      const competitors=z.array(z.object({id:text,name:text,travelMinutes:z.number().finite().min(0).max(10000),attraction:z.number().finite().min(.01).max(100),evidence:z.enum(['observed','assumption'])})).max(5000).parse(body.scenario.competitors) as CompetitorInput[];
      scenario={model,assumptions,competitors,result:calculateViability(assumptions,competitors,model),calculatedAt:new Date().toISOString(),evidence:'user-entered scenario; not verified medical demand'};
    }
    // Caller snapshots remain labelled user-saved. Server recomputes scenario scores, never trusts submitted scores.
    const snapshot={...analysis,savedContext:{origin:'user-saved snapshot',scenario}};
    const result=await persistAnalysis(snapshot,auth.authorization);
    if(result.status!=='saved')return NextResponse.json({error:'저장하지 못했습니다. 잠시 후 다시 시도해주세요.'},{status:502,headers});
    return NextResponse.json(result,{status:201,headers});
  }catch(error){return NextResponse.json({error:error instanceof z.ZodError||error instanceof SyntaxError?'분석 입력값을 확인해주세요.':'저장 중 오류가 발생했습니다. 입력 가정과 연결 상태를 확인해주세요.'},{status:400,headers});}
}
export async function GET(request:NextRequest) {
  try {
    const auth=await authorize(request);if('response' in auth)return auth.response;
    const url=new URL('/rest/v1/location_analyses',auth.url);
    url.searchParams.set('select','id,specialty,created_at,snapshot');url.searchParams.set('order','created_at.desc');url.searchParams.set('limit','20');
    const response=await fetch(url,{headers:{apikey:auth.key,Authorization:auth.authorization},cache:'no-store',signal:AbortSignal.timeout(8000)});
    if(!response.ok)return NextResponse.json({error:'저장 목록을 불러오지 못했습니다.'},{status:502,headers});
    return NextResponse.json({rows:await response.json()},{headers});
  }catch{return NextResponse.json({error:'저장 서버에 연결하지 못했습니다.'},{status:502,headers});}
}
