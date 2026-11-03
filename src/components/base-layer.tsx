"use client";

import { TileLayer } from "react-leaflet";

/* The map's base tiles. The 앱인토스 build swaps this module for toss/stubs/base-layer.tsx (OpenFreeMap vector tiles),
   because the OpenStreetMap tile policy does not allow distributing an app on tile.openstreetmap.org. */
export default function BaseLayer() {
  return <TileLayer
    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    url={process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"}
  />;
}
