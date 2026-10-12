// Read-only location analysis; no consultations, accounts, notifications or credentials.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const cases = [
  ['마포 한의원', '서울 마포구 월드컵로3길 14', '한의원'],
  ['마포 치과', '서울 마포구 월드컵로3길 14', '치과'],
  ['마포 내과', '서울 마포구 월드컵로3길 14', '내과'],
  ['강남 한의원', '서울 강남구 테헤란로 152', '한의원'],
  ['부산 한의원', '부산 부산진구 중앙대로 708', '한의원'],
  ['대전 치과', '대전광역시 서구 둔산로 100', '치과'],
];
const base = process.argv[2];
if (!base || !/^https:\/\/(?:[a-z0-9-]+\.vercel\.app|www\.thefount\.co\.kr)$/.test(base)) throw Error('Provide the verified project deployment origin');
const endpoint = base + '/location/api/analyze';
async function request(body) {
  // Authenticated deployment access through the linked Vercel CLI. Never disable protection.
  if (process.env.VERCEL_CLI_JS) {
    const output = await new Promise((resolve,reject) => {
      const child = execFile(process.execPath, [process.env.VERCEL_CLI_JS,'curl','/location/api/analyze','--deployment',base,'--','--request','POST','--header','Content-Type: application/json','--data-binary','@-','--silent','--show-error','--write-out','\nHTTP_STATUS:%{http_code}'], { timeout:110_000,maxBuffer:12_000_000 }, (error,stdout) => error ? reject(error) : resolve(stdout));
      child.stdin.end(JSON.stringify(body));
    });
    const split = output.lastIndexOf('\nHTTP_STATUS:');
    assert(split >= 0,'CLI response status available');
    return {status:Number(output.slice(split+13)),json:async()=>JSON.parse(output.slice(0,split))};
  }
  return fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(90_000)});
}
const wrongNames = new Set(['에이스치과기공소','서울치과의사신협 본점','서울치과의사신협본점','광덕안정한의원 입원실','광덕안정한의원입원실']);
let next=0;
async function worker(){ while(next<cases.length){
  const [label,address,specialty]=cases[next++]; const started=Date.now();
  const r=await request({address,specialty,radiusMeters:500});
  assert.equal(r.status,200,label); const data=await r.json();
  assert.equal(data.specialty,specialty); assert.equal(data.radiusMeters,500);
  assert(data.places.every(p=>p.distanceMeters>=0 && p.distanceMeters<=501),label+' radius');
  assert.equal(new Set(data.places.map(p=>p.id)).size,data.places.length,label+' unique map ids');
  const hospitals=data.places.filter(p=>p.kind==='hospital');
  assert(hospitals.length>0,label+' not a false empty result');
  assert(!hospitals.some(p=>wrongNames.has(p.name)||/치과기공소|치과의사신협|입원실/.test(p.name)),label+' commercial/duplicate facilities');
  const matcher=specialty==='한의원'?/한의원|한방/:specialty==='치과'?/치과/:/내과/;
  const matched=hospitals.filter(p=>matcher.test(p.name+' '+(p.specialty||'')));
  assert(matched.length>0,label+' specialty coverage');
  console.log(JSON.stringify({label,address,specialty,elapsedMs:Date.now()-started,mapMatching:matched.length,hiraMatching:data.hiraMedical?.matchingSpecialtyCount,mapTotal:hospitals.length,mapLimits:data.mapCountLimits,matchingNames:matched.map(p=>p.name)}));
}}
Promise.all([worker(),worker()]).then(async()=>{
  for(const body of [null,[],{latitude:91,longitude:127,specialty:'한의원'}, {latitude:37.5,longitude:null,specialty:'한의원'}]){
    const r=await request(body);
    assert.equal(r.status,400,'invalid body/coordinate validation');
  }
  const unresolved=await request({address:'대전 서구 둔산로 54',specialty:'치과',radiusMeters:500});
  assert.equal(unresolved.status,422,'unresolved address must not return a false empty successful analysis');
  console.log('PASS 6 public geographic/specialty samples + 4 invalid input cases + 1 unresolved-address case. Map/HIRA differences are reported, not treated as identical ground truth.');
}).catch(e=>{console.error(e);process.exitCode=1;});
