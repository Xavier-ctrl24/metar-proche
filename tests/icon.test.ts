// tests/icon.test.ts
// Tests de l'etape 7, cote ICONE (src/icon.ts). Contrairement aux textes
// francais, l'icone est ENTIEREMENT specifiee par Xavier : union fermee de
// litteraux + chaine de priorite. On teste donc directement et durement.
//
// L'essentiel de cette etape, c'est la PRIORITE. Un test qui ne verifie qu'une
// condition isolee ne prouve rien sur l'ordre. Pour chaque « barreau » de
// l'echelle, on fournit AUSSI une condition de rang inferieur et on verifie que
// le rang superieur l'emporte.

import { describe, it, expect } from "vitest";
import { pickIcon, dominantCondition } from "../src/icon.js";
import type { Cloud, Phenomenon } from "../src/types.js";

// Petit constructeur d'entree pour alleger les tests.
function dec(opts: { ph?: string[]; clouds?: Cloud[] | null; vv?: number | null }) {
  return {
    phenomena: (opts.ph ?? []).map((code): Phenomenon => ({ code, severity: "info" })),
    clouds: opts.clouds === undefined ? null : opts.clouds,
    verticalVisibility: opts.vv ?? null,
  };
}

const OVC: Cloud = { coverage: "OVC", altitude: 300, unit: "m" };
const BKN: Cloud = { coverage: "BKN", altitude: 500, unit: "m" };
const SCT: Cloud = { coverage: "SCT", altitude: 900, unit: "m" };
const FEW: Cloud = { coverage: "FEW", altitude: 300, unit: "m" };

describe("pickIcon : priorite (le rang superieur gagne malgre une condition inferieure)", () => {
  it("orage + ciel couvert -> thunderstorm", () => {
    expect(pickIcon(dec({ ph: ["TS"], clouds: [OVC] }), true)).toBe("thunderstorm");
  });

  it("pluie verglacante + nuages -> freezing_rain", () => {
    expect(pickIcon(dec({ ph: ["FZRA"], clouds: [BKN] }), true)).toBe("freezing_rain");
  });

  it("grele + nuages -> hail (et GS/PL aussi selon le choix de Xavier)", () => {
    expect(pickIcon(dec({ ph: ["GR"], clouds: [OVC] }), true)).toBe("hail");
    expect(pickIcon(dec({ ph: ["GS"] }), true)).toBe("hail");
    expect(pickIcon(dec({ ph: ["PL"] }), true)).toBe("hail");
  });

  it("melange pluie + neige (RASN) -> sleet", () => {
    expect(pickIcon(dec({ ph: ["RASN"] }), true)).toBe("sleet");
  });

  it("neige + nuages -> snow (l'emporte sur la couverture)", () => {
    expect(pickIcon(dec({ ph: ["SN"], clouds: [BKN] }), true)).toBe("snow");
  });

  it("pluie + nuages -> pluie (l'emporte sur la couverture)", () => {
    expect(pickIcon(dec({ ph: ["-RA"], clouds: [OVC] }), true)).toBe("rain_light");
  });

  it("brouillard + nuages -> fog", () => {
    expect(pickIcon(dec({ ph: ["FG"], clouds: [SCT] }), true)).toBe("fog");
  });

  it("brume + nuages -> mist", () => {
    expect(pickIcon(dec({ ph: ["BR"], clouds: [BKN] }), true)).toBe("mist");
  });

  it("brume seche (HZ) + nuages -> mist (choix de Xavier)", () => {
    // Cas reel du corpus CWLY : « HZ FEW017 BKN130 ». La brume doit primer.
    expect(pickIcon(dec({ ph: ["HZ"], clouds: [FEW, BKN] }), true)).toBe("mist");
  });

  it("cristaux de glace (IC) : aucune icone -> retombe sur les nuages", () => {
    // Choix de Xavier : IC n'a pas d'icone dediee, il n'influence donc pas la priorite.
    expect(pickIcon(dec({ ph: ["IC"], clouds: [OVC] }), true)).toBe("overcast");
  });
});

describe("pickIcon : intensite et variantes de pluie", () => {
  it("-RA -> rain_light, RA -> rain, +RA -> rain_heavy", () => {
    expect(pickIcon(dec({ ph: ["-RA"] }), true)).toBe("rain_light");
    expect(pickIcon(dec({ ph: ["RA"] }), true)).toBe("rain");
    expect(pickIcon(dec({ ph: ["+RA"] }), true)).toBe("rain_heavy");
  });

  it("bruine -> drizzle, averses -> showers", () => {
    expect(pickIcon(dec({ ph: ["DZ"] }), true)).toBe("drizzle");
    expect(pickIcon(dec({ ph: ["SHRA"] }), true)).toBe("showers_day");
  });
});

describe("pickIcon : brouillard implicite et fumee/sable", () => {
  it("visibilite verticale (VV) sans FG -> fog", () => {
    expect(pickIcon(dec({ vv: 30 }), true)).toBe("fog");
  });

  it("fumee -> smoke, poussiere/sable -> dust", () => {
    expect(pickIcon(dec({ ph: ["FU"] }), true)).toBe("smoke");
    expect(pickIcon(dec({ ph: ["DU"] }), true)).toBe("dust");
  });
});

describe("pickIcon : jour/nuit (uniquement clear, few, partly_cloudy, showers)", () => {
  it("ciel degage : clear_day le jour, clear_night la nuit", () => {
    expect(pickIcon(dec({ clouds: [] }), true)).toBe("clear_day");
    expect(pickIcon(dec({ clouds: [] }), false)).toBe("clear_night");
  });

  it("isDay inconnu (null) -> variante jour par defaut", () => {
    expect(pickIcon(dec({ clouds: [] }), null)).toBe("clear_day");
  });

  it("FEW et SCT suivent le jour/nuit", () => {
    expect(pickIcon(dec({ clouds: [FEW] }), true)).toBe("few_day");
    expect(pickIcon(dec({ clouds: [FEW] }), false)).toBe("few_night");
    expect(pickIcon(dec({ clouds: [SCT] }), true)).toBe("partly_cloudy_day");
    expect(pickIcon(dec({ clouds: [SCT] }), false)).toBe("partly_cloudy_night");
  });

  it("BKN et OVC sont neutres (cloudy / overcast, sans suffixe)", () => {
    expect(pickIcon(dec({ clouds: [BKN] }), false)).toBe("cloudy");
    expect(pickIcon(dec({ clouds: [OVC] }), true)).toBe("overcast");
  });

  it("averses la nuit -> showers_night", () => {
    expect(pickIcon(dec({ ph: ["SHRA"] }), false)).toBe("showers_night");
  });
});

describe("pickIcon : nuages multiples et cas indetermine", () => {
  it("plusieurs couches -> la plus couvrante decide l'icone", () => {
    // FEW + BKN + OVC : OVC (la plus dense) -> overcast.
    expect(pickIcon(dec({ clouds: [FEW, BKN, OVC] }), true)).toBe("overcast");
  });

  it("clouds null et aucun phenomene (panne) -> unknown", () => {
    expect(pickIcon(dec({ clouds: null }), true)).toBe("unknown");
  });

  it("clouds [] (CAVOK/CLR connu) -> clear, JAMAIS unknown", () => {
    // La distinction null (inconnu) vs [] (degage connu) vient de l'etape 5.
    expect(pickIcon(dec({ clouds: [] }), true)).toBe("clear_day");
  });
});

describe("dominantCondition : jeton neutre (utilise aussi par le headline)", () => {
  it("distingue les couvertures nuageuses", () => {
    expect(dominantCondition(dec({ clouds: [FEW] }))).toBe("cloud_few");
    expect(dominantCondition(dec({ clouds: [SCT] }))).toBe("cloud_sct");
    expect(dominantCondition(dec({ clouds: [BKN] }))).toBe("cloud_bkn");
    expect(dominantCondition(dec({ clouds: [OVC] }))).toBe("cloud_ovc");
    expect(dominantCondition(dec({ clouds: [] }))).toBe("clear");
  });
});
