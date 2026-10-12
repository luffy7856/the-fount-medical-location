'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';
import type { LocationAnalysis } from '@/data/location-types';
import './analysis-save.css';

type SavedRow={id:string;specialty:string;created_at:string;snapshot:LocationAnalysis};

async function requestSavedRows(token:string) {
  const response=await fetch('/location/api/analyses',{headers:{Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});
  const result=await response.json();
  if(!response.ok)throw new Error(result.error||'목록을 불러오지 못했습니다.');
  return Array.isArray(result.rows)?result.rows as SavedRow[]:[];
}

export function AnalysisSavePanel({analysis,scenario,onLoad}:{analysis:LocationAnalysis;scenario?:unknown;onLoad?:(analysis:LocationAnalysis)=>void}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [signedIn,setSignedIn]=useState(false);
  const [configured,setConfigured]=useState(false);
  const [expanded,setExpanded]=useState(false);
  const [consent,setConsent]=useState(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [rows,setRows]=useState<SavedRow[]>([]);
  const generation=useRef(0);
  useEffect(()=>{
    const supabase=getSupabaseBrowser(); setConfigured(Boolean(supabase));
    if(!supabase) return;
    let active=true;
    const restore=async()=>{
      const {data}=await supabase.auth.getSession();
      if(!active)return;
      const session=data.session;
      setSignedIn(Boolean(session));
      if(session){
        try {setRows(await requestSavedRows(session.access_token));}
        catch {if(active)setMessage('저장 목록을 불러오지 못했습니다. 잠시 후 다시 눌러주세요.');}
      }
    };
    void restore();
    const {data}=supabase.auth.onAuthStateChange((event,session)=>{
      if(!active)return;
      setSignedIn(Boolean(session));
      if(!session||event==='SIGNED_OUT'){
        generation.current++;
        setRows([]);
        setMessage('');
        return;
      }
      if(event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='USER_UPDATED'){
        const current=generation.current;
        void requestSavedRows(session.access_token).then(saved=>{
          if(active&&current===generation.current)setRows(saved);
        }).catch(()=>{
          if(active&&current===generation.current)setMessage('저장 목록을 불러오지 못했습니다. 잠시 후 다시 눌러주세요.');
        });
      }
    });
    return ()=>{active=false;data.subscription.unsubscribe();};
  },[]);
  async function authenticate(event:FormEvent,signup=false) {
    event.preventDefault(); const supabase=getSupabaseBrowser(); if(!supabase||busy)return;
    setBusy(true); setMessage('');
    try {
      const {data,error}=signup?await supabase.auth.signUp({
        email:email.trim(),
        password,
        options:{emailRedirectTo:`${window.location.origin}/location/auth/confirmed`}
      }):await supabase.auth.signInWithPassword({email:email.trim(),password});
      setPassword('');
      if(error) setMessage('로그인 또는 가입에 실패했습니다. 이메일 인증 여부와 입력값을 확인해주세요.');
      else setMessage(data.session?'로그인했습니다. 저장된 분석을 불러왔습니다.':'가입 확인 이메일의 ‘회원가입 확인하기’를 눌러주세요. 확인 후 바로 서비스를 이용할 수 있습니다.');
    } catch {setPassword('');setMessage('인증 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}
    finally {setBusy(false);}
  }
  async function resendConfirmation() {
    const supabase=getSupabaseBrowser();
    const address=email.trim();
    if(!supabase||busy)return;
    if(!address){setMessage('가입할 때 입력한 이메일을 먼저 적어주세요.');return;}
    setBusy(true);setMessage('');
    try {
      const {error}=await supabase.auth.resend({type:'signup',email:address,options:{emailRedirectTo:`${window.location.origin}/location/auth/confirmed`}});
      setMessage(error?'확인 메일을 보내지 못했습니다. 이메일 주소를 확인해주세요.':'새 가입 확인 메일을 보냈습니다. 가장 최근에 받은 메일의 링크를 눌러주세요.');
    } catch {setMessage('확인 메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.');}
    finally {setBusy(false);}
  }
  async function accessToken() {
    const supabase=getSupabaseBrowser(); if(!supabase)throw new Error('저장 연결 설정이 필요합니다.');
    const {data,error}=await supabase.auth.getSession();
    if(error||!data.session)throw new Error('먼저 로그인해주세요.');
    return data.session.access_token;
  }
  async function save() {
    if(busy||!consent)return; setBusy(true);setMessage('');const current=generation.current;
    try {
      const token=await accessToken();
      const response=await fetch('/location/api/analyses',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({analysis,scenario}),signal:AbortSignal.timeout(15000)});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error||'저장하지 못했습니다.');
      const savedRows=await requestSavedRows(token);
      if(current===generation.current){setRows(savedRows);setMessage('현재 분석을 내 분석함에 저장했습니다.');}
    }catch(error){if(current===generation.current)setMessage(error instanceof Error?error.message:'저장하지 못했습니다.');}
    finally {setBusy(false);}
  }
  async function load() {
    if(busy)return;setBusy(true);setMessage('');const current=generation.current;
    try {
      const token=await accessToken();
      const savedRows=await requestSavedRows(token);
      if(current===generation.current){setRows(savedRows);setMessage(savedRows.length?'최근 저장한 분석입니다.':'아직 저장된 분석이 없습니다.');}
    }catch(error){if(current===generation.current)setMessage(error instanceof Error?error.message:'목록을 불러오지 못했습니다.');}
    finally {setBusy(false);}
  }
  return <section className="analysis-save" aria-label="내 분석 저장"><div className="analysis-save-heading"><div><h3>내 분석 보관함</h3><p>주소·분석 결과를 내 계정에 저장합니다.</p></div><button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?'접기':'저장 / 불러오기'}</button></div>
    {expanded && <>{!configured?<p role="status">분석 저장 기능을 준비 중입니다. 분석과 보고서 다운로드는 계속 사용할 수 있습니다.</p>:!signedIn?<form onSubmit={authenticate}><p>분석 결과를 보관하려면 이메일로 로그인해주세요.</p><label>이메일<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>비밀번호<input type="password" required minLength={8} autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><div className="analysis-save-actions"><button disabled={busy} type="submit">로그인</button><button disabled={busy} type="button" onClick={e=>{const form=e.currentTarget.closest('form');if(form?.reportValidity())void authenticate(e,true);}}>처음 이용하기</button><button disabled={busy} type="button" onClick={resendConfirmation}>가입 확인 메일 다시 받기</button></div><small>처음 이용하는 경우 비밀번호를 8자 이상 입력하고 ‘처음 이용하기’를 눌러주세요. 예전에 받은 확인 링크가 열리지 않으면 새 메일을 받아주세요.</small></form>:<><label className="analysis-save-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/> 이 후보지의 주소와 분석 결과를 내 보관함에 저장합니다.</label><div className="analysis-save-actions"><button type="button" disabled={busy||!consent||analysis.analyzedAt===new Date(0).toISOString()} onClick={save}>{busy?'처리 중…':'현재 분석 저장'}</button><button type="button" disabled={busy} onClick={load}>내 저장 목록</button><button type="button" disabled={busy} onClick={async()=>{setRows([]);await getSupabaseBrowser()?.auth.signOut();}}>로그아웃</button></div>{rows.length>0&&<ul>{rows.map(row=><li key={row.id}><b>{row.snapshot.location.displayName}</b><span>{row.specialty} · {new Date(row.created_at).toLocaleDateString('ko-KR')}</span>{onLoad&&<button type="button" onClick={()=>onLoad(row.snapshot)}>이 분석 보기</button>}</li>)}</ul>}</>}
    <p className="analysis-save-message" role="status" aria-live="polite">{message}</p></>}
  </section>;
}
