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
  return { places, isTruncated: last.meta?.is_end === false };
}

async function fetchKakaoPlaces(key: string, latitude: number, longitude: number, radius: number, specialty: Specialty) {
  const [hospital, specialtyHospital, pharmacy, transit, parking] = await Promise.all([
    kakaoSearch(key, "HP8", "hospital", latitude, longitude, radius),
    kakaoSearch(key, "HP8", "hospital", latitude, longitude, radius, specialty === "기타" ? "병원" : specialty),
    kakaoSearch(key, "PM9", "pharmacy", latitude, longitude, radius),
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

function buildAnalysis(provider: "kakao" | "openstreetmap", displayName: string, latitude: number, longitude: number, specialty: Specialty, radiusMeters: number, places: LivePlace[], providerTotals?: LocationAnalysis["counts"], countLimits?: LocationAnalysis["countLimits"]): LocationAnalysis {
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
  const observedScore = Math.round((competition + access) / 2);
  const confidence = clamp((provider === "kakao" ? 66 : 42) + Math.min(places.length, 30) * .7, 35, provider === "kakao" ? 88 : 68);
  const grade = observedScore >= 85 ? "A" : observedScore >= 75 ? "B+" : observedScore >= 65 ? "B" : "C";
  const metrics = [
    { label: "잠재환자 수요", value: null, note: "인구 데이터 연동 필요", color: COLORS[0] },
    { label: "경쟁환경", value: competition, note: `동일 진료과 검색 ${counts.matchingSpecialty}곳`, color: COLORS[1] },
    { label: "소비력", value: null, note: "소비 데이터 연동 필요", color: COLORS[2] },
    { label: "접근성", value: access, note: `지하철역 ${transit} · 주차 ${parking}`, color: COLORS[3] },
    { label: "비용효율", value: null, note: "임대료 데이터 연동 필요", color: COLORS[4] },
    { label: "성장성", value: null, note: "개발계획 데이터 연동 필요", color: COLORS[5] }
  ];
  const strengths = [
    transit >= 2 ? `반경 내 지하철역 검색 ${transit}곳` : "주변 의료기관을 실제 지도에서 확인 가능",
    pharmacy >= 3 ? `주변 약국 ${pharmacy}곳으로 의료상권 형성` : `가까운 약국 ${pharmacy}곳 확인`,
    competition >= 75 ? `선택 진료과 표식 경쟁이 비교적 낮음` : "경쟁병원의 위치와 거리를 직접 확인 가능"
  ];
  const risks = [
    counts.matchingSpecialty >= 8 ? `선택 진료과 검색 ${counts.matchingSpecialty}곳으로 경쟁 주의` : "진료과 분류 누락 가능성 검토 필요",
    "유동인구·소득·임대료는 아직 점수에 포함되지 않음",
    provider === "openstreetmap" ? "OpenStreetMap 등록 범위에 따라 누락 가능" : "공개 장소 데이터 기준으로 실제 운영정보 확인 필요"
  ];
  return {
    mode: "live", provider, analyzedAt: new Date().toISOString(),
    location: { displayName, latitude, longitude }, specialty, radiusMeters,
    places, counts, displayedCounts, countLimits,
    metrics, observedScore, grade, confidence,
    insight: `${displayName.split(",")[0]} 반경 ${radiusMeters.toLocaleString()}m에서 의료기관 ${counts.medical}${countLimits?.medical ? "곳 이상" : "곳"}과 ${specialty} 관련 검색결과 ${counts.matchingSpecialty}${countLimits?.matchingSpecialty ? "곳 이상" : "곳"}을 확인했습니다. 카카오 장소검색 상한에 도달한 항목은 최소 확인 개수로 표시합니다. 현재 점수는 경쟁환경과 지하철·주차 접근성만 반영한 베타 관측점수이며, 유동인구·소비력·임대료 데이터가 연결되기 전에는 개원 의사결정의 단독 근거로 사용하면 안 됩니다.`,
    strengths, risks,
    limitations: ["공개 지도 데이터의 등록·갱신 시점에 따라 실제 현황과 차이가 날 수 있습니다.", "인구·매출·임대료·개폐업 데이터는 별도 공공데이터 인증키 연결 후 제공됩니다."]
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
    const analysis = buildAnalysis(kakaoKey ? "kakao" : "openstreetmap", displayName, latitude, longitude, specialty, radiusMeters, places, providerTotals, countLimits);
    return NextResponse.json({ ...analysis, needsClientFetch, osmQuery: needsClientFetch ? buildOsmQuery(latitude, longitude, radiusMeters) : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
