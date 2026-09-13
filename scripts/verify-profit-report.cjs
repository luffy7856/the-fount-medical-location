const fs=require('node:fs'),assert=require('node:assert/strict'),ts=require('typescript'),Module=require('node:module'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/components/location-lab.tsx'),'utf8');
const start=source.indexOf('const EMPTY_ANALYSIS:');const end=source.indexOf('\n};',start)+3;
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
const analysis=new Function(code+'; return EMPTY_ANALYSIS;')();
const file=path.join(__dirname,'../src/data/opening-plan.ts');const m=new Module(file);
m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
analysis.analyzedAt=new Date().toISOString();
const inputs={...m.exports.DEFAULT_OPENING_INPUTS,dailyPatients:65};
(async()=>{
  const response=await fetch('http://localhost:3072/api/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({analysis,openingInputs:inputs})});
  assert.equal(response.status,200,await response.clone().text().then(s=>s.slice(0,100)));
  const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.subarray(0,4).toString()==='%PDF');
  fs.mkdirSync(path.join(__dirname,'../tmp/pdfs'),{recursive:true});fs.writeFileSync(path.join(__dirname,'../tmp/pdfs/profitability-preview.pdf'),bytes);
  const pdf=await require('pdf-lib').PDFDocument.load(bytes);assert.equal(pdf.getPageCount(),6);
  const invalid=await fetch('http://localhost:3072/api/report',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({analysis,openingInputs:{...inputs,loanMonths:0}})});assert.equal(invalid.status,400);
  console.log('PASS: report HTTP 200, PDF 6 pages, invalid finance payload HTTP 400');
})().catch(e=>{console.error(e);process.exitCode=1});
