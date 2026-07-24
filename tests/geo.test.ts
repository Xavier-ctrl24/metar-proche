// tests/geo.test.ts
// Tests de src/geo.ts. Trois familles de fonctions :
//   1. haversineKm / bearingDeg : maths pures. Attendus calculés puis vérifiés
//      contre des références connues (distance Paris-Londres, caps cardinaux).
//      Ils tombent sous l'exception « maths pures » déjà actée avec Xavier.
//   2. solar : calcul astronomique NOAA. On ne teste QUE des vérités externes
//      (almanach, géométrie du cercle arctique), jamais la sortie du code contre
//      elle-même. Les heures exactes de lever/coucher à Paris viennent d'un
//      almanach public, pas de notre implémentation.
//   3. resolveTimezone : simple relais vers tz-lookup, on vérifie deux points.

import { describe, it, expect } from "vitest";
import { haversineKm, bearingDeg, solar, resolveTimezone } from "../src/geo";

describe("haversineKm", () => {
  it("vaut 0 pour deux points identiques", () => {
    expect(haversineKm(48, 7, 48, 7)).toBe(0);
  });

  it("Paris → Londres ≈ 344 km (référence orthodromie connue)", () => {
    // ~343,6 km selon le grand cercle. On tolère 1 km d'arrondi de modèle.
    expect(haversineKm(48.8566, 2.3522, 51.5074, -0.1278)).toBeCloseTo(343.56, 1);
  });

  it("un quart d'équateur ≈ 10 008 km", () => {
    expect(haversineKm(0, 0, 0, 90)).toBeCloseTo(10007.5, 0);
  });

  it("équateur → pôle ≈ 10 008 km (même distance qu'un quart de tour)", () => {
    expect(haversineKm(0, 0, 90, 0)).toBeCloseTo(10007.5, 0);
  });
});

describe("bearingDeg", () => {
  it("plein nord = 0°", () => {
    expect(bearingDeg(0, 0, 1, 0)).toBeCloseTo(0, 5);
  });
  it("plein est = 90°", () => {
    expect(bearingDeg(0, 0, 0, 1)).toBeCloseTo(90, 5);
  });
  it("plein sud = 180°", () => {
    expect(bearingDeg(0, 0, -1, 0)).toBeCloseTo(180, 5);
  });
  it("plein ouest = 270°", () => {
    expect(bearingDeg(0, 0, 0, -1)).toBeCloseTo(270, 5);
  });
  it("reste dans [0, 360[", () => {
    const b = bearingDeg(48.8566, 2.3522, 51.5074, -0.1278);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
    // Londres est au nord-ouest de Paris : cap ≈ 330° (NNO).
    expect(b).toBeCloseTo(330, 0);
  });
});

describe("solar — vérités astronomiques externes", () => {
  it("Paris au solstice d'été : lever/coucher conformes à l'almanach (UTC)", () => {
    const r = solar(48.8566, 2.3522, new Date("2026-06-21T12:00:00Z"));
    // Almanach : lever ≈ 05:47 locale (CEST = UTC+2) → 03:47 UTC,
    //            coucher ≈ 21:57 locale → 19:57 UTC. Tolérance ±2 min.
    expect(hhmm(r.sunriseUtc)).toBe("03:47");
    expect(hhmm(r.sunsetUtc)).toBe("19:57");
    expect(r.isDay).toBe(true); // midi : le soleil est haut
  });

  it("Paris en pleine nuit (01:00 UTC en été) : isDay faux", () => {
    const r = solar(48.8566, 2.3522, new Date("2026-06-21T01:00:00Z"));
    expect(r.isDay).toBe(false);
  });

  it("au-dessus du cercle arctique au solstice d'été : jour polaire", () => {
    // URMM (Mourmansk) ~68,8°N, bien au nord du cercle arctique (66,56°N).
    // Le soleil ne se couche pas : pas d'instant de lever ni de coucher.
    const r = solar(68.78, 33.03, new Date("2026-06-21T12:00:00Z"));
    expect(r.sunriseUtc).toBeNull();
    expect(r.sunsetUtc).toBeNull();
    expect(r.isDay).toBe(true); // et il fait jour en permanence
  });

  it("au-dessus du cercle arctique au solstice d'hiver : nuit polaire", () => {
    const r = solar(68.78, 33.03, new Date("2026-12-21T12:00:00Z"));
    expect(r.sunriseUtc).toBeNull();
    expect(r.sunsetUtc).toBeNull();
    expect(r.isDay).toBe(false); // nuit permanente, même à midi
  });

  it("à l'équinoxe, à l'équateur, le jour dure environ 12 h", () => {
    const r = solar(0, 0, new Date("2026-03-20T12:00:00Z"));
    expect(r.sunriseUtc).not.toBeNull();
    expect(r.sunsetUtc).not.toBeNull();
    const durationH =
      (r.sunsetUtc!.getTime() - r.sunriseUtc!.getTime()) / 3_600_000;
    expect(durationH).toBeCloseTo(12, 0);
  });
});

describe("resolveTimezone", () => {
  it("Strasbourg → Europe/Paris", () => {
    expect(resolveTimezone(48.55, 7.63)).toBe("Europe/Paris");
  });
  it("Mourmansk → Europe/Moscow", () => {
    expect(resolveTimezone(68.78, 33.03)).toBe("Europe/Moscow");
  });
});

// Formate un instant UTC en "HH:MM" pour comparer aux heures d'almanach.
function hhmm(d: Date | null): string | null {
  if (d === null) return null;
  return d.toISOString().slice(11, 16);
}
