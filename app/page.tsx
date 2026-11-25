"use client";

import { useEffect, useMemo, useState } from "react";
import data from "@/data/tariffs.json";
import {
  formatEur, formatEurPerKwh, formatPriceDate, simulate, validateInput,
  type SimulationInput, type SimulationOutput,
} from "@/lib/calc";
import MapView from "./MapView";
import { buildTariffs, distanceKm, embedUrl, navUrl, wazeUrl, type Station, type TariffData } from "@/lib/stations";

const td = data as unknown as TariffData;
const tariffs = buildTariffs(td);
const stationByName = new Map<string, Station>(td.stations.map((s) => [s.name, s]));
const CAR_KEY = "tcfl-car-v1";
const GEO_KEY = "tcfl-geo-v1";
type Pt = { lat: number; lng: number };

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.trim().replace(",", ".")));
const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none";
const btn = "rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 active:bg-zinc-800";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-zinc-400">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-600">{hint}</span>}
    </label>
  );
}

export default function Home() {
  const [tab, setTab] = useState<"car" | "sim">("car");
  const [model, setModel] = useState("Model Y");
  const [capacity, setCapacity] = useState("");
  const [efficiency, setEfficiency] = useState("90");
  const [current, setCurrent] = useState("20");
  const [target, setTarget] = useState("80");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationOutput | null>(null);
  const [sort, setSort] = useState<"price" | "near">("price");
  const [me, setMe] = useState<Pt | null>(null);
  const [coords, setCoords] = useState<Record<string, Pt>>({});
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "map">("list");

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(CAR_KEY) || "null");
      if (s) { setModel(s.model ?? "Model Y"); setCapacity(s.capacity ?? ""); setEfficiency(s.efficiency ?? "90"); }
      const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
      if (g) setCoords(g);
    } catch {}
  }, []);
  useEffect(() => {
    try { localStorage.setItem(CAR_KEY, JSON.stringify({ model, capacity, efficiency })); } catch {}
  }, [model, capacity, efficiency]);

  function onSimulate() {
    const m = num(minutes);
    const input: SimulationInput = {
      capacityKwh: num(capacity), currentPct: num(current), targetPct: num(target),
      efficiencyPct: num(efficiency), minutes: Number.isNaN(m) ? null : m,
    };
    const err = validateInput(input);
    if (err) { setError(err); setResult(null); return; }
    setError(null);
    setResult(simulate(tariffs, input));
  }

  // Coordenadas dos postos: do ficheiro, ou pela morada via OpenStreetMap (guardadas no telemóvel)
  async function ensureCoords() {
    const next = { ...coords };
    let changed = false;
    for (const s of td.stations) {
      if (s.lat != null && s.lng != null) { next[s.name] = { lat: s.lat, lng: s.lng }; continue; }
      if (!s.address || next[s.name]) continue;
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(s.address)}`);
        const j = await r.json();
        if (j[0]) { next[s.name] = { lat: Number(j[0].lat), lng: Number(j[0].lon) }; changed = true; setCoords({ ...next }); }
      } catch {}
      await new Promise((res) => setTimeout(res, 1100));
    }
    if (changed) { try { localStorage.setItem(GEO_KEY, JSON.stringify(next)); } catch {} }
  }

  function locate() {
    if (!navigator.geolocation) { setGeoMsg("Este browser não tem localização."); return; }
    setGeoMsg("A obter a tua localização…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
        setSort("near");
        setGeoMsg(null);
        ensureCoords();
      },
      () => setGeoMsg("Não consegui obter a localização. Autoriza-a nas definições do browser."),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  function showView(v: "list" | "map") {
    setView(v);
    if (v === "map") ensureCoords();
  }

  const rows = useMemo(() => {
    if (!result) return [];
    const list = result.ranked.map((r) => {
      const st = stationByName.get(r.tariff.station ?? "");
      const c = st ? (st.lat != null && st.lng != null ? { lat: st.lat, lng: st.lng } : coords[st.name]) : undefined;
      return { r, st, km: me && c ? distanceKm(me, c) : null };
    });
    if (sort === "near") list.sort((a, b) => (a.km ?? 1e9) - (b.km ?? 1e9) || a.r.totalEur - b.r.totalEur);
    return list;
  }, [result, sort, me, coords]);

  const best = result?.ranked[0];

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 pb-28 pt-8">
      <header className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">Lisboa</p>
        <h1 className="mt-1 text-2xl font-light tracking-wide">Tesla Charging Finder</h1>
      </header>

      {tab === "car" && (
        <section className="space-y-5">
          <h2 className="text-lg font-medium">Definições do carro</h2>
          <Field label="Modelo">
            <input className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>
          <Field label="Capacidade da bateria (kWh)" hint="Confirma o valor real do teu carro.">
            <input className={inputCls} inputMode="decimal" placeholder="por confirmar" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
          </Field>
          <Field label="Eficiência de carga (%)" hint="Perdas entre o carregador e a bateria.">
            <input className={inputCls} inputMode="decimal" value={efficiency} onChange={(e) => setEfficiency(e.target.value)} />
          </Field>
          <button onClick={() => setTab("sim")} className="w-full rounded-xl bg-white py-3 font-medium text-black active:opacity-80">Continuar</button>
        </section>
      )}

      {tab === "sim" && (
        <section className="space-y-5">
          <h2 className="text-lg font-medium">Simular</h2>
          <p className="text-sm text-zinc-500">
            {model || "Carro"} · {capacity.trim() ? `${capacity} kWh` : "capacidade por definir"} · eficiência {efficiency || "—"} %
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bateria atual (%)">
              <input className={inputCls} inputMode="decimal" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <Field label="Objetivo (%)">
              <input className={inputCls} inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
          </div>
          <Field label="Minutos de carga (opcional)" hint="Só é preciso se algum posto cobrar por minuto.">
            <input className={inputCls} inputMode="decimal" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
          </Field>
          <button onClick={onSimulate} className="w-full rounded-xl bg-white py-3 font-medium text-black active:opacity-80">Simular carregamento</button>
          {error && <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</p>}

          {result && (
            <div className="space-y-5 pt-2">
              <p className="text-sm text-zinc-400">
                Energia a pedir ao carregador:{" "}
                <span className="text-white">{new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(result.energyKwh)} kWh</span>
              </p>

              {best && (
                <div className="rounded-2xl border border-emerald-700/60 bg-emerald-950/20 p-5">
                  <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-black">MAIS BARATO</span>
                  <p className="mt-3 text-lg">{best.tariff.operator}</p>
                  <p className="text-sm text-zinc-400">{best.tariff.station}</p>
                  <p className="text-3xl font-light">{formatEur(best.totalEur)}</p>
                  <p className="mt-1 text-xs text-zinc-500">Preço de {formatPriceDate(best.tariff.priceDate)}</p>
                </div>
              )}

              <div className="flex gap-2">
                <button className={btn + (view === "list" ? " bg-zinc-800" : "")} onClick={() => showView("list")}>Lista</button>
                <button className={btn + (view === "map" ? " bg-zinc-800" : "")} onClick={() => showView("map")}>Mapa</button>
              </div>

              {view === "map" && <MapView result={result} stations={td.stations} coords={coords} me={me} />}

              {view === "list" && (<>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn + (sort === "price" ? " bg-zinc-800" : "")} onClick={() => setSort("price")}>Mais barato</button>
                <button className={btn + (sort === "near" ? " bg-zinc-800" : "")} onClick={me ? () => setSort("near") : locate}>
                  {me ? "Mais perto" : "Usar a minha localização"}
                </button>
              </div>
              {geoMsg && <p className="text-xs text-zinc-500">{geoMsg}</p>}

              <ul className="space-y-3">
                {rows.map(({ r, st, km }) => {
                  const key = `${r.tariff.operator}-${r.tariff.station}`;
                  return (
                    <li key={key} className="rounded-2xl border border-zinc-800 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p>
                            {r.tariff.operator}{" "}
                            {r === best && <span className="ml-1 rounded bg-emerald-500 px-1.5 text-[10px] font-semibold text-black">MAIS BARATO</span>}
                          </p>
                          <p className="text-xs text-zinc-500">{r.tariff.station} · {r.tariff.type}</p>
                          <p className="text-xs text-zinc-600">Preço de {formatPriceDate(r.tariff.priceDate)}</p>
                          {km != null && <p className="text-xs text-zinc-400">a {km.toFixed(1).replace(".", ",")} km de ti</p>}
                        </div>
                        <div className="text-right">
                          <p>{formatEur(r.totalEur)}</p>
                          {r !== best && <p className="text-xs text-zinc-500">+{formatEur(r.diffVsCheapestEur)}</p>}
                          <p className="text-xs text-zinc-400">{formatEurPerKwh(r.effectiveEurPerKwh)}</p>
                        </div>
                      </div>
                      {st?.address ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <a className={btn} href={navUrl(st.address)} target="_blank" rel="noreferrer">Navegar</a>
                          <a className={btn} href={wazeUrl(st.address)} target="_blank" rel="noreferrer">Waze</a>
                          <button className={btn} onClick={() => setMapOpen(mapOpen === key ? null : key)}>{mapOpen === key ? "Fechar mapa" : "Mapa"}</button>
                        </div>
                      ) : (
                        <p className="mt-3 text-xs text-zinc-600">Sem morada guardada para este posto.</p>
                      )}
                      {mapOpen === key && st?.address && (
                        <iframe title={`Mapa ${st.name}`} src={embedUrl(st.address)} className="mt-3 h-56 w-full rounded-xl border border-zinc-800" loading="lazy" />
                      )}
                    </li>
                  );
                })}
              </ul>
              </>)}

              {result.pending.length > 0 && (
                <ul className="space-y-2">
                  {result.pending.map((p, i) => (
                    <li key={`${p.tariff.operator}-${p.tariff.station}-${i}`} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-900 px-4 py-3 text-sm">
                      <span className="text-zinc-300">{p.tariff.operator}{p.tariff.station ? ` · ${p.tariff.station}` : ""}</span>
                      <span className="text-right text-zinc-500">{p.status === "unconfirmed" ? "Tarifa não confirmada" : "Indica os minutos de carga"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      <nav className="fixed inset-x-0 bottom-0 border-t border-zinc-900 bg-black/90 backdrop-blur">
        <div className="mx-auto flex max-w-md">
          {([["car", "Carro"], ["sim", "Simular"]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`flex-1 py-4 text-sm tracking-wide ${tab === id ? "text-white" : "text-zinc-600"}`}>{label}</button>
          ))}
        </div>
      </nav>
    </main>
  );
}
