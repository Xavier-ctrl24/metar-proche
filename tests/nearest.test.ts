// tests/nearest.test.ts
// Tests de api/nearest.ts, l'ASSEMBLAGE : c'est le seul endroit du projet où
// station + décodeur + traduction + icône + géographie se rencontrent pour
// produire le `MetarResponse` du contrat.
//
// Comme pour awc.ts : aucun appel réseau réel. On injecte un faux `fetch`, une
// horloge figée et un cache neuf à chaque test. Le cache est INJECTÉ et non pas
// posé au niveau du module, sinon un test hériterait de la réponse du
// précédent et passerait pour de mauvaises raisons.

import { describe, it, expect } from "vitest";
import {
  parseQuery,
  cleanStationName,
  formatWallTime,
  localMiddayInstant,
  handleNearest,
  STALE_AFTER_MINUTES,
} from "../api/nearest";
import type { MetarResponse, ApiError } from "../src/types";

// ---------- Fixtures ----------
// Lignes AWC réelles capturées le 24/07/2026 (mêmes que tests/awc.test.ts).
const LFST = {
  icaoId: "LFST",
  name: "Strasbourg/Entzheim Arpt, PD, FR",
  lat: 48.549,
  lon: 7.64,
  obsTime: 1784912400, // 2026-07-24T17:00:00Z
  rawOb: "METAR LFST 241700Z 24008KT 9999 SCT030 24/14 Q1018 NOSIG",
};

// Station du Pacifique central. Les coordonnées et le fuseau sont réels
// (Kiritimati, UTC+14, le décalage le plus extrême du globe) ; la ligne METAR
// est fabriquée, car nous n'avons pas de capture AWC de cette station. Seul le
// traitement du fuseau est en jeu ici, pas le contenu du bulletin.
const KIRITIMATI = {
  icaoId: "PLCH",
  name: "Cassidy Intl, , KI",
  lat: 1.986,
  lon: -157.35,
  obsTime: Date.parse("2026-07-26T20:00:00.000Z") / 1000, // = 27/07 10:00 LOCAL
  rawOb: "METAR PLCH 262000Z 09012KT 9999 FEW018 29/24 Q1011",
};

const BRUMATH = { lat: 48.73, lon: 7.71 };
// 17:30 UTC, soit 30 minutes après l'observation de LFST.
const NOW_MS = Date.parse("2026-07-24T17:30:00.000Z");

// Faux `fetch` : répond la même charge utile à toutes les URL et compte les appels.
function fakeFetch(lignes: unknown) {
  let appels = 0;
  const impl = async () => {
    appels += 1;
    return { ok: true, status: 200, json: async () => lignes };
  };
  return { impl, nbAppels: () => appels };
}

// Raccourci : lance une requête complète avec des dépendances neuves.
async function appel(
  lat: number,
  lon: number,
  lignes: unknown,
  nowMs: number = NOW_MS,
  cache = new Map(),
  lang: "fr" | "en" = "fr",
) {
  const { impl, nbAppels } = fakeFetch(lignes);
  const r = await handleNearest(
    { lat, lon, lang, units: "metric" },
    { fetchImpl: impl, nowMs, cache },
  );
  return { ...r, nbAppels, cache };
}

// Lit le jour du mois affiché dans un fuseau donné. Sert à vérifier qu'un
// lever de soleil appartient bien au MÊME jour local que l'observation.
function jourLocal(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("fr-FR", { timeZone: timezone, day: "2-digit" }).format(
    new Date(iso),
  );
}

// ---------- 1. Lecture des paramètres de requête ----------
describe("parseQuery", () => {
  it("accepte une requête normale et applique les valeurs par défaut", () => {
    const r = parseQuery({ lat: "48.73", lon: "7.71" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lat).toBeCloseTo(48.73);
      expect(r.value.lon).toBeCloseTo(7.71);
      expect(r.value.lang).toBe("fr"); // défaut
      expect(r.value.units).toBe("metric"); // défaut
    }
  });

  it("refuse une position absente, non numérique ou hors bornes", () => {
    for (const q of [
      {},
      { lat: "48.73" }, // longitude manquante
      { lat: "nord", lon: "7.71" },
      { lat: "91", lon: "7.71" }, // au-delà du pôle
      { lat: "48.73", lon: "181" },
    ]) {
      const r = parseQuery(q);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toBe("invalid_position");
    }
  });

  it("ignore une langue ou une unité inconnue plutôt que de rejeter la requête", () => {
    // Une faute de frappe sur un paramètre secondaire ne doit pas priver
    // l'utilisateur de sa météo : on retombe sur les valeurs par défaut.
    const r = parseQuery({ lat: "48.73", lon: "7.71", lang: "klingon", units: "coudées" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.lang).toBe("fr");
      expect(r.value.units).toBe("metric");
    }
  });
});

// ---------- 2. Nettoyage du nom de station ----------
describe("cleanStationName", () => {
  it("retire les codes de région et de pays, et les suffixes d'aéroport", () => {
    expect(cleanStationName("Strasbourg/Entzheim Arpt, PD, FR")).toBe("Strasbourg/Entzheim");
    expect(cleanStationName("Frankfurt Intl, HE, DE")).toBe("Frankfurt");
    expect(cleanStationName("Bale-Mulhouse, GES, FR")).toBe("Bale-Mulhouse");
    expect(cleanStationName("Kiribati/Tarawa Intl, G, KI")).toBe("Kiribati/Tarawa");
  });

  it("laisse intact un nom qui ne suit pas le motif d'AWC", () => {
    expect(cleanStationName("Pago Pago")).toBe("Pago Pago");
    expect(cleanStationName(null)).toBeNull();
  });

  it("ne vide jamais le nom, même si le motif dévore tout", () => {
    // Garde-fou : mieux vaut un nom bizarre qu'un nom vide à l'écran.
    expect(cleanStationName("Intl, XX, ZZ")).not.toBe("");
    expect(cleanStationName("   ")).toBeNull();
  });
});

// ---------- 3. Heure murale de la station ----------
describe("formatWallTime", () => {
  const instant = new Date("2026-07-24T17:00:00.000Z");

  it("rend l'heure LOCALE de la station, pas celle du serveur", () => {
    expect(formatWallTime(instant, "Europe/Paris")).toBe("19:00");
    expect(formatWallTime(instant, "Pacific/Kiritimati")).toBe("07:00"); // le 25 local
    expect(formatWallTime(instant, "America/New_York")).toBe("13:00");
  });

  it("affiche minuit « 00:00 » et jamais « 24:00 »", () => {
    // Piège classique d'Intl selon la version d'ICU : hourCycle doit être fixé.
    expect(formatWallTime(new Date("2026-07-24T22:00:00.000Z"), "Europe/Paris")).toBe("00:00");
  });

  it("rend null sans fuseau : une heure UTC affichée comme locale serait un mensonge", () => {
    expect(formatWallTime(instant, null)).toBeNull();
    expect(formatWallTime(null, "Europe/Paris")).toBeNull();
  });
});

// ---------- 4. Midi local (correction du jour solaire) ----------
describe("localMiddayInstant", () => {
  it("ramène à midi local du jour de l'observation, quel que soit le décalage", () => {
    // Kiritimati est à UTC+14 : l'observation de 20:00 UTC le 26 est en réalité
    // le 27 à 10:00 sur place. Midi local du 27 = 22:00 UTC le 26.
    const obs = new Date("2026-07-26T20:00:00.000Z");
    const midi = localMiddayInstant(obs, "Pacific/Kiritimati");
    expect(formatWallTime(midi, "Pacific/Kiritimati")).toBe("12:00");
    expect(jourLocal(midi.toISOString(), "Pacific/Kiritimati")).toBe("27");
  });

  it("fonctionne aussi pour un décalage négatif", () => {
    const obs = new Date("2026-07-26T02:00:00.000Z"); // 25/07 15:00 aux Samoa US
    const midi = localMiddayInstant(obs, "Pacific/Pago_Pago");
    expect(formatWallTime(midi, "Pacific/Pago_Pago")).toBe("12:00");
    expect(jourLocal(midi.toISOString(), "Pacific/Pago_Pago")).toBe("25");
  });
});

// ---------- 5. Réponse nominale complète ----------
describe("handleNearest — cas nominal", () => {
  it("assemble une réponse conforme au contrat depuis Brumath", async () => {
    const r = await appel(BRUMATH.lat, BRUMATH.lon, [LFST]);
    expect(r.status).toBe(200);
    const body = r.body as MetarResponse;

    // Station : nom nettoyé, distance arrondie à la présentation, fuseau résolu.
    expect(body.station?.icao).toBe("LFST");
    expect(body.station?.name).toBe("Strasbourg/Entzheim");
    expect(body.station?.distanceKm).toBeCloseTo(21, 0);
    expect(body.station?.bearingDeg).toBeGreaterThanOrEqual(180);
    expect(body.station?.bearingDeg).toBeLessThan(220);
    expect(body.station?.timezone).toBe("Europe/Paris");
    expect(body.station?.isAuto).toBe(false);

    // Horodatage : l'instant vient d'AWC (obsTime), l'heure murale du fuseau.
    expect(body.observedAt).toBe("2026-07-24T17:00:00.000Z");
    expect(body.observedLocal).toBe("19:00");
    expect(body.ageMinutes).toBe(30);
    expect(body.isStale).toBe(false);

    // Mesures décodées, en unités métriques.
    expect(body.temperature?.value).toBe(24);
    expect(body.temperature?.dewPoint).toBe(14);
    expect(body.temperature?.unit).toBe("C");
    expect(body.wind?.speed).toBe(15); // 8 kt -> 15 km/h
    expect(body.wind?.directionDeg).toBe(240);
    expect(body.pressure?.value).toBe(1018);
    expect(body.clouds).toEqual([{ coverage: "SCT", altitude: 900, unit: "m" }]);

    // Soleil, icône et textes : le 24 juillet à 19:00 locales, il fait jour.
    expect(body.sun?.isDay).toBe(true);
    expect(body.icon).toBe("partly_cloudy_day");
    expect(body.text.headline).toBe("Éclaircies");
    expect(body.text.wind).toContain("km/h");
    expect(body.raw).toBe(LFST.rawOb);
    expect(body.warnings).toEqual([]);
  });

  it("ne rend jamais un cap de 360°, qui n'existe pas", async () => {
    // Station presque plein nord : le cap réel vaut 359,70°, que Math.round
    // porte à 360. Le contrat veut un cap dans [0, 360[, donc 0. Ce test
    // verrouille aussi l'ORDRE des opérations : arrondir puis ramener modulo
    // 360, et non l'inverse (qui laisserait passer 360).
    const presquePleinNord = { ...LFST, lat: 49.0, lon: 6.9921 };
    const r = await appel(48.0, 7.0, [presquePleinNord]);
    expect((r.body as MetarResponse).station?.bearingDeg).toBe(0);
  });

  it("donne un lever et un coucher plausibles, en heure de la station", async () => {
    const r = await appel(BRUMATH.lat, BRUMATH.lon, [LFST]);
    const body = r.body as MetarResponse;
    // Strasbourg fin juillet : lever vers 05h50, coucher vers 21h15 locales.
    expect(body.sun?.sunrise).toMatch(/^0[56]:\d{2}$/);
    expect(body.sun?.sunset).toMatch(/^21:\d{2}$/);
  });
});

// ---------- 6. Fuseaux extrêmes : le lever appartient au bon JOUR local ----------
describe("handleNearest — station à fort décalage horaire", () => {
  it("rend l'heure locale et un soleil cohérents à UTC+14", async () => {
    // Portée exacte de ce test, pour ne pas se mentir : il vérifie le
    // FORMATAGE au décalage le plus extrême du globe (heure murale du bon jour
    // local, soleil plausible). Il ne prouve PAS à lui seul la correction du
    // jour solaire : `sun.sunrise` ne porte qu'un « HH:MM », or le lever ne
    // bouge que d'une minute d'un jour à l'autre. C'est le test unitaire de
    // `localMiddayInstant` qui verrouille cette correction-là.
    const nowKiri = Date.parse("2026-07-26T20:30:00.000Z");
    const r = await appel(KIRITIMATI.lat, KIRITIMATI.lon, [KIRITIMATI], nowKiri);
    const body = r.body as MetarResponse;

    expect(body.station?.timezone).toBe("Pacific/Kiritimati");
    expect(body.observedLocal).toBe("10:00"); // 20:00 UTC le 26 = 10:00 le 27 sur place
    expect(body.sun?.isDay).toBe(true);
    // Un lever vers 06h30 et un coucher vers 18h40, tous deux le 27 LOCAL.
    expect(body.sun?.sunrise).toMatch(/^06:\d{2}$/);
    expect(body.sun?.sunset).toMatch(/^18:\d{2}$/);
  });
});

// ---------- 7. Fraîcheur : isStale et ageMinutes ----------
describe("handleNearest — fraîcheur de l'observation", () => {
  it(`marque isStale au-delà de ${STALE_AFTER_MINUTES} minutes`, async () => {
    // Seuil SOUPLE de présentation (90 min), à ne pas confondre avec le seuil
    // DUR de awc.ts (3 h) qui, lui, écarte carrément l'observation.
    const juste = await appel(
      BRUMATH.lat,
      BRUMATH.lon,
      [LFST],
      Date.parse("2026-07-24T18:29:00.000Z"), // 89 min
    );
    expect((juste.body as MetarResponse).isStale).toBe(false);

    const trop = await appel(
      BRUMATH.lat,
      BRUMATH.lon,
      [LFST],
      Date.parse("2026-07-24T18:35:00.000Z"), // 95 min
    );
    const body = trop.body as MetarResponse;
    expect(body.ageMinutes).toBe(95);
    expect(body.isStale).toBe(true);
  });

  it("ramène un âge négatif à 0 et le signale dans warnings", async () => {
    // Station dont l'horloge avance : awc.ts tolère jusqu'à 1 h d'avance, mais
    // « il y a -10 minutes » n'a aucun sens à l'écran.
    const r = await appel(
      BRUMATH.lat,
      BRUMATH.lon,
      [LFST],
      Date.parse("2026-07-24T16:50:00.000Z"), // 10 min AVANT l'observation
    );
    const body = r.body as MetarResponse;
    expect(body.ageMinutes).toBe(0);
    expect(body.isStale).toBe(false);
    expect(body.warnings.join(" ")).toContain("futur");
  });

  it("conserve les warnings du décodeur en plus des siens", async () => {
    // Point de rosée supérieur à la température : anomalie détectée par decode.
    const aberrant = { ...LFST, rawOb: "METAR LFST 241700Z 24008KT 9999 SCT030 14/24 Q1018" };
    const r = await appel(BRUMATH.lat, BRUMATH.lon, [aberrant]);
    const body = r.body as MetarResponse;
    expect(body.warnings.length).toBeGreaterThan(0);
  });
});

// ---------- 8. Échecs : code HTTP parlant, jamais un corps vide ----------
describe("handleNearest — échecs", () => {
  it("404 et no_station quand la zone est déserte", async () => {
    const r = await appel(BRUMATH.lat, BRUMATH.lon, []);
    expect(r.status).toBe(404);
    expect((r.body as ApiError).error).toBe("no_station");
  });

  it("404 et only_stale quand toutes les observations sont périmées", async () => {
    const r = await appel(
      BRUMATH.lat,
      BRUMATH.lon,
      [LFST],
      Date.parse("2026-07-25T12:00:00.000Z"), // le lendemain midi
    );
    expect(r.status).toBe(404);
    expect((r.body as ApiError).error).toBe("only_stale");
  });

  it("502 quand la source de données est injoignable, après réessai", async () => {
    let appels = 0;
    const impl = async () => {
      appels += 1;
      throw new Error("ECONNRESET");
    };
    const r = await handleNearest(
      { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr", units: "metric" },
      { fetchImpl: impl, nowMs: NOW_MS, cache: new Map(), retryDelayMs: 0 },
    );
    expect(r.status).toBe(502);
    expect((r.body as ApiError).error).toBe("network_error");
    // Le 502 n'est rendu qu'après une seconde tentative, jamais du premier coup.
    expect(appels).toBe(2);
  });

  it("absorbe un hoquet réseau isolé et répond 200", async () => {
    // Le scénario réellement observé en production le 26/07/2026.
    let appels = 0;
    const impl = async () => {
      appels += 1;
      if (appels === 1) throw new Error("ECONNRESET");
      return { ok: true, status: 200, json: async () => [LFST] };
    };
    const r = await handleNearest(
      { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr", units: "metric" },
      { fetchImpl: impl, nowMs: NOW_MS, cache: new Map(), retryDelayMs: 0 },
    );
    expect(r.status).toBe(200);
    expect((r.body as MetarResponse).station?.icao).toBe("LFST");
  });

  it("400 sur une position invalide, sans toucher au réseau", async () => {
    const { impl, nbAppels } = fakeFetch([LFST]);
    const r = await handleNearest(
      { lat: Number.NaN, lon: 7.71, lang: "fr", units: "metric" },
      { fetchImpl: impl, nowMs: NOW_MS, cache: new Map() },
    );
    expect(r.status).toBe(400);
    expect((r.body as ApiError).error).toBe("invalid_position");
    expect(nbAppels()).toBe(0);
  });
});

// ---------- 9. Cache 5 minutes ----------
// ---------- 8 bis. Langue de la réponse ----------
// `lang=en` était jusqu'ici ACCEPTÉ mais servi en français : le contrat mentait.
// Ces tests ferment ce trou, et surtout ils couvrent le chemin le plus facile
// à oublier, celui du CACHE.
describe("handleNearest — langue", () => {
  it("sert les textes en anglais quand lang=en", async () => {
    const r = await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, new Map(), "en");
    expect(r.status).toBe(200);
    const body = r.body as MetarResponse;
    expect(body.text.headline).toBe("Partly cloudy");
    expect(body.text.visibility).toBe("More than 10 km");
    expect(body.text.wind).toContain("Wind from the southwest");
  });

  it("sert toujours le français par défaut", async () => {
    const r = await appel(BRUMATH.lat, BRUMATH.lon, [LFST]);
    const body = r.body as MetarResponse;
    expect(body.text.headline).toBe("Éclaircies");
    expect(body.text.visibility).toBe("Plus de 10 km");
  });

  it("ne traduit QUE le bloc text : valeurs et icône sont identiques", async () => {
    // Vérifie une promesse explicite du contrat : les nombres et l'icône sont
    // neutres, donc le client peut proposer un sélecteur de langue sans que la
    // météo elle-même bouge d'un iota.
    const fr = (await appel(BRUMATH.lat, BRUMATH.lon, [LFST])).body as MetarResponse;
    const en = (await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, new Map(), "en"))
      .body as MetarResponse;
    expect(en.icon).toBe(fr.icon);
    expect(en.temperature).toEqual(fr.temperature);
    expect(en.wind).toEqual(fr.wind);
    expect(en.pressure).toEqual(fr.pressure);
    expect(en.text).not.toEqual(fr.text);
  });

  it("garde l'anglais sur une réponse SERVIE DEPUIS LE CACHE", async () => {
    // LE test qui discrimine. `buildResponse` est appelé à DEUX endroits de
    // handleNearest, et celui du cache n'est atteint qu'à la seconde requête
    // sur la même position : un test qui n'appelle qu'une fois ne le traverse
    // jamais et laisserait passer un cache qui reparle français.
    const cache = new Map();
    const un = await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, cache, "en");
    const deux = await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, cache, "en");
    expect(un.fromCache).toBe(false);
    expect(deux.fromCache).toBe(true); // sans ça le test ne prouverait rien
    expect((deux.body as MetarResponse).text.headline).toBe("Partly cloudy");
  });

  it("la langue du premier visiteur ne contamine pas le suivant", async () => {
    // Conséquence directe du choix « on met en cache la STATION, pas le texte »,
    // et raison pour laquelle `cacheKey` ne contient pas la langue. Si le corps
    // traduit était mis en cache, cet anglophone recevrait du français parce
    // qu'un francophone du même quartier est passé quatre minutes plus tôt.
    const cache = new Map();
    const enFrancais = await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, cache, "fr");
    const enAnglais = await appel(BRUMATH.lat, BRUMATH.lon, [LFST], NOW_MS, cache, "en");
    expect(enFrancais.fromCache).toBe(false);
    expect(enAnglais.fromCache).toBe(true);
    expect((enFrancais.body as MetarResponse).text.headline).toBe("Éclaircies");
    expect((enAnglais.body as MetarResponse).text.headline).toBe("Partly cloudy");
    // Une seule requête réseau pour les deux : le cache a bien servi.
    expect(enAnglais.nbAppels()).toBe(0);
  });
});

describe("handleNearest — cache", () => {
  it("ne rappelle pas le réseau pour la même position dans les 5 minutes", async () => {
    const cache = new Map();
    const { impl, nbAppels } = fakeFetch([LFST]);
    const q = { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr" as const, units: "metric" as const };

    const a = await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS, cache });
    const b = await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS + 60_000, cache });

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(nbAppels()).toBe(1); // un seul aller-retour réseau
    expect(b.fromCache).toBe(true);
  });

  it("recalcule l'âge à chaque service : le cache ne fige pas ageMinutes", async () => {
    // Erreur classique : mettre en cache le corps de la réponse. Au bout de
    // 4 minutes, le client lirait encore « il y a 30 minutes ». On met donc en
    // cache la STATION retenue, et on réassemble à chaque appel.
    const cache = new Map();
    const { impl } = fakeFetch([LFST]);
    const q = { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr" as const, units: "metric" as const };

    const a = await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS, cache });
    const b = await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS + 4 * 60_000, cache });

    expect((a.body as MetarResponse).ageMinutes).toBe(30);
    expect((b.body as MetarResponse).ageMinutes).toBe(34);
  });

  it("refait un appel réseau une fois le cache expiré", async () => {
    const cache = new Map();
    const { impl, nbAppels } = fakeFetch([LFST]);
    const q = { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr" as const, units: "metric" as const };

    await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS, cache });
    await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS + 6 * 60_000, cache });

    expect(nbAppels()).toBe(2);
  });

  it("ne sert pas la réponse d'une autre position", async () => {
    const cache = new Map();
    const { impl, nbAppels } = fakeFetch([LFST]);
    await handleNearest(
      { lat: 48.73, lon: 7.71, lang: "fr", units: "metric" },
      { fetchImpl: impl, nowMs: NOW_MS, cache },
    );
    await handleNearest(
      { lat: 43.3, lon: 5.4, lang: "fr", units: "metric" }, // Marseille
      { fetchImpl: impl, nowMs: NOW_MS, cache },
    );
    expect(nbAppels()).toBe(2);
  });

  it("ne met JAMAIS un échec en cache", async () => {
    // Une panne de 2 secondes ne doit pas condamner la position 5 minutes.
    const cache = new Map();
    const { impl, nbAppels } = fakeFetch([]);
    const q = { lat: BRUMATH.lat, lon: BRUMATH.lon, lang: "fr" as const, units: "metric" as const };
    await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS, cache });
    await handleNearest(q, { fetchImpl: impl, nowMs: NOW_MS + 1000, cache });
    // 4 et non 2 : une zone déserte coûte DEUX requêtes par appel (boîte
    // serrée puis élargie). Le point vérifié est que la seconde demande, une
    // seconde plus tard, est bien repartie sur le réseau au lieu d'être servie
    // depuis le cache.
    expect(nbAppels()).toBe(4);
    expect(cache.size).toBe(0);
  });
});
