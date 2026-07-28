// tests/i18n.en.test.ts
// Tests de src/i18n/en.ts, la traduction ANGLAISE.
//
// VOCABULAIRE VALIDÉ PAR XAVIER LE 28/07/2026. Ces mots ont été PROPOSÉS par
// Claude, ce qui est l'inverse du fonctionnement normal du projet (le français
// de l'étape 6 a été écrit par Xavier) ; ils ont depuis été relus et acceptés,
// et sont donc acquis au même titre que le français. On ne les retouche plus
// sans lui.
//
// CE QUI NE CHANGE PAS POUR AUTANT, et c'est le vrai enseignement du fichier :
// on continue de ne PRESQUE RIEN épingler du vocabulaire. Ce qui est vérifié
// ici est OBJECTIF et indépendant du choix des mots : le séparateur décimal
// anglais, la POSITION de l'intensité (avant le nom en anglais, après en
// français), les sentinelles de chaîne vide, et la PARITÉ de structure avec le
// français. Raison : un test qui fige une formulation tombe à la première
// reformulation de Xavier, alors que ces propriétés-là, elles, survivent.
//
// C'est la parité qui porte le plus : elle attrape la branche oubliée dans
// en.ts, c'est-à-dire précisément le trou qu'un test écrit de mémoire ne voit
// pas (on ne teste que les cas auxquels on a pensé).

import { describe, it, expect } from "vitest";
import {
  windText,
  visibilityText,
  cloudsText,
  phenomenaText,
  headlineText,
  translateEn,
} from "../src/i18n/en.js";
import { translateFr } from "../src/i18n/fr.js";
import type { WeatherCondition } from "../src/icon.js";
import type { Cloud, Phenomenon, Visibility, Wind } from "../src/types.js";

describe("windText (wind)", () => {
  it("exemple du contrat, transposé : 240 / 15 / rafale 30", () => {
    const t = windText({
      speed: 15,
      unit: "kmh",
      gust: 30,
      directionDeg: 240,
      isVariable: false,
      isCalm: false,
    });
    expect(t).toBe("Wind from the southwest, 15 km/h, gusts to 30");
  });

  it("garde les unités MÉTRIQUES : « km/h » et non « mph »", () => {
    // v1 = métrique seulement, quelle que soit la langue. L'impérial est une
    // affaire d'UNITÉS (paramètre `units`, V2), pas de langue. Traduire en
    // anglais ne doit surtout pas convertir les valeurs au passage.
    const t = windText({
      speed: 15,
      unit: "kmh",
      gust: null,
      directionDeg: 90,
      isVariable: false,
      isCalm: false,
    });
    expect(t).toContain("km/h");
    expect(t).not.toContain("mph");
  });

  it("vent calme et vent variable", () => {
    expect(
      windText({ speed: 0, unit: "kmh", gust: null, directionDeg: null, isVariable: false, isCalm: true }),
    ).toBe("No wind");
    expect(
      windText({ speed: 10, unit: "kmh", gust: null, directionDeg: null, isVariable: true, isCalm: false }),
    ).toBe("Variable wind, 10 km/h");
  });

  it("aucune élision à gérer : « from the east » comme « from the north »", () => {
    // En français il fallait choisir entre « du » et « d' » ; en anglais la
    // tournure est invariable. La logique d'élision de fr.ts n'a donc PAS été
    // transposée : elle a été supprimée.
    const nord = windText({ speed: 10, unit: "kmh", gust: null, directionDeg: 0, isVariable: false, isCalm: false });
    const est = windText({ speed: 10, unit: "kmh", gust: null, directionDeg: 90, isVariable: false, isCalm: false });
    expect(nord).toBe("Wind from the north, 10 km/h");
    expect(est).toBe("Wind from the east, 10 km/h");
  });

  it("sentinelles : bloc absent et direction illisible -> chaîne vide", () => {
    expect(windText(null)).toBe("");
    expect(
      windText({ speed: 10, unit: "kmh", gust: null, directionDeg: null, isVariable: false, isCalm: false }),
    ).toBe("");
  });
});

describe("visibilityText (visibility)", () => {
  it("LE piège du portage : point décimal anglais, pas la virgule française", () => {
    // Le seul endroit où un portage ligne à ligne produit une faute visible :
    // fr.ts fait un .replace(".", ",") qu'il ne fallait surtout pas recopier.
    expect(visibilityText({ value: 2500, unit: "m", isCavok: false })).toBe("2.5 km");
    expect(visibilityText({ value: 2500, unit: "m", isCavok: false })).not.toContain(",");
  });

  it("9999 et CAVOK -> « More than 10 km »", () => {
    expect(visibilityText({ value: 9999, unit: "m", isCavok: false })).toBe("More than 10 km");
    expect(visibilityText({ value: null, unit: "m", isCavok: true })).toBe("More than 10 km");
  });

  it("sous 1 km -> mètres bruts, en mètres (unités métriques)", () => {
    expect(visibilityText({ value: 400, unit: "m", isCavok: false })).toBe("400 m");
  });

  it("sentinelles : bloc absent et valeur illisible -> chaîne vide", () => {
    expect(visibilityText(null)).toBe("");
    expect(visibilityText({ value: null, unit: "m", isCavok: false })).toBe("");
  });
});

describe("cloudsText (clouds)", () => {
  it("les quatre mots de couverture", () => {
    expect(cloudsText([{ coverage: "FEW", altitude: 300, unit: "m" }])).toBe("A few clouds at 300 m");
    expect(cloudsText([{ coverage: "SCT", altitude: 900, unit: "m" }])).toBe("Partly cloudy at 900 m");
    expect(cloudsText([{ coverage: "BKN", altitude: 500, unit: "m" }])).toBe("Mostly cloudy at 500 m");
    expect(cloudsText([{ coverage: "OVC", altitude: 2700, unit: "m" }])).toBe("Overcast at 2700 m");
  });

  it("plusieurs couches -> la plus couvrante, même règle qu'en français", () => {
    const t = cloudsText([
      { coverage: "FEW", altitude: 300, unit: "m" },
      { coverage: "BKN", altitude: 500, unit: "m" },
      { coverage: "OVC", altitude: 2700, unit: "m" },
    ]);
    expect(t).toBe("Overcast at 2700 m");
  });

  it("altitude inconnue -> la couverture seule, sans hauteur", () => {
    expect(cloudsText([{ coverage: "OVC", altitude: null, unit: "m" }])).toBe("Overcast");
  });

  it("sentinelles : nuages inconnus (null) et ciel dégagé ([]) -> chaîne vide", () => {
    expect(cloudsText(null)).toBe("");
    expect(cloudsText([])).toBe("");
  });
});

describe("phenomenaText (phenomena)", () => {
  // L'écart de STRUCTURE avec le français, et non de vocabulaire : en français
  // l'intensité SUIT le nom (« Pluie faible »), en anglais elle le PRÉCÈDE
  // (« Light rain »). Seul « à proximité » reste un suffixe dans les deux.
  //
  // Nuance que le français règle tout seul et pas l'anglais : dans « -TSRA »,
  // l'intensité porte sur la PLUIE, pas sur l'orage. Le français le dit dans
  // l'ordre naturel (« Orage avec pluie faible ») ; en anglais, préfixer
  // bêtement donnerait « Light thunderstorm with rain », qui veut dire autre
  // chose. Chaque libellé anglais porte donc sa PLACE d'insertion.
  const cas: Array<[string, string]> = [
    ["-RA", "Light rain"],
    ["+RA", "Heavy rain"],
    ["VCRA", "Rain in the vicinity"],
    ["-TSRA", "Thunderstorm with light rain"],
    ["-SHRA", "Light rain showers"],
    ["-FZRA", "Light freezing rain"],
    ["FZRA", "Freezing rain"],
    ["TS", "Thunderstorm"],
    // L'orage SEUL n'a pas de précipitation associée, donc l'intensité porte
    // sur l'orage lui-même et repasse devant, comme pour la pluie. Ces trois
    // cas manquaient et le code produisait « Thunderstormlight » : le libellé
    // composé et le libellé simple n'obéissent pas à la même règle de place.
    ["-TS", "Light thunderstorm"],
    ["+TS", "Heavy thunderstorm"],
    // VCTS est l'un des codes les plus fréquents des METAR réels.
    ["VCTS", "Thunderstorm in the vicinity"],
  ];
  for (const [code, attendu] of cas) {
    it(`${code} -> « ${attendu} »`, () => {
      expect(phenomenaText([{ code, severity: "info" }])).toBe(attendu);
    });
  }

  it("l'intensité précède le nom, elle ne le suit pas", () => {
    // Assertion de POSITION, indépendante du vocabulaire retenu : elle tiendra
    // même si Xavier renomme « Light » en autre chose.
    const t = phenomenaText([{ code: "-RA", severity: "info" }]);
    expect(t.toLowerCase().indexOf("light")).toBeLessThan(t.toLowerCase().indexOf("rain"));
  });

  it("plusieurs phénomènes -> séparés par une virgule, comme en français", () => {
    const t = phenomenaText([
      { code: "-RA", severity: "info" },
      { code: "BR", severity: "info" },
    ]);
    expect(t).toBe("Light rain, Mist");
  });

  it("code inconnu -> rendu tel quel plutôt qu'une exception (défensif)", () => {
    expect(phenomenaText([{ code: "ZZ", severity: "info" }])).toBe("Zz");
  });

  it("aucun phénomène ([]) -> chaîne vide", () => {
    expect(phenomenaText([])).toBe("");
  });
});

describe("headlineText (short summary)", () => {
  const cas: Array<[WeatherCondition, string]> = [
    ["thunderstorm", "Thunderstorm"],
    ["freezing_rain", "Freezing rain"],
    ["snow", "Snow"],
    ["sleet", "Sleet"],
    ["rain_light", "Light rain"],
    ["fog", "Fog"],
    ["clear", "Clear sky"],
    ["cloud_ovc", "Overcast"],
  ];
  for (const [jeton, attendu] of cas) {
    it(`${jeton} -> « ${attendu} »`, () => {
      expect(headlineText(jeton)).toBe(attendu);
    });
  }

  it("« unknown » ne produit AUCUN résumé, comme en français", () => {
    expect(headlineText("unknown")).toBe("");
  });
});

// ---------- Parité de structure avec le français ----------
// Le test le plus utile du fichier. Il ne regarde AUCUN mot : il vérifie que
// les deux langues répondent sur les mêmes cinq clés et, surtout, qu'elles sont
// vides exactement aux mêmes endroits. Une branche oubliée dans en.ts (un cas
// que fr.ts sait rédiger et pas lui) tombe ici, alors qu'aucun test par
// fonction ne l'aurait vue : on n'écrit de test que pour les cas auxquels on
// a pensé, et c'est justement le cas oublié qui manque.
describe("parité fr / en", () => {
  const VENT: Wind = {
    speed: 15,
    unit: "kmh",
    gust: 30,
    directionDeg: 240,
    isVariable: false,
    isCalm: false,
  };
  const VISI: Visibility = { value: 9999, unit: "m", isCavok: false };
  const NUAGES: Cloud[] = [{ coverage: "SCT", altitude: 900, unit: "m" }];
  const PLUIE: Phenomenon[] = [{ code: "-RA", severity: "info" }];

  // Cas représentatifs, choisis pour couvrir chaque sentinelle au moins une fois.
  const CAS: Array<{
    nom: string;
    d: {
      wind: Wind | null;
      visibility: Visibility | null;
      clouds: Cloud[] | null;
      phenomena: Phenomenon[];
      verticalVisibility?: number | null;
    };
  }> = [
    { nom: "METAR nominal complet", d: { wind: VENT, visibility: VISI, clouds: NUAGES, phenomena: PLUIE } },
    { nom: "tout absent", d: { wind: null, visibility: null, clouds: null, phenomena: [] } },
    { nom: "ciel dégagé connu", d: { wind: VENT, visibility: VISI, clouds: [], phenomena: [] } },
    {
      nom: "vent calme",
      d: {
        wind: { speed: 0, unit: "kmh", gust: null, directionDeg: null, isVariable: false, isCalm: true },
        visibility: VISI,
        clouds: NUAGES,
        phenomena: [],
      },
    },
    {
      nom: "orage",
      d: { wind: VENT, visibility: VISI, clouds: NUAGES, phenomena: [{ code: "TSRA", severity: "danger" }] },
    },
    {
      nom: "brouillard et visibilité réduite",
      d: {
        wind: null,
        visibility: { value: 400, unit: "m", isCavok: false },
        clouds: null,
        phenomena: [{ code: "FG", severity: "warning" }],
        verticalVisibility: 60,
      },
    },
  ];

  for (const { nom, d } of CAS) {
    it(`${nom} : mêmes clés, mêmes vides, textes différents`, () => {
      const fr = translateFr(d);
      const en = translateEn(d);

      // 1. Mêmes clés (le bloc `text` du contrat ne dépend pas de la langue).
      expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());

      // 2. Même motif de vide. C'est l'assertion qui attrape la branche oubliée.
      for (const cle of Object.keys(fr) as Array<keyof typeof fr>) {
        expect(
          en[cle] === "",
          `« ${cle} » vide en ${fr[cle] === "" ? "fr" : "en"} seulement`,
        ).toBe(fr[cle] === "");
      }

      // 3. Au moins une phrase non vide DIFFÈRE : sans ce contrôle, un en.ts
      // qui se contenterait de réexporter le français passerait les deux
      // premiers points sans qu'on le remarque.
      // Formulé « au moins une » et non « toutes », parce que certaines sorties
      // sont légitimement identiques dans les deux langues : une visibilité de
      // 400 m s'écrit « 400 m » en français comme en anglais.
      const cles = Object.keys(fr) as Array<keyof typeof fr>;
      const nonVides = cles.filter((c) => fr[c] !== "");
      if (nonVides.length > 0) {
        expect(nonVides.some((c) => en[c] !== fr[c])).toBe(true);
      }
    });
  }
});
