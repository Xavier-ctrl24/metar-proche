// api/nearest.ts
// L'ASSEMBLAGE : le seul endroit où tous les modules se rencontrent.
// GET /api/nearest?lat=48.73&lon=7.71&lang=fr&units=metric
//
// Chaîne complète : awc.ts trouve la station la plus proche -> decode.ts lit le
// METAR brut -> geo.ts donne fuseau et soleil -> icon.ts choisit l'icône ->
// i18n/fr.ts rédige les textes -> ce fichier compose le `MetarResponse` du
// contrat (src/types.ts).
//
// Même principe de conception que awc.ts, et pour la même raison : le PUR est
// séparé de l'IMPUR. `parseQuery`, `cleanStationName`, `formatWallTime`,
// `localMiddayInstant` et `buildResponse` sont des fonctions pures, donc
// testables sans réseau ni horloge. `handleNearest` reçoit son `fetch`, son
// horloge et son cache en PARAMÈTRES. Le `handler` par défaut, tout en bas, est
// la seule partie qui connaisse HTTP et Vercel : il ne contient aucune logique.

import type { VercelRequest, VercelResponse } from "@vercel/node";
import type {
  ApiError,
  ApiErrorCode,
  Lang,
  MetarResponse,
  NearestQuery,
  UnitSystem,
} from "../src/types.js";
import { fetchNearest, type FetchLike, type NearestHit, type NotFoundReason } from "../src/awc.js";
import { decode } from "../src/decode.js";
import { resolveTimezone, solar } from "../src/geo.js";
import { pickIcon } from "../src/icon.js";
import { translateFr } from "../src/i18n/fr.js";
import { translateEn } from "../src/i18n/en.js";

// ---------- 1. Réglages ----------

// Seuil SOUPLE d'affichage : au-delà, la réponse porte `isStale: true` mais
// reste servie. À ne pas confondre avec le seuil DUR de awc.ts (3 h), qui
// écarte purement et simplement l'observation. Pourquoi 90 minutes : beaucoup
// de stations ne publient qu'une fois par heure ; à 60 minutes on les
// signalerait « périmées » la moitié du temps alors qu'elles sont normales.
// À 90, un cycle a forcément été manqué.
export const STALE_AFTER_MINUTES = 90;

// Durée de vie du cache. Un METAR est réémis toutes les 30 minutes au mieux :
// rappeler la source plus souvent que toutes les 5 minutes ne rapporte rien.
export const CACHE_TTL_MS = 5 * 60 * 1000;

// ---------- 2. Types du module ----------

// Ce qu'on met en cache : la STATION RETENUE, pas la réponse assemblée.
// C'est délibéré. Si on mettait le corps en cache, `ageMinutes` y serait figé
// et le client lirait encore « il y a 30 minutes » quatre minutes plus tard.
// Le réassemblage est purement calculatoire, donc quasi gratuit.
interface CacheEntry {
  hit: NearestHit;
  storedAtMs: number;
}

export type NearestCache = Map<string, CacheEntry>;

export interface NearestDeps {
  fetchImpl?: FetchLike; // injecté par les tests ; `fetch` natif par défaut
  nowMs?: number; // horloge injectable ; Date.now() par défaut
  cache?: NearestCache; // cache injecté, JAMAIS au niveau du module (voir plus bas)
  retryDelayMs?: number; // attente entre deux tentatives réseau ; 0 en test
}

// Résultat de l'orchestration, indépendant de HTTP : un statut, un corps, et
// l'information « ça vient du cache » (utile aux tests et à la supervision).
export interface NearestOutcome {
  status: number;
  body: MetarResponse | ApiError;
  fromCache: boolean;
}

export type ParsedQuery =
  | { ok: true; value: NearestQuery }
  | { ok: false; error: ApiErrorCode };

// ---------- 3. Lecture des paramètres (pure) ----------

// Une valeur de query string peut arriver en tableau (`?lat=1&lat=2`).
// On ne garde que la première occurrence.
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

// Valide la position et applique les valeurs par défaut. Choix assumé : une
// langue ou une unité inconnue ne fait PAS échouer la requête (on retombe sur
// le défaut), alors qu'une position invalide, elle, est rédhibitoire — sans
// coordonnées il n'y a tout simplement rien à chercher.
export function parseQuery(raw: Record<string, string | string[] | undefined>): ParsedQuery {
  const lat = Number(first(raw.lat));
  const lon = Number(first(raw.lon));

  // `Number(undefined)` vaut NaN, `Number("")` vaut 0 : on exige donc une
  // chaîne non vide ET un nombre fini, sinon "?lat=" passerait pour l'équateur.
  const latTexte = first(raw.lat)?.trim();
  const lonTexte = first(raw.lon)?.trim();
  if (!latTexte || !lonTexte || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "invalid_position" };
  }
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return { ok: false, error: "invalid_position" };
  }

  const langBrut = first(raw.lang);
  const unitsBrut = first(raw.units);
  // Les deux langues du contrat sont rédigées : i18n/fr.ts et i18n/en.ts.
  // Toute autre valeur retombe sur le français sans faire échouer la requête.
  const lang: Lang = langBrut === "en" ? "en" : "fr";
  const units: UnitSystem = unitsBrut === "imperial" ? "imperial" : "metric";

  return { ok: true, value: { lat, lon, lang, units } };
}

// ---------- 4. Nettoyage du nom de station (pure) ----------

// Suffixes d'aérodrome accolés par AWC, sans intérêt pour le grand public.
const SUFFIXES = /\s+(arpt|airport|intl|international|ap)\.?$/i;

// AWC renvoie « Strasbourg/Entzheim Arpt, PD, FR » : un nom, puis un code de
// région, puis un code pays. Ces deux derniers ne parlent à personne sur une
// interface grand public, alors que le contrat montre « Strasbourg-Entzheim ».
// Règle retenue (volontairement conservatrice) : on retire les segments finaux
// qui ressemblent à des CODES (1 à 3 caractères en majuscules ou chiffres, ou
// segment vide), puis les suffixes d'aéroport. Un nom qui ne suit pas ce motif
// ressort intact, et on ne rend jamais une chaîne vide.
export function cleanStationName(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;

  const segments = raw.split(",").map((s) => s.trim());
  // On retire par la fin, et seulement par la fin : un code au milieu du nom
  // fait partie du nom.
  while (segments.length > 1) {
    const dernier = segments[segments.length - 1];
    if (dernier === "" || /^[A-Z0-9]{1,3}$/.test(dernier)) {
      segments.pop();
    } else {
      break;
    }
  }

  const sansCodes = segments.join(", ").trim();
  const sansSuffixe = sansCodes.replace(SUFFIXES, "").trim();
  // Garde-fou : si le nettoyage a tout dévoré (nom réduit à « Intl »), on
  // préfère rendre un nom bizarre plutôt qu'un nom vide.
  if (sansSuffixe !== "") return sansSuffixe;
  if (sansCodes !== "") return sansCodes;
  return raw.trim();
}

// ---------- 5. Heure murale de la station (pure) ----------

// Formate un instant en « 14:00 » DANS LE FUSEAU DE LA STATION.
// `hourCycle: "h23"` est indispensable : sans lui, certaines versions d'ICU
// affichent minuit « 24:00 ». Sans fuseau, on rend null : afficher une heure
// UTC en la présentant comme locale serait un mensonge, et la règle du projet
// est explicite (« l'heure affichée est l'heure locale de la STATION »).
export function formatWallTime(instant: Date | null, timezone: string | null): string | null {
  if (instant === null || timezone === null) return null;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(instant);
  } catch {
    // Fuseau refusé par ICU : on préfère l'absence d'heure à une heure fausse.
    return null;
  }
}

// Décalage du fuseau par rapport à UTC, en millisecondes, à un instant donné
// (donc heure d'été comprise). Méthode : on demande à Intl l'heure murale
// locale, on la relit COMME SI elle était en UTC, et l'écart obtenu est le
// décalage. C'est le moyen standard de faire ce calcul sans dépendance.
function tzOffsetMs(instant: Date, timezone: string): number {
  const champs = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const lire = (type: string): number =>
    Number(champs.find((p) => p.type === type)?.value ?? "0");

  const commeUtc = Date.UTC(
    lire("year"),
    lire("month") - 1,
    lire("day"),
    lire("hour"),
    lire("minute"),
    lire("second"),
  );
  return commeUtc - instant.getTime();
}

// Instant correspondant à MIDI LOCAL du jour de l'observation.
//
// Pourquoi cette fonction existe : `solar` (geo.ts) calcule le lever et le
// coucher du jour UTC de l'instant qu'on lui donne. Pour une station à UTC+14
// (Kiribati) ou UTC-11 (Samoa), le jour UTC n'est PAS le jour local : on
// servirait le soleil de la veille ou du lendemain. En visant midi local, on
// tombe forcément sur le bon jour local, quel que soit le décalage.
export function localMiddayInstant(instant: Date, timezone: string): Date {
  const decalage = tzOffsetMs(instant, timezone);
  // Heure murale locale, exprimée dans un Date « virtuellement UTC ».
  const mural = new Date(instant.getTime() + decalage);
  const midiMural = Date.UTC(
    mural.getUTCFullYear(),
    mural.getUTCMonth(),
    mural.getUTCDate(),
    12,
  );
  // On repasse en instant réel. Le décalage à midi peut différer de celui de
  // l'observation (changement d'heure dans la journée), d'où le second calcul.
  const approx = new Date(midiMural - decalage);
  return new Date(midiMural - tzOffsetMs(approx, timezone));
}

// ---------- 6. Assemblage de la réponse (pure) ----------

// Arrondis de PRÉSENTATION. awc.ts et geo.ts rendent des valeurs non arrondies
// à dessein : c'est ici, au dernier moment, qu'on décide de l'affichage.
const round1 = (v: number): number => Math.round(v * 10) / 10;

// Compose le contrat public à partir de la station retenue.
// Note importante : on N'ÉTALE PAS (`...decoded`) le résultat du décodeur dans
// la réponse. `DecodedMetar` contient un `observedAt` reconstruit depuis le
// groupe `DDHHMMZ` du METAR, qui n'a ni mois ni année ; la décision du projet
// est d'utiliser l'`obsTime` d'AWC. Champ par champ, donc, sans raccourci.
// `lang` est un paramètre OBLIGATOIRE, et c'est délibéré. Lui donner une valeur
// par défaut ("fr") aurait été plus commode et bien plus dangereux : il y a DEUX
// appels à cette fonction dans handleNearest (le cache et le réseau), et oublier
// de transmettre la langue à l'un des deux aurait servi du français en silence,
// sans qu'aucun test ne tombe. Le chemin du cache est particulièrement traître :
// il n'est atteint qu'à la SECONDE requête sur la même position, donc un test qui
// n'appelle qu'une fois ne le traverse jamais. En le rendant obligatoire, l'oubli
// devient une erreur de compilation. Un test verrouille quand même le cas, mais
// c'est le compilateur qui monte la garde en premier.
export function buildResponse(hit: NearestHit, nowMs: number, lang: Lang): MetarResponse {
  const station = hit.station;
  const observedInstant = new Date(station.observedAtMs);

  // Le décodeur reçoit l'instant d'observation comme « maintenant » : ainsi sa
  // reconstruction de date interne reste cohérente, et surtout le test est
  // déterministe (son défaut serait `new Date()`).
  const d = decode(station.raw, observedInstant);

  const timezone = resolveTimezone(station.lat, station.lon);

  // Deux appels à `solar`, et c'est voulu :
  //   - isDay se juge à l'instant EXACT de l'observation (élévation réelle) ;
  //   - lever/coucher se calculent à MIDI LOCAL, pour tomber sur le bon jour
  //     local même à UTC+14 (voir localMiddayInstant).
  const solAObs = solar(station.lat, station.lon, observedInstant);
  const instantDuJour =
    timezone !== null ? localMiddayInstant(observedInstant, timezone) : observedInstant;
  const solDuJour = solar(station.lat, station.lon, instantDuJour);

  // Âge : recalculé à chaque service (jamais lu depuis le cache). Un âge
  // négatif signale une station en avance sur nous ; on le ramène à 0 pour
  // l'affichage tout en gardant la trace de l'anomalie.
  const ageBrutMin = Math.round((nowMs - station.observedAtMs) / 60_000);
  const warnings = [...d.warnings];
  if (ageBrutMin < 0) {
    warnings.push(`Observation datée dans le futur de ${-ageBrutMin} min (horloge de station)`);
  }
  const ageMinutes = Math.max(0, ageBrutMin);

  return {
    station: {
      icao: station.icao ?? d.icao,
      name: cleanStationName(station.name),
      distanceKm: round1(hit.distanceKm),
      // % 360 : un cap de 359,7° arrondirait sinon à 360, qui n'existe pas.
      bearingDeg: Math.round(hit.bearingDeg) % 360,
      isAuto: d.isAuto,
      timezone,
    },
    observedAt: observedInstant.toISOString(),
    observedLocal: formatWallTime(observedInstant, timezone),
    ageMinutes,
    isStale: ageMinutes > STALE_AFTER_MINUTES,
    icon: pickIcon(
      { phenomena: d.phenomena, clouds: d.clouds, verticalVisibility: d.verticalVisibility },
      solAObs.isDay,
    ),
    temperature: d.temperature,
    wind: d.wind,
    visibility: d.visibility,
    clouds: d.clouds,
    verticalVisibility: d.verticalVisibility,
    phenomena: d.phenomena,
    pressure: d.pressure,
    sun: {
      isDay: solAObs.isDay,
      sunrise: formatWallTime(solDuJour.sunriseUtc, timezone),
      sunset: formatWallTime(solDuJour.sunsetUtc, timezone),
    },
    // Le SEUL endroit de la réponse qui dépend de la langue. Tout le reste
    // (valeurs numériques, icône, jetons) est neutre, conformément au contrat :
    // le client peut donc changer de langue sans rien recalculer d'autre.
    text: (lang === "en" ? translateEn : translateFr)({
      wind: d.wind,
      visibility: d.visibility,
      clouds: d.clouds,
      phenomena: d.phenomena,
      verticalVisibility: d.verticalVisibility,
    }),
    raw: d.raw,
    warnings,
  };
}

// ---------- 7. Correspondance motif d'échec -> code HTTP (pure) ----------

// `switch` exhaustif : le `default` affecte la valeur à `never`, si bien
// qu'ajouter un cinquième motif dans awc.ts deviendra une ERREUR DE TYPE ici,
// au lieu de produire silencieusement un 500 en production.
export function statusForReason(reason: NotFoundReason): number {
  switch (reason) {
    case "invalid_position":
      return 400; // la requête est fautive
    case "no_station":
    case "only_stale":
      return 404; // requête correcte, mais rien à servir
    case "network_error":
      return 502; // c'est la source amont qui a failli, pas le client
    default: {
      const jamais: never = reason;
      return jamais;
    }
  }
}

// ---------- 8. Orchestration (impure : réseau + cache) ----------

// Clé de cache : position arrondie au centième de degré, soit ~1 km. Deux
// utilisateurs du même quartier partagent donc la même entrée. La langue n'y
// figure pas, puisqu'on met en cache la station et non le texte traduit.
export function cacheKey(lat: number, lon: number): string {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

export async function handleNearest(
  query: NearestQuery,
  deps: NearestDeps = {},
): Promise<NearestOutcome> {
  const nowMs = deps.nowMs ?? Date.now();
  const cache = deps.cache;
  const cle = cacheKey(query.lat, query.lon);

  // 1. Le cache d'abord : une entrée fraîche évite l'aller-retour réseau.
  // Conséquence assumée : une entrée servie depuis le cache n'est pas
  // repassée par le filtre de fraîcheur de awc.ts. Une observation mise en
  // cache à 2 h 56 d'âge peut donc être servie à 3 h 01, alors qu'un appel
  // neuf l'aurait écartée. Le dépassement est borné par la durée de vie du
  // cache (5 min) sur un seuil déjà large de 3 h : on l'accepte, et
  // `isStale` signale de toute façon l'observation depuis longtemps.
  const entree = cache?.get(cle);
  if (entree !== undefined && nowMs - entree.storedAtMs < CACHE_TTL_MS) {
    // Réassemblage complet : l'âge et `isStale` sont donc recalculés à l'instant.
    // La langue vient de la REQUÊTE en cours, pas de celle qui a rempli le
    // cache : on met en cache la station, jamais le texte traduit. Un premier
    // visiteur en français ne fige donc pas la langue du suivant.
    return { status: 200, body: buildResponse(entree.hit, nowMs, query.lang), fromCache: true };
  }

  // 2. Sinon, on interroge la source. fetchNearest ne lève jamais : un échec
  // est une donnée de retour, jamais une exception.
  const r = await fetchNearest(query.lat, query.lon, {
    fetchImpl: deps.fetchImpl,
    nowMs,
    retryDelayMs: deps.retryDelayMs,
  });

  if (!r.found) {
    // Un échec n'est JAMAIS mis en cache : une panne de deux secondes ne doit
    // pas condamner la position pendant cinq minutes.
    return { status: statusForReason(r.reason), body: { error: r.reason }, fromCache: false };
  }

  const { found: _ignore, ...hit } = r; // on retire le drapeau d'union
  cache?.set(cle, { hit, storedAtMs: nowMs });
  return { status: 200, body: buildResponse(hit, nowMs, query.lang), fromCache: false };
}

// ---------- 9. Entrée HTTP (Vercel) ----------

// Cache en mémoire du processus. Il vit au niveau du module UNIQUEMENT ici,
// dans la partie non testée : une instance Vercel « chaude » enchaîne
// plusieurs requêtes et en profite. Les tests, eux, injectent toujours leur
// propre Map, sinon un test hériterait de la réponse du précédent.
const cacheProcessus: NearestCache = new Map();

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const q = parseQuery(req.query as Record<string, string | string[] | undefined>);
  if (!q.ok) {
    res.status(400).json({ error: q.error } satisfies ApiError);
    return;
  }

  const sortie = await handleNearest(q.value, { cache: cacheProcessus });

  // Cache côté CDN Vercel : 5 minutes, et pendant 1 minute de plus on tolère de
  // servir la version périmée pendant qu'elle se rafraîchit en arrière-plan.
  // Uniquement sur les réponses réussies : on ne met pas une panne en cache.
  if (sortie.status === 200) {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=60");
  } else {
    res.setHeader("Cache-Control", "no-store");
  }
  res.status(sortie.status).json(sortie.body);
}
