// src/icon.ts
// ETAPE 7 : choix de l'icone meteo. C'est le SELECTEUR NEUTRE du projet : il ne
// contient AUCUN texte francais (le headline, lui, vit dans i18n/fr.ts). Icone et
// headline partagent la meme decision de « condition dominante » pour ne jamais
// se contredire.
//
// Deux fonctions exportees :
//   - dominantCondition(...) : renvoie un JETON neutre (thunderstorm, cloud_sct...)
//     selon la chaine de priorite. Utilise par l'icone ET par le headline.
//   - pickIcon(..., isDay) : traduit ce jeton en une icone de l'union fermee,
//     en ajoutant le suffixe jour/nuit la ou c'est pertinent.

import type { Cloud, Phenomenon, WeatherIcon, CloudCoverage } from "./types.js";

// Jeton neutre de condition dominante. Ferme, comme l'union d'icones.
export type WeatherCondition =
  | "thunderstorm"
  | "freezing_rain"
  | "hail"
  | "sleet"
  | "snow"
  | "drizzle"
  | "showers"
  | "rain_light"
  | "rain"
  | "rain_heavy"
  | "fog"
  | "mist"
  | "smoke"
  | "dust"
  | "clear"
  | "cloud_few"
  | "cloud_sct"
  | "cloud_bkn"
  | "cloud_ovc"
  | "unknown";

// Entree minimale : seules les parties qui influencent l'icone.
interface IconInput {
  phenomena: Phenomenon[];
  clouds: Cloud[] | null;
  verticalVisibility: number | null;
}

// Rang de « densite » nuageuse pour departager plusieurs couches.
const RANG: Record<CloudCoverage, number> = { FEW: 1, SCT: 2, BKN: 3, OVC: 4 };

// ---------- Selecteur neutre ----------

export function dominantCondition(d: IconInput): WeatherCondition {
  const codes = d.phenomena.map((p) => p.code);
  const has = (re: RegExp): boolean => codes.some((c) => re.test(c));

  // Ordre de priorite IMPERATIF (du plus grave au plus anodin) :

  // 1. Orage (TS sous toutes ses formes : TS, TSRA, VCTS...).
  if (has(/TS/)) return "thunderstorm";

  // 2. Pluie/bruine verglacante (FZRA, FZDZ). FZFG (brouillard givrant) ne compte
  //    pas ici : il tombera sur « fog » plus bas.
  if (has(/FZ(RA|DZ)/)) return "freezing_rain";

  // 3. Grele et assimiles. Choix de Xavier : GR, GS et PL prennent tous « hail ».
  if (has(/GR|GS|PL/)) return "hail";

  // 3 bis. Melange pluie + neige (neige fondue) : un code contenant RA et SN, ou
  //        les deux phenomenes presents ensemble. Passe AVANT la neige seule.
  if (has(/RASN|SNRA/) || (has(/RA/) && has(/SN/))) return "sleet";

  // 4. Neige (SN, SG). Couvre aussi SHSN (averses de neige).
  if (has(/SN|SG/)) return "snow";

  // 5. Precipitations liquides, par ordre de specificite.
  if (has(/DZ/)) return "drizzle"; // bruine
  if (has(/SH/)) return "showers"; // averses (SHRA...)
  const ra = codes.find((c) => /RA/.test(c));
  if (ra) {
    if (ra.includes("+")) return "rain_heavy";
    if (ra.includes("-")) return "rain_light";
    return "rain";
  }

  // 6. Brouillard : le code FG, ou une visibilite verticale (VV) meme sans FG.
  if (has(/FG/) || d.verticalVisibility !== null) return "fog";

  // 7. Brume : BR (brume) et HZ (brume seche) partagent l'icone (choix de Xavier).
  //    IC (cristaux de glace) n'a volontairement pas d'icone : il retombe plus bas.
  if (has(/BR/) || has(/HZ/)) return "mist";

  // 8. Fumee, puis poussiere/sable (y compris les tempetes SS/DS).
  if (has(/FU/)) return "smoke";
  if (has(/DU|SA|SS|DS/)) return "dust";

  // 9. Couverture nuageuse (aucun phenomene significatif).
  if (d.clouds !== null) {
    if (d.clouds.length === 0) return "clear"; // [] = ciel degage CONNU

    // On retient la couche la plus couvrante.
    let rang = 0;
    let cov: CloudCoverage | null = null;
    for (const couche of d.clouds) {
      if (couche.coverage === null) continue;
      if (RANG[couche.coverage] > rang) {
        rang = RANG[couche.coverage];
        cov = couche.coverage;
      }
    }
    if (cov === "FEW") return "cloud_few";
    if (cov === "SCT") return "cloud_sct";
    if (cov === "BKN") return "cloud_bkn";
    if (cov === "OVC") return "cloud_ovc";
    // Couches presentes mais couverture illisible : on ne sait pas nommer.
    return "unknown";
  }

  // 10. Rien d'exploitable (panne, ligne illisible).
  return "unknown";
}

// ---------- Traduction jeton -> icone ----------

export function pickIcon(d: IconInput, isDay: boolean | null): WeatherIcon {
  const condition = dominantCondition(d);
  // Suffixe jour/nuit. isDay inconnu (null) -> jour par defaut (a valider a l'etape 8).
  const suffixe = isDay === false ? "night" : "day";

  switch (condition) {
    case "thunderstorm":
      return "thunderstorm";
    case "freezing_rain":
      return "freezing_rain";
    case "hail":
      return "hail";
    case "sleet":
      return "sleet";
    case "snow":
      return "snow";
    case "drizzle":
      return "drizzle";
    case "showers":
      return suffixe === "night" ? "showers_night" : "showers_day";
    case "rain_light":
      return "rain_light";
    case "rain":
      return "rain";
    case "rain_heavy":
      return "rain_heavy";
    case "fog":
      return "fog";
    case "mist":
      return "mist";
    case "smoke":
      return "smoke";
    case "dust":
      return "dust";
    case "clear":
      return suffixe === "night" ? "clear_night" : "clear_day";
    case "cloud_few":
      return suffixe === "night" ? "few_night" : "few_day";
    case "cloud_sct":
      return suffixe === "night" ? "partly_cloudy_night" : "partly_cloudy_day";
    case "cloud_bkn":
      return "cloudy"; // neutre jour/nuit
    case "cloud_ovc":
      return "overcast"; // neutre jour/nuit
    case "unknown":
      return "unknown";
  }
}
