// tests/geocode.test.ts
// Tests de src/geocode.ts (recherche de ville, Open-Meteo Geocoding).
//
// Même principe que tests/awc.test.ts, et pour les mêmes raisons : AUCUN
// appel réseau réel. Un test qui dépend d'internet n'est pas un test, c'est
// un pari. On injecte donc un faux `fetch`.
//
// Les charges utiles de FIXTURE ci-dessous sont de VRAIES réponses capturées
// le 29/07/2026 sur geocoding-api.open-meteo.com, réduites aux champs que le
// module lit mais jamais retouchées dans leur FORME. C'est cette forme-là qui
// porte le piège principal du module (voir CHARGE_VIDE).

import { describe, it, expect, vi } from "vitest";
import {
  buildGeocodeUrl,
  normalizePlaces,
  fetchGeocode,
  MAX_RESULTS,
  GEOCODE_BASE_URL,
} from "../src/geocode.js";
import { parseGeocodeQuery, statusForGeocodeReason } from "../api/geocode.js";

// ---------- Fixtures : vraies réponses du 29/07/2026 ----------

// Une seule correspondance : le cas courant, celui qui doit passer sans
// demander à l'utilisateur de choisir.
const CHARGE_BRUMATH = {
  generationtime_ms: 0.64635277,
  results: [
    {
      id: 3029771,
      name: "Brumath",
      latitude: 48.73398,
      longitude: 7.71095,
      elevation: 148,
      feature_code: "PPL",
      country_code: "FR",
      admin1: "Grand Est",
      admin2: "Bas-Rhin",
      country: "France",
      population: 9459,
      timezone: "Europe/Paris",
      postcodes: ["67170"],
    },
  ],
};

// Trois correspondances homonymes. C'est LE cas qui interdit de prendre
// results[0] en silence : la source ne documente aucun ordre, et rien ne dit
// que le Paris voulu est le français.
const CHARGE_PARIS = {
  generationtime_ms: 0.7,
  results: [
    { id: 1, name: "Paris", country: "France", admin1: "Île-de-France Region",
      country_code: "FR", latitude: 48.85341, longitude: 2.3488 },
    { id: 2, name: "Paris", country: "United States", admin1: "Texas",
      country_code: "US", latitude: 33.66094, longitude: -95.55551 },
    { id: 3, name: "Paris", country: "United States", admin1: "Tennessee",
      country_code: "US", latitude: 36.302, longitude: -88.32671 },
  ],
};

// LE PIÈGE DU MODULE, et la raison d'être de ce fichier. Une recherche sans
// résultat ne rend PAS `results: []` : elle rend 200 avec la clé `results`
// PUREMENT ABSENTE. Un code écrit de mémoire ferait `payload.results.map`
// et lèverait, ce qui en production serait compté comme une panne réseau,
// donc afficherait « source injoignable » sur une simple faute de frappe.
// C'est exactement la forme du piège du HTTP 204 d'AWC (26/07/2026).
const CHARGE_VIDE = { generationtime_ms: 0.15354156 };

// Fabrique un faux `fetch` qui rend une charge utile et un code donnés.
const fauxFetch = (payload: unknown, status = 200) =>
  vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }));

// ---------- 1. Construction de l'URL (PURE) ----------

describe("buildGeocodeUrl", () => {
  it("interroge la source attendue et encode le nom", () => {
    const url = buildGeocodeUrl("Saint-Étienne", "fr");
    expect(url.startsWith(GEOCODE_BASE_URL)).toBe(true);
    // Encodé, jamais collé tel quel : un nom contient accents et espaces.
    expect(url).toContain(encodeURIComponent("Saint-Étienne"));
    expect(url).not.toContain("Saint-Étienne");
  });

  it("demande plusieurs résultats, pour pouvoir lever une homonymie", () => {
    expect(MAX_RESULTS).toBeGreaterThan(1);
    expect(buildGeocodeUrl("Paris", "fr")).toContain(`count=${MAX_RESULTS}`);
  });

  // La langue n'est PAS décorative : elle change le contenu rendu
  // (« Île-de-France Region » en anglais). Elle est donc obligatoire, au même
  // titre que le 3e paramètre de buildResponse.
  it("transmet la langue demandée", () => {
    expect(buildGeocodeUrl("Paris", "fr")).toContain("language=fr");
    expect(buildGeocodeUrl("Paris", "en")).toContain("language=en");
  });

  it("coupe les espaces de bord de la saisie", () => {
    expect(buildGeocodeUrl("  Lyon  ", "fr")).toContain("name=Lyon&");
  });
});

// ---------- 2. Normalisation (PURE) ----------

describe("normalizePlaces", () => {
  it("retient les champs du contrat sur une réponse réelle", () => {
    expect(normalizePlaces(CHARGE_BRUMATH)).toEqual([
      { name: "Brumath", admin1: "Grand Est", country: "France",
        countryCode: "FR", latitude: 48.73398, longitude: 7.71095 },
    ]);
  });

  it("conserve les trois homonymes DANS L'ORDRE de la source", () => {
    const p = normalizePlaces(CHARGE_PARIS);
    expect(p).toHaveLength(3);
    expect(p.map((x) => x.country)).toEqual(["France", "United States", "United States"]);
    expect(p.map((x) => x.admin1)).toEqual(["Île-de-France Region", "Texas", "Tennessee"]);
  });

  // Le test qui garde le piège. Le supprimer, c'est rouvrir la porte.
  it("rend [] quand la clé results est ABSENTE (cas réel du sans-résultat)", () => {
    expect(normalizePlaces(CHARGE_VIDE)).toEqual([]);
  });

  it("ne lève sur aucune charge utile aberrante", () => {
    for (const aberrant of [null, undefined, 42, "texte", [], {}, { results: null },
      { results: "pas un tableau" }, { results: [null, 7] }]) {
      expect(() => normalizePlaces(aberrant)).not.toThrow();
      expect(normalizePlaces(aberrant)).toEqual([]);
    }
  });

  it("écarte une entrée sans coordonnées utilisables, garde les autres", () => {
    const melange = { results: [
      { name: "Sans position", country: "X" },
      { name: "Bonne", latitude: 1, longitude: 2 },
      { name: "Latitude illisible", latitude: "nord", longitude: 2 },
    ] };
    const p = normalizePlaces(melange);
    expect(p).toHaveLength(1);
    expect(p[0].name).toBe("Bonne");
  });

  it("met à null les champs d'homonymie absents plutôt que d'inventer", () => {
    const p = normalizePlaces({ results: [{ name: "Nulle part", latitude: 0, longitude: 0 }] });
    expect(p[0]).toEqual({ name: "Nulle part", admin1: null, country: null,
      countryCode: null, latitude: 0, longitude: 0 });
  });

  it("écarte une entrée sans nom : elle serait inaffichable", () => {
    expect(normalizePlaces({ results: [{ latitude: 1, longitude: 2 }] })).toEqual([]);
  });
});

// ---------- 3. Recherche complète (IMPURE, fetch injecté) ----------

describe("fetchGeocode", () => {
  it("rend les lieux trouvés sur une réponse réelle", async () => {
    const f = fauxFetch(CHARGE_BRUMATH);
    const r = await fetchGeocode("Brumath", "fr", { fetchImpl: f });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(r.places).toHaveLength(1);
      expect(r.places[0].latitude).toBeCloseTo(48.734, 3);
    }
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("rend city_not_found quand la source ne connaît pas le nom", async () => {
    const r = await fetchGeocode("zzzzqqqq", "fr", { fetchImpl: fauxFetch(CHARGE_VIDE) });
    expect(r).toEqual({ found: false, reason: "city_not_found" });
  });

  // Une saisie vide est une faute d'APPEL, pas une panne : on ne consomme
  // pas de requête réseau pour l'apprendre.
  it("refuse une saisie vide sans appeler le réseau", async () => {
    const f = fauxFetch(CHARGE_BRUMATH);
    for (const vide of ["", "   ", "\t"]) {
      const r = await fetchGeocode(vide, "fr", { fetchImpl: f });
      expect(r).toEqual({ found: false, reason: "invalid_query" });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it("refuse une saisie déraisonnablement longue sans appeler le réseau", async () => {
    const f = fauxFetch(CHARGE_BRUMATH);
    const r = await fetchGeocode("x".repeat(500), "fr", { fetchImpl: f });
    expect(r).toEqual({ found: false, reason: "invalid_query" });
    expect(f).not.toHaveBeenCalled();
  });

  it("rend network_error sur un code HTTP d'échec", async () => {
    const r = await fetchGeocode("Paris", "fr", { fetchImpl: fauxFetch({}, 500) });
    expect(r).toEqual({ found: false, reason: "network_error" });
  });

  it("rend network_error sur un corps illisible, sans lever", async () => {
    const f = vi.fn(async () => ({
      ok: true, status: 200,
      json: async () => { throw new SyntaxError("JSON tronqué"); },
    }));
    const r = await fetchGeocode("Paris", "fr", { fetchImpl: f });
    expect(r).toEqual({ found: false, reason: "network_error" });
  });

  it("rend network_error sur une panne de transport, sans lever", async () => {
    const f = vi.fn(async () => { throw new TypeError("fetch failed"); });
    const r = await fetchGeocode("Paris", "fr", { fetchImpl: f });
    expect(r).toEqual({ found: false, reason: "network_error" });
  });

  // Même exclusion que le 204 d'AWC, et pour la même raison : une absence de
  // résultat est une RÉPONSE, pas une panne. La réessayer doublerait la charge
  // sur la source sans la moindre chance d'aboutir.
  it("ne réessaie JAMAIS un sans-résultat", async () => {
    const f = fauxFetch(CHARGE_VIDE);
    await fetchGeocode("zzzzqqqq", "fr", { fetchImpl: f, retryDelayMs: 0 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("réessaie une panne passagère, et aboutit au second essai", async () => {
    let appels = 0;
    const f = vi.fn(async () => {
      appels += 1;
      if (appels === 1) throw new TypeError("fetch failed");
      return { ok: true, status: 200, json: async () => CHARGE_BRUMATH };
    });
    const r = await fetchGeocode("Brumath", "fr", { fetchImpl: f, retryDelayMs: 0 });
    expect(r.found).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("transmet le signal d'abandon du délai d'attente", async () => {
    const f = vi.fn(async (_url: string, init?: { signal?: AbortSignal }) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return { ok: true, status: 200, json: async () => CHARGE_BRUMATH };
    });
    await fetchGeocode("Brumath", "fr", { fetchImpl: f });
  });
});

// ---------- 4. Point d'entrée HTTP, parties PURES ----------

describe("parseGeocodeQuery", () => {
  it("accepte une requête normale", () => {
    expect(parseGeocodeQuery({ q: "Brumath", lang: "fr" }))
      .toEqual({ ok: true, value: { q: "Brumath", lang: "fr" } });
  });

  it("refuse un nom absent ou vide", () => {
    for (const raw of [{}, { q: "" }, { q: "   " }, { q: undefined }]) {
      expect(parseGeocodeQuery(raw).ok).toBe(false);
    }
    expect(parseGeocodeQuery({})).toEqual({ ok: false, error: "invalid_query" });
  });

  // Même règle que parseQuery de /api/nearest : une faute de frappe sur la
  // langue ne doit PAS priver de résultat.
  it("retombe sur le français pour une langue inconnue, sans échouer", () => {
    const r = parseGeocodeQuery({ q: "Paris", lang: "klingon" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.lang).toBe("fr");
  });

  it("retient l'anglais quand il est demandé", () => {
    const r = parseGeocodeQuery({ q: "Paris", lang: "en" });
    if (r.ok) expect(r.value.lang).toBe("en");
  });

  it("prend la première valeur d'un paramètre répété", () => {
    const r = parseGeocodeQuery({ q: ["Lyon", "Nice"] });
    if (r.ok) expect(r.value.q).toBe("Lyon");
  });
});

describe("statusForGeocodeReason", () => {
  it("associe un code HTTP parlant à chaque motif", () => {
    expect(statusForGeocodeReason("invalid_query")).toBe(400);
    expect(statusForGeocodeReason("city_not_found")).toBe(404);
    expect(statusForGeocodeReason("network_error")).toBe(502);
  });

  // Le 404 dit « rien ici », pas « tu t'es trompé » : une ville introuvable
  // n'est pas une requête malformée, et un client qui distingue les deux
  // (la page en distingue justement deux messages) a besoin de ce contraste.
  it("ne confond pas saisie fautive et absence de résultat", () => {
    expect(statusForGeocodeReason("invalid_query"))
      .not.toBe(statusForGeocodeReason("city_not_found"));
  });
});