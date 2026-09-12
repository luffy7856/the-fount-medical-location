import "server-only";

import type {
  ConsumerPowerData, DataConnection, DevelopmentPlanData, DevelopmentPlanItem,
  ExternalDataStatus, HiraMedicalData, RentMarketData
} from "@/data/location-types";
import type { Specialty } from "@/data/specialties";

const HIRA_SETUP_URL = "https://www.data.go.kr/data/15001698/openapi.do";
const SEOUL_CONSUMER_URL = "https://data.seoul.go.kr/dataList/OA-22166/S/1/datasetView.do";
const RENT_GUIDE_URL = "https://www.data.go.kr/tcs/dss/selectDataSetList.do?keyword=%EC%83%81%EA%B0%80%20%EC%9E%84%EB%8C%80%EB%A3%8C";
const DEVELOPMENT_GUIDE_URL = "https://www.vworld.kr/dtna/dtna_apiSvcFc_s001.do";

type ProviderContext = {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  administrativeCode?: string;
  specialty: Specialty;
};

export type ExternalLocationData = {
  hiraMedical: HiraMedicalData;
  consumerPower: ConsumerPowerData;
  rentMarket: RentMarketData;
  developmentPlans: DevelopmentPlanData;
  dataConnections: DataConnection[];
};

const SPECIALTY_CODES: Partial<Record<Specialty, string>> = {
  "내과": "01", "정형외과": "05", "성형외과": "08",
  "산부인과": "10", "소아청소년과": "11", "안과": "12", "이비인후과": "13",
  "피부과": "14", "치과": "49"
} as Partial<Record<Specialty, string>>;

function todayInSeoul() {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());
}

function decodeXml(value: string) {
  return value.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function xmlValue(xml: string, tag: string) {
  const match = xml.match(new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, "i"));
  return match ? decodeXml(match[1].trim()) : undefined;
}

function safeServiceKey(key: string) {
  try { return decodeURIComponent(key); } catch { return key; }
}

async function fetchHiraCount(baseUrl: string, key: string, context: ProviderContext, specialtyCode?: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("serviceKey", safeServiceKey(key));
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1");
  url.searchParams.set("xPos", String(context.longitude));
  url.searchParams.set("yPos", String(context.latitude));
  url.searchParams.set("radius", String(context.radiusMeters));
  if (specialtyCode) url.searchParams.set("dgsbjtCd", specialtyCode);
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
  const xml = await response.text();
  if (!response.ok || /SERVICE_(?:ACCESS_DENIED|KEY_IS_NOT_REGISTERED)|PERMISSION_DENIED/i.test(xml)) throw new Error("승인키 권한을 확인해주세요.");
  const resultCode = xmlValue(xml, "resultCode");
  if (resultCode && !["00", "0"].includes(resultCode)) throw new Error("HIRA 조회가 승인되지 않았거나 일시적으로 제한되었습니다.");
  const rawTotal = xmlValue(xml, "totalCount");
  const total = rawTotal && /^\d+$/.test(rawTotal) ? Number(rawTotal) : NaN;
  if (!Number.isSafeInteger(total) || total < 0) throw new Error("HIRA 응답에 유효한 기관 수가 없습니다. 잠시 후 다시 조회해주세요.");
  return total;
}

async function fetchHiraMedical(context: ProviderContext): Promise<HiraMedicalData> {
  const key = process.env.HIRA_SERVICE_KEY || process.env.DATA_GO_KR_SERVICE_KEY;
  if (!key) return { status: "not_configured", source: "건강보험심사평가원 병원정보서비스", referenceDate: todayInSeoul(), radiusMeters: context.radiusMeters, message: "HIRA_SERVICE_KEY 승인키를 등록하면 공식 의료기관 수가 활성화됩니다." };
  const hospitalUrl = process.env.HIRA_HOSPITAL_API_URL || "https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList";
  const pharmacyUrl = process.env.HIRA_PHARMACY_API_URL || "https://apis.data.go.kr/B551182/pharmacyInfoService/getParmacyBasisList";
  try {
    const specialtyCode = SPECIALTY_CODES[context.specialty];
    const [medicalCount, matchingSpecialtyCount, pharmacyCount] = await Promise.all([
      fetchHiraCount(hospitalUrl, key, context),
      specialtyCode ? fetchHiraCount(hospitalUrl, key, context, specialtyCode).catch(() => undefined) : Promise.resolve(undefined),
      fetchHiraCount(pharmacyUrl, key, context).catch(() => undefined)
    ]);
    return {
      status: "available", source: "건강보험심사평가원 병원정보서비스", referenceDate: todayInSeoul(),
      radiusMeters: context.radiusMeters, medicalCount, matchingSpecialtyCount, pharmacyCount,
      message: `반경 ${context.radiusMeters.toLocaleString()}m의 HIRA 신고 기준 의료기관 수입니다.${pharmacyCount === undefined ? " 약국은 별도 API 승인 확인 전까지 기존 지도 검색 수를 표시합니다." : " 약국 수도 HIRA 신고 기준입니다."}${matchingSpecialtyCount === undefined ? " 진료과별 수는 기존 지도 검색 기준입니다." : ""}`
    };
  } catch (error) {
    return { status: "error", source: "건강보험심사평가원 병원정보서비스", referenceDate: todayInSeoul(), radiusMeters: context.radiusMeters, message: error instanceof Error ? error.message : "HIRA 데이터를 불러오지 못했습니다." };
  }
}

function findRows(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  if (depth > 5) return [];
  if (Array.isArray(payload)) {
    return payload
      .filter(item => item && typeof item === "object" && !Array.isArray(item))
      .map(item => item as Record<string, unknown>);
  }
  const record = payload as Record<string, unknown>;
  const preferredKeys = ["row", "rows", "item", "items", "records", "features", "data", "results", "result"];
  for (const key of preferredKeys) {
    const value = record[key];
    if (Array.isArray(value)) {
      const rows = value
        .filter(item => item && typeof item === "object" && !Array.isArray(item))
        .map(item => {
          const feature = item as Record<string, unknown>;
          const properties = feature.properties;
          return properties && typeof properties === "object" && !Array.isArray(properties)
            ? { ...(properties as Record<string, unknown>), __geometry: feature.geometry }
            : feature;
        });
      if (rows.length) return rows;
    }
  }
  for (const value of Object.values(record)) {
    const nested = findRows(value, depth + 1);
    if (nested.length) return nested;
  }
  return [];
}

function firstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function firstText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) if (typeof row[key] === "string" && row[key]) return String(row[key]);
  return undefined;
}

async function fetchSeoulConsumerPower(context: ProviderContext): Promise<ConsumerPowerData> {
  const key = process.env.SEOUL_OPEN_DATA_API_KEY;
  const service = process.env.SEOUL_CONSUMER_API_SERVICE || "VwsmAdstrdNcmCnsmpW";
  const base: ConsumerPowerData = { status: "not_configured", source: "서울시 상권분석서비스(소비-행정동)", spatialUnit: "행정동", administrativeCode: context.administrativeCode, message: "서울 열린데이터광장 승인키를 등록하면 행정동 소비력이 활성화됩니다." };
  if (!context.administrativeCode) return { ...base, status: "unsupported", message: "행정동 코드를 확인할 수 없어 소비 데이터를 조회하지 못했습니다." };
  if (!context.administrativeCode.startsWith("11")) return { ...base, status: "unsupported", message: "서울시 행정동 소비 데이터는 서울 지역에서만 지원됩니다." };
  if (!key) return base;
  try {
    // 서울 열린데이터광장 8088 포트는 TLS를 제공하지 않습니다. 이 코드는
    // server-only 모듈이므로 HTTP 호출에도 인증키가 브라우저로 노출되지 않습니다.
    const url = new URL(`http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${encodeURIComponent(service)}/1/1000`);
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(9000) });
    const payload = response.ok ? await response.json() : null;
    const rows = findRows(payload);
    const code = context.administrativeCode.slice(0, 8);
    const latestPeriod = rows.map(row => firstText(row, ["STDR_YYQU_CD", "STDR_YM_CD", "referencePeriod"]) || "").sort().at(-1);
    const currentRows = latestPeriod ? rows.filter(row => firstText(row, ["STDR_YYQU_CD", "STDR_YM_CD", "referencePeriod"]) === latestPeriod) : rows;
    const selected = currentRows.find(row => String(row.ADSTRD_CD || row.adstrdCd || "").startsWith(code));
    if (!selected) return { ...base, status: "no_data", message: "선택 행정동의 최신 소비 자료가 없습니다." };
    const amountKeys = ["EXPNDTR_TOTAMT", "TOT_EXPNDTR_AMT", "TOT_CONSUMPTION_AMT", "THSMON_SELNG_AMT", "totalConsumptionWon"];
    const totalConsumptionWon = firstNumber(selected, amountKeys);
    if (totalConsumptionWon === undefined) return { ...base, status: "error", message: "소비 API 필드가 변경되어 합계 금액을 확인하지 못했습니다." };
    const comparable = currentRows.map(row => firstNumber(row, amountKeys)).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
    const rank = comparable.filter(value => value <= totalConsumptionWon).length;
    const percentile = comparable.length ? Math.round(rank / comparable.length * 100) : 50;
    const medicalConsumptionWon = firstNumber(selected, ["MCP_EXPNDTR_TOTAMT", "medicalConsumptionWon"]);
    const medicalComparable = currentRows.map(row => firstNumber(row, ["MCP_EXPNDTR_TOTAMT", "medicalConsumptionWon"])).filter((value): value is number => value !== undefined).sort((a, b) => a - b);
    const medicalRank = medicalConsumptionWon === undefined ? 0 : medicalComparable.filter(value => value <= medicalConsumptionWon).length;
    const medicalPercentile = medicalConsumptionWon !== undefined && medicalComparable.length ? Math.round(medicalRank / medicalComparable.length * 100) : undefined;
    const score = Math.max(5, Math.min(95, Math.round(percentile * .6 + (medicalPercentile ?? percentile) * .4)));
    return {
      status: "available", source: "서울시 상권분석서비스(소비-행정동)", spatialUnit: "행정동", administrativeCode: code,
      areaName: firstText(selected, ["ADSTRD_CD_NM", "ADSTRD_NM", "areaName"]),
      referencePeriod: latestPeriod || firstText(selected, ["STDR_YYQU_CD", "STDR_YM_CD", "referencePeriod"]),
      totalConsumptionWon, percentile, medicalConsumptionWon, medicalPercentile, score,
      message: `서울 행정동 간 소비총액 백분위 ${percentile}%와 의료비 지출 백분위 ${medicalPercentile ?? "자료 없음"}%를 반영했습니다.`
    };
  } catch {
    return { ...base, status: "error", message: "서울시 소비 데이터를 불러오지 못했습니다. 서비스명과 키 권한을 확인해주세요." };
  }
}

function expandTemplate(template: string, key: string | undefined, context: ProviderContext) {
  const latitudeDelta = context.radiusMeters / 111_320;
  const longitudeDelta = context.radiusMeters / (111_320 * Math.max(.2, Math.cos(context.latitude * Math.PI / 180)));
  const bbox = [
    context.longitude - longitudeDelta,
    context.latitude - latitudeDelta,
    context.longitude + longitudeDelta,
    context.latitude + latitudeDelta
  ];
  return template
    .replaceAll("{key}", encodeURIComponent(key || ""))
    .replaceAll("{lat}", String(context.latitude))
    .replaceAll("{lng}", String(context.longitude))
    .replaceAll("{radius}", String(context.radiusMeters))
    .replaceAll("{admCode}", encodeURIComponent(context.administrativeCode || ""))
    .replaceAll("{specialty}", encodeURIComponent(context.specialty))
    .replaceAll("{minLng}", String(bbox[0]))
    .replaceAll("{minLat}", String(bbox[1]))
    .replaceAll("{maxLng}", String(bbox[2]))
    .replaceAll("{maxLat}", String(bbox[3]))
    .replaceAll("{bbox}", bbox.join(","))
    .replaceAll("{domain}", encodeURIComponent(process.env.VWORLD_API_DOMAIN || "https://the-fount-medical-location.vercel.app"));
}

function providerHeaders(key: string | undefined, keyHeader: string | undefined) {
  if (!key || !keyHeader) return undefined;
  if (!/^[A-Za-z0-9-]{1,64}$/.test(keyHeader)) throw new Error("승인키 헤더 이름 설정이 올바르지 않습니다.");
  return { [keyHeader]: key };
}

function parseXmlRows(xml: string) {
  const blocks = Array.from(xml.matchAll(/<(?:\w+:)?(?:item|featureMember)\b[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:item|featureMember)>/gi));
  return blocks.map((block) => {
    const row: Record<string, unknown> = {};
    for (const match of Array.from(block[1].matchAll(/<(?:\w+:)?([\w가-힣-]+)\b[^>]*>(?:<!\[CDATA\[)?([^<]*?)(?:\]\]>)?<\/(?:\w+:)?\1>/gi))) {
      row[match[1]] = decodeXml(match[2].trim());
    }
    return row;
  }).filter(row => Object.keys(row).length > 0);
}

async function fetchConfiguredPayload(template: string, key: string | undefined, keyHeader: string | undefined, context: ProviderContext) {
  const expanded = expandTemplate(template, key, context);
  const url = new URL(expanded);
  if (!["https:", "http:"].includes(url.protocol)) throw new Error("공급자 URL은 HTTP(S)만 사용할 수 있습니다.");
  const response = await fetch(url, {
    cache: "no-store", signal: AbortSignal.timeout(9000),
    headers: providerHeaders(key, template.includes("{key}") ? undefined : keyHeader)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const text = await response.text();
  if (!text.trim()) throw new Error("공급자 응답이 비어 있습니다.");
  if (/^\s*</.test(text)) {
    if (/<(?:OpenAPI_ServiceResponse|ExceptionReport|ServiceExceptionReport)|SERVICE_(?:ACCESS_DENIED|KEY_IS_NOT_REGISTERED)|PERMISSION_DENIED/i.test(text)) {
      throw new Error("공급자 승인키 또는 API 권한을 확인해주세요.");
    }
    return { rows: parseXmlRows(text) };
  }
  const payload = JSON.parse(text) as unknown;
  const serialized = JSON.stringify(payload).slice(0, 4000);
  if (/"(?:status|resultCode|code)"\s*:\s*"?(?:ERROR|FAIL|AUTH|401|403|99)|SERVICE_(?:ACCESS_DENIED|KEY_IS_NOT_REGISTERED)|PERMISSION_DENIED/i.test(serialized)) {
    throw new Error("공급자 승인키 또는 API 권한을 확인해주세요.");
  }
  return payload;
}

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function coordinateFromRow(row: Record<string, unknown>) {
  const geometry = row.__geometry;
  if (geometry && typeof geometry === "object") {
    const coordinates = (geometry as { coordinates?: unknown }).coordinates;
    const points: [number, number][] = [];
    const collectPoints = (value: unknown) => {
      if (!Array.isArray(value)) return;
      if (typeof value[0] === "number" && typeof value[1] === "number") {
        points.push([value[0], value[1]]);
        return;
      }
      value.forEach(collectPoints);
    };
    collectPoints(coordinates);
    if (points.length) {
      return {
        longitude: points.reduce((sum, point) => sum + point[0], 0) / points.length,
        latitude: points.reduce((sum, point) => sum + point[1], 0) / points.length
      };
    }
  }
  const latitude = firstNumber(row, ["latitude", "lat", "LAT", "y", "Y", "위도"]);
  const longitude = firstNumber(row, ["longitude", "lng", "lon", "LNG", "LON", "x", "X", "경도"]);
  return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
}

function distanceMeters(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const rad = (value: number) => value * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function withinRequestedArea(row: Record<string, unknown>, context: ProviderContext) {
  const coordinate = coordinateFromRow(row);
  if (!coordinate) return true;
  return distanceMeters(context, coordinate) <= context.radiusMeters * 1.1;
}

type RentUnit = "manwon_per_pyeong" | "won_per_pyeong" | "won_per_square_meter" | "manwon_total_monthly" | "won_total_monthly";

function rentPerPyeong(row: Record<string, unknown>, unit: RentUnit) {
  const direct = firstNumber(row, ["monthlyRentPerPyeongManwon"]);
  if (direct !== undefined) return direct;
  const raw = firstNumber(row, ["RENT_PER_PYEONG", "rentPerPyeong", "monthlyRent", "MONTHLY_RENT", "월세", "임대료"]);
  if (raw === undefined) return undefined;
  if (unit === "won_per_pyeong") return raw / 10_000;
  if (unit === "won_per_square_meter") return raw * 3.305785 / 10_000;
  if (unit === "manwon_total_monthly" || unit === "won_total_monthly") {
    const area = firstNumber(row, ["areaPyeong", "AREA_PYEONG", "exclusiveAreaPyeong", "평수", "계약면적평"]);
    if (!area || area <= 0) return undefined;
    return unit === "manwon_total_monthly" ? raw / area : raw / 10_000 / area;
  }
  return raw;
}

function depositManwon(row: Record<string, unknown>, unit: "manwon" | "won") {
  const direct = firstNumber(row, ["medianDepositManwon", "depositManwon"]);
  if (direct !== undefined) return direct;
  const raw = firstNumber(row, ["DEPOSIT_MANWON", "DEPOSIT", "deposit", "보증금"]);
  return raw === undefined ? undefined : unit === "won" ? raw / 10_000 : raw;
}

async function fetchRentMarket(context: ProviderContext): Promise<RentMarketData> {
  const template = process.env.COMMERCIAL_RENT_API_URL_TEMPLATE;
  const key = process.env.COMMERCIAL_RENT_API_KEY;
  const source = process.env.COMMERCIAL_RENT_SOURCE_NAME || "상업용 부동산 임대 데이터 공급자";
  const spatialUnit = process.env.COMMERCIAL_RENT_SPATIAL_UNIT || "선택 반경";
  const base: RentMarketData = { status: "not_configured", source, spatialUnit, message: "계약·승인된 상가 임대료 API의 URL 템플릿과 승인키를 등록하면 비용효율이 활성화됩니다." };
  if (!template || !key) return base;
  try {
    const payload = await fetchConfiguredPayload(template, key, process.env.COMMERCIAL_RENT_API_KEY_HEADER, context);
    const rows = findRows(payload).filter(row => withinRequestedArea(row, context));
    const unit = (process.env.COMMERCIAL_RENT_VALUE_UNIT || "manwon_per_pyeong") as RentUnit;
    if (!["manwon_per_pyeong", "won_per_pyeong", "won_per_square_meter", "manwon_total_monthly", "won_total_monthly"].includes(unit)) {
      throw new Error("COMMERCIAL_RENT_VALUE_UNIT 설정을 확인해주세요.");
    }
    const depositUnit = process.env.COMMERCIAL_RENT_DEPOSIT_UNIT === "won" ? "won" : "manwon";
    const rents = rows.map(row => rentPerPyeong(row, unit)).filter((value): value is number => value !== undefined && value > 0 && value < 10_000);
    if (!rents.length) return { ...base, status: "no_data", message: "선택 반경의 유효한 상가 임대료 표본이 없습니다." };
    const medianRent = median(rents);
    const deposits = rows.map(row => depositManwon(row, depositUnit)).filter((value): value is number => value !== undefined && value >= 0 && value < 10_000_000);
    const referenceDates = rows.map(row => firstText(row, ["referenceDate", "REFERENCE_DATE", "baseDate", "BASE_DATE", "dealDate", "계약일", "기준일"])).filter((value): value is string => Boolean(value)).sort();
    const score = Math.max(10, Math.min(90, Math.round(92 - medianRent * 2.4)));
    return { status: "available", source, spatialUnit, referenceDate: referenceDates.at(-1) || todayInSeoul(), sampleCount: rents.length, monthlyRentPerPyeongManwon: Math.round(medianRent * 10) / 10, medianDepositManwon: deposits.length ? Math.round(median(deposits)) : undefined, score, message: `선택 범위의 유효 표본 ${rents.length}개에서 평당 월세 중앙값을 계산했습니다. 비용효율 점수는 비교용 내부 참고지표입니다.` };
  } catch (error) { return { ...base, status: "error", message: error instanceof Error ? `임대료 연결 점검: ${error.message}` : "임대료 공급자 응답 또는 승인키를 확인해주세요." }; }
}

async function fetchDevelopmentPlans(context: ProviderContext): Promise<DevelopmentPlanData> {
  const template = process.env.DEVELOPMENT_PLAN_API_URL_TEMPLATE;
  const key = process.env.DEVELOPMENT_PLAN_API_KEY || process.env.VWORLD_API_KEY;
  const source = process.env.DEVELOPMENT_PLAN_SOURCE_NAME || (process.env.VWORLD_API_KEY ? "VWorld 연계 국토·도시 공간정보" : "국토·도시계획 데이터 공급자");
  const base: DevelopmentPlanData = { status: "not_configured", source, radiusMeters: context.radiusMeters, plans: [], message: key && !template ? "운영키는 준비됐습니다. 승인된 개발계획 데이터셋의 URL 템플릿을 등록하면 즉시 활성화됩니다." : "운영키와 개발계획 데이터셋 URL 템플릿을 등록하면 성장성에 실제 공개 계획이 추가됩니다." };
  if (!template || !key) return base;
  try {
    const payload = await fetchConfiguredPayload(template, key, process.env.DEVELOPMENT_PLAN_API_KEY_HEADER, context);
    const rows = findRows(payload).filter(row => withinRequestedArea(row, context));
    const plans: DevelopmentPlanItem[] = rows.flatMap((row, index) => {
      const name = firstText(row, ["name", "PLAN_NM", "title", "projectName", "prj_nm", "proj_nm", "사업명", "사업명칭", "공사명", "시설명"]);
      if (!name) return [];
      const coordinate = coordinateFromRow(row);
      const suppliedDistance = firstNumber(row, ["distanceMeters", "DISTANCE", "distance", "거리"]);
      return [{
        id: firstText(row, ["id", "PLAN_ID", "projectId", "pnu", "fid", "gml_id", "사업관리번호"]) || `plan-${index}-${name}`,
        name,
        category: firstText(row, ["category", "PLAN_TYPE", "type", "projectType", "사업구분", "계획유형", "시설종류"]) || "공개 개발계획",
        status: firstText(row, ["status", "PLAN_STATUS", "progress", "projectStatus", "진행상태", "사업상태", "추진단계"]) || "공개자료 확인",
        distanceMeters: suppliedDistance ?? (coordinate ? distanceMeters(context, coordinate) : undefined),
        targetDate: firstText(row, ["targetDate", "TARGET_DATE", "completionDate", "endDate", "준공예정일", "완료예정일", "사업기간"])
      }];
    }).slice(0, 30);
    if (!plans.length) return { ...base, status: "no_data", message: "선택 반경의 공개 개발계획을 찾지 못했습니다." };
    const active = plans.filter(plan => /진행|승인|공사|예정|확정/i.test(plan.status)).length;
    const score = Math.max(35, Math.min(90, 45 + active * 6 + (plans.length - active) * 2));
    const referenceDates = rows.map(row => firstText(row, ["referenceDate", "REFERENCE_DATE", "baseDate", "BASE_DATE", "기준일", "갱신일"])).filter((value): value is string => Boolean(value)).sort();
    return { status: "available", source, referenceDate: referenceDates.at(-1) || todayInSeoul(), radiusMeters: context.radiusMeters, plans, score, message: `선택 반경의 공개 계획 ${plans.length}건 중 진행·승인·예정 ${active}건을 확인했습니다. 계획의 확정 여부와 일정은 원문을 별도로 확인해야 합니다.` };
  } catch (error) { return { ...base, status: "error", message: error instanceof Error ? `개발계획 연결 점검: ${error.message}` : "개발계획 공급자 응답 또는 승인키를 확인해주세요." }; }
}

function connection(id: DataConnection["id"], label: string, status: ExternalDataStatus, source: string, message: string, requiredEnvironmentVariables: string[], setupUrl: string, referenceDate?: string, spatialUnit?: string): DataConnection {
  return { id, label, status, source, message, requiredEnvironmentVariables, setupUrl, referenceDate, spatialUnit };
}

export async function fetchExternalLocationData(context: ProviderContext): Promise<ExternalLocationData> {
  const [hiraMedical, consumerPower, rentMarket, developmentPlans] = await Promise.all([
    fetchHiraMedical(context), fetchSeoulConsumerPower(context), fetchRentMarket(context), fetchDevelopmentPlans(context)
  ]);
  const developmentRequiredVariables = process.env.DEVELOPMENT_PLAN_API_URL_TEMPLATE
    ? (process.env.DEVELOPMENT_PLAN_API_KEY || process.env.VWORLD_API_KEY ? [] : ["DEVELOPMENT_PLAN_API_KEY 또는 VWORLD_API_KEY"])
    : ["DEVELOPMENT_PLAN_API_URL_TEMPLATE", ...(process.env.DEVELOPMENT_PLAN_API_KEY || process.env.VWORLD_API_KEY ? [] : ["DEVELOPMENT_PLAN_API_KEY 또는 VWORLD_API_KEY"])];
  const rentRequiredVariables = [
    ...(process.env.COMMERCIAL_RENT_API_URL_TEMPLATE ? [] : ["COMMERCIAL_RENT_API_URL_TEMPLATE"]),
    ...(process.env.COMMERCIAL_RENT_API_KEY ? [] : ["COMMERCIAL_RENT_API_KEY"])
  ];
  const dataConnections = [
    connection("hira", "HIRA 공식 의료기관", hiraMedical.status, hiraMedical.source, hiraMedical.message, ["HIRA_SERVICE_KEY"], HIRA_SETUP_URL, hiraMedical.referenceDate, "선택 반경"),
    connection("consumer", "소비력", consumerPower.status, consumerPower.source, consumerPower.message, ["SEOUL_OPEN_DATA_API_KEY"], SEOUL_CONSUMER_URL, consumerPower.referencePeriod, consumerPower.spatialUnit),
    connection("rent", "상가 임대료", rentMarket.status, rentMarket.source, rentMarket.message, rentRequiredVariables, RENT_GUIDE_URL, rentMarket.referenceDate, rentMarket.spatialUnit),
    connection("development", "개발계획", developmentPlans.status, developmentPlans.source, developmentPlans.message, developmentRequiredVariables, DEVELOPMENT_GUIDE_URL, developmentPlans.referenceDate, "선택 반경")
  ];
  return { hiraMedical, consumerPower, rentMarket, developmentPlans, dataConnections };
}
