'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, LoaderCircle, TriangleAlert } from 'lucide-react';
import { getSupabaseBrowser } from '@/lib/supabase-browser';

type State='checking'|'success'|'error';

export function AuthConfirmed(){
  const [state,setState]=useState<State>('checking');

  useEffect(()=>{
    const supabase=getSupabaseBrowser();
    if(!supabase){setState('error');return;}
    let active=true;
    const finish=(success:boolean)=>{
      if(!active)return;
      setState(success?'success':'error');
      if(success)window.history.replaceState({},'',window.location.pathname);
    };
    const params=new URLSearchParams(window.location.search);
    const error=params.get('error_description')||params.get('error');
    if(error){finish(false);return ()=>{active=false;};}
    const confirm=async()=>{
      const code=params.get('code');
      if(code){
        const {error:exchangeError}=await supabase.auth.exchangeCodeForSession(code);
        if(exchangeError){finish(false);return;}
      }
      const {data}=await supabase.auth.getSession();
      finish(Boolean(data.session));
    };
    void confirm();
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(session)finish(true);
    });
    const timeout=window.setTimeout(()=>void confirm(),1200);
    return ()=>{active=false;window.clearTimeout(timeout);data.subscription.unsubscribe();};
  },[]);

  return <main className="auth-confirmed-page">
    <section className="auth-confirmed-card" aria-live="polite">
      <div className={`auth-confirmed-icon ${state}`} aria-hidden="true">
        {state==='checking'?<LoaderCircle/>:state==='success'?<Check/>:<TriangleAlert/>}
      </div>
      <p className="auth-confirmed-brand">THE FOUNT · 병원 입지분석</p>
      {state==='checking'&&<><h1>가입을 확인하고 있습니다</h1><p>잠시만 기다려주세요.</p></>}
      {state==='success'&&<><h1>가입이 되었습니다</h1><p>이메일 확인이 완료되었습니다.<br/>이제 분석 결과를 저장하고 내 분석함에서 다시 볼 수 있습니다.</p><Link href="/">입지분석 시작하기</Link></>}
      {state==='error'&&<><h1>인증 링크를 확인해주세요</h1><p>링크가 만료되었거나 이미 사용된 링크일 수 있습니다.<br/>사이트에서 다시 로그인하거나 가입 확인 메일을 새로 받아주세요.</p><Link href="/">사이트로 돌아가기</Link></>}
    </section>
  </main>;
}
