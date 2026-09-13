import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, PDFHexString, PageSizes, rgb } from 'pdf-lib';
import type { LocationAnalysis, LivePlace, GrowthForecastPoint } from '../data/location-types';
import { matchesSpecialty } from '../data/specialties';
import { calculateOpeningPlan, calculateFiveYearPlan, type OpeningInputs } from '../data/opening-plan';

export const REPORT_VERSION = '2026.09.13-r8';
const W=PageSizes.A4[0], H=PageSizes.A4[1], M=42, WIDTH=W-M*2, BOTTOM=58;
const NAVY=rgb(.06,.14,.24), TEAL=rgb(.02,.43,.39), GOLD=rgb(.52,.39,.19);
const INK=rgb(.14,.21,.29), MUTED=rgb(.34,.40,.47), LINE=rgb(.84,.88,.92);
const PALE=rgb(.95,.97,.99), WHITE=rgb(1,1,1), WARM=rgb(.98,.96,.91), RED=rgb(.66,.24,.20);
const fmt=(n:number)=>Number.isFinite(n)?Math.round(n).toLocaleString('ko-KR'):'확인 필요';
const money=(n:number)=>fmt(n)+'만원';
const clean=(s:string)=>s.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
const date=(s:string)=>Number.isNaN(Date.parse(s))?'기준일 확인 필요':new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
type Tone=ReturnType<typeof rgb>;
type Fonts={regular:PDFFont;bold:PDFFont};
type Row={cells:string[];emphasis?:boolean;url?:string};
const positive=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;

export function coordinateLink(name:string,lat:number,lng:number) {
  return 'https://map.kakao.com/link/map/'+encodeURIComponent(name)+','+lat+','+lng;
}
export function hospitalLink(p:LivePlace) {
  // Never embed arbitrary URLs supplied in a report request.
  if(p.url)try{const u=new URL(p.url);if(u.protocol==='https:'&&u.hostname==='place.map.kakao.com'&&/^\/[0-9]+$/.test(u.pathname))return u.href;}catch{}
  return coordinateLink(p.name,p.latitude,p.longitude);
}
export function reportCompetitors(a:LocationAnalysis) {
  const seen=new Set<string>();
  return a.places.filter(p=>p.kind==='hospital'&&matchesSpecialty(p.name,p.specialty,a.specialty))
    .filter(p=>{if(seen.has(p.id))return false;seen.add(p.id);return true;})
    .sort((x,y)=>x.distanceMeters-y.distanceMeters);
}
export function indexedForecast(points:GrowthForecastPoint[], key:'residentPopulation'|'workerPopulation'|'businesses', baseYear:number) {
  const base=points.find(p=>p.year===baseYear)?.[key];
  if(!positive(base)||base===0)return null;
  return points.map(p=>({...p,index:p[key]/base*100}));
}

class Report {
  page!:PDFPage;
  y=0;
  title='';
  tax=false;
  constructor(readonly doc:PDFDocument,readonly fonts:Fonts,readonly a:LocationAnalysis){}
  text(s:string,x:number,y:number,size=10,bold=false,color=INK){
    this.page.drawText(clean(s),{x,y,size,font:bold?this.fonts.bold:this.fonts.regular,color});
  }
  lines(s:string,width=WIDTH,size=10,bold=false) {
    const font=bold?this.fonts.bold:this.fonts.regular;
    const lines:string[]=[];let line='';
    for(const ch of clean(s)){if(line&&font.widthOfTextAtSize(line+ch,size)>width*.78){lines.push(line);line='';}line+=ch;}
    if(line)lines.push(line);return lines.length?lines:[''];
  }
  pageStart(title:string,tax=false,continued=false){
    this.page=this.doc.addPage(PageSizes.A4);this.title=title;this.tax=tax;
    if(tax)this.page.drawRectangle({x:0,y:0,width:W,height:H,color:PALE});
    this.text('THE FOUNT',M,H-30,12,true,NAVY);
    this.text('MEDICAL LOCATION / BRIEF',M+120,H-29,8,false,MUTED);
    this.text(title+(continued?' · 계속':''),M,H-64,22,true,NAVY);
    this.text(this.a.specialty+' / 반경 '+fmt(this.a.radiusMeters)+'m / '+date(this.a.analyzedAt),M,H-83,9,false,MUTED);
    this.page.drawLine({start:{x:M,y:H-98},end:{x:W-M,y:H-98},thickness:1,color:LINE});
    this.y=H-122;
  }
  ensure(height:number){if(this.y-height<BOTTOM)this.pageStart(this.title,this.tax,true);}
  heading(s:string){this.ensure(125);this.paragraph(s,{size:14,bold:true,gap:7});}
  paragraph(s:string,{size=10.5,color=INK,gap=12,bold=false}={}){
    for(const line of this.lines(s,WIDTH,size,bold)){this.ensure(size*1.55);this.text(line,M,this.y,size,bold,color);this.y-=size*1.55;}
    this.y-=gap;
  }
  bullet(s:string){this.paragraph('• '+s,{gap:8});}
  callout(title:string,body:string,tone=PALE){
    const lines=this.lines(body,WIDTH-28,10.5);const h=49+lines.length*16;
    if(h>H-190){this.heading(title);this.paragraph(body);return;}
    this.ensure(h+14);
    this.page.drawRectangle({x:M,y:this.y-h+14,width:WIDTH,height:h,color:tone,borderColor:LINE,borderWidth:.6});
    this.text(title,M+14,this.y-8,12,true,NAVY);
    lines.forEach((s,k)=>this.text(s,M+14,this.y-31-k*16,10.5));
    this.y-=h+14;
  }
  cards(items:[string,string,string][]){
    const gap=12,cell=(WIDTH-gap*(items.length-1))/items.length;
    const h=120;this.ensure(h+20);
    items.forEach(([label,value,note],i)=>{
      const x=M+i*(cell+gap);
      this.page.drawRectangle({x,y:this.y-h+12,width:cell,height:h,color:i===items.length-1?WARM:WHITE,borderColor:LINE,borderWidth:.7});
      let yy=this.y-7;
      for(const line of this.lines(label,cell-24,10,true)){this.text(line,x+12,yy,10,true,MUTED);yy-=14;}
      yy-=12;
      const size=Math.min(23,(cell-24)/Math.max(1,this.fonts.bold.widthOfTextAtSize(value,1)));
      this.text(value,x+12,yy,size,true,NAVY);yy-=23;
      for(const line of this.lines(note,cell-24,9)){this.text(line,x+12,yy,9,false,MUTED);yy-=13;}
    });
    this.y-=h+26;
  }
  link(label:string,url:string,x=M,y=this.y,width=WIDTH){
    this.text(label,x,y,10,true,TEAL);
    const ref=this.doc.context.register(this.doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[x,y-4,x+width,y+12],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFHexString.fromText(new URL(url).href)}}));
    this.page.node.addAnnot(ref);
  }
  table(headers:string[],widths:number[],rows:Row[],size=10,padding=16){
    const lineHeight=size*1.5;
    const headHeight=Math.max(...headers.map((s,i)=>this.lines(s,widths[i]-14,size,true).length))*lineHeight+16;
    const head=()=>{
      this.ensure(headHeight+40);
      this.page.drawRectangle({x:M,y:this.y-headHeight+12,width:WIDTH,height:headHeight,color:NAVY});
      let x=M;
      headers.forEach((s,i)=>{this.lines(s,widths[i]-14,size,true).forEach((line,k)=>this.text(line,x+7,this.y-5-k*lineHeight,size,true,WHITE));x+=widths[i];});
      this.y-=headHeight;
    };
    head();
    rows.forEach((row,index)=>{
      const wrapped=row.cells.map((s,i)=>this.lines(s,widths[i]-14,size,!!row.emphasis));
      const height=Math.max(...wrapped.map(x=>x.length))*lineHeight+padding+(row.url?20:0);
      if(this.y-height<BOTTOM){this.pageStart(this.title,this.tax,true);head();}
      this.page.drawRectangle({x:M,y:this.y-height+12,width:WIDTH,height,color:row.emphasis?WARM:index%2===0?WHITE:PALE});
      let x=M;
      wrapped.forEach((lines,i)=>{lines.forEach((line,k)=>{
        const right=i>0&&/^[-+\d,%. /년개월만원]+$/.test(row.cells[i]);
        const xx=right?x+widths[i]-7-(row.emphasis?this.fonts.bold:this.fonts.regular).widthOfTextAtSize(line,size):x+7;
        this.text(line,xx,this.y-5-k*lineHeight,size,!!row.emphasis,INK);
      });x+=widths[i];});
      if(row.url)this.link('카카오맵에서 확인하기 ↗',row.url,M+7,this.y-height+19,WIDTH-14);
      this.y-=height;
    });
    this.y-=18;
  }
  finish(){
    const pages=this.doc.getPages();
    pages.forEach((page,i)=>{
      this.page=page;
      page.drawLine({start:{x:M,y:36},end:{x:W-M,y:36},thickness:.5,color:LINE});
      this.text('THE FOUNT · 사전 검토용 / '+REPORT_VERSION,M,22,8,false,MUTED);
      this.text((i+1)+' / '+pages.length,W-M-36,22,8,false,MUTED);
    });
  }
}

function counts(a:LocationAnalysis,key:'medical'|'matchingSpecialty'|'pharmacy'){
  if(!a.metrics.some(m=>m.value!==null)&&a.places.length===0)return '확인 전';
  return fmt(a.counts[key])+'곳'+(a.countLimits?.[key]?' 이상':'');
}
// The brief deliberately selects only decision-critical details; full data stays in the app.
const brief=(s:string,max=135)=>{const text=clean(s);return text.length>max?text.slice(0,max-1)+'…':text;};
export const MAX_REPORT_COMPETITORS=10;
export function briefCompetitors(a:LocationAnalysis){return reportCompetitors(a).filter(p=>p.distanceMeters<=a.radiusMeters).slice(0,MAX_REPORT_COMPETITORS);}
function locationBrief(r:Report,a:LocationAnalysis){
  r.pageStart('01. 입지 분석 · 핵심 요약');
  r.paragraph(brief(a.location.displayName,75),{size:15,bold:true});
  const d=a.demographics,known=a.metrics.filter(m=>m.value!==null).length;
  r.cards([
    ['거주인구',d?fmt(d.residentPopulation)+'명':'확인 전','행정동 전체 기준'],
    ['직장인구',d?fmt(d.workerPopulation)+'명':'확인 전','사업체 종사자 기준'],
    ['참고 입지점수',known>=4?a.observedScore+'/100':'판단 유보',known+'/6개 항목 반영 · 성공확률 아님']
  ]);
  r.callout('이 지역을 보는 핵심',brief(a.regionalProfile?.characterReason||a.insight,150));
  r.table(['평가항목','점수','평가항목','점수'],[175,80,175,WIDTH-430],
    [0,2,4].map(k=>({cells:[a.metrics[k]?.label||'항목 없음',a.metrics[k]?.value==null?'미산정':fmt(a.metrics[k].value!),a.metrics[k+1]?.label||'항목 없음',a.metrics[k+1]?.value==null?'미산정':fmt(a.metrics[k+1].value!)]})),10,10);
  r.bullet('강점 · '+brief(a.strengths[0]||'자료가 충분하지 않아 강점을 단정하지 않았습니다.',100));
  r.bullet('주의 · '+brief(a.risks[0]||'주차·간판 노출·임대조건을 현장에서 확인하세요.',100));
  const p=a.regionalProfile;
  if(p)r.paragraph('환자층 확인 · '+brief(p.specialtyFit[0]||p.doctorChecks[0]||'실제 진료 수요를 현장에서 확인하세요.',105),{size:10,color:TEAL});
  r.paragraph('자료: '+(d?'SGIS '+d.year+'년 / '+d.areaName+' 전체. 반경 내 인구와 다릅니다.':'인구자료 미확보.')+' 장소검색: '+date(a.analyzedAt)+'. 확인되지 않은 항목은 0점이 아닙니다.',{size:9,color:MUTED,gap:0});
}
function locationDetail(r:Report,a:LocationAnalysis){
  r.pageStart('01. 입지 분석 · 환자층과 판단 근거');
  const d=a.demographics,p=a.regionalProfile;
  const sameYear=!!d&&!!p&&d.year===p.year;
  const share=(value:number|undefined)=>positive(value)&&sameYear&&d!.residentPopulation>0?(value/d!.residentPopulation*100).toFixed(1)+'%':'확인 전';
  const people=(value:number|undefined)=>positive(value)?fmt(value)+'명':'확인 전';
  r.paragraph('어떤 환자들이 생활하는 지역인가요?',{size:14,bold:true});
  r.table(['환자층','인구','거주인구 대비'],[170,180,WIDTH-350],[
    ['남성',p?.malePopulation],['여성',p?.femalePopulation],
    ['15세 미만',p?.childPopulation],['20~39세',p?.youngAdultPopulation],
    ['40~59세',p?.middleAgePopulation],['65세 이상',p?.seniorPopulation]
  ].map(([label,v])=>({cells:[String(label),people(v as number|undefined),share(v as number|undefined)]})),10.5,8);
  r.paragraph('연령대는 주요 구간만 표시하므로 합계가 100%가 아닙니다. 인구·비중은 행정동 전체 기준이며, 실제 방문환자 비율은 아닙니다.',{size:9,color:MUTED});
  r.paragraph('주변 시설과 생활권',{size:14,bold:true,gap:9});
  const facilities=(v:number|undefined)=>positive(v)?fmt(v)+'곳':'확인 전';
  r.table(['초등학교','어린이집·유치원','주차시설'],[WIDTH/3,WIDTH/3,WIDTH/3],[{cells:[facilities(p?.elementarySchools),facilities(p?.childcareFacilities),a.analyzedAt&&a.analyzedAt!==new Date(0).toISOString()?facilities(a.counts.parking):'확인 전']}],10,8);
  r.paragraph('선택 반경의 공개 장소검색 기준입니다. 학교 수가 많다고 소아 진료 수요가 보장되지는 않으며, 주차시설 수는 입주 건물의 주차 가능 대수가 아닙니다.',{size:9,color:MUTED,gap:10});
  r.paragraph(a.specialty+' 개원 관점에서 읽기',{size:14,bold:true,gap:8});
  const fit=p?.specialtyFit?.filter(Boolean)||[];
  r.paragraph(brief(fit[0]||'목표 환자의 연령대와 생활시간, 실제 이동 경로를 대조하세요. 현재 자료만으로 특정 진료과의 성공을 단정하지 않습니다.',150),{size:10.5,color:TEAL,gap:9});
  if(fit[1])r.paragraph(brief(fit[1],100),{size:10,gap:9});
  r.paragraph('계약 전, 현장에서 확인할 두 가지',{size:14,bold:true,gap:8});
  const checks=[...(p?.doctorChecks||[]).filter(s=>!fit.some(f=>clean(f)===clean(s))),
    '목표 환자층이 건물 앞을 지나는 시간대와 엘리베이터·주차 접근성을 확인하세요.',
    '경쟁병원의 세부 진료, 운영시간과 대기 수준을 직접 비교하세요.'
  ];
  checks.slice(0,2).forEach((s,k)=>r.paragraph((k+1)+'. '+brief(s,100),{size:10,gap:7}));
  r.paragraph('인구: SGIS '+(p?.year||d?.year||'기준연도 확인 전')+'년 / '+brief(p?.areaName||d?.areaName||'지역 자료 미확보',45)+'. 시설: '+(a.provider==='kakao'?'Kakao Local':'OpenStreetMap')+' / '+date(a.analyzedAt)+'. 신도시·구도심의 유불리는 실제 입주·개발 현황을 추가 확인해야 합니다.',{size:9,color:MUTED,gap:0});
}
function locationFactors(r:Report,a:LocationAnalysis){
  r.pageStart('01. 입지 분석 · 점수의 실제 의미');
  r.paragraph('점수보다 중요한 것은, 무엇을 근거로 평가했는가입니다.',{size:12,bold:true,gap:14});
  const guidance:Record<string,string>={
    '잠재환자 수요':'생활인구는 실제 환자 수가 아닙니다. 목표 연령층이 진료시간에 이 건물까지 오는지 확인해야 합니다.',
    '경쟁환경':'경쟁 점수가 낮다는 것은 경쟁 부담을 뜻합니다. 같은 과라도 세부 진료·가격대·운영시간이 겹치는지 비교하세요.',
    '소비력':'지역 소비 수준은 참고 신호입니다. 병원의 객단가나 비급여 진료 지출로 그대로 환산할 수 없습니다.',
    '접근성':'역과 주차장이 가까워도 출입구·횡단보도·경사·엘리베이터에 따라 실제 환자 동선은 달라집니다.',
    '비용효율':'지역 공표 임대료와 개별 호실의 견적은 다릅니다. 입주 층·면적·관리비·보증금까지 대조하세요.',
    '성장성':'과거 지역 추세를 바탕으로 한 참고값입니다. 신규 입주나 개발사업이 확정·반영되었다는 뜻은 아닙니다.'
  };
  for(const m of a.metrics.slice(0,6)){
    r.ensure(90);
    r.paragraph(m.label+'  '+(m.value===null?'미산정':fmt(m.value)+' / 100'),{size:12,bold:true,color:NAVY,gap:5});
    r.paragraph('확인 근거 · '+brief(m.note,220),{size:10,color:TEAL,gap:4});
    r.paragraph(m.value===null?'자료가 충분하지 않아 점수를 매기지 않았습니다. 현장 견적이나 추가 자료를 확인한 뒤 판단하세요.':guidance[m.label]||'이 수치의 기준 시점과 범위를 확인한 뒤 실제 개원 조건과 비교하세요.',{size:10,gap:13});
  }
  r.paragraph('점수는 후보지 비교용이며 성공확률·매출 예측이 아닙니다. 행정동·상권 단위 자료와 선택 반경의 장소검색 결과가 함께 사용됩니다.',{size:9,color:MUTED,gap:0});
}
function locationDecision(r:Report,a:LocationAnalysis){
  r.pageStart('01. 입지 분석 · 개원 판단과 현장 검토');
  r.callout(brief(a.regionalProfile?.character||'지역 특성 확인',35),brief(a.regionalProfile?.characterReason||a.insight||'현재 확인된 자료만으로 계약 여부를 결정하지 마세요.',150));
  r.paragraph('검토할 만한 기회',{size:14,bold:true,gap:8});
  const strengths=a.strengths.filter(s=>!s.includes(a.regionalProfile?.characterReason||'__none__'));
  (strengths.length?strengths.slice(0,2):['확인된 강점이 충분하지 않습니다. 목표 환자층과 실제 생활 동선부터 확인하세요.']).forEach(s=>r.bullet(brief(s,130)));
  r.paragraph('계약 전에 풀어야 할 위험',{size:14,bold:true,gap:8});
  (a.risks.length?a.risks.slice(0,3):['실제 임대조건, 경쟁병원 진료내용, 건물 접근성은 현장 확인이 필요합니다.']).forEach(s=>r.bullet(brief(s,120)));
  r.paragraph('현장에서는 이렇게 확인하세요',{size:14,bold:true,gap:8});
  const fit=a.regionalProfile?.specialtyFit||[];
  const checks=(a.regionalProfile?.doctorChecks||[]).filter(s=>!fit.some(f=>clean(f)===clean(s)));
  const tasks=checks.length?checks.slice(0,3):[
    '평일 점심·퇴근 시간과 주말에 후보지 앞 보행량과 환자층을 비교하세요.',
    '같은 진료과 병원의 세부 진료·운영시간·대기 수준을 확인하세요.',
    '층별 가시성·엘리베이터·주차·실제 임대 견적을 확인하세요.'
  ];
  tasks.forEach((s,k)=>r.paragraph((k+1)+'. '+brief(s,130),{size:10.5,gap:9}));
  r.callout('다음 결정: 숫자와 현장 조건을 함께 비교하세요.','목표 환자층, 진료 차별점, 월 고정비가 모두 맞는지 확인하세요. 불확실한 항목이 크다면 다른 후보지 한두 곳과 비교한 뒤 계약 여부를 결정하세요.',WARM);
  r.paragraph('신도시는 실제 입주율·상가 공실·의료수요 정착 속도, 구도심은 기존 환자 관계·건물 노후·주차를 추가 확인하세요. 현재 자료만으로 신도시·구도심을 단정하거나 매출을 보장하지 않습니다.',{size:9,color:MUTED,gap:0});
}
function forecastBrief(r:Report,a:LocationAnalysis){
  r.pageStart('02. 앞으로 3년의 전망');
  const f=a.growthForecast;
  if(f?.status==='available'&&f.historical.length&&f.projected.length){
    const points=[...f.historical,...f.projected].sort((a,b)=>a.year-b.year);
    const base=points.find(p=>p.year===f.baseYear),last=f.projected[f.projected.length-1];
    r.paragraph(f.areaName,{size:14,bold:true});
    r.paragraph('어떤 변화가 예상되는지, 같은 기준으로 비교합니다.',{color:MUTED});
    const series=[['residentPopulation','거주인구',TEAL],['workerPopulation','직장인구',NAVY],['businesses','사업체',GOLD]] as const;
    const data=series.map(([key,label,color])=>({key,label,color,points:indexedForecast(points,key,f.baseYear)})).filter(s=>s.points);
    const vals=data.flatMap(s=>s.points!.map(p=>p.index)),lo=Math.min(95,...vals),hi=Math.max(105,...vals);
    const x0=M+40,pw=WIDTH-62,top=r.y-30,h=165,yy=(v:number)=>top-h+(v-lo)/(hi-lo)*h;
    const xx=(year:number)=>x0+(year-points[0].year)/Math.max(1,points[points.length-1].year-points[0].year)*pw;
    for(const v of [lo,100,hi]){r.page.drawLine({start:{x:x0,y:yy(v)},end:{x:x0+pw,y:yy(v)},color:LINE,thickness:.6});r.text(fmt(v),M,yy(v)-3,9,false,MUTED);}
    data.forEach(s=>s.points!.forEach((p,k)=>{
      const x=xx(p.year);
      if(k)r.page.drawLine({start:{x:xx(s.points![k-1].year),y:yy(s.points![k-1].index)},end:{x,y:yy(p.index)},color:s.color,thickness:1.8,dashArray:p.kind==='projected'?[4,3]:undefined});
      r.page.drawCircle({x,y:yy(p.index),size:2.5,color:s.color});
    }));
    points.forEach(p=>r.text(String(p.year),xx(p.year)-11,top-h-18,9,false,MUTED));
    r.y=top-h-44;
    series.forEach(([,label,color],k)=>r.text('● '+label,M+k*160,r.y,10,true,color));r.y-=26;
    r.paragraph(f.baseYear+'년=100 / 과거 관측: 실선 · 향후 추정: 점선',{size:9.5,color:MUTED});
    r.table(['항목',f.baseYear+'년 관측',last.year+'년 추정'],[155,178,WIDTH-333],series.map(([key,label])=>({cells:[label,base?fmt(base[key]):'확인 전',fmt(last[key])]})),10,12);
    r.callout('전망은 확정된 미래가 아닙니다.','최근 추세가 이어진다는 가정입니다. 실제 입주·개발 일정과 경쟁병원 변화를 함께 확인하세요.');
    r.paragraph('자료: SGIS / '+f.model+'. 인구·종사자 단위는 명, 사업체는 곳. 병원 매출이나 입지점수 예측이 아닙니다.',{size:9.5,color:MUTED});
  }else r.callout('수치 전망을 제시할 자료가 부족합니다.','임의 전망치를 넣지 않았습니다. 신규 입주, 교통 계획, 병원 개폐업 여부를 직접 확인해주세요.');
  if(a.developmentPlans?.status==='available'&&a.developmentPlans.plans.length)
    r.paragraph('개발 참고 · '+brief(a.developmentPlans.plans.slice(0,2).map(p=>p.name+' ('+p.status+')').join(' / '),130)+' / '+a.developmentPlans.source+' '+(a.developmentPlans.referenceDate||''),{size:9.5,color:MUTED});
}
function forecastDetail(r:Report,a:LocationAnalysis){
  r.pageStart('02. 3년 전망 · 변화 수치와 확인사항');
  const f=a.growthForecast;
  if(f?.status==='available'&&f.historical.length&&f.projected.length){
    const points=[...f.historical,...f.projected].sort((a,b)=>a.year-b.year);
    r.paragraph('관측된 과거와 추정한 미래를 구분합니다.',{size:14,bold:true});
    r.table(['연도','구분','거주인구','종사자','사업체'],[60,70,130,130,WIDTH-390],points.map(p=>({cells:[String(p.year),p.kind==='observed'?'관측':'추정',fmt(p.residentPopulation),fmt(p.workerPopulation),fmt(p.businesses)],emphasis:p.year===f.baseYear})),10,10);
    const base=points.find(p=>p.year===f.baseYear),last=f.projected[f.projected.length-1];
    if(base){
      r.paragraph(f.baseYear+'년 대비 '+last.year+'년 예상 변화',{size:14,bold:true});
      r.table(['항목','증감','변화율'],[180,180,WIDTH-360],([['거주인구','residentPopulation'],['종사자','workerPopulation'],['사업체','businesses']] as const).map(([label,key])=>{
        const change=last[key]-base[key];return {cells:[label,(change>0?'+':'')+fmt(change)+(key==='businesses'?'곳':'명'),base[key]>0?(change>0?'+':'')+(change/base[key]*100).toFixed(1)+'%':'산정 불가']};
      }),10,10);
    }
    r.paragraph('자료: '+f.source+' / '+f.areaName+' / '+f.model+'. 인구·종사자는 명, 사업체는 곳입니다. 기준연도 이후 공백 연도의 관측값은 확보되지 않은 자료입니다.',{size:9.5,color:MUTED});
  }else r.callout('연도별 전망 수치가 없습니다.','확인되지 않은 값을 채우지 않았습니다. 공공 통계와 실제 입주·개발 일정을 추가 확인해야 합니다.');
  r.paragraph('개발계획과 입주는 별도로 확인하세요',{size:14,bold:true});
  const plans=a.developmentPlans;
  if(plans?.status==='available'&&plans.plans.length){
    r.table(['사업명','유형·상태 / 일정'],[WIDTH*.53,WIDTH*.47],plans.plans.slice(0,2).map(p=>({cells:[brief(p.name,50),brief(p.category+' · '+p.status+' / '+(p.targetDate||'일정 확인 필요'),60)]})),10,8);
    r.paragraph('개발자료: '+plans.source+' / '+(plans.referenceDate||'기준일 확인 필요')+'. 대표 2건 이내 표시. 일정은 변경될 수 있습니다.',{size:9,color:MUTED});
  }else r.paragraph('보고서에 반영된 개발사업이 없습니다. 사업이 없다는 뜻은 아니므로, 지자체 공고와 실제 착공·입주 일정을 확인하세요.',{size:10});
  r.paragraph('확인 순서 · 신규 입주 규모와 시점 → 실제 상권 형성 → 경쟁병원 신규 진입. 지역 증가율을 병원 매출 증가율로 그대로 사용하지 마세요.',{size:10,color:TEAL,gap:0});
}
function competitorsBrief(r:Report,a:LocationAnalysis){
  r.pageStart('03. 가까운 경쟁병원');
  const all=reportCompetitors(a).filter(p=>p.distanceMeters<=a.radiusMeters),shown=briefCompetitors(a);
  r.paragraph(a.specialty+' · 동일 진료과 장소 '+fmt(all.length)+'곳 중 가까운 '+shown.length+'곳',{size:14,bold:true});
  r.paragraph('직선거리 순으로 최대 10곳을 선정했습니다. 진료 수준·매출 순위는 아닙니다.',{size:10,color:MUTED});
  if(shown.length)r.table(['병원명','주소','직선거리'],[200,WIDTH-275,75],shown.map((p,k)=>({cells:[(k+1)+'. '+brief(p.name,44),p.address?.trim()||'주소 확인 필요',fmt(p.distanceMeters)+'m']})),10,10);
  else r.callout('표시할 동일 진료과 병원이 없습니다.','검색 결과가 없더라도 실제 병원이 없다고 단정할 수 없습니다. 현장 운영 여부를 확인하세요.');
  r.paragraph('거리는 분석지점에서 병원까지의 직선거리이며 실제 도보거리와 다릅니다. 진료내용·운영시간·실제 입주 층은 별도로 확인하세요. 전체 목록은 웹사이트의 경쟁병원 메뉴에서 볼 수 있습니다.',{size:10,color:MUTED});
  r.paragraph('자료: '+(a.provider==='kakao'?'Kakao Local':'OpenStreetMap')+' / '+date(a.analyzedAt)+'. 병원명·장소 분류 기준이며 실제 전문과목과 다를 수 있습니다.',{size:9,color:MUTED});
}
function financeBrief(r:Report,a:LocationAnalysis,i:OpeningInputs){
  r.pageStart('04. 수익성 분석');
  const p=calculateOpeningPlan(a,i);
  r.paragraph('입력한 환자 수와 비용으로 보는 운영 가능성',{size:14,bold:true});
  r.cards([
    ['운영비 손익분기',p.breakEvenPatients===null?'산정 불가':p.breakEvenPatients+'명/일','대출·생활비·세금 제외'],
    ['목표 도달 월 세후 현금',money(p.monthlyCash),p.targetMonth+'개월차 · 생활비 차감'],
    ['세후 자기자금 회수',p.equity===0?'해당 없음':p.paybackMonths===null?'10년 내 미회수':p.paybackMonths+'개월','성장률·세금 반영']
  ]);
  r.table(['주요 입력 조건','금액·가정'],[225,WIDTH-225],[
    ['입주 / 초기 투자',i.floor+'층 · '+i.areaPyeong+'평 / '+money(i.depositManwon+i.openingBudgetManwon)],
    ['목표 환자 / 진료단가',i.dailyPatients+'명/일 · '+money(i.revenuePerPatient)+' / 월 '+i.clinicDays+'일'],
    ['첫달 확보율 / 목표 도달',(i.rampMonths===1?100:i.initialPercent)+'% / '+i.rampMonths+'개월차'],
    ['월 고정비 / 변동비율',money(i.monthlyRentManwon+i.monthlyPayrollManwon+i.monthlyMarketingManwon+i.monthlyOtherCost)+' / '+i.variablePercent+'%'],
    ['대출 / 금리 / 상환',money(p.loan)+' · 연 '+i.annualInterest+'% · '+i.loanMonths+'개월'],
    ['원장 생활비 / 운영 예비자금',money(i.ownerWithdrawal)+'/월 · '+money(p.reserve)]
  ].map(cells=>({cells})),10,8);
  r.heading('환자 수가 달라지면');
  r.table(['환자 수 가정','월 세후 현금','회수기간'],[165,173,WIDTH-338],[.8,1,1.2].map((factor,k)=>{
    const v=calculateOpeningPlan(a,i,factor);
    return {cells:[['보수적 (-20%)','기준','낙관적 (+20%)'][k],money(v.monthlyCash),v.equity===0?'해당 없음':v.paybackMonths===null?'10년 내 미회수':v.paybackMonths+'개월'],emphasis:k===1};
  }),10,8);
  r.paragraph('매출은 입지 데이터의 자동 예측이 아닌 입력 가정입니다. 세후 현금은 운영비·원리금·생활비·예상 세금을 뺀 금액입니다. 예비자금은 초기 투자와 별도입니다.',{size:9.5,color:MUTED});
  if(i.loanAmount>p.loan)r.paragraph('대출은 초기 투자액까지만 반영했습니다.',{size:9.5,color:GOLD});
}
function financeCashflow(r:Report,a:LocationAnalysis,i:OpeningInputs){
  r.pageStart('04. 수익성 · 첫해 월별 현금흐름');
  const p=calculateOpeningPlan(a,i),total=(key:'revenue'|'cash'|'tax')=>p.months.reduce((s,m)=>s+m[key],0);
  r.paragraph('개원 초기의 적자와 현금 회복 시점을 확인하세요.',{size:14,bold:true});
  const low=Math.min(0,...p.months.map(m=>m.cash)),high=Math.max(1,...p.months.map(m=>m.cash)),x0=M+48,pw=WIDTH-62,top=r.y-16,h=90,bottom=top-h,yy=(v:number)=>bottom+(v-low)/(high-low)*h;
  for(const v of Array.from(new Set([low,0,high]))){r.page.drawLine({start:{x:x0,y:yy(v)},end:{x:x0+pw,y:yy(v)},thickness:.6,color:LINE});r.text(fmt(v),M,yy(v)-3,8,false,MUTED);}
  p.months.forEach((m,k)=>{const x=x0+k*pw/11;if(k)r.page.drawLine({start:{x:x-pw/11,y:yy(p.months[k-1].cash)},end:{x,y:yy(m.cash)},thickness:2,color:TEAL});r.page.drawCircle({x,y:yy(m.cash),size:2.8,color:m.cash<0?RED:TEAL});r.text(String(m.month),x-3,bottom-17,9,false,MUTED);});
  r.y=bottom-40;r.paragraph('가로축: 개원 후 개월 / 세로축: 월 세후 잔여현금(만원)',{size:9,color:MUTED});
  r.table(['월','매출','운영비','원리금','생활비','예상세금','세후현금'],[30,82,82,79,70,79,WIDTH-422],p.months.map(m=>({cells:[String(m.month),fmt(m.revenue),fmt(m.revenue-m.operating),fmt(m.principal+m.interest),fmt(i.ownerWithdrawal),fmt(m.tax),fmt(m.cash)]})),9.5,6);
  r.callout('첫해 합계','매출 '+money(total('revenue'))+' / 예상 세금 '+money(total('tax'))+' / 세후 현금 '+money(total('cash')),WARM);
  r.paragraph('세금은 해당 연도 예상 국세·지방세 합계의 1/12을 매월 차감합니다. 실제 세금 납부월의 통장 잔액과는 다릅니다.',{size:9.5,color:MUTED,gap:9});
  r.paragraph('원리금은 원금균등 상환 가정입니다. 운영 예비자금 '+money(p.reserve)+'은 첫 12개월 누적 현금 부족의 최대치이며 초기 투자와 별도입니다. 보증금 반환·장비 교체·보험청구 입금 지연은 미반영합니다.',{size:9.5,color:MUTED,gap:0});
}
function taxBrief(r:Report,i:OpeningInputs){
  r.pageStart('05. 성장 이후의 세금 이슈',true);
  const years=calculateFiveYearPlan(i),future=years.slice(1),last=years[4];
  r.cards([
    ['2~5년차 예상 세금',money(future.reduce((s,y)=>s+y.totalTax,0)),'국세·지방세 합계'],
    ['5년차 예상 세금',money(last.totalTax),'1년 동안의 산출세액'],
    ['5년차 세후 현금',money(last.afterTaxCash),'원금상환·생활비 차감']
  ]);
  const max=Math.max(1,...years.map(y=>y.totalTax)),bottom=r.y-94;
  years.forEach((y,k)=>{const x=M+30+k*97,h=y.totalTax/max*72;if(h>0)r.page.drawRectangle({x,y:bottom,width:40,height:h,color:k===4?GOLD:NAVY});r.text(fmt(y.totalTax),x-1,bottom+h+9,9,true,NAVY);r.text(y.year+'년차',x+3,bottom-17,9,false,MUTED);});
  r.y=bottom-39;
  r.paragraph('연도별 예상 세금 / 단위: 만원',{size:9,color:MUTED});
  r.table(['연간 항목','2년차','3년차','4년차','5년차'],[155,89,89,89,WIDTH-422],
    ([['매출','revenue'],['현금 운영비','cashCosts'],['영업이익','operatingProfit'],['종합소득세','nationalTax'],['지방소득세','localTax'],['세후 현금','afterTaxCash']] as const).map(([label,key])=>({cells:[label,...future.map(y=>fmt(y[key]))],emphasis:key==='afterTaxCash'})),9.5,8);
  r.paragraph('연 매출 증가 '+i.annualRevenueGrowth+'% · 고정비 증가 '+i.annualFixedGrowth+'% · 감가상각 '+money(i.annualDepreciation)+' · 소득공제 '+money(i.annualIncomeDeduction),{size:9,color:MUTED});
  r.paragraph('개인 단독개원·사업소득만 가정한 추정입니다. 다른 소득, 세액공제·감면·기납부세액 등은 미반영하며 실제 납부세액과 다릅니다. 감가상각은 영업이익에서 차감하되 현금에서 이중 차감하지 않습니다.',{size:9.5,color:MUTED,gap:9});
  if(i.annualDepreciation*5>i.openingBudgetManwon)r.paragraph('주의: 5년 감가상각이 초기 시설·장비 지출보다 큽니다. 입력값을 확인해주세요.',{size:9.5,color:RED});
  r.paragraph('매출이 커질수록 비용 증빙과 자산·인력 구조를 함께 점검하세요. 절세 가능 여부는 실제 자료 검토 후 판단합니다.',{size:10,bold:true});
  r.link('더파운트 절세 플랜 상담하기 ↗','https://www.thefount.co.kr/contact');r.y-=22;
  r.paragraph('070-8064-2325 · 세율 기준: 국세청 종합소득세 / 지방세법 제92조',{size:9,color:MUTED,gap:0});
}

function taxDetail(r:Report,i:OpeningInputs){
  r.pageStart('05. 세금 · 계산 내역과 절세 검토',true);
  const future=calculateFiveYearPlan(i).slice(1);
  r.paragraph('매출에서 과세표준, 세후 현금까지',{size:14,bold:true});
  const rows=[['매출','revenue'],['현금 운영비','cashCosts'],['영업이익','operatingProfit'],['사업용 대출이자','interest'],['사업소득','businessIncome'],['과세표준','taxable'],['종합소득세','nationalTax'],['지방소득세','localTax'],['예상 세금 합계','totalTax'],['대출 원금상환','principal'],['세후 현금','afterTaxCash']] as const;
  r.table(['연간 항목','2년차','3년차','4년차','5년차'],[155,89,89,89,WIDTH-422],rows.map(([label,key])=>({cells:[label,...future.map(y=>fmt(y[key]))],emphasis:key==='totalTax'||key==='afterTaxCash'})),9.5,7);
  r.paragraph('단위: 만원 / 반올림 때문에 표시값 합계에 소액 차이가 날 수 있습니다.',{size:9,color:MUTED});
  r.paragraph('세금과 현금은 다르게 계산합니다',{size:13,bold:true,gap:7});
  r.paragraph('영업이익 = 매출 - 현금 운영비 - 감가상각비.\n과세표준 = 사업소득 - 소득공제(최소 0).\n세후 현금 = 매출 - 현금 운영비 - 원리금 - 생활비 - 예상 세금.',{size:10,gap:9});
  r.paragraph('원금상환·원장 생활비는 현금 지출이지만 사업소득의 비용으로 차감하지 않습니다. 감가상각은 현금에서 다시 빼지 않습니다.',{size:9.5,color:MUTED});
  r.paragraph('절세 상담 전에 준비할 자료',{size:13,bold:true,gap:7});
  r.paragraph('비용 증빙·급여명세 / 시설·장비 자산명세 / 대출 상환표 / 다른 소득·공제 내역을 준비하세요. 적용 가능한 제도와 절세금액은 자료 검토 후 판단합니다.',{size:10,gap:9});
  r.paragraph('개인 단독개원·사업소득만 가정합니다. 다른 소득·이월결손금·세무조정·세액공제·감면·기납부세액은 미반영합니다. 현행 세율 고정 가정이며 실제 신고·납부세액과 다릅니다.',{size:9,color:MUTED,gap:9});
  r.link('더파운트 절세 플랜 상담하기 ↗','https://www.thefount.co.kr/contact');r.y-=22;
  r.paragraph('국세청 종합소득세 기본세율 / 지방세법 제92조 · 070-8064-2325',{size:9,color:MUTED,gap:0});
}
export async function buildMedicalReport(a:LocationAnalysis,i:OpeningInputs){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const [regularBytes,boldBytes]=await Promise.all([
    readFile(join(process.cwd(),'public/fonts/NotoSansKR-report-400.ttf')),
    readFile(join(process.cwd(),'public/fonts/NotoSansKR-700.ttf'))
  ]);
  const [regular,bold]=await Promise.all([doc.embedFont(regularBytes,{subset:false}),doc.embedFont(boldBytes,{subset:false})]);
  doc.setTitle('THE FOUNT 병원 입지분석 - '+a.location.displayName);
  doc.setAuthor('THE FOUNT');doc.setSubject('입지 근거·수익성·세후 현금흐름');doc.setKeywords([REPORT_VERSION,a.specialty,'병원 입지분석']);
  doc.setCreationDate(new Date());
  const r=new Report(doc,{regular,bold},a);
  locationBrief(r,a);locationDetail(r,a);locationFactors(r,a);locationDecision(r,a);
  forecastBrief(r,a);forecastDetail(r,a);competitorsBrief(r,a);
  financeBrief(r,a,i);financeCashflow(r,a,i);taxBrief(r,i);taxDetail(r,i);
  r.finish();
  return doc.save({useObjectStreams:true});
}
