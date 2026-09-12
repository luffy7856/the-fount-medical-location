import { NextRequest, NextResponse } from "next/server";
import { fetchSeoulLivingPopulation } from "@/providers/seoul-living-population";

export async function POST(request: NextRequest) {
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
