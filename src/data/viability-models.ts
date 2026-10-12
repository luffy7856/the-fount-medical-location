import { VIABILITY_DEFAULTS, type ViabilityModel } from './viability-engine';
/** Bootstrap assumptions only. Published immutable DB versions override these server-side later. */
export const viabilityModels: ViabilityModel[] = [
  ['피부과',10,20,30,129700],['성형외과',10,20,30,265700],['정형외과',5,10,20,69900],['내과',5,10,20,45700],
  ['소아청소년과',5,10,20,21600],['치과',10,20,30,193900],['안과',10,20,30,89600],
  ['이비인후과',5,10,20,34400],['산부인과',10,20,30,114100],['비뇨기과',5,10,20,74500],
  ['한의원',5,10,20,55000],['검진센터',15,30,45,155000],
].map(([specialty,a,b,c,revenue])=>({
  specialty:String(specialty),version:`${specialty}-experimental-v0.2`,status:'experimental',
  decay:[{minutes:Number(a),factor:1},{minutes:Number(b),factor:.6},{minutes:Number(c),factor:.2}],
  defaults:{...VIABILITY_DEFAULTS,revenuePerVisitWon:Number(revenue)},
}));
export function modelFor(specialty:string) {
  return viabilityModels.find(m=>m.specialty===specialty) ?? {...viabilityModels[2],specialty,version:`${specialty}-fallback-experimental-v0.2`};
}
