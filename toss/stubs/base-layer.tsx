/* Toss build stand-in for src/components/base-layer.tsx.
   The website uses tile.openstreetmap.org, but the OSM tile usage policy forbids distributing an app on those tiles
   without permission. The mini app draws OpenFreeMap vector tiles instead (free, no key, commercial use allowed:
   https://openfreemap.org), rendered by MapLibre GL inside the same Leaflet map, so markers, circles and the
   population grid keep working unchanged. Labels are switched to Korean names; Hangul is drawn with the device font. */
import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import "@maplibre/maplibre-gl-leaflet";

const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
const ATTRIBUTION = "© OpenFreeMap © OpenMapTiles · 지도 데이터 © OpenStreetMap";
const KOREAN_NAME = ["coalesce", ["get", "name:ko"], ["get", "name"]];

async function koreanStyle() {
  const response = await fetch(STYLE_URL, { cache: "force-cache" });
  if (!response.ok) throw new Error(`style ${response.status}`);
  const style = await response.json();
  for (const layer of style.layers || []) {
    if (layer.type === "symbol" && layer.layout && layer.layout["text-field"] && layer.id !== "highway-shield") layer.layout["text-field"] = KOREAN_NAME;
  }
  return style;
}

function webglAvailable() {
  try { const canvas = document.createElement("canvas"); return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")); } catch { return false; }
}

export default function BaseLayer() {
  const map = useMap();
  useEffect(() => {
    // attribution as plain text: nothing in the mini app links out
    map.attributionControl?.setPrefix(false);
    if (!webglAvailable()) { map.attributionControl?.addAttribution("지도 배경을 표시할 수 없는 기기입니다"); return; }
    let layer: L.Layer | null = null;
    let cancelled = false;
    koreanStyle().then((style) => {
      if (cancelled) return;
      const factory = (L as unknown as { maplibreGL: (options: object) => L.Layer }).maplibreGL;
      layer = factory({
        style,
        attributionControl: { customAttribution: ATTRIBUTION },
        localIdeographFontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif",
        interactive: false,
      });
      layer.addTo(map);
    }).catch(() => { map.attributionControl?.addAttribution("지도 배경을 불러오지 못했습니다"); });
    return () => { cancelled = true; if (layer) map.removeLayer(layer); };
  }, [map]);
  return null;
}
