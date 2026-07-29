// api/geocode.ts
// GET /api/geocode?q=Brumath&lang=fr
//
// Point d'entrée SÉPARÉ de /api/nearest, et non un mode de plus sur celui-ci :
// il ne décode aucun METAR, il traduit un nom en coordonnées. Le client
// enchaîne ensuite lui-même sur /api/nearest avec la position obtenue, donc
// les deux appels restent indépendants et chacun garde son union d'erreurs.
//
// Même architecture que api/nearest.ts : `parseGeocodeQuery` et
// `statusForGeocodeReason` sont PURES et portent la logique ; `handler` ne
// connaît que HTTP et ne décide de rien.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type { GeocodeError, GeocodeErrorCode, GeocodeResponse, Lang } from "../src/types.js";
import { fetchGeocode } from "../src/geocode.js";
import { responseHeaders } from "./nearest.js";

// ---------- 1. Lecture de la requête (PURE) ----------

export type ParsedGeocodeQuery =
  | { ok: true; value: { q: string; lang: Lang } }
  | { ok: false; error: GeocodeErrorCode };

// Un paramètre répété (?q=a&q=b) arrive en tableau : on prend la première
// valeur plutôt que d'échouer, comme le fait déjà parseQuery.
const premier = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export function parseGeocodeQuery(
  raw: Record<string, string | string[] | undefined>,
): ParsedGeocodeQuery {
  const q = premier(raw.q);
  // La borne de longueur vit dans fetchGeocode, qui la partage avec les
  // appels internes ; ici on ne tranche que l'absence, qui est le seul cas
  // où l'on peut répondre sans même consulter le module.
  if (typeof q !== "string" || q.trim().length === 0) {
    return { ok: false, error: "invalid_query" };
  }

  // Langue inconnue -> français, JAMAIS un échec. Même règle que
  // parseQuery : une faute de frappe sur `lang` ne doit pas priver de
  // résultat. Ici elle a un effet réel (la source traduit ses régions), mais
  // pas au point de refuser de répondre.
  const langBrut = premier(raw.lang);
  const lang: Lang = langBrut === "en" ? "en" : "fr";

  return { ok: true, value: { q, lang } };
}

// ---------- 2. Correspondance des codes HTTP (PURE) ----------

/**
 * `switch` EXHAUSTIF avec garde `never`, comme `statusForReason`. Le jour où
 * un quatrième motif s'ajoute à `GeocodeErrorCode`, ceci devient une erreur de
 * compilation et non un 500 silencieux en production.
 */
export function statusForGeocodeReason(reason: GeocodeErrorCode): number {
  switch (reason) {
    case "invalid_query":
      return 400;
    case "city_not_found":
      return 404;
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
  // `responseHeaders` est réutilisé TEL QUEL depuis api/nearest.ts, et ce
  // n'est pas de la paresse : l'en-tête CORS y est indispensable pour la même
  // raison exactement (dans l'APK la page est servie depuis https://localhost,
  // donc tout appel est inter-domaines), et un échec illisible depuis une
  // autre origine forcerait la page à afficher une panne réseau générique
  // alors qu'elle a un message rédigé pour « ville introuvable ».
  const poser = (status: number): void => {
    for (const [nom, valeur] of Object.entries(responseHeaders(status))) {
      res.setHeader(nom, valeur);
    }
  };

  const q = parseGeocodeQuery(req.query as Record<string, string | string[] | undefined>);
  if (!q.ok) {
    poser(400);
    res.status(400).json({ error: q.error } satisfies GeocodeError);
    return;
  }

  const r = await fetchGeocode(q.value.q, q.value.lang);
  if (!r.found) {
    const status = statusForGeocodeReason(r.reason);
    poser(status);
    res.status(status).json({ error: r.reason } satisfies GeocodeError);
    return;
  }

  poser(200);
  res.status(200).json({ results: r.places } satisfies GeocodeResponse);
}
