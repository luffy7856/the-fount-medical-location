# THE FOUNT Medical Location

병원 개원을 준비하는 원장님을 위한 지도 기반 AI 입지·상권 분석 웹앱입니다.

현재 버전은 주소 좌표, 주변 의료기관, 약국, 대중교통, 주차시설, SGIS 인구·사업체 통계와 서울시 시간대별 생활인구를 실제 공개 데이터에서 조회합니다. Kakao Local REST API 키가 없으면 OpenStreetMap/Nominatim/Overpass를 제한적 베타 데이터 소스로 사용합니다. 실제 데이터가 연결되지 않은 소득·임대료·개폐업·개발계획 항목은 임의의 데모 숫자를 표시하지 않습니다.

## 데이터 설정

선택적으로 `.env.local` 또는 Vercel 환경변수에 아래 값을 설정할 수 있습니다.

```text
KAKAO_REST_API_KEY=
SGIS_CONSUMER_KEY=
SGIS_CONSUMER_SECRET=
SEOUL_OPEN_DATA_API_KEY=
NEXT_PUBLIC_MAP_TILE_URL=
```

`KAKAO_REST_API_KEY`를 설정하면 한국 주소 검색, 행정동 판별과 주변 장소 조회가 Kakao Local API로 전환됩니다. SGIS 키는 거주인구·종사자·가구·사업체 통계에, `SEOUL_OPEN_DATA_API_KEY`는 서울시 생활인구에 사용합니다. 인증값은 모두 서버에서만 사용하며 브라우저에 노출하지 않습니다. 지도 타일은 기본적으로 OpenStreetMap을 사용하며, 서비스 트래픽이 증가하면 별도 계약한 타일 공급자의 URL을 `NEXT_PUBLIC_MAP_TILE_URL`에 설정해야 합니다.

서울 생활인구는 `Spop250mLocalResdDong` 서비스의 행정동 집계값입니다. 지도에서 보이는 원은 행정동의 정확한 경계나 개별 250m 격자를 뜻하지 않고, 선택 위치가 속한 행정동의 시간대별 강도를 표현합니다. 서울 이외 지역이나 키 미설정 상태는 미지원 사유를 화면에 그대로 표시합니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 배포

Next.js 프로젝트로 구성되어 GitHub 연동을 통한 Vercel 자동 배포를 지원합니다.
