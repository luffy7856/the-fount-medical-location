export type Specialty = "내과" | "정형외과" | "피부과" | "성형외과" | "소아청소년과" | "치과" | "한의원" | "산부인과" | "안과" | "이비인후과" | "기타";

export type HospitalPoint = {
  id: number;
  name: string;
  specialty: string;
  x: number;
  y: number;
  years: number;
  doctors: number;
  beds: number;
  distance: string;
  strength: "높음" | "중간" | "낮음";
  reviews: number;
  absorption: number;
};

export const specialties: Specialty[] = ["내과", "정형외과", "피부과", "성형외과", "소아청소년과", "치과", "한의원", "산부인과", "안과", "이비인후과", "기타"];

export const hospitals: HospitalPoint[] = [
  { id: 1, name: "리움피부과의원", specialty: "피부과", x: 61, y: 35, years: 12, doctors: 4, beds: 0, distance: "180m", strength: "높음", reviews: 1380, absorption: 86 },
  { id: 2, name: "더맑은피부과", specialty: "피부과", x: 72, y: 48, years: 7, doctors: 3, beds: 0, distance: "320m", strength: "높음", reviews: 824, absorption: 78 },
  { id: 3, name: "연세봄의원", specialty: "피부과", x: 43, y: 51, years: 3, doctors: 2, beds: 0, distance: "410m", strength: "중간", reviews: 412, absorption: 64 },
  { id: 4, name: "강남스킨클리닉", specialty: "피부과", x: 55, y: 68, years: 1, doctors: 2, beds: 0, distance: "570m", strength: "중간", reviews: 219, absorption: 58 },
  { id: 5, name: "서울메디피부과", specialty: "피부과", x: 29, y: 38, years: 9, doctors: 5, beds: 0, distance: "710m", strength: "높음", reviews: 954, absorption: 82 },
  { id: 6, name: "역삼튼튼정형외과", specialty: "정형외과", x: 82, y: 29, years: 6, doctors: 3, beds: 18, distance: "860m", strength: "중간", reviews: 602, absorption: 69 },
  { id: 7, name: "바른내과의원", specialty: "내과", x: 23, y: 65, years: 15, doctors: 4, beds: 10, distance: "920m", strength: "높음", reviews: 711, absorption: 75 }
];

export const layers = [
  { id: "footfall", label: "유동인구", color: "#16a085", defaultOn: true },
  { id: "hospital", label: "경쟁병원", color: "#f26b4a", defaultOn: true },
  { id: "resident", label: "거주인구", color: "#4a8ff0", defaultOn: false },
  { id: "worker", label: "직장인구", color: "#7266e8", defaultOn: false },
  { id: "spending", label: "소비력", color: "#9a63d5", defaultOn: false },
  { id: "apartment", label: "아파트", color: "#3f9ea8", defaultOn: true },
  { id: "building", label: "신축건물", color: "#e4a43d", defaultOn: true },
  { id: "openclose", label: "병원 개폐업", color: "#dc5c73", defaultOn: false },
  { id: "development", label: "개발계획", color: "#2e7bcf", defaultOn: true },
  { id: "transit", label: "교통", color: "#596575", defaultOn: true }
];

export const scoreMetrics = [
  { label: "잠재환자 수요", value: 88, color: "#169e91" },
  { label: "경쟁환경", value: 61, color: "#f26b4a" },
  { label: "소비력", value: 91, color: "#8b66d2" },
  { label: "접근성", value: 86, color: "#3f8fe6" },
  { label: "비용효율", value: 67, color: "#e5a33f" },
  { label: "성장성", value: 84, color: "#347bc6" }
];

export const regionStats = [
  ["잠재환자", "47,820명", "+4.8%"], ["일평균 유동인구", "82,430명", "+2.1%"],
  ["직장인구", "39,210명", "상위 8%"], ["거주인구", "21,180명", "+1.3%"],
  ["동일 진료과", "17개", "+6개 / 3년"], ["최근 3년 폐업", "3개", "보통"],
  ["평균 임대료", "24.8만원/평", "높음"], ["의료소비 추정", "상위 12%", "+3.7%"]
];

export const recommendations: [Specialty, number][] = [["정형외과", 91], ["내과", 86], ["치과", 79], ["피부과", 67], ["소아청소년과", 58]];

export const comparison = [
  ["잠재수요", 88, 77], ["경쟁환경", 61, 82], ["소비력", 91, 76],
  ["접근성", 86, 81], ["비용효율", 67, 83], ["성장성", 84, 88]
];

export const dataSources = ["건강보험심사평가원", "통계청", "행정안전부", "국토교통부", "서울 열린데이터광장", "소상공인시장진흥공단", "교통 관련 공공데이터"];
