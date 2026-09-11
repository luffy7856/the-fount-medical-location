import "server-only";
import type { LivingPopulation } from "@/data/location-types";

const SERVICE = "Spop250mLocalResdDong" as const;
const LEGACY_LAST_DATE = "2026-07-31";
const MALE_FIELDS = ["M00", "M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50", "M55", "M60", "M65", "M70"] as const;
const FEMALE_FIELDS = ["F00", "F10", "F15", "F20", "F25", "F30", "F35", "F40", "F45", "F50", "F55", "F60", "F65", "F70"] as const;

type SeoulPopulationRow = Record<string, string> & {
  YMD: string;
  TT: string;
  H_DNG_CD: string;
  SPOP: string;
};

function base(status: LivingPopulation["status"], message: string): LivingPopulation {
  return {
    status,
    source: "서울특별시 서울 생활인구",
    dataset: SERVICE,
    spatialUnit: "행정동",
    supportedRegion: "서울특별시",
    message
  };
}

function parseProtectedNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function defaultLivingPopulationDate() {
  const now = new Date();
  const seoul = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
  seoul.setDate(seoul.getDate() - 4);
  const availableDate = `${seoul.getFullYear()}-${String(seoul.getMonth() + 1).padStart(2, "0")}-${String(seoul.getDate()).padStart(2, "0")}`;
  return availableDate > LEGACY_LAST_DATE ? LEGACY_LAST_DATE : availableDate;
}

export async function fetchSeoulLivingPopulation(input: {
  administrativeCode?: string;
  date?: string;
  hour?: number;
}): Promise<LivingPopulation> {
  const key = process.env.SEOUL_OPEN_DATA_API_KEY;
  const administrativeCode = String(input.administrativeCode || "").trim().slice(0, 8);
  if (!administrativeCode.startsWith("11")) {
    return base("unsupported", "서울 이외 지역은 시간대별 생활인구를 현재 지원하지 않습니다.");
  }
  if (!key) {
    return base("not_configured", "서울 생활인구 API 인증키 연결이 필요합니다.");
  }

  const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date || "") ? input.date! : defaultLivingPopulationDate();
  const date = requestedDate > LEGACY_LAST_DATE ? LEGACY_LAST_DATE : requestedDate;
  const requestedHour = Number(input.hour);
  const hour = Number.isFinite(requestedHour) ? Math.max(0, Math.min(23, Math.trunc(requestedHour))) : 12;
  const ymd = date.replaceAll("-", "");
  // 서울 열린데이터광장 OpenAPI는 현재 8088 HTTP 엔드포인트를 공식 제공합니다.
  // 브라우저에 인증키가 노출되지 않도록 이 요청은 서버에서만 실행합니다.
  const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${SERVICE}/1/1000/${ymd}/${String(hour).padStart(2, "0")}/`);

  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    if (!response.ok) return base("error", "서울 생활인구 데이터를 불러오지 못했습니다.");
    const payload = await response.json();
    const service = payload?.[SERVICE];
    const resultCode = service?.RESULT?.CODE;
    if (resultCode && resultCode !== "INFO-000") {
      return base(resultCode === "INFO-200" ? "no_data" : "error", resultCode === "INFO-200" ? "선택한 날짜와 시간의 생활인구 데이터가 없습니다." : "서울 생활인구 API 응답을 확인할 수 없습니다.");
    }
    const rows = (service?.row || []) as SeoulPopulationRow[];
    const row = rows.find(item => item.H_DNG_CD.trim().slice(0, 8) === administrativeCode);
    if (!row) return base("no_data", "선택한 행정동의 생활인구 데이터가 없습니다.");
    const male = MALE_FIELDS.reduce((sum, field) => sum + parseProtectedNumber(row[field]), 0);
    const female = FEMALE_FIELDS.reduce((sum, field) => sum + parseProtectedNumber(row[field]), 0);
    return {
      ...base("available", requestedDate === date ? "서울시 행정동 단위 생활인구입니다." : `기존 행정동 데이터 생산 종료로 마지막 제공일(${LEGACY_LAST_DATE}) 자료를 표시합니다.`),
      referenceDate: `${row.YMD.slice(0, 4)}-${row.YMD.slice(4, 6)}-${row.YMD.slice(6, 8)}`,
      hour: Number(row.TT),
      administrativeCode,
      total: Math.round(parseProtectedNumber(row.SPOP)),
      male: Math.round(male),
      female: Math.round(female)
    };
  } catch {
    return base("error", "서울 생활인구 데이터 연결이 지연되고 있습니다.");
  }
}
