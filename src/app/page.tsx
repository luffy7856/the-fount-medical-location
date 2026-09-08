import LocationLab from "@/components/location-lab";

const schema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "THE FOUNT Clinic Location Lab",
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web",
  description:
    "주소를 기반으로 병원 개원 예정지의 잠재수요, 경쟁환경, 소비력, 접근성, 비용효율과 성장성을 분석하는 서비스"
};

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
      <LocationLab />
    </>
  );
}
