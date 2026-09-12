import "server-only";
import type { LivingPopulation } from "@/data/location-types";

const SERVICE = "Spop250mLocalResdDong" as const;
const GRID_SERVICE = "Se250MSpopLocalResd" as const;
const LEGACY_LAST_DATE = "2026-07-31";
const MALE_FIELDS = ["M00", "M10", "M15", "M20", "M25", "M30", "M35", "M40", "M45", "M50", "M55", "M60", "M65", "M70"] as const;
const FEMALE_FIELDS = ["F00", "F10", "F15", "F20", "F25", "F30", "F35", "F40", "F45", "F50", "F55", "F60", "F65", "F70"] as const;

type SeoulPopulationRow = Record<string, string> & {
  YMD: string;
  TT: string;
  H_DNG_CD: string;
  SPOP: string;
};

type SeoulGridPopulationRow = SeoulPopulationRow & { CELL_ID: string };

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
  return availableDate;
}

function distanceMeters(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const north = (targetLatitude - latitude) * 111320;
  const east = (targetLongitude - longitude) * 111320 * Math.cos(latitude * Math.PI / 180);
  return Math.sqrt(north ** 2 + east ** 2);
}

// CELL_ID의 다사 좌표(중부원점 GRS80)를 WGS84 위경도로 변환합니다.
function inverseEpsg5179(easting: number, northing: number) {
  const a = 6378137;
  const f = 1 / 298.257222101;
  const e2 = f * (2 - f);
  const ep2 = e2 / (1 - e2);
  const k0 = .9996;
  const lat0 = 38 * Math.PI / 180;
  const lon0 = 127.5 * Math.PI / 180;
  const meridionalArc = (latitude: number) => a * (
    (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * latitude
    - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * e2 ** 3 / 3072) * Math.sin(6 * latitude)
  );
  const m = meridionalArc(lat0) + (northing - 2000000) / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - e2 * sinPhi ** 2);
  const r1 = a * (1 - e2) / (1 - e2 * sinPhi ** 2) ** 1.5;
  const t1 = tanPhi ** 2;
  const c1 = ep2 * cosPhi ** 2;
  const d = (easting - 1000000) / (n1 * k0);
  const latitude = phi1 - (n1 * tanPhi / r1) * (
    d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * ep2 - 3 * c1 ** 2) * d ** 6 / 720
  );
  const longitude = lon0 + (
    d - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * ep2 + 24 * t1 ** 2) * d ** 5 / 120
  ) / cosPhi;
  return { latitude: latitude * 180 / Math.PI, longitude: longitude * 180 / Math.PI };
}

function gridCellCenter(cellId: string) {
  const match = /^다사(\d{4})(\d{4})$/.exec(cellId.trim());
  if (!match) return null;
  const easting = 900000 + Number(match[1]) * 10 + 125;
  const northing = 1900000 + Number(match[2]) * 10 + 125;
  return inverseEpsg5179(easting, northing);
}

function quantile(values: number[], ratio: number) {
  if (!values.length) return 0;
  return Math.round(values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))]);
}

async function fetchGridPage(key: string, start: number, end: number) {
  const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${GRID_SERVICE}/${start}/${end}/`);
  const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("grid response");
  const payload = await response.json();
  const service = payload?.[GRID_SERVICE];
  if (service?.RESULT?.CODE && service.RESULT.CODE !== "INFO-000") throw new Error(service.RESULT.MESSAGE || "grid result");
  return { total: Number(service?.list_total_count || 0), rows: (service?.row || []) as SeoulGridPopulationRow[] };
}

async function findHourBoundary(key: string, total: number, targetHour: number) {
  if (targetHour <= 0) return 1;
  if (targetHour >= 24) return total + 1;
  const pageSize = 1000;
  let start = Math.max(1, Math.min(total, Math.floor(total * targetHour / 24) - pageSize / 2));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const end = Math.min(total, start + pageSize - 1);
    const { rows } = await fetchGridPage(key, start, end);
    const firstAtOrAfter = rows.findIndex(row => Number(row.TT) >= targetHour);
    if (firstAtOrAfter > 0 || (firstAtOrAfter === 0 && start === 1)) return start + Math.max(0, firstAtOrAfter);
    if (firstAtOrAfter === 0) start = Math.max(1, start - pageSize);
    else start = Math.min(total, start + pageSize);
  }
  throw new Error("hour boundary");
}

async function fetchSeoulGridLivingPopulation(key: string, input: {
  administrativeCode: string;
  date: string;
  hour: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}): Promise<LivingPopulation> {
  const first = await fetchGridPage(key, 1, 1);
  if (!first.total || !first.rows[0]) throw new Error("empty grid");
  const [start, next] = await Promise.all([
    findHourBoundary(key, first.total, input.hour),
    findHourBoundary(key, first.total, input.hour + 1)
  ]);
  const ranges = Array.from({ length: Math.ceil((next - start) / 1000) }, (_, index) => {
    const rangeStart = start + index * 1000;
    return [rangeStart, Math.min(next - 1, rangeStart + 999)] as const;
  });
  const pages = await Promise.all(ranges.map(([rangeStart, rangeEnd]) => fetchGridPage(key, rangeStart, rangeEnd)));
  const rows = pages.flatMap(page => page.rows).filter(row => Number(row.TT) === input.hour);
  const rawCells = rows.flatMap(row => {
    const center = gridCellCenter(row.CELL_ID);
    const population = parseProtectedNumber(row.SPOP);
    if (!center || population <= 0 || distanceMeters(input.latitude, input.longitude, center.latitude, center.longitude) > input.radiusMeters) return [];
    return [{ id: row.CELL_ID.trim(), ...center, population: Math.round(population * 100) / 100 }];
  });
  if (!rawCells.length) throw new Error("no nearby grid");
  // A 250m cell can straddle multiple administrative dongs. Seoul then returns
  // one row per dong fragment with the same CELL_ID. The fragments must be
  // summed into a single map cell; rendering each row separately overlays the
  // same rectangle and makes the density layer look inconsistent with the total.
  const groupedCells = new Map<string, (typeof rawCells)[number]>();
  rawCells.forEach(cell => {
    const existing = groupedCells.get(cell.id);
    groupedCells.set(cell.id, existing
      ? { ...existing, population: Math.round((existing.population + cell.population) * 100) / 100 }
      : cell);
  });
  const uniqueCells = Array.from(groupedCells.values());
  const values = uniqueCells.map(cell => cell.population).sort((a, b) => a - b);
  const densityBreaks = [quantile(values, .25), quantile(values, .5), quantile(values, .75)] as [number, number, number];
  const gridCells = uniqueCells.map(cell => ({
    ...cell,
    band: (cell.population <= densityBreaks[0] ? 0 : cell.population <= densityBreaks[1] ? 1 : cell.population <= densityBreaks[2] ? 2 : 3) as 0 | 1 | 2 | 3
  }));
  const row = rows[0];
  const referenceDate = `${row.YMD.slice(0, 4)}-${row.YMD.slice(4, 6)}-${row.YMD.slice(6, 8)}`;
  return {
    status: "available",
    source: "서울특별시 서울 생활인구",
    dataset: GRID_SERVICE,
    spatialUnit: "250m 격자",
    supportedRegion: "서울특별시",
    referenceDate,
    hour: input.hour,
    administrativeCode: input.administrativeCode,
    total: Math.round(gridCells.reduce((sum, cell) => sum + cell.population, 0)),
    gridCells,
    densityBreaks,
    message: `반경 ${input.radiusMeters.toLocaleString()}m에 걸친 서울시 250m 생활인구 고유 격자 ${gridCells.length}개의 실제 값을 합산했습니다.`
  };
}

export async function fetchSeoulLivingPopulation(input: {
  administrativeCode?: string;
  date?: string;
  hour?: number;
  latitude?: number;
  longitude?: number;
  radiusMeters?: number;
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
  const latitude = Number(input.latitude);
  const longitude = Number(input.longitude);
  const radiusMeters = Number.isFinite(Number(input.radiusMeters)) ? Math.max(100, Math.min(3000, Number(input.radiusMeters))) : 1000;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    try {
      return await fetchSeoulGridLivingPopulation(key, { administrativeCode, date: requestedDate, hour, latitude, longitude, radiusMeters });
    } catch {
      // 신규 격자 API가 지연되거나 호출 한도에 도달하면 검증된 행정동 자료로 대체합니다.
    }
  }
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
