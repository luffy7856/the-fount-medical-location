import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, PDFPage, PDFFont, PageSizes, rgb } from "pdf-lib";
import type { LocationAnalysis } from "@/data/location-types";
import { calculateOpeningPlan, calculateFiveYearPlan, INPUT_LIMITS, type OpeningInputs } from "@/data/opening-plan";
import { specialties } from "@/data/specialties";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN = 42;
const NAVY = rgb(0.035, 0.105, 0.22);
const BLUE = rgb(0.12, 0.46, 0.73);
const TEAL = rgb(0.05, 0.57, 0.48);
const GOLD = rgb(0.73, 0.55, 0.24);
const RED = rgb(0.82, 0.28, 0.22);
const TEXT = rgb(0.13, 0.17, 0.23);
const MUTED = rgb(0.39, 0.44, 0.5);
const LINE = rgb(0.87, 0.89, 0.92);
const PALE = rgb(0.96, 0.975, 0.985);
const WHITE = rgb(1, 1, 1);

type ReportPayload = { analysis: LocationAnalysis; openingInputs: OpeningInputs };
type Fonts = { regular: PDFFont; bold: PDFFont };

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

function cleanText(value: unknown, fallback = "-") {
  if (typeof value !== "string") return fallback;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return cleaned || fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "분석일 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
}

function countLabel(analysis: LocationAnalysis, key: keyof LocationAnalysis["counts"]) {
  return `${analysis.counts[key].toLocaleString()}곳${analysis.countLimits?.[key] ? " 이상" : ""}`;
}

class ReportCanvas {
  readonly page: PDFPage;
  readonly fonts: Fonts;
  y = PAGE_HEIGHT - MARGIN;

  constructor(page: PDFPage, fonts: Fonts) {
    this.page = page;
    this.fonts = fonts;
  }

  text(value: string, x: number, y: number, size = 10, options?: { bold?: boolean; color?: ReturnType<typeof rgb> }) {
    this.page.drawText(cleanText(value), { x, y, size, font: options?.bold ? this.fonts.bold : this.fonts.regular, color: options?.color || TEXT });
  }

  wrap(value: string, maxWidth: number, size = 10, bold = false) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const normalized = cleanText(value);
    const lines: string[] = [];
    let line = "";
    for (const char of normalized) {
      const candidate = line + char;
      // Reserve room for Korean font shaping so rendered lines stay inside the column.
      if (line && font.widthOfTextAtSize(candidate, size) > maxWidth * .78) {
        lines.push(line.trimEnd());
        line = char.trimStart();
      } else line = candidate;
    }
    if (line) lines.push(line.trimEnd());
    return lines;
  }

  fit(value: string, maxWidth: number, size = 10, bold = false) {
    const font = bold ? this.fonts.bold : this.fonts.regular;
    const normalized = cleanText(value);
    if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
    let fitted = "";
    for (const char of normalized) {
      if (font.widthOfTextAtSize(`${fitted}${char}...`, size) > maxWidth) break;
      fitted += char;
    }
    return `${fitted.trimEnd()}...`;
  }

  paragraph(value: string, x: number, y: number, maxWidth: number, size = 10, lineHeight = 15, options?: { bold?: boolean; color?: ReturnType<typeof rgb>; maxLines?: number }) {
    const lines = this.wrap(value, maxWidth, size, options?.bold).slice(0, options?.maxLines || 100);
    lines.forEach((line, index) => this.text(line, x, y - index * lineHeight, size, options));
    return y - lines.length * lineHeight;
  }

  sectionLabel(value: string, y: number) {
    this.text(value.toUpperCase(), MARGIN, y, 8, { bold: true, color: GOLD });
    this.page.drawLine({ start: { x: MARGIN, y: y - 7 }, end: { x: PAGE_WIDTH - MARGIN, y: y - 7 }, thickness: .7, color: LINE });
  }

  footer(pageNumber: number) {
    this.page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_WIDTH - MARGIN, y: 30 }, thickness: .6, color: LINE });
    this.text("THE FOUNT Medical Location - 공개데이터 기반 상용 베타", MARGIN, 16, 7.5, { color: MUTED });
    this.text(`${pageNumber}`, PAGE_WIDTH - MARGIN - 8, 16, 8, { bold: true, color: NAVY });
  }
}

function addHeader(canvas: ReportCanvas, title: string, subtitle: string) {
  canvas.page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 92, width: PAGE_WIDTH, height: 92, color: NAVY });
  canvas.page.drawCircle({ x: MARGIN + 13, y: PAGE_HEIGHT - 30, size: 13, color: TEAL });
  canvas.text("TF", MARGIN + 5.5, PAGE_HEIGHT - 34, 9, { bold: true, color: WHITE });
  canvas.text("THE FOUNT", MARGIN + 34, PAGE_HEIGHT - 27, 12, { bold: true, color: WHITE });
  canvas.text("MEDICAL LOCATION REPORT", MARGIN + 34, PAGE_HEIGHT - 41, 7, { color: rgb(.72, .79, .88) });
  canvas.text(title, MARGIN, PAGE_HEIGHT - 69, 17, { bold: true, color: WHITE });
  canvas.text(subtitle, PAGE_WIDTH - MARGIN - canvas.fonts.regular.widthOfTextAtSize(subtitle, 8), PAGE_HEIGHT - 68, 8, { color: rgb(.76, .81, .88) });
  canvas.y = PAGE_HEIGHT - 118;
}

function metricColor(label: string) {
  if (label.includes("경쟁")) return RED;
  if (label.includes("소비")) return rgb(.48, .31, .72);
  if (label.includes("접근")) return BLUE;
  if (label.includes("비용")) return GOLD;
  return TEAL;
}

function drawSummaryPage(document: PDFDocument, fonts: Fonts, analysis: LocationAnalysis) {
  const page = document.addPage(PageSizes.A4);
  const c = new ReportCanvas(page, fonts);
  addHeader(c, "병원 입지분석 종합 리포트", formatDate(analysis.analyzedAt));

  c.text(cleanText(analysis.location.displayName), MARGIN, c.y, 16, { bold: true, color: NAVY });
  c.text(`${analysis.specialty} - 반경 ${analysis.radiusMeters.toLocaleString()}m`, MARGIN, c.y - 19, 9, { color: MUTED });

  page.drawRectangle({ x: MARGIN, y: c.y - 122, width: 154, height: 88, color: NAVY });
  c.text("MEDICAL LOCATION SCORE", MARGIN + 14, c.y - 55, 7.5, { color: rgb(.66, .75, .86) });
  c.text(`${analysis.observedScore}`, MARGIN + 14, c.y - 98, 35, { bold: true, color: WHITE });
  c.text(`/ 100  ${cleanText(analysis.grade)}등급`, MARGIN + 66, c.y - 91, 11, { bold: true, color: rgb(.54, .91, .82) });

  page.drawRectangle({ x: MARGIN + 166, y: c.y - 122, width: 154, height: 88, color: PALE, borderColor: LINE, borderWidth: .7 });
  c.text("DATA COVERAGE", MARGIN + 180, c.y - 55, 7.5, { bold: true, color: MUTED });
  c.text(`${analysis.confidence}%`, MARGIN + 180, c.y - 91, 27, { bold: true, color: TEAL });
  c.paragraph("연결된 공개데이터 비율이며 예측 정확도나 개원 성공확률이 아닙니다.", MARGIN + 180, c.y - 105, 126, 7.2, 10, { color: MUTED, maxLines: 2 });

  page.drawRectangle({ x: MARGIN + 332, y: c.y - 122, width: 179, height: 88, color: rgb(.985, .975, .95), borderColor: rgb(.9, .83, .7), borderWidth: .7 });
  c.text("쉽게 보는 결론", MARGIN + 346, c.y - 55, 8, { bold: true, color: GOLD });
  const decision = analysis.confidence < 90 ? "비교 후보" : analysis.observedScore >= 75 ? "현장확인 우선" : analysis.observedScore >= 60 ? "다른 곳과 비교" : "대체 후보 검토";
  c.text(decision, MARGIN + 346, c.y - 82, 18, { bold: true, color: NAVY });
  c.paragraph(analysis.confidence < 90 ? "같은 진료과의 다른 자리 한두 곳과 비교하세요." : "건물과 경쟁병원을 직접 확인할 후보입니다.", MARGIN + 346, c.y - 101, 151, 7.2, 10, { color: MUTED, maxLines: 2 });

  c.y -= 151;
  c.sectionLabel("Six evaluation factors", c.y);
  c.y -= 29;
  analysis.metrics.slice(0, 6).forEach((metric, index) => {
    const rowY = c.y - index * 31;
    c.text(metric.label, MARGIN, rowY, 9, { bold: true, color: NAVY });
    page.drawRectangle({ x: MARGIN + 96, y: rowY - 1, width: 287, height: 7, color: LINE });
    if (metric.value !== null) page.drawRectangle({ x: MARGIN + 96, y: rowY - 1, width: 287 * metric.value / 100, height: 7, color: metricColor(metric.label) });
    c.text(metric.value === null ? "자료 미반영" : `${metric.value}`, MARGIN + 396, rowY - 1, 10, { bold: true, color: metric.value === null ? MUTED : NAVY });
    c.text(c.fit(metric.note, PAGE_WIDTH - MARGIN - (MARGIN + 426), 6.7), MARGIN + 426, rowY - 1, 6.7, { color: MUTED });
  });

  c.y -= 204;
  c.sectionLabel("Observed data", c.y);
  c.y -= 30;
  const observed = [
    ["전체 의료기관", countLabel(analysis, "medical")],
    [`${analysis.specialty} 의료기관`, countLabel(analysis, "matchingSpecialty")],
    ["약국", countLabel(analysis, "pharmacy")],
    ["생활인구", analysis.livingPopulation?.status === "available" ? `${analysis.livingPopulation.total?.toLocaleString()}명` : "자료 미반영"],
    ["거주인구", analysis.demographics ? `${analysis.demographics.residentPopulation.toLocaleString()}명` : "자료 미반영"],
    ["종사자", analysis.demographics ? `${analysis.demographics.workerPopulation.toLocaleString()}명` : "자료 미반영"],
    ["15세 미만", analysis.regionalProfile?.childPopulation !== undefined && analysis.demographics && analysis.demographics.residentPopulation > 0 ? `${Math.round(analysis.regionalProfile.childPopulation / analysis.demographics.residentPopulation * 1000) / 10}%` : "자료 미반영"],
    ["초등학교", analysis.regionalProfile?.elementarySchools !== undefined ? `${analysis.regionalProfile.elementarySchools}곳` : "자료 미반영"]
  ];
  observed.forEach(([label, value], index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = MARGIN + column * 127.5;
    const y = c.y - row * 55;
    page.drawRectangle({ x, y: y - 35, width: 116, height: 43, color: PALE });
    c.text(label, x + 9, y - 7, 7.5, { color: MUTED });
    c.text(value, x + 9, y - 27, 12, { bold: true, color: NAVY });
  });

  c.y -= 125;
  c.sectionLabel("Area character and specialty fit", c.y);
  c.y -= 29;
  const profileSummary = analysis.regionalProfile
    ? `${analysis.regionalProfile.character}: ${analysis.regionalProfile.characterReason} ${analysis.regionalProfile.specialtyFit.join(" ")}`
    : analysis.insight;
  c.paragraph(profileSummary, MARGIN, c.y, PAGE_WIDTH - MARGIN * 2, 9.2, 14, { color: TEXT, maxLines: 7 });
  c.footer(1);
}

function drawForecastChart(page: PDFPage, fonts: Fonts, analysis: LocationAnalysis, x: number, y: number, width: number, height: number) {
  const forecast = analysis.growthForecast;
  page.drawRectangle({ x, y, width, height, color: PALE, borderColor: LINE, borderWidth: .7 });
  page.drawText("3년 인구·사업체 전망", { x: x + 14, y: y + height - 22, size: 10, font: fonts.bold, color: NAVY });
  if (!forecast || forecast.status !== "available") {
    page.drawText("연도별 SGIS 데이터가 충분하지 않습니다.", { x: x + 14, y: y + height / 2, size: 8, font: fonts.regular, color: MUTED });
    return;
  }
  const points = [...forecast.historical, ...forecast.projected];
  const series = [
    { key: "residentPopulation" as const, label: "거주인구", color: TEAL },
    { key: "workerPopulation" as const, label: "종사자", color: BLUE },
    { key: "businesses" as const, label: "사업체", color: GOLD }
  ];
  const plotX = x + 42;
  const plotY = y + 28;
  const plotWidth = width - 58;
  const plotHeight = height - 70;
  series.forEach((item, seriesIndex) => {
    const values = points.map(point => point[item.key]);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(1, max - min);
    const coords = values.map((value, index) => ({ px: plotX + index * plotWidth / Math.max(1, values.length - 1), py: plotY + (value - min) / range * plotHeight }));
    coords.slice(1).forEach((point, index) => page.drawLine({ start: { x: coords[index].px, y: coords[index].py }, end: { x: point.px, y: point.py }, thickness: 1.6, color: item.color, dashArray: index + 1 >= forecast.historical.length ? [4, 3] : undefined }));
    page.drawText(item.label, { x: x + 14 + seriesIndex * 72, y: y + 10, size: 7, font: fonts.regular, color: item.color });
  });
  points.forEach((point, index) => {
    const px = plotX + index * plotWidth / Math.max(1, points.length - 1);
    page.drawText(`${point.year}`, { x: px - 8, y: plotY - 13, size: 6.5, font: fonts.regular, color: MUTED });
  });
}

function drawEvidencePage(document: PDFDocument, fonts: Fonts, analysis: LocationAnalysis) {
  const page = document.addPage(PageSizes.A4);
  const c = new ReportCanvas(page, fonts);
  addHeader(c, "분석 근거와 지역 해석", `${analysis.specialty} / ${analysis.radiusMeters.toLocaleString()}m`);

  c.sectionLabel("Verified signals and risks", c.y);
  c.y -= 27;
  const columnWidth = (PAGE_WIDTH - MARGIN * 2 - 12) / 2;
  [
    { title: "확인된 강점", items: analysis.strengths, color: TEAL, x: MARGIN },
    { title: "확인 필요 위험", items: analysis.risks, color: RED, x: MARGIN + columnWidth + 12 }
  ].forEach(group => {
    page.drawRectangle({ x: group.x, y: c.y - 112, width: columnWidth, height: 122, color: PALE, borderColor: LINE, borderWidth: .7 });
    c.text(group.title, group.x + 14, c.y - 13, 10, { bold: true, color: group.color });
    (group.items.length ? group.items : ["현재 확인된 항목이 없습니다."]).slice(0, 5).forEach((item, index) => {
      page.drawCircle({ x: group.x + 17, y: c.y - 39 - index * 18, size: 2.4, color: group.color });
      c.paragraph(item, group.x + 25, c.y - 42 - index * 18, columnWidth - 40, 7.5, 10, { color: TEXT, maxLines: 1 });
    });
  });

  c.y -= 150;
  c.sectionLabel("Scoring evidence", c.y);
  c.y -= 29;
  analysis.metrics.slice(0, 6).forEach((metric, index) => {
    const rowY = c.y - index * 30;
    if (index % 2 === 0) page.drawRectangle({ x: MARGIN, y: rowY - 10, width: PAGE_WIDTH - MARGIN * 2, height: 27, color: PALE });
    c.text(metric.label, MARGIN + 8, rowY, 8.5, { bold: true, color: NAVY });
    c.text(metric.value === null ? "자료 미반영" : `${metric.value} / 100`, MARGIN + 124, rowY, 8.5, { bold: true, color: metric.value === null ? MUTED : metricColor(metric.label) });
    c.paragraph(metric.note, MARGIN + 203, rowY, PAGE_WIDTH - MARGIN - (MARGIN + 211), 7.2, 9, { color: MUTED, maxLines: 2 });
  });

  c.y -= 203;
  drawForecastChart(page, fonts, analysis, MARGIN, c.y - 163, PAGE_WIDTH - MARGIN * 2, 163);
  c.y -= 184;

  c.sectionLabel("What the doctor should check", c.y);
  c.y -= 26;
  (analysis.regionalProfile?.doctorChecks || [
    "선택 진료과의 핵심 환자층과 실제 생활인구 시간대가 맞는지 확인하세요.",
    "경쟁병원의 진료내용과 운영시간, 환자 대기 수준을 직접 비교하세요.",
    "건물 가시성·엘리베이터·주차와 실제 임대조건을 확인하세요."
  ]).slice(0, 4).forEach((item, index) => {
    c.text(`${index + 1}.`, MARGIN, c.y - index * 18, 7.5, { bold: true, color: GOLD });
    c.text(c.fit(item, PAGE_WIDTH - MARGIN * 2 - 16, 7.2), MARGIN + 16, c.y - index * 18, 7.2, { color: TEXT });
  });
  c.footer(2);
}

function drawRegionalPage(document: PDFDocument, fonts: Fonts, analysis: LocationAnalysis) {
  const c = new ReportCanvas(document.addPage(PageSizes.A4), fonts);
  addHeader(c, "이 지역의 환자층과 현장 확인", analysis.specialty);
  const profile = analysis.regionalProfile;
  const width = PAGE_WIDTH - MARGIN * 2;
  const total = analysis.demographics?.residentPopulation || 0;
  const share = (value?: number) => value === undefined || total <= 0 ? "확인된 자료 없음" : `${(value / total * 100).toFixed(1)}% · ${value.toLocaleString()}명`;
  c.text("어떤 환자들이 살고 있나요?", MARGIN, c.y, 15, { bold: true, color: NAVY });
  c.y -= 27;
  const rows = [
    ["남성 / 여성", `${share(profile?.malePopulation)} / ${share(profile?.femalePopulation)}`],
    ["15세 미만", share(profile?.childPopulation)],
    ["20~39세", share(profile?.youngAdultPopulation)],
    ["40~59세", share(profile?.middleAgePopulation)],
    ["65세 이상", share(profile?.seniorPopulation)],
    ["주변 교육·보육시설", `초등학교 ${profile?.elementarySchools === undefined ? "확인 필요" : `${profile.elementarySchools}곳`} · 어린이집·유치원 ${profile?.childcareFacilities === undefined ? "확인 필요" : `${profile.childcareFacilities}곳`}`]
  ];
  rows.forEach(([label, value], index) => {
    if (index % 2 === 0) c.page.drawRectangle({ x: MARGIN, y: c.y - 9, width, height: 27, color: PALE });
    c.text(label, MARGIN + 10, c.y, 10, { bold: true });
    c.text(value, MARGIN + 140, c.y, 10);
    c.y -= 31;
  });
  c.y = c.paragraph(`인구: ${profile?.areaName || "해당 행정동"} 전체, ${profile?.year || "기준연도 확인 필요"}년 SGIS. 시설: 선택 반경 ${analysis.radiusMeters.toLocaleString()}m, Kakao Local 검색. 연령은 주요 구간만 표시하므로 합계가 100%는 아닙니다.`, MARGIN, c.y, width, 9, 14, { color: MUTED }) - 24;
  c.text(profile?.character || "지역 특성 확인 필요", MARGIN, c.y, 14, { bold: true, color: TEAL });
  c.y -= 23;
  c.y = c.paragraph(profile?.characterReason || "아파트·업무시설과 후보 건물 사이의 실제 이동 동선을 살펴보세요.", MARGIN, c.y, width, 11, 17) - 12;
  for (const item of profile?.specialtyFit || []) c.y = c.paragraph(item, MARGIN, c.y, width, 10, 16) - 8;
  c.y = c.paragraph("학교 수나 성별 비율만으로 진료 수요·매출을 보장하지 않습니다. 신도시·구도심 여부도 인구 구성만으로 확정하지 않고, 실제 입주와 개발 진행 상황을 함께 확인해야 합니다.", MARGIN, c.y, width, 9, 14, { color: MUTED }) - 24;
  c.text("계약 전에 원장님이 확인할 것", MARGIN, c.y, 14, { bold: true, color: NAVY });
  c.y -= 25;
  (profile?.doctorChecks || ["핵심 환자층의 생활 동선, 경쟁병원의 진료내용, 주차와 임대조건을 직접 확인하세요."]).forEach((item, index) => {
    c.text(`${index + 1}.`, MARGIN, c.y, 10, { bold: true, color: GOLD });
    c.y = c.paragraph(item, MARGIN + 20, c.y, width - 20, 10, 16) - 11;
  });
  c.footer(3);
}

function drawFinancialPage(document: PDFDocument, fonts: Fonts, analysis: LocationAnalysis, inputs: OpeningInputs) {
  const page = document.addPage(PageSizes.A4);
  const c = new ReportCanvas(page, fonts);
  const result = calculateOpeningPlan(analysis, inputs);
  addHeader(c, "개원 수익성 사전 시뮬레이션", "환자 수 기반 / 기준 시나리오");

  c.sectionLabel("Input conditions", c.y);
  c.y -= 30;
  const inputRows: [string, string][] = [
    ["입주 층", `${inputs.floor}층`], ["전용면적", `${inputs.areaPyeong.toLocaleString()}평`],
    ["보증금", `${inputs.depositManwon.toLocaleString()}만원`], ["월세", `${inputs.monthlyRentManwon.toLocaleString()}만원/월`],
    ["시설·장비 개원자금", `${inputs.openingBudgetManwon.toLocaleString()}만원`], ["예상 월 인건비", `${inputs.monthlyPayrollManwon.toLocaleString()}만원`],
    ["하루 환자 수", `${inputs.dailyPatients}명`], ["환자당 매출 / 진료일", `${inputs.revenuePerPatient}만원 / ${inputs.clinicDays}일`]
  ];
  inputRows.forEach(([label, value], index) => {
    const column = index % 4;
    const row = Math.floor(index / 4);
    const x = MARGIN + column * 127.5;
    const y = c.y - row * 54;
    page.drawRectangle({ x, y: y - 34, width: 116, height: 43, color: PALE, borderColor: LINE, borderWidth: .5 });
    c.text(label, x + 9, y - 7, 7.2, { color: MUTED });
    c.text(value, x + 9, y - 27, 10.5, { bold: true, color: NAVY });
  });

  c.y -= 129;
  c.sectionLabel("Estimated outcome", c.y);
  c.y -= 30;
  const resultCards = [
    ["운영비 손익분기 / 일", result.breakEvenPatients === null ? "산정 불가" : `${result.breakEvenPatients}명`, "대출·생활비·세금 적립 제외"],
    ["월 잔여현금", `${Math.round(result.monthlyCash).toLocaleString()}만원`, "목표 도달 월·예상 세금 반영"],
    ["초기 자기자금 회수", result.paybackMonths === null ? "10년 내 미회수" : result.paybackMonths === 0 ? "초기 자기자금 없음" : `${result.paybackMonths}개월`, "원리금·생활비·예상 세금 차감"]
  ];
  resultCards.forEach(([label, value, note], index) => {
    const x = MARGIN + index * 172;
    page.drawRectangle({ x, y: c.y - 86, width: 160, height: 94, color: index === 2 ? NAVY : PALE, borderColor: index === 2 ? NAVY : LINE, borderWidth: .7 });
    c.text(label, x + 13, c.y - 16, 8, { bold: true, color: index === 2 ? rgb(.67, .76, .87) : MUTED });
    c.text(value, x + 13, c.y - 47, 17, { bold: true, color: index === 2 ? WHITE : NAVY });
    c.paragraph(note, x + 13, c.y - 66, 134, 7, 9, { color: index === 2 ? rgb(.73, .79, .87) : MUTED, maxLines: 2 });
  });

  c.y -= 118;
  c.sectionLabel("Cashflow review", c.y);
  c.y -= 30;
  const benchmarkRows = [
    ["시설·장비 개원자금 (보증금 제외)", `${inputs.openingBudgetManwon.toLocaleString()}만원`],
    ["첫 12개월 운영 예비자금", `${Math.round(result.reserve).toLocaleString()}만원`],
    ["초기 자기자금", `${result.equity.toLocaleString()}만원`],
    ["상환·생활비·적립 포함 손익분기 / 일", result.cashBreakEvenPatients === null ? "산정 불가" : `${result.cashBreakEvenPatients}명`]
  ];
  benchmarkRows.forEach(([label, value], index) => {
    const y = c.y - index * 32;
    if (index % 2 === 0) page.drawRectangle({ x: MARGIN, y: y - 9, width: PAGE_WIDTH - MARGIN * 2, height: 27, color: PALE });
    c.text(label, MARGIN + 10, y, 8.5, { color: MUTED });
    c.text(value, PAGE_WIDTH - MARGIN - 95, y, 10, { bold: true, color: NAVY });
  });

  c.y -= 158;
  c.sectionLabel("How to use this report", c.y);
  c.y -= 28;
  const guidance = [
    "동일 진료과 경쟁병원의 위치와 실제 운영 여부를 현장에서 다시 확인합니다.",
    "임대차계약 전 실측면적, 관리비, 권리금, 주차조건을 수익성 입력값에 반영합니다.",
    "두 곳 이상의 후보지를 같은 진료과·반경 조건으로 비교한 뒤 최종 실사를 진행합니다."
  ];
  guidance.forEach((item, index) => {
    page.drawCircle({ x: MARGIN + 4, y: c.y - index * 22 + 2, size: 4, color: TEAL });
    c.text(`${index + 1}`, MARGIN + 2.1, c.y - index * 22, 5.5, { bold: true, color: WHITE });
    c.paragraph(item, MARGIN + 16, c.y - index * 22, PAGE_WIDTH - MARGIN * 2 - 16, 8, 11, { color: TEXT, maxLines: 1 });
  });

  page.drawRectangle({ x: MARGIN, y: 84, width: PAGE_WIDTH - MARGIN * 2, height: 70, color: NAVY });
  c.text("정밀 개원분석이 필요하신가요?", MARGIN + 18, 127, 13, { bold: true, color: WHITE });
  c.text("입지·자금·인건비·장비·세금·손익분기점을 함께 검토합니다.", MARGIN + 18, 108, 8, { color: rgb(.75, .82, .89) });
  c.text("www.thefount.co.kr  |  070-8064-2325", MARGIN + 18, 92, 8, { bold: true, color: rgb(.52, .9, .82) });
  c.text("수익성은 입력 가정 기반입니다. 초기 값은 예시이며 실제 매출 예측이 아닙니다.", MARGIN, 58, 7.2, { color: MUTED });
  c.footer(4);
}

function drawCashflowPage(document: PDFDocument, fonts: Fonts, analysis: LocationAnalysis, inputs: OpeningInputs) {
  const page=document.addPage(PageSizes.A4),c=new ReportCanvas(page,fonts);
  const result=calculateOpeningPlan(analysis,inputs),amount=(n:number)=>Math.round(n).toLocaleString();
  addHeader(c,"12개월 현금흐름과 계산 가정","기준 시나리오 / 금액 단위: 만원");
  const values=result.months.map(m=>m.cash),min=Math.min(0,...values),max=Math.max(1,...values);
  const y=(v:number)=>555+(v-min)/(max-min)*115;
  c.text("월 잔여현금",MARGIN,706,12,{bold:true,color:NAVY});
  page.drawLine({start:{x:MARGIN+40,y:y(0)},end:{x:PAGE_WIDTH-MARGIN,y:y(0)},color:LINE,thickness:1});
  c.text(amount(max),MARGIN,670,7,{color:MUTED});c.text(amount(min),MARGIN,555,7,{color:MUTED});
  result.months.forEach((m,index)=>{
    const x=MARGIN+40+index*40;
    if(index>0)page.drawLine({start:{x:x-40,y:y(values[index-1])},end:{x,y:y(m.cash)},color:TEAL,thickness:2});
    page.drawCircle({x,y:y(m.cash),size:2.5,color:m.cash<0?RED:TEAL});
    c.text(`${m.month}월`,x-5,535,7,{color:MUTED});
  });
  const columns=[MARGIN+8,MARGIN+65,MARGIN+145,MARGIN+230,MARGIN+320,MARGIN+415];
  ["월","매출","영업잉여","원리금","잔여현금","누적현금"].forEach((v,k)=>c.text(v,columns[k],502,8,{bold:true,color:NAVY}));
  result.months.forEach((m,index)=>{
    const y=477-index*21;
    if(index%2===0)page.drawRectangle({x:MARGIN,y:y-6,width:PAGE_WIDTH-MARGIN*2,height:21,color:PALE});
    [m.month,m.revenue,m.operating,m.principal+m.interest,m.cash,m.cumulativeCash].forEach((v,k)=>c.text(amount(v),columns[k],y,8,{color:k>=4&&v<0?RED:TEXT}));
  });
  const assumptions=[
    `첫 달 환자 확보율 ${inputs.initialPercent}% / ${inputs.rampMonths}개월째 목표 도달. 이후 연 매출·고정비 증가율 반영.`,
    `월 기타 고정비 ${amount(inputs.monthlyOtherCost)} / 마케팅 ${amount(inputs.monthlyMarketingManwon)} / 변동비 ${inputs.variablePercent}%.`,
    `대출 ${amount(result.loan)} / 연 ${inputs.annualInterest}% / ${inputs.loanMonths}개월 원금균등상환.`,
    `월 생활비 ${amount(inputs.ownerWithdrawal)} / 예상 세금은 연간 산출세액을 월별로 균등 반영합니다.`,
    "보증금 반환·입금 지연·물가·장비 교체 미반영. 입지점수와 층수로 매출을 보정하지 않습니다.",
    "회수기간은 120개월 누적현금 기준. 예비자금은 초기 적자로 이미 반영되어 중복 가산하지 않습니다.",
  ];
  assumptions.forEach((v,k)=>c.text(v,MARGIN,214-k*20,7.8,{color:MUTED}));
  [.8,1,1.2].forEach((factor,index)=>{
    const r=calculateOpeningPlan(analysis,inputs,factor);
    c.text(`${["환자 -20%","기준","환자 +20%"][index]}: ${amount(r.monthlyCash)}만원`,MARGIN+index*170,76,8,{bold:true,color:NAVY});
  });
  c.text("위 비교는 목표 도달 월의 예상 세금을 차감한 잔여현금입니다. ±20%는 예측 신뢰구간이 아닙니다.",MARGIN,58,7,{color:MUTED});
  c.footer(5);
}

function drawTaxProjectionPage(document:PDFDocument,fonts:Fonts,inputs:OpeningInputs) {
  const page=document.addPage(PageSizes.A4),c=new ReportCanvas(page,fonts);
  const years=calculateFiveYearPlan(inputs).slice(1);
  addHeader(c,"2-5년차 성장과 세금 계획","개인 단독개원 / 기준 시나리오 / 단위: 만원");
  c.paragraph("현행 세율을 5년간 고정 적용한 산출세액입니다. 실제 신고·납부액이 아닙니다. 다른 소득·이월결손금·세액공제·감면·기납부세액은 반영하지 않았습니다.",MARGIN,711,PAGE_WIDTH-MARGIN*2,9,15,{color:MUTED,maxLines:3});
  c.text("연 매출 증가 "+inputs.annualRevenueGrowth+"% / 고정비 증가 "+inputs.annualFixedGrowth+"%",MARGIN,650,10,{bold:true,color:NAVY});
  c.text("연 감가상각 "+inputs.annualDepreciation+"만원 / 소득공제 "+inputs.annualIncomeDeduction+"만원",MARGIN,629,9,{color:MUTED});
  const cols=[MARGIN+8,MARGIN+194,MARGIN+271,MARGIN+348,MARGIN+425];
  ["연간 항목","2년차","3년차","4년차","5년차"].forEach((label,k)=>c.text(label,cols[k],592,9,{bold:true,color:NAVY}));
  const rows=[
    ["매출","revenue"],["현금 운영비","cashCosts"],["영업이익 (감가상각 차감)","operatingProfit"],
    ["사업 관련 대출이자","interest"],["사업소득","businessIncome"],["과세표준 (소득공제 후)","taxable"],
    ["예상 종소세 산출세액","nationalTax"],["예상 지방소득세 산출세액","localTax"],
    ["예상 세금 합계","totalTax"],["대출 원금상환","principal"],["세후 현금 (생활비 차감)","afterTaxCash"],
  ] as const;
  rows.forEach(([label,key],index)=>{
    const y=566-index*27;
    if(index%2===0)page.drawRectangle({x:MARGIN,y:y-8,width:PAGE_WIDTH-MARGIN*2,height:27,color:PALE});
    c.text(label,cols[0],y,8,{color:MUTED});
    years.forEach((v,k)=>c.text(Math.round(v[key]).toLocaleString(),cols[k+1],y,8.5,{bold:key==="totalTax",color:v[key]<0?RED:NAVY}));
  });
  c.paragraph("세후 현금은 해당 연도 세액을 차감한 비교값으로, 납부월의 실제 잔액은 아닙니다. 보증금·대출원금·생활비는 세금 계산의 필요경비로 공제하지 않습니다. 앞서 입력한 세금 적립액을 중복 차감하지 않습니다.",MARGIN,244,PAGE_WIDTH-MARGIN*2,8,13,{color:MUTED,maxLines:4});
  c.paragraph("사업 관련 인정 이자·감가상각비·소득공제를 가정했습니다. 실제 증빙과 한도는 별도 검토가 필요합니다. 앞쪽 회수기간에도 동일한 성장률과 예상 세금을 적용합니다.",MARGIN,183,PAGE_WIDTH-MARGIN*2,8,13,{color:MUTED,maxLines:3});
  c.text("출처: 국세청 종합소득세 세율 / 소득세법 제55조 / 지방세법 제92조",MARGIN,130,7.5,{color:MUTED});
  c.text("세율 확인: 2026.09.13. 지방세는 동일 과세표준의 지방소득세율 적용.",MARGIN,112,7.5,{color:MUTED});
  c.text("성장한 매출이 자산으로 남도록, 더파운트 절세 플랜을 상담하세요.",MARGIN,79,10,{bold:true,color:NAVY});
  c.text("www.thefount.co.kr/contact / 절세 가능 여부와 금액은 자료 검토 후 안내",MARGIN,58,7.5,{color:MUTED});
  c.footer(6);
}

async function createReport(payload: ReportPayload) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const regularBytes = await readFile(join(process.cwd(), "public", "fonts", "NotoSansKR-400.ttf"));
  const koreanFont = await document.embedFont(regularBytes, { subset: false });
  const fonts = { regular: koreanFont, bold: koreanFont };
  document.setTitle(`THE FOUNT 병원 입지분석 - ${cleanText(payload.analysis.location.displayName)}`);
  document.setAuthor("THE FOUNT");
  document.setSubject("병원 입지 및 개원 수익성 분석 리포트");
  document.setKeywords(["병원 입지분석", "병원 상권분석", payload.analysis.specialty, "THE FOUNT"]);
  document.setCreationDate(new Date());
  drawSummaryPage(document, fonts, payload.analysis);
  drawEvidencePage(document, fonts, payload.analysis);
  drawRegionalPage(document, fonts, payload.analysis);
  drawFinancialPage(document, fonts, payload.analysis, payload.openingInputs);
  drawCashflowPage(document, fonts, payload.analysis, payload.openingInputs);
  drawTaxProjectionPage(document, fonts, payload.openingInputs);
  return document.save({ useObjectStreams: true });
}

export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 1_000_000) return Response.json({ error: "보고서 요청 데이터가 너무 큽니다." }, { status: 413 });
  try {
    const body: unknown = await request.json();
    if (!validPayload(body)) return Response.json({ error: "보고서 입력값을 확인해주세요." }, { status: 400 });
    const bytes = await createReport(body);
    const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="the-fount-location-report-${stamp}.pdf"`,
        "Cache-Control": "private, no-store, max-age=0",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    console.error("report_generation_failed", error instanceof Error ? error.message : "unknown");
    return Response.json({ error: "PDF 보고서를 생성하지 못했습니다." }, { status: 500 });
  }
}
