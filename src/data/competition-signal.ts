/** A conservative map-search signal, not a prediction of market share. */
export function competitionSignal(
  matchingSpecialty: number,
  medicalFacilities: number,
  radiusMeters: number,
  provider: 'kakao' | 'openstreetmap',
  officialMedicalCountAvailable: boolean,
): number | null {
  if (matchingSpecialty < 0 || medicalFacilities < 0 || radiusMeters <= 0) return null;
  if (provider === 'openstreetmap' && matchingSpecialty === 0) return null;
  if (matchingSpecialty === 0 && medicalFacilities === 0 && !officialMedicalCountAvailable) return null;
  const distanceWeight = radiusMeters <= 500 ? 6 : radiusMeters <= 1000 ? 4 : 2;
  const base = Math.max(0, Math.min(100, Math.round(94 - matchingSpecialty * distanceWeight)));
  if (matchingSpecialty === 0) return Math.min(80, base);
  return base;
}
