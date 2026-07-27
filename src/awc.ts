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
//   - splitBboxes / buildBboxUrl(s) / normalizeRows / selectNearest : fonctions
//     pures, aucune I/O, aucune horloge cachée. Toute la logique est là, donc
//     tout est testable sans réseau.
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

// Réessai réseau. DEUX tentatives au maximum par URL, séparées de 200 ms.
// Ces valeurs sont volontairement modestes : une fonction serverless doit
// répondre vite, et une source réellement à terre ne se répare pas en
// insistant. Le délai est injectable pour que les tests ne dorment pas.
export const MAX_ATTEMPTS = 2;
export const RETRY_DELAY_MS = 200;

// Délai d'attente maximal d'UNE tentative, en millisecondes.
//
// Pourquoi c'est indispensable : `fetch` n'a aucune limite de temps par défaut.
// Un serveur qui REFUSE répond vite, mais un serveur qui PEND (connexion
// acceptée, plus un octet ensuite) fait attendre pour toujours. Sans plafond,
// une seule requête peut immobiliser une fonction serverless jusqu'à la limite
// de la plateforme, pendant que l'utilisateur regarde une page qui charge.
//
// Pourquoi 8 s, et pourquoi PAS 4 s. Valeur choisie sur MESURE, pas au jugé.
// Le 27/07/2026, 12 processus froids ont fait chacun un premier appel réel
// sans plafond, depuis Brumath : 165, 185, 321, 352, 369, 433, 628, 736,
// 1219, 1945, 5295 et 6825 ms — tous RÉUSSIS. La latence à froid ne se range
// pas en deux paquets nets (« rapide » ou « bloqué ») : elle s'étale. Un
// plafond à 4 s aurait donc coupé DEUX appels sur douze qui allaient aboutir,
// c'est-à-dire transformé des réussites lentes en pannes. Un délai trop zélé
// est pire que pas de délai : il fabrique les erreurs qu'il prétend éviter.
//
// Le garde-fou reste utile en haut de l'échelle : le même jour, un appel
// réellement bloqué a mis 10 s à échouer, deux fois de suite (réessai) =
// 20,6 s au total. 8 s le ramène à un échec propre et immédiat.
//
// Budget, et il faut être précis parce que le plafond est PAR TENTATIVE :
//   - source qui PEND : le délai n'est pas réessayé et une panne totale
//     court-circuite le second tour, donc 8 s ;
//   - source qui répond LENTEMENT EN ERREUR (un 503 au bout de 7,9 s) : là le
//     réessai s'applique, donc 2 x 8 s = 16 s avant le court-circuit, même sur
//     une position ordinaire à une seule boîte ;
//   - pire cas extérieur (antiméridien + panne partielle sur les deux marges) :
//     de l'ordre de 32 s.
// Les deux derniers dépassent les 10 s par défaut de Vercel : la plateforme
// tuerait alors l'invocation et le client recevrait une erreur de plateforme
// au lieu de notre `{"error":"network_error"}`. Il FAUT donc régler
// `maxDuration` dans vercel.json avant la mise en ligne, ou borner le total.
export const TIMEOUT_MS = 8000;

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
//
// Le second paramètre `init` porte le signal d'abandon du délai d'attente. Il
// est OPTIONNEL à dessein : un faux `fetch` de test écrit `(url) => ...` sans
// se soucier du signal reste parfaitement valable (en TypeScript, une fonction
// qui prend moins de paramètres est acceptée là où on en fournit plus).
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export interface FetchNearestOptions {
  fetchImpl?: FetchLike; // injecté par les tests ; `fetch` natif par défaut
  nowMs?: number; // horloge injectable ; Date.now() par défaut
  maxAgeMs?: number; // limite de fraîcheur ; 3 h par défaut
  retryDelayMs?: number; // attente avant le second essai ; 0 en test
  maxAttempts?: number; // tentatives par URL ; 2 par défaut, 1 = aucun réessai
  timeoutMs?: number; // plafond par tentative ; 8 s par défaut, 0 = aucun plafond
}

// ---------- 3. Construction de l'URL (pure) ----------

// Arrondit à 2 décimales. Sert uniquement à produire une URL propre :
// 48.73 - 1.5 vaut 47.230000000000004 en virgule flottante, et on n'a pas
// envie de ça dans une requête HTTP.
const round2 = (v: number): number => Math.round(v * 100) / 100;

// Borne une valeur dans un intervalle.
const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

// Une boîte géographique, telle qu'AWC l'attend. Les quatre bornes sont déjà
// arrondies et valides : c'est le seul objet que buildBboxUrl sait mettre en URL.
export interface Bbox {
  latMin: number;
  lonMin: number;
  latMax: number;
  lonMax: number;
}

// Découpe la zone de recherche autour de (lat, lon) en UNE ou DEUX boîtes.
//
// La latitude, elle, est simplement bornée à ±90, et c'est correct : au-delà
// du pôle il n'y a pas de terre à interroger, la zone manquante est vide par
// nature. La longitude est un cas tout différent, parce qu'elle est CIRCULAIRE :
// après 180° E vient -180° (soit 179,99° W), et non le vide. Borner à 180
// reviendrait à amputer la moitié de la zone d'un utilisateur aux Fidji ou aux
// Kiribati, en supprimant de VRAIES stations qui sont à 70 km de lui.
//
// D'où le découpage : quand la boîte franchit la ligne de changement de date,
// on rend deux boîtes valides plutôt qu'une boîte fausse. Exemple à 179° E avec
// une marge de 1,5° : [177.5 ; 180] et [-180 ; -179.5]. Elles sont disjointes
// (aucun doublon possible) et couvrent exactement les 3° voulus.
//
// Convention de retour : la PREMIÈRE boîte est toujours celle qui contient la
// position demandée, la seconde est le complément de l'autre côté de la ligne.
export function splitBboxes(lat: number, lon: number, marginDeg: number): Bbox[] {
  const latMin = round2(clamp(lat - marginDeg, -90, 90));
  const latMax = round2(clamp(lat + marginDeg, -90, 90));
  const base = { latMin, latMax };

  const ouest = lon - marginDeg; // bord gauche, potentiellement < -180
  const est = lon + marginDeg; // bord droit, potentiellement > 180

  // Garde-fou : une marge si large que la boîte ferait plus d'un tour de globe
  // produirait deux boîtes qui se recouvrent. Une seule boîte pleine suffit.
  if (est - ouest >= 360) {
    return [{ ...base, lonMin: -180, lonMax: 180 }];
  }

  // Débordement par l'est (position proche de 180° E) : la part au-delà de 180
  // se retrouve juste après -180.
  if (est > 180) {
    return [
      { ...base, lonMin: round2(ouest), lonMax: 180 },
      { ...base, lonMin: -180, lonMax: round2(est - 360) },
    ];
  }

  // Débordement par l'ouest (position proche de 180° W) : symétrique.
  if (ouest < -180) {
    return [
      { ...base, lonMin: -180, lonMax: round2(est) },
      { ...base, lonMin: round2(ouest + 360), lonMax: 180 },
    ];
  }

  // Cas ordinaire, l'immense majorité du globe : une seule boîte.
  return [{ ...base, lonMin: round2(ouest), lonMax: round2(est) }];
}

// Met une boîte en URL. Ordre des bornes imposé par AWC :
// latMin, lonMin, latMax, lonMax.
export function buildBboxUrl(box: Bbox): string {
  // URLSearchParams se charge de l'encodage (les virgules deviennent %2C).
  const params = new URLSearchParams({
    bbox: `${box.latMin},${box.lonMin},${box.latMax},${box.lonMax}`,
    format: "json",
  });
  return `${AWC_BASE_URL}?${params.toString()}`;
}

// Les URL à interroger pour couvrir la zone : une, ou deux à l'antiméridien.
// C'est le point d'entrée que fetchNearest utilise, et il le rappelle à CHAQUE
// essai de marge : à 178° E, la boîte serrée (±1,5°) ne franchit pas la ligne
// alors que la boîte élargie (±3°) la franchit. Le découpage dépend donc de la
// marge et ne peut pas être décidé une fois pour toutes.
export function buildBboxUrls(lat: number, lon: number, marginDeg: number): string[] {
  return splitBboxes(lat, lon, marginDeg).map(buildBboxUrl);
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

// Petite attente entre deux tentatives. Injectable (0 en test) pour qu'une
// suite de tests ne dorme jamais réellement.
const attendre = (ms: number): Promise<void> =>
  ms <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms));

// Résultat d'UNE tentative. La distinction est le cœur du réessai :
//   - "reessayable" : la panne est passagère, insister a des chances d'aboutir
//     (coupure réseau, DNS, 5xx, 429 de limitation, réponse tronquée) ;
//   - "fatal" : le serveur nous dit que NOTRE requête est fautive (400, 403...).
//     Réessayer ne ferait que doubler la charge sans aucune chance de succès ;
//   - "delai_depasse" : la connexion est restée suspendue et on l'a coupée.
//     Non réessayé lui aussi, mais pour une raison OPPOSÉE à celle du 400 : ici
//     la requête n'a rien de fautif, c'est le TEMPS qui manque. Réessayer une
//     connexion morte doublerait mécaniquement l'attente, donc aggraverait
//     exactement le mal que le délai vient soigner. Les deux mènent au même
//     `network_error` ; on les sépare parce que ce ne sont pas les mêmes faits.
type Tentative = AwcStation[] | "reessayable" | "fatal" | "delai_depasse";

async function tenterUnAppel(
  url: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
): Promise<Tentative> {
  // Un signal qui se déclenche tout seul au bout du délai imparti. `fetch` le
  // surveille et interrompt l'appel, y compris pendant la lecture du corps.
  // Le compte à rebours part à la CRÉATION du signal, donc un signal neuf par
  // tentative : sinon le réessai hériterait du temps déjà consommé.
  // À 0 (ou moins), aucun signal : c'est la façon de désactiver le plafond.
  const signal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  try {
    const res = await fetchImpl(url, { signal });
    if (!res.ok) {
      // 429 = limitation de débit, 5xx = défaillance du serveur : passager.
      // Le reste (400, 403, 404...) vient de notre requête : définitif.
      return res.status === 429 || res.status >= 500 ? "reessayable" : "fatal";
    }
    // HTTP 204 « No Content » : c'est la réponse réelle d'AWC quand la boîte ne
    // contient aucune station (vérifié le 26/07/2026 sur une bbox en plein
    // océan). Le corps fait ZÉRO octet, donc `res.json()` lèverait et une zone
    // simplement déserte serait comptée comme une panne — et, pire depuis le
    // réessai, serait redemandée une seconde fois pour rien. Or `ok` vaut true
    // sur un 204 : sans ce test explicite, le piège passe inaperçu.
    if (res.status === 204) return [];
    const payload = await res.json();
    return normalizeRows(payload);
  } catch {
    // On interroge le SIGNAL plutôt que le message de l'erreur : c'est le seul
    // critère fiable. Selon l'environnement, un abandon se présente comme un
    // `AbortError`, un `TimeoutError` ou autre chose encore ; le signal, lui,
    // dit toujours la vérité. Et il couvre aussi bien l'attente de la réponse
    // que la lecture d'un corps qui s'interrompt en cours de route.
    if (signal?.aborted === true) return "delai_depasse";
    // Coupure réseau, DNS, TLS, ou corps illisible (réponse tronquée) :
    // typiquement le hoquet d'un processus froid, donc réessayable.
    return "reessayable";
  }
}

// Fait un appel, et renvoie soit les stations normalisées, soit le marqueur
// "network_error". Tout est intercepté : coupure réseau, DNS, timeout, HTTP
// en erreur, corps qui n'est pas du JSON. Rien ne remonte sous forme
// d'exception, conformément à la règle de robustesse du projet.
//
// Réessai : 2 tentatives au maximum, séparées d'une courte attente. Motivation
// mesurée, pas théorique — le 26/07/2026, le PREMIER appel d'un processus froid
// a échoué puis le suivant a réussi (DNS/TLS à froid). Sur Vercel, chaque
// invocation à froid est un premier appel. On s'arrête à 2 : au-delà, on
// ferait surtout attendre l'utilisateur devant une source réellement à terre.
async function fetchStations(
  url: string,
  fetchImpl: FetchLike,
  retryDelayMs: number,
  maxAttempts: number,
  timeoutMs: number,
): Promise<AwcStation[] | "network_error"> {
  for (let essai = 1; essai <= maxAttempts; essai += 1) {
    const r = await tenterUnAppel(url, fetchImpl, timeoutMs);
    // Un tableau = succès (même vide : une zone déserte a bien répondu).
    // `Array.isArray` plutôt qu'une liste de marqueurs à énumérer : un motif
    // d'échec ajouté plus tard sera d'office traité comme un échec, et non
    // confondu avec des stations par un test devenu incomplet.
    if (Array.isArray(r)) return r;
    // Tout marqueur autre que "reessayable" est définitif, chacun pour sa
    // raison propre : requête fautive (400) ou connexion suspendue (délai).
    if (r !== "reessayable") return "network_error";
    if (essai < maxAttempts) await attendre(retryDelayMs);
  }
  return "network_error";
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
  // Le `init` est RELAYÉ au fetch natif, et c'est tout sauf un détail : c'est
  // la seule ligne du module qui fait exister le délai d'attente en PRODUCTION.
  // L'omettre laisserait toute la suite de tests au vert, puisque chaque test
  // injecte son propre `fetchImpl` et ne passe jamais par ici. Un test dédié
  // remplace le `fetch` global pour verrouiller cette ligne précise.
  const fetchImpl =
    options.fetchImpl ?? ((url: string, init?: { signal?: AbortSignal }) => fetch(url, init));
  const nowMs = options.nowMs ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? MAX_AGE_MS;
  const retryDelayMs = options.retryDelayMs ?? RETRY_DELAY_MS;
  // Math.max(1, ...) : même mal réglé, on tente toujours au moins une fois.
  const maxAttempts = Math.max(1, options.maxAttempts ?? MAX_ATTEMPTS);
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  // Garde d'entrée : une position invalide ne mérite pas un appel réseau.
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) {
    return { found: false, reason: "invalid_position" };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { found: false, reason: "invalid_position" };
  }

  let vuDesStations = false; // a-t-on croisé au moins une station, même périmée ?
  let vuUnePanne = false; // une moitié de zone est-elle restée sans réponse ?

  for (const margin of [MARGIN_NARROW_DEG, MARGIN_WIDE_DEG]) {
    // Une seule URL en temps normal, deux à cheval sur l'antiméridien. Les
    // appels partent en parallèle : ils sont indépendants, et les attendre
    // l'un après l'autre doublerait le temps de réponse pour rien.
    const urls = buildBboxUrls(lat, lon, margin);
    const resultats = await Promise.all(
      urls.map((url) =>
        fetchStations(url, fetchImpl, retryDelayMs, maxAttempts, timeoutMs),
      ),
    );

    const pannes = resultats.filter((r) => r === "network_error").length;
    // Tout est en panne : il n'y a rien à dire de plus, on s'arrête là.
    if (pannes === resultats.length) {
      return { found: false, reason: "network_error" };
    }
    // Panne PARTIELLE (une moitié sur deux) : on continue avec ce qu'on a.
    // Une couverture amputée vaut mieux qu'un échec, la station la plus proche
    // est peut-être justement dans la moitié qui a répondu. On mémorise
    // toutefois l'incident : il change la conclusion en cas d'échec final.
    if (pannes > 0) vuUnePanne = true;

    // Fusion des moitiés AVANT le classement : c'est indispensable, sinon on
    // rendrait la plus proche de chaque boîte au lieu de la plus proche tout
    // court. Simple concaténation : les boîtes étant disjointes en longitude,
    // aucune station ne peut apparaître deux fois.
    const stations = resultats.flatMap((r) => (r === "network_error" ? [] : r));
    if (stations.length > 0) vuDesStations = true;

    const hit = selectNearest(stations, lat, lon, nowMs, maxAgeMs);
    if (hit !== null) return { found: true, ...hit };
  }

  // Rien trouvé. Précédence assumée : une panne partielle l'emporte sur les
  // deux autres motifs. Répondre « aucune station » ou « rien de récent » alors
  // qu'une moitié de la zone n'a jamais répondu serait affirmer plus que ce
  // qu'on a vérifié ; "network_error" dit la vérité, à savoir qu'on ne sait pas.
  if (vuUnePanne) return { found: false, reason: "network_error" };
  return { found: false, reason: vuDesStations ? "only_stale" : "no_station" };
}
