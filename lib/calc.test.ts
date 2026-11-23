import { describe, expect, it } from "vitest";
import {
  costForTariff,
  energyNeededKwh,
  simulate,
  validateInput,
  type SimulationInput,
  type Tariff,
} from "./calc";

const tariff = (over: Partial<Tariff> = {}): Tariff => ({
  operator: "Teste",
  station: null,
  type: null,
  eurPerKwh: null,
  activationFeeEur: null,
  perMinuteFeeEur: null,
  priceDate: null,
  source: null,
  ...over,
});

const base: SimulationInput = {
  capacityKwh: 75,
  currentPct: 20,
  targetPct: 80,
  efficiencyPct: 100,
};

describe("energyNeededKwh", () => {
  it("75 kWh, 20→80 %, eficiência 100 % => 45 kWh", () => {
    expect(energyNeededKwh(base)).toBeCloseTo(45, 10);
  });

  it("divide pela eficiência (90 % => 50 kWh)", () => {
    expect(energyNeededKwh({ ...base, efficiencyPct: 90 })).toBeCloseTo(50, 10);
  });

  it("rejeita objetivo <= atual", () => {
    expect(() => energyNeededKwh({ ...base, targetPct: 20 })).toThrow(RangeError);
  });
});

describe("costForTariff", () => {
  it("caso de referência: 45 kWh × 0,50 €/kWh + 0 € ativação = 22,50 €", () => {
    const energy = energyNeededKwh(base);
    expect(energy).toBeCloseTo(45, 10);
    const r = costForTariff(tariff({ eurPerKwh: 0.5, activationFeeEur: 0 }), energy);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.totalEur).toBeCloseTo(22.5, 10);
      expect(r.effectiveEurPerKwh).toBeCloseTo(0.5, 10);
    }
  });

  it("soma taxa de ativação", () => {
    const r = costForTariff(tariff({ eurPerKwh: 0.5, activationFeeEur: 1 }), 45);
    expect(r.status === "ok" && r.totalEur).toBeCloseTo(23.5, 10);
  });

  it("soma minutos × taxa por minuto", () => {
    const r = costForTariff(tariff({ eurPerKwh: 0.5, perMinuteFeeEur: 0.1 }), 45, 30);
    expect(r.status === "ok" && r.totalEur).toBeCloseTo(25.5, 10);
  });

  it("taxa por minuto sem minutos => precisa de minutos (não inventa)", () => {
    const r = costForTariff(tariff({ eurPerKwh: 0.5, perMinuteFeeEur: 0.1 }), 45, null);
    expect(r.status).toBe("needs-minutes");
  });

  it("sem €/kWh => tarifa não confirmada", () => {
    expect(costForTariff(tariff(), 45).status).toBe("unconfirmed");
  });
});

describe("simulate", () => {
  it("ordena do mais barato para o mais caro e calcula diferenças", () => {
    const out = simulate(
      [
        tariff({ operator: "Caro", eurPerKwh: 0.7 }),
        tariff({ operator: "Barato", eurPerKwh: 0.5 }),
        tariff({ operator: "Sem preço" }),
      ],
      base,
    );
    expect(out.ranked.map((r) => r.tariff.operator)).toEqual(["Barato", "Caro"]);
    expect(out.ranked[0].diffVsCheapestEur).toBe(0);
    expect(out.ranked[1].diffVsCheapestEur).toBeCloseTo(9, 10); // 31,50 − 22,50
    expect(out.pending.map((p) => p.tariff.operator)).toEqual(["Sem preço"]);
  });

  it("sem tarifas preenchidas => lista vazia", () => {
    expect(simulate([tariff(), tariff()], base).ranked).toEqual([]);
  });
});

describe("validateInput", () => {
  it("exige capacidade", () => {
    expect(validateInput({ ...base, capacityKwh: NaN })).not.toBeNull();
  });
  it("aceita dados válidos", () => {
    expect(validateInput(base)).toBeNull();
  });
});
