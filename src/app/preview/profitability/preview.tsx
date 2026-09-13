'use client';
import { useState } from 'react';
import { DEFAULT_OPENING_INPUTS } from '@/data/opening-plan';
import { FinancialPlanningPanel } from '@/components/financial-planning-panel';
export function ProfitabilityPreview(){
  const [inputs,setInputs]=useState({...DEFAULT_OPENING_INPUTS});
  return <main className="fp-preview"><div className="fp-preview-banner"><b>THE FOUNT · 수익성 개편 미리보기</b><span>미배포 / 예시 입력값</span></div><FinancialPlanningPanel analysis={{specialty:'내과',observedScore:0}} inputs={inputs} onChange={setInputs}/></main>;
}
