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

import { describe, it, expect, vi } from "vitest";
import {
  splitBboxes,
  buildBboxUrls,
  normalizeRows,
  selectNearest,
  fetchNearest,
  MAX_AGE_MS,
} from "../src/awc.js";

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

// Second faux `fetch`, celui-là aiguillé PAR CONTENU DE L'URL et non par ordre
// d'appel. Nécessaire dès qu'un tour de recherche produit DEUX requêtes
// (antiméridien) : répondre « la 1re réponse au 1er appel » rendrait le test
// dépendant de l'ordre interne (parallèle ou séquentiel), ce qui n'est pas ce
// qu'on cherche à vérifier.
//
// L'aiguillage se fait sur le SIGNE des longitudes de la bbox, pas sur un
// fragment de texte : un fragment comme "177.5" se retrouve par accident dans
// "-177.5" et change de sens selon la marge, ce qui ferait passer les tests
// pour de mauvaises raisons.
//   - "ouest" = moitié aux longitudes POSITIVES (avant la ligne, côté Fidji) ;
//   - "est"   = moitié aux longitudes NÉGATIVES (juste après la ligne).
// Une boîte NON découpée ne correspond à aucun côté : elle reçoit une liste
// vide, comme une URL sans règle.
// Trois réponses spéciales, en plus d'une charge utile ordinaire :
//   "panne"   : la requête échoue (coupure réseau) ;
//   "vide204" : HTTP 204 avec un corps VIDE, ce qu'AWC renvoie réellement pour
//               une zone sans station (vérifié le 26/07/2026 en plein océan) ;
//   "pend"    : la connexion reste ouverte sans jamais répondre. Elle ne se
//               termine que si on l'abandonne, donc uniquement grâce au délai.
type Cote = "ouest" | "est";
type ReglesParUrl = Array<{ cote: Cote; reponse: unknown | "panne" | "vide204" | "pend" }>;

// Réponse 204 fidèle à la réalité : le corps est vide, donc .json() lève.
const REPONSE_204 = {
  ok: true,
  status: 204,
  json: async () => {
    throw new SyntaxError("Unexpected end of JSON input");
  },
};

function coteDeLUrl(url: string): Cote | null {
  const bbox = new URL(url).searchParams.get("bbox");
  if (bbox === null) return null;
  const [, lonMin, , lonMax] = bbox.split(",").map(Number);
  if (lonMin > 0 && lonMax === 180) return "ouest";
  if (lonMin === -180 && lonMax < 0) return "est";
  return null; // boîte ordinaire, non coupée par la ligne
}

function fakeFetchParUrl(regles: ReglesParUrl) {
  const urlsAppelees: string[] = [];
  const cotesServis: Cote[] = []; // trace des moitiés réellement exploitées
  const impl = async (url: string, init?: { signal?: AbortSignal }) => {
    urlsAppelees.push(url);
    const cote = coteDeLUrl(url);
    const regle = regles.find((r) => r.cote === cote);
    if (regle === undefined) return { ok: true, status: 200, json: async () => [] };
    if (regle.reponse === "panne") throw new Error("ECONNRESET");
    if (regle.reponse === "vide204") return REPONSE_204;
    if (regle.reponse === "pend") {
      return new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("The operation was aborted")),
        );
      });
    }
    cotesServis.push(regle.cote);
    return { ok: true, status: 200, json: async () => regle.reponse };
  };
  return { impl, urlsAppelees, cotesServis };
}

// ---------- Fixtures de l'antiméridien ----------
// Contrairement au bloc ci-dessus, ces lignes ne sont PAS des captures réelles :
// nous n'avons pas de relevé AWC du Pacifique sous la main. Les coordonnées sont
// en revanche géographiquement crédibles (bande des Fidji, de part et d'autre de
// la ligne de changement de date) et c'est tout ce que ce test met en jeu :
// la géométrie du découpage, pas le contenu du METAR.
const PACIFIQUE = { lat: -17.6, lon: 179.5 }; // Fidji, juste à l'ouest de la ligne

// Station à l'OUEST de la ligne (longitude positive), la plus éloignée.
const ROW_OUEST = {
  icaoId: "NFXW",
  name: "Ouest de la ligne (test)",
  lat: -17.6,
  lon: 178.2,
  obsTime: 1784912400, // 2026-07-24T17:00:00Z
  rawOb: "METAR NFXW 241700Z 09010KT 9999 FEW020 26/22 Q1013",
};

// Station à l'EST de la ligne (longitude négative), la plus PROCHE de PACIFIQUE :
// 179,5 E et 179,8 W ne sont séparés que par 0,7° de longitude, soit ~74 km.
// C'est elle qui doit gagner. Avec l'ancien bornage à ±180, elle était
// simplement invisible : la boîte s'arrêtait à la ligne.
const ROW_EST = {
  icaoId: "NFXE",
  name: "Est de la ligne (test)",
  lat: -17.6,
  lon: -179.8,
  obsTime: 1784912400,
  rawOb: "METAR NFXE 241700Z 09012KT 9999 SCT018 27/23 Q1012",
};

// ---------- 1. Découpage de la zone de recherche ----------
describe("splitBboxes", () => {
  it("ne produit qu'une seule boîte loin de l'antiméridien", () => {
    const boites = splitBboxes(48.73, 7.71, 1.5);
    expect(boites).toHaveLength(1);
    expect(boites[0]).toEqual({
      latMin: 47.23,
      lonMin: 6.21,
      latMax: 50.23,
      lonMax: 9.21,
    });
  });

  it("borne la latitude aux pôles (pas de latMax à 90,5°)", () => {
    // Au-delà du pôle il n'y a rien : borner la latitude est CORRECT,
    // contrairement à la longitude où borner supprimait de vraies stations.
    const boites = splitBboxes(89.5, 20, 1.5);
    expect(boites).toHaveLength(1);
    expect(boites[0]).toEqual({ latMin: 88, lonMin: 18.5, latMax: 90, lonMax: 21.5 });
  });

  it("coupe en deux boîtes quand la zone franchit la ligne par l'est", () => {
    // 179 + 1,5 = 180,5 n'existe pas : ce demi-degré manquant est en réalité
    // à -179,5. Deux boîtes, la première étant celle qui contient la position.
    const boites = splitBboxes(-17, 179, 1.5);
    expect(boites).toHaveLength(2);
    expect(boites[0]).toEqual({ latMin: -18.5, lonMin: 177.5, latMax: -15.5, lonMax: 180 });
    expect(boites[1]).toEqual({ latMin: -18.5, lonMin: -180, latMax: -15.5, lonMax: -179.5 });
  });

  it("coupe en deux boîtes quand la zone franchit la ligne par l'ouest", () => {
    // Symétrique : -179 - 1,5 = -180,5, c'est-à-dire 179,5.
    const boites = splitBboxes(-17, -179, 1.5);
    expect(boites).toHaveLength(2);
    expect(boites[0]).toEqual({ latMin: -18.5, lonMin: -180, latMax: -15.5, lonMax: -177.5 });
    expect(boites[1]).toEqual({ latMin: -18.5, lonMin: 179.5, latMax: -15.5, lonMax: 180 });
  });

  it("gère la position pile sur la ligne (180°)", () => {
    const boites = splitBboxes(-17, 180, 1.5);
    expect(boites).toHaveLength(2);
    expect(boites[0].lonMin).toBe(178.5);
    expect(boites[0].lonMax).toBe(180);
    expect(boites[1].lonMin).toBe(-180);
    expect(boites[1].lonMax).toBe(-178.5);
  });

  it("couvre tout le tour du globe sans se dédoubler si la marge est énorme", () => {
    // Cas théorique (aucune marge du module ne vaut 200°), mais une boîte qui
    // ferait plus d'un tour produirait deux boîtes qui se recouvrent.
    const boites = splitBboxes(0, 10, 200);
    expect(boites).toHaveLength(1);
    expect(boites[0].lonMin).toBe(-180);
    expect(boites[0].lonMax).toBe(180);
  });
});

// ---------- 1 bis. Construction des URL ----------
describe("buildBboxUrls", () => {
  it("respecte l'ordre latMin,lonMin,latMax,lonMax et le format json", () => {
    const urls = buildBboxUrls(48.73, 7.71, 1.5);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("https://aviationweather.gov/api/data/metar");
    expect(urls[0]).toContain("format=json");
    // 48,73 ± 1,5 et 7,71 ± 1,5, arrondis à 2 décimales.
    expect(urls[0]).toContain("bbox=47.23%2C6.21%2C50.23%2C9.21");
  });

  it("produit deux URL de part et d'autre de la ligne de changement de date", () => {
    const urls = buildBboxUrls(-17, 179, 1.5);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("bbox=-18.5%2C177.5%2C-15.5%2C180");
    expect(urls[1]).toContain("bbox=-18.5%2C-180%2C-15.5%2C-179.5");
  });

  it("découpe selon la marge : la boîte serrée ne coupe pas, l'élargie oui", () => {
    // À 178° E : 178 + 1,5 = 179,5 tient d'un seul côté, mais 178 + 3 = 181
    // franchit la ligne. Le découpage doit donc être recalculé à CHAQUE essai,
    // pas décidé une fois pour toutes au départ.
    expect(buildBboxUrls(-17, 178, 1.5)).toHaveLength(1);
    expect(buildBboxUrls(-17, 178, 3)).toHaveLength(2);
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

  it("mesure correctement une distance qui franchit l'antiméridien", () => {
    // Le test qui prouve que le découpage sert à quelque chose. Entre 179,5 E
    // et 179,8 W il y a 0,7° de longitude, soit ~74 km à cette latitude. Une
    // formule non périodique (approximation plate, différence brute de
    // longitude) calculerait 359,3°, soit ~38 000 km, et classerait la station
    // la plus proche en dernier. La haversine de geo.ts est périodique : ce
    // test verrouille cette propriété pour les évolutions futures.
    const stations = normalizeRows([ROW_OUEST, ROW_EST]);
    const r = selectNearest(
      stations,
      PACIFIQUE.lat,
      PACIFIQUE.lon,
      NOW_MS,
      MAX_AGE_MS,
    );
    expect(r).not.toBeNull();
    expect(r!.station.icao).toBe("NFXE"); // celle d'en face, pourtant plus proche
    expect(r!.distanceKm).toBeGreaterThan(50);
    expect(r!.distanceKm).toBeLessThan(120);
    // Cap plein est : on va vers les longitudes croissantes en franchissant
    // la ligne, ce qui reste un cap de 90° et non de 270°.
    expect(r!.bearingDeg).toBeGreaterThan(80);
    expect(r!.bearingDeg).toBeLessThan(100);
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
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
      retryDelayMs: 0, // aucune attente réelle dans les tests
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
  });

  it("traite un HTTP 204 (zone sans station) comme une zone vide, pas une panne", async () => {
    // Comportement RÉEL d'aviationweather.gov, vérifié le 26/07/2026 sur une
    // bbox en plein océan : 204 « No Content » avec un corps de zéro octet.
    // Le piège : `ok` vaut true sur un 204, mais .json() sur un corps vide lève.
    // Sans traitement, toute zone déserte serait annoncée comme une panne réseau,
    // ce qui est faux et empêcherait même l'élargissement de la recherche.
    let appels = 0;
    const impl = async () => {
      appels += 1;
      return REPONSE_204;
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0, // aucune attente réelle dans les tests
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("no_station"); // et surtout pas network_error
    expect(appels).toBe(2); // la recherche s'est bien élargie au second essai
  });

  it("réessaie une fois après un hoquet réseau, et sert la réponse du 2e essai", async () => {
    // Cas RÉELLEMENT observé le 26/07/2026 : le tout premier appel d'un
    // processus froid a échoué, l'essai suivant a réussi. Sur Vercel, chaque
    // invocation à froid est un premier appel : sans réessai, ce hoquet
    // devient un 502 pour l'utilisateur.
    let appels = 0;
    const impl = async () => {
      appels += 1;
      if (appels === 1) throw new Error("ECONNRESET");
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0, // pas d'attente réelle en test
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.station.icao).toBe("LFST");
    expect(appels).toBe(2);
  });

  it("réessaie sur un 500 ou un 429, qui sont des pannes passagères", async () => {
    for (const status of [500, 503, 429]) {
      let appels = 0;
      const impl = async () => {
        appels += 1;
        if (appels === 1) return { ok: false, status, json: async () => ({}) };
        return { ok: true, status: 200, json: async () => ROWS_REELLES };
      };
      const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
        fetchImpl: impl,
        nowMs: NOW_MS,
        retryDelayMs: 0,
      });
      expect(r.found).toBe(true);
      expect(appels).toBe(2);
    }
  });

  it("ne réessaie PAS un 400 : la requête est fautive, insister ne sert à rien", async () => {
    let appels = 0;
    const impl = async () => {
      appels += 1;
      return { ok: false, status: 400, json: async () => ({}) };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    expect(appels).toBe(1); // une seule tentative, pas deux
  });

  it("ne réessaie PAS un 204 : une zone déserte n'est pas une panne", async () => {
    // Décisif avec le découpage de l'antiméridien : une moitié sur deux est
    // souvent de la haute mer. Réessayer doublerait la charge pour rien.
    let appels = 0;
    const impl = async () => {
      appels += 1;
      return REPONSE_204;
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("no_station");
    expect(appels).toBe(2); // 2 = les deux marges, PAS un réessai
  });

  it("s'arrête après deux tentatives : on ne s'acharne pas", async () => {
    let appels = 0;
    const impl = async () => {
      appels += 1;
      throw new Error("ECONNRESET");
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    // 2 tentatives sur la boîte serrée, puis abandon : on ne passe même pas
    // à la marge élargie, puisque la source entière est manifestement à terre.
    expect(appels).toBe(2);
  });

  it("maxAttempts=1 désactive complètement le réessai", async () => {
    // Le réessai doit rester un RÉGLAGE, pas une fatalité : si la source venait
    // à mal supporter la charge, on doit pouvoir le couper sans réécrire le
    // module. Ce test fige aussi, en dur, le comportement « sans réessai ».
    let appels = 0;
    const impl = async () => {
      appels += 1;
      throw new Error("ECONNRESET");
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
      maxAttempts: 1,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    expect(appels).toBe(1);
  });

  it("réessaie aussi un corps JSON illisible (réponse tronquée)", async () => {
    let appels = 0;
    const impl = async () => {
      appels += 1;
      if (appels === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        };
      }
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(true);
    expect(appels).toBe(2);
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

// ---------- 4 bis. Délai d'attente (timeout) ----------
// Le complément indispensable du réessai. `fetch` n'a AUCUNE limite de temps
// par défaut : face à une source qui PEND (connexion ouverte, aucun octet qui
// arrive) au lieu de refuser franchement, l'appel attend indéfiniment. Sur
// Vercel, ça veut dire une fonction qui tourne jusqu'à la limite de la
// plateforme, un utilisateur devant une page qui charge, et de la facturation.
//
// Ces tests utilisent des délais RÉELS mais minuscules (10 ms) : contrairement
// au réessai, on ne peut pas mettre le délai à 0 sans supprimer ce qu'on teste.
describe("fetchNearest et le délai d'attente", () => {
  // Faux `fetch` qui ne répond JAMAIS de lui-même : il ne se résout que si on
  // l'abandonne. C'est la simulation fidèle d'une connexion suspendue, et le
  // seul montage qui prouve DEUX choses à la fois : que le signal est bien
  // transmis, et qu'il est bien honoré. Sans transmission du signal, ce test
  // ne finirait jamais (vitest le tuerait au bout de 5 s).
  function fakeFetchQuiPend() {
    let appels = 0;
    const impl = async (_url: string, init?: { signal?: AbortSignal }) => {
      appels += 1;
      return new Promise<never>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("The operation was aborted")),
        );
      });
    };
    return { impl, nbAppels: () => appels };
  }

  it("abandonne une connexion qui pend au lieu d'attendre indéfiniment", async () => {
    const { impl, nbAppels } = fakeFetchQuiPend();
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      timeoutMs: 10, // 10 ms au lieu des 12 s de production
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");

    // LA seconde assertion, celle qui porte l'arbitrage : UNE seule tentative.
    // Un délai dépassé n'est PAS réessayé, contrairement à un ECONNRESET (voir
    // le test « s'arrête après deux tentatives », qui lui compte 2 appels).
    // Réessayer une connexion suspendue doublerait mécaniquement l'attente,
    // c'est-à-dire aggraverait précisément le mal que le délai vient soigner.
    expect(nbAppels()).toBe(1);
  });

  it("transmet bien un signal d'abandon au fetch injecté", async () => {
    // Contrôle direct du câblage : sans ce paramètre, le délai n'existe pas.
    const recus: Array<{ signal?: AbortSignal } | undefined> = [];
    const impl = async (_url: string, init?: { signal?: AbortSignal }) => {
      recus.push(init);
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(true);
    expect(recus).toHaveLength(1);
    expect(recus[0]?.signal).toBeInstanceOf(AbortSignal);
    // Le signal n'est évidemment pas déjà déclenché au moment de l'appel.
    expect(recus[0]?.signal?.aborted).toBe(false);
  });

  it("transmet le signal même au fetch natif, quand rien n'est injecté", async () => {
    // Le test le plus important du lot, et le moins évident. En production
    // aucun `fetchImpl` n'est injecté : c'est le `fetch` natif qui sert, via
    // une petite fonction par défaut dans fetchNearest. Oublier de lui relayer
    // le second paramètre laisserait TOUS les autres tests au vert (ils
    // injectent leur propre faux fetch) pendant qu'en production le délai
    // serait purement décoratif. On remplace donc le `fetch` global le temps
    // d'un appel pour verrouiller cette ligne-là.
    const recus: Array<unknown> = [];
    vi.stubGlobal("fetch", async (_url: unknown, init?: unknown) => {
      recus.push(init);
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    });
    try {
      const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, { nowMs: NOW_MS });
      expect(r.found).toBe(true);
    } finally {
      // `finally` : le `fetch` global doit être rendu même si l'attente échoue,
      // sinon les tests suivants hériteraient du faux.
      vi.unstubAllGlobals();
    }
    expect(recus).toHaveLength(1);
    expect((recus[0] as { signal?: AbortSignal } | undefined)?.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it("laisse aboutir un appel lent mais qui répond dans les temps", async () => {
    // Un délai trop zélé serait pire que pas de délai du tout : il couperait
    // des réponses valables. 30 ms de latence sous un plafond de 500 ms passe.
    const impl = async () => {
      await new Promise((r) => setTimeout(r, 30));
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      timeoutMs: 500,
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.station.icao).toBe("LFST");
  });

  it("timeoutMs à 0 désactive le délai, comme maxAttempts à 1 désactive le réessai", async () => {
    // Même patron que le réessai : le garde-fou reste un RÉGLAGE. À 0, aucun
    // signal n'est transmis du tout (et non un signal qui expire aussitôt,
    // ce qui couperait toutes les requêtes).
    const recus: Array<{ signal?: AbortSignal } | undefined> = [];
    const impl = async (_url: string, init?: { signal?: AbortSignal }) => {
      recus.push(init);
      return { ok: true, status: 200, json: async () => ROWS_REELLES };
    };
    const r = await fetchNearest(BRUMATH.lat, BRUMATH.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      timeoutMs: 0,
    });
    expect(r.found).toBe(true);
    expect(recus[0]?.signal).toBeUndefined();
  });
});

// ---------- 5. Antiméridien : deux requêtes, une seule réponse ----------
// Le cœur de l'étape. Depuis les Fidji, la zone de recherche est à cheval sur
// la ligne de changement de date : elle est donc interrogée en DEUX appels,
// dont les résultats sont fusionnés AVANT le classement par distance.
describe("fetchNearest à cheval sur l'antiméridien", () => {
  it("interroge les deux moitiés et retient la plus proche, toutes moitiés confondues", async () => {
    const { impl, urlsAppelees, cotesServis } = fakeFetchParUrl([
      { cote: "ouest", reponse: [ROW_OUEST] },
      { cote: "est", reponse: [ROW_EST] },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(urlsAppelees).toHaveLength(2); // un seul tour, mais deux requêtes
    // Les DEUX moitiés ont bien fourni des stations : si une régression future
    // se contentait d'une seule boîte, ce contrôle tomberait avant le suivant.
    expect(cotesServis.sort()).toEqual(["est", "ouest"]);
    expect(r.found).toBe(true);
    // NFXE (~74 km) bat NFXW (~138 km) alors qu'elle est de l'autre côté de la
    // ligne : c'est exactement la station que l'ancien bornage rendait invisible.
    if (r.found) expect(r.station.icao).toBe("NFXE");
  });

  it("supporte qu'une moitié soit de l'océan vide (204) et l'autre peuplée", async () => {
    // Le cas le PLUS fréquent en vrai : à l'antiméridien, une des deux moitiés
    // est presque toujours de la haute mer sans aucune station, donc un 204.
    // Il ne doit surtout pas être confondu avec une panne, sinon le découpage
    // rendrait le service moins fiable qu'avant au lieu de l'améliorer.
    const { impl, urlsAppelees } = fakeFetchParUrl([
      { cote: "ouest", reponse: "vide204" },
      { cote: "est", reponse: [ROW_EST] },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.station.icao).toBe("NFXE");
    expect(urlsAppelees).toHaveLength(2); // un seul tour a suffi
  });

  it("ne compte pas une moitié vide (204) comme une panne dans le motif final", async () => {
    // Ce test-là DISCRIMINE, contrairement au précédent : la moitié peuplée ne
    // contient que des observations périmées, donc rien n'est trouvé et c'est
    // le motif d'échec qui parle. Si le 204 était pris pour une panne, la
    // précédence rendrait « network_error » ; correctement traité, il rend
    // « only_stale », qui est la vérité : la zone a bien répondu, ses stations
    // sont simplement trop vieilles.
    const { impl } = fakeFetchParUrl([
      { cote: "ouest", reponse: [ROW_OUEST] }, // périmée à cette heure
      { cote: "est", reponse: "vide204" }, // océan désert
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: Date.parse("2026-07-25T12:00:00.000Z"), // le lendemain midi
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("only_stale");
  });

  it("sert quand même la moitié disponible si l'autre requête tombe en panne", async () => {
    // Une panne partielle dégrade la couverture, elle ne doit pas annuler le
    // service : la station trouvée dans la moitié qui a répondu est valable.
    const { impl, urlsAppelees } = fakeFetchParUrl([
      { cote: "ouest", reponse: [ROW_OUEST] },
      { cote: "est", reponse: "panne" },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.station.icao).toBe("NFXW");
    // 3 et non 2 : la moitié en panne est réessayée une fois avant d'être
    // abandonnée. Le tour élargi, lui, n'a pas lieu (on a trouvé au premier).
    expect(urlsAppelees).toHaveLength(3);
  });

  it("annonce network_error si une moitié est en panne et que l'autre ne donne rien", async () => {
    // Précédence assumée : quand une moitié n'a pas répondu, on ne SAIT PAS
    // ce qu'elle contenait. Dire « aucune station » ou « rien de récent »
    // serait affirmer plus que ce qu'on a vérifié : la panne l'emporte.
    const { impl, urlsAppelees } = fakeFetchParUrl([
      { cote: "ouest", reponse: [ROW_OUEST] }, // périmée à cette heure
      { cote: "est", reponse: "panne" },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: Date.parse("2026-07-25T12:00:00.000Z"), // le lendemain midi
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    // Panne partielle aux deux tours : on est allé au bout avant de conclure,
    // sans jamais court-circuiter. 6 requêtes = 2 tours x (1 moitié qui
    // répond + 1 moitié en panne, réessayée une fois).
    expect(urlsAppelees).toHaveLength(6);
  });

  it("annonce network_error si les deux moitiés sont en panne", async () => {
    const { impl, urlsAppelees } = fakeFetchParUrl([
      { cote: "ouest", reponse: "panne" },
      { cote: "est", reponse: "panne" },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    // Panne TOTALE : court-circuit immédiat, pas de tour élargi inutile.
    // 4 requêtes = les 2 moitiés, chacune tentée deux fois.
    expect(urlsAppelees).toHaveLength(4);
  });

  it("sert la moitié disponible quand l'autre PEND, sans la réessayer", async () => {
    // Le pire scénario du découpage, et la raison d'être du délai : une moitié
    // répond normalement, l'autre reste suspendue. Sans délai, la réponse déjà
    // obtenue serait retenue en otage par une connexion morte, indéfiniment.
    //
    // Deux assertions, à comparer au test jumeau « sert quand même la moitié
    // disponible si l'autre requête tombe en panne » : celui-là compte 3 URL
    // (la moitié en panne est réessayée), celui-ci en compte 2. La différence
    // est exactement l'arbitrage « un délai dépassé ne se réessaie pas ».
    const { impl, urlsAppelees } = fakeFetchParUrl([
      { cote: "ouest", reponse: [ROW_OUEST] },
      { cote: "est", reponse: "pend" },
    ]);
    const r = await fetchNearest(PACIFIQUE.lat, PACIFIQUE.lon, {
      fetchImpl: impl,
      nowMs: NOW_MS,
      timeoutMs: 10,
      retryDelayMs: 0,
    });
    expect(r.found).toBe(true);
    if (r.found) expect(r.station.icao).toBe("NFXW");
    expect(urlsAppelees).toHaveLength(2);
  });

  it("recalcule le découpage à l'élargissement : 1 requête puis 2", async () => {
    // Position à 178° E : la boîte serrée (±1,5°) ne franchit pas la ligne,
    // l'élargie (±3°) si. Premier tour = 1 requête, second tour = 2 requêtes.
    const { impl, urlsAppelees } = fakeFetchParUrl([]); // tout vide
    const r = await fetchNearest(-17, 178, { fetchImpl: impl, nowMs: NOW_MS });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("no_station");
    expect(urlsAppelees).toHaveLength(3); // 1 (serrée) + 2 (élargie)
  });
});
