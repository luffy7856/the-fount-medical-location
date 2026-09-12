# THE FOUNT Medical Location

병원 개원을 준비하는 원장님을 위한 지도 기반 AI 입지·상권 분석 웹앱입니다.

현재 버전은 주소 좌표, 주변 의료기관, 약국, 대중교통, 주차시설, SGIS 인구·사업체 통계와 서울시 시간대별 생활인구를 실제 공개 데이터에서 조회합니다. Kakao Local REST API 키가 없으면 OpenStreetMap/Nominatim/Overpass를 제한적 베타 데이터 소스로 사용합니다. 실제 데이터가 연결되지 않은 소득·임대료·개폐업·개발계획 항목은 임의의 데모 숫자를 표시하지 않습니다. SGIS 3년 전망은 최근 6개년 중 응답 가능한 최신 3개년을 사용하며, 2개년 미만이면 전망을 생성하지 않습니다.

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

## 정밀 데이터 공급자 연결

- HIRA 공식 의료기관: `HIRA_SERVICE_KEY`를 등록하면 병원정보서비스의 반경별 공식 수치를 우선 사용합니다. 지도 마커와 장소명은 Kakao를 계속 사용해 출처를 분리합니다.
- 서울 소비력: 기존 `SEOUL_OPEN_DATA_API_KEY`를 사용합니다. 공식 서비스명 `VwsmAdstrdNcmCnsmpW`를 기본값으로 사용하며, 행정동 총지출 백분위 60%와 의료비 지출 백분위 40%를 소비력 참고점수에 반영합니다.
- 상가 임대료: 기본적으로 한국부동산원 R-ONE의 분기별 중대형 상가 임대료 공표값을 서버에서 조회합니다. 단위 `천원/㎡`를 `만원/평`으로 명시적으로 환산하고, 화면에는 공표 상권 또는 시·도와 `중대형 상가 1층 기준`임을 함께 표시합니다. `RONE_API_KEY`는 선택사항이며, 별도 계약한 반경 단위 임대료 공급자가 있다면 `COMMERCIAL_RENT_API_KEY`, `COMMERCIAL_RENT_API_URL_TEMPLATE`을 등록해 우선 사용할 수 있습니다.
- 개발·계획 공간: `VWORLD_API_KEY`와 승인 도메인을 등록하면 VWorld 2D 데이터 API에서 지구단위계획, LH 사업지구, 주거환경개선지구, 시장정비구역을 직접 조회합니다. 3km 반경은 VWorld 면적 제한에 맞춰 4개 구역으로 나눠 조회합니다. 이 자료는 지정 공간정보이므로 착공·준공 일정이나 사업 확정을 의미하지 않으며 성장성 점수에는 직접 반영하지 않습니다. 일정과 진행상태를 제공하는 별도 공식 공급자가 있다면 기존 `DEVELOPMENT_PLAN_API_URL_TEMPLATE` 방식으로 우선 연결할 수 있습니다.

URL 템플릿은 `{key}`, `{domain}`, `{lat}`, `{lng}`, `{radius}`, `{admCode}`, `{specialty}`, `{minLng}`, `{minLat}`, `{maxLng}`, `{maxLat}`, `{bbox}`를 지원합니다. 키가 URL이 아니라 헤더에 들어가는 공급자는 `*_API_KEY_HEADER`에 정확한 헤더 이름을 지정합니다. 키 값은 서버 환경변수에서만 사용되고 API 응답에는 연결 상태와 필요한 변수 이름만 포함됩니다.

### 승인 후 즉시 활성화 체크리스트

1. 공급자 문서에서 실제 데이터셋과 JSON·GeoJSON 또는 XML 조회 URL을 확인합니다.
2. Vercel Production 환경변수에 승인키, URL 템플릿, 출처명을 등록합니다.
3. 임대료는 금액 단위를 `COMMERCIAL_RENT_VALUE_UNIT`에 명시합니다.
4. 재배포 후 분석 API 응답과 운영 로그에서 공급자별 `status`를 확인합니다. 연결 상태와 승인키 정보는 방문자 화면에 노출하지 않습니다.

VWorld의 지구단위계획·사업지구·정비구역은 계획공간을 탐색하는 공식 참고자료이며, 해당 구역이 곧 확정된 신규 개발사업을 뜻하지는 않습니다. 따라서 일정과 진행상태를 제공하는 별도 공식 데이터만 개발계획 점수에 반영합니다.

서울 생활인구는 최신 `Se250MSpopLocalResd` 서비스의 250m 격자 원자료를 먼저 조회합니다. 서울시 공개 기준처럼 현재 날짜보다 4일 전까지 제공되는 자료를 사용하며, 선택 반경에 포함된 실제 격자값만 합산해 지도 밀도와 수요지표에 반영합니다. 신규 격자 API가 일시적으로 지연될 때만 생산이 종료된 `Spop250mLocalResdDong` 행정동 자료의 마지막 제공일(2026-07-31)로 대체하고, 화면에 공간 단위와 기준일을 함께 표시합니다. 서울 이외 지역이나 키 미설정 상태는 미지원 사유를 그대로 표시합니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 배포

Next.js 프로젝트로 구성되어 GitHub 연동을 통한 Vercel 자동 배포를 지원합니다.
