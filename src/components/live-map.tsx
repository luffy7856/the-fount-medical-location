"use client";

import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";
import type { LocationAnalysis, LivePlace } from "@/data/location-types";
import { useEffect } from "react";

const COLORS = { hospital: "#e55e48", pharmacy: "#3182ce", transit: "#0f937d", parking: "#805ad5" };

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

export default function LiveMap({ analysis, activeKinds, selected, onPlace, onSelectCoordinate }: {
  analysis: LocationAnalysis;
  activeKinds: Set<string>;
  selected: LivePlace | null;
  onPlace: (place: LivePlace) => void;
  onSelectCoordinate: (latitude: number, longitude: number) => void;
}) {
  const { latitude, longitude } = analysis.location;
  return <MapContainer center={[latitude, longitude]} zoom={15} className="leaflet-live-map" zoomControl={false} preferCanvas>
    <TileLayer
      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      url={process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
    />
    <MapUpdater latitude={latitude} longitude={longitude} radius={analysis.radiusMeters} />
    <MapClick onSelect={onSelectCoordinate} />
    <Circle center={[latitude, longitude]} radius={analysis.radiusMeters} pathOptions={{ color: "#0f937d", fillColor: "#38b2ac", fillOpacity: .08, weight: 2, dashArray: "6 7" }} />
    <CircleMarker center={[latitude, longitude]} radius={9} bubblingMouseEvents={false} pathOptions={{ color: "#fff", fillColor: "#14263d", fillOpacity: 1, weight: 4 }}>
      <Popup><b>분석 중심지</b><br />{analysis.location.displayName}</Popup>
    </CircleMarker>
    {analysis.places.filter(place => activeKinds.has(place.kind)).map(place => <CircleMarker
      key={place.id}
      center={[place.latitude, place.longitude]}
      radius={selected?.id === place.id ? 10 : place.kind === "hospital" ? 7 : 5}
      bubblingMouseEvents={false}
      pathOptions={{ color: "#fff", fillColor: COLORS[place.kind], fillOpacity: .95, weight: selected?.id === place.id ? 4 : 2 }}
      eventHandlers={{ click: () => onPlace(place) }}
    ><Popup><strong>{place.name}</strong><br />{place.specialty || place.kind}<br />{place.distanceMeters.toLocaleString()}m</Popup></CircleMarker>)}
  </MapContainer>;
}
