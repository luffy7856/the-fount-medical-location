const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, file);
const { locationNarrative } = require('../src/data/location-result.ts');
const { competitionSignal } = require('../src/data/competition-signal.ts');

const base = {
  mode: 'live', provider: 'kakao', analyzedAt: '2026-09-15T00:00:00Z',
  location: { displayName: '예시 동', latitude: 37.5, longitude: 127.03 },
  specialty: '피부과', radiusMeters: 1000, places: [],
  counts: { medical: 12, matchingSpecialty: 6, pharmacy: 4, transit: 2, parking: 2 },
  metrics: [{ label: '경쟁환경', value: 45, note: '예시', color: '#000' }],
  demographics: { source: 'SGIS', year: 2025, areaName: '예시 동', administrativeCode: '00000000', residentPopulation: 28000, workerPopulation: 45000, households: 10000, businesses: 3000, averageAge: 40 },
  regionalProfile: { source: 'SGIS · Kakao Local', year: 2025, areaName: '예시 동', malePopulation: 13500, femalePopulation: 14500, childPopulation: 2800, youngAdultPopulation: 9000, middleAgePopulation: 11200, seniorPopulation: 5000, elementarySchools: 3, childcareFacilities: 8, character: '업무·상업 중심 생활권', characterReason: '직장인 규모가 크고 평일 낮 사람이 모이는 곳입니다.', specialtyFit: [], doctorChecks: [] },
  consumerPower: { status: 'available', percentile: 82, medicalPercentile: 74, source: '예시 자료', referencePeriod: '2025년' },
};
const text = locationNarrative(base).map(section => section.text).join(' ');
assert.match(text, /20~39세 32\.1%/);
assert.match(text, /직장인 방문/);
assert.match(text, /피부과 병원 6곳/);
assert.match(text, /지하철역 2곳/);
assert.match(text, /소비 활동은 비교 지역 중 활발한 편/);
for (const phrase of ['소비총액이 큰 지역이라도', '상가 업종 구성과 아파트 입주율', '두 집계는 서로 겹칠 수', '진료 모델에 맞춰 비교하세요']) assert(!text.includes(phrase));
assert(locationNarrative({ ...base, specialty: '소아청소년과' }).some(section => section.text.includes('소아청소년과에서는 15세 미만 주민')));
assert(locationNarrative({ ...base, demographics: undefined, regionalProfile: undefined }).some(section => section.text.includes('아직 확인하지 못했습니다')));
assert.equal(competitionSignal(0, 0, 1000, 'kakao', false), null);
assert.equal(competitionSignal(0, 12, 1000, 'kakao', false), 80);
assert.equal(competitionSignal(0, 12, 1000, 'openstreetmap', false), null);
assert.equal(competitionSignal(6, 12, 1000, 'kakao', false), 70);
console.log('PASS: place-focused specialty narrative, honest missing data and conservative competition score');
