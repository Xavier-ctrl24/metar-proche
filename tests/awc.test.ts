// tests/awc.test.ts
// Tests de src/awc.ts (source de données de PRODUCTION, aviationweather.gov).
//
// Principe : AUCUN appel réseau réel ici. Deux raisons.
//   1. Un test qui dépend d'internet n'est pas un test, c'est un pari.
//   2. Le flux mondial change toutes les 30 minutes : les attendus seraient
//      périmés avant même d'être écrits.
// On injecte donc un faux `fetch` et une horloge figée (`nowMs`). C'est la
// raison pour laquelle awc.ts sépare le PUR (URL, tri, sélection) de l'IMPUR
// (le réseau) : seul le pur porte de la logique, et le pur se teste sans I/O.
//
// Les lignes de FIXTURE ci-dessous sont de VRAIES lignes capturées le
// 24/07/2026 sur aviationweather.gov (bbox autour de Strasbourg), copiées
// telles quelles. Ce ne sont pas des données inventées par le code testé.

import { describe, it, expect } from "vitest";
import {
  buildBboxUrl,
  normalizeRows,
  selectNearest,
  fetchNearest,
  MAX_AGE_MS,
} from "../src/awc";

// ---------- Fixtures : vraies lignes AWC du 24/07/2026 ----------
// On n'en garde que 4 sur 16, suffisantes pour départager les distances.
// Position de référence des tests : Brumath (48.73, 7.71).
// À vol d'oiseau : LFST ~21 km, EDSB ~28 km, LFSB ~130 km, EDDF ~166 km.
const ROWS_REELLES = [
  {
    icaoId: "EDDF",
    name: "Frankfurt Intl, HE, DE",
    lat: 50.045,
    lon: 8.598,
    obsTime: 1784913600, // 2026-07-24T17:20:00Z
    reportTime: "2026-07-24T17:20:00.000Z",
    rawOb: "METAR EDDF 241720Z 27008KT 9999 FEW040 26/14 Q1015 NOSIG",
  },
  {
    icaoId: "LFST",
    name: "Strasbourg/Entzheim, GES, FR",
    lat: 48.549,
    lon: 7.64,
    obsTime: 1784912400, // 2026-07-24T17:00:00Z
    reportTime: "2026-07-24T17:00:00.000Z",
    rawOb: "METAR LFST 241700Z 24008KT 9999 SCT030 24/14 Q1018 NOSIG",
  },
  {
    icaoId: "EDSB",
    name: "Karlsruhe/Baden-Baden, BW, DE",
    lat: 48.779,
    lon: 8.081,
    obsTime: 1784913600,
    reportTime: "2026-07-24T17:20:00.000Z",
    rawOb: "METAR EDSB 241720Z AUTO 25006KT 9999 SCT035 25/13 Q1016",
  },
  {
    icaoId: "LFSB",
    name: "Bale-Mulhouse, GES, FR",
    lat: 47.614,
    lon: 7.51,
    obsTime: 1784912400,
    reportTime: "2026-07-24T17:00:00.000Z",
    rawOb: "METAR LFSB 241700Z 23007KT 9999 FEW035 25/15 Q1017 NOSIG",
  },
];

// Horloge figée : 17h30 UTC le 24/07/2026, soit 10 min après la plus récente
// observation de la fixture et 30 min après la plus ancienne. Toutes fraîches.
const NOW_MS = Date.parse("2026-07-24T17:30:00.000Z");
const BRUMATH = { lat: 48.73, lon: 7.71 };

// Fabrique un faux `fetch` : il renvoie, à chaque appel successif, la réponse
// suivante de la liste fournie. Permet de simuler « 1er essai vide, 2e peuplé ».
function fakeFetch(reponses: unknown[]) {
  const urlsAppelees: string[] = [];
  let i = 0;
  const impl = async (url: string) => {
    urlsAppelees.push(url);
    const corps = reponses[Math.min(i, reponses.length - 1)];
    i += 1;
    return { ok: true, status: 200, json: async () => corps };
  };
  return { impl, urlsAppelees };
}

// ---------- 1. Construction de l'URL ----------
describe("buildBboxUrl", () => {
  it("respecte l'ordre latMin,lonMin,latMax,lonMax et le format json", () => {
    const url = buildBboxUrl(48.73, 7.71, 1.5);
    expect(url).toContain("https://aviationweather.gov/api/data/metar");
    expect(url).toContain("format=json");
    // 48,73 ± 1,5 et 7,71 ± 1,5, arrondis à 2 décimales.
    expect(url).toContain("bbox=47.23%2C6.21%2C50.23%2C9.21");
  });

  it("borne la latitude aux pôles (pas de latMax à 90,5°)", () => {
    // Tromsø extrême nord : 89,5 + 1,5 dépasserait le pôle.
    const url = buildBboxUrl(89.5, 20, 1.5);
    expect(url).toContain("bbox=88%2C18.5%2C90%2C21.5");
  });

  it("borne la longitude à l'antiméridien (choix v1 assumé)", () => {
    // 179 + 1,5 = 180,5 n'existe pas. On borne à 180 : la couverture est
    // dégradée juste à l'antiméridien, mais l'URL reste valide.
    const url = buildBboxUrl(-17, 179, 1.5);
    expect(url).toContain("bbox=-18.5%2C177.5%2C-15.5%2C180");
  });
});

// ---------- 2. Normalisation défensive des lignes AWC ----------
describe("normalizeRows", () => {
  it("convertit les vraies lignes AWC en stations exploitables", () => {
    const stations = normalizeRows(ROWS_REELLES);
    expect(stations).toHaveLength(4);
    const lfst = stations.find((s) => s.icao === "LFST")!;
    expect(lfst.name).toBe("Strasbourg/Entzheim, GES, FR");
    expect(lfst.lat).toBe(48.549);
    expect(lfst.observedAtMs).toBe(Date.parse("2026-07-24T17:00:00.000Z"));
    expect(lfst.raw).toContain("LFST 241700Z");
  });

  it("ignore une ligne sans coordonnées (impossible à classer par distance)", () => {
    const stations = normalizeRows([
      { icaoId: "XXXX", rawOb: "XXXX 241700Z NIL", obsTime: 1784912400 },
    ]);
    expect(stations).toHaveLength(0);
  });

  it("ignore une ligne sans horodatage (âge incalculable)", () => {
    const stations = normalizeRows([
      { icaoId: "XXXX", lat: 48, lon: 7, rawOb: "XXXX 241700Z NIL" },
    ]);
    expect(stations).toHaveLength(0);
  });

  it("ignore une ligne sans METAR brut (rien à décoder ensuite)", () => {
    const stations = normalizeRows([
      { icaoId: "XXXX", lat: 48, lon: 7, obsTime: 1784912400 },
    ]);
    expect(stations).toHaveLength(0);
  });

  it("accepte reportTime quand obsTime manque", () => {
    const stations = normalizeRows([
      {
        icaoId: "XXXX",
        lat: 48,
        lon: 7,
        reportTime: "2026-07-24T17:00:00.000Z",
        rawOb: "XXXX 241700Z 24008KT",
      },
    ]);
    expect(stations).toHaveLength(1);
    expect(stations[0].observedAtMs).toBe(Date.parse("2026-07-24T17:00:00.000Z"));
  });

  it("ne lève jamais sur une charge utile aberrante", () => {
    // Ce que le serveur peut renvoyer un mauvais jour : pas un tableau,
    // des null, des types faux. Aucune de ces entrées ne doit crasher.
    expect(() => normalizeRows(null)).not.toThrow();
    expect(normalizeRows(null)).toEqual([]);
    expect(normalizeRows("panne serveur")).toEqual([]);
    expect(normalizeRows({ error: "boom" })).toEqual([]);
    expect(normalizeRows([null, 42, "texte", {}])).toEqual([]);
    expect(
      normalizeRows([{ icaoId: "XXXX", lat: "nord", lon: 7, obsTime: 1, rawOb: "x" }]),
    ).toEqual([]);
  });
});

// ---------- 3. Sélection de la station la plus proche ----------
describe("selectNearest", () => {
  const stations = normalizeRows(ROWS_REELLES);

  it("retient la plus proche de Brumath : LFST (Strasbourg)", () => {
    const r = selectNearest(stations, BRUMATH.lat, BRUMATH.lon, NOW_MS, MAX_AGE_MS);
    expect(r).not.toBeNull();
    expect(r!.station.icao).toBe("LFST");
    // ~21 km, non arrondi (l'arrondi d'affichage est l'affaire de l'étape 10).
    expect(r!.distanceKm).toBeGreaterThan(19);
    expect(r!.distanceKm).toBeLessThan(23);
    // Strasbourg est au sud-sud-ouest de Brumath : cap ~190-200°.
    expect(r!.bearingDeg).toBeGreaterThan(180);
    expect(r!.bearingDeg).toBeLessThan(220);
    // Observée à 17:00, horloge à 17:30 → 30 minutes.
    expect(r!.ageMinutes).toBe(30);
  });

  it("change de station quand on change de position (Francfort)", () => {
    const r = selectNearest(stations, 50.0, 8.6, NOW_MS, MAX_AGE_MS);
    expect(r!.station.icao).toBe("EDDF");
  });

  it("écarte les observations trop vieilles et prend la suivante", () => {
    // Horloge à 20:05 UTC : LFST et LFSB (obs 17:00) ont 3 h 05, donc périmées ;
    // EDSB et EDDF (obs 17:20) ont 2 h 45, donc encore valables. La plus proche
    // de Brumath PARMI LES VALABLES est EDSB, bien que LFST soit plus proche.
    const tard = Date.parse("2026-07-24T20:05:00.000Z");
    const r = selectNearest(stations, BRUMATH.lat, BRUMATH.lon, tard, MAX_AGE_MS);
    expect(r).not.toBeNull();
    // LFST (3 h 05) est périmée, EDSB (2 h 45) ne l'est pas : c'est elle.
    expect(r!.station.icao).toBe("EDSB");
  });

  it("renvoie null si toutes les observations sont périmées", () => {
    const beaucoupPlusTard = Date.parse("2026-07-25T12:00:00.000Z");
    const r = selectNearest(
      stations,
      BRUMATH.lat,
      BRUMATH.lon,
      beaucoupPlusTard,
      MAX_AGE_MS,
    );
    expect(r).toBeNull();
  });

  it("renvoie null sur une liste vide", () => {
    expect(selectNearest([], BRUMATH.lat, BRUMATH.lon, NOW_MS, MAX_AGE_MS)).toBeNull();
  });

  it("accepte une observation légèrement en avance (tolérance 1 h)", () => {
    // Les horloges des stations ne sont pas parfaites, et notre propre horloge
    // non plus : une obs à 17:20 vue à 17:10 est normale, pas suspecte.
    // On se place près d'EDSB pour que la station la plus proche soit
    // justement celle dont l'obs est en avance de 10 minutes.
    const r = selectNearest(
      stations,
      48.78,
      8.08,
      Date.parse("2026-07-24T17:10:00.000Z"),
      MAX_AGE_MS,
    );
    expect(r).not.toBeNull();
    expect(r!.station.icao).toBe("EDSB");
    // L'âge négatif est conservé tel quel ici (valeur brute) ; c'est à
    // l'assemblage (étape 10) de décider s'il l'affiche ou le ramène à 0.
    expect(r!.ageMinutes).toBe(-10);
  });

  it("ignore une observation datée dans le futur de plus d'une heure", () => {
    // Une station mal réglée peut publier une heure future. On ne veut pas
    // qu'elle gagne le tri en paraissant « ultra fraîche ».
    const tot = Date.parse("2026-07-24T10:00:00.000Z");
    const r = selectNearest(stations, BRUMATH.lat, BRUMATH.lon, tot, MAX_AGE_MS);
    expect(r).toBeNull();
  });
});

// ---------- 4. Orchestration réseau (avec faux fetch) ----------
describe("fetchNearest", () => {
  it("trouve LFST depuis Brumath au premier essai (bbox ±1,5°)", async () => {
    const { impl, urlsAppelees } = fakeFetch([ROWS_REELLES]);
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.station.icao).toBe("LFST");
      expect(r.ageMinutes).toBe(30);
    }
    // Un seul appel réseau : pas d'élargissement inutile.
    expect(urlsAppelees).toHaveLength(1);
    expect(urlsAppelees[0]).toContain("bbox=47.23%2C6.21%2C50.23%2C9.21");
  });

  it("élargit à ±3° quand le premier essai ne renvoie rien", async () => {
    const { impl, urlsAppelees } = fakeFetch([[], ROWS_REELLES]);
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(true);
    expect(urlsAppelees).toHaveLength(2);
    expect(urlsAppelees[1]).toContain("bbox=45.73%2C4.71%2C51.73%2C10.71");
  });

  it("n'élargit qu'une seule fois, puis renvoie une réponse explicite", async () => {
    const { impl, urlsAppelees } = fakeFetch([[], []]);
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("no_station");
    expect(urlsAppelees).toHaveLength(2); // deux essais, pas trois
  });

  it("distingue « aucune station » de « aucune observation récente »", async () => {
    const { impl } = fakeFetch([ROWS_REELLES, ROWS_REELLES]);
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: Date.parse("2026-07-25T12:00:00.000Z"), // le lendemain midi
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("only_stale");
  });

  it("ne lève jamais sur une panne réseau : elle devient une donnée", async () => {
    const impl = async () => {
      throw new Error("ECONNRESET");
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
  });

  it("traite un HTTP 500 comme une panne réseau, sans exception", async () => {
    const impl = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    });
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
  });

  it("traite un corps JSON illisible comme une panne réseau", async () => {
    const impl = async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token < in JSON");
      },
    });
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
  });

  it("refuse une position invalide sans appeler le réseau", async () => {
    const { impl, urlsAppelees } = fakeFetch([ROWS_REELLES]);
    const r = await fetchNearest(Number.NaN, 7.71, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("invalid_position");
    expect(urlsAppelees).toHaveLength(0);
  });

  it("refuse une latitude hors bornes (±90)", async () => {
    const { impl } = fakeFetch([ROWS_REELLES]);
    const r = await fetchNearest(120, 7.71, { fetchImpl: impl, nowMs: NOW_MS });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("invalid_position");
  });
});
