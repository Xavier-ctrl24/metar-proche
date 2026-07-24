// src/i18n/fr.ts
// ETAPE 6 : traduction francaise. Transforme les donnees structurees du
// decodeur (Wind, Visibility, Cloud[], Phenomenon[]) en phrases pour le GRAND
// PUBLIC. Aucun jargon aeronautique.
//
// Chaque fonction est PURE et prend une brique du contrat (types.ts). Elle
// renvoie une chaine, et "" quand le bloc est absent (null) : c'est la sentinelle
// « bloc vide » decidee a l'etape 5, jamais "undefined" ni d'exception.
//
// Ce fichier ne traduit que le francais. Un futur en.ts se glissera a cote sans
// rien changer ici (pas de framework i18n : un fichier par langue suffit).

import type { Wind, Visibility, Cloud, Phenomenon, WeatherText, CloudCoverage } from "../types";
import { dominantCondition, type WeatherCondition } from "../icon";

// ---------- Outils ----------

// Met une majuscule a la premiere lettre (gere les lettres accentuees).
function capitaliser(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- Vent ----------

// Rose des vents a 8 branches (secteurs de 45°). 240° tombe dans « sud-ouest »,
// conformement a l'exemple du contrat.
const ROSE = ["nord", "nord-est", "est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest"];

function cardinal(deg: number): string {
  // On ramene le cap dans [0,360[, on divise par 45 et on arrondit au secteur le plus proche.
  return ROSE[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

// « Vent du nord », « Vent du sud-ouest » mais « Vent d'est » / « Vent d'ouest » :
// preposition « du » pour les directions a consonne, elision « d' » devant voyelle
// (est, ouest). Formulation validee par Xavier.
function ventDe(deg: number): string {
  const c = cardinal(deg);
  return /^[aeiouy]/.test(c) ? `d'${c}` : `du ${c}`;
}

export function windText(w: Wind | null): string {
  if (!w) return ""; // bloc absent
  if (w.isCalm) return "Pas de vent";

  // Morceaux optionnels communs aux cas « variable » et « directionnel ».
  const vitesse = w.speed !== null ? `, ${w.speed} km/h` : "";
  const rafales = w.gust !== null ? `, rafales à ${w.gust}` : "";

  if (w.isVariable) {
    // Vent variable : pas de direction cardinale a annoncer.
    return w.speed === null ? "Vent variable" : `Vent variable${vitesse}${rafales}`;
  }
  if (w.directionDeg === null) {
    // Ni calme, ni variable, ni direction lisible (ex. /////KT) : rien de presentable.
    return "";
  }
  return `Vent ${ventDe(w.directionDeg)}${vitesse}${rafales}`;
}

// ---------- Visibilite ----------

export function visibilityText(v: Visibility | null): string {
  if (!v) return ""; // bloc absent
  if (v.isCavok) return "Plus de 10 km"; // CAVOK = tres bonne visibilite
  if (v.value === null) return "";
  if (v.value >= 9999) return "Plus de 10 km"; // 9999 m et au-dela = « plus de 10 km »
  // NOTE : format sous le kilometre (« 400 m ») a valider par Xavier.
  if (v.value < 1000) return `${v.value} m`;
  // Kilometres avec un chiffre apres la virgule : 2500 m -> 2,5 km, 6000 m -> 6 km.
  const km = (Math.round(v.value / 100) / 10).toString().replace(".", ",");
  return `${km} km`;
}

// ---------- Nuages ----------

// Mots de couverture (formules par Xavier) et rang de « densite » pour departager
// plusieurs couches : c'est la plus couvrante qu'on decrit (choix de Xavier).
const COUVERTURE: Record<CloudCoverage, { mot: string; rang: number }> = {
  FEW: { mot: "Quelques nuages", rang: 1 },
  SCT: { mot: "Éclaircies", rang: 2 },
  BKN: { mot: "Ciel très nuageux", rang: 3 },
  OVC: { mot: "Ciel couvert", rang: 4 },
};

export function cloudsText(clouds: Cloud[] | null): string {
  if (!clouds || clouds.length === 0) return ""; // inconnu (null) ou ciel degage ([])

  // On retient la couche a la couverture la plus dense. Les couches a couverture
  // non reconnue (null) sont ignorees dans ce classement.
  let choisie: Cloud | null = null;
  let meilleurRang = 0;
  for (const couche of clouds) {
    if (couche.coverage === null) continue;
    const rang = COUVERTURE[couche.coverage].rang;
    if (rang > meilleurRang) {
      meilleurRang = rang;
      choisie = couche;
    }
  }
  if (choisie === null || choisie.coverage === null) return "";

  const mot = COUVERTURE[choisie.coverage].mot;
  // Altitude inconnue : on annonce la couverture sans hauteur.
  return choisie.altitude === null ? mot : `${mot} vers ${choisie.altitude} m`;
}

// ---------- Phenomenes ----------

// Chaque base porte sa phrase, son GENRE (m/f) et son NOMBRE (s/p) pour accorder
// l'adjectif d'intensite (« forte » au feminin, « faibles » au pluriel).
type Genre = "m" | "f";
type Nombre = "s" | "p";
const BASES: Record<string, { t: string; g: Genre; n: Nombre }> = {
  // Precipitations simples
  RA: { t: "pluie", g: "f", n: "s" },
  DZ: { t: "bruine", g: "f", n: "s" },
  SN: { t: "neige", g: "f", n: "s" },
  SG: { t: "neige en grains", g: "f", n: "s" },
  GR: { t: "grêle", g: "f", n: "s" },
  GS: { t: "grésil", g: "m", n: "s" },
  PL: { t: "granules de glace", g: "m", n: "p" },
  IC: { t: "cristaux de glace", g: "m", n: "p" },
  // Averses (descripteur SH)
  SH: { t: "averses", g: "f", n: "p" },
  SHRA: { t: "averses de pluie", g: "f", n: "p" },
  SHSN: { t: "averses de neige", g: "f", n: "p" },
  SHGR: { t: "averses de grêle", g: "f", n: "p" },
  // Orages (descripteur TS)
  TS: { t: "orage", g: "m", n: "s" },
  TSRA: { t: "orage avec pluie", g: "m", n: "s" },
  TSSN: { t: "orage avec neige", g: "m", n: "s" },
  TSGR: { t: "orage avec grêle", g: "m", n: "s" },
  // Verglas (descripteur FZ)
  FZRA: { t: "pluie verglaçante", g: "f", n: "s" },
  FZDZ: { t: "bruine verglaçante", g: "f", n: "s" },
  FZFG: { t: "brouillard givrant", g: "m", n: "s" },
  // Obscurcissements
  FG: { t: "brouillard", g: "m", n: "s" },
  BR: { t: "brume", g: "f", n: "s" },
  HZ: { t: "brume sèche", g: "f", n: "s" },
  FU: { t: "fumée", g: "f", n: "s" },
  SA: { t: "sable", g: "m", n: "s" },
  DU: { t: "poussière", g: "f", n: "s" },
  VA: { t: "cendres volcaniques", g: "f", n: "p" },
};

// Accord de « fort » selon genre et nombre.
function fort(g: Genre, n: Nombre): string {
  const base = g === "f" ? "forte" : "fort";
  return n === "p" ? base + "s" : base;
}

// Traduit UN code (ex. "-TSRA", "VCRA", "FG") en une phrase capitalisee.
function traduirePhenomene(code: string): string {
  let reste = code;
  let intensite: "faible" | "fort" | "proximite" | "aucune" = "aucune";

  // On detache le prefixe : VC (a proximite), + (fort), - (faible).
  if (reste.startsWith("VC")) {
    intensite = "proximite";
    reste = reste.slice(2);
  } else if (reste.startsWith("+")) {
    intensite = "fort";
    reste = reste.slice(1);
  } else if (reste.startsWith("-")) {
    intensite = "faible";
    reste = reste.slice(1);
  }

  const base = BASES[reste];
  // Base inconnue : on renvoie le code brut plutot que de planter (defensif).
  if (!base) return capitaliser(reste.toLowerCase());

  let phrase = base.t;
  if (intensite === "proximite") {
    phrase += " à proximité"; // invariable
  } else if (intensite === "faible") {
    phrase += base.n === "p" ? " faibles" : " faible"; // « faible » n'a pas de genre
  } else if (intensite === "fort") {
    phrase += " " + fort(base.g, base.n);
  }
  return capitaliser(phrase);
}

export function phenomenaText(phenomena: Phenomenon[]): string {
  if (phenomena.length === 0) return "";
  // Plusieurs phenomenes : on les separe par des virgules.
  return phenomena.map((p) => traduirePhenomene(p.code)).join(", ");
}

// ---------- Headline ----------

// Traduit le JETON de condition dominante (calcule par icon.ts) en resume court.
// On reutilise ici les mots deja formules par Xavier ailleurs (mots de nuages,
// noms de phenomenes), plus « Ciel degage » et « Neige fondue ». Comme le jeton
// vient du meme selecteur que l'icone, headline et icone ne peuvent pas diverger.
const HEADLINE: Record<WeatherCondition, string> = {
  thunderstorm: "Orage",
  freezing_rain: "Pluie verglaçante",
  hail: "Grêle",
  sleet: "Neige fondue",
  snow: "Neige",
  drizzle: "Bruine",
  showers: "Averses",
  rain_light: "Pluie faible",
  rain: "Pluie",
  rain_heavy: "Pluie forte",
  fog: "Brouillard",
  mist: "Brume",
  smoke: "Fumée",
  dust: "Poussière",
  clear: "Ciel dégagé",
  cloud_few: "Quelques nuages",
  cloud_sct: "Éclaircies",
  cloud_bkn: "Ciel très nuageux",
  cloud_ovc: "Ciel couvert",
  unknown: "", // rien d'exploitable : pas de resume
};

export function headlineText(condition: WeatherCondition): string {
  return HEADLINE[condition];
}

// ---------- Assemblage ----------

// Compose le bloc « text » du contrat a partir des donnees decodees. Le headline
// suit la meme priorite que l'icone (orage > verglas > ... > nuages), via le
// selecteur partage dominantCondition.
export function translateFr(d: {
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
