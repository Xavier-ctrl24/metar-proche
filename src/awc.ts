// src/awc.ts
// Source de données de PRODUCTION : aviationweather.gov (domaine public,
// sans clé d'API). VATSIM ne sert QU'au corpus de test, jamais ici.
//
// Rôle du module : « depuis une position, trouver la station la plus proche
// dont l'observation est récente, et rendre son METAR brut ». Le décodage
// (decode.ts), la traduction (i18n) et l'assemblage (étape 10) sont ailleurs.
//
// Architecture, et c'est LA décision de conception de cette étape :
// on sépare le PUR de l'IMPUR.
//   - buildBboxUrl / normalizeRows / selectNearest : fonctions pures, aucune
//     I/O, aucune horloge cachée. Toute la logique est là, donc tout est
//     testable sans réseau.
//   - fetchNearest : la seule fonction qui touche au réseau. Elle reçoit son
//     `fetch` et son horloge en PARAMÈTRES (« injection de dépendance »), ce
//     qui permet aux tests de lui donner un faux serveur et une heure figée.
// Sans cette séparation, tester ce fichier reviendrait à appeler internet
// depuis `npm test`, ce qui n'est pas un test mais un pari.
//
// Comme le décodeur, ce module ne lève JAMAIS d'exception : une panne réseau
// est une donnée de retour (`{ found: false, reason: "network_error" }`), pas
// un crash. L'étape 10 doit pouvoir répondre proprement dans tous les cas.

import { haversineKm, bearingDeg } from "./geo";

// ---------- 1. Constantes de la source ----------

// Point d'entrée officiel du service METAR d'aviationweather.gov.
export const AWC_BASE_URL = "https://aviationweather.gov/api/data/metar";

// Demi-largeur de la boîte de recherche, en degrés. Premier essai serré
// (±1,5° ≈ 165 km en latitude), second essai élargi une seule fois.
export const MARGIN_NARROW_DEG = 1.5;
export const MARGIN_WIDE_DEG = 3;

// Une observation de plus de 3 h n'est plus représentative de la météo
// actuelle : on refuse de la servir (règle du PROMPT).
export const MAX_AGE_MS = 3 * 60 * 60 * 1000;

// Tolérance vers le futur. Une station mal réglée peut publier une heure en
// avance ; sans garde-fou elle passerait pour « ultra fraîche » et gagnerait
// le tri. Au-delà d'une heure d'avance, on considère l'horodatage faux.
const MAX_FUTURE_MS = 60 * 60 * 1000;

// ---------- 2. Types du module ----------

// Une station AWC, une fois nettoyée. C'est un type INTERNE, pas le contrat
// public : la conversion vers `Station` de types.ts se fait à l'étape 10
// (c'est là aussi que `timezone` sera résolu via geo.resolveTimezone, car la
// réponse d'AWC ne contient AUCUN fuseau ni décalage horaire — vérifié).
export interface AwcStation {
  icao: string | null;
  name: string | null;
  lat: number;
  lon: number;
  raw: string; // METAR brut, à passer tel quel à decode.ts
  observedAtMs: number; // instant d'observation, en millisecondes UTC
}

// Station retenue + les mesures géographiques qui l'accompagnent.
// Les nombres ne sont PAS arrondis : l'arrondi est de la présentation,
// donc du ressort de l'étape 10 (même règle que geo.ts).
export interface NearestHit {
  station: AwcStation;
  distanceKm: number;
  bearingDeg: number; // cap depuis la position de l'utilisateur vers la station
  ageMinutes: number;
}

// Pourquoi aucune station n'a pu être servie. Union fermée : le client (et
// l'étape 10) peut produire un message adapté à chaque cas.
export type NotFoundReason =
  | "invalid_position" // latitude/longitude inutilisables
  | "no_station" // la zone ne contient aucune station, même élargie
  | "only_stale" // des stations, mais aucune observation de moins de 3 h
  | "network_error"; // service injoignable, HTTP en erreur, ou JSON illisible

// Résultat de fetchNearest. « Union discriminée » : le champ `found` sert
// d'aiguillage, et TypeScript sait ensuite quels autres champs existent.
// C'est ce qui permet d'écrire `if (r.found) { r.station... }` en sécurité.
export type NearestResult = ({ found: true } & NearestHit) | { found: false; reason: NotFoundReason };

// Forme minimale attendue d'un `fetch`. On ne dépend pas du type DOM complet :
// on décrit juste ce qu'on utilise. Le `fetch` natif de Node y est conforme,
// et un faux `fetch` de test aussi.
export type FetchLike = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface FetchNearestOptions {
  fetchImpl?: FetchLike; // injecté par les tests ; `fetch` natif par défaut
  nowMs?: number; // horloge injectable ; Date.now() par défaut
  maxAgeMs?: number; // limite de fraîcheur ; 3 h par défaut
}

// ---------- 3. Construction de l'URL (pure) ----------

// Arrondit à 2 décimales. Sert uniquement à produire une URL propre :
// 48.73 - 1.5 vaut 47.230000000000004 en virgule flottante, et on n'a pas
// envie de ça dans une requête HTTP.
const round2 = (v: number): number => Math.round(v * 100) / 100;

// Borne une valeur dans un intervalle.
const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

// Construit l'URL de requête pour une boîte géographique centrée sur la
// position. Ordre imposé par AWC : latMin, lonMin, latMax, lonMax.
//
// Deux bornes de sécurité :
//   - latitude bornée à ±90 : à 89,5° N, ajouter 1,5° dépasserait le pôle ;
//   - longitude bornée à ±180 : à 179° E, on franchirait l'antiméridien.
// Pour la longitude, la bonne solution mondiale serait de découper en DEUX
// requêtes (une de chaque côté de la ligne de changement de date). Choix v1
// assumé : on borne, donc la couverture est légèrement dégradée sur la bande
// de l'antiméridien (Fidji, Kiribati). À rediscuter si tu veux le découpage.
export function buildBboxUrl(lat: number, lon: number, marginDeg: number): string {
  const latMin = round2(clamp(lat - marginDeg, -90, 90));
  const latMax = round2(clamp(lat + marginDeg, -90, 90));
  const lonMin = round2(clamp(lon - marginDeg, -180, 180));
  const lonMax = round2(clamp(lon + marginDeg, -180, 180));

  // URLSearchParams se charge de l'encodage (les virgules deviennent %2C).
  const params = new URLSearchParams({
    bbox: `${latMin},${lonMin},${latMax},${lonMax}`,
    format: "json",
  });
  return `${AWC_BASE_URL}?${params.toString()}`;
}

// ---------- 4. Normalisation défensive de la réponse (pure) ----------

// Petits gardes de type. `unknown` est le type « je ne sais rien de cette
// valeur » : TypeScript force à vérifier avant d'utiliser, ce qui est
// exactement ce qu'on veut face à du JSON venu d'un serveur tiers.
const isFiniteNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

// Extrait l'instant d'observation d'une ligne AWC, en millisecondes UTC.
// Priorité à `obsTime` (epoch en SECONDES), avec `reportTime` (ISO) en repli.
// Vérifié sur l'échantillon du 24/07/2026 : les deux coïncident sur les 16
// lignes. On ne reconstruit JAMAIS la date depuis le groupe METAR `241720Z` :
// il ne porte ni mois ni année, donc un changement de mois le casserait.
function readObservedAtMs(row: Record<string, unknown>): number | null {
  if (isFiniteNumber(row.obsTime)) return row.obsTime * 1000;
  if (isNonEmptyString(row.reportTime)) {
    const ms = Date.parse(row.reportTime);
    if (Number.isFinite(ms)) return ms;
  }
  return null;
}

// Transforme la charge utile JSON brute en stations exploitables.
// Toute ligne inutilisable est ÉCARTÉE plutôt que corrigée : sans coordonnées
// on ne peut pas la classer par distance, sans horodatage on ne peut pas
// juger sa fraîcheur, sans METAR brut il n'y a rien à décoder ensuite.
// Une ligne bancale ne doit pas produire un NaN qui polluerait le tri.
export function normalizeRows(payload: unknown): AwcStation[] {
  if (!Array.isArray(payload)) return [];

  const stations: AwcStation[] = [];
  for (const item of payload) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;

    if (!isFiniteNumber(row.lat) || !isFiniteNumber(row.lon)) continue;
    if (!isNonEmptyString(row.rawOb)) continue;
    const observedAtMs = readObservedAtMs(row);
    if (observedAtMs === null) continue;

    stations.push({
      icao: isNonEmptyString(row.icaoId) ? row.icaoId : null,
      // `name` arrive tel quel d'AWC ("Buechel Arpt, RP, DE"). On ne le
      // nettoie PAS ici : ce serait une décision de présentation (étape 10).
      name: isNonEmptyString(row.name) ? row.name : null,
      lat: row.lat,
      lon: row.lon,
      raw: row.rawOb.trim(),
      observedAtMs,
    });
  }
  return stations;
}

// ---------- 5. Sélection de la plus proche (pure) ----------

// Parmi les stations fournies, retient la plus proche de (lat, lon) dont
// l'observation est encore valable. Fonctionnement : on calcule la distance
// de chacune, on trie par distance croissante, puis on prend la PREMIÈRE qui
// passe le filtre de fraîcheur. Renvoie null si aucune ne convient.
export function selectNearest(
  stations: AwcStation[],
  lat: number,
  lon: number,
  nowMs: number,
  maxAgeMs: number,
): NearestHit | null {
  const candidats = stations
    .map((station) => ({
      station,
      distanceKm: haversineKm(lat, lon, station.lat, station.lon),
      bearingDeg: bearingDeg(lat, lon, station.lat, station.lon),
      ageMs: nowMs - station.observedAtMs,
    }))
    // Tri croissant : le comparateur renvoie un négatif si a passe avant b.
    .sort((a, b) => a.distanceKm - b.distanceKm);

  for (const c of candidats) {
    if (c.ageMs > maxAgeMs) continue; // trop vieille
    if (c.ageMs < -MAX_FUTURE_MS) continue; // horodatage manifestement faux
    return {
      station: c.station,
      distanceKm: c.distanceKm,
      bearingDeg: c.bearingDeg,
      ageMinutes: Math.round(c.ageMs / 60_000),
    };
  }
  return null;
}

// ---------- 6. Orchestration réseau (seule partie impure) ----------

// Fait un appel, et renvoie soit les stations normalisées, soit le marqueur
// "network_error". Tout est intercepté : coupure réseau, DNS, timeout, HTTP
// en erreur, corps qui n'est pas du JSON. Rien ne remonte sous forme
// d'exception, conformément à la règle de robustesse du projet.
async function fetchStations(
  url: string,
  fetchImpl: FetchLike,
): Promise<AwcStation[] | "network_error"> {
  try {
    const res = await fetchImpl(url);
    if (!res.ok) return "network_error";
    const payload = await res.json();
    return normalizeRows(payload);
  } catch {
    return "network_error";
  }
}

// Point d'entrée du module. Enchaîne : boîte serrée (±1,5°), et si rien
// d'exploitable, UN SEUL élargissement (±3°). Au-delà, on renvoie une réponse
// explicite qui dit pourquoi, jamais une erreur.
//
// Nuance importante du retour : « aucune station du tout » (`no_station`) et
// « des stations, mais toutes périmées » (`only_stale`) sont deux situations
// différentes pour l'utilisateur, donc deux `reason` différentes.
export async function fetchNearest(
  lat: number,
  lon: number,
  options: FetchNearestOptions = {},
): Promise<NearestResult> {
  const fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? MAX_AGE_MS;

  // Garde d'entrée : une position invalide ne mérite pas un appel réseau.
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
    return { found: false, reason: "invalid_position" };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { found: false, reason: "invalid_position" };
  }

  let vuDesStations = false; // a-t-on croisé au moins une station, même périmée ?

  for (const margin of [MARGIN_NARROW_DEG, MARGIN_WIDE_DEG]) {
    const resultat = await fetchStations(buildBboxUrl(lat, lon, margin), fetchImpl);
    if (resultat === "network_error") {
      return { found: false, reason: "network_error" };
    }
    if (resultat.length > 0) vuDesStations = true;

    const hit = selectNearest(resultat, lat, lon, nowMs, maxAgeMs);
    if (hit !== null) return { found: true, ...hit };
  }

  return { found: false, reason: vuDesStations ? "only_stale" : "no_station" };
}
