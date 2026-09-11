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
  const total = Number(xmlValue(xml, "totalCount"));
  if (!Number.isFinite(total)) throw new Error(xmlValue(xml, "returnAuthMsg") || xmlValue(xml, "resultMsg") || "HIRA 응답을 해석하지 못했습니다.");
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
      specialtyCode ? fetchHiraCount(hospitalUrl, key, context, specialtyCode) : Promise.resolve(undefined),
      fetchHiraCount(pharmacyUrl, key, context).catch(() => undefined)
    ]);
    return {
      status: "available", source: "건강보험심사평가원 병원정보서비스", referenceDate: todayInSeoul(),
      radiusMeters: context.radiusMeters, medicalCount, matchingSpecialtyCount, pharmacyCount,
      message: `반경 ${context.radiusMeters.toLocaleString()}m의 HIRA 신고 기준 공식 수치입니다.`
    };
  } catch (error) {
    return { status: "error", source: "건강보험심사평가원 병원정보서비스", referenceDate: todayInSeoul(), radiusMeters: context.radiusMeters, message: error instanceof Error ? error.message : "HIRA 데이터를 불러오지 못했습니다." };
  }
}

function findRows(payload: unknown, depth = 0): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return [];
  if (depth > 5) return [];
  for (const value of Object.values(payload as Record<string, unknown>)) {
    if (value && typeof value === "object" && Array.isArray((value as { row?: unknown }).row)) return (value as { row: Record<string, unknown>[] }).row;
    if (Array.isArray(value) && value.every(item => item && typeof item === "object")) return value as Record<string, unknown>[];
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
  return template
    .replaceAll("{key}", encodeURIComponent(key || ""))
    .replaceAll("{lat}", String(context.latitude))
    .replaceAll("{lng}", String(context.longitude))
    .replaceAll("{radius}", String(context.radiusMeters))
    .replaceAll("{admCode}", encodeURIComponent(context.administrativeCode || ""));
}

async function fetchConfiguredJson(template: string, key: string | undefined, context: ProviderContext) {
  const response = await fetch(expandTemplate(template, key, context), {
    cache: "no-store", signal: AbortSignal.timeout(9000),
    headers: key && !template.includes("{key}") ? { Authorization: `Bearer ${key}`, "x-api-key": key } : undefined
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchRentMarket(context: ProviderContext): Promise<RentMarketData> {
  const template = process.env.COMMERCIAL_RENT_API_URL_TEMPLATE;
  const key = process.env.COMMERCIAL_RENT_API_KEY;
  const base: RentMarketData = { status: "not_configured", source: "상업용 부동산 임대 데이터 공급자", spatialUnit: "선택 반경", message: "상가 임대료 공급자의 URL 템플릿과 승인키를 등록하면 비용효율이 활성화됩니다." };
  if (!template || !key) return base;
  try {
    const payload = await fetchConfiguredJson(template, key, context);
    const rows = findRows(payload);
    const rents = rows.map(row => firstNumber(row, ["monthlyRentPerPyeongManwon", "RENT_PER_PYEONG", "rentPerPyeong"])).filter((value): value is number => value !== undefined && value > 0).sort((a, b) => a - b);
    if (!rents.length) return { ...base, status: "no_data", message: "선택 반경의 유효한 상가 임대료 표본이 없습니다." };
    const median = rents[Math.floor(rents.length / 2)];
    const deposits = rows.map(row => firstNumber(row, ["medianDepositManwon", "DEPOSIT_MANWON", "depositManwon"])).filter((value): value is number => value !== undefined);
    const score = Math.max(10, Math.min(90, Math.round(92 - median * 2.4)));
    return { status: "available", source: "상업용 부동산 임대 데이터 공급자", spatialUnit: "선택 반경", referenceDate: todayInSeoul(), sampleCount: rents.length, monthlyRentPerPyeongManwon: median, medianDepositManwon: deposits.length ? deposits.sort((a, b) => a - b)[Math.floor(deposits.length / 2)] : undefined, score, message: `반경 내 ${rents.length}개 표본의 평당 월세 중앙값을 반영했습니다.` };
  } catch { return { ...base, status: "error", message: "임대료 공급자 응답 또는 승인키를 확인해주세요." }; }
}

async function fetchDevelopmentPlans(context: ProviderContext): Promise<DevelopmentPlanData> {
  const template = process.env.DEVELOPMENT_PLAN_API_URL_TEMPLATE;
  const key = process.env.DEVELOPMENT_PLAN_API_KEY || process.env.VWORLD_API_KEY;
  const base: DevelopmentPlanData = { status: "not_configured", source: "국토·도시계획 데이터 공급자", radiusMeters: context.radiusMeters, plans: [], message: "개발계획 공급자의 URL 템플릿과 승인키를 등록하면 성장성에 계획 정보가 추가됩니다." };
  if (!template || !key) return base;
  try {
    const payload = await fetchConfiguredJson(template, key, context);
    const rows = findRows(payload);
    const plans: DevelopmentPlanItem[] = rows.slice(0, 30).map((row, index) => ({
      id: firstText(row, ["id", "PLAN_ID", "pnu"]) || `plan-${index}`,
      name: firstText(row, ["name", "PLAN_NM", "title"]) || "개발계획",
      category: firstText(row, ["category", "PLAN_TYPE", "type"]) || "도시계획",
      status: firstText(row, ["status", "PLAN_STATUS", "progress"]) || "공개자료 확인",
      distanceMeters: firstNumber(row, ["distanceMeters", "DISTANCE", "distance"]),
      targetDate: firstText(row, ["targetDate", "TARGET_DATE", "completionDate"])
    }));
    if (!plans.length) return { ...base, status: "no_data", message: "선택 반경의 공개 개발계획을 찾지 못했습니다." };
    const active = plans.filter(plan => /진행|승인|공사|예정|확정/i.test(plan.status)).length;
    const score = Math.max(35, Math.min(90, 45 + active * 6 + (plans.length - active) * 2));
    return { status: "available", source: "국토·도시계획 데이터 공급자", referenceDate: todayInSeoul(), radiusMeters: context.radiusMeters, plans, score, message: `반경 내 공개 계획 ${plans.length}건 중 진행·승인·예정 ${active}건을 확인했습니다.` };
  } catch { return { ...base, status: "error", message: "개발계획 공급자 응답 또는 승인키를 확인해주세요." }; }
}

function connection(id: DataConnection["id"], label: string, status: ExternalDataStatus, source: string, message: string, requiredEnvironmentVariables: string[], setupUrl: string, referenceDate?: string, spatialUnit?: string): DataConnection {
  return { id, label, status, source, message, requiredEnvironmentVariables, setupUrl, referenceDate, spatialUnit };
}

export async function fetchExternalLocationData(context: ProviderContext): Promise<ExternalLocationData> {
  const [hiraMedical, consumerPower, rentMarket, developmentPlans] = await Promise.all([
    fetchHiraMedical(context), fetchSeoulConsumerPower(context), fetchRentMarket(context), fetchDevelopmentPlans(context)
  ]);
  const dataConnections = [
    connection("hira", "HIRA 공식 의료기관", hiraMedical.status, hiraMedical.source, hiraMedical.message, ["HIRA_SERVICE_KEY"], HIRA_SETUP_URL, hiraMedical.referenceDate, "선택 반경"),
    connection("consumer", "소비력", consumerPower.status, consumerPower.source, consumerPower.message, ["SEOUL_OPEN_DATA_API_KEY"], SEOUL_CONSUMER_URL, consumerPower.referencePeriod, consumerPower.spatialUnit),
    connection("rent", "상가 임대료", rentMarket.status, rentMarket.source, rentMarket.message, ["COMMERCIAL_RENT_API_KEY", "COMMERCIAL_RENT_API_URL_TEMPLATE"], RENT_GUIDE_URL, rentMarket.referenceDate, rentMarket.spatialUnit),
    connection("development", "개발계획", developmentPlans.status, developmentPlans.source, developmentPlans.message, ["DEVELOPMENT_PLAN_API_KEY", "DEVELOPMENT_PLAN_API_URL_TEMPLATE"], DEVELOPMENT_GUIDE_URL, developmentPlans.referenceDate, "선택 반경")
  ];
  return { hiraMedical, consumerPower, rentMarket, developmentPlans, dataConnections };
}
