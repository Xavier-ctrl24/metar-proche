// tests/uv.test.ts
// Tests de src/uv.ts (indice UV, Open-Meteo Forecast).
//
// AUCUN appel réseau réel, comme awc.test.ts et geocode.test.ts, et pour la
// même raison : un test qui dépend d'internet n'est pas un test, c'est un pari.
//
// La charge utile de FIXTURE est une VRAIE réponse capturée le 30/07/2026 sur
// api.open-meteo.com pour Brumath. Elle n'a pas été retouchée dans sa forme,
// et c'est cette forme qui porte le piège du module : la valeur utile est
// imbriquée sous `current`, pas à la racine.

import { describe, it, expect, vi } from "vitest";
import {
  buildUvUrl,
  uvLevel,
  normalizeUv,
  fetchUv,
  UV_BASE_URL,
  SEUILS_UV,
} from "../src/uv.js";
import { parseUvQuery, statusForUvReason } from "../api/uv.js";

// ---------- Fixtures ----------

// Vraie réponse du 30/07/2026, lat=48.73 lon=7.71.
const CHARGE_BRUMATH = {
  latitude: 48.72,
  longitude: 7.72,
  generationtime_ms: 0.0605583190917968,
  utc_offset_seconds: 0,
  timezone: "GMT",
  timezone_abbreviation: "GMT",
  elevation: 148,
  current_units: { time: "iso8601", interval: "seconds", uv_index: "" },
  current: { time: "2026-07-30T10:15", interval: 900, uv_index: 6.1 },
};

const faux = (charge: unknown, status = 200) =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => charge }));

// ---------- 1. Construction de l'URL (PURE) ----------

describe("buildUvUrl", () => {
  it("interroge la valeur COURANTE et non une prévision horaire", () => {
    const url = buildUvUrl(48.73, 7.71);
    expect(url.startsWith(UV_BASE_URL)).toBe(true);
    expect(url).toContain("current=uv_index");
    // Une prévision horaire obligerait la page à choisir l'heure, donc à
    // connaître le fuseau de la station : la valeur courante s'y substitue.
    expect(url).not.toContain("hourly=");
  });

  it("demande explicitement UTC, jamais le fuseau local de la source", () => {
    // Sans ce paramètre la source rend une heure locale SANS décalage écrit,
    // donc un horodatage qu'on ne peut pas convertir. On force UTC pour que
    // `observedAt` soit un instant réel et non une heure murale ambiguë.
    expect(buildUvUrl(48.73, 7.71)).toContain("timezone=UTC");
  });

  it("transmet la position sans la reformater", () => {
    const url = buildUvUrl(-33.87, 151.21);
    expect(url).toContain("latitude=-33.87");
    expect(url).toContain("longitude=151.21");
  });
});

// ---------- 2. Classification (PURE) ----------

describe("uvLevel", () => {
  // Les seuils sont ceux de l'OMS. Ce test les épingle DÉLIBÉRÉMENT aux
  // bornes : c'est le seul endroit du module où une erreur d'inégalité
  // (`>` au lieu de `>=`) est invisible à la lecture.
  it("range les valeurs aux bornes exactes de l'échelle OMS", () => {
    expect(uvLevel(0)).toBe("low");
    expect(uvLevel(2)).toBe("low");
    expect(uvLevel(3)).toBe("moderate");
    expect(uvLevel(5)).toBe("moderate");
    expect(uvLevel(6)).toBe("high");
    expect(uvLevel(7)).toBe("high");
    expect(uvLevel(8)).toBe("very_high");
    expect(uvLevel(10)).toBe("very_high");
    expect(uvLevel(11)).toBe("extreme");
    expect(uvLevel(15)).toBe("extreme");
  });

  it("les seuils exportés correspondent au classement rendu", () => {
    // Verrouille la cohérence entre la constante que Xavier peut relire et le
    // code qui décide : un seuil modifié dans l'une sans l'autre tombe ici.
    expect(uvLevel(SEUILS_UV.moderate)).toBe("moderate");
    expect(uvLevel(SEUILS_UV.moderate - 1)).toBe("low");
    expect(uvLevel(SEUILS_UV.extreme)).toBe("extreme");
    expect(uvLevel(SEUILS_UV.extreme - 1)).toBe("very_high");
  });

  it("un UV négatif est traité comme nul et non comme une erreur", () => {
    // La source ne devrait jamais en rendre, mais un modèle numérique peut
    // produire -0.01 la nuit. Refuser la réponse pour ça serait absurde.
    expect(uvLevel(-1)).toBe("low");
  });
});

// ---------- 3. Normalisation (PURE) ----------

describe("normalizeUv", () => {
  it("lit la vraie réponse du 30/07/2026", () => {
    const uv = normalizeUv(CHARGE_BRUMATH);
    expect(uv).not.toBeNull();
    // 6,1 arrondi à 6, donc « high ». C'est le cas qui prouve que le jeton
    // suit la valeur AFFICHÉE et non la valeur brute.
    expect(uv?.value).toBe(6);
    expect(uv?.level).toBe("high");
  });

  it("classe sur la valeur ARRONDIE, pas sur la valeur brute", () => {
    // 2,6 s'affiche « UV 3 ». S'il portait le jeton `low` (classé sur 2,6),
    // le chiffre et la phrase se contrediraient à l'écran. C'est le défaut
    // que ce test existe pour interdire.
    const uv = normalizeUv({ current: { uv_index: 2.6 } });
    expect(uv?.value).toBe(3);
    expect(uv?.level).toBe("moderate");
  });

  it("convertit l'heure de la source en ISO UTC complet", () => {
    // La source rend « 2026-07-30T10:15 », sans « Z » et sans secondes.
    // Passé tel quel, `new Date()` l'interpréterait en heure LOCALE du
    // serveur côté client : le même champ dirait deux instants différents
    // selon qui le lit. On le rend donc explicite.
    expect(normalizeUv(CHARGE_BRUMATH)?.observedAt).toBe("2026-07-30T10:15:00Z");
  });

  it("rend null quand la valeur manque, sans lever", () => {
    // Le piège de forme : la valeur est sous `current`, pas à la racine. Un
    // `payload.uv_index` écrit de mémoire lirait `undefined` en silence.
    expect(normalizeUv({ uv_index: 6.1 })).toBeNull();
    expect(normalizeUv({ current: {} })).toBeNull();
    expect(normalizeUv({ current: { uv_index: null } })).toBeNull();
  });

  it("ne lève sur AUCUNE charge utile, même absurde", () => {
    for (const c of [null, undefined, 42, "texte", [], { current: 7 }, { current: [] }]) {
      expect(() => normalizeUv(c)).not.toThrow();
      expect(normalizeUv(c)).toBeNull();
    }
  });

  it("écarte une valeur non finie", () => {
    expect(normalizeUv({ current: { uv_index: NaN } })).toBeNull();
    expect(normalizeUv({ current: { uv_index: Infinity } })).toBeNull();
  });

  it("accepte une réponse sans horodatage", () => {
    // `observedAt` est nullable dans le contrat : l'absence d'heure ne doit
    // pas faire perdre la valeur, qui est la seule chose dont la page a besoin.
    const uv = normalizeUv({ current: { uv_index: 9 } });
    expect(uv?.value).toBe(9);
    expect(uv?.observedAt).toBeNull();
  });
});

// ---------- 4. Appel complet (IMPUR, fetch injecté) ----------

describe("fetchUv", () => {
  it("rend la valeur sur une réponse normale", async () => {
    const r = await fetchUv(48.73, 7.71, { fetchImpl: faux(CHARGE_BRUMATH), retryDelayMs: 0 });
    expect(r.found).toBe(true);
    if (r.found) expect(r.uv.level).toBe("high");
  });

  it("refuse une position invalide AVANT toute I/O", async () => {
    const f = faux(CHARGE_BRUMATH);
    for (const [lat, lon] of [[NaN, 7], [91, 7], [-91, 7], [48, 181], [48, -181]]) {
      const r = await fetchUv(lat, lon, { fetchImpl: f, retryDelayMs: 0 });
      expect(r.found).toBe(false);
      if (!r.found) expect(r.reason).toBe("invalid_position");
    }
    // Aucune requête consommée : une faute d'appel n'est pas une panne.
    expect(f).not.toHaveBeenCalled();
  });

  it("réessaie une panne passagère, une seule fois", async () => {
    let n = 0;
    const f = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("ECONNRESET");
      return { ok: true, status: 200, json: async () => CHARGE_BRUMATH };
    });
    const r = await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0 });
    expect(r.found).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("ne réessaie PAS un 4xx : c'est notre requête qui est fautive", async () => {
    const f = faux({}, 400);
    const r = await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0 });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("réessaie un 5xx et un 429", async () => {
    for (const status of [500, 503, 429]) {
      const f = faux({}, status);
      await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0 });
      expect(f).toHaveBeenCalledTimes(2);
    }
  });

  it("une réponse 200 SANS valeur utile est une panne, pas une valeur nulle", async () => {
    // Une source qui répond 200 avec une charge inattendue a changé
    // d'interface. Rendre `value: 0` serait un mensonge : UV 0 signifie nuit.
    const r = await fetchUv(48.73, 7.71, { fetchImpl: faux({ current: {} }), retryDelayMs: 0 });
    expect(r.found).toBe(false);
    if (!r.found) expect(r.reason).toBe("network_error");
  });

  it("ne lève jamais, même si le corps est illisible", async () => {
    const f = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("JSON tronqué");
      },
    }));
    const r = await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0 });
    expect(r.found).toBe(false);
  });

  it("maxAttempts: 1 coupe le réessai sans toucher au code", async () => {
    const f = faux({}, 500);
    await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0, maxAttempts: 1 });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("transmet le signal de délai à chaque tentative", async () => {
    // Piège vérifié par mutation dans awc.ts le 27/07/2026 : un `fetch` qui
    // n'utilise pas `init` rend le plafond purement décoratif en production
    // pendant que tous les tests restent au vert.
    const vus: (AbortSignal | undefined)[] = [];
    const f = vi.fn(async (_u: string, init?: { signal?: AbortSignal }) => {
      vus.push(init?.signal);
      return { ok: true, status: 200, json: async () => CHARGE_BRUMATH };
    });
    await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0 });
    expect(vus[0]).toBeInstanceOf(AbortSignal);
  });

  it("timeoutMs: 0 désactive le plafond", async () => {
    const vus: (AbortSignal | undefined)[] = [];
    const f = vi.fn(async (_u: string, init?: { signal?: AbortSignal }) => {
      vus.push(init?.signal);
      return { ok: true, status: 200, json: async () => CHARGE_BRUMATH };
    });
    await fetchUv(48.73, 7.71, { fetchImpl: f, retryDelayMs: 0, timeoutMs: 0 });
    expect(vus[0]).toBeUndefined();
  });
});

// ---------- 5. Point d'entrée HTTP (PUR) ----------

describe("parseUvQuery", () => {
  it("lit une position valide", () => {
    const q = parseUvQuery({ lat: "48.73", lon: "7.71" });
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.value).toEqual({ lat: 48.73, lon: 7.71 });
  });

  it("rejette l'absence, le vide et le non-numérique", () => {
    for (const raw of [{}, { lat: "48.73" }, { lon: "7.71" }, { lat: "", lon: "7.71" }, { lat: "abc", lon: "7.71" }]) {
      const q = parseUvQuery(raw);
      expect(q.ok).toBe(false);
      if (!q.ok) expect(q.error).toBe("invalid_position");
    }
  });

  it("`?lat=` vide n'est pas l'équateur", () => {
    // Même règle que parseQuery : on exige une chaîne NON VIDE et un nombre
    // fini. `Number("")` vaut 0, ce qui ferait passer une saisie absente pour
    // une position au large du golfe de Guinée.
    expect(parseUvQuery({ lat: "", lon: "" }).ok).toBe(false);
  });

  it("prend la première valeur d'un paramètre répété", () => {
    const q = parseUvQuery({ lat: ["48.73", "0"], lon: "7.71" });
    expect(q.ok).toBe(true);
    if (q.ok) expect(q.value.lat).toBe(48.73);
  });
});

describe("statusForUvReason", () => {
  it("associe chaque motif à son code HTTP", () => {
    expect(statusForUvReason("invalid_position")).toBe(400);
    expect(statusForUvReason("network_error")).toBe(502);
  });
});
