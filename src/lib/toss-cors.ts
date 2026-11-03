/* 앱인토스 미니앱(thefount-location) → live API.
   The Toss bundle is static and runs on https://thefount-location.web.tossmini.com (and .private-web. for the QR test),
   so the routes it uses (analyze, ai-insight, living-population) answer those two origins with CORS. Requests from the
   website (same origin, no Origin match) behave exactly as before: no CORS headers, no extra limit.
   Toss traffic gets a modest in-memory limit per client IP and per server instance, because /api/analyze calls
   Kakao·SGIS·HIRA·R-ONE·VWorld and /api/ai-insight calls an AI model through the Vercel AI Gateway. Keys stay server-side. */
import { createHash } from "node:crypto";

export const TOSS_ORIGINS = new Set([
  "https://thefount-location.web.tossmini.com",
  "https://thefount-location.private-web.tossmini.com",
]);

type Limit = { perIp: number; windowMs: number; perInstancePerHour: number };
const windows = new Map<string, { startedAt: number; count: number }>();

function tossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return origin && TOSS_ORIGINS.has(origin) ? origin : null;
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function clientKey(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "anonymous";
  return createHash("sha256").update(ip).digest("hex").slice(0, 16);
}

function hit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  if (windows.size > 5000) windows.forEach((v, k) => { if (now - v.startedAt >= 3_600_000) windows.delete(k); });
  const current = windows.get(key);
  if (!current || now - current.startedAt >= windowMs) { windows.set(key, { startedAt: now, count: 1 }); return false; }
  current.count += 1;
  return current.count > max;
}

/* OPTIONS: preflight for the tossmini origins; anything else gets the same answer Next.js gives by default. */
export function tossPreflight(request: Request) {
  const origin = tossOrigin(request);
  if (!origin) return new Response(null, { status: 204, headers: { Allow: "OPTIONS, POST" } });
  return new Response(null, { status: 204, headers: { ...corsHeaders(origin), Allow: "OPTIONS, POST" } });
}

/* Wraps a POST handler: for the tossmini origins, applies the limit and adds CORS headers to whatever it returns. */
export function withTossCors<R extends Request>(name: string, limit: Limit, handler: (request: R) => Promise<Response>) {
  return async (request: R) => {
    const origin = tossOrigin(request);
    if (!origin) return handler(request);
    const headers = corsHeaders(origin);
    if (hit(`${name}:all`, limit.perInstancePerHour, 3_600_000) || hit(`${name}:${clientKey(request)}`, limit.perIp, limit.windowMs)) {
      return Response.json({ error: "요청이 많아 잠시 쉬어갑니다. 몇 분 뒤 다시 시도해주세요." }, { status: 429, headers: { ...headers, "Retry-After": "120", "Cache-Control": "no-store" } });
    }
    const response = await handler(request);
    for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
    return response;
  };
}
