const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {clinicalDemand,refineClinicalAnalysis,competitorStrength,clinicalScoreLabel} = require('../src/data/clinical-evaluation.ts');
const base = { provider:'kakao',specialty:'피부과',location:{displayName:'서울 강남구'},
  demographics:{residentPopulation:20000},regionalProfile:{youngAdultPopulation:8000,middleAgePopulation:6000},
  counts:{matchingSpecialty:2},places:[1,2].map(id=>({id:String(id),name:'피부과'+id,specialty:'피부과',kind:'hospital',medicalCapacity:{doctorCount:1,institutionType:'의원'}})),
  metrics:['잠재환자 수요','경쟁환경','소비력','접근성','비용효율','성장성'].map(label=>({label,value:80})) };
const result = refineClinicalAnalysis(base);
const big = refineClinicalAnalysis({...base,places:base.places.map(p=>({...p,medicalCapacity:{doctorCount:8,institutionType:'의원'}}))});
assert(big.observedScore < result.observedScore);
const sparse = refineClinicalAnalysis({...base,regionalProfile:{youngAdultPopulation:100,middleAgePopulation:100}});
assert(sparse.observedScore <= 35);
assert(sparse.metrics.find(m=>m.label==='경쟁환경').value <= 10);
assert.equal(clinicalDemand({...base,regionalProfile:{youngAdultPopulation:0,middleAgePopulation:0}}).target,0);
assert.equal(refineClinicalAnalysis({...base,regionalProfile:undefined}).grade,'—');
assert.equal(refineClinicalAnalysis({...base,location:{displayName:'부산 해운대'}}).grade,'—');
assert.notEqual(refineClinicalAnalysis({...base,countLimits:{matchingSpecialty:true}}).grade,'—');
assert.equal(competitorStrength({medicalCapacity:{doctorCount:100,institutionType:'종합병원'}}),1);
assert.deepEqual(refineClinicalAnalysis(result),result);
const incomplete = refineClinicalAnalysis({...base,countLimits:{matchingSpecialty:true}});
assert(incomplete.scoreRange);
assert(incomplete.metrics.find(m=>m.label==='경쟁환경').value <= 15);
assert.match(clinicalScoreLabel(incomplete),/^\d+$/);
const lostRent = refineClinicalAnalysis({...base,metrics:base.metrics.map(m=>m.label==='비용효율'?{...m,value:null}:m)});
assert(lostRent.scoreRange.lower <= result.observedScore);
assert(lostRent.scoreRange.upper >= result.observedScore);
assert.match(clinicalScoreLabel(lostRent),/^\d+$/);
assert.equal(clinicalScoreLabel(lostRent),String(lostRent.observedScore));
assert.equal(refineClinicalAnalysis({...base,livingPopulation:{status:'available',spatialUnit:'250m 격자',total:1}}).observedScore,result.observedScore);
assert.deepEqual(refineClinicalAnalysis(incomplete),incomplete);
assert.equal(refineClinicalAnalysis({...base,regionalProfile:undefined}).scoreRange,undefined);
console.log('PASS: sparse demand, large competitors, missing ages, zero ages, geography, truncated results, idempotence');
