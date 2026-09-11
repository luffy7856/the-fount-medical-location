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
  dataset: "Spop250mLocalResdDong" | "SPOP_DAILYSUM_JACHI_250";
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

export type GrowthForecastPoint = {
  year: number;
  kind: "observed" | "projected";
  residentPopulation: number;
  workerPopulation: number;
  businesses: number;
};

export type GrowthForecast = {
  status: "available" | "insufficient_data" | "not_configured" | "error";
  source: "SGIS";
  model: "최근 3개년 선형 추세 외삽";
  areaName: string;
  baseYear: number;
  forecastYears: number[];
  historical: GrowthForecastPoint[];
  projected: GrowthForecastPoint[];
  annualChange: {
    residentPopulation: number;
    workerPopulation: number;
    businesses: number;
  };
  growthScore?: number;
  message: string;
};

export type ExternalDataStatus = "available" | "not_configured" | "unsupported" | "no_data" | "error";

export type DataConnection = {
  id: "sgis" | "living" | "hira" | "consumer" | "rent" | "development";
  label: string;
  status: ExternalDataStatus;
  source: string;
  message: string;
  requiredEnvironmentVariables: string[];
  setupUrl: string;
  referenceDate?: string;
  spatialUnit?: string;
};

export type HiraMedicalData = {
  status: ExternalDataStatus;
  source: "건강보험심사평가원 병원정보서비스";
  referenceDate: string;
  radiusMeters: number;
  medicalCount?: number;
  matchingSpecialtyCount?: number;
  pharmacyCount?: number;
  message: string;
};

export type ConsumerPowerData = {
  status: ExternalDataStatus;
  source: "서울시 상권분석서비스(소비-행정동)";
  spatialUnit: "행정동";
  administrativeCode?: string;
  areaName?: string;
  referencePeriod?: string;
  totalConsumptionWon?: number;
  percentile?: number;
  medicalConsumptionWon?: number;
  medicalPercentile?: number;
  score?: number;
  message: string;
};

export type RentMarketData = {
  status: ExternalDataStatus;
  source: string;
  spatialUnit: string;
  referenceDate?: string;
  sampleCount?: number;
  monthlyRentPerPyeongManwon?: number;
  medianDepositManwon?: number;
  score?: number;
  message: string;
};

export type DevelopmentPlanItem = {
  id: string;
  name: string;
  category: string;
  status: string;
  distanceMeters?: number;
  targetDate?: string;
};

export type DevelopmentPlanData = {
  status: ExternalDataStatus;
  source: string;
  referenceDate?: string;
  radiusMeters: number;
  plans: DevelopmentPlanItem[];
  score?: number;
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
  growthForecast?: GrowthForecast;
  dataConnections?: DataConnection[];
  hiraMedical?: HiraMedicalData;
  consumerPower?: ConsumerPowerData;
  rentMarket?: RentMarketData;
  developmentPlans?: DevelopmentPlanData;
  needsClientFetch?: boolean;
  osmQuery?: string;
};
