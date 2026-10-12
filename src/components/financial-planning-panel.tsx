"use client";

import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Wallet, Users, TrendingUp, ShieldCheck } from 'lucide-react';
import { calculateOpeningPlan, DEFAULT_OPENING_INPUTS, INPUT_LIMITS, type OpeningInputs } from '@/data/opening-plan';
import type { LocationAnalysis } from '@/data/location-types';
import './financial-planning.css';
import './financial-planning-layout.css';
import { FiveYearTaxPlan } from './five-year-tax-plan';
import { openingInputsWithVisitRevenue } from '@/data/specialty-revenue';
import { applyAutomaticOperatingCosts, regionalOperatingCostBasis } from '@/data/operating-costs';

const money=(n:number)=>`${Math.round(n).toLocaleString()}만원`;
const recovery=(n:number|null)=>n===null?'10년 내 미회수':n===0?'초기 자기자금 없음':`${n}개월`;
type Field=[keyof OpeningInputs,string,string];
const operating:Field[]=[['areaPyeong','병원에서 실제로 쓸 면적','평'],['staffCount','채용할 직원 수','명'],['depositManwon','임대보증금','만원']];
const basic:Field[]=[['dailyPatients','자리 잡은 뒤 하루 환자 수','명'],['revenuePerPatient','환자 한 명이 한 번 방문할 때의 매출','만원'],['clinicDays','한 달 진료일 수','일'],['monthlyMarketingManwon','한 달 홍보비','만원'],['monthlyOtherCost','장비대여료·그 밖의 매달 비용','만원'],['variablePercent','매출이 늘면 함께 늘어나는 비용','매출 %']];
const manualCosts:Field[]=[['monthlyRentManwon','한 달 월세','만원'],['monthlyManagementManwon','한 달 관리비','만원'],['monthlyPayrollManwon','직원 월급과 병원 부담금','만원']];
const advanced:Field[]=[['floor','입주할 층','층'],['openingBudgetManwon','인테리어·장비 등 처음 드는 돈','만원'],['loanAmount','대출금','만원'],['annualInterest','대출 이자율','%'],['loanMonths','대출 원금을 갚는 기간','개월'],['ownerWithdrawal','원장님 생활비','만원/월'],['initialPercent','첫 달 환자 수 · 목표 대비','%'],['rampMonths','목표 환자 수에 도달하는 달','개월']];
type FinancialContext=Pick<LocationAnalysis,'specialty'|'observedScore'|'location'> & Partial<Pick<LocationAnalysis,'rentMarket'|'consumerPower'>>;

export function FinancialPlanningPanel({analysis,inputs,onChange}:{analysis:FinancialContext;inputs:OpeningInputs;onChange:(value:OpeningInputs)=>void}) {
  const [scenario,setScenario]=useState(1);
  const operatingInputs = applyAutomaticOperatingCosts(analysis, inputs);
  const costBasis = regionalOperatingCostBasis(analysis);
  const automaticCosts = inputs.autoOperatingCosts >= .5;
  const visitRevenue = openingInputsWithVisitRevenue(analysis, operatingInputs);
  const calculationInputs = visitRevenue.inputs;
  const variants=[{name:'적게 올 때',factor:.8,label:'예상보다 20% 적음'},{name:'예상대로',factor:1,label:'입력한 환자 수'},{name:'많이 올 때',factor:1.2,label:'예상보다 20% 많음'}];
  const results=variants.map(v=>calculateOpeningPlan(analysis,calculationInputs,v.factor));
  const result=results[scenario];
  const monthlyFixedTotal=calculationInputs.monthlyRentManwon+calculationInputs.monthlyManagementManwon+calculationInputs.monthlyPayrollManwon+calculationInputs.monthlyMarketingManwon+calculationInputs.monthlyOtherCost;
  const field=([key,label,unit]:Field)=><label className="fp-field" key={key}><span>{label}</span><div><input type="number" aria-label={label} min={INPUT_LIMITS[key][0]} max={INPUT_LIMITS[key][1]} step={key==='revenuePerPatient'||key==='annualInterest'?.1:1} value={key==='revenuePerPatient'&&visitRevenue.automatic?calculationInputs.revenuePerPatient:inputs[key]} onChange={e=>{const n=Number(e.target.value);onChange({...inputs,[key]:Number.isFinite(n)?Math.min(INPUT_LIMITS[key][1],Math.max(key==='floor'?-5:0,n)):0});}} onBlur={()=>onChange({...inputs,[key]:Math.max(INPUT_LIMITS[key][0],key==='loanMonths'||key==='rampMonths'?Math.round(inputs[key]):inputs[key])})}/><small>{unit}</small></div>{key==='initialPercent'&&<p className="fp-help" aria-live="polite">{inputs.rampMonths===1?'목표 도달을 1개월로 설정하여 첫 달부터 목표의 100%를 적용합니다. ':''}기준 시나리오: 안정화 목표 하루 {inputs.dailyPatients}명 × {inputs.rampMonths===1?100:inputs.initialPercent}% = 첫 달 하루 약 {Math.round(inputs.dailyPatients*(inputs.rampMonths===1?1:inputs.initialPercent/100))}명</p>}</label>;
  const points=result.months.map(m=>m.cash);
  const min=Math.min(0,...points),max=Math.max(1,...points),range=max-min||1;
  const y=(n:number)=>160-(n-min)/range*128;
  const path=points.map((n,index)=>`${index===0?'M':'L'} ${50+index*43} ${y(n)}`).join(' ');
  return <section className="fp">
    <header className="fp-heading"><span className="fp-eyebrow">개원 수익성 확인</span><h2>매출보다 먼저,<br/>운영비를 감당할 수 있는지 확인하세요.</h2><p>처음에는 기본 예시로 보여드립니다. 실제로 알고 있는 금액만 바꾸면 됩니다.</p></header>
    <div className="fp-notice"><ShieldCheck size={20}/><p><b>처음에는 {inputs.areaPyeong}평·직원 {inputs.staffCount}명 기준으로 계산합니다.</b> 지역별 임대료와 인건비 참고값을 자동 적용했습니다. 실제 평수·직원 수·보증금·월세를 입력하면 아래 수익성 결과가 즉시 다시 계산됩니다.</p></div>
    <section className="fp-overview" aria-labelledby="fp-overview-title">
      <div className="fp-overview-head">
        <div><span className="fp-step-label">한눈에 보는 결과</span><h3 id="fp-overview-title">이 조건으로 병원을 운영할 수 있을까요?</h3></div>
        <div className="fp-calculation-basis"><b>{calculationInputs.areaPyeong}평 · 직원 {calculationInputs.staffCount}명</b><span>월 고정비 {money(monthlyFixedTotal)}</span></div>
      </div>
      <div className="fp-scenarios" role="group" aria-label="환자 수 시나리오">{variants.map((v,index)=><button key={v.name} aria-pressed={scenario===index} onClick={()=>setScenario(index)}><span>{v.name}</span><small>{v.label}</small><b>{money(results[index].monthlyCash)}</b><small>목표 도달 뒤 월 잔여현금*</small></button>)}</div>
      <p className="fp-overview-help">환자가 예상보다 적거나 많을 때, 운영비·대출상환·생활비·예상 세금을 모두 낸 뒤 남는 돈을 비교합니다.</p>
      <div className="fp-kpis" aria-live="polite">
        <article><Users size={21}/><span>운영비를 감당할 하루 환자</span><strong>{result.breakEvenPatients===null?'산정 불가':`${result.breakEvenPatients}명`}</strong><small>병원 운영비만 감당하는 기준</small></article>
        <article><Wallet size={21}/><span>모든 지출을 감당할 하루 환자</span><strong>{result.cashBreakEvenPatients===null?'산정 불가':`${result.cashBreakEvenPatients}명`}</strong><small>대출·생활비·예상 세금까지 포함</small></article>
        <article><ShieldCheck size={21}/><span>첫해에 준비할 운영 예비자금</span><strong>{money(result.reserve)}</strong><small>초기 투자금과 별도로 필요한 금액</small></article>
        <article><TrendingUp size={21}/><span>내 돈을 회수하는 예상 기간</span><strong>{recovery(result.paybackMonths)}</strong><small>초기 자기자금 {money(result.equity)} 기준</small></article>
      </div>
      <div className="fp-verdict"><ArrowUpRight size={23}/><div><b>{result.monthlyCash>=0?'목표 환자 수에 도달하면 모든 지출을 내고도 현금이 남습니다.':'목표 환자 수에 도달해도 모든 지출을 감당하기 어렵습니다.'}</b><p>{result.cashBreakEvenPatients===null?'환자 1명당 매출과 매출에 따라 늘어나는 비용을 다시 확인해주세요.':`하루 약 ${result.cashBreakEvenPatients}명 이상이면 운영비·대출·생활비·예상 세금을 감당할 수 있습니다. 현재 선택한 조건은 하루 ${(inputs.dailyPatients*variants[scenario].factor).toFixed(1)}명입니다.`} 실제 진료시간에 받을 수 있는 환자 수인지 함께 확인하세요.</p></div></div>
    </section>
    <div className="fp-section-intro fp-input-intro"><div><span className="fp-step-label">운영 조건 바꾸기</span><h3>알고 있는 값만 입력해 보세요.</h3><p>아래 두 항목은 접어두었습니다. 기본값으로 먼저 결과를 보고, 실제 계약 조건이 정해지면 필요한 부분만 수정하면 됩니다.</p></div><button type="button" onClick={()=>onChange({...DEFAULT_OPENING_INPUTS})}>50평·직원 5명으로 초기화</button></div>
    <details className="fp-input-fold">
    <summary><div><h3>개원할 때 필요한 돈</h3><small>보증금 · 인테리어와 장비 · 대출 · 첫 달 환자 수</small></div><span className="fp-fold-action"><span className="fp-fold-closed">수정하기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
    <div className="fp-fold-content">
    <div className="fp-inputs">{advanced.map(field)}</div>
    <p className="fp-help">보증금은 비용이 아닌 묶이는 자금입니다. 시설·장비 초기 지출에 보증금이나 월 리스료를 중복 입력하지 마세요. 예상 세금은 자동 계산해 월별로 나누어 반영합니다.</p>
    </div></details>
    <details className="fp-input-fold">
    <summary><div><h3>병원이 자리 잡은 뒤의 매출과 비용</h3><small>하루 환자 수 · 진료매출 · 월세 · 직원 월급</small></div><span className="fp-fold-action"><span className="fp-fold-closed">수정하기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
    <div className="fp-fold-content">
    <div className="fp-operating-inputs"><div><b>병원 크기·직원 수·보증금</b><span>입력하지 않으면 50평·직원 5명으로 계산합니다. 보증금은 매달 드는 비용이 아니라 처음 묶이는 자금으로 반영합니다.</span></div><div className="fp-inputs">{operating.map(field)}</div></div>
    <div className="fp-cost-basis">
      <div className="fp-cost-basis-head"><div><b>{automaticCosts ? `${costBasis.regionLabel} 운영비 자동 계산` : '실제 견적 직접 입력'}</b><span>{automaticCosts ? `${costBasis.rentSource}을 바탕으로 계산했습니다.` : '계약서와 채용계획의 실제 금액을 사용합니다.'}</span></div><button type="button" onClick={()=>onChange(automaticCosts?{...operatingInputs,autoOperatingCosts:0}:{...inputs,autoOperatingCosts:1})}>{automaticCosts?'실제 금액 입력':'지역 기준으로 되돌리기'}</button></div>
      {automaticCosts ? <div className="fp-cost-cards">
        <article className="fp-editable-rent"><span>한 달 월세</span><label><input aria-label="한 달 월세" type="number" min="0" max={INPUT_LIMITS.monthlyRentManwon[1]} value={operatingInputs.monthlyRentManwon} onChange={event=>{const value=Math.max(0,Math.min(INPUT_LIMITS.monthlyRentManwon[1],Number(event.target.value)||0));onChange({...operatingInputs,autoOperatingCosts:0,monthlyRentManwon:value});}}/><small>만원</small></label><small>자동 기준: {inputs.areaPyeong}평 × 평당 {costBasis.rentPerPyeongManwon}만원 · 직접 수정 가능</small></article>
        <article><span>예상 관리비</span><strong>{money(operatingInputs.monthlyManagementManwon)}</strong><small>{inputs.areaPyeong}평 × 평당 {costBasis.managementPerPyeongManwon}만원</small></article>
        <article><span>예상 인건비</span><strong>{money(operatingInputs.monthlyPayrollManwon)}</strong><small>{inputs.staffCount}명 × 1명당 {costBasis.payrollPerStaffManwon}만원</small></article>
      </div> : <div className="fp-inputs fp-manual-costs">{manualCosts.map(field)}</div>}
      <div className="fp-payroll-guide"><div><b>직원 급여와 병원 부담금이 궁금하신가요?</b><p>급여, 4대 보험과 퇴직금까지 더파운트 인건비 계산기에서 확인한 뒤 위 인건비에 입력하면 더 정확해집니다.</p></div><a href="https://payroll.thefount.co.kr/payroll" target="_blank" rel="noopener noreferrer">인건비 바로 계산하기 <ArrowUpRight size={17}/></a></div>
      <div className="fp-cost-total"><div><span>현재 계산에 반영한 월 고정비</span><small>월세 + 관리비 + 인건비 + 홍보비 + 그 밖의 고정비</small></div><strong>{money(monthlyFixedTotal)}</strong></div>
      <p className="fp-help">자동 인건비에는 급여와 병원 부담분을 합친 평균값을 사용합니다. 직종·경력에 따라 달라지므로 채용계획이 정해지면 실제 금액으로 바꿔주세요.</p>
    </div>
    <div className="fp-revenue-basis"><div><b>{analysis.specialty} 1회 예상 매출 {calculationInputs.revenuePerPatient.toFixed(1)}만원</b><span>{visitRevenue.automatic ? `보험 진료 ${Math.round(visitRevenue.estimate.insuredPerVisitWon / 1000) / 10}만원 + 비급여 진료 가능성 ${Math.round(visitRevenue.estimate.nonCoveredExpectedWon / 1000) / 10}만원` : '원장님이 직접 입력한 금액을 사용합니다.'}</span></div>{!visitRevenue.automatic&&<button type="button" onClick={()=>onChange({...inputs,revenuePerPatient:DEFAULT_OPENING_INPUTS.revenuePerPatient})}>자동 기준으로 되돌리기</button>}</div>
    <div className="fp-inputs">{basic.map(field)}</div>
    <p className="fp-help">처음에는 진료과의 보험 진료비와 비급여 진료 가능성, 지역 의료소비 수준을 합쳐 자동 계산합니다. 실제 병원의 진료 구성이 있다면 위 금액을 직접 바꿀 수 있습니다.</p>
    </div></details>
    {inputs.loanAmount>result.totalCashInvestment&&<p className="fp-warning" role="status">대출금이 초기 투자액보다 커서 계산에는 {money(result.loan)}까지만 반영했습니다. 실제 조달계획에 맞게 수정해주세요.</p>}
    {result.equity===0&&<p className="fp-warning">초기 투자 자기자금은 없지만, 첫 12개월 추가 운영자금은 {money(result.reserve)} 필요할 수 있습니다. 회수기간 0개월을 의미하지 않습니다.</p>}
    <div className="fp-section-intro fp-detail-intro"><span className="fp-step-label">자세한 계산 보기</span><h3>필요할 때만 펼쳐서 확인하세요.</h3><p>월별 현금흐름과 5년 세금 계획을 나누어 정리했습니다.</p></div>
    <details className="fp-result-fold">
    <summary><div><h3>개원 후 12개월 현금흐름</h3><small>월별 매출 · 운영비 · 대출 · 예상 세금 · 통장에 남는 돈</small></div><span className="fp-fold-action"><span className="fp-fold-closed">자세히 보기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
    <div className="fp-result-content">
    <div className="fp-chart"><div><b>월 잔여현금</b><span>만원 · {variants[scenario].name} 시나리오</span></div><svg viewBox="0 0 560 200" role="img" aria-label="개원 후 12개월 월 잔여현금 선그래프. 아래 월별 숫자 펼치기에서 전체 값을 확인할 수 있습니다."><line x1="50" x2="530" y1={y(0)} y2={y(0)} stroke="#aebbc9" strokeDasharray="4 4"/><text x="4" y={y(max)+4}>{Math.round(max).toLocaleString()}</text><text x="4" y={y(min)+4}>{Math.round(min).toLocaleString()}</text><path d={path} fill="none" stroke="#078878" strokeWidth="3"/>{points.map((n,index)=><g key={index}><circle cx={50+index*43} cy={y(n)} r="4" fill={n<0?'#c87557':'#078878'}/><text x={50+index*43} y="187" textAnchor="middle">{index+1}월</text></g>)}</svg><p>첫 달 목표의 {inputs.initialPercent}%에서 시작해 {inputs.rampMonths}개월째 목표에 도달한다고 가정합니다. 이자는 잔액에 따라 줄어들며, 예상 세금은 매월 균등 배분합니다.</p></div>
    <details className="fp-months"><summary>월별 숫자 펼치기 <ChevronDown size={18}/></summary><div className="fp-table-wrap"><table><caption>개원 후 월별 현금흐름 (만원)</caption><thead><tr><th>월</th><th>매출</th><th>영업잉여</th><th>원리금</th><th>예상 세금</th><th>세후 현금</th><th>누적현금</th></tr></thead><tbody>{result.months.map(m=><tr key={m.month}><th>{m.month}</th>{[m.revenue,m.operating,m.principal+m.interest,m.tax,m.cash,m.cumulativeCash].map((v,k)=><td key={k}>{Math.round(v).toLocaleString()}</td>)}</tr>)}</tbody></table></div></details>
    <div className="fp-waterfall"><h3>‘이익’과 ‘통장에 남는 돈’은 다릅니다</h3><dl><div><dt>목표 도달 시 월매출</dt><dd>{money(result.expectedRevenue)}</dd></div><div><dt>운영비 차감 후 영업잉여</dt><dd>{money(result.monthlyOperatingProfit)}</dd></div><div><dt>원리금 · 생활비 · 예상 세금 차감 후*</dt><dd>{money(result.monthlyCash)}</dd></div></dl><p>*목표 도달 월 기준. 세금은 연간 예상액의 1/12이며 실제 납부월 잔액과 다릅니다.</p></div>
    <details className="fp-method"><summary>투자회수와 계산 기준 확인하기 <ChevronDown size={18}/></summary><p>월매출 = 하루 환자 수 × 환자당 매출 × 월 진료일 수. 첫 {inputs.rampMonths}개월은 초기 환자 확보율을 적용합니다. 하단의 연 매출·고정비 증가율과 예상 세금을 회수기간에도 동일하게 반영합니다. 장비 교체·보험청구 입금 지연은 미반영합니다.</p><p>초기 투자 {money(result.totalCashInvestment)} = 보증금 + 시설·장비 지출. 대출 {money(result.loan)}을 제외한 자기자금 {money(result.equity)}을 매월 잔여현금으로 회수하는 시점입니다. 운영 예비자금은 초기 적자로 현금흐름에 이미 반영되어 회수액에 다시 더하지 않습니다.</p><p>대출 없는 사업 자체의 투자 회수: {recovery(result.totalPaybackMonths)}. 이 비교는 대출과 생활비가 없는 조건으로 세금을 다시 계산합니다. 보증금 반환과 폐업 시 자산매각은 가정하지 않습니다. 10년 내 누적액이 투자액을 넘지 않으면 ‘미회수’로 표시합니다.</p></details>
    </div></details>
    {inputs.annualDepreciation*5>inputs.openingBudgetManwon&&<p className="fp-warning">5년 감가상각 합계가 초기 시설·장비 지출보다 큽니다. 감가상각 대상 자산과 잔존가액을 확인하세요. 세금이 과소 계산될 수 있습니다.</p>}
    <details className="fp-result-fold fp-tax-fold">
      <summary><div><h3>5년 매출과 세금 계획</h3><small>연도별 성장 · 운영비 증가 · 종합소득세 · 세후 잔여현금</small></div><span className="fp-fold-action"><span className="fp-fold-closed">자세히 보기</span><span className="fp-fold-open">접기</span><ChevronDown size={20}/></span></summary>
      <div className="fp-result-content"><FiveYearTaxPlan inputs={calculationInputs} onChange={next=>onChange(visitRevenue.automatic?{...next,revenuePerPatient:inputs.revenuePerPatient}:next)} factor={variants[scenario].factor} scenario={variants[scenario].name}/></div>
    </details>
    <footer className="fp-foot">이 결과는 입력 가정에 따른 사전 검토입니다. 계약 전 실제 임대 견적, 인력 계획, 수가·청구 조건과 대출 상환표로 다시 확인해주세요. 다운로드 보고서는 기준 시나리오의 월별 결과와 세 시나리오 비교를 담습니다.</footer>
  </section>;
}
