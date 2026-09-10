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

export type LivingPopulationStatus = "available" | "not_configured" | "unsupported" | "no_data" | "error";

export type LivingPopulation = {
  status: LivingPopulationStatus;
  source: "서울특별시 서울 생활인구";
  dataset: "Spop250mLocalResdDong";
  spatialUnit: "행정동";
  supportedRegion: "서울특별시";
  referenceDate?: string;
  hour?: number;
  administrativeCode?: string;
  total?: number;
  male?: number;
  female?: number;
  message: string;
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
  livingPopulation?: LivingPopulation;
  needsClientFetch?: boolean;
  osmQuery?: string;
};
