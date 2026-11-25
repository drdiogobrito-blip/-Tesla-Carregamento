import type { Tariff } from "./calc";

export type Card = { name: string; cemeEurPerKwh: number | null; priceDate: string | null; source: string | null };
export type Station = {
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  type: "AC" | "DC" | null;
  opcEurPerKwh: number | null;
  opcActivationEur: number | null;
  opcPerMinEur: number | null;
  tar: "MT" | "BT" | null;
  priceDate: string | null;
  source: string | null;
};
export type Regulated = { tarMT: number; tarBT: number; iec: number; iva: number };
export type TariffData = { regulated: Regulated; cards: Card[]; stations: Station[] };

/** Junta cartão (preço nacional) + posto (taxas do operador + TAR) numa tarifa com IVA incluído. */
export function buildTariffs(d: TariffData): Tariff[] {
  const k = 1 + d.regulated.iva;
  const out: Tariff[] = [];
  for (const c of d.cards) {
    for (const s of d.stations) {
      const tar = s.tar === "MT" ? d.regulated.tarMT : s.tar === "BT" ? d.regulated.tarBT : null;
      const ok = c.cemeEurPerKwh != null && s.opcEurPerKwh != null && tar != null;
      const date = c.priceDate && s.priceDate ? (c.priceDate < s.priceDate ? c.priceDate : s.priceDate) : null;
      out.push({
        operator: c.name,
        station: s.name,
        type: s.type,
        eurPerKwh: ok ? (c.cemeEurPerKwh! + s.opcEurPerKwh! + tar! + d.regulated.iec) * k : null,
        activationFeeEur: ok ? (s.opcActivationEur ?? 0) * k : null,
        perMinuteFeeEur: ok && s.opcPerMinEur ? s.opcPerMinEur * k : null,
        priceDate: date,
        source: `${c.source ?? c.name}; ${s.source ?? s.name}`,
      });
    }
  }
  return out;
}

export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(r(b.lat - a.lat) / 2) ** 2 +
    Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const navUrl = (addr: string) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr)}&travelmode=driving`;
export const wazeUrl = (addr: string) => `https://waze.com/ul?q=${encodeURIComponent(addr)}&navigate=yes`;
export const embedUrl = (addr: string) => `https://www.google.com/maps?q=${encodeURIComponent(addr)}&output=embed`;
