// src/i18n/en.ts
// Traduction ANGLAISE. Jumelle de fr.ts : mêmes fonctions, mêmes signatures,
// mêmes sentinelles ("" quand le bloc est absent). Pas de framework i18n, pas
// de fichier de clés partagé : un fichier par langue, comme annoncé dans fr.ts.
//
// Pourquoi une COPIE STRUCTURÉE et non une factorisation avec fr.ts : les deux
// langues ne partagent pas leur grammaire. Le français accorde en genre et en
// nombre (« forte », « faibles ») et élide la préposition (« d'ouest ») ;
// l'anglais ne fait ni l'un ni l'autre mais place l'intensité AVANT le nom.
// Une fonction commune paramétrée par des tables aurait dû modéliser les deux
// grammaires à la fois, pour deux langues. Le coût réel de la duplication ici
// est de quatre petites tables de mots.
//
// Ce que ce fichier NE fait PAS : convertir les unités. La v1 est métrique en
// toutes langues (« km/h », « m », « hPa »). L'impérial est une affaire du
// paramètre `units` (V2), jamais de la langue : un Britannique en km/h reste
// informé, un Britannique à qui on invente des mph ne l'est plus.

import type { Wind, Visibility, Cloud, Phenomenon, WeatherText, CloudCoverage } from "../types.js";
import { dominantCondition, type WeatherCondition } from "../icon.js";

// ---------- Outils ----------

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Vent ----------

// Même rose à 8 branches que fr.ts : 240° tombe dans « southwest ».
const COMPASS = ["north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest"];

function cardinal(deg: number): string {
  // Cap ramené dans [0,360[, divisé par 45, arrondi au secteur le plus proche.
  return COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function windText(w: Wind | null): string {
  if (!w) return ""; // bloc absent
  if (w.isCalm) return "No wind";

  const speed = w.speed !== null ? `, ${w.speed} km/h` : "";
  const gust = w.gust !== null ? `, gusts to ${w.gust}` : "";

  if (w.isVariable) {
    return w.speed === null ? "Variable wind" : `Variable wind${speed}${gust}`;
  }
  if (w.directionDeg === null) {
    // Ni calme, ni variable, ni direction lisible (ex. /////KT) : rien à dire.
    return "";
  }
  // Pas d'élision à gérer, contrairement au français : la tournure « from the »
  // est invariable. La logique de préposition de fr.ts n'est pas transposée,
  // elle disparaît.
  return `Wind from the ${cardinal(w.directionDeg)}${speed}${gust}`;
}

// ---------- Visibilité ----------

export function visibilityText(v: Visibility | null): string {
  if (!v) return ""; // bloc absent
  if (v.isCavok) return "More than 10 km";
  if (v.value === null) return "";
  if (v.value >= 9999) return "More than 10 km";
  if (v.value < 1000) return `${v.value} m`;
  // LE piège du portage : fr.ts termine par .replace(".", ",") pour la virgule
  // décimale française. En anglais le point est déjà le bon séparateur, donc
  // il n'y a rien à remplacer. Recopier cette ligne aurait écrit « 2,5 km ».
  const km = Math.round(v.value / 100) / 10;
  return `${km} km`;
}

// ---------- Nuages ----------

// Mêmes rangs de densité qu'en français : c'est la couche la plus couvrante
// qu'on décrit (règle tranchée par Xavier à l'étape 6, indépendante de la langue).
const COVERAGE: Record<CloudCoverage, { word: string; rank: number }> = {
  FEW: { word: "A few clouds", rank: 1 },
  SCT: { word: "Partly cloudy", rank: 2 },
  BKN: { word: "Mostly cloudy", rank: 3 },
  OVC: { word: "Overcast", rank: 4 },
};

export function cloudsText(clouds: Cloud[] | null): string {
  if (!clouds || clouds.length === 0) return ""; // inconnu (null) ou dégagé ([])

  let chosen: Cloud | null = null;
  let bestRank = 0;
  for (const layer of clouds) {
    if (layer.coverage === null) continue;
    const rank = COVERAGE[layer.coverage].rank;
    if (rank > bestRank) {
      bestRank = rank;
      chosen = layer;
    }
  }
  if (chosen === null || chosen.coverage === null) return "";

  const word = COVERAGE[chosen.coverage].word;
  return chosen.altitude === null ? word : `${word} at ${chosen.altitude} m`;
}

// ---------- Phénomènes ----------

// Chaque libellé porte sa PLACE d'insertion de l'intensité, notée `{i}`.
//
// C'est la vraie différence de structure avec fr.ts, et elle ne se voit qu'en
// composant. En français l'intensité suit le nom, donc l'ajouter à la fin tombe
// juste dans tous les cas : « Orage avec pluie » + « faible ». En anglais elle
// précède le nom, mais pas forcément le PREMIER mot : dans « -TSRA », c'est la
// pluie qui est faible, pas l'orage. Préfixer bêtement donnerait « Light
// thunderstorm with rain », qui affirme autre chose que le METAR.
// D'où le repère explicite : « thunderstorm with {i}rain ».
const BASES: Record<string, string> = {
  // Précipitations simples
  RA: "{i}rain",
  DZ: "{i}drizzle",
  SN: "{i}snow",
  SG: "{i}snow grains",
  GR: "{i}hail",
  GS: "{i}small hail",
  PL: "{i}ice pellets",
  IC: "{i}ice crystals",
  // Averses (descripteur SH)
  SH: "{i}showers",
  SHRA: "{i}rain showers",
  SHSN: "{i}snow showers",
  SHGR: "{i}hail showers",
  // Orages (descripteur TS). Attention, les deux formes n'obéissent PAS à la
  // même règle de place, et c'est tout l'intérêt du repère explicite :
  // dans « -TSRA » l'intensité qualifie la pluie, mais dans « -TS » tout court
  // il n'y a aucune précipitation associée, donc elle qualifie l'orage et
  // repasse devant. Poser `{i}` à la fin donnait « Thunderstormlight ».
  TS: "{i}thunderstorm",
  TSRA: "thunderstorm with {i}rain",
  TSSN: "thunderstorm with {i}snow",
  TSGR: "thunderstorm with {i}hail",
  // Verglas (descripteur FZ)
  FZRA: "{i}freezing rain",
  FZDZ: "{i}freezing drizzle",
  FZFG: "{i}freezing fog",
  // Obscurcissements
  FG: "{i}fog",
  BR: "{i}mist",
  HZ: "{i}haze",
  FU: "{i}smoke",
  SA: "{i}sand",
  DU: "{i}dust",
  VA: "{i}volcanic ash",
};

// Traduit UN code (ex. "-TSRA", "VCRA", "FG") en une phrase capitalisée.
function translatePhenomenon(code: string): string {
  let rest = code;
  let intensity: "light" | "heavy" | "vicinity" | "none" = "none";

  // Préfixes du METAR : VC (à proximité), + (fort), - (faible).
  if (rest.startsWith("VC")) {
    intensity = "vicinity";
    rest = rest.slice(2);
  } else if (rest.startsWith("+")) {
    intensity = "heavy";
    rest = rest.slice(1);
  } else if (rest.startsWith("-")) {
    intensity = "light";
    rest = rest.slice(1);
  }

  const base = BASES[rest];
  // Base inconnue : on rend le code brut plutôt que de planter (défensif,
  // même règle que fr.ts — un METAR exotique ne doit pas priver de météo).
  if (!base) return capitalize(rest.toLowerCase());

  // « in the vicinity » est un SUFFIXE, comme « à proximité » en français :
  // c'est le seul modificateur qui ne se place pas devant le nom.
  const mot = intensity === "light" ? "light " : intensity === "heavy" ? "heavy " : "";
  let phrase = base.replace("{i}", mot);
  if (intensity === "vicinity") phrase += " in the vicinity";
  return capitalize(phrase);
}

export function phenomenaText(phenomena: Phenomenon[]): string {
  if (phenomena.length === 0) return "";
  return phenomena.map((p) => translatePhenomenon(p.code)).join(", ");
}

// ---------- Headline ----------

// `Record<WeatherCondition, string>` et non un objet libre : TypeScript exige
// alors les 20 jetons. Ajouter une condition dans icon.ts sans la traduire ici
// devient une erreur de compilation, jamais un `undefined` servi au client.
const HEADLINE: Record<WeatherCondition, string> = {
  thunderstorm: "Thunderstorm",
  freezing_rain: "Freezing rain",
  hail: "Hail",
  sleet: "Sleet",
  snow: "Snow",
  drizzle: "Drizzle",
  showers: "Showers",
  rain_light: "Light rain",
  rain: "Rain",
  rain_heavy: "Heavy rain",
  fog: "Fog",
  mist: "Mist",
  smoke: "Smoke",
  dust: "Dust",
  clear: "Clear sky",
  cloud_few: "A few clouds",
  cloud_sct: "Partly cloudy",
  cloud_bkn: "Mostly cloudy",
  cloud_ovc: "Overcast",
  unknown: "", // rien d'exploitable : pas de résumé, comme en français
};

export function headlineText(condition: WeatherCondition): string {
  return HEADLINE[condition];
}

// ---------- Assemblage ----------

// Jumelle exacte de translateFr, y compris l'appel à `dominantCondition` :
// le sélecteur de condition est NEUTRE (aucun mot dedans) et partagé avec
// l'icône, si bien que headline, icône et langue ne peuvent pas diverger.
export function translateEn(d: {
  wind: Wind | null;
  visibility: Visibility | null;
  clouds: Cloud[] | null;
  phenomena: Phenomenon[];
  verticalVisibility?: number | null;
}): WeatherText {
  const condition = dominantCondition({
    phenomena: d.phenomena,
    clouds: d.clouds,
    verticalVisibility: d.verticalVisibility ?? null,
  });
  return {
    headline: headlineText(condition),
    wind: windText(d.wind),
    visibility: visibilityText(d.visibility),
    clouds: cloudsText(d.clouds),
    phenomena: phenomenaText(d.phenomena),
  };
}
