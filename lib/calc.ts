export type ChargerType = "AC" | "DC";

export type Tariff = {
  operator: string;
  station: string | null; // posto / zona
  type: ChargerType | null;
  eurPerKwh: number | null;
  activationFeeEur: number | null;
  perMinuteFeeEur: number | null;
  priceDate: string | null; // AAAA-MM-DD
  source: string | null;
};

export type SimulationInput = {
  capacityKwh: number;
  currentPct: number;
  targetPct: number;
  efficiencyPct: number;
  minutes?: number | null; // opcional, só usado se houver taxa por minuto
};

export type CostOk = {
  status: "ok";
  tariff: Tariff;
  energyCostEur: number;
  activationEur: number;
  timeCostEur: number;
  totalEur: number;
  effectiveEurPerKwh: number;
  diffVsCheapestEur: number; // 0 para o mais barato
};

export type CostPending = {
  status: "unconfirmed" | "needs-minutes";
  tariff: Tariff;
};

export type SimulationOutput = {
  energyKwh: number;
  ranked: CostOk[]; // do mais barato para o mais caro
  pending: CostPending[];
};

/** Devolve uma mensagem de erro (em PT) ou null se os dados são válidos. */
export function validateInput(i: SimulationInput): string | null {
  if (!Number.isFinite(i.capacityKwh) || i.capacityKwh <= 0)
    return "Indica a capacidade da bateria (kWh) no ecrã Carro.";
  if (!Number.isFinite(i.efficiencyPct) || i.efficiencyPct <= 0 || i.efficiencyPct > 100)
    return "A eficiência de carga tem de estar entre 1 e 100 %.";
  if (!Number.isFinite(i.currentPct) || i.currentPct < 0 || i.currentPct > 100)
    return "A bateria atual tem de estar entre 0 e 100 %.";
  if (!Number.isFinite(i.targetPct) || i.targetPct < 0 || i.targetPct > 100)
    return "O objetivo tem de estar entre 0 e 100 %.";
  if (i.targetPct <= i.currentPct) return "O objetivo tem de ser superior à bateria atual.";
  if (i.minutes != null && (!Number.isFinite(i.minutes) || i.minutes < 0))
    return "Os minutos têm de ser um número positivo.";
  return null;
}

/** Energia (kWh) a pedir ao carregador: capacidade × (objetivo − atual) / 100, dividida pela eficiência. */
export function energyNeededKwh(i: SimulationInput): number {
  const error = validateInput(i);
  if (error) throw new RangeError(error);
  const stored = (i.capacityKwh * (i.targetPct - i.currentPct)) / 100;
  return stored / (i.efficiencyPct / 100);
}

/** Uma tarifa só é calculável se tiver €/kWh preenchido. */
export function isConfirmed(t: Tariff): boolean {
  return t.eurPerKwh != null;
}

function hasPerMinuteFee(t: Tariff): boolean {
  return t.perMinuteFeeEur != null && t.perMinuteFeeEur > 0;
}

/**
 * Custo = energia × €/kWh + taxa de ativação + (minutos × taxa por minuto, se existir).
 * Campos de taxa a null contam como 0 (não há taxa). €/kWh a null => tarifa não confirmada.
 */
export function costForTariff(
  t: Tariff,
  energyKwh: number,
  minutes?: number | null,
): Omit<CostOk, "diffVsCheapestEur"> | CostPending {
  if (t.eurPerKwh == null) return { status: "unconfirmed", tariff: t };
  if (hasPerMinuteFee(t) && minutes == null) return { status: "needs-minutes", tariff: t };

  const energyCostEur = energyKwh * t.eurPerKwh;
  const activationEur = t.activationFeeEur ?? 0;
  const timeCostEur = hasPerMinuteFee(t) ? (minutes as number) * (t.perMinuteFeeEur as number) : 0;
  const totalEur = energyCostEur + activationEur + timeCostEur;

  return {
    status: "ok",
    tariff: t,
    energyCostEur,
    activationEur,
    timeCostEur,
    totalEur,
    effectiveEurPerKwh: totalEur / energyKwh,
  };
}

export function simulate(tariffs: Tariff[], input: SimulationInput): SimulationOutput {
  const energyKwh = energyNeededKwh(input);
  const ok: Omit<CostOk, "diffVsCheapestEur">[] = [];
  const pending: CostPending[] = [];

  for (const t of tariffs) {
    const r = costForTariff(t, energyKwh, input.minutes);
    if (r.status === "ok") ok.push(r);
    else pending.push(r);
  }

  ok.sort((a, b) => a.totalEur - b.totalEur);
  const cheapest = ok.length > 0 ? ok[0].totalEur : 0;
  const ranked: CostOk[] = ok.map((r) => ({ ...r, diffVsCheapestEur: r.totalEur - cheapest }));

  return { energyKwh, ranked, pending };
}

export function formatEur(n: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(n);
}

export function formatEurPerKwh(n: number): string {
  return (
    new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n) +
    " €/kWh"
  );
}

/** "2026-11-23" -> "23/11/2026" (sem passar por Date, para evitar fusos horários). */
export function formatPriceDate(d: string | null): string {
  if (!d) return "data do preço não indicada";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}
