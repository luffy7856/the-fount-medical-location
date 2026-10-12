import 'server-only';
import type { LocationAnalysis } from '@/data/location-types';
export async function persistAnalysis(analysis:LocationAnalysis,authorization:string|null) {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return {status:'not_configured' as const};
  if (!authorization?.startsWith('Bearer ')) return {status:'sign_in_required' as const};
  try {
    // User JWT, not service_role: RPC derives owner from auth.uid(), no client-supplied owner ID.
    const response=await fetch(new URL('/rest/v1/rpc/save_location_analysis',url),{
      method:'POST',headers:{apikey:key,Authorization:authorization,'Content-Type':'application/json'},
      body:JSON.stringify({p_snapshot:analysis}),cache:'no-store',signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) return {status:'error' as const};
    const data=await response.json();
    return {status:'saved' as const,analysisId:String(data.analysisId),locationId:String(data.locationId)};
  } catch {return {status:'error' as const};}
}
