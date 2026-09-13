import { notFound } from 'next/navigation';
import { ProfitabilityPreview } from './preview';
export const metadata = { title:'수익성 개편 미리보기 | THE FOUNT',robots:{index:false,follow:false} };
export default function Page(){
  if(process.env.NODE_ENV!=='development')notFound();
  return <ProfitabilityPreview/>;
}
