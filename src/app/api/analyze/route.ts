import { NextRequest, NextResponse } from "next/server";
import type { DataConnection, GrowthForecast, GrowthForecastPoint, LivingPopulation, LocationAnalysis, LivePlace, LivePlaceKind, RegionalProfile } from "@/data/location-types";
import { specialties, type Specialty } from "@/data/specialties";
import { fetchSeoulLivingPopulation } from "@/providers/seoul-living-population";
import { fetchExternalLocationData, type ExternalLocationData } from "@/providers/external-location-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
export const preferredRegion = "icn1";

const COLORS = ["#169e91", "#f26b4a", "#8b66d2", "#3f8fe6", "#e5a33f", "#347bc6"];
const SPECIALTY_TERMS: Record<Specialty, string[]> = {
  "내과": ["내과", "internal medicine"],
  "정형외과": ["정형", "orthopedic", "orthopaedic"],
  "피부과": ["피부", "dermatology", "skin"],
  "성형외과": ["성형", "plastic surgery"],
  "소아청소년과": ["소아", "pediatric", "paediatric"],
  "치과": ["치과", "dental", "dentist"],
  "한의원": ["한의", "oriental medicine", "korean medicine"],
  "산부인과": ["산부인과", "obstetric", "gynecology", "gynaecology"],
  "안과": ["안과", "ophthalmology", "eye clinic"],
  "이비인후과": ["이비인후", "otolaryngology", "ent clinic"],
  "기타": []
};

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const r = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return Math.round(r * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function matchesSpecialty(name: string, category: string | undefined, specialty: Specialty) {
  if (specialty === "기타") return true;
  const target = `${name} ${category || ""}`.toLowerCase();
  return SPECIALTY_TERMS[specialty].some(term => target.includes(term.toLowerCase()));
}

async function geocodeKakao(address: string, key: string) {
  const headers = { Authorization: `KakaoAK ${key}` };
  const addressUrl = new URL("https://dapi.kakao.com/v2/local/search/address.json");
  addressUrl.searchParams.set("query", address);
  let response = await fetch(addressUrl, { headers, cache: "no-store" });
  let data = await response.json();
  let item = data.documents?.[0];
  if (!item) {
    const keywordUrl = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    keywordUrl.searchParams.set("query", address);
    response = await fetch(keywordUrl, { headers, cache: "no-store" });
    data = await response.json();
    item = data.documents?.[0];
  }
  if (!item) throw new Error("주소를 찾을 수 없습니다. 도로명 주소나 건물명을 확인해주세요.");
  return { latitude: Number(item.y), longitude: Number(item.x), displayName: item.address_name || item.road_address_name || item.place_name || address };
}

async function reverseKakao(latitude: number, longitude: number, key: string) {
  const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2address.json");
  url.searchParams.set("x", String(longitude));
  url.searchParams.set("y", String(latitude));
  const response = await fetch(url, {
    headers: { Authorization: `KakaoAK ${key}` },
    cache: "no-store"
  });
  if (!response.ok) return reverseOsm(latitude, longitude);
  const data = await response.json();
  const item = data.documents?.[0];
  return item?.road_address?.address_name || item?.address?.address_name || reverseOsm(latitude, longitude);
}

async function administrativeDongCodeKakao(latitude: number, longitude: number, key: string) {
  try {
    const url = new URL("https://dapi.kakao.com/v2/local/geo/coord2regioncode.json");
    url.searchParams.set("x", String(longitude));
    url.searchParams.set("y", String(latitude));
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store", signal: AbortSignal.timeout(7000) });
    const data = response.ok ? await response.json() : null;
    const administrativeDong = data?.documents?.find((item: { region_type?: string }) => item.region_type === "H");
    return typeof administrativeDong?.code === "string" ? administrativeDong.code.slice(0, 8) : undefined;
  } catch {
    return undefined;
  }
}

async function geocodeOsm(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", address);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("countrycodes", "kr");
  url.searchParams.set("limit", "1");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    headers: { "User-Agent": "THE-FOUNT-Medical-Location/1.0 (https://www.thefount.co.kr)" },
    next: { revalidate: 86400 }
  });
  if (!response.ok) throw new Error("주소 검색 서비스에 연결하지 못했습니다.");
  const data = await response.json();
  if (!data[0]) throw new Error("주소를 찾을 수 없습니다. 도로명 주소나 동 이름을 입력해주세요.");
  return { latitude: Number(data[0].lat), longitude: Number(data[0].lon), displayName: data[0].display_name as string };
}

async function reverseOsm(latitude: number, longitude: number) {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(latitude));
  url.searchParams.set("lon", String(longitude));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("zoom", "18");
  const response = await fetch(url, {
    headers: { "User-Agent": "THE-FOUNT-Medical-Location/1.0 (https://www.thefount.co.kr)" },
    next: { revalidate: 86400 }
  });
  const data = response.ok ? await response.json() : null;
  return data?.display_name || `위도 ${latitude.toFixed(5)}, 경도 ${longitude.toFixed(5)}`;
}

type Demographics = NonNullable<LocationAnalysis["demographics"]>;
type SgisPopulationProfile = {
  malePopulation?: number;
  femalePopulation?: number;
  childPopulation?: number;
  youngAdultPopulation?: number;
  middleAgePopulation?: number;
  seniorPopulation?: number;
};
type SgisResult = { demographics?: Demographics; populationProfile?: SgisPopulationProfile; growthForecast?: GrowthForecast };

function unavailableGrowthForecast(status: "not_configured" | "insufficient_data" | "error", areaName: string, message: string): GrowthForecast {
  return {
    status, source: "SGIS", model: "최근 3개년 선형 추세 외삽", areaName, baseYear: 0,
    forecastYears: [], historical: [], projected: [],
    annualChange: { residentPopulation: 0, workerPopulation: 0, businesses: 0 }, message
  };
}

function buildGrowthForecast(history: GrowthForecastPoint[], areaName: string): GrowthForecast {
  const sorted = [...history].sort((a, b) => a.year - b.year);
  const first = sorted[0];
  const last = sorted.at(-1)!;
  const span = Math.max(1, last.year - first.year);
  const slope = {
    residentPopulation: (last.residentPopulation - first.residentPopulation) / span,
    workerPopulation: (last.workerPopulation - first.workerPopulation) / span,
    businesses: (last.businesses - first.businesses) / span
  };
  const currentYear = new Date().getFullYear();
  const forecastYears = [currentYear + 1, currentYear + 2, currentYear + 3];
  const project = (value: number, change: number, year: number) => Math.max(0, Math.round(value + change * (year - last.year)));
  const projected = forecastYears.map(year => ({
    year,
    kind: "projected" as const,
    residentPopulation: project(last.residentPopulation, slope.residentPopulation, year),
    workerPopulation: project(last.workerPopulation, slope.workerPopulation, year),
    businesses: project(last.businesses, slope.businesses, year)
  }));
  const percent = (change: number, base: number) => base > 0 ? Math.round(change / base * 1000) / 10 : 0;
  const annualChange = {
    residentPopulation: percent(slope.residentPopulation, last.residentPopulation),
    workerPopulation: percent(slope.workerPopulation, last.workerPopulation),
    businesses: percent(slope.businesses, last.businesses)
  };
  const combinedChange = annualChange.residentPopulation * .4 + annualChange.workerPopulation * .35 + annualChange.businesses * .25;
  return {
    status: sorted.length >= 2 ? "available" : "insufficient_data",
    source: "SGIS",
    model: "최근 3개년 선형 추세 외삽",
    areaName,
    baseYear: last.year,
    forecastYears,
    historical: sorted,
    projected,
    annualChange,
    growthScore: sorted.length >= 2 ? clamp(50 + combinedChange * 6, 10, 90) : undefined,
    message: sorted.length >= 2
      ? `SGIS ${first.year}~${last.year}년 행정동 통계의 연간 변화량을 ${forecastYears[0]}~${forecastYears[2]}년에 선형 적용한 추정치입니다.`
      : "연도별 SGIS 통계가 부족해 3년 전망을 계산할 수 없습니다."
  };
}

async function fetchSgisDemographics(address: string): Promise<SgisResult> {
  const consumerKey = process.env.SGIS_CONSUMER_KEY;
  const consumerSecret = process.env.SGIS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return { growthForecast: unavailableGrowthForecast("not_configured", address, "SGIS 승인키가 연결되지 않아 연도별 통계를 조회할 수 없습니다.") };
  try {
    const authUrl = new URL("https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json");
    authUrl.searchParams.set("consumer_key", consumerKey);
    authUrl.searchParams.set("consumer_secret", consumerSecret);
    const authResponse = await fetch(authUrl, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    const auth = authResponse.ok ? await authResponse.json() : null;
    const accessToken = auth?.result?.accessToken;
    if (!accessToken) return { growthForecast: unavailableGrowthForecast("error", address, "SGIS 인증 응답을 확인하지 못했습니다.") };

    const geocodeUrl = new URL("https://sgisapi.mods.go.kr/OpenAPI3/addr/geocode.json");
    geocodeUrl.searchParams.set("accessToken", accessToken);
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("resultcount", "1");
    const geocodeResponse = await fetch(geocodeUrl, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    const geocode = geocodeResponse.ok ? await geocodeResponse.json() : null;
    const matched = geocode?.result?.resultdata?.[0];
    const administrativeCode = String(matched?.adm_cd || "").slice(0, 8);
    if (administrativeCode.length < 5) return { growthForecast: unavailableGrowthForecast("error", address, "SGIS에서 선택 위치의 행정구역 코드를 찾지 못했습니다.") };

    const makeStatsUrl = (path: string, year: number) => {
      const url = new URL(`https://sgisapi.mods.go.kr/OpenAPI3/stats/${path}.json`);
      url.searchParams.set("accessToken", accessToken);
      url.searchParams.set("year", String(year));
      url.searchParams.set("adm_cd", administrativeCode);
      url.searchParams.set("low_search", "0");
      return url;
    };
    const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 6 }, (_, index) => currentYear - 1 - index).sort((a, b) => a - b);
    const snapshots = await Promise.all(years.map(async year => {
      const [populationResult, companyResult] = await Promise.allSettled([
        fetch(makeStatsUrl("population", year), { cache: "no-store", signal: AbortSignal.timeout(7000) }),
        fetch(makeStatsUrl("company", year), { cache: "no-store", signal: AbortSignal.timeout(7000) })
      ]);
      const populationResponse = populationResult.status === "fulfilled" ? populationResult.value : null;
      const companyResponse = companyResult.status === "fulfilled" ? companyResult.value : null;
      const populationData = populationResponse?.ok ? await populationResponse.json().catch(() => null) : null;
      const companyData = companyResponse?.ok ? await companyResponse.json().catch(() => null) : null;
      const population = populationData?.result?.[0];
      const company = companyData?.result?.[0];
      if (!population && !company) return undefined;
      return { year, population, company };
    }));
    const available = snapshots.filter((item): item is NonNullable<typeof item> => Boolean(item)).slice(-3);
    const latest = available.at(-1);
    if (!latest) return { growthForecast: unavailableGrowthForecast("insufficient_data", address, "최근 6개년 SGIS 통계에서 전망 계산에 사용할 자료를 찾지 못했습니다.") };
    const { population, company, year } = latest;
    const areaName = population?.adm_nm || company?.adm_nm || matched?.adm_nm || matched?.sgg_nm || "선택 행정구역";
    const demographics: Demographics = {
      source: "SGIS",
      year,
      areaName,
      administrativeCode,
      residentPopulation: number(population?.tot_ppltn),
      workerPopulation: number(company?.tot_worker || population?.employee_cnt),
      households: number(population?.tot_family),
      businesses: number(company?.corp_cnt || population?.corp_cnt),
      averageAge: Number.isFinite(Number(population?.avg_age)) ? Number(population.avg_age) : null
    };
    const filteredPopulation = async (params: { gender?: "1" | "2"; ageType?: string }) => {
      const url = new URL("https://sgisapi.mods.go.kr/OpenAPI3/stats/searchpopulation.json");
      url.searchParams.set("accessToken", accessToken);
      url.searchParams.set("year", String(year));
      url.searchParams.set("adm_cd", administrativeCode);
      url.searchParams.set("low_search", "0");
      if (params.gender) url.searchParams.set("gender", params.gender);
      if (params.ageType) url.searchParams.set("age_type", params.ageType);
      try {
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
        const data = response.ok ? await response.json() : null;
        const value = Number(data?.result?.[0]?.population);
        return Number.isFinite(value) ? value : undefined;
      } catch {
        return undefined;
      }
    };
    const [malePopulation, femalePopulation, childPopulation, twenties, thirties, forties, fifties, seniorPopulation] = await Promise.all([
      filteredPopulation({ gender: "1" }),
      filteredPopulation({ gender: "2" }),
      filteredPopulation({ ageType: "22" }),
      filteredPopulation({ ageType: "32" }),
      filteredPopulation({ ageType: "33" }),
      filteredPopulation({ ageType: "34" }),
      filteredPopulation({ ageType: "35" }),
      filteredPopulation({ ageType: "24" })
    ]);
    const sumDefined = (...values: Array<number | undefined>) => values.every(value => value !== undefined)
      ? values.reduce<number>((sum, value) => sum + (value || 0), 0)
      : undefined;
    const populationProfile: SgisPopulationProfile = {
      malePopulation,
      femalePopulation,
      childPopulation,
      youngAdultPopulation: sumDefined(twenties, thirties),
      middleAgePopulation: sumDefined(forties, fifties),
      seniorPopulation
    };
    const history: GrowthForecastPoint[] = available.map(item => ({
      year: item.year,
      kind: "observed" as const,
      residentPopulation: number(item.population?.tot_ppltn),
      workerPopulation: number(item.company?.tot_worker || item.population?.employee_cnt),
      businesses: number(item.company?.corp_cnt || item.population?.corp_cnt)
    })).filter(item => item.residentPopulation > 0 || item.workerPopulation > 0 || item.businesses > 0);
    return { demographics, populationProfile, growthForecast: buildGrowthForecast(history, areaName) };
  } catch {
    return { growthForecast: unavailableGrowthForecast("error", address, "SGIS 연결이 지연되어 3년 전망을 계산하지 못했습니다.") };
  }
}

type KakaoSearchResult = { places: LivePlace[]; isTruncated: boolean };

async function kakaoSearch(key: string, code: string, kind: LivePlaceKind, latitude: number, longitude: number, radius: number, query?: string): Promise<KakaoSearchResult> {
  const endpoint = query ? "keyword" : "category";
  const makeUrl = (page: number) => {
    const url = new URL(`https://dapi.kakao.com/v2/local/search/${endpoint}.json`);
    url.searchParams.set("category_group_code", code);
    if (query) url.searchParams.set("query", query);
    url.searchParams.set("x", String(longitude));
    url.searchParams.set("y", String(latitude));
    url.searchParams.set("radius", String(Math.min(radius, 20000)));
    url.searchParams.set("sort", "distance");
    url.searchParams.set("size", "15");
    url.searchParams.set("page", String(page));
    return url;
  };
  const requestPage = async (page: number) => {
    const url = makeUrl(page);
    const response = await fetch(url, { headers: { Authorization: `KakaoAK ${key}` }, cache: "no-store" });
    if (!response.ok) return { documents: [], meta: { total_count: 0, pageable_count: 0 } };
    return response.json();
  };
  const first = await requestPage(1);
  const pageCount = Math.min(3, Math.ceil(Number(first.meta?.pageable_count || first.documents?.length || 0) / 15));
  const remaining = pageCount > 1 ? await Promise.all(Array.from({ length: pageCount - 1 }, (_, index) => requestPage(index + 2))) : [];
  const documents = [first, ...remaining].flatMap(result => result.documents || []);
  const places = documents.map((item: Record<string, string>): LivePlace => ({
    id: `${kind}-${item.id}`,
    name: item.place_name,
    kind,
    specialty: item.category_name,
    latitude: Number(item.y),
    longitude: Number(item.x),
    distanceMeters: Number(item.distance || 0),
    address: item.road_address_name || item.address_name,
    url: item.place_url
  }));
  const last = remaining.at(-1) || first;
  const totalCount = Number(first.meta?.total_count || places.length);
  const pageableCount = Number(first.meta?.pageable_count || places.length);
  return { places, isTruncated: last.meta?.is_end === false || totalCount > pageableCount };
}

function shiftedCoordinate(latitude: number, longitude: number, northMeters: number, eastMeters: number) {
  return {
    latitude: latitude + northMeters / 111320,
    longitude: longitude + eastMeters / (111320 * Math.cos(latitude * Math.PI / 180))
  };
}

async function kakaoSearchComplete(key: string, code: string, kind: LivePlaceKind, latitude: number, longitude: number, radius: number, query?: string, depth = 0): Promise<KakaoSearchResult> {
  const primary = await kakaoSearch(key, code, kind, latitude, longitude, radius, query);
  if (!primary.isTruncated || radius <= 180 || depth >= 2) return primary;
  const offset = radius * .36;
  const childRadius = Math.round(radius * .62);
  const centers = [
    shiftedCoordinate(latitude, longitude, offset, offset),
    shiftedCoordinate(latitude, longitude, offset, -offset),
    shiftedCoordinate(latitude, longitude, -offset, offset),
    shiftedCoordinate(latitude, longitude, -offset, -offset)
  ];
  const children = await Promise.all(centers.map(center => kakaoSearchComplete(key, code, kind, center.latitude, center.longitude, childRadius, query, depth + 1)));
  const byId = new Map(primary.places.map(place => [place.id, place]));
  for (const child of children) {
    for (const place of child.places) {
      const distanceMeters = haversine(latitude, longitude, place.latitude, place.longitude);
      if (distanceMeters <= radius) byId.set(place.id, { ...place, distanceMeters });
    }
  }
  return {
    places: Array.from(byId.values()).sort((a, b) => a.distanceMeters - b.distanceMeters),
    isTruncated: children.some(child => child.isTruncated)
  };
}

async function fetchKakaoPlaces(key: string, latitude: number, longitude: number, radius: number, specialty: Specialty) {
  const [hospital, specialtyHospital, pharmacy, transit, parking, elementarySchool, childcare] = await Promise.all([
    kakaoSearchComplete(key, "HP8", "hospital", latitude, longitude, radius),
    kakaoSearchComplete(key, "HP8", "hospital", latitude, longitude, radius, specialty === "기타" ? "병원" : specialty),
    kakaoSearchComplete(key, "PM9", "pharmacy", latitude, longitude, radius),
    kakaoSearch(key, "SW8", "transit", latitude, longitude, radius),
    kakaoSearch(key, "PK6", "parking", latitude, longitude, radius),
    kakaoSearchComplete(key, "SC4", "parking", latitude, longitude, radius, "초등학교"),
    kakaoSearchComplete(key, "PS3", "parking", latitude, longitude, radius)
  ]);
  const places = [...hospital.places, ...pharmacy.places, ...transit.places, ...parking.places];
  return {
    places,
    totals: {
      medical: hospital.places.length,
      matchingSpecialty: specialty === "기타" ? hospital.places.length : specialtyHospital.places.length,
      pharmacy: pharmacy.places.length,
      transit: transit.places.length,
      parking: parking.places.length
    },
    limits: {
      medical: hospital.isTruncated,
      matchingSpecialty: specialty === "기타" ? hospital.isTruncated : specialtyHospital.isTruncated,
      pharmacy: pharmacy.isTruncated,
      transit: transit.isTruncated,
      parking: parking.isTruncated
    },
    regionalSignals: {
      elementarySchools: elementarySchool.places.filter(place => /초등학교/.test(`${place.name} ${place.specialty || ""}`)).length,
      childcareFacilities: childcare.places.length
    }
  };
}

function osmKind(tags: Record<string, string>): LivePlaceKind | null {
  if (tags.amenity === "pharmacy") return "pharmacy";
  if (tags.amenity === "parking") return "parking";
  if (["bus_stop", "station", "tram_stop"].includes(tags.highway || tags.railway || "")) return "transit";
  if (["hospital", "clinic", "doctors", "dentist"].includes(tags.amenity) || ["hospital", "clinic", "doctor", "dentist"].includes(tags.healthcare)) return "hospital";
  return null;
}

function buildOsmQuery(latitude: number, longitude: number, radius: number) {
  const accessRadius = Math.min(radius, 1200);
  return `[out:json][timeout:12];(nwr(around:${radius},${latitude},${longitude})[amenity~"hospital|clinic|doctors|dentist|pharmacy"];nwr(around:${radius},${latitude},${longitude})[healthcare~"hospital|clinic|doctor|dentist"];nwr(around:${accessRadius},${latitude},${longitude})[amenity="parking"];nwr(around:${accessRadius},${latitude},${longitude})[highway="bus_stop"];nwr(around:${accessRadius},${latitude},${longitude})[railway~"station|tram_stop"];);out center tags;`;
}

function normalizeOsmElements(elements: Record<string, any>[], latitude: number, longitude: number) {
  const seen = new Set<string>();
  return elements.flatMap((item: Record<string, any>): LivePlace[] => {
    const tags = item.tags || {};
    const kind = osmKind(tags);
    const lat = Number(item.lat ?? item.center?.lat);
    const lon = Number(item.lon ?? item.center?.lon);
    const key = `${kind}-${item.type}-${item.id}`;
    if (!kind || !Number.isFinite(lat) || !Number.isFinite(lon) || seen.has(key)) return [];
    seen.add(key);
    return [{
      id: key,
      name: tags["name:ko"] || tags.name || ({ hospital: "의료기관", pharmacy: "약국", transit: "대중교통 정류장", parking: "주차시설" } as const)[kind],
      kind,
      specialty: tags["healthcare:speciality"] || tags.amenity,
      latitude: lat,
      longitude: lon,
      distanceMeters: haversine(latitude, longitude, lat, lon),
      address: [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ") || undefined,
      url: tags.website
    }];
  }).sort((a: LivePlace, b: LivePlace) => a.distanceMeters - b.distanceMeters);
}

async function fetchOsmPlaces(latitude: number, longitude: number, radius: number) {
  const query = buildOsmQuery(latitude, longitude, radius);
  const endpoints = ["https://overpass.osm.jp/api/interpreter", "https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
  let data: { elements?: Record<string, any>[] } | null = null;
  for (const endpoint of endpoints) {
    try {
      const url = new URL(endpoint);
      url.searchParams.set("data", query);
      const response = await fetch(url, {
        headers: { "User-Agent": "THE-FOUNT-Medical-Location/1.0" },
        next: { revalidate: 900 },
        signal: AbortSignal.timeout(9000)
      });
      if (response.ok) { data = await response.json(); break; }
    } catch { /* 다음 공개 미러로 재시도 */ }
  }
  if (!data) throw new Error("주변 시설 데이터가 일시적으로 혼잡합니다. 잠시 후 다시 시도해주세요.");
  return normalizeOsmElements(data.elements || [], latitude, longitude);
}

function percent(value: number | undefined, total: number) {
  return value !== undefined && total > 0 ? Math.round(value / total * 1000) / 10 : undefined;
}

function buildRegionalProfile(
  demographics: Demographics | undefined,
  population: SgisPopulationProfile | undefined,
  growthForecast: GrowthForecast | undefined,
  elementarySchools: number | undefined,
  childcareFacilities: number | undefined,
  specialty: Specialty,
  externalData?: ExternalLocationData
): RegionalProfile | undefined {
  if (!demographics) return undefined;
  const total = demographics.residentPopulation;
  const femaleShare = percent(population?.femalePopulation, total);
  const childShare = percent(population?.childPopulation, total);
  const youngShare = percent(population?.youngAdultPopulation, total);
  const middleShare = percent(population?.middleAgePopulation, total);
  const seniorShare = percent(population?.seniorPopulation, total);
  const workerRatio = total > 0 ? demographics.workerPopulation / total : 0;
  const populationChange = growthForecast?.status === "available" ? growthForecast.annualChange.residentPopulation : undefined;
  const hasNewTownPlan = externalData?.developmentPlans?.plans.some(plan => /LH|택지|신도시|주거환경|재개발|재건축/i.test(`${plan.category} ${plan.name}`)) || false;

  let character = "주거·업무 혼합 생활권";
  let characterReason = "거주인구와 종사자 규모가 한쪽에 크게 치우치지 않아 상시 수요와 직장 수요를 함께 살펴볼 지역입니다.";
  if (hasNewTownPlan && populationChange !== undefined && populationChange > 0) {
    character = "개발·확장형 생활권";
    characterReason = `주변 계획구역이 확인되고 거주인구도 연 ${populationChange}% 흐름을 보여, 입주 시점과 경쟁병원 증가를 함께 확인해야 합니다.`;
  } else if (workerRatio >= 1.25) {
    character = "업무·상업 중심 생활권";
    characterReason = `종사자가 거주인구의 약 ${workerRatio.toFixed(1)}배로, 평일 낮 수요는 강할 수 있지만 야간·주말 수요는 따로 확인해야 합니다.`;
  } else if ((childShare || 0) >= 13 && (elementarySchools || 0) >= 2) {
    character = "가족 주거 중심 생활권";
    characterReason = `15세 미만 인구 비중이 ${childShare}%이고 반경 내 초등학교가 ${elementarySchools}곳 확인되어 가족 단위 생활수요가 비교적 뚜렷합니다.`;
  } else if ((demographics.averageAge || 0) >= 44 && populationChange !== undefined && populationChange <= 0) {
    character = "성숙 주거지 성향";
    characterReason = `평균연령이 ${demographics.averageAge}세이고 거주인구 흐름이 연 ${populationChange}%로, 신규 유입보다 기존 주민의 반복진료 수요를 우선 살펴볼 지역입니다.`;
  } else if (total > 0 && workerRatio < .5) {
    character = "주거 중심 생활권";
    characterReason = "종사자보다 거주인구가 많아 주변 주민의 생활 동선과 반복 방문 편의를 살펴볼 지역입니다.";
  } else if (total <= 0) {
    character = "생활권 성격 확인 필요";
    characterReason = "주민과 직장인 규모를 함께 비교할 자료가 부족합니다. 아파트와 업무시설에서 후보 건물로 이어지는 동선을 확인하세요.";
  }

  const ageText = [
    childShare !== undefined ? `15세 미만 ${childShare}%` : "",
    youngShare !== undefined ? `20~39세 ${youngShare}%` : "",
    middleShare !== undefined ? `40~59세 ${middleShare}%` : "",
    seniorShare !== undefined ? `65세 이상 ${seniorShare}%` : ""
  ].filter(Boolean).join(" · ");
  const specialtyFit: string[] = [];
  if (["소아청소년과", "이비인후과"].includes(specialty)) {
    specialtyFit.push(`15세 미만 인구 ${childShare ?? "자료 없음"}%와 초등학교 ${elementarySchools ?? "자료 없음"}곳, 어린이집·유치원 ${childcareFacilities ?? "자료 없음"}곳을 함께 봐야 합니다.`);
    specialtyFit.push((childShare || 0) >= 13 ? "아동 생활권 신호는 긍정적입니다. 맞벌이 가구의 이동 동선과 방과 후 시간대 접근성을 현장에서 확인하세요." : "아동 인구 비중만으로는 강한 수요를 단정하기 어렵습니다. 인접 아파트의 세대 구성과 실제 소아 경쟁병원을 더 비교하세요.");
  } else if (["정형외과", "내과", "한의원", "안과"].includes(specialty)) {
    specialtyFit.push(`40~59세 ${middleShare ?? "자료 없음"}%, 65세 이상 ${seniorShare ?? "자료 없음"}%로 만성·반복진료 연령층의 크기를 확인할 수 있습니다.`);
    specialtyFit.push("보행 접근성, 엘리베이터, 주차 편의와 인근 약국 동선을 직접 확인하세요.");
  } else if (["피부과", "성형외과"].includes(specialty)) {
    specialtyFit.push(`20~39세 ${youngShare ?? "자료 없음"}%, 여성 ${femaleShare ?? "자료 없음"}%이며 소비력과 직장인구를 함께 봐야 하는 진료과입니다.`);
    specialtyFit.push(workerRatio >= 1.25 ? "직장 수요가 큰 지역이므로 점심·퇴근 시간 유동과 주말 공백을 나누어 확인하세요." : "주거 수요 비중이 있어 재방문 동선과 주차 편의가 중요합니다.");
  } else if (specialty === "산부인과") {
    specialtyFit.push(`여성 ${femaleShare ?? "자료 없음"}%, 15세 미만 ${childShare ?? "자료 없음"}%이며 젊은 가구의 실제 거주 비중을 함께 확인해야 합니다.`);
    specialtyFit.push("대단지 아파트 입주 시점, 산후·소아 연계시설, 주차 접근성을 현장에서 확인하세요.");
  } else {
    specialtyFit.push(ageText ? `주요 연령 구성은 ${ageText}입니다. 선택 진료과의 핵심 환자층과 맞는지 확인하세요.` : "선택 진료과의 핵심 환자층과 실제 생활인구 시간대를 함께 확인하세요.");
  }

  const doctorChecks = [
    specialtyFit[0],
    `반경 내 ${specialty} 경쟁기관의 실제 진료내용·운영시간·환자 대기 수준을 직접 비교하세요.`,
    character.includes("업무") ? "평일 점심·퇴근 시간과 주말의 보행량 차이를 현장에서 확인하세요." : "주요 아파트와 학교에서 후보 건물까지의 보행·차량 동선을 직접 확인하세요.",
    "층별 가시성, 엘리베이터, 주차 가능 대수와 실제 임대조건을 수익성 계산에 넣어 비교하세요."
  ];
  return {
    source: "SGIS · Kakao Local",
    year: demographics.year,
    areaName: demographics.areaName,
    ...population,
    elementarySchools,
    childcareFacilities,
    character,
    characterReason,
    specialtyFit,
    doctorChecks
  };
}

function buildAnalysis(provider: "kakao" | "openstreetmap", displayName: string, latitude: number, longitude: number, specialty: Specialty, radiusMeters: number, places: LivePlace[], providerTotals?: LocationAnalysis["counts"], countLimits?: LocationAnalysis["countLimits"], demographics?: Demographics, populationProfile?: SgisPopulationProfile, regionalSignals?: { elementarySchools: number; childcareFacilities: number }, livingPopulation?: LivingPopulation, growthForecast?: GrowthForecast, externalData?: ExternalLocationData): LocationAnalysis {
  const medical = places.filter(place => place.kind === "hospital");
  const matching = medical.filter(place => matchesSpecialty(place.name, place.specialty, specialty));
  const displayedCounts = {
    medical: medical.length,
    matchingSpecialty: matching.length,
    pharmacy: places.filter(place => place.kind === "pharmacy").length,
    transit: places.filter(place => place.kind === "transit").length,
    parking: places.filter(place => place.kind === "parking").length
  };
  const kakaoCounts = providerTotals || displayedCounts;
  const official = externalData?.hiraMedical.status === "available" ? externalData.hiraMedical : undefined;
  const counts = {
    ...kakaoCounts,
    medical: official?.medicalCount ?? kakaoCounts.medical,
    // HIRA 진료과목 신고 수는 복수 진료과목 기관까지 포함하므로 직접 경쟁기관 판단에는 사용하지 않습니다.
    matchingSpecialty: kakaoCounts.matchingSpecialty,
    pharmacy: official?.pharmacyCount ?? kakaoCounts.pharmacy
  };
  const effectiveCountLimits = official ? {
    medical: false,
    matchingSpecialty: Boolean(countLimits?.matchingSpecialty),
    pharmacy: official.pharmacyCount === undefined ? Boolean(countLimits?.pharmacy) : false,
    transit: Boolean(countLimits?.transit),
    parking: Boolean(countLimits?.parking),
  } : countLimits;
  const { pharmacy, transit, parking } = counts;
  const densityFactor = radiusMeters <= 500 ? 6 : radiusMeters <= 1000 ? 4 : 2;
  const competitionBase = clamp(94 - (counts.matchingSpecialty || counts.medical * .35) * densityFactor);
  const competition = provider === "openstreetmap" && counts.matchingSpecialty === 0 ? Math.min(72, competitionBase) : competitionBase;
  const access = clamp(42 + Math.min(transit, 14) * 3 + Math.min(parking, 8) * 2 + Math.min(pharmacy, 10), 0, 92);
  const demographicDemand = demographics ? clamp(38 + (demographics.residentPopulation + demographics.workerPopulation * .55) / 1600) : null;
  const livingDemand = livingPopulation?.status === "available" && livingPopulation.total !== undefined ? clamp(35 + livingPopulation.total / 900) : null;
  const demand = demographicDemand !== null && livingDemand !== null ? clamp(demographicDemand * .55 + livingDemand * .45) : demographicDemand ?? livingDemand;
  const consumer = externalData?.consumerPower.status === "available" ? externalData.consumerPower.score ?? null : null;
  const costEfficiency = externalData?.rentMarket.status === "available" ? externalData.rentMarket.score ?? null : null;
  const historicGrowth = growthForecast?.growthScore ?? null;
  const planGrowth = externalData?.developmentPlans.status === "available" ? externalData.developmentPlans.score ?? null : null;
  const growth = historicGrowth !== null && planGrowth !== null ? clamp(historicGrowth * .65 + planGrowth * .35) : historicGrowth ?? planGrowth;
  const weightedFactors = [
    { value: demand, weight: 25 }, { value: competition, weight: 20 }, { value: consumer, weight: 15 },
    { value: access, weight: 15 }, { value: costEfficiency, weight: 10 }, { value: growth, weight: 15 }
  ].filter((factor): factor is { value: number; weight: number } => factor.value !== null);
  const weightTotal = weightedFactors.reduce((sum, factor) => sum + factor.weight, 0);
  const observedScore = weightTotal ? Math.round(weightedFactors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) / weightTotal) : 0;
  // 연결된 데이터 항목의 충족률입니다. 예측 정확도나 개원 성공확률이 아닙니다.
  const confidence = Math.min(100,
    (provider === "kakao" ? 5 : 3) +
    (kakaoCounts.medical > 0 ? 5 : 0) +
    (official ? 15 : 0) +
    (demographics ? 12 : 0) +
    (livingPopulation?.status === "available" ? 15 : 0) +
    (consumer !== null ? 15 : 0) +
    (transit > 0 || parking > 0 ? 8 : 0) +
    (costEfficiency !== null ? 10 : 0) +
    (growthForecast?.status === "available" ? 5 : 0) +
    (planGrowth !== null ? 10 : 0)
  );
  const grade = observedScore >= 85 ? "A" : observedScore >= 75 ? "B+" : observedScore >= 65 ? "B" : "C";
  const metrics = [
    { label: "잠재환자 수요", value: demand, note: livingPopulation?.status === "available" ? `${livingPopulation.referenceDate} ${String(livingPopulation.hour).padStart(2, "0")}시 생활인구 반영` : demographics ? `${demographics.areaName} 인구·종사자` : "인구 데이터 연동 필요", color: COLORS[0] },
    { label: "경쟁환경", value: competition, note: `Kakao 분류·검색 ${counts.matchingSpecialty}곳`, color: COLORS[1] },
    { label: "소비력", value: consumer, note: consumer !== null ? `소비 ${externalData?.consumerPower.percentile}% · 의료비 ${externalData?.consumerPower.medicalPercentile !== undefined ? `${externalData.consumerPower.medicalPercentile}%` : "자료 없음"} 백분위` : externalData?.consumerPower.message || "소비 데이터 연동 필요", color: COLORS[2] },
    { label: "접근성", value: access, note: `지하철역 ${transit} · 주차 ${parking}`, color: COLORS[3] },
    { label: "비용효율", value: costEfficiency, note: costEfficiency !== null ? `평당 월세 참고값 ${externalData?.rentMarket.monthlyRentPerPyeongManwon?.toLocaleString()}만원 · ${externalData?.rentMarket.spatialUnit || "출처별 집계 범위"}. ${externalData?.rentMarket.message || "개별 건물의 실제 임대조건과 비교하세요."}` : externalData?.rentMarket.message || "임대료 데이터 연동 필요", color: COLORS[4] },
    { label: "성장성", value: growth, note: planGrowth !== null ? `SGIS 추세 + 개발계획 ${externalData?.developmentPlans.plans.length}건` : growthForecast?.status === "available" ? `SGIS ${growthForecast.historical[0]?.year}~${growthForecast.baseYear}년 추세 기반` : externalData?.developmentPlans.message || "개발계획 데이터 연동 필요", color: COLORS[5] }
  ];
  const regionalProfile = buildRegionalProfile(demographics, populationProfile, growthForecast, regionalSignals?.elementarySchools, regionalSignals?.childcareFacilities, specialty, externalData);
  const strengths = [
    regionalProfile ? `${regionalProfile.character}: ${regionalProfile.characterReason}` : livingPopulation?.status === "available" ? `선택 시간대 생활인구 ${livingPopulation.total?.toLocaleString()}명을 확인했습니다.` : "주변 의료기관의 위치를 지도에서 확인할 수 있습니다.",
    transit >= 2 ? `반경 안에 지하철역 ${transit}곳이 있어 대중교통 접근성을 기대할 수 있습니다.` : parking >= 2 ? `주차시설 ${parking}곳이 검색되어 차량 접근 조건을 비교할 수 있습니다.` : "건물까지의 실제 보행·차량 동선을 확인해야 합니다.",
    competition >= 75 ? `${specialty} 직접 경쟁 수는 비교적 낮게 검색됩니다.` : pharmacy >= 3 ? `주변 약국 ${pharmacy}곳이 확인되어 의료 이용 동선이 형성되어 있습니다.` : `가까운 약국 ${pharmacy}곳이 확인됩니다.`
  ];
  const risks = [
    counts.matchingSpecialty >= 8 ? `${specialty} 직접 경쟁기관이 ${counts.matchingSpecialty}곳 검색되어 진료내용과 가격대 비교가 필요합니다.` : "검색에 잡히지 않는 진료과목이나 폐업·이전 기관이 있을 수 있어 현장 확인이 필요합니다.",
    costEfficiency !== null && costEfficiency < 45 ? "주변 공표 임대료가 높은 편이어서 예상 매출 대비 월세 부담을 먼저 계산해야 합니다." : "관리비·권리금·주차비를 포함한 실제 임대조건은 별도로 확인해야 합니다.",
    regionalProfile?.character.includes("업무") ? "업무지역은 평일과 주말의 환자 흐름 차이가 클 수 있습니다." : growthForecast?.status === "available" && growthForecast.annualChange.residentPopulation < 0 ? "거주인구가 감소 흐름이어서 장기 수요를 보수적으로 판단해야 합니다." : "공개 수치만으로 건물 가시성과 실제 보행 동선을 판단할 수 없습니다."
  ];
  return {
    mode: "live", provider, analyzedAt: new Date().toISOString(),
    location: { displayName, latitude, longitude }, specialty, radiusMeters,
    places, counts, displayedCounts, countLimits: effectiveCountLimits,
    metrics, observedScore, grade, confidence,
    insight: `${displayName.split(",")[0]} 반경 ${radiusMeters.toLocaleString()}m에서 의료기관 ${counts.medical}곳과 ${specialty} 관련 ${counts.matchingSpecialty}곳을 확인했습니다.${official ? " 의료기관 수는 HIRA 신고 기준이며 지도 위치는 Kakao 장소검색을 사용합니다." : " 의료기관 수와 위치는 Kakao 장소검색 기준입니다."}${demographics ? ` SGIS ${demographics.year}년 기준 ${demographics.areaName}의 거주인구는 ${demographics.residentPopulation.toLocaleString()}명, 종사자는 ${demographics.workerPopulation.toLocaleString()}명입니다.` : ""}${livingPopulation?.status === "available" ? ` 서울시 ${livingPopulation.referenceDate} ${String(livingPopulation.hour).padStart(2, "0")}시 ${livingPopulation.spatialUnit} 생활인구 ${livingPopulation.total?.toLocaleString()}명을 수요지표에 반영했습니다.` : ""}${consumer !== null ? ` 소비력은 서울 행정동 소비총액 백분위 ${externalData?.consumerPower.percentile}%입니다.` : ""}${costEfficiency !== null ? ` ${externalData?.rentMarket.message}` : ""} 최종점수는 연결된 항목만 가중 평균한 베타 관측점수입니다.`,
    strengths, risks,
    limitations: ["공개 지도 데이터의 등록·갱신 시점에 따라 실제 현황과 차이가 날 수 있습니다.", demographics ? "SGIS 인구·사업체 통계는 행정동 단위이며 선택 반경과 정확히 일치하지 않습니다." : "거주인구·매출·임대료·개폐업 데이터는 별도 공공데이터 인증키 연결 후 제공됩니다.", livingPopulation?.status === "available" ? livingPopulation.spatialUnit === "250m 격자" ? "서울 250m 생활인구는 통신 기반 추정인구이며 도로별 보행량이나 병원 방문자 수가 아닙니다." : "서울 생활인구 숫자는 행정동 실제 총계이며, 지도 격자의 공간분포와 밀도지수는 주변 시설 접근성을 이용한 추정입니다." : livingPopulation?.message || "서울 이외 지역의 시간대별 생활인구는 현재 지원하지 않습니다.", consumer !== null ? "서울시 소비 데이터는 행정동 집계값이며 병원별 실제 의료매출이나 환자 지출을 뜻하지 않습니다." : externalData?.consumerPower.message || "소비력 데이터가 연결되지 않았습니다."],
    demographics,
    regionalProfile,
    livingPopulation,
    growthForecast,
    dataConnections: externalData?.dataConnections,
    hiraMedical: externalData?.hiraMedical,
    consumerPower: externalData?.consumerPower,
    rentMarket: externalData?.rentMarket,
    developmentPlans: externalData?.developmentPlans
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const specialty = specialties.includes(body.specialty) ? body.specialty as Specialty : "기타";
    const radiusMeters = [300, 500, 1000, 3000].includes(Number(body.radiusMeters)) ? Number(body.radiusMeters) : 1000;
    const kakaoKey = process.env.KAKAO_REST_API_KEY;
    let latitude: number;
    let longitude: number;
    let displayName: string;
    if (Number.isFinite(body.latitude) && Number.isFinite(body.longitude)) {
      latitude = Number(body.latitude);
      longitude = Number(body.longitude);
      displayName = typeof body.address === "string" && body.address ? body.address : kakaoKey ? await reverseKakao(latitude, longitude, kakaoKey) : await reverseOsm(latitude, longitude);
    } else {
      const address = typeof body.address === "string" ? body.address.trim() : "";
      if (address.length < 2) return NextResponse.json({ error: "분석할 주소를 입력해주세요." }, { status: 400 });
      const geocoded = kakaoKey ? await geocodeKakao(address, kakaoKey) : await geocodeOsm(address);
      ({ latitude, longitude, displayName } = geocoded);
    }
    let places: LivePlace[] = [];
    let needsClientFetch = false;
    let providerTotals: LocationAnalysis["counts"] | undefined;
    let countLimits: LocationAnalysis["countLimits"] | undefined;
    let regionalSignals: { elementarySchools: number; childcareFacilities: number } | undefined;
    if (Array.isArray(body.osmElements) && body.osmElements.length <= 1500) {
      places = normalizeOsmElements(body.osmElements, latitude, longitude);
    } else if (kakaoKey) {
      const kakao = await fetchKakaoPlaces(kakaoKey, latitude, longitude, radiusMeters, specialty);
      places = kakao.places;
      providerTotals = kakao.totals;
      countLimits = kakao.limits;
      regionalSignals = kakao.regionalSignals;
    } else if (process.env.VERCEL) {
      needsClientFetch = true;
    } else {
      try { places = await fetchOsmPlaces(latitude, longitude, radiusMeters); }
      catch { needsClientFetch = true; }
    }
    const [sgis, kakaoAdministrativeCode] = await Promise.all([
      fetchSgisDemographics(displayName),
      kakaoKey ? administrativeDongCodeKakao(latitude, longitude, kakaoKey) : Promise.resolve(undefined)
    ]);
    const administrativeCode = kakaoAdministrativeCode || sgis.demographics?.administrativeCode;
    const [livingPopulation, externalData] = await Promise.all([
      fetchSeoulLivingPopulation({
        administrativeCode,
        date: typeof body.populationDate === "string" ? body.populationDate : undefined,
        hour: Number(body.populationHour),
        latitude,
        longitude,
        radiusMeters
      }),
      fetchExternalLocationData({ latitude, longitude, radiusMeters, administrativeCode, displayName, specialty })
    ]);
    const sgisConnectionStatus: DataConnection["status"] = sgis.growthForecast?.status === "available"
      ? "available"
      : sgis.growthForecast?.status === "not_configured" ? "not_configured"
        : sgis.growthForecast?.status === "error" ? "error" : "no_data";
    const sgisConnection: DataConnection = {
      id: "sgis", label: "SGIS 인구·3년 전망", status: sgisConnectionStatus, source: "SGIS",
      message: sgis.growthForecast?.message || "SGIS 연도별 통계를 불러오지 못했습니다.",
      requiredEnvironmentVariables: ["SGIS_CONSUMER_KEY", "SGIS_CONSUMER_SECRET"],
      setupUrl: "https://sgis.kostat.go.kr/developer/html/index.html", referenceDate: sgis.demographics ? String(sgis.demographics.year) : undefined,
      spatialUnit: "행정동"
    };
    const livingConnection: DataConnection = {
      id: "living", label: "서울 생활인구", status: livingPopulation.status, source: livingPopulation.source,
      message: livingPopulation.message, requiredEnvironmentVariables: ["SEOUL_OPEN_DATA_API_KEY"],
      setupUrl: "https://data.seoul.go.kr/dataList/OA-22784/S/1/datasetView.do",
      referenceDate: livingPopulation.referenceDate, spatialUnit: livingPopulation.spatialUnit
    };
    externalData.dataConnections = [sgisConnection, livingConnection, ...externalData.dataConnections];
    const analysis = buildAnalysis(kakaoKey ? "kakao" : "openstreetmap", displayName, latitude, longitude, specialty, radiusMeters, places, providerTotals, countLimits, sgis.demographics, sgis.populationProfile, regionalSignals, livingPopulation, sgis.growthForecast, externalData);
    return NextResponse.json({ ...analysis, needsClientFetch, osmQuery: needsClientFetch ? buildOsmQuery(latitude, longitude, radiusMeters) : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
