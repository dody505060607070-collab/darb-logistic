import { useEffect, useRef, useState, type ReactNode } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Layers, Maximize2 } from "lucide-react";

export type MapMarker = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  color?: "green" | "gold" | "red" | "blue" | "gray";
  popup?: string;
  /** Live vehicle state: moving markers pulse. */
  moving?: boolean;
  /** Small second line on the marker, e.g. speed. */
  sub?: string;
  selected?: boolean;
  /** Plain dot without a label (track points, picked places). */
  dot?: boolean;
};
export type MapLine = { id: string; points: [number, number][]; color?: string; dashed?: boolean; width?: number };

type StyleKey = "streets" | "light" | "dark";
const STYLES: Record<StyleKey, { url: string; label: string }> = {
  streets: { url: "https://tiles.openfreemap.org/styles/liberty", label: "شوارع" },
  light: { url: "https://tiles.openfreemap.org/styles/positron", label: "فاتح" },
  dark: { url: "https://tiles.openfreemap.org/styles/dark", label: "داكن" },
};
const STYLE_KEY = "darb-map-style";
const TOKEN: Record<NonNullable<MapMarker["color"]>, string> = { green: "--success", gold: "--gold", red: "--danger", blue: "--info", gray: "--muted-foreground" };
const SAUDI: [number, number] = [45.0, 23.9];
/** Arabic shaping for map labels (@mapbox/mapbox-gl-rtl-text 0.3.0, served locally). */
const RTL_PLUGIN = "/vendor/mapbox-gl-rtl-text-0.3.0.js";

/** Resolves a CSS colour (including var()) to rgb() so the map's own painter can use it. */
function cssColor(value: string, fallback = "#2f7a8f"): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = value.startsWith("--") ? `var(${value})` : value;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c || fallback;
  } catch {
    return fallback;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ml = any;

/**
 * Browser-only MapLibre map on free OpenFreeMap styles with Arabic labels.
 * The library is imported dynamically so SSR never touches window/WebGL.
 * Markers are updated in place (smooth live refresh); the view refits only when
 * the set of shown items changes, never on a plain position update.
 */
export default function MapView({
  markers,
  lines = [],
  height = 420,
  onMarkerClick,
  onMapClick,
  focusId,
  follow = true,
  focusZoom = 15,
  focusOffset = [0, 0],
  toolbar = true,
  cluster = false,
  children,
}: {
  markers: MapMarker[];
  lines?: MapLine[];
  height?: number | string;
  onMarkerClick?: (id: string) => void;
  onMapClick?: (lat: number, lng: number) => void;
  /** Fly to this marker and keep it centred while it moves (when `follow`). */
  focusId?: string | null;
  follow?: boolean;
  focusZoom?: number;
  /** Pixel offset for the focused marker, e.g. to keep it clear of an overlay card. */
  focusOffset?: [number, number];
  toolbar?: boolean;
  /** Group overlapping markers into a count bubble; click zooms in. */
  cluster?: boolean;
  /** Overlays rendered on top of the map (search, cards…). */
  children?: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  const lib = useRef<Ml>(null);
  const map = useRef<Ml>(null);
  const pins = useRef(new Map<string, { mk: Ml; sig: string; lat: number; lng: number; solo: boolean }>());
  const clickRef = useRef(onMarkerClick);
  const mapClickRef = useRef(onMapClick);
  clickRef.current = onMarkerClick;
  mapClickRef.current = onMapClick;
  const [ready, setReady] = useState(false);
  const [styleRev, setStyleRev] = useState(0);
  const [style, setStyle] = useState<StyleKey>("streets");
  const [failed, setFailed] = useState(false);
  const fitKey = useRef<string>("");
  const bubbles = useRef<Ml[]>([]);
  const clusterRef = useRef(cluster);
  clusterRef.current = cluster;
  const reclusterRef = useRef<() => void>(() => undefined);
  const focused = useRef<string | null>(null);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    let saved: StyleKey = "streets";
    try {
      const s = window.localStorage.getItem(STYLE_KEY) as StyleKey | null;
      if (s && s in STYLES) saved = s;
    } catch { /* storage blocked */ }
    setStyle(saved);
    void import("maplibre-gl").then((mod) => {
      const ml = (mod as Ml).default ?? mod;
      if (cancelled || !el.current) return;
      lib.current = ml;
      try {
        if (ml.getRTLTextPluginStatus?.() === "unavailable") void ml.setRTLTextPlugin(new URL(RTL_PLUGIN, window.location.origin).href, true).catch(() => undefined);
      } catch { /* already set */ }
      let m: Ml;
      try {
        m = new ml.Map({ container: el.current, style: STYLES[saved].url, center: SAUDI, zoom: 4.4, attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false });
      } catch {
        setFailed(true);
        return;
      }
      map.current = m;
      m.addControl(new ml.NavigationControl({ showCompass: false }), "top-left");
      m.addControl(new ml.ScaleControl({ unit: "metric" }), "bottom-left");
      m.touchZoomRotate.disableRotation();
      m.on("style.load", () => {
        arabicLabels(m);
        setStyleRev((n) => n + 1);
      });
      m.on("load", () => setReady(true));
      m.on("moveend", () => reclusterRef.current());
      m.on("click", (e: { lngLat: { lat: number; lng: number } }) => mapClickRef.current?.(e.lngLat.lat, e.lngLat.lng));
      ro = new ResizeObserver(() => m.resize());
      ro.observe(el.current);
    }).catch(() => setFailed(true));
    return () => {
      cancelled = true;
      ro?.disconnect();
      pins.current.forEach((p) => p.mk.remove());
      pins.current.clear();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Lines (re-added after every style switch).
  useEffect(() => {
    const m = map.current;
    if (!m || !styleRev) return;
    const data = {
      type: "FeatureCollection",
      features: lines.filter((l) => l.points.length > 1).map((l) => ({
        type: "Feature",
        properties: { id: l.id, color: cssColor(l.color ?? "--info"), dashed: !!l.dashed, width: l.width ?? 4 },
        geometry: { type: "LineString", coordinates: l.points.map(([la, ln]) => [ln, la]) },
      })),
    };
    const src = m.getSource("darb-lines");
    if (src) src.setData(data);
    else {
      m.addSource("darb-lines", { type: "geojson", data });
      m.addLayer({ id: "darb-lines-casing", type: "line", source: "darb-lines", filter: ["!=", ["get", "dashed"], true], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#ffffff", "line-width": ["+", ["get", "width"], 3], "line-opacity": 0.9 } });
      m.addLayer({ id: "darb-lines-solid", type: "line", source: "darb-lines", filter: ["!=", ["get", "dashed"], true], layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": ["get", "color"], "line-width": ["get", "width"] } });
      m.addLayer({ id: "darb-lines-dashed", type: "line", source: "darb-lines", filter: ["==", ["get", "dashed"], true], layout: { "line-cap": "round" }, paint: { "line-color": ["get", "color"], "line-width": 3, "line-dasharray": [2, 2], "line-opacity": 0.8 } });
    }
  }, [lines, styleRev]);

  // Markers: update in place by id.
  useEffect(() => {
    const ml = lib.current, m = map.current;
    if (!ml || !m) return;
    const keep = new Set<string>();
    for (const x of markers) {
      if (!Number.isFinite(x.lat) || !Number.isFinite(x.lng)) continue;
      keep.add(x.id);
      const sig = [x.label, x.color, x.moving, x.sub, x.selected, x.dot, x.popup].join("|");
      const cur = pins.current.get(x.id);
      if (cur && cur.sig === sig) {
        if (cur.lat !== x.lat || cur.lng !== x.lng) { cur.mk.setLngLat([x.lng, x.lat]); cur.lat = x.lat; cur.lng = x.lng; }
        continue;
      }
      cur?.mk.remove();
      const node = markerNode(x);
      node.addEventListener("click", (e) => { e.stopPropagation(); clickRef.current?.(x.id); });
      const mk = new ml.Marker({ element: node, anchor: x.dot ? "center" : "bottom" }).setLngLat([x.lng, x.lat]);
      if (x.popup) {
        const p = document.createElement("div");
        p.dir = "rtl";
        p.className = "darb-popup";
        x.popup.split("\n").forEach((line) => { const d = document.createElement("div"); d.textContent = line; p.appendChild(d); });
        mk.setPopup(new ml.Popup({ offset: 24, closeButton: false, maxWidth: "260px" }).setDOMContent(p));
      }
      mk.addTo(m);
      pins.current.set(x.id, { mk, sig, lat: x.lat, lng: x.lng, solo: !!x.selected || !!x.dot });
    }
    pins.current.forEach((p, id) => { if (!keep.has(id)) { p.mk.remove(); pins.current.delete(id); } });
    reclusterRef.current();
  }, [markers, ready]);

  // Fit to everything when the set of shown items changes.
  useEffect(() => {
    const ml = lib.current, m = map.current;
    if (!ml || !m || !ready) return;
    const key = [...markers.map((x) => x.id)].sort().join(",") + "#" + lines.map((l) => `${l.id}:${l.points.length > 1}`).join(",");
    if (key === fitKey.current) return;
    fitKey.current = key;
    if (focusId && markers.some((x) => x.id === focusId)) return;
    fitAll(ml, m, markers, lines);
  }, [markers, lines, ready, focusId]);

  // Fly to / follow the focused marker.
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const f = focusId ? markers.find((x) => x.id === focusId) : null;
    if (!f) { focused.current = null; return; }
    if (focused.current !== focusId) {
      focused.current = focusId!;
      m.flyTo({ center: [f.lng, f.lat], zoom: Math.max(m.getZoom(), focusZoom), offset: offsetFor(m, focusOffset), duration: 1400, essential: true });
    } else if (follow) {
      m.easeTo({ center: [f.lng, f.lat], offset: offsetFor(m, focusOffset), duration: 800 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusId, markers, ready, follow, focusZoom]);

  reclusterRef.current = () => {
    const ml = lib.current, m = map.current;
    if (!ml || !m) return;
    bubbles.current.forEach((b) => b.remove());
    bubbles.current = [];
    const all = [...pins.current.values()];
    all.forEach((p) => { p.mk.getElement().style.visibility = ""; });
    if (!clusterRef.current || m.getZoom() >= 13) return;
    const pts = all.filter((p) => !p.solo).map((p) => ({ p, xy: m.project([p.lng, p.lat]) as { x: number; y: number } }));
    const used = new Set<number>();
    pts.forEach((a, i) => {
      if (used.has(i)) return;
      const group = [a];
      pts.forEach((b, j) => {
        if (j <= i || used.has(j)) return;
        if (Math.abs(a.xy.x - b.xy.x) < 90 && Math.abs(a.xy.y - b.xy.y) < 34) { group.push(b); used.add(j); }
      });
      if (group.length < 2) return;
      used.add(i);
      group.forEach((g) => { g.p.mk.getElement().style.visibility = "hidden"; });
      const lng = group.reduce((s, g) => s + g.p.lng, 0) / group.length, lat = group.reduce((s, g) => s + g.p.lat, 0) / group.length;
      const node = document.createElement("button");
      node.type = "button";
      node.className = "darb-cluster";
      node.textContent = String(group.length);
      node.setAttribute("aria-label", `${group.length} مركبات — اضغط للتقريب`);
      node.addEventListener("click", (e) => {
        e.stopPropagation();
        const b = new ml.LngLatBounds([a.p.lng, a.p.lat], [a.p.lng, a.p.lat]);
        group.forEach((g) => b.extend([g.p.lng, g.p.lat]));
        m.fitBounds(b, { padding: 90, maxZoom: 16, duration: 900 });
      });
      bubbles.current.push(new ml.Marker({ element: node }).setLngLat([lng, lat]).addTo(m));
    });
  };

  function switchStyle(s: StyleKey) {
    setStyle(s);
    try { window.localStorage.setItem(STYLE_KEY, s); } catch { /* ignore */ }
    map.current?.setStyle(STYLES[s].url);
  }

  return (
    <div className="darb-map relative w-full overflow-hidden rounded-[20px] border" style={{ height }}>
      <div ref={el} dir="ltr" className="h-full w-full" />
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted p-6 text-center text-sm text-muted-foreground">
          تعذّر عرض الخريطة على هذا المتصفح. حدّث المتصفح أو جرّب متصفحًا آخر.
        </div>
      )}
      {toolbar && !failed && (
        <div className="absolute top-2.5 right-2.5 z-[2] flex items-center gap-1 rounded-full border bg-card/95 p-1 text-xs shadow-sm backdrop-blur">
          <Layers className="mx-1 size-3.5 text-muted-foreground" aria-hidden />
          {(Object.keys(STYLES) as StyleKey[]).map((k) => (
            <button key={k} type="button" onClick={() => switchStyle(k)} aria-pressed={style === k}
              className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${style === k ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
              {STYLES[k].label}
            </button>
          ))}
          <button type="button" title="عرض الكل" aria-label="عرض كل المركبات" onClick={() => lib.current && map.current && fitAll(lib.current, map.current, markers, lines)}
            className="rounded-full p-1.5 hover:bg-muted"><Maximize2 className="size-3.5" /></button>
        </div>
      )}
      {children}
    </div>
  );
}

/** Side offsets only fit wide maps; narrow (phone) maps shift the target up above a bottom card instead. */
function offsetFor(m: Ml, wide: [number, number]): [number, number] {
  if (!wide[0] && !wide[1]) return wide;
  const c = m.getContainer();
  return c.clientWidth >= 640 ? wide : [0, -Math.round(Math.min(150, c.clientHeight * 0.22))];
}

function fitAll(ml: Ml, m: Ml, markers: MapMarker[], lines: MapLine[]) {
  const pts: [number, number][] = [...markers.map((x) => [x.lng, x.lat] as [number, number]), ...lines.flatMap((l) => l.points.map(([la, ln]) => [ln, la] as [number, number]))]
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (!pts.length) return;
  if (pts.length === 1) { m.flyTo({ center: pts[0], zoom: Math.max(m.getZoom(), 11), duration: 800 }); return; }
  const b = new ml.LngLatBounds(pts[0], pts[0]);
  pts.forEach((p) => b.extend(p));
  m.fitBounds(b, { padding: 60, maxZoom: 13, duration: 800 });
}

/** Shows Arabic place names where the map data has them. */
function arabicLabels(m: Ml) {
  try {
    for (const layer of m.getStyle().layers ?? []) {
      if (layer.type !== "symbol") continue;
      const tf = m.getLayoutProperty(layer.id, "text-field");
      if (!tf || !JSON.stringify(tf).includes("name")) continue;
      m.setLayoutProperty(layer.id, "text-field", ["coalesce", ["get", "name:ar"], ["get", "name"], ["get", "name_en"]]);
    }
  } catch { /* style not ready */ }
}

function markerNode(x: MapMarker): HTMLElement {
  const color = TOKEN[x.color ?? "green"];
  const root = document.createElement("div");
  root.className = `darb-mk${x.moving ? " is-moving" : ""}${x.selected ? " is-selected" : ""}${x.dot ? " is-dot" : ""}`;
  root.style.setProperty("--mk", `var(${color})`);
  root.setAttribute("role", "button");
  root.setAttribute("aria-label", x.label);
  if (x.selected) root.style.zIndex = "5";
  if (x.dot) {
    root.appendChild(Object.assign(document.createElement("span"), { className: "darb-mk-dot" }));
    return root;
  }
  const pill = document.createElement("div");
  pill.className = "darb-mk-pill";
  const dot = document.createElement("span");
  dot.className = "darb-mk-state";
  const lbl = document.createElement("span");
  lbl.className = "darb-mk-label";
  lbl.textContent = x.label;
  pill.append(dot, lbl);
  if (x.sub) {
    const sub = document.createElement("span");
    sub.className = "darb-mk-sub";
    sub.textContent = x.sub;
    pill.appendChild(sub);
  }
  const pin = document.createElement("span");
  pin.className = "darb-mk-pin";
  root.append(pill, pin);
  return root;
}
