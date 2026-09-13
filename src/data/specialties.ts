export type Specialty = "내과" | "정형외과" | "피부과" | "성형외과" | "소아청소년과" | "치과" | "한의원" | "산부인과" | "안과" | "이비인후과" | "비뇨기과" | "기타";

export const specialties: Specialty[] = ["내과", "정형외과", "피부과", "성형외과", "소아청소년과", "치과", "한의원", "산부인과", "안과", "이비인후과", "비뇨기과", "기타"];

export function matchesSpecialty(name: string, category: string | undefined, specialty: Specialty) {
  if (specialty === "기타") return true;
  const terms: Record<Exclude<Specialty, "기타">, string[]> = {
    내과: ["내과", "internal medicine"], 정형외과: ["정형", "orthopedic", "orthopaedic"],
    피부과: ["피부", "dermatology"], 성형외과: ["성형", "plastic surgery"],
    소아청소년과: ["소아", "pediatric", "paediatric"], 치과: ["치과", "dental", "dentist"],
    한의원: ["한의", "oriental medicine", "korean medicine"], 산부인과: ["산부인", "obstetric", "gynecology", "gynaecology"],
    안과: ["안과", "ophthalmology"], 이비인후과: ["이비인후", "otolaryngology"],
    비뇨기과: ["비뇨", "urology", "urologist"]
  };
  return terms[specialty].some(term => `${name} ${category || ""}`.toLowerCase().includes(term));
}
