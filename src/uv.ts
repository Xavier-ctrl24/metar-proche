// src/uv.ts
// Indice UV : la SECONDE source de données du projet.
//
// POURQUOI CE MODULE EXISTE (30/07/2026, demande de Xavier). L'indice UV
// n'existe pas dans un METAR, et rien dans un METAR ne permet de le calculer :
// on y trouve une couverture nuageuse, pas un éclairement. Il fallait donc une
// source de plus, ce qui engage le contrat d'API — d'où l'arbitrage demandé.
//
// SOURCE : Open-Meteo Forecast, le même fournisseur que le géocodage. Retenu
// pour la même raison d'exploitation : ni clé, ni compte, comme
// aviationweather.gov. Vérifié fonctionnel le 30/07/2026 (`current.uv_index`
// = 6,10 à Brumath, rafraîchi toutes les 15 minutes).
//
// LE CLIENT N'APPELLE PAS LA SOURCE DIRECTEMENT, et c'est le même engagement
// que pour geocode.ts : appeler depuis la page enverrait la position exacte de
// l'utilisateur et son adresse IP au tiers, à chaque consultation. Tout passe
// par /api/uv.
//
// APPEL NON BLOQUANT, arbitrage de Xavier du 30/07/2026 : la page l'appelle EN
// PARALLÈLE de /api/nearest et n'attend pas sa réponse pour afficher la météo.
// C'est ce qui garantit qu'une seconde source ne peut pas dégrader le service
// qui existait avant elle. Fondre l'UV dans /api/nearest aurait mis cette
// source sur le chemin critique de chaque consultation.
//
// Découpage PUR / IMPUR identique à awc.ts et geocode.ts : `buildUvUrl`,
// `uvLevel` et `normalizeUv` sont pures et portent toute la logique ;
// `fetchUv` est la seule I/O et reçoit son `fetch` en paramètre. Aucun appel
// réseau dans `npm test`.

import type { UvLevel, UvResponse, UvErrorCode } from "./types.js";

// ---------- 1. Réglages ----------

export const UV_BASE_URL = "https://api.open-meteo.com/v1/forecast";

// SEUILS DE L'OMS, et non des valeurs de notre cru. Chaque nombre est la
// valeur MINIMALE du niveau qu'il nomme. Groupés dans une constante nommée
// plutôt qu'écrits dans le `switch`, pour la même raison que `SEUILS` dans la
// page : Xavier doit pouvoir les relire d'un coup d'œil sans lire de code.
//
// `low` n'y figure pas : c'est le plancher, donc le repli.
export const SEUILS_UV = {
  moderate: 3,
  high: 6,
  very_high: 8,
  extreme: 11,
} as const;

// Réessai : mêmes valeurs et même patron d'injection qu'awc.ts et geocode.ts.
export const MAX_ATTEMPTS = 2;
export const RETRY_DELAY_MS = 200;

// PLAFOND CHOISI, PAS MESURÉ, et il faut le dire comme geocode.ts le dit.
// 5 s, la même valeur, parce que c'est le même fournisseur et le même genre
// d'appel : une lecture de modèle déjà calculé, annoncée à 0,06 ms de
// génération. Rien à voir avec le balayage de bbox d'awc.ts, lent par nature.
//
// Ici le plafond compte MOINS qu'ailleurs, et c'est un effet du découpage :
// l'appel étant non bloquant, un dépassement ne retarde rien — il fait juste
// que la carte UV n'apparaît pas.
export const TIMEOUT_MS = 5000;

// ---------- 2. Types ----------

// Volontairement identique à celui de geocode.ts plutôt que partagé : on ne
// décrit que ce qu'on utilise, et un faux `fetch` de test qui ignore `init`
// reste valable (une fonction qui prend moins de paramètres est acceptée).
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface UvOptions {
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
  maxAttempts?: number;
  timeoutMs?: number; // 0 = aucun plafond, utile pour mesurer la latence nue
}

// Union discriminée, comme `NearestResult` et `GeocodeResult` : un échec est
// une DONNÉE de retour, jamais une exception.
export type UvResult =
  | { found: true; uv: UvResponse }
  | { found: false; reason: UvErrorCode };

// ---------- 3. Construction de l'URL (PURE) ----------

/**
 * URL de la valeur COURANTE d'indice UV pour une position.
 *
 * Deux choix de paramètres qui méritent leur ligne :
 *
 * `current=` et non `hourly=`. Une prévision horaire obligerait à choisir
 * l'heure, donc à connaître le fuseau de la station et à décider si l'on veut
 * l'heure de l'observation METAR ou l'heure présente. La valeur courante évite
 * toute cette arithmétique, et c'est bien elle qu'on veut afficher.
 *
 * `timezone=UTC` explicite. Sans lui, la source rend une heure LOCALE écrite
 * sans décalage (« 2026-07-30T12:15 »), donc un horodatage impossible à
 * convertir en instant. On force UTC pour que `observedAt` soit un instant
 * réel et non une heure murale ambiguë.
 */
export function buildUvUrl(lat: number, lon: number): string {
  return (
    `${UV_BASE_URL}?latitude=${lat}&longitude=${lon}` +
    `&current=uv_index&timezone=UTC`
  );
}

// ---------- 4. Classification (PURE) ----------

/**
 * Range une valeur entière sur l'échelle de l'OMS.
 *
 * On rend un JETON et jamais une phrase, exactement comme `dominantCondition`
 * dans icon.ts : le vocabulaire (« Protection solaire recommandée ») vit côté
 * page dans `TEXTES`, sous des clés `uv_<jeton>`. Xavier peut donc réécrire
 * les cinq phrases sans lire un seul seuil, et les deux langues ne peuvent pas
 * diverger sur QUAND chaque phrase apparaît.
 *
 * Une valeur négative retombe sur `low` plutôt que d'être refusée : un modèle
 * numérique peut rendre -0,01 la nuit, et perdre la réponse pour ça serait
 * absurde.
 */
export function uvLevel(value: number): UvLevel {
  if (value >= SEUILS_UV.extreme) return "extreme";
  if (value >= SEUILS_UV.very_high) return "very_high";
  if (value >= SEUILS_UV.high) return "high";
  if (value >= SEUILS_UV.moderate) return "moderate";
  return "low";
}

// ---------- 5. Normalisation (PURE) ----------

/**
 * Convertit la réponse brute de la source en bloc du contrat.
 *
 * LE PIÈGE DE FORME EST ICI : la valeur utile est imbriquée sous `current`,
 * pas à la racine. Un `payload.uv_index` écrit de mémoire lirait `undefined`
 * en silence, donc rendrait `null` sur une réponse parfaitement valide — et le
 * défaut se lirait « source injoignable » à l'écran. C'est la même famille de
 * piège que le HTTP 204 d'AWC et que le `results` absent du géocodage.
 *
 * L'ARRONDI PRÉCÈDE LA CLASSIFICATION, et ce n'est pas un détail : classer sur
 * la valeur brute ferait afficher « UV 3 » (2,6 arrondi) avec le jeton `low`,
 * donc un chiffre et une phrase qui se contredisent. Même garantie que le
 * sélecteur partagé entre `pickIcon` et `headlineText`.
 *
 * Ne lève jamais, quelle que soit la charge utile.
 */
export function normalizeUv(payload: unknown): UvResponse | null {
  if (typeof payload !== "object" || payload === null) return null;
  const brut = (payload as Record<string, unknown>).current;
  if (typeof brut !== "object" || brut === null || Array.isArray(brut)) return null;
  const current = brut as Record<string, unknown>;

  const v = current.uv_index;
  if (typeof v !== "number" || !Number.isFinite(v)) return null;

  const value = Math.round(v);

  // L'heure est FACULTATIVE : le contrat la déclare nullable, et la valeur
  // seule suffit à la page. On ne perd donc pas une mesure valide pour un
  // horodatage absent ou d'une forme inattendue.
  let observedAt: string | null = null;
  const t = current.time;
  if (typeof t === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) {
    // La source rend « 2026-07-30T10:15 » : ni secondes, ni « Z ». Passé tel
    // quel à `new Date()` côté client, il serait lu en heure LOCALE du
    // navigateur, donc le même champ désignerait deux instants différents
    // selon qui le lit. On complète pour en faire un instant explicite.
    observedAt = `${t}:00Z`;
  }

  return { value, level: uvLevel(value), observedAt };
}

// ---------- 6. Appel complet (IMPUR) ----------

const dormir = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Résultat d'UNE tentative. Le « vide » de geocode.ts n'a pas d'équivalent
// ici : la source couvre le globe par modèle, il n'y a pas de position sans
// réponse. Une réponse 200 sans valeur utile signale un changement
// d'interface, donc un « passager » — insister ne coûte qu'une requête et
// pourrait tomber sur un nœud sain.
type Tentative =
  | { etat: "ok"; uv: UvResponse }
  | { etat: "passager" } // 5xx, 429, transport, corps illisible, charge inattendue
  | { etat: "fatal" }; // 4xx : c'est NOTRE requête qui est fautive

async function tenterUnAppel(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<Tentative> {
  // Le signal est créé PAR TENTATIVE : réutiliser le même ferait échouer le
  // second essai instantanément, le premier ayant déjà consommé le délai.
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  try {
    const res = await fetchImpl(url, { signal });

    if (!res.ok) {
      // 4xx : insister ne peut pas aboutir. 429 fait exception et reste
      // réessayable, comme dans awc.ts et geocode.ts.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return { etat: "fatal" };
      return { etat: "passager" };
    }

    const uv = normalizeUv(await res.json());
    return uv === null ? { etat: "passager" } : { etat: "ok", uv };
  } catch {
    // Transport, DNS, TLS, corps tronqué, délai dépassé. Tous passagers, et
    // ici on ne distingue PAS le délai (contrairement à awc.ts) pour la même
    // raison que geocode.ts : le plafond est court et la source rapide, donc
    // un dépassement signale une indisponibilité, pas un manque de temps.
    return { etat: "passager" };
  }
}

/**
 * Lit l'indice UV d'une position. Ne lève jamais : tout échec est une valeur.
 *
 * UNE RÉPONSE 200 SANS VALEUR UTILE EST UNE PANNE, et non un UV de zéro. La
 * distinction compte : UV 0 signifie « il fait nuit », donc rendre 0 par
 * défaut ferait afficher une information fausse au lieu de rien afficher.
 * C'est le même principe que le décodeur, qui rend `null` là où il ne sait
 * pas plutôt que d'inventer une valeur plausible.
 */
export async function fetchUv(
  lat: number,
  lon: number,
  options: UvOptions = {},
): Promise<UvResult> {
  const fetchImpl = options.fetchImpl ??
    // Le `fetch` natif doit RELAYER `init`, sinon le plafond devient purement
    // décoratif en production pendant que tous les tests restent au vert
    // (chacun injecte son propre fetch). Piège vérifié par mutation dans
    // awc.ts le 27/07/2026.
    ((url: string, init?: { signal?: AbortSignal }) => fetch(url, init));
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  // Validation AVANT toute I/O : une position illisible est une faute d'appel,
  // pas une panne, et n'a aucune raison de consommer une requête réseau.
  if (
    !Number.isFinite(lat) || !Number.isFinite(lon) ||
    lat < -90 || lat > 90 || lon < -180 || lon > 180
  ) {
    return { found: false, reason: "invalid_position" };
  }

  const url = buildUvUrl(lat, lon);
  let dernier: Tentative = { etat: "passager" };

  for (let essai = 0; essai < maxAttempts; essai += 1) {
    if (essai > 0 && retryDelayMs > 0) await dormir(retryDelayMs);
    dernier = await tenterUnAppel(url, fetchImpl, timeoutMs);
    if (dernier.etat !== "passager") break;
  }

  if (dernier.etat === "ok") return { found: true, uv: dernier.uv };
  // Le « fatal » (4xx) est rendu comme une panne et non comme une position
  // invalide : nos bornes sont déjà passées plus haut, donc un 4xx ici signale
  // un changement d'interface de la source et non une faute de l'utilisateur.
  return { found: false, reason: "network_error" };
}
