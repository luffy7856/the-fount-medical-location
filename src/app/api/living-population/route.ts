import { NextRequest, NextResponse } from "next/server";
import { fetchSeoulLivingPopulation } from "@/providers/seoul-living-population";
import { tossPreflight, withTossCors } from "@/lib/toss-cors";

async function handle(request: NextRequest) {
  try {
    const body = await request.json();
    const livingPopulation = await fetchSeoulLivingPopulation({
      administrativeCode: typeof body.administrativeCode === "string" ? body.administrativeCode : undefined,
      date: typeof body.date === "string" ? body.date : undefined,
      hour: Number(body.hour),
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
      radiusMeters: Number(body.radiusMeters)
    });
    return NextResponse.json(livingPopulation);
  } catch {
    return NextResponse.json({ error: "생활인구 요청을 확인해주세요." }, { status: 400 });
  }
}

// 앱인토스 미니앱: CORS + modest rate limit for the tossmini origins only (src/lib/toss-cors.ts).
export const POST = withTossCors("living-population", { perIp: 200, windowMs: 600_000, perInstancePerHour: 4000 }, handle);
export const OPTIONS = tossPreflight;
