"use client";

import { Circle, CircleMarker, MapContainer, Marker, Popup, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { divIcon } from "leaflet";
import type { LocationAnalysis, LivePlace } from "@/data/location-types";
import { useEffect } from "react";

const COLORS = { hospital: "#e55e48", pharmacy: "#3182ce", transit: "#0f937d", parking: "#805ad5" };
const POPULATION_COLORS = [
  { max: 39, label: "낮음", color: "#3f8fe6" },
  { max: 59, label: "보통", color: "#f3c94c" },
  { max: 79, label: "높음", color: "#f28a32" },
  { max: 100, label: "매우 높음", color: "#dc3f2f" }
];

const ANALYSIS_LOCATION_ICON = divIcon({
  className: "analysis-location-marker",
  html: '<div class="analysis-flag"><span class="analysis-flag-label">분석 위치</span><i class="analysis-flag-pole"></i><i class="analysis-flag-sheet">HERE</i><i class="analysis-flag-base"></i></div>',
  iconSize: [76, 62],
  iconAnchor: [17, 56],
  popupAnchor: [18, -53]
});

function distanceMeters(latitude: number, longitude: number, targetLatitude: number, targetLongitude: number) {
  const north = (targetLatitude - latitude) * 111320;
  const east = (targetLongitude - longitude) * 111320 * Math.cos(latitude * Math.PI / 180);
  return Math.sqrt(north ** 2 + east ** 2);
}

function populationGrid(analysis: LocationAnalysis) {
  const actualCells = analysis.livingPopulation?.gridCells;
  if (actualCells?.length) {
    return actualCells.map(cell => {
      const latitudeStep = 250 / 111320;
      const longitudeStep = 250 / (111320 * Math.cos(cell.latitude * Math.PI / 180));
      return {
        row: cell.id,
        column: "actual",
        centerLatitude: cell.latitude,
        centerLongitude: cell.longitude,
        score: Math.round(cell.population),
        population: cell.population,
        actual: true,
        category: POPULATION_COLORS[cell.band],
        bounds: [
          [cell.latitude - latitudeStep / 2, cell.longitude - longitudeStep / 2],
          [cell.latitude + latitudeStep / 2, cell.longitude + longitudeStep / 2]
        ] as [[number, number], [number, number]]
      };
    });
  }
  const total = analysis.livingPopulation?.total;
  if (!total) return [];
  const { latitude, longitude } = analysis.location;
  const dimension = 5;
  const extentMeters = Math.max(300, Math.min(analysis.radiusMeters, 1100));
  const cellMeters = extentMeters * 2 / dimension;
  const latitudeStep = cellMeters / 111320;
  const longitudeStep = cellMeters / (111320 * Math.cos(latitude * Math.PI / 180));
  const weights = { hospital: .7, pharmacy: 1.2, transit: 4.2, parking: .35 };
  const cells = Array.from({ length: dimension * dimension }, (_, index) => {
    const row = Math.floor(index / dimension);
    const column = index % dimension;
    const centerLatitude = latitude + (row - (dimension - 1) / 2) * latitudeStep;
    const centerLongitude = longitude + (column - (dimension - 1) / 2) * longitudeStep;
    const facilitySignal = analysis.places.reduce((sum, place) => {
      const distance = distanceMeters(centerLatitude, centerLongitude, place.latitude, place.longitude);
      return sum + weights[place.kind] * Math.exp(-distance / Math.max(180, cellMeters * .9));
    }, 0);
    return { row, column, centerLatitude, centerLongitude, raw: 1 + facilitySignal };
  });
  const minimum = Math.min(...cells.map(cell => cell.raw));
  const maximum = Math.max(...cells.map(cell => cell.raw));
  const populationLevel = Math.max(0, Math.min(1, (Math.log10(total) - 4) / 1.35));
  return cells.map(cell => {
    const relative = maximum > minimum ? (cell.raw - minimum) / (maximum - minimum) : .5;
    const score = Math.max(0, Math.min(100, Math.round(12 + relative * 63 + populationLevel * 25)));
    const category = POPULATION_COLORS.find(item => score <= item.max) || POPULATION_COLORS.at(-1)!;
    return {
      ...cell,
      score,
      population: undefined,
      actual: false,
      category,
      bounds: [
        [cell.centerLatitude - latitudeStep / 2, cell.centerLongitude - longitudeStep / 2],
        [cell.centerLatitude + latitudeStep / 2, cell.centerLongitude + longitudeStep / 2]
      ] as [[number, number], [number, number]]
    };
  });
}

function MapUpdater({ latitude, longitude, radius }: { latitude: number; longitude: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([latitude, longitude], radius <= 500 ? 16 : radius <= 1000 ? 15 : 14, { duration: .8 });
  }, [map, latitude, longitude, radius]);
  return null;
}

function MapClick({ onSelect }: { onSelect: (latitude: number, longitude: number) => void }) {
  useMapEvents({ click(event) { onSelect(event.latlng.lat, event.latlng.lng); } });
  return null;
}

function AnalyzePopupLocation({ latitude, longitude, onSelect, label = "이 위치 분석하기" }: {
  latitude: number;
  longitude: number;
  onSelect: (latitude: number, longitude: number) => void;
  label?: string;
}) {
  const map = useMap();
  return <button type="button" className="popup-analysis-action" onClick={event => {
    event.stopPropagation();
    map.closePopup();
    onSelect(latitude, longitude);
  }}>{label}</button>;
}

export default function LiveMap({ analysis, activeKinds, populationActive, selected, onPlace, onSelectCoordinate }: {
  analysis: LocationAnalysis;
  activeKinds: Set<string>;
  populationActive: boolean;
  selected: LivePlace | null;
  onPlace: (place: LivePlace) => void;
  onSelectCoordinate: (latitude: number, longitude: number) => void;
}) {
  const { latitude, longitude } = analysis.location;
  const livingPopulation = analysis.livingPopulation;
  const densityCells = populationGrid(analysis);
  return <MapContainer center={[latitude, longitude]} zoom={15} className="leaflet-live-map" zoomControl={false} preferCanvas>
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url={process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
    />
    <MapUpdater latitude={latitude} longitude={longitude} radius={analysis.radiusMeters} />
    <MapClick onSelect={onSelectCoordinate} />
    {populationActive && livingPopulation?.status === "available" && densityCells.map(cell => <Rectangle
      key={`${cell.row}-${cell.column}`}
      bounds={cell.bounds}
      interactive
      bubblingMouseEvents={false}
      pathOptions={{ color: cell.category.color, fillColor: cell.category.color, fillOpacity: .27, weight: .7 }}
    ><Popup><strong>{cell.actual ? "250m 격자 실제 생활인구" : "생활인구 공간분포 추정"}</strong><br />{cell.actual ? <><b>{cell.population?.toLocaleString()}명</b> · {cell.category.label}</> : <>밀도지수 <b>{cell.score}/100</b> · {cell.category.label}</>}<br />{livingPopulation.referenceDate} {String(livingPopulation.hour).padStart(2, "0")}시<br />{cell.actual ? `격자 ${cell.row}` : `행정동 실제 생활인구 ${livingPopulation.total?.toLocaleString()}명`}<br /><small>{cell.actual ? "서울특별시 250m 격자 원자료" : "주변 지하철·약국·의료기관 접근성으로 공간 배분한 추정지수"}</small><AnalyzePopupLocation latitude={cell.centerLatitude} longitude={cell.centerLongitude} onSelect={onSelectCoordinate} label="이 격자 중심으로 분석하기" /></Popup></Rectangle>)}
    <Circle center={[latitude, longitude]} radius={analysis.radiusMeters} pathOptions={{ color: "#0f937d", fillColor: "#38b2ac", fillOpacity: .08, weight: 2, dashArray: "6 7" }} />
    <Marker position={[latitude, longitude]} icon={ANALYSIS_LOCATION_ICON} zIndexOffset={1000} bubblingMouseEvents={false}>
      <Popup><b>분석 중심지</b><br />{analysis.location.displayName}</Popup>
    </Marker>
    {analysis.places.filter(place => activeKinds.has(place.kind)).map(place => <CircleMarker
      key={place.id}
      center={[place.latitude, place.longitude]}
      radius={selected?.id === place.id ? 10 : place.kind === "hospital" ? 7 : 5}
      bubblingMouseEvents={false}
      pathOptions={{ color: "#fff", fillColor: COLORS[place.kind], fillOpacity: .95, weight: selected?.id === place.id ? 4 : 2 }}
      eventHandlers={{ click: () => onPlace(place) }}
    ><Popup><strong>{place.name}</strong><br />{place.specialty || place.kind}<br />{place.distanceMeters.toLocaleString()}m<AnalyzePopupLocation latitude={place.latitude} longitude={place.longitude} onSelect={onSelectCoordinate} /></Popup></CircleMarker>)}
    {activeKinds.has("development") && analysis.developmentPlans?.status === "available" && analysis.developmentPlans.plans.filter(plan => plan.latitude !== undefined && plan.longitude !== undefined).map(plan => <CircleMarker
      key={`development-${plan.id}`}
      center={[plan.latitude!, plan.longitude!]}
      radius={8}
      bubblingMouseEvents={false}
      pathOptions={{ color: "#fff", fillColor: "#d28c24", fillOpacity: .95, weight: 3, dashArray: "3 2" }}
    ><Popup><strong>{plan.name}</strong><br />{plan.category}<br />{plan.status}{plan.distanceMeters !== undefined ? <><br />약 {plan.distanceMeters.toLocaleString()}m</> : null}<br /><small>VWorld 공식 계획공간 정보</small><AnalyzePopupLocation latitude={plan.latitude!} longitude={plan.longitude!} onSelect={onSelectCoordinate} /></Popup></CircleMarker>)}
  </MapContainer>;
}
