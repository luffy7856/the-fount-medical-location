import { NextRequest, NextResponse } from "next/server";
import type { LocationAnalysis, LivePlace, LivePlaceKind } from "@/data/location-types";
import { specialties, type Specialty } from "@/data/specialties";

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
type SeoulRealtime = NonNullable<LocationAnalysis["seoulRealtime"]>;

const SEOUL_STATION_HOTSPOTS: Array<{ code: string; name: string; aliases: string[] }> = [
  { code: "POI013", name: "가산디지털단지역", aliases: ["가산디지털단지"] },
  { code: "POI014", name: "강남역", aliases: ["강남역"] },
  { code: "POI015", name: "건대입구역", aliases: ["건대입구"] },
  { code: "POI016", name: "고덕역", aliases: ["고덕역"] },
  { code: "POI017", name: "고속터미널역", aliases: ["고속터미널"] },
  { code: "POI018", name: "교대역", aliases: ["교대역"] },
  { code: "POI019", name: "구로디지털단지역", aliases: ["구로디지털단지"] },
  { code: "POI020", name: "구로역", aliases: ["구로역"] },
  { code: "POI021", name: "군자역", aliases: ["군자역"] },
  { code: "POI023", name: "대림역", aliases: ["대림역"] },
  { code: "POI024", name: "동대문역", aliases: ["동대문역"] },
  { code: "POI025", name: "뚝섬역", aliases: ["뚝섬역"] },
  { code: "POI026", name: "미아사거리역", aliases: ["미아사거리"] },
  { code: "POI027", name: "발산역", aliases: ["발산역"] },
  { code: "POI029", name: "사당역", aliases: ["사당역"] },
  { code: "POI030", name: "삼각지역", aliases: ["삼각지역"] },
  { code: "POI031", name: "서울대입구역", aliases: ["서울대입구"] },
  { code: "POI032", name: "서울식물원·마곡나루역", aliases: ["마곡나루"] },
  { code: "POI033", name: "서울역", aliases: ["서울역"] },
  { code: "POI034", name: "선릉역", aliases: ["선릉역"] },
  { code: "POI035", name: "성신여대입구역", aliases: ["성신여대입구"] },
  { code: "POI036", name: "수유역", aliases: ["수유역"] },
  { code: "POI037", name: "신논현역·논현역", aliases: ["신논현", "논현역"] },
  { code: "POI038", name: "신도림역", aliases: ["신도림"] },
  { code: "POI039", name: "신림역", aliases: ["신림역"] },
  { code: "POI040", name: "신촌·이대역", aliases: ["신촌역", "이대역"] },
  { code: "POI041", name: "양재역", aliases: ["양재역"] },
  { code: "POI042", name: "역삼역", aliases: ["역삼역"] },
  { code: "POI043", name: "연신내역", aliases: ["연신내"] },
  { code: "POI044", name: "오목교역·목동운동장", aliases: ["오목교"] },
  { code: "POI045", name: "왕십리역", aliases: ["왕십리"] },
  { code: "POI046", name: "용산역", aliases: ["용산역"] },
  { code: "POI047", name: "이태원역", aliases: ["이태원역"] },
  { code: "POI048", name: "장지역", aliases: ["장지역"] },
  { code: "POI049", name: "장한평역", aliases: ["장한평"] },
  { code: "POI050", name: "천호역", aliases: ["천호역"] },
  { code: "POI051", name: "총신대입구(이수)역", aliases: ["총신대입구", "이수역"] },
  { code: "POI052", name: "충정로역", aliases: ["충정로"] },
  { code: "POI053", name: "합정역", aliases: ["합정역"] },
  { code: "POI054", name: "혜화역", aliases: ["혜화역"] },
  { code: "POI055", name: "홍대입구역(2호선)", aliases: ["홍대입구"] },
  { code: "POI056", name: "회기역", aliases: ["회기역"] },
  { code: "POI117", name: "신정네거리역", aliases: ["신정네거리"] },
  { code: "POI118", name: "잠실새내역", aliases: ["잠실새내"] },
  { code: "POI119", name: "잠실역", aliases: ["잠실역"] }
];

const SEOUL_AREA_HOTSPOTS: Array<{ code: string; name: string; aliases: string[] }> = [
  { code: "POI001", name: "강남 MICE 관광특구", aliases: ["코엑스", "삼성동"] },
  { code: "POI058", name: "가락시장", aliases: ["가락시장"] },
  { code: "POI059", name: "가로수길", aliases: ["가로수길", "신사동"] },
  { code: "POI063", name: "노량진", aliases: ["노량진"] },
  { code: "POI068", name: "성수카페거리", aliases: ["성수동", "성수카페거리"] },
  { code: "POI071", name: "압구정로데오거리", aliases: ["압구정로데오", "압구정동"] },
  { code: "POI072", name: "여의도", aliases: ["여의도"] },
  { code: "POI073", name: "연남동", aliases: ["연남동"] },
  { code: "POI074", name: "영등포 타임스퀘어", aliases: ["영등포", "타임스퀘어"] },
  { code: "POI080", name: "청담동 명품거리", aliases: ["청담동"] },
  { code: "POI084", name: "DMC(디지털미디어시티)", aliases: ["디지털미디어시티", "상암동"] },
  { code: "POI120", name: "잠실롯데타워·석촌호수", aliases: ["롯데타워", "석촌호수"] }
];

function resolveSeoulHotspot(displayName: string, places: LivePlace[]) {
  const direct = SEOUL_AREA_HOTSPOTS.find(area => area.aliases.some(alias => displayName.includes(alias)));
  if (direct) return { ...direct, latitude: undefined, longitude: undefined, distanceMeters: 0 };
  const transit = places.filter(place => place.kind === "transit").sort((a, b) => a.distanceMeters - b.distanceMeters);
  for (const place of transit) {
    const hotspot = SEOUL_STATION_HOTSPOTS.find(item => item.aliases.some(alias => place.name.includes(alias)));
    if (hotspot && place.distanceMeters <= 3000) {
      return { ...hotspot, latitude: place.latitude, longitude: place.longitude, distanceMeters: place.distanceMeters };
    }
  }
  const addressStation = SEOUL_STATION_HOTSPOTS.find(item => item.aliases.some(alias => displayName.includes(alias)));
  return addressStation ? { ...addressStation, latitude: undefined, longitude: undefined, distanceMeters: 0 } : undefined;
}

function commerceScore(level: string) {
  if (/피크|매우|활발/.test(level)) return 92;
  if (/바쁜|붐빔/.test(level)) return 82;
  if (/보통/.test(level)) return 68;
  if (/한산|여유/.test(level)) return 48;
  return 60;
}

async function fetchSeoulRealtime(displayName: string, latitude: number, longitude: number, places: LivePlace[]): Promise<SeoulRealtime | undefined> {
  const key = process.env.SEOUL_OPEN_DATA_API_KEY;
  if (!key || !displayName.includes("서울")) return undefined;
  const hotspot = resolveSeoulHotspot(displayName, places);
  if (!hotspot) return undefined;
  try {
    const endpoint = (service: string) => `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/${service}/1/5/${hotspot.code}`;
    const [populationResponse, commerceResponse] = await Promise.all([
      fetch(endpoint("citydata_ppltn"), { cache: "no-store", signal: AbortSignal.timeout(8000) }),
      fetch(endpoint("citydata_cmrcl"), { cache: "no-store", signal: AbortSignal.timeout(8000) })
    ]);
    const populationData = populationResponse.ok ? await populationResponse.json() : null;
    const commerceData = commerceResponse.ok ? await commerceResponse.json() : null;
    const population = populationData?.["SeoulRtd.citydata_ppltn"]?.[0];
    if (!population || !Number.isFinite(Number(population.AREA_PPLTN_MIN))) return undefined;
    const commerce = commerceData?.LIVE_CMRCL_STTS;
    const anchorLatitude = Number.isFinite(hotspot.latitude) ? Number(hotspot.latitude) : latitude;
    const anchorLongitude = Number.isFinite(hotspot.longitude) ? Number(hotspot.longitude) : longitude;
    const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
    return {
      source: "서울 실시간 도시데이터",
      areaName: population.AREA_NM || hotspot.name,
      areaCode: population.AREA_CD || hotspot.code,
      coverage: "서울 주요장소",
      anchorLatitude,
      anchorLongitude,
      distanceMeters: hotspot.distanceMeters,
      currentMin: number(population.AREA_PPLTN_MIN),
      currentMax: number(population.AREA_PPLTN_MAX),
      congestionLevel: population.AREA_CONGEST_LVL || "정보 없음",
      congestionMessage: population.AREA_CONGEST_MSG || "",
      measuredAt: population.PPLTN_TIME || "",
      maleRate: number(population.MALE_PPLTN_RATE),
      femaleRate: number(population.FEMALE_PPLTN_RATE),
      residentRate: number(population.RESNT_PPLTN_RATE),
      nonResidentRate: number(population.NON_RESNT_PPLTN_RATE),
      ageRates: Object.fromEntries([0, 10, 20, 30, 40, 50, 60, 70].map(age => [`${age}대${age === 0 ? " 이하" : ""}`, number(population[`PPLTN_RATE_${age}`])])),
      forecasts: (Array.isArray(population.FCST_PPLTN) ? population.FCST_PPLTN : []).slice(0, 8).map((item: Record<string, unknown>) => ({
        time: String(item.FCST_TIME || ""), min: number(item.FCST_PPLTN_MIN), max: number(item.FCST_PPLTN_MAX), congestionLevel: String(item.FCST_CONGEST_LVL || "")
      })),
      commerce: commerce ? {
        level: String(commerce.AREA_CMRCL_LVL || "정보 없음"),
        measuredAt: String(commerce.CMRCL_TIME || ""),
        paymentActivityIndex: Number.isFinite(Number(commerce.AREA_SH_PAYMENT_CNT)) ? Number(commerce.AREA_SH_PAYMENT_CNT) : null
      } : undefined
    };
  } catch {
    return undefined;
  }
}

async function fetchSgisDemographics(address: string): Promise<Demographics | undefined> {
  const consumerKey = process.env.SGIS_CONSUMER_KEY;
  const consumerSecret = process.env.SGIS_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) return undefined;
  try {
    const authUrl = new URL("https://sgisapi.mods.go.kr/OpenAPI3/auth/authentication.json");
    authUrl.searchParams.set("consumer_key", consumerKey);
    authUrl.searchParams.set("consumer_secret", consumerSecret);
    const authResponse = await fetch(authUrl, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    const auth = authResponse.ok ? await authResponse.json() : null;
    const accessToken = auth?.result?.accessToken;
    if (!accessToken) return undefined;

    const geocodeUrl = new URL("https://sgisapi.mods.go.kr/OpenAPI3/addr/geocode.json");
    geocodeUrl.searchParams.set("accessToken", accessToken);
    geocodeUrl.searchParams.set("address", address);
    geocodeUrl.searchParams.set("resultcount", "1");
    const geocodeResponse = await fetch(geocodeUrl, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    const geocode = geocodeResponse.ok ? await geocodeResponse.json() : null;
    const matched = geocode?.result?.resultdata?.[0];
    const administrativeCode = String(matched?.adm_cd || "").slice(0, 8);
    if (administrativeCode.length < 5) return undefined;

    const makeStatsUrl = (path: string) => {
      const url = new URL(`https://sgisapi.mods.go.kr/OpenAPI3/stats/${path}.json`);
      url.searchParams.set("accessToken", accessToken);
      url.searchParams.set("year", "2024");
      url.searchParams.set("adm_cd", administrativeCode);
      url.searchParams.set("low_search", "0");
      return url;
    };
    const [populationResponse, companyResponse] = await Promise.all([
      fetch(makeStatsUrl("population"), { cache: "no-store", signal: AbortSignal.timeout(7000) }),
      fetch(makeStatsUrl("company"), { cache: "no-store", signal: AbortSignal.timeout(7000) })
    ]);
    const populationData = populationResponse.ok ? await populationResponse.json() : null;
    const companyData = companyResponse.ok ? await companyResponse.json() : null;
    const population = populationData?.result?.[0];
    const company = companyData?.result?.[0];
    if (!population && !company) return undefined;
    const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
    return {
      source: "SGIS",
      year: 2024,
      areaName: population?.adm_nm || company?.adm_nm || matched?.adm_nm || matched?.sgg_nm || "선택 행정구역",
      administrativeCode,
      residentPopulation: number(population?.tot_ppltn),
      workerPopulation: number(company?.tot_worker || population?.employee_cnt),
      households: number(population?.tot_family),
      businesses: number(company?.corp_cnt || population?.corp_cnt),
      averageAge: Number.isFinite(Number(population?.avg_age)) ? Number(population.avg_age) : null
    };
  } catch {
    return undefined;
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
  const [hospital, specialtyHospital, pharmacy, transit, parking] = await Promise.all([
    kakaoSearchComplete(key, "HP8", "hospital", latitude, longitude, radius),
    kakaoSearchComplete(key, "HP8", "hospital", latitude, longitude, radius, specialty === "기타" ? "병원" : specialty),
    kakaoSearchComplete(key, "PM9", "pharmacy", latitude, longitude, radius),
    kakaoSearch(key, "SW8", "transit", latitude, longitude, radius),
    kakaoSearch(key, "PK6", "parking", latitude, longitude, radius)
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

function buildAnalysis(provider: "kakao" | "openstreetmap", displayName: string, latitude: number, longitude: number, specialty: Specialty, radiusMeters: number, places: LivePlace[], providerTotals?: LocationAnalysis["counts"], countLimits?: LocationAnalysis["countLimits"], demographics?: Demographics, seoulRealtime?: SeoulRealtime): LocationAnalysis {
  const medical = places.filter(place => place.kind === "hospital");
  const matching = medical.filter(place => matchesSpecialty(place.name, place.specialty, specialty));
  const displayedCounts = {
    medical: medical.length,
    matchingSpecialty: matching.length,
    pharmacy: places.filter(place => place.kind === "pharmacy").length,
    transit: places.filter(place => place.kind === "transit").length,
    parking: places.filter(place => place.kind === "parking").length
  };
  const counts = providerTotals || displayedCounts;
  const { pharmacy, transit, parking } = counts;
  const densityFactor = radiusMeters <= 500 ? 6 : radiusMeters <= 1000 ? 4 : 2;
  const competitionBase = clamp(94 - (counts.matchingSpecialty || counts.medical * .35) * densityFactor);
  const competition = provider === "openstreetmap" && counts.matchingSpecialty === 0 ? Math.min(72, competitionBase) : competitionBase;
  const access = clamp(42 + Math.min(transit, 14) * 3 + Math.min(parking, 8) * 2 + Math.min(pharmacy, 10), 0, 92);
  const demand = demographics ? clamp(38 + (demographics.residentPopulation + demographics.workerPopulation * .55) / 1600) : null;
  const consumer = seoulRealtime?.commerce ? commerceScore(seoulRealtime.commerce.level) : null;
  const scoreFactors = [competition, access, demand, consumer].filter((value): value is number => value !== null);
  const observedScore = Math.round(scoreFactors.reduce((sum, value) => sum + value, 0) / scoreFactors.length);
  const confidence = clamp((provider === "kakao" ? 66 : 42) + Math.min(places.length, 30) * .7 + (demographics ? 8 : 0) + (seoulRealtime ? 6 : 0) + (seoulRealtime?.commerce ? 3 : 0), 35, provider === "kakao" ? 97 : 80);
  const grade = observedScore >= 85 ? "A" : observedScore >= 75 ? "B+" : observedScore >= 65 ? "B" : "C";
  const metrics = [
    { label: "잠재환자 수요", value: demand, note: demographics ? `${demographics.areaName} 인구·종사자` : "인구 데이터 연동 필요", color: COLORS[0] },
    { label: "경쟁환경", value: competition, note: `동일 진료과 검색 ${counts.matchingSpecialty}곳`, color: COLORS[1] },
    { label: "소비력", value: consumer, note: seoulRealtime?.commerce ? `${seoulRealtime.areaName} 상권 활력 ${seoulRealtime.commerce.level}` : "소비 데이터 연동 필요", color: COLORS[2] },
    { label: "접근성", value: access, note: `지하철역 ${transit} · 주차 ${parking}`, color: COLORS[3] },
    { label: "비용효율", value: null, note: "임대료 데이터 연동 필요", color: COLORS[4] },
    { label: "성장성", value: null, note: "개발계획 데이터 연동 필요", color: COLORS[5] }
  ];
  const strengths = [
    demographics ? `${demographics.areaName} 거주인구 ${demographics.residentPopulation.toLocaleString()}명 · 종사자 ${demographics.workerPopulation.toLocaleString()}명` : "주변 의료기관을 실제 지도에서 확인 가능",
    transit >= 2 ? `반경 내 지하철역 검색 ${transit}곳` : "주변 의료기관을 실제 지도에서 확인 가능",
    pharmacy >= 3 ? `주변 약국 ${pharmacy}곳으로 의료상권 형성` : `가까운 약국 ${pharmacy}곳 확인`,
    competition >= 75 ? `선택 진료과 표식 경쟁이 비교적 낮음` : "경쟁병원의 위치와 거리를 직접 확인 가능"
  ];
  const risks = [
    counts.matchingSpecialty >= 8 ? `선택 진료과 검색 ${counts.matchingSpecialty}곳으로 경쟁 주의` : "진료과 분류 누락 가능성 검토 필요",
    demographics ? "SGIS 인구는 행정동 기준으로 반경 데이터와 범위가 다름" : "유동인구·소득·임대료는 아직 점수에 포함되지 않음",
    provider === "openstreetmap" ? "OpenStreetMap 등록 범위에 따라 누락 가능" : "공개 장소 데이터 기준으로 실제 운영정보 확인 필요"
  ];
  return {
    mode: "live", provider, analyzedAt: new Date().toISOString(),
    location: { displayName, latitude, longitude }, specialty, radiusMeters,
    places, counts, displayedCounts, countLimits,
    metrics, observedScore, grade, confidence,
    insight: `${displayName.split(",")[0]} 반경 ${radiusMeters.toLocaleString()}m에서 의료기관 ${counts.medical}${countLimits?.medical ? "곳 이상" : "곳"}과 ${specialty} 관련 검색결과 ${counts.matchingSpecialty}${countLimits?.matchingSpecialty ? "곳 이상" : "곳"}을 확인했습니다.${demographics ? ` SGIS ${demographics.year}년 기준 ${demographics.areaName}의 거주인구는 ${demographics.residentPopulation.toLocaleString()}명, 종사자는 ${demographics.workerPopulation.toLocaleString()}명입니다.` : ""}${seoulRealtime ? ` 가장 가까운 서울 실시간 데이터 지원장소인 ${seoulRealtime.areaName}의 현재 인구는 ${seoulRealtime.currentMin.toLocaleString()}~${seoulRealtime.currentMax.toLocaleString()}명, 혼잡도는 ${seoulRealtime.congestionLevel}입니다.` : ""} 현재 점수는 연결된 공개 데이터만 반영한 베타 관측점수이며, 임대료·개폐업·개발계획 데이터가 모두 연결되기 전에는 개원 의사결정의 단독 근거로 사용하면 안 됩니다.`,
    strengths, risks,
    limitations: ["공개 지도 데이터의 등록·갱신 시점에 따라 실제 현황과 차이가 날 수 있습니다.", demographics ? "SGIS 인구·사업체 통계는 행정동 단위이며 선택 반경과 정확히 일치하지 않습니다." : "인구·매출·임대료·개폐업 데이터는 별도 공공데이터 인증키 연결 후 제공됩니다."],
    demographics, seoulRealtime
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
    if (Array.isArray(body.osmElements) && body.osmElements.length <= 1500) {
      places = normalizeOsmElements(body.osmElements, latitude, longitude);
    } else if (kakaoKey) {
      const kakao = await fetchKakaoPlaces(kakaoKey, latitude, longitude, radiusMeters, specialty);
      places = kakao.places;
      providerTotals = kakao.totals;
      countLimits = kakao.limits;
    } else if (process.env.VERCEL) {
      needsClientFetch = true;
    } else {
      try { places = await fetchOsmPlaces(latitude, longitude, radiusMeters); }
      catch { needsClientFetch = true; }
    }
    const [demographics, seoulRealtime] = await Promise.all([
      fetchSgisDemographics(displayName),
      fetchSeoulRealtime(displayName, latitude, longitude, places)
    ]);
    const analysis = buildAnalysis(kakaoKey ? "kakao" : "openstreetmap", displayName, latitude, longitude, specialty, radiusMeters, places, providerTotals, countLimits, demographics, seoulRealtime);
    return NextResponse.json({ ...analysis, needsClientFetch, osmQuery: needsClientFetch ? buildOsmQuery(latitude, longitude, radiusMeters) : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
