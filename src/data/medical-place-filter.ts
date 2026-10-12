/** Only patient-facing human medical institutions, never name-only commercial matches. */
export function isHumanMedicalPlace(name: string, category?: string) {
  const text = `${name} ${category || ""}`;
  if (/동물병원|수의|탕전실|병원부속시설|기공소|치과기공|의료기기|의료보조기구|신협|은행|협회|학원|장례|입원실/.test(text)) return false;
  if (category?.trim()) {
    return /(?:^|>)\s*(?:병원|의원|한의원|한방병원|치과|치과의원|치과병원)(?:\s*>|\s*$)/.test(category)
      || /^(?:hospital|clinic|doctors|dentist)$/i.test(category.trim());
  }
  return /(?:의원|병원)(?:\s|$)/.test(name);
}
