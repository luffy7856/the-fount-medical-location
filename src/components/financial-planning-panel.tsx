"use client";

import { useState } from 'react';
import { ArrowUpRight, ChevronDown, SlidersHorizontal, Wallet, Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { calculateOpeningPlan, INPUT_LIMITS, type OpeningInputs } from '@/data/opening-plan';
import type { LocationAnalysis } from '@/data/location-types';
import './financial-planning.css';
import { FiveYearTaxPlan } from './five-year-tax-plan';

const money=(n:number)=>`${Math.round(n).toLocaleString()}만원`;
const recovery=(n:number|null)=>n===null?'10년 내 미회수':n===0?'초기 자기자금 없음':`${n}개월`;
type Field=[keyof OpeningInputs,string,string];
const basic:Field[]=[['dailyPatients','안정화 후 하루 환자 수','명'],['revenuePerPatient','환자 1명당 평균 진료매출','만원'],['clinicDays','월 진료일 수','일'],['monthlyRentManwon','월세','만원/월'],['monthlyPayrollManwon','직원 인건비 · 사업주 부담 포함','만원/월'],['monthlyMarketingManwon','마케팅비','만원/월'],['monthlyOtherCost','관리비 · 장비리스 · 기타 고정비','만원/월'],['variablePercent','재료 · 소모품 등 변동비율','매출 %']];
const advanced:Field[]=[['floor','입주 층','층'],['areaPyeong','전용면적','평'],['depositManwon','임대보증금','만원'],['openingBudgetManwon','시설 · 장비 등 초기 지출','만원'],['loanAmount','대출금','만원'],['annualInterest','대출 연이율','%'],['loanMonths','원금균등 상환기간','개월'],['ownerWithdrawal','원장 생활비 인출','만원/월'],['initialPercent','첫 달 환자 확보율','%'],['rampMonths','목표 환자 수에 도달하는 달','개월']];

export function FinancialPlanningPanel({analysis,inputs,onChange}:{analysis:Pick<LocationAnalysis,'specialty'|'observedScore'>;inputs:OpeningInputs;onChange:(value:OpeningInputs)=>void}) {
  const [scenario,setScenario]=useState(1);
  const variants=[{name:'보수적',factor:.8,label:'환자 수 −20%'},{name:'기준',factor:1,label:'입력한 환자 수'},{name:'낙관적',factor:1.2,label:'환자 수 +20%'}];
  const results=variants.map(v=>calculateOpeningPlan(analysis,inputs,v.factor));
  const result=results[scenario];
  const field=([key,label,unit]:Field)=><label className="fp-field" key={key}><span>{label}</span><div><input type="number" aria-label={label} min={INPUT_LIMITS[key][0]} max={INPUT_LIMITS[key][1]} step={key==='revenuePerPatient'||key==='annualInterest'?.1:1} value={inputs[key]} onChange={e=>{const n=Number(e.target.value);onChange({...inputs,[key]:Number.isFinite(n)?Math.min(INPUT_LIMITS[key][1],Math.max(key==='floor'?-5:0,n)):0});}} onBlur={()=>onChange({...inputs,[key]:Math.max(INPUT_LIMITS[key][0],key==='loanMonths'||key==='rampMonths'?Math.round(inputs[key]):inputs[key])})}/><small>{unit}</small></div>{key==='initialPercent'&&<p className="fp-help" aria-live="polite">{inputs.rampMonths===1?'목표 도달을 1개월로 설정하여 첫 달부터 목표의 100%를 적용합니다. ':''}기준 시나리오: 안정화 목표 하루 {inputs.dailyPatients}명 × {inputs.rampMonths===1?100:inputs.initialPercent}% = 첫 달 하루 약 {Math.round(inputs.dailyPatients*(inputs.rampMonths===1?1:inputs.initialPercent/100))}명</p>}</label>;
  const points=result.months.map(m=>m.cash);
  const min=Math.min(0,...points),max=Math.max(1,...points),range=max-min||1;
  const y=(n:number)=>160-(n-min)/range*128;
  const path=points.map((n,index)=>`${index===0?'M':'L'} ${50+index*43} ${y(n)}`).join(' ');
  return <section className="fp">
    <header className="fp-heading"><span className="fp-eyebrow">OPENING CASHFLOW LAB</span><h2>매출보다 먼저,<br/>버틸 수 있는 조건을 확인하세요.</h2><p>하루 환자 수와 운영비를 바꾸며 {analysis.specialty} 개원 계획을 비교해보세요.</p></header>
    <div className="fp-notice"><ShieldCheck size={20}/><p><b>초기 숫자는 계산 방법을 보여주는 예시입니다.</b> 실제 환자 수나 매출 예측이 아닙니다. 입지점수·층수로 매출을 자동 보정하지 않으며, 알고 계신 견적과 목표값으로 바꿔주세요.</p></div>
    <details className="fp-input-fold">
    <summary><div><h3>01. 개원자금과 초기 운영조건</h3><small>보증금 · 개원자금 · 대출 · 초기 환자 확보율</small></div><span className="fp-fold-action"><span className="fp-fold-closed">입력하기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
    <div className="fp-fold-content">
    <div className="fp-inputs">{advanced.map(field)}</div>
    <p className="fp-help">보증금은 비용이 아닌 묶이는 자금입니다. 시설·장비 초기 지출에 보증금이나 월 리스료를 중복 입력하지 마세요. 예상 세금은 자동 계산해 월별로 나누어 반영합니다.</p>
    </div></details>
    <details className="fp-input-fold">
    <summary><div><h3>02. 안정화 후 매출과 운영비</h3><small>목표 환자 수 · 진료매출 · 월세 · 인건비</small></div><span className="fp-fold-action"><span className="fp-fold-closed">입력하기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
    <div className="fp-fold-content">
    <div className="fp-inputs">{basic.map(field)}</div>
    <p className="fp-help">평균 진료매출은 환자 본인부담금과 보험청구액을 합친 1회 방문당 금액입니다. 변동비는 위 고정비와 중복 입력하지 마세요.</p>
    </div></details>
    {inputs.loanAmount>result.totalCashInvestment&&<p className="fp-warning" role="status">대출금이 초기 투자액보다 커서 계산에는 {money(result.loan)}까지만 반영했습니다. 실제 조달계획에 맞게 수정해주세요.</p>}
    {result.equity===0&&<p className="fp-warning">초기 투자 자기자금은 없지만, 첫 12개월 추가 운영자금은 {money(result.reserve)} 필요할 수 있습니다. 회수기간 0개월을 의미하지 않습니다.</p>}
    <div className="fp-section-head"><h3>03. 환자가 예상보다 적다면?</h3></div>
    <div className="fp-scenarios" role="group" aria-label="환자 수 시나리오">{variants.map((v,index)=><button key={v.name} aria-pressed={scenario===index} onClick={()=>setScenario(index)}><span>{v.name}</span><small>{v.label}</small><b>{money(results[index].monthlyCash)}</b><small>목표 도달 시 월 잔여현금*</small></button>)}</div>
    <p className="fp-help">±20%는 비교용 가정이며 통계적 예측 범위가 아닙니다. *목표 도달 월의 원리금과 해당 연도 예상 세금의 1/12을 반영합니다.</p>
    <div className="fp-kpis" aria-live="polite">
      <article><Users size={21}/><span>운영비를 감당할 하루 환자</span><strong>{result.breakEvenPatients===null?'산정 불가':`${result.breakEvenPatients}명`}</strong><small>대출상환 · 생활비 · 세금 적립 제외</small></article>
      <article><Wallet size={21}/><span>대출상환까지 감당할 하루 환자</span><strong>{result.cashBreakEvenPatients===null?'산정 불가':`${result.cashBreakEvenPatients}명`}</strong><small>생활비 · 예상 세금 포함 / 목표 도달 월</small></article>
      <article><ShieldCheck size={21}/><span>첫 12개월 운영 예비자금</span><strong>{money(result.reserve)}</strong><small>누적 현금 부족의 최대값 · 초기 투자와 별도</small></article>
      <article><TrendingUp size={21}/><span>세후 자기자금 회수</span><strong>{recovery(result.paybackMonths)}</strong><small>초기 자기자금 {money(result.equity)}</small></article>
    </div>
    <div className="fp-verdict"><ArrowUpRight size={23}/><div><b>{result.monthlyCash>=0?'목표 도달 월에는 세후 현금이 남는 조건입니다.':'목표 도달 월에는 세후 현금이 부족한 조건입니다.'}</b><p>{result.cashBreakEvenPatients===null?'평균 진료매출과 변동비율을 확인해주세요.':`목표 도달 월에 운영비·대출상환·생활비·예상 세금을 감당하려면 하루 약 ${result.cashBreakEvenPatients}명 이상이 필요합니다. 현재 선택한 시나리오는 하루 ${(inputs.dailyPatients*variants[scenario].factor).toFixed(1)}명입니다.`} 실제 진료시간에 이 환자 수를 받을 수 있는지도 확인하세요.</p></div></div>
    <div className="fp-section-head"><h3>04. 개원 후 12개월, 현금은 어떻게 변할까요?</h3></div>
    <div className="fp-chart"><div><b>월 잔여현금</b><span>만원 · {variants[scenario].name} 시나리오</span></div><svg viewBox="0 0 560 200" role="img" aria-label="개원 후 12개월 월 잔여현금 선그래프. 아래 월별 숫자 펼치기에서 전체 값을 확인할 수 있습니다."><line x1="50" x2="530" y1={y(0)} y2={y(0)} stroke="#aebbc9" strokeDasharray="4 4"/><text x="4" y={y(max)+4}>{Math.round(max).toLocaleString()}</text><text x="4" y={y(min)+4}>{Math.round(min).toLocaleString()}</text><path d={path} fill="none" stroke="#078878" strokeWidth="3"/>{points.map((n,index)=><g key={index}><circle cx={50+index*43} cy={y(n)} r="4" fill={n<0?'#c87557':'#078878'}/><text x={50+index*43} y="187" textAnchor="middle">{index+1}월</text></g>)}</svg><p>첫 달 목표의 {inputs.initialPercent}%에서 시작해 {inputs.rampMonths}개월째 목표에 도달한다고 가정합니다. 이자는 잔액에 따라 줄어들며, 예상 세금은 매월 균등 배분합니다.</p></div>
    <details className="fp-months"><summary>월별 숫자 펼치기 <ChevronDown size={18}/></summary><div className="fp-table-wrap"><table><caption>개원 후 월별 현금흐름 (만원)</caption><thead><tr><th>월</th><th>매출</th><th>영업잉여</th><th>원리금</th><th>예상 세금</th><th>세후 현금</th><th>누적현금</th></tr></thead><tbody>{result.months.map(m=><tr key={m.month}><th>{m.month}</th>{[m.revenue,m.operating,m.principal+m.interest,m.tax,m.cash,m.cumulativeCash].map((v,k)=><td key={k}>{Math.round(v).toLocaleString()}</td>)}</tr>)}</tbody></table></div></details>
    <div className="fp-waterfall"><h3>‘이익’과 ‘통장에 남는 돈’은 다릅니다</h3><dl><div><dt>목표 도달 시 월매출</dt><dd>{money(result.expectedRevenue)}</dd></div><div><dt>운영비 차감 후 영업잉여</dt><dd>{money(result.monthlyOperatingProfit)}</dd></div><div><dt>원리금 · 생활비 · 예상 세금 차감 후*</dt><dd>{money(result.monthlyCash)}</dd></div></dl><p>*목표 도달 월 기준. 세금은 연간 예상액의 1/12이며 실제 납부월 잔액과 다릅니다.</p></div>
    <details className="fp-method"><summary>투자회수와 계산 기준 확인하기 <ChevronDown size={18}/></summary><p>월매출 = 하루 환자 수 × 환자당 매출 × 월 진료일 수. 첫 {inputs.rampMonths}개월은 초기 환자 확보율을 적용합니다. 하단의 연 매출·고정비 증가율과 예상 세금을 회수기간에도 동일하게 반영합니다. 장비 교체·보험청구 입금 지연은 미반영합니다.</p><p>초기 투자 {money(result.totalCashInvestment)} = 보증금 + 시설·장비 지출. 대출 {money(result.loan)}을 제외한 자기자금 {money(result.equity)}을 매월 잔여현금으로 회수하는 시점입니다. 운영 예비자금은 초기 적자로 현금흐름에 이미 반영되어 회수액에 다시 더하지 않습니다.</p><p>대출 없는 사업 자체의 투자 회수: {recovery(result.totalPaybackMonths)}. 이 비교는 대출과 생활비가 없는 조건으로 세금을 다시 계산합니다. 보증금 반환과 폐업 시 자산매각은 가정하지 않습니다. 10년 내 누적액이 투자액을 넘지 않으면 ‘미회수’로 표시합니다.</p></details>
    {inputs.annualDepreciation*5>inputs.openingBudgetManwon&&<p className="fp-warning">5년 감가상각 합계가 초기 시설·장비 지출보다 큽니다. 감가상각 대상 자산과 잔존가액을 확인하세요. 세금이 과소 계산될 수 있습니다.</p>}
    <footer className="fp-foot">이 결과는 입력 가정에 따른 사전 검토입니다. 계약 전 실제 임대 견적, 인력 계획, 수가·청구 조건과 대출 상환표로 다시 확인해주세요. 다운로드 보고서는 기준 시나리오의 월별 결과와 세 시나리오 비교를 담습니다.</footer>
    <FiveYearTaxPlan inputs={inputs} onChange={onChange} factor={variants[scenario].factor} scenario={variants[scenario].name}/>
  </section>;
}
