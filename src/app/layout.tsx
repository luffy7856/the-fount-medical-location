import type { Metadata } from "next";
import Script from "next/script";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./fount-brand.css";
import "./fount-upgrade.css";

const title = "병원 입지분석 | AI 병원 상권분석 | THE FOUNT";
const description =
  "주소와 진료과를 입력하면 주변 경쟁병원·약국·교통 접근성과 지역 인구 통계를 공개 데이터로 확인하고, 입력한 운영조건으로 개원 수익성을 시뮬레이션해 보는 더파운트 병원 입지분석 서비스입니다. 생활인구·소비 자료는 서울 지역에서 제공됩니다.";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.thefount.co.kr"),
  title,
  description,
  alternates: { canonical: "/location" },
  keywords: [
    "더파운트 입지분석", "병원 입지분석", "병원 상권분석", "병원 개원", "개원 입지", "병원 개원 컨설팅",
    "개원 예정지 분석", "병원 유동인구", "병원 경쟁분석", "병원 개원 타당성",
    "피부과 입지", "정형외과 입지", "내과 입지", "소아과 입지", "병원 개원 비용"
  ],
  openGraph: {
    title,
    description,
    type: "website",
    locale: "ko_KR",
    siteName: "THE FOUNT MEDICAL LOCATION",
    url: "/location",
    images: [
      {
        url: "/location/the-fount-medical-location-og.png",
        width: 1740,
        height: 907,
        alt: "도시 지도와 의료 데이터로 병원 개원 후보지를 분석하는 THE FOUNT MEDICAL LOCATION"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/location/the-fount-medical-location-og.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 }
  },
  verification: {
    google: "nRJqHwegymSY3Kz9qBkiObdmdWg4qjIMv4DC6wANwXE",
    other: {
      "naver-site-verification": "5d36589e0005e1b46ae8ef117e2ad741344cc0e0"
    }
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>
        {children}
        <footer className="fount-global-footer"><div><b>THE FOUNT</b><small>MEDICAL PROJECT OFFICE</small></div><nav aria-label="더파운트 공통 링크"><a href="https://www.thefount.co.kr/about">회사소개</a><a href="https://www.thefount.co.kr/insight">Insight</a><a href="https://www.thefount.co.kr/location">입지분석</a><a href="https://www.thefount.co.kr/doctor-finance">Doctor Finance</a><a href="https://www.thefount.co.kr/invest">Investment</a><a href="https://www.thefount.co.kr/privacy">개인정보처리방침</a><a href="https://www.thefount.co.kr/contact">문의</a></nav><span>© 2026 THE FOUNT.</span></footer>
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
            c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
            t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
            y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "yhfxpuy3dj");`}
        </Script>
        <Script src="/location/fount-language.js?v=20261004f" data-common="true" strategy="afterInteractive" />
      </body>
    </html>
  );
}
