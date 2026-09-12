import type { LocationAnalysis } from "./location-types";

const STORAGE_KEY = "the-fount-medical-location:analyses:v1";
const MAX_SAVED_ANALYSES = 8;

function isSavedAnalysis(value: unknown): value is LocationAnalysis {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<LocationAnalysis>;
  return item.mode === "live"
    && typeof item.analyzedAt === "string"
    && typeof item.specialty === "string"
    && typeof item.radiusMeters === "number"
    && typeof item.observedScore === "number"
    && Boolean(item.location)
    && typeof item.location?.displayName === "string"
    && Number.isFinite(item.location?.latitude)
    && Number.isFinite(item.location?.longitude)
    && Array.isArray(item.places)
    && Array.isArray(item.metrics);
}

export function analysisStorageId(analysis: LocationAnalysis) {
  const latitude = analysis.location.latitude.toFixed(5);
  const longitude = analysis.location.longitude.toFixed(5);
  return `${latitude}:${longitude}:${analysis.specialty}:${analysis.radiusMeters}`;
}

export function loadSavedAnalyses(): LocationAnalysis[] {
  try {
    const payload = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]") as unknown;
    if (!Array.isArray(payload)) return [];
    return payload.filter(isSavedAnalysis).slice(-MAX_SAVED_ANALYSES);
  } catch {
    return [];
  }
}

export function storeSavedAnalyses(analyses: LocationAnalysis[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(analyses.slice(-MAX_SAVED_ANALYSES)));
  } catch {
    // Private browsing or a full storage quota must not block location analysis.
  }
}

export function mergeSavedAnalysis(analyses: LocationAnalysis[], analysis: LocationAnalysis) {
  const id = analysisStorageId(analysis);
  return [...analyses.filter(item => analysisStorageId(item) !== id), analysis].slice(-MAX_SAVED_ANALYSES);
}
