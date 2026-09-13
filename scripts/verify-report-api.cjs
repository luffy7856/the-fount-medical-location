const fs = require('node:fs');
const assert = require('node:assert/strict');
const { PDFDocument } = require('pdf-lib');
async function main() {
  const base = process.argv[2] || 'http://localhost:3074';
  const payload = JSON.parse(fs.readFileSync('tmp/pdfs/report-test-payload.json', 'utf8'));
  payload.analysis = JSON.parse(fs.readFileSync('tmp/pdfs/live-analysis.json', 'utf8'));
  assert(payload.analysis.places.length > 250, 'Use a dense live analysis to reproduce the regression');
  if(base==='--direct') {
    const ts=require('typescript');
    require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,f);
    const bytes=await require('../src/lib/medical-report.ts').buildMedicalReport(payload.analysis,payload.openingInputs);
    fs.writeFileSync('tmp/pdfs/live-report-verified.pdf', bytes);
    console.log('Direct PDF bytes:', bytes.length);
    assert(bytes.length<4_450_000);
    return;
  }
  const response = await fetch(base + '/api/report', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  if(!response.ok) throw Error(response.status + ': ' + await response.text());
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  const bytes = Buffer.from(await response.arrayBuffer());
  const pdf = await PDFDocument.load(bytes);
  assert(pdf.getPageCount()>1);
  fs.writeFileSync('tmp/pdfs/live-report-verified.pdf', bytes);
  const bad = await fetch(base + '/api/report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  assert.equal(bad.status,400);
  console.log(`PASS ${base}: ${payload.analysis.places.length} live places, ${pdf.getPageCount()} PDF pages, ${bytes.length} bytes; invalid input rejected`);
}
main().catch(e=>{console.error(e);process.exitCode=1;});
