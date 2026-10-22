import LocationLab from "@/components/location-lab";

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://www.thefount.co.kr/location#application",
  name: "THE FOUNT MEDICAL LOCATION",
  alternateName: "더파운트 병원 입지분석",
  url: "https://www.thefount.co.kr/location",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ko-KR",
  isAccessibleForFree: true,
  description:
    "주소와 진료과를 기반으로 병원 개원 예정지 주변의 경쟁병원·접근성·지역 인구 통계를 공개 데이터로 확인하고, 입력한 운영조건으로 개원 수익성을 시뮬레이션하는 더파운트 서비스(생활인구·소비 자료는 서울 지역 제공)",
  featureList: [
    "진료과별 병원 입지점수",
    "경쟁병원 및 의료기관 분석",
    "생활인구와 접근성 분석",
    "3년 지역 전망",
    "개원 수익성 시뮬레이션(입력값 기반)",
    "후보지 비교"
  ],
  publisher: {
    "@type": "Organization",
    "@id": "https://www.thefount.co.kr/#organization",
    name: "더파운트 주식회사",
    url: "https://www.thefount.co.kr/"
  },
  offers: { "@type": "Offer", price: "0", priceCurrency: "KRW" }
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <LocationLab />
      <aside style={{ padding: "24px", textAlign: "center", background: "#f5f4ef", color: "#102d3b" }} aria-label="입지분석 사용 안내"><a href="https://www.thefount.co.kr/tools/location">병원 입지분석 사용법·데이터 한계 안내 →</a></aside>
    </>
  );
}
