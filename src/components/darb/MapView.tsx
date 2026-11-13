import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: "green" | "gold" | "red" | "blue" | "gray";
  popup?: string;
};
export type MapLine = { id: string; points: [number, number][]; color?: string; dashed?: boolean };

const COLORS = { green: 'var(--primary)', gold: 'var(--gold)', red: 'var(--danger)', blue: 'var(--info)', gray: 'var(--muted-foreground)' };

/** Browser-only Leaflet map. Leaflet is imported dynamically inside the effect so SSR never touches window. */
export default function MapView({
  markers,
  lines = [],
  height = 420,
  onMarkerClick,
  onMapClick,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  height?: number;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !el.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([23.9, 45.0], 5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 18,
          attribution: "© OpenStreetMap",
        }).addTo(mapRef.current);
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      mapRef.current.off("click");
      if (onMapClick) mapRef.current.on("click", (e: { latlng: { lat: number; lng: number } }) => onMapClick(e.latlng.lat, e.latlng.lng));
      const layer = layerRef.current;
      layer.clearLayers();
      const bounds: [number, number][] = [];
      lines.forEach((l) => {
        L.polyline(l.points, { color: l.color ?? 'var(--info)', weight: 4, opacity: 0.85, dashArray: l.dashed ? "8 8" : undefined }).addTo(layer);
        bounds.push(...l.points);
      });
      markers.forEach((m) => {
        const c = COLORS[m.color ?? "green"];
        const label=document.createElement('span');label.textContent=m.label;
        const icon = L.divIcon({
          className: "",
          html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-100%);position:absolute">
            <div style="background:${c};color:var(--primary-foreground);font:600 11px 'IBM Plex Sans Arabic',sans-serif;padding:3px 8px;border-radius:6px;white-space:nowrap;box-shadow:var(--shadow-card)">${label.innerHTML}</div>
            <div style="width:10px;height:10px;background:${c};border:2px solid var(--card);border-radius:50%;margin-top:2px;box-shadow:var(--shadow-card)"></div></div>`,
        });
        const mk = L.marker([m.lat, m.lng], { icon }).addTo(layer);
        if (m.popup) {const popup=document.createElement('span');popup.textContent=m.popup;mk.bindPopup(popup);}
        if (onMarkerClick) mk.on("click", () => onMarkerClick(m.id));
        bounds.push([m.lat, m.lng]);
      });
      if (bounds.length > 1) mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
      else if (bounds.length === 1) mapRef.current.setView(bounds[0], 8);
    });
    return () => {
      cancelled = true;
    };
  }, [markers, lines, onMarkerClick, onMapClick]);

  useEffect(
    () => () => {
      mapRef.current?.remove();
      mapRef.current = null;
    },
    [],
  );

  return <div ref={el} style={{ height }} className="w-full overflow-hidden rounded-lg border" />;
}
