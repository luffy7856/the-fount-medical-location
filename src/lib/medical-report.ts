import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, PDFPage, PDFFont, PDFHexString, PageSizes, rgb } from 'pdf-lib';
import type { LocationAnalysis, LivePlace, GrowthForecastPoint } from '../data/location-types';
import { matchesSpecialty } from '../data/specialties';
import { calculateOpeningPlan, calculateFiveYearPlan, type OpeningInputs } from '../data/opening-plan';

export const REPORT_VERSION = '2026.09.13-r2';
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
    this.page.drawRectangle({x:0,y:H-95,width:W,height:95,color:NAVY});
    this.text('THE FOUNT',M,H-30,13,true,WHITE);
    this.text('MEDICAL LOCATION REPORT',M+120,H-29,8,false,rgb(.68,.78,.85));
    this.text(title+(continued?' · 계속':''),M,H-64,19,true,WHITE);
    this.text(this.a.specialty+' / 반경 '+fmt(this.a.radiusMeters)+'m / '+date(this.a.analyzedAt),M,H-83,9,false,rgb(.78,.84,.89));
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
function summary(r:Report,a:LocationAnalysis,i:OpeningInputs){
  const p=calculateOpeningPlan(a,i);
  const known=a.metrics.filter(m=>m.value!==null).length;
  r.pageStart('01. 원장님을 위한 핵심 요약');
  r.paragraph(a.location.displayName,{size:17,bold:true});
  r.callout('이 보고서는 개원 결정 전 비교 자료입니다.',
    '공개자료로 확인한 지역 특성과 원장님이 입력한 수익성 가정을 구분했습니다. 점수는 개원 성공확률이 아니며, 예시 입력값은 실제 매출 예측이 아닙니다.');
  r.cards([
    ['운영비 손익분기',p.breakEvenPatients===null?'산정 불가':p.breakEvenPatients+'명/일','대출·생활비·세금 제외'],
    ['목표 도달 월 세후 현금',money(p.monthlyCash),p.targetMonth+'개월차 / 기준 시나리오'],
    ['세후 자기자금 회수',p.equity===0?'자기자금 없음':p.paybackMonths===null?'10년 내 미회수':p.paybackMonths+'개월','성장률·예상 세금 반영']
  ]);
  r.heading('입지를 판단할 때 먼저 볼 것');
  r.paragraph(a.regionalProfile?.characterReason||a.insight||'입주 건물의 접근성과 목표 환자층의 실제 동선을 확인하세요.');
  if(a.strengths.length)r.bullet('장점: '+a.strengths[0]);
  if(a.risks.length)r.bullet('주의: '+a.risks[0]);
  r.bullet('현장 확인: '+(a.regionalProfile?.doctorChecks[0]||'경쟁병원 진료내용, 주차, 관리비를 확인하세요.'));
  r.callout('점수보다 근거를 함께 보세요.',
    known>=4?'참고 입지점수 '+a.observedScore+'/100 · '+known+'/6개 평가항목 반영. 점수와 입력 매출은 별개이며 자동으로 연결하지 않습니다.':
    '현재 '+known+'/6개 평가항목만 확인되어 종합점수·등급을 강조하지 않았습니다. 확인된 자료와 다른 후보지를 함께 비교하세요.',WARM);
  r.paragraph('읽는 순서: 핵심 요약 → 지역 근거·전망 → 후보지와 경쟁병원 → 수익성·현금흐름 → 세금 → 현장 확인·출처',{size:9.5,color:MUTED});
}

function regional(r:Report,a:LocationAnalysis){
  r.pageStart('02. 환자층과 입지 판단 근거');
  const d=a.demographics,p=a.regionalProfile,total=d?.residentPopulation||0;
  const share=(v?:number)=>positive(v)&&total>0?fmt(v)+'명 · '+(v/total*100).toFixed(1)+'%':'확인 전';
  r.heading('어떤 환자들이 생활하나요?');
  const populationRows:Row[]=[];
  if(d){
    populationRows.push({cells:['거주인구 / 종사자',fmt(d.residentPopulation)+'명 / '+fmt(d.workerPopulation)+'명']});
    populationRows.push({cells:['남성 / 여성',share(p?.malePopulation)+' / '+share(p?.femalePopulation)]});
    for(const [label,value] of [['15세 미만',p?.childPopulation],['20~39세',p?.youngAdultPopulation],['40~59세',p?.middleAgePopulation],['65세 이상',p?.seniorPopulation]] as const){
      if(positive(value))populationRows.push({cells:[label,share(value)]});
    }
  }
  if(a.livingPopulation?.status==='available'&&positive(a.livingPopulation.total))populationRows.push({cells:['생활인구',fmt(a.livingPopulation.total)+'명 · '+a.livingPopulation.spatialUnit]});
  if(populationRows.length)r.table(['환자층 지표','확인된 값'],[160,WIDTH-160],populationRows);
  else r.callout('환자층 자료가 충분하지 않습니다.','거주인구나 생활인구를 0명으로 해석하지 마세요. 목표 연령층의 주거지·직장·통학 동선을 현장에서 확인하세요.');
  if(d)r.paragraph('인구 기준: '+d.areaName+' 전체 / '+d.year+'년 SGIS. 반경 내 인구와 다릅니다. 주요 연령구간만 표시하므로 합계는 100%가 아닙니다.',{size:9.5,color:MUTED});
  if(p){
    const facilities=[];
    if(positive(p.elementarySchools))facilities.push('초등학교 '+p.elementarySchools+'곳');
    if(positive(p.childcareFacilities))facilities.push('어린이집·유치원 '+p.childcareFacilities+'곳');
    if(facilities.length)r.paragraph('주변 시설: '+facilities.join(' / ')+' · 선택 반경 내 장소검색');
    r.heading(p.character);
    r.paragraph(p.characterReason);
    p.specialtyFit.forEach(s=>r.bullet(s));
  }
  r.paragraph('연령·성별이나 학교 수만으로 진료 수요와 매출을 보장하지 않습니다. 신도시·구도심 판단에는 실제 입주·개발 진행 확인이 필요합니다.',{size:9.5,color:MUTED});
  r.heading('6개 평가항목의 근거');
  r.table(['항목','점수','해석·근거'],[104,58,WIDTH-162],a.metrics.map(m=>({cells:[m.label,m.value===null?'미산정':fmt(m.value),m.note]})),10);
  r.heading('장점과 위험요인');
  a.strengths.forEach(s=>r.bullet('장점 · '+s));
  a.risks.forEach(s=>r.bullet('위험 · '+s));
  if(!a.strengths.length&&!a.risks.length)r.paragraph('확인된 근거가 부족하여 장점·위험을 확정하지 않았습니다.');
}

function forecast(r:Report,a:LocationAnalysis){
  r.pageStart('03. 앞으로 3년, 무엇이 달라질까요?');
  const f=a.growthForecast;
  if(!f||f.status!=='available'||!f.historical.length||!f.projected.length){
    r.callout('수치 전망을 제시할 자료가 충분하지 않습니다.','빈 그래프나 임의 전망치를 만들지 않았습니다. 아파트 입주·개발 일정·경쟁병원 변화를 현장 검토 항목으로 확인하세요.');
  }else{
    r.paragraph(f.areaName+' / '+f.source+' / '+f.model);
    r.callout('관측과 전망을 구분해 읽어주세요.','과거 관측값은 실선, 추정값은 점선입니다. 최근 추세가 이어진다는 가정이며, 개발 확정 효과나 병원 매출 예측은 아닙니다.');
    const points=[...f.historical,...f.projected].sort((x,y)=>x.year-y.year);
    const series=[['residentPopulation','거주인구',TEAL],['workerPopulation','종사자',NAVY],['businesses','사업체',GOLD]] as const;
    for(const [key,label,color] of series){
      const normalized=indexedForecast(points,key,f.baseYear);
      r.ensure(207);
      r.text(label+' · '+f.baseYear+'년=100',M,r.y,12,true,color);
      r.y-=18;
      if(!normalized){r.paragraph('기준연도 값이 없거나 0이어서 지수 그래프를 만들지 않았습니다.');continue;}
      const values=normalized.map(p=>p.index),min=Math.min(95,...values),max=Math.max(105,...values);
      const x0=M+46,plotW=WIDTH-68,top=r.y-12,height=94;
      const yy=(v:number)=>top-height+(v-min)/(max-min)*height;
      for(const value of [min,100,max]){
        r.page.drawLine({start:{x:x0,y:yy(value)},end:{x:x0+plotW,y:yy(value)},thickness:.5,color:LINE});
        r.text(value.toFixed(0),M,yy(value)-3,9,false,MUTED);
      }
      normalized.forEach((p,k)=>{
        const x=x0+k*plotW/Math.max(1,normalized.length-1);
        if(k){const prev=normalized[k-1];r.page.drawLine({start:{x:x-plotW/(normalized.length-1),y:yy(prev.index)},end:{x,y:yy(p.index)},thickness:1.7,color,dashArray:p.kind==='projected'?[4,3]:undefined});}
        r.page.drawCircle({x,y:yy(p.index),size:2.5,color});
        r.text(String(p.year),x-11,top-height-18,8,false,MUTED);
      });
      r.y=top-height-42;
      const first=points.find(p=>p.year===f.baseYear)!;
      const last=points[points.length-1];
      r.paragraph(f.baseYear+'년 '+fmt(first[key])+(key==='businesses'?'곳':'명')+' → '+last.year+'년 '+fmt(last[key])+(key==='businesses'?'곳':'명')+' (추정)',{size:10,color});
      r.y-=8;
    }
    r.paragraph('각 그래프의 세로축 범위는 다릅니다. 기울기만 비교하지 말고, 기준 100 대비 변화와 실제 수치를 함께 보세요.',{size:9.5,color:MUTED});
    r.table(['연도','구분','거주인구(명)','종사자(명)','사업체(곳)'],[55,66,130,130,WIDTH-381],
      points.map(p=>({cells:[String(p.year),p.kind==='projected'?'추정':'관측',fmt(p.residentPopulation),fmt(p.workerPopulation),fmt(p.businesses)]})),9.5);
  }
  r.heading('개발계획은 확정 여부부터 확인하세요');
  if(a.developmentPlans?.status==='available'&&a.developmentPlans.plans.length){
    r.table(['사업명','유형·상태','일정'],[230,160,WIDTH-390],a.developmentPlans.plans.map(p=>({cells:[p.name,p.category+' / '+p.status,p.targetDate||'확인 필요']})));
  }else r.paragraph('현재 보고서에 반영된 개발계획은 없습니다. 사업 승인 여부, 착공·입주 일정과 경쟁병원 증가 가능성을 별도로 확인하세요.');
}

function mapAndCompetitors(r:Report,a:LocationAnalysis){
  r.pageStart('04. 후보지와 경쟁병원');
  r.paragraph(a.location.displayName,{size:14,bold:true});
  r.link('후보지를 카카오맵 도로지도에서 보기 ↗',coordinateLink(a.location.displayName,a.location.latitude,a.location.longitude));
  r.y-=28;
  r.paragraph('좌표 기반 위치도 · 도로·건물 지도 아님. 원은 직선 분석 반경이며 실제 이동거리·진료권과 다릅니다.',{size:10,color:MUTED});
  const places=reportCompetitors(a),shown=places.filter(p=>p.distanceMeters<=a.radiusMeters);
  const h=310,cx=W/2,cy=r.y-h/2,R=132;
  r.page.drawRectangle({x:M,y:r.y-h,width:WIDTH,height:h,color:PALE,borderColor:LINE,borderWidth:.7});
  for(const size of [R/2,R])r.page.drawCircle({x:cx,y:cy,size,borderColor:LINE,borderWidth:1});
  r.page.drawLine({start:{x:cx-R,y:cy},end:{x:cx+R,y:cy},thickness:.5,color:LINE});
  r.page.drawLine({start:{x:cx,y:cy-R},end:{x:cx,y:cy+R},thickness:.5,color:LINE});
  r.text('N ↑',W-M-44,r.y-24,10,true,NAVY);
  const coordinates=shown.map(p=>{
    const east=(p.longitude-a.location.longitude)*111320*Math.cos(a.location.latitude*Math.PI/180);
    const north=(p.latitude-a.location.latitude)*111320;
    return {p,dx:east/a.radiusMeters*R,dy:north/a.radiusMeters*R};
  }).filter(p=>Math.hypot(p.dx,p.dy)<=R*1.03);
  coordinates.forEach(({p,dx,dy})=>{
    r.page.drawCircle({x:cx+dx,y:cy+dy,size:4.5,color:TEAL,borderColor:WHITE,borderWidth:1});
    const ref=r.doc.context.register(r.doc.context.obj({Type:'Annot',Subtype:'Link',Rect:[cx+dx-7,cy+dy-7,cx+dx+7,cy+dy+7],Border:[0,0,0],A:{Type:'Action',S:'URI',URI:PDFHexString.fromText(hospitalLink(p))}}));
    r.page.node.addAnnot(ref);
  });
  r.page.drawCircle({x:cx,y:cy,size:9,color:NAVY,borderColor:WHITE,borderWidth:2});
  r.text('분석지점',cx+13,cy-4,10,true,NAVY);
  r.text(fmt(a.radiusMeters)+'m',cx+R-25,cy-16,9,false,MUTED);
  r.text('● 분석지점   ● '+a.specialty+' 경쟁병원 '+coordinates.length+'곳 표시',M+14,r.y-h+14,9,false,NAVY);
  r.y-=h+22;
  r.paragraph('병원명·분류·좌표: '+(a.provider==='kakao'?'Kakao Local':'OpenStreetMap')+'. 점을 클릭하면 해당 병원을 확인할 수 있습니다. 가까운 병원은 점이 겹칠 수 있으므로 아래 목록을 함께 보세요.',{size:9.5,color:MUTED});
  r.table(['전체 의료기관','선택 진료과 검색','약국'],[WIDTH/3,WIDTH/3,WIDTH/3],[{cells:[counts(a,'medical'),counts(a,'matchingSpecialty'),counts(a,'pharmacy')]}]);
  r.paragraph('전체 기관 수는 '+(a.hiraMedical?.status==='available'?'HIRA 공식 집계':'장소검색 집계')+'이며, 아래는 이름·분류가 '+a.specialty+'에 해당하는 표시 가능한 '+places.length+'개 장소입니다. 검색 상한·좌표 확보 범위에 따라 집계 수와 다를 수 있습니다.',{size:9.5,color:MUTED});
  r.heading('같은 진료과의 경쟁병원');
  if(!places.length)r.callout('표시할 경쟁병원 목록이 없습니다.','의료기관이 없다는 의미로 단정하지 마세요. 장소 분류, 등록 여부와 실제 운영 여부를 확인하세요.');
  else r.table(['병원명 / 주소','진료분류','직선거리'],[WIDTH-175,100,75],places.map((p,k)=>({cells:[(k+1)+'. '+p.name+' / '+(p.address||'주소 확인 필요'),p.specialty||a.specialty,fmt(p.distanceMeters)+'m'],url:hospitalLink(p)})));
}

function finances(r:Report,a:LocationAnalysis,i:OpeningInputs){
  const p=calculateOpeningPlan(a,i);
  r.pageStart('05. 개원자금과 수익성');
  r.callout('입력 가정 · 기준 시나리오','환자 수, 진료단가, 비용은 사용자 입력값입니다. 입지 데이터가 자동 예측한 매출이 아닙니다. 초기 예시값을 실제 견적과 목표로 바꿔 검토하세요.');
  r.table(['입력 항목','금액·조건'],[WIDTH*.52,WIDTH*.48],[
    ['입주 층 / 전용면적',i.floor+'층 / '+i.areaPyeong+'평'],
    ['보증금 / 시설·장비 초기 지출',money(i.depositManwon)+' / '+money(i.openingBudgetManwon)],
    ['대출금 / 금리 / 상환기간',money(p.loan)+' / 연 '+i.annualInterest+'% / '+i.loanMonths+'개월 원금균등'],
    ['초기 자기자금',money(p.equity)],
    ['첫 달 환자 확보율 / 목표 도달', (i.rampMonths===1?100:i.initialPercent)+'% / '+i.rampMonths+'개월차'],
    ['목표 하루 환자 / 1회 방문당 진료매출',i.dailyPatients+'명 / '+money(i.revenuePerPatient)],
    ['월 진료일 / 원장 생활비',i.clinicDays+'일 / '+money(i.ownerWithdrawal)],
    ['월세 / 인건비',money(i.monthlyRentManwon)+' / '+money(i.monthlyPayrollManwon)],
    ['마케팅 / 기타 고정비',money(i.monthlyMarketingManwon)+' / '+money(i.monthlyOtherCost)],
    ['변동비율',i.variablePercent+'%'],
  ].map(cells=>({cells})));
  r.cards([
    ['목표 도달 월 세후 현금',money(p.monthlyCash),p.targetMonth+'개월차'],
    ['첫 12개월 운영 예비자금',money(p.reserve),'초기 투자액과 별도'],
    ['세후 자기자금 회수',p.equity===0?'자기자금 없음':p.paybackMonths===null?'10년 내 미회수':p.paybackMonths+'개월','原금·생활비·예상 세금 차감'.replace('原','원')]
  ]);
  if(p.equity===0)r.callout('전액 대출이어도 추가 자금은 필요할 수 있습니다.','초기 투자 자기자금이 없다는 뜻이지 0개월 만에 투자를 회수한다는 의미가 아닙니다. 첫 12개월 운영 예비자금 '+money(p.reserve)+'을 따로 확인하세요.',WARM);
  if(i.loanAmount>p.loan)r.callout('대출금 반영 한도','초기 투자액을 초과한 대출은 계산에서 제외했습니다. 입력 '+money(i.loanAmount)+' 중 '+money(p.loan)+'만 반영했습니다.',WARM);
  r.heading('환자가 예상보다 적으면 어떻게 될까요?');
  r.table(['환자 수 가정','목표 도달 월 세후 현금','세후 회수기간'],[150,190,WIDTH-340],[.8,1,1.2].map((factor,k)=>{
    const v=calculateOpeningPlan(a,i,factor);
    return {cells:[['보수적 · 환자 -20%','기준 · 입력 환자 수','낙관적 · 환자 +20%'][k],money(v.monthlyCash),v.equity===0?'초기 자기자금 없음':v.paybackMonths===null?'10년 내 미회수':v.paybackMonths+'개월'],emphasis:k===1};
  }));
  r.paragraph('±20%는 비교용 가정이며 통계적 예측 범위가 아닙니다. 보증금 반환·장비 교체·보험청구 입금 지연은 미반영합니다.',{size:9.5,color:MUTED});
}

function cashflow(r:Report,a:LocationAnalysis,i:OpeningInputs){
  const p=calculateOpeningPlan(a,i);
  r.pageStart('06. 첫해 현금흐름');
  r.paragraph('매출에서 운영비·원리금·생활비·예상 세금을 빼면 실제로 얼마가 남을까요?');
  r.callout('세금은 매월 균등하게 반영합니다.','해당 연도 예상 국세·지방세 합계를 12개월로 나누어 부담액으로 차감합니다. 실제 세금 납부월의 통장 잔액과는 다릅니다.');
  const min=Math.min(0,...p.months.map(m=>m.cash)),max=Math.max(1,...p.months.map(m=>m.cash));
  const top=r.y-12,bottom=top-65,x0=M+54,pw=WIDTH-70;
  const yy=(v:number)=>bottom+(v-min)/(max-min)*65;
  for(const v of [min,0,max]){r.page.drawLine({start:{x:x0,y:yy(v)},end:{x:x0+pw,y:yy(v)},color:LINE,thickness:.6});r.text(fmt(v),M,yy(v)-3,8,false,MUTED);}
  p.months.forEach((m,k)=>{
    const x=x0+k*pw/11;
    if(k)r.page.drawLine({start:{x:x-pw/11,y:yy(p.months[k-1].cash)},end:{x,y:yy(m.cash)},color:TEAL,thickness:2});
    r.page.drawCircle({x,y:yy(m.cash),size:3,color:m.cash<0?RED:TEAL});r.text(String(k+1),x-3,bottom-17,9,false,MUTED);
  });
  r.y=bottom-42;
  r.paragraph('가로축: 개원 후 개월 / 세로축: 월 세후 잔여현금(만원)',{size:9.5,color:MUTED});
  r.table(['월','매출','운영비','원리금','생활비','예상세금','세후현금'],[30,82,82,79,70,79,WIDTH-422],
    p.months.map(m=>({cells:[String(m.month),fmt(m.revenue),fmt(m.revenue-m.operating),fmt(m.principal+m.interest),fmt(i.ownerWithdrawal),fmt(m.tax),fmt(m.cash)]})),9.5,3);
  const total=(key:'revenue'|'cash'|'tax')=>p.months.reduce((s,m)=>s+m[key],0);
  r.callout('첫해 합계','매출 '+money(total('revenue'))+' / 예상 세금 '+money(total('tax'))+' / 세후 잔여현금 '+money(total('cash')),WARM);
  r.paragraph('세후 현금 = 매출 - 운영비 - 원리금 - 생활비 - 예상 세금. 반올림 때문에 표의 표시값 합계에 소액 차이가 생길 수 있습니다.',{size:9.5,color:MUTED});
}

function taxes(r:Report,i:OpeningInputs){
  const years=calculateFiveYearPlan(i),future=years.slice(1),last=years[4],sum=future.reduce((s,y)=>s+y.totalTax,0);
  r.pageStart('07. 성장한 매출, 세후 얼마가 남을까요?',true);
  r.callout('개인 단독개원 · 사업소득만 가정한 예상 산출세액',
    '공제·감면·기납부세액 반영 전입니다. 법인·공동개원에는 그대로 적용할 수 없으며 실제 신고·납부세액과 다릅니다.',WHITE);
  r.cards([['2~5년차 예상 세금 합계',money(sum),'종합소득세 + 지방소득세'],
    ['5년차 예상 세금',money(last.totalTax),'현행 세율 고정 가정'],
    ['5년차 세후 잔여현금',money(last.afterTaxCash),'원금상환·생활비 차감']]);
  r.heading('연도별 예상 세금');
  const top=r.y-16,bottom=top-115,max=Math.max(1,...years.map(y=>y.totalTax)),bw=44,gap=48,x0=M+45;
  years.forEach((y,k)=>{
    const x=x0+k*(bw+gap),h=y.totalTax/max*100;
    if(h>0)r.page.drawRectangle({x,y:bottom,width:bw,height:h,color:k===4?GOLD:NAVY});
    r.text(fmt(y.totalTax),x-2,bottom+h+8,9,true,NAVY);
    r.text(y.year+'년차',x+4,bottom-18,9,false,MUTED);
  });
  r.y=bottom-42;
  r.paragraph('단위: 만원 / 같은 축척으로 비교한 연간 예상 국세·지방세 합계',{size:9.5,color:MUTED});
  r.paragraph('연 매출 증가 '+i.annualRevenueGrowth+'% · 연 고정비 증가 '+i.annualFixedGrowth+'% · 연 감가상각 '+money(i.annualDepreciation)+' · 연 소득공제 '+money(i.annualIncomeDeduction));
  if(i.annualDepreciation*5>i.openingBudgetManwon)r.callout('감가상각 입력값 재확인','5년 감가상각 합계가 초기 시설·장비 지출보다 큽니다. 자산별 인정액을 확인하지 않으면 예상 세금이 과소 계산될 수 있습니다.',WARM);
  r.heading('절세 계획은 자료 확인부터 시작합니다');
  r.paragraph('매출이 성장할수록 비용 증빙, 자산별 감가상각, 인력·자산 구조를 점검할 필요가 있습니다. 절세 가능 여부와 금액은 실제 자료 검토 후 판단합니다.');
  r.link('더파운트 절세 플랜 상담하기 ↗','https://www.thefount.co.kr/contact');r.y-=28;

  r.pageStart('08. 연도별 수익과 세금 상세',true);
  const rows=[
    ['매출','revenue'],['현금 운영비','cashCosts'],['영업이익 · 감가상각 차감','operatingProfit'],
    ['사업용 대출이자','interest'],['사업소득','businessIncome'],['과세표준 · 소득공제 후','taxable'],
    ['예상 종합소득세','nationalTax'],['예상 지방소득세','localTax'],['예상 세금 합계','totalTax'],
    ['대출 원금상환','principal'],['세후 현금 · 생활비 차감','afterTaxCash']
  ] as const;
  r.table(['연간 항목','2년차','3년차','4년차','5년차'],[187,81,81,81,WIDTH-430],
    rows.map(([label,key])=>({cells:[label,...future.map(y=>fmt(y[key]))],emphasis:key==='totalTax'||key==='afterTaxCash'})),9.5);
  r.paragraph('단위: 만원. 위 금액은 연간 합계입니다. 반올림 때문에 표시값의 합계가 일부 다를 수 있습니다.',{size:9.5,color:MUTED});
  r.heading('세금과 현금은 이렇게 구분합니다');
  r.bullet('영업이익 = 매출 - 현금 운영비 - 감가상각비.');
  r.bullet('과세표준 = 영업이익 - 인정 대출이자 - 소득공제(최소 0).');
  r.bullet('세후 현금 = 매출 - 현금 운영비 - 원리금 - 생활비 - 예상 세금. 감가상각은 현금으로 다시 빼지 않습니다.');
  r.paragraph('같은 성장률과 세금 계산이 앞쪽 월별 현금흐름·회수기간에도 반영됩니다. 별도 세금 적립액을 이중 차감하지 않습니다. 회수기간은 120개월 내 최초 누적 회수 시점이며 이후 현금 부족이 발생하지 않는다는 보장은 아닙니다.',{size:10,color:MUTED});
}

function sources(r:Report,a:LocationAnalysis){
  r.pageStart('09. 계약 전 확인과 자료 기준');
  r.heading('원장님이 현장에서 확인할 것');
  const checks=a.regionalProfile?.doctorChecks.length?a.regionalProfile.doctorChecks:[
    '핵심 환자층이 실제로 건물 앞을 지나가는 시간대와 접근 경로를 확인하세요.',
    '경쟁병원의 세부 진료내용·운영시간·대기 수준을 직접 비교하세요.',
    '주차·엘리베이터·간판 노출·관리비·임대차 조건을 확인하세요.'
  ];
  checks.forEach(s=>r.bullet('□ '+s));
  r.heading('확인된 자료와 입력 가정의 차이');
  r.paragraph('지역 숫자는 공개자료의 기준시점·공간범위를 따릅니다. 수익성은 사용자 입력 가정입니다. 점수·전망은 확정 판단이나 매출 보장이 아니며, 누락된 값은 0으로 간주하지 않습니다.');
  const rows:Row[]=[{cells:[a.provider==='kakao'?'Kakao Local':'OpenStreetMap',date(a.analyzedAt)+' / 선택 반경','장소명·좌표·분류 검색']}];
  if(a.hiraMedical?.status==='available')rows.push({cells:[a.hiraMedical.source,a.hiraMedical.referenceDate+' / 반경 '+a.hiraMedical.radiusMeters+'m','공식 의료기관 집계']});
  if(a.demographics)rows.push({cells:['SGIS',a.demographics.year+'년 / '+a.demographics.areaName+' 전체','거주인구·종사자·사업체']});
  if(a.livingPopulation?.status==='available')rows.push({cells:[a.livingPopulation.source,(a.livingPopulation.referenceDate||'기준일 확인 필요')+' / '+a.livingPopulation.spatialUnit+(a.livingPopulation.hour!==undefined?' / '+a.livingPopulation.hour+'시':''),'생활인구(실제 방문환자 아님)']});
  if(a.consumerPower?.status==='available')rows.push({cells:[a.consumerPower.source,a.consumerPower.referencePeriod||'기준기간 확인 필요','지역 소비 관측']});
  if(a.rentMarket?.status==='available')rows.push({cells:[a.rentMarket.source,(a.rentMarket.referenceDate||'기준일 확인 필요')+' / '+a.rentMarket.spatialUnit,'임대료 표본 '+(a.rentMarket.sampleCount??'미상')+'건']});
  if(a.developmentPlans?.status==='available')rows.push({cells:[a.developmentPlans.source,a.developmentPlans.referenceDate||'기준일 확인 필요','개발계획, 일정은 변경 가능']});
  r.table(['출처','기준시점·범위','용도'],[170,190,WIDTH-360],rows,9.5);
  r.heading('세금 계산의 적용 범위');
  r.paragraph('현행 종합소득세 기본세율과 동일 과세표준의 지방소득세율을 적용한 단순 추정입니다. 다른 소득·이월결손금·세무조정·세액공제·감면·기납부세액·가산세는 미반영합니다. 비용 인정 여부와 감가상각 한도는 세무대리인 확인이 필요합니다.',{size:10,color:MUTED});
  r.ensure(110);
  r.link('국세청 종합소득세 세율 ↗','https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7667&mi=2315');r.y-=23;
  r.link('지방세법 제92조 ↗','https://www.law.go.kr/법령/지방세법/제92조');r.y-=23;
  r.paragraph('세율 확인 2026.09.13 / 보고서 '+REPORT_VERSION,{size:9.5,color:MUTED});
  r.callout('입지부터 개원자금·세금까지 함께 검토합니다.','THE FOUNT · 070-8064-2325 · www.thefount.co.kr',WARM);
  r.link('정밀 개원분석 상담하기 ↗','https://www.thefount.co.kr/contact');r.y-=20;
}

export async function buildMedicalReport(a:LocationAnalysis,i:OpeningInputs){
  const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const [regularBytes,boldBytes]=await Promise.all([
    readFile(join(process.cwd(),'public/fonts/NotoSansKR-400.ttf')),
    readFile(join(process.cwd(),'public/fonts/NotoSansKR-700.ttf'))
  ]);
  const [regular,bold]=await Promise.all([doc.embedFont(regularBytes,{subset:false}),doc.embedFont(boldBytes,{subset:false})]);
  doc.setTitle('THE FOUNT 병원 입지분석 - '+a.location.displayName);
  doc.setAuthor('THE FOUNT');doc.setSubject('입지 근거·수익성·세후 현금흐름');doc.setKeywords([REPORT_VERSION,a.specialty,'병원 입지분석']);
  doc.setCreationDate(new Date());
  const r=new Report(doc,{regular,bold},a);
  summary(r,a,i);regional(r,a);forecast(r,a);mapAndCompetitors(r,a);finances(r,a,i);cashflow(r,a,i);taxes(r,i);sources(r,a);
  r.finish();
  return doc.save({useObjectStreams:true});
}
