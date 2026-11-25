"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatEur, type SimulationOutput } from "@/lib/calc";
import { navUrl, wazeUrl, type Station } from "@/lib/stations";

type Pt = { lat: number; lng: number };
const CDN = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/";
const btn = "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 active:bg-zinc-800";

function loadLeaflet(): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.L) return resolve(w.L);
    if (!document.getElementById("leaflet-css")) {
      const l = document.createElement("link");
      l.id = "leaflet-css";
      l.rel = "stylesheet";
      l.href = CDN + "leaflet.min.css";
      document.head.appendChild(l);
    }
    const s = document.createElement("script");
    s.src = CDN + "leaflet.min.js";
    s.onload = () => resolve(w.L);
    s.onerror = () => reject(new Error("leaflet"));
    document.head.appendChild(s);
  });
}

export default function MapView({
  result, stations, coords, me,
}: { result: SimulationOutput; stations: Station[]; coords: Record<string, Pt>; me: Pt | null }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const layer = useRef<any>(null);
  const lastKey = useRef("");
  const [sel, setSel] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Postos ordenados pelo melhor preço (1 = mais barato) e só os que têm localização
  const { pins, noLoc } = useMemo(() => {
    const best = new Map<string, number>();
    for (const r of result.ranked) {
      const n = r.tariff.station ?? "";
      const t = best.get(n);
      if (t == null || r.totalEur < t) best.set(n, r.totalEur);
    }
    const arr = [...best.entries()].sort((a, b) => a[1] - b[1]);
    const pins: { name: string; rank: number; label: string; lat: number; lng: number }[] = [];
    const noLoc: string[] = [];
    arr.forEach(([name, total], i) => {
      const st = stations.find((s) => s.name === name);
      const c = st && st.lat != null && st.lng != null ? { lat: st.lat, lng: st.lng } : coords[name];
      if (c) pins.push({ name, rank: i + 1, label: formatEur(total), lat: c.lat, lng: c.lng });
      else noLoc.push(name);
    });
    return { pins, noLoc };
  }, [result, stations, coords]);

  useEffect(() => {
    let dead = false;
    loadLeaflet()
      .then((L) => {
        if (dead || !el.current) return;
        if (!map.current) {
          map.current = L.map(el.current).setView([38.72, -9.2], 12);
          L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
          layer.current = L.layerGroup().addTo(map.current);
        }
        layer.current.clearLayers();
        const pts: [number, number][] = [];
        for (const p of pins) {
          const bg = p.name === sel ? "#f59e0b" : p.rank === 1 ? "#10b981" : "#e4e4e7";
          const icon = L.divIcon({
            className: "",
            html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#000;font:600 14px sans-serif;display:flex;align-items:center;justify-content:center;border:2px solid #000">${p.rank}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          });
          const m = L.marker([p.lat, p.lng], { icon }).addTo(layer.current);
          m.bindTooltip(p.label, { permanent: true, direction: "right", offset: [14, 0] });
          m.on("click", () => setSel(p.name));
          pts.push([p.lat, p.lng]);
        }
        if (me) {
          L.circleMarker([me.lat, me.lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#3b82f6", fillOpacity: 1 }).addTo(layer.current);
          pts.push([me.lat, me.lng]);
        }
        const key = pts.map((q) => q.join(",")).join("|");
        if (pts.length && key !== lastKey.current) {
          lastKey.current = key;
          map.current.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
        }
      })
      .catch(() => setFailed(true));
    return () => { dead = true; };
  }, [pins, me, sel]);

  useEffect(() => () => { if (map.current) { map.current.remove(); map.current = null; } }, []);

  const st = sel ? stations.find((s) => s.name === sel) : undefined;
  const rank = sel ? pins.find((p) => p.name === sel)?.rank : undefined;
  const options = sel ? result.ranked.filter((r) => r.tariff.station === sel) : [];

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">Os números mostram a ordem do mais barato (1) ao mais caro. Toca num posto para ver as opções.</p>
      {failed && <p className="text-xs text-red-300">Não consegui carregar o mapa. Verifica a ligação à internet.</p>}
      <div ref={el} className="h-80 w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950" />
      {pins.length === 0 && <p className="text-xs text-zinc-500">A procurar a localização dos postos…</p>}
      {noLoc.length > 0 && <p className="text-xs text-zinc-600">Sem localização: {noLoc.join(", ")}.</p>}
      {sel && (
        <div className="rounded-2xl border border-amber-600/60 p-4">
          <p className="text-sm">{rank ? `#${rank} · ` : ""}{sel}</p>
          <ul className="mt-2 space-y-1">
            {options.map((r) => (
              <li key={r.tariff.operator} className="flex justify-between text-sm">
                <span className="text-zinc-300">{r.tariff.operator}</span>
                <span>{formatEur(r.totalEur)}{r.diffVsCheapestEur > 0 && <span className="ml-2 text-xs text-zinc-500">+{formatEur(r.diffVsCheapestEur)}</span>}</span>
              </li>
            ))}
          </ul>
          {st?.address && (
            <div className="mt-3 flex gap-2">
              <a className={btn} href={navUrl(st.address)} target="_blank" rel="noreferrer">Navegar</a>
              <a className={btn} href={wazeUrl(st.address)} target="_blank" rel="noreferrer">Waze</a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
