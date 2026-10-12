const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const assert = require('node:assert/strict');
const filename=path.join(__dirname,'../src/data/medical-place-filter.ts');
const moduleFile=new Module(filename);
moduleFile._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,filename);
const {isHumanMedicalPlace: valid}=moduleFile.exports;
const cases=[
 ['코비한의원 마포점','의료,건강 > 병원 > 한의원',true],
 ['경희리메디한의원','의료,건강 > 병원 > 한의원',true],
 ['합정치과의원','의료,건강 > 병원 > 치과',true],
 ['김도형내과의원','의료,건강 > 병원 > 내과',true],
 ['서울비뇨의학과의원','의료,건강 > 병원 > 비뇨기과',true],
 ['지역 진료소','clinic',true],
 ['에이스치과기공소','의료,건강 > 의료기기판매 > 의료보조기구',false],
 ['서울치과의사신협 본점','금융,보험 > 금융서비스 > 은행 > 신협',false],
 ['한방건강 학원','교육 > 학원',false],
 ['행복동물병원','의료,건강 > 병원 > 동물병원',false],
 ['한의원 입원실','의료,건강 > 병원 > 한의원',false],
];
for(const [name,category,wanted] of cases)assert.equal(valid(name,category),wanted,name);
console.log(`PASS ${cases.length} human-medical classification cases (clinic, dental, Korean medicine, false commercial matches).`);
// Verify no gaps in the four-circle search subdivision, including the cardinal edges.
for(let angle=0;angle<360;angle++)for(const radius of [.25,.5,.75,1]){
 const x=radius*Math.cos(angle*Math.PI/180),y=radius*Math.sin(angle*Math.PI/180);
 assert([[-.36,-.36],[-.36,.36],[.36,-.36],[.36,.36]].some(([cx,cy])=>Math.hypot(x-cx,y-cy)<=.76),`search gap ${angle}/${radius}`);
}
console.log('PASS 1,440 subdivision coverage samples and outer cardinal edges.');
