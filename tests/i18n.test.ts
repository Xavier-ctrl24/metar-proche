// tests/i18n.test.ts
// Tests de l'etape 6 (traduction francaise, src/i18n/fr.ts).
//
// REGLE ANTI « PARSER CONTRE LUI-MEME », version traduction : on ne teste QUE
// les chaines que Xavier a lui-meme formulees (dans PROMPT.md ou en repondant
// aux questions de conception). Tester une phrase que Claude aurait inventee
// reviendrait a valider le code contre sa propre invention.
//
// Sont donc testes ici :
//   - vent, visibilite, mots de couverture nuageuse, phenomenes : formules de Xavier
//   - la regle « couche la plus couvrante » et le format des phenomenes composes :
//     choix tranches par Xavier dans les questions de conception
//   - les sentinelles de bloc absent : null -> "" (decision de l'etape 5)
//   - rose des vents « du/d' », visibilite sous le km, virgule entre phenomenes :
//     formulations validees par Xavier apres coup
// N'est PAS teste : le headline (reporte a l'etape 7).

import { describe, it, expect } from "vitest";
import { windText, visibilityText, cloudsText, phenomenaText, headlineText, translateFr } from "../src/i18n/fr.js";
import type { WeatherCondition } from "../src/icon.js";

describe("windText (vent)", () => {
  it("exemple du contrat : 240 / 15 / rafale 30", () => {
    const t = windText({ speed: 15, unit: "kmh", gust: 30, directionDeg: 240, isVariable: false, isCalm: false });
    expect(t).toBe("Vent du sud-ouest, 15 km/h, rafales à 30");
  });

  it("vent calme -> « Pas de vent »", () => {
    const t = windText({ speed: 0, unit: "kmh", gust: null, directionDeg: null, isVariable: false, isCalm: true });
    expect(t).toBe("Pas de vent");
  });

  it("vent variable -> « Vent variable, 10 km/h »", () => {
    const t = windText({ speed: 10, unit: "kmh", gust: null, directionDeg: null, isVariable: true, isCalm: false });
    expect(t).toBe("Vent variable, 10 km/h");
  });

  it("preposition selon la direction : « du nord », « d'ouest »", () => {
    const nord = windText({ speed: 10, unit: "kmh", gust: null, directionDeg: 0, isVariable: false, isCalm: false });
    const ouest = windText({ speed: 10, unit: "kmh", gust: null, directionDeg: 270, isVariable: false, isCalm: false });
    expect(nord).toBe("Vent du nord, 10 km/h");
    expect(ouest).toBe("Vent d'ouest, 10 km/h");
  });

  it("bloc vent absent (null) -> chaine vide", () => {
    expect(windText(null)).toBe("");
  });
});

describe("visibilityText (visibilite)", () => {
  it("9999 -> « Plus de 10 km »", () => {
    expect(visibilityText({ value: 9999, unit: "m", isCavok: false })).toBe("Plus de 10 km");
  });

  it("2500 -> « 2,5 km » (virgule decimale francaise)", () => {
    expect(visibilityText({ value: 2500, unit: "m", isCavok: false })).toBe("2,5 km");
  });

  it("CAVOK -> « Plus de 10 km »", () => {
    expect(visibilityText({ value: null, unit: "m", isCavok: true })).toBe("Plus de 10 km");
  });

  it("sous 1 km -> metres bruts (« 400 m »)", () => {
    expect(visibilityText({ value: 400, unit: "m", isCavok: false })).toBe("400 m");
  });

  it("bloc visibilite absent (null) -> chaine vide", () => {
    expect(visibilityText(null)).toBe("");
  });
});

describe("cloudsText (nuages)", () => {
  it("exemple du contrat : SCT vers 900 m -> « Éclaircies vers 900 m »", () => {
    expect(cloudsText([{ coverage: "SCT", altitude: 900, unit: "m" }])).toBe("Éclaircies vers 900 m");
  });

  it("les quatre mots de couverture (formules de Xavier)", () => {
    expect(cloudsText([{ coverage: "FEW", altitude: 300, unit: "m" }])).toBe("Quelques nuages vers 300 m");
    expect(cloudsText([{ coverage: "SCT", altitude: 500, unit: "m" }])).toBe("Éclaircies vers 500 m");
    expect(cloudsText([{ coverage: "BKN", altitude: 500, unit: "m" }])).toBe("Ciel très nuageux vers 500 m");
    expect(cloudsText([{ coverage: "OVC", altitude: 2700, unit: "m" }])).toBe("Ciel couvert vers 2700 m");
  });

  it("plusieurs couches -> la plus couvrante (regle choisie par Xavier)", () => {
    // FEW010 + BKN018 + OVC090 : c'est OVC (la plus dense) qui est decrite.
    const t = cloudsText([
      { coverage: "FEW", altitude: 300, unit: "m" },
      { coverage: "BKN", altitude: 500, unit: "m" },
      { coverage: "OVC", altitude: 2700, unit: "m" },
    ]);
    expect(t).toBe("Ciel couvert vers 2700 m");
  });

  it("nuages inconnus (null) et ciel degage ([]) -> chaine vide", () => {
    expect(cloudsText(null)).toBe("");
    expect(cloudsText([])).toBe("");
  });
});

describe("phenomenaText (phenomenes)", () => {
  // Les sept formulations validees par Xavier (base + intensite en suffixe).
  const cas: Array<[string, string]> = [
    ["-RA", "Pluie faible"],
    ["+RA", "Pluie forte"],
    ["VCRA", "Pluie à proximité"],
    ["-TSRA", "Orage avec pluie faible"],
    ["-SHRA", "Averses de pluie faibles"],
    ["FZRA", "Pluie verglaçante"],
    ["TS", "Orage"],
  ];
  for (const [code, attendu] of cas) {
    it(`${code} -> « ${attendu} »`, () => {
      expect(phenomenaText([{ code, severity: "info" }])).toBe(attendu);
    });
  }

  it("plusieurs phenomenes -> separes par une virgule", () => {
    const t = phenomenaText([
      { code: "-RA", severity: "info" },
      { code: "BR", severity: "info" },
    ]);
    expect(t).toBe("Pluie faible, Brume");
  });

  it("aucun phenomene ([]) -> chaine vide", () => {
    expect(phenomenaText([])).toBe("");
  });
});

describe("headlineText (resume court, mots deja formules par Xavier)", () => {
  // Formulations authored : mots de nuages, noms de phenomenes, « Ciel degage »,
  // « Neige fondue ». Le jeton neutre vient du selecteur partage avec l'icone.
  const cas: Array<[WeatherCondition, string]> = [
    ["thunderstorm", "Orage"],
    ["freezing_rain", "Pluie verglaçante"],
    ["snow", "Neige"],
    ["sleet", "Neige fondue"],
    ["rain_light", "Pluie faible"],
    ["fog", "Brouillard"],
    ["clear", "Ciel dégagé"],
    ["cloud_sct", "Éclaircies"],
    ["cloud_ovc", "Ciel couvert"],
    ["unknown", ""],
  ];
  for (const [token, attendu] of cas) {
    it(`${token} -> « ${attendu} »`, () => {
      expect(headlineText(token)).toBe(attendu);
    });
  }
});

describe("translateFr (assemblage du bloc text)", () => {
  it("headline suit la priorite : orage l'emporte sur les nuages", () => {
    const text = translateFr({
      wind: { speed: 15, unit: "kmh", gust: null, directionDeg: 240, isVariable: false, isCalm: false },
      visibility: { value: 9999, unit: "m", isCavok: false },
      clouds: [{ coverage: "SCT", altitude: 900, unit: "m" }],
      phenomena: [{ code: "TS", severity: "danger" }],
    });
    expect(text.headline).toBe("Orage"); // TS domine, pas « Éclaircies »
    expect(text.wind).toBe("Vent du sud-ouest, 15 km/h");
    expect(text.visibility).toBe("Plus de 10 km");
    expect(text.clouds).toBe("Éclaircies vers 900 m"); // le detail nuages reste, lui
    expect(text.phenomena).toBe("Orage");
  });

  it("sans phenomene, le headline decrit les nuages dominants", () => {
    const text = translateFr({
      wind: null,
      visibility: null,
      clouds: [{ coverage: "SCT", altitude: 900, unit: "m" }],
      phenomena: [],
    });
    expect(text.headline).toBe("Éclaircies");
  });

  it("blocs tous absents -> tous les textes vides, aucune exception", () => {
    const text = translateFr({ wind: null, visibility: null, clouds: null, phenomena: [] });
    expect(text).toEqual({ headline: "", wind: "", visibility: "", clouds: "", phenomena: "" });
  });
});
