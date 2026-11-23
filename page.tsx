"use client";

import { useEffect, useState } from "react";
import tariffsData from "@/data/tariffs.json";
import {
  formatEur,
  formatEurPerKwh,
  formatPriceDate,
  simulate,
  validateInput,
  type SimulationInput,
  type SimulationOutput,
  type Tariff,
} from "@/lib/calc";

const tariffs = tariffsData as Tariff[];
const STORAGE_KEY = "tcfl-car-v1";

function parseNum(s: string): number {
  const t = s.trim().replace(",", ".");
  return t === "" ? NaN : Number(t);
}

const inputCls =
  "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
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

  // Ecrã 1 – carro
  const [model, setModel] = useState("Model Y");
  const [capacity, setCapacity] = useState("");
  const [efficiency, setEfficiency] = useState("90");

  // Ecrã 2 – simulação
  const [current, setCurrent] = useState("20");
  const [target, setTarget] = useState("80");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimulationOutput | null>(null);

  // Guardar/ler definições do carro no browser (opcional, falha em silêncio)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (typeof s.model === "string") setModel(s.model);
        if (typeof s.capacity === "string") setCapacity(s.capacity);
        if (typeof s.efficiency === "string") setEfficiency(s.efficiency);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ model, capacity, efficiency }));
    } catch {}
  }, [model, capacity, efficiency]);

  function onSimulate() {
    const mins = parseNum(minutes);
    const input: SimulationInput = {
      capacityKwh: parseNum(capacity),
      currentPct: parseNum(current),
      targetPct: parseNum(target),
      efficiencyPct: parseNum(efficiency),
      minutes: Number.isNaN(mins) ? null : mins,
    };
    const err = validateInput(input);
    if (err) {
      setError(err);
      setResult(null);
      return;
    }
    setError(null);
    setResult(simulate(tariffs, input));
  }

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
            <input
              className={inputCls}
              inputMode="decimal"
              placeholder="por confirmar"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
            />
          </Field>
          <Field label="Eficiência de carga (%)" hint="Perdas entre o carregador e a bateria.">
            <input
              className={inputCls}
              inputMode="decimal"
              value={efficiency}
              onChange={(e) => setEfficiency(e.target.value)}
            />
          </Field>
          <button
            onClick={() => setTab("sim")}
            className="w-full rounded-xl bg-white py-3 font-medium text-black active:opacity-80"
          >
            Continuar
          </button>
        </section>
      )}

      {tab === "sim" && (
        <section className="space-y-5">
          <h2 className="text-lg font-medium">Simular</h2>
          <p className="text-sm text-zinc-500">
            {model || "Carro"} · {capacity.trim() ? `${capacity} kWh` : "capacidade por definir"} ·
            eficiência {efficiency || "—"} %
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Bateria atual (%)">
              <input
                className={inputCls}
                inputMode="decimal"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
              />
            </Field>
            <Field label="Objetivo (%)">
              <input
                className={inputCls}
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
            </Field>
          </div>
          <Field
            label="Minutos de carga (opcional)"
            hint="Só é preciso se algum operador cobrar por minuto."
          >
            <input
              className={inputCls}
              inputMode="decimal"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </Field>

          <button
            onClick={onSimulate}
            className="w-full rounded-xl bg-white py-3 font-medium text-black active:opacity-80"
          >
            Simular carregamento
          </button>

          {error && (
            <p className="rounded-xl border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          {result && (
            <div className="space-y-6 pt-2">
              <p className="text-sm text-zinc-400">
                Energia a pedir ao carregador:{" "}
                <span className="text-white">
                  {new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 2 }).format(
                    result.energyKwh,
                  )}{" "}
                  kWh
                </span>
              </p>

              {best ? (
                <>
                  <div className="rounded-2xl border border-emerald-700/60 bg-emerald-950/20 p-5">
                    <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[11px] font-semibold tracking-wider text-black">
                      MAIS BARATO
                    </span>
                    <p className="mt-3 text-lg">{best.tariff.operator}</p>
                    <p className="text-3xl font-light">{formatEur(best.totalEur)}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Preço de {formatPriceDate(best.tariff.priceDate)}
                    </p>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-zinc-800">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">
                        <tr>
                          <th className="px-4 py-3 font-medium">Operador</th>
                          <th className="px-3 py-3 text-right font-medium">Total</th>
                          <th className="px-4 py-3 text-right font-medium">€/kWh efetivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-900">
                        {result.ranked.map((r, i) => (
                          <tr key={`${r.tariff.operator}-${r.tariff.station}-${r.tariff.type}-${i}`}>
                            <td className="px-4 py-3 align-top">
                              <div className="flex items-center gap-2">
                                <span>{r.tariff.operator}</span>
                                {i === 0 && (
                                  <span className="rounded bg-emerald-500 px-1.5 text-[10px] font-semibold text-black">
                                    MAIS BARATO
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 text-xs text-zinc-500">
                                {[r.tariff.station, r.tariff.type].filter(Boolean).join(" · ") ||
                                  "posto não indicado"}
                              </div>
                              <div className="text-xs text-zinc-600">
                                Preço de {formatPriceDate(r.tariff.priceDate)}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-right align-top">
                              <div>{formatEur(r.totalEur)}</div>
                              {i > 0 && (
                                <div className="text-xs text-zinc-500">
                                  +{formatEur(r.diffVsCheapestEur)}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right align-top text-zinc-300">
                              {formatEurPerKwh(r.effectiveEurPerKwh)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-zinc-800 px-4 py-3 text-sm text-zinc-400">
                  Nenhuma tarifa preenchida. Edita <code>data/tariffs.json</code> para ver custos.
                </p>
              )}

              {result.pending.length > 0 && (
                <ul className="space-y-2">
                  {result.pending.map((p, i) => (
                    <li
                      key={`${p.tariff.operator}-${i}`}
                      className="flex items-center justify-between rounded-xl border border-zinc-900 px-4 py-3 text-sm"
                    >
                      <span className="text-zinc-300">
                        {p.tariff.operator}
                        {p.tariff.station ? ` · ${p.tariff.station}` : ""}
                      </span>
                      <span className="text-zinc-500">
                        {p.status === "unconfirmed"
                          ? "Tarifa não confirmada"
                          : "Indica os minutos de carga"}
                      </span>
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
          {(
            [
              ["car", "Carro"],
              ["sim", "Simular"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-4 text-sm tracking-wide ${
                tab === id ? "text-white" : "text-zinc-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
