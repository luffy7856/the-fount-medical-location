import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const title = "병원 입지분석 | AI 병원 상권분석 | THE FOUNT";
const description =
  "병원 개원 예정지를 입력하면 실제 공개 지도 데이터를 조회해 주변 의료기관, 약국, 대중교통, 주차시설과 진료과별 경쟁환경을 확인할 수 있습니다.";

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "병원 입지분석", "병원 상권분석", "병원 개원", "개원 입지", "병원 개원 컨설팅",
    "개원 예정지 분석", "병원 유동인구", "병원 경쟁분석", "병원 개원 타당성",
    "피부과 입지", "정형외과 입지", "내과 입지", "소아과 입지", "병원 개원 비용"
  ],
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ko_KR",
    siteName: "THE FOUNT Clinic Location Lab"
  },
  twitter: { card: "summary", title, description },
  robots: { index: true, follow: true }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
