import LocationLab from "@/components/location-lab";

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": "https://www.thefount.co.kr/location#application",
  name: "THE FOUNT Clinic Location Lab",
  alternateName: "더파운트 병원 입지분석",
  url: "https://www.thefount.co.kr/location",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  inLanguage: "ko-KR",
  isAccessibleForFree: true,
  description:
    "주소와 진료과를 기반으로 병원 개원 예정지의 잠재환자 수요, 경쟁환경, 소비력, 접근성, 비용효율, 성장성과 개원 수익성을 분석하는 더파운트 서비스",
  featureList: [
    "진료과별 병원 입지점수",
    "경쟁병원 및 의료기관 분석",
    "생활인구와 접근성 분석",
    "3년 지역 전망",
    "개원 수익성 분석",
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
    </>
  );
}
