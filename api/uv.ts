// api/uv.ts
// GET /api/uv?lat=48.73&lon=7.71
//
// TROISIÈME point d'entrée du projet, et SÉPARÉ de /api/nearest sur arbitrage
// de Xavier du 30/07/2026. La raison n'est pas esthétique : l'indice UV vient
// d'une autre source amont (Open-Meteo), et le fondre dans /api/nearest aurait
// mis cette source sur le chemin critique de chaque consultation. Ici, la page
// appelle les deux EN PARALLÈLE : si l'UV tombe ou traîne, la météo s'affiche
// quand même et la carte UV n'apparaît pas.
//
// Il n'y a AUCUNE langue dans cette requête, contrairement à /api/geocode, et
// c'est une conséquence directe du contrat : la réponse ne contient pas une
// seule phrase, seulement un nombre et un jeton. Le vocabulaire vit côté page.
// Ce point d'entrée ne peut donc pas produire la régression du 28/07/2026.
//
// Même architecture que api/geocode.ts : `parseUvQuery` et `statusForUvReason`
// sont PURES et portent la logique ; `handler` ne connaît que HTTP.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { UvError, UvErrorCode, UvResponse } from "../src/types.js";
import { fetchUv } from "../src/uv.js";
import { responseHeaders } from "./nearest.js";

// ---------- 1. Lecture de la requête (PURE) ----------

export type ParsedUvQuery =
  | { ok: true; value: { lat: number; lon: number } }
  | { ok: false; error: UvErrorCode };

// Un paramètre répété (?lat=a&lat=b) arrive en tableau : on prend la première
// valeur plutôt que d'échouer, comme le font déjà parseQuery et
// parseGeocodeQuery.
const premier = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

/**
 * Lit lat/lon. Les bornes géographiques restent dans `fetchUv`, qui les
 * partage avec les appels internes ; ici on exige seulement une chaîne NON
 * VIDE et un nombre fini.
 *
 * `?lat=` vide n'est pas l'équateur : `Number("")` vaut 0, donc sans le test
 * de longueur une saisie absente passerait pour une position au large du golfe
 * de Guinée. Même règle que `parseQuery` d'api/nearest.ts, et pour le même
 * motif.
 */
export function parseUvQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedUvQuery {
  const latBrut = premier(raw.lat);
  const lonBrut = premier(raw.lon);
  if (
    typeof latBrut !== "string" || latBrut.trim().length === 0 ||
    typeof lonBrut !== "string" || lonBrut.trim().length === 0
  ) {
    return { ok: false, error: "invalid_position" };
  }
  const lat = Number(latBrut);
  const lon = Number(lonBrut);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "invalid_position" };
  }
  return { ok: true, value: { lat, lon } };
}

// ---------- 2. Correspondance des codes HTTP (PURE) ----------

/**
 * `switch` EXHAUSTIF avec garde `never`, comme `statusForReason` et
 * `statusForGeocodeReason`. Le jour où un troisième motif s'ajoute à
 * `UvErrorCode`, ceci devient une erreur de compilation et non un 500
 * silencieux en production.
 */
export function statusForUvReason(reason: UvErrorCode): number {
  switch (reason) {
    case "invalid_position":
      return 400;
    case "network_error":
      return 502;
    default: {
      const jamais: never = reason;
      return jamais;
    }
  }
}

// ---------- 3. Entrée HTTP (Vercel) ----------

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // `responseHeaders` réutilisé TEL QUEL depuis api/nearest.ts : l'en-tête
  // CORS y est indispensable pour la même raison (dans l'APK la page est
  // servie depuis https://localhost, donc tout appel est inter-domaines).
  //
  // L'en-tête de cache qu'il pose (s-maxage=300) tombe juste ici sans qu'on
  // ait rien à régler : la source ne rafraîchit sa valeur que toutes les
  // 15 minutes, donc un cache de 5 minutes ne peut pas périmer une donnée
  // plus vite qu'elle ne change.
  const poser = (status: number): void => {
    for (const [nom, valeur] of Object.entries(responseHeaders(status))) {
      res.setHeader(nom, valeur);
    }
  };

  const q = parseUvQuery(req.query as Record<string, string | string[] | undefined>);
  if (!q.ok) {
    poser(400);
    res.status(400).json({ error: q.error } satisfies UvError);
    return;
  }

  const r = await fetchUv(q.value.lat, q.value.lon);
  if (!r.found) {
    const status = statusForUvReason(r.reason);
    poser(status);
    res.status(status).json({ error: r.reason } satisfies UvError);
    return;
  }

  poser(200);
  res.status(200).json(r.uv satisfies UvResponse);
}
