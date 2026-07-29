// src/geocode.ts
// Recherche de ville : traduit un NOM en coordonnées.
//
// POURQUOI CE MODULE EXISTE (29/07/2026). Depuis le premier jour, la feuille
// « Où êtes-vous ? » n'offrait que deux champs latitude/longitude. C'est
// utilisable par qui sait lire une carte, et par personne d'autre — or le
// projet vise le grand public. La recherche de ville de la maquette avait été
// écartée le 28/07 faute de géocodeur ; Xavier en a choisi un le 29/07.
//
// SOURCE : Open-Meteo Geocoding. Retenue contre Nominatim pour une raison
// d'exploitation et non de goût : Nominatim impose une requête par seconde,
// un en-tête d'identification et une attribution visible, et se réserve de
// bloquer. Open-Meteo ne demande ni clé ni compte, comme aviationweather.gov.
//
// LE CLIENT N'APPELLE PAS LA SOURCE DIRECTEMENT, et c'est un engagement pris
// devant Xavier au moment du choix : la source a beau accepter les appels
// navigateur (CORS ouvert), les faire depuis la page enverrait la saisie de
// l'utilisateur au tiers avec son adresse IP. Tout passe donc par
// /api/geocode. C'est aussi ce qui permet de servir des messages d'erreur
// que la page sait traduire.
//
// Découpage PUR / IMPUR identique à awc.ts : `buildGeocodeUrl` et
// `normalizePlaces` sont pures et portent toute la logique ; `fetchGeocode`
// est la seule I/O et reçoit son `fetch` en paramètre. Aucun appel réseau
// dans `npm test`.

import type { GeocodePlace, GeocodeErrorCode, Lang } from "./types.js";

// ---------- 1. Réglages ----------

export const GEOCODE_BASE_URL = "https://geocoding-api.open-meteo.com/v1/search";

// Assez pour lever une homonymie sans noyer l'utilisateur. « Paris » rend la
// France, le Texas et le Tennessee ; au-delà de cinq, une liste de choix
// devient elle-même un problème.
export const MAX_RESULTS = 5;

// Bornes de la saisie. La borne haute n'est pas de la défiance envers
// l'utilisateur : c'est ce qui évite de relayer vers un tiers une chaîne
// arbitrairement longue reçue par une URL publique.
export const MAX_QUERY_LENGTH = 120;

// Réessai : mêmes valeurs qu'awc.ts, même patron d'injection.
export const MAX_ATTEMPTS = 2;
export const RETRY_DELAY_MS = 200;

// PLAFOND CHOISI, PAS MESURÉ, et il faut le dire plutôt que de laisser croire
// le contraire. Les 12 s d'awc.ts viennent d'une mesure sur un balayage de
// bbox en plein océan, qui est lent par nature. Un géocodage est une simple
// recherche indexée : la source annonce elle-même 0,6 ms de génération. 5 s
// laissent une marge très large pour un démarrage à froid. À remonter si des
// `network_error` inexpliqués apparaissent, comme pour awc.ts.
export const TIMEOUT_MS = 5000;

// ---------- 2. Types ----------

// Volontairement identique à celui d'awc.ts plutôt que partagé : on ne décrit
// que ce qu'on utilise, et un faux `fetch` de test qui ignore `init` reste
// valable (une fonction qui prend moins de paramètres est acceptée).
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface GeocodeOptions {
  fetchImpl?: FetchLike;
  retryDelayMs?: number;
  maxAttempts?: number;
  timeoutMs?: number; // 0 = aucun plafond, utile pour mesurer la latence nue
}

// Union discriminée, comme `NearestResult` : un échec est une DONNÉE de
// retour, jamais une exception. Le motif est déjà un code du contrat public,
// donc l'appelant n'a aucune traduction à faire.
export type GeocodeResult =
  | { found: true; places: GeocodePlace[] }
  | { found: false; reason: GeocodeErrorCode };

// ---------- 3. Construction de l'URL (PURE) ----------

/**
 * URL de recherche pour un nom et une langue.
 *
 * La LANGUE est un paramètre obligatoire et non un défaut, exactement comme
 * le 3e paramètre de `buildResponse` : elle change réellement le contenu rendu
 * par la source (« Île-de-France Region » en anglais, « Île-de-France » en
 * français), donc un oubli produirait une liste de choix à moitié traduite.
 */
export function buildGeocodeUrl(name: string, lang: Lang): string {
  const q = encodeURIComponent(name.trim());
  return `${GEOCODE_BASE_URL}?name=${q}&count=${MAX_RESULTS}&language=${lang}&format=json`;
}

// ---------- 4. Normalisation (PURE) ----------

// Lecture défensive : la charge utile vient du réseau, donc `unknown`.
const champTexte = (o: Record<string, unknown>, cle: string): string | null => {
  const v = o[cle];
  return typeof v === "string" && v.length > 0 ? v : null;
};
const champNombre = (o: Record<string, unknown>, cle: string): number | null => {
  const v = o[cle];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

/**
 * Convertit la réponse brute de la source en lieux du contrat.
 *
 * LE PIÈGE DE CE MODULE EST ICI, et il est invisible à la lecture de la
 * documentation. Une recherche sans correspondance ne rend PAS `results: []` :
 * elle rend HTTP 200 avec la clé `results` PUREMENT ABSENTE (vérifié le
 * 29/07/2026 sur `name=zzzzqqqq`). Un `payload.results.map(...)` écrit de
 * mémoire lèverait donc, et l'exception serait comptée comme une panne
 * réseau : une simple faute de frappe afficherait « source injoignable ».
 * C'est la même forme que le HTTP 204 d'AWC (26/07/2026), et c'est pour ça
 * que cette fonction traite l'absence comme un tableau vide.
 *
 * Ne lève jamais, quelle que soit la charge utile.
 */
export function normalizePlaces(payload: unknown): GeocodePlace[] {
  if (typeof payload !== "object" || payload === null) return [];
  const brut = (payload as Record<string, unknown>).results;
  if (!Array.isArray(brut)) return []; // couvre l'absence ET un type inattendu

  const places: GeocodePlace[] = [];
  for (const ligne of brut) {
    if (typeof ligne !== "object" || ligne === null) continue;
    const o = ligne as Record<string, unknown>;

    // Nom et position sont les trois seuls champs INDISPENSABLES : sans nom
    // l'entrée serait inaffichable, sans coordonnées elle serait inutilisable.
    // On écarte l'entrée plutôt que d'inventer une valeur de repli.
    const name = champTexte(o, "name");
    const latitude = champNombre(o, "latitude");
    const longitude = champNombre(o, "longitude");
    if (name === null || latitude === null || longitude === null) continue;

    places.push({
      name,
      // Les champs d'homonymie manquent sur les petites entrées : `null`
      // plutôt qu'une chaîne vide, pour que le client puisse décider de ne
      // rien afficher au lieu d'afficher une virgule orpheline.
      admin1: champTexte(o, "admin1"),
      country: champTexte(o, "country"),
      countryCode: champTexte(o, "country_code"),
      latitude,
      longitude,
    });
  }
  return places;
}

// ---------- 5. Recherche complète (IMPURE) ----------

const dormir = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Résultat d'UNE tentative. Trois issues et non deux : « la source a répondu
// qu'elle ne connaît pas » n'est pas une panne, et ne doit donc pas être
// réessayée. Même distinction que le 204 d'awc.ts.
type Tentative =
  | { etat: "ok"; places: GeocodePlace[] }
  | { etat: "vide" }
  | { etat: "passager" } // 5xx, 429, transport, corps illisible -> réessayable
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

    // 4xx : insister ne peut pas aboutir, la requête elle-même est en cause.
    // 429 fait exception et reste réessayable, comme dans awc.ts.
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500 && res.status !== 429) return { etat: "fatal" };
      return { etat: "passager" };
    }

    const payload = await res.json();
    const places = normalizePlaces(payload);
    return places.length === 0 ? { etat: "vide" } : { etat: "ok", places };
  } catch {
    // Transport, DNS, TLS, corps tronqué, délai dépassé. Tous passagers,
    // SAUF le délai — mais ici, contrairement à awc.ts, on ne le distingue
    // pas : le plafond est court (5 s) et la source est rapide, donc un
    // dépassement signale une vraie indisponibilité, pas un manque de temps.
    // Si ce module devait un jour interroger une source lente, il faudrait
    // reprendre le marqueur `delai_depasse` d'awc.ts et cesser de réessayer.
    return { etat: "passager" };
  }
}

/**
 * Cherche une ville. Ne lève jamais : tout échec est une valeur de retour.
 *
 * Rend jusqu'à MAX_RESULTS lieux, DANS L'ORDRE de la source. On ne choisit
 * pas à la place de l'utilisateur quand il y a plusieurs correspondances :
 * la source ne documente aucun ordre de pertinence, et rien ne dit que le
 * « Paris » voulu est le français. C'est au client d'afficher un choix.
 */
export async function fetchGeocode(
  name: string,
  lang: Lang,
  options: GeocodeOptions = {},
): Promise<GeocodeResult> {
  const fetchImpl = options.fetchImpl ??
    // Le `fetch` natif doit RELAYER `init`, sinon le délai d'attente devient
    // purement décoratif en production pendant que tous les tests restent au
    // vert (chacun injecte son propre fetch). Piège vérifié par mutation dans
    // awc.ts le 27/07/2026 ; on n'allait pas le refaire ici.
    ((url: string, init?: { signal?: AbortSignal }) => fetch(url, init));
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  // Validation AVANT toute I/O : une saisie vide est une faute d'appel, pas
  // une panne, et n'a aucune raison de consommer une requête réseau.
  const propre = name.trim();
  if (propre.length === 0 || propre.length > MAX_QUERY_LENGTH) {
    return { found: false, reason: "invalid_query" };
  }

  const url = buildGeocodeUrl(propre, lang);
  let dernier: Tentative = { etat: "passager" };

  for (let essai = 0; essai < maxAttempts; essai += 1) {
    if (essai > 0 && retryDelayMs > 0) await dormir(retryDelayMs);
    dernier = await tenterUnAppel(url, fetchImpl, timeoutMs);
    // On ne réessaie QUE le passager. Le vide est une réponse, le fatal un
    // refus définitif : insister sur l'un ou l'autre double la charge sur la
    // source sans la moindre chance de changer le résultat.
    if (dernier.etat !== "passager") break;
  }

  if (dernier.etat === "ok") return { found: true, places: dernier.places };
  if (dernier.etat === "vide") return { found: false, reason: "city_not_found" };
  // Le « fatal » (4xx) est rendu comme une panne et non comme une saisie
  // invalide : nos bornes de saisie sont déjà passées plus haut, donc un 4xx
  // ici signale un changement d'interface de la source, pas une faute de
  // l'utilisateur. Lui dire « ville introuvable » serait un mensonge.
  return { found: false, reason: "network_error" };
}
