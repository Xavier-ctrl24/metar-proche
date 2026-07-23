// tests/units.test.ts
// Tests des conversions d'unites PURES (etape 4). Ecrits AVANT le code (src/units.ts).
// Regle de sortie validee : arrondi a l'entier partout ; l'arrondi grand public
// (2,5 km, "plus de 10 km") se fera plus tard dans la traduction, pas ici.

import { describe, it, expect } from "vitest";
import {
  knotsToKmh,
  mpsToKmh,
  inchesHgToHpa,
  statuteMilesToMeters,
  parseFraction,
  feetToMeters,
} from "../src/units";

describe("knotsToKmh (noeuds -> km/h, facteur 1,852)", () => {
  it("0 noeud reste 0", () => {
    expect(knotsToKmh(0)).toBe(0);
  });
  it("8 kt -> 15 km/h (14,816 arrondi)", () => {
    expect(knotsToKmh(8)).toBe(15);
  });
  it("9 kt -> 17 km/h (16,668 arrondi)", () => {
    expect(knotsToKmh(9)).toBe(17);
  });
  it("15 kt -> 28 km/h", () => {
    expect(knotsToKmh(15)).toBe(28);
  });
  it("30 kt (rafale) -> 56 km/h", () => {
    expect(knotsToKmh(30)).toBe(56);
  });
  it("100 kt -> 185 km/h", () => {
    expect(knotsToKmh(100)).toBe(185);
  });
});

describe("mpsToKmh (metres/seconde -> km/h, facteur 3,6)", () => {
  it("0 m/s reste 0", () => {
    expect(mpsToKmh(0)).toBe(0);
  });
  it("3 m/s -> 11 km/h (10,8 arrondi)", () => {
    expect(mpsToKmh(3)).toBe(11);
  });
  it("6 m/s -> 22 km/h", () => {
    expect(mpsToKmh(6)).toBe(22);
  });
  it("7 m/s -> 25 km/h (25,2 arrondi)", () => {
    expect(mpsToKmh(7)).toBe(25);
  });
  it("26 m/s -> 94 km/h", () => {
    expect(mpsToKmh(26)).toBe(94);
  });
});

describe("inchesHgToHpa (pouces de mercure -> hPa, facteur 33,8639)", () => {
  it("30,13 inHg (A3013) -> 1020 hPa", () => {
    expect(inchesHgToHpa(30.13)).toBe(1020);
  });
  it("29,92 inHg (atmosphere standard) -> 1013 hPa", () => {
    expect(inchesHgToHpa(29.92)).toBe(1013);
  });
  it("30,16 inHg (A3016) -> 1021 hPa", () => {
    expect(inchesHgToHpa(30.16)).toBe(1021);
  });
  it("29,98 inHg -> 1015 hPa", () => {
    expect(inchesHgToHpa(29.98)).toBe(1015);
  });
});

describe("statuteMilesToMeters (miles terrestres -> metres, facteur 1609,344)", () => {
  it("10 SM -> 16093 m", () => {
    expect(statuteMilesToMeters(10)).toBe(16093);
  });
  it("1/4 SM (0,25) -> 402 m", () => {
    expect(statuteMilesToMeters(0.25)).toBe(402);
  });
  it("1 1/2 SM (1,5) -> 2414 m", () => {
    expect(statuteMilesToMeters(1.5)).toBe(2414);
  });
  it("1 3/4 SM (1,75) -> 2816 m", () => {
    expect(statuteMilesToMeters(1.75)).toBe(2816);
  });
  it("1/8 SM (0,125) -> 201 m", () => {
    expect(statuteMilesToMeters(0.125)).toBe(201);
  });
  it("1 SM -> 1609 m", () => {
    expect(statuteMilesToMeters(1)).toBe(1609);
  });
});

describe("parseFraction (texte de fraction -> nombre, ou null si illisible)", () => {
  it("'10' -> 10", () => {
    expect(parseFraction("10")).toBe(10);
  });
  it("'1/4' -> 0,25", () => {
    expect(parseFraction("1/4")).toBe(0.25);
  });
  it("'1 1/2' -> 1,5 (entier + fraction)", () => {
    expect(parseFraction("1 1/2")).toBe(1.5);
  });
  it("'1 3/4' -> 1,75", () => {
    expect(parseFraction("1 3/4")).toBe(1.75);
  });
  it("'1/8' -> 0,125", () => {
    expect(parseFraction("1/8")).toBe(0.125);
  });
  it("'3/4' -> 0,75", () => {
    expect(parseFraction("3/4")).toBe(0.75);
  });
  it("chaine vide -> null", () => {
    expect(parseFraction("")).toBeNull();
  });
  it("texte non numerique -> null (jamais d'exception)", () => {
    expect(parseFraction("abc")).toBeNull();
  });
  it("division par zero -> null", () => {
    expect(parseFraction("1/0")).toBeNull();
  });
});

describe("feetToMeters (pieds -> metres, arrondi a la centaine)", () => {
  it("1600 ft (couche 016) -> 500 m", () => {
    expect(feetToMeters(1600)).toBe(500);
  });
  it("5000 ft (couche 050) -> 1500 m", () => {
    expect(feetToMeters(5000)).toBe(1500);
  });
  it("700 ft (couche 007) -> 200 m", () => {
    expect(feetToMeters(700)).toBe(200);
  });
  it("1000 ft (couche 010) -> 300 m", () => {
    expect(feetToMeters(1000)).toBe(300);
  });
  it("16000 ft (couche 160) -> 4900 m", () => {
    expect(feetToMeters(16000)).toBe(4900);
  });
  it("29000 ft (couche 290) -> 8800 m", () => {
    expect(feetToMeters(29000)).toBe(8800);
  });
  it("0 ft reste 0", () => {
    expect(feetToMeters(0)).toBe(0);
  });
});
