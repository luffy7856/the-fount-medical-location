# THE FOUNT Medical Location

병원 개원을 준비하는 원장님을 위한 지도 기반 AI 입지·상권 분석 웹앱입니다.

현재 버전은 주소 좌표, 주변 의료기관, 약국, 대중교통, 주차시설을 실제 공개 데이터에서 조회합니다. Kakao Local REST API 키가 없으면 OpenStreetMap/Nominatim/Overpass를 제한적 베타 데이터 소스로 사용합니다. 실제 데이터가 연결되지 않은 유동인구·소득·임대료·개폐업·개발계획 항목은 임의의 데모 숫자를 표시하지 않습니다.

## 데이터 설정

선택적으로 `.env.local` 또는 Vercel 환경변수에 아래 값을 설정할 수 있습니다.

```text
KAKAO_REST_API_KEY=
NEXT_PUBLIC_MAP_TILE_URL=
```

`KAKAO_REST_API_KEY`를 설정하면 한국 주소 검색과 주변 장소 조회가 Kakao Local API로 전환됩니다. 이 값은 서버에서만 사용하며 브라우저에 노출하지 않습니다. 지도 타일은 기본적으로 OpenStreetMap을 사용하며, 서비스 트래픽이 증가하면 별도 계약한 타일 공급자의 URL을 `NEXT_PUBLIC_MAP_TILE_URL`에 설정해야 합니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 배포

Next.js 프로젝트로 구성되어 GitHub 연동을 통한 Vercel 자동 배포를 지원합니다.
