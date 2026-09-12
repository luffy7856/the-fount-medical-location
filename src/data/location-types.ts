import type { Specialty } from "./specialties";

export type LivePlaceKind = "hospital" | "pharmacy" | "transit" | "parking";

export type LivePlace = {
  id: string;
  name: string;
  kind: LivePlaceKind;
  specialty?: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  address?: string;
  url?: string;
};

export type LiveMetric = {
  label: string;
  value: number | null;
  note: string;
  color: string;
};

export type LocationAnalysis = {
  mode: "live";
  provider: "kakao" | "openstreetmap";
  analyzedAt: string;
  location: {
    displayName: string;
    latitude: number;
    longitude: number;
  };
  specialty: Specialty;
  radiusMeters: number;
  places: LivePlace[];
  counts: {
    medical: number;
    matchingSpecialty: number;
    pharmacy: number;
    transit: number;
    parking: number;
  };
  displayedCounts?: {
    medical: number;
    matchingSpecialty: number;
    pharmacy: number;
    transit: number;
    parking: number;
  };
  countLimits?: {
    medical: boolean;
    matchingSpecialty: boolean;
    pharmacy: boolean;
    transit: boolean;
    parking: boolean;
  };
  metrics: LiveMetric[];
  observedScore: number;
  grade: string;
  confidence: number;
  insight: string;
  strengths: string[];
  risks: string[];
  limitations: string[];
  demographics?: {
    source: "SGIS";
    year: number;
    areaName: string;
    administrativeCode: string;
    residentPopulation: number;
    workerPopulation: number;
    households: number;
    businesses: number;
    averageAge: number | null;
  };
  seoulRealtime?: {
    source: "서울 실시간 도시데이터";
    areaName: string;
    areaCode: string;
    coverage: "서울 주요장소";
    anchorLatitude: number;
    anchorLongitude: number;
    distanceMeters: number;
    currentMin: number;
    currentMax: number;
    congestionLevel: string;
    congestionMessage: string;
    measuredAt: string;
    maleRate: number;
    femaleRate: number;
    residentRate: number;
    nonResidentRate: number;
    ageRates: Record<string, number>;
    forecasts: Array<{
      time: string;
      min: number;
      max: number;
      congestionLevel: string;
    }>;
    commerce?: {
      level: string;
      measuredAt: string;
      paymentActivityIndex: number | null;
    };
  };
  needsClientFetch?: boolean;
  osmQuery?: string;
};
