// src/decode.ts
// ETAPE 5 : le decodeur METAR. Il transforme la ligne brute (ex.
// "LFST 231800Z 24008KT CAVOK 24/07 Q1018") en donnees structurees.
//
// PRINCIPE CENTRAL : le decodeur est DEFENSIF. Il n'extrait que ce qui est
// lisible, met null partout ailleurs, et ne leve JAMAIS d'exception. Une ligne
// entierement barree ou corrompue produit un objet valide plein de null.
//
// CE QU'IL NE FAIT PAS : la geographie (station, distance), le fuseau horaire,
// le calcul jour/nuit, le choix d'icone et la traduction francaise. Ce sont des
// etapes ulterieures. Ici on ne fait que LIRE le texte METAR.

import { knotsToKmh, mpsToKmh, inchesHgToHpa, statuteMilesToMeters, parseFraction, feetToMeters } from "./units.js";
import type { Temperature, Wind, Visibility, Cloud, Phenomenon, Pressure } from "./types.js";

// ---------- Type de retour ----------
// DecodedMetar n'est PAS le contrat d'API public (celui-la vit dans types.ts et
// s'appelle MetarResponse). C'est une structure INTERNE, faite des memes briques,
// qui contient uniquement ce qu'on peut lire dans le texte brut. Les etapes
// suivantes l'enrichiront (station, soleil, icone, textes).
export interface DecodedMetar {
  icao: string | null;
  observedAt: string | null; // ISO UTC, ex. "2026-07-23T18:00:00Z"
  isAuto: boolean | null; // true si le groupe AUTO est present
  temperature: Temperature | null;
  wind: Wind | null;
  visibility: Visibility | null;
  clouds: Cloud[] | null; // null = inconnu ; [] = ciel sans nuage constate (CAVOK/CLR)
  verticalVisibility: number | null; // VV001 (brouillard), en metres
  phenomena: Phenomenon[]; // [] si aucun, jamais null
  pressure: Pressure | null;
  warnings: string[]; // anomalies detectees, [] si aucune
  raw: string; // la ligne d'origine, telle quelle
}

// ---------- Vocabulaire de reperage ----------

// Groupes qui marquent la fin des donnees « maintenant » : tout ce qui suit
// decrit une PREVISION (tendance) ou des remarques, on l'ignore en v1.
const STOP = new Set(["RMK", "BECMG", "TEMPO", "INTER", "NOSIG"]);

// Mots-cles a sauter sans rien en faire (ou traites a part).
const SKIP = new Set(["METAR", "SPECI", "COR", "$", "="]);

// Codes de temps present METAR (descripteurs + precipitations + obscurcissements).
// Sert a reconnaitre un groupe de phenomene SANS confondre avec de la corruption.
const WX = "MI|PR|BC|DR|BL|SH|TS|FZ|DZ|RA|SN|SG|PL|GR|GS|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS|UP|IC";

// ---------- Petites fonctions de calcul ----------

// Humidite relative par la formule d'August-Roche-Magnus (coefficients 17,625 /
// 243,04), arrondie au pourcent. Verifiee contre les valeurs du corpus.
function relativeHumidity(tempC: number, dewC: number): number {
  const a = 17.625;
  const b = 243.04;
  const num = Math.exp((a * dewC) / (b + dewC));
  const den = Math.exp((a * tempC) / (b + tempC));
  return Math.round(100 * (num / den));
}

// Temperature ressentie APPROXIMATIVE. Deux regimes classiques :
//   - froid (<= 10 C, vent >= 5 km/h) : refroidissement eolien (formule canadienne)
//   - chaud (>= 27 C, humidite connue) : indice de chaleur (regression de Rothfusz)
//   - sinon : la ressentie vaut la temperature reelle.
// Approximatif par nature ; Xavier validera les valeurs plus tard.
function computeFeelsLike(tempC: number, humidity: number | null, windKmh: number | null): number {
  if (tempC <= 10 && windKmh !== null && windKmh >= 5) {
    const v = Math.pow(windKmh, 0.16);
    return Math.round(13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v);
  }
  if (tempC >= 27 && humidity !== null) {
    // Calcul mene en Fahrenheit (formule d'origine), puis reconverti en Celsius.
    const t = (tempC * 9) / 5 + 32;
    const r = humidity;
    const hiF =
      -42.379 + 2.04901523 * t + 10.14333127 * r - 0.22475541 * t * r -
      0.00683783 * t * t - 0.05481717 * r * r + 0.00122874 * t * t * r +
      0.00085282 * t * r * r - 0.00000199 * t * t * r * r;
    return Math.round(((hiF - 32) * 5) / 9);
  }
  return tempC;
}

// "15" -> 15 ; "M09" -> -9. Le prefixe M code le signe negatif en METAR.
function signed(token: string): number {
  return token.startsWith("M") ? -Number(token.slice(1)) : Number(token);
}

// Construit un horodatage ISO a partir du groupe jour/heure/minute (ex. 231800Z).
// Le METAR ne donne ni l'annee ni le mois : on les prend de la date de reference
// (par defaut « maintenant »). Si le jour tombe dans le futur, c'est le mois
// precedent. Renvoie null si le groupe est incoherent.
function buildObservedAt(day: number, hour: number, minute: number, now: Date): string | null {
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  let d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, hour, minute));
  // Tolerance d'un jour : au-dela, l'observation appartient au mois d'avant.
  if (d.getTime() - now.getTime() > 24 * 3600 * 1000) {
    d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day, hour, minute));
  }
  return d.toISOString().slice(0, 19) + "Z";
}

// ---------- Parseurs de groupes individuels ----------

// Vent : gere KT/MPS/KMH, direction VRB (variable) ou barree, vitesse et rafale
// absentes (//), et le calme 00000. Renvoie toujours un objet Wind (jamais null
// des qu'un groupe de vent est reconnu).
function parseWind(token: string): Wind | null {
  const m = token.match(/^(\d{3}|VRB|\/{3})(\d{2,3}|\/{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/);
  if (!m) return null;
  const [, dir, spd, gust, unit] = m;

  // Choix du convertisseur selon l'unite source.
  const toKmh = unit === "MPS" ? mpsToKmh : unit === "KMH" ? (n: number) => Math.round(n) : knotsToKmh;

  const speed = /^\d+$/.test(spd) ? toKmh(Number(spd)) : null;
  const isVariable = dir === "VRB";
  const dirNum = /^\d{3}$/.test(dir) ? Number(dir) : null;
  const isCalm = dirNum === 0 && speed === 0 && !gust;

  return {
    // Vent calme et vent variable n'ont pas de direction cardinale exploitable.
    speed,
    unit: "kmh",
    gust: gust ? toKmh(Number(gust)) : null,
    directionDeg: isCalm || isVariable ? null : dirNum,
    isVariable,
    isCalm,
  };
}

// Visibilite en miles terrestres (Amerique du Nord). Le prefixe M (« moins de »)
// est traite comme la valeur elle-meme. Renvoie null si le texte est illisible.
function parseVisibilitySm(token: string): number | null {
  let body = token.slice(0, -2); // retire "SM"
  if (body.startsWith("M")) body = body.slice(1); // "moins de" : on garde la valeur
  const miles = parseFraction(body);
  return miles === null ? null : statuteMilesToMeters(miles);
}

// Extrait toutes les couches nuageuses d'un token (gere les groupes colles comme
// OVC007FEW040CB) et la visibilite verticale VV. Modifie clouds/verticalVisibility
// via les accumulateurs passes en parametre. Renvoie false si le token n'est pas nuageux.
function parseCloudsInto(token: string, out: { clouds: Cloud[]; vv: number | null }): boolean {
  if (!/^(FEW|SCT|BKN|OVC|VV)/.test(token)) return false;
  const re = /(FEW|SCT|BKN|OVC|VV)(\d{3}|\/{3})(?:CB|TCU|\/{2,3})?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(token)) !== null) {
    const [, type, digits] = m;
    if (type === "VV") {
      // Visibilite verticale : hauteur en centaines de pieds, convertie en metres
      // SANS arrondi a la centaine (VV001 = 100 ft ~ 30 m, sinon on tomberait a 0).
      out.vv = digits === "///" ? null : Math.round(Number(digits) * 100 * 0.3048);
    } else {
      out.clouds.push({
        coverage: type as Cloud["coverage"],
        altitude: digits === "///" ? null : feetToMeters(Number(digits) * 100),
        unit: "m",
      });
    }
  }
  return true;
}

// ---------- Fonction principale ----------

export function decode(raw: string, now: Date = new Date()): DecodedMetar {
  // Squelette : tout est null/vide au depart. On ne remplira que ce qu'on lit.
  const result: DecodedMetar = {
    icao: null,
    observedAt: null,
    isAuto: false,
    temperature: null,
    wind: null,
    visibility: null,
    clouds: null,
    verticalVisibility: null,
    phenomena: [],
    pressure: null,
    warnings: [],
    raw,
  };

  // 1. Nettoyage : le "=" termine le bulletin, tout ce qui suit est coupe.
  const clean = raw.split("=")[0].trim();
  if (clean === "") return result; // chaine vide : squelette tel quel.

  // 2. Decoupage en tokens, puis fusion des visibilites SM composees ("1" + "3/4SM").
  const rawTokens = clean.split(/\s+/);
  const tokens: string[] = [];
  for (let i = 0; i < rawTokens.length; i++) {
    if (/^\d{1,2}$/.test(rawTokens[i]) && i + 1 < rawTokens.length && /^M?\d\/\d{1,2}SM$/.test(rawTokens[i + 1])) {
      tokens.push(rawTokens[i] + " " + rawTokens[i + 1]);
      i++; // le token suivant a ete absorbe.
    } else {
      tokens.push(rawTokens[i]);
    }
  }

  // Accumulateur pour les nuages (les couches se decouvrent au fil des tokens).
  const cloudAcc: { clouds: Cloud[]; vv: number | null } = { clouds: [], vv: null };
  let cloudsSeen = false; // a-t-on rencontre au moins une info nuageuse ?
  let seenTime = false;
  // Pour la temperature ressentie, il faut le vent : on la calcule tout a la fin.
  let tempValue: number | null = null;
  let tempDew: number | null = null;

  // 3. Parcours token par token, dans l'ordre de priorite explique plus haut.
  for (const token of tokens) {
    if (STOP.has(token)) break; // tendance/remarque : on arrete tout.
    if (SKIP.has(token)) continue;

    if (token === "NIL") {
      result.warnings.push("pas d'observation (NIL)");
      continue;
    }
    if (token === "AUTO") {
      result.isAuto = true;
      continue;
    }

    // Identifiant OACI : premier mot de 4 lettres, avant l'horodatage.
    if (!result.icao && !seenTime && /^[A-Z]{4}$/.test(token) && token !== "AUTO") {
      result.icao = token;
      continue;
    }

    // Horodatage jour/heure/minute + Z.
    const time = token.match(/^(\d{2})(\d{2})(\d{2})Z$/);
    if (time) {
      seenTime = true;
      result.observedAt = buildObservedAt(Number(time[1]), Number(time[2]), Number(time[3]), now);
      if (result.observedAt === null) result.warnings.push("horodatage incoherent");
      continue;
    }

    // Vent.
    const wind = parseWind(token);
    if (wind) {
      result.wind = wind;
      continue;
    }

    // Variation de direction (150V210) : notion aeronautique fine, ignoree en v1.
    if (/^\d{3}V\d{3}$/.test(token)) continue;

    // Portee visuelle de piste (R22/1200, R20/CLRD60...) : sans interet grand public.
    if (/^R\d{2}[LRC]?\//.test(token)) continue;

    // CAVOK : remplace visibilite ET nuages.
    if (token === "CAVOK") {
      result.visibility = { value: null, unit: "m", isCavok: true };
      cloudsSeen = true; // ciel degage : pas de couche.
      continue;
    }

    // Ciel clair / pas de nuage significatif : couche vide (mais « connue »).
    if (token === "CLR" || token === "SKC" || token === "NSC" || token === "NCD") {
      cloudsSeen = true;
      continue;
    }

    // Nuages ou visibilite verticale.
    if (parseCloudsInto(token, cloudAcc)) {
      cloudsSeen = true;
      continue;
    }

    // Visibilite en miles (se termine par SM).
    if (token.endsWith("SM")) {
      const v = parseVisibilitySm(token);
      if (v !== null) result.visibility = { value: v, unit: "m", isCavok: false };
      continue;
    }

    // Visibilite en metres (4 chiffres, ex. 9999, 6000).
    if (/^\d{4}$/.test(token)) {
      result.visibility = { value: Number(token), unit: "m", isCavok: false };
      continue;
    }

    // Temperature / point de rosee (ex. 24/07, 15/M09, 42///, M60/).
    const temp = token.match(/^(M?\d{2})\/(M?\d{2}|\/{2,3})?$/);
    if (temp) {
      tempValue = Number.isNaN(signed(temp[1])) ? null : signed(temp[1]);
      tempDew = temp[2] && /^M?\d{2}$/.test(temp[2]) ? signed(temp[2]) : null;

      let humidity: number | null = null;
      if (tempValue !== null && tempDew !== null) {
        if (tempDew > tempValue) {
          // Point de rosee superieur a la temperature : physiquement impossible.
          humidity = 100;
          result.warnings.push("point de rosee superieur a la temperature, humidite plafonnee a 100 %");
        } else {
          humidity = Math.min(100, relativeHumidity(tempValue, tempDew));
        }
      }
      result.temperature = { value: tempValue, unit: "C", feelsLike: null, dewPoint: tempDew, humidity };
      continue;
    }

    // Pression : Q pour hPa, A pour pouces de mercure.
    const q = token.match(/^Q(\d{4}|\/{3,4})$/);
    if (q) {
      result.pressure = { value: /^\d+$/.test(q[1]) ? Number(q[1]) : null, unit: "hPa" };
      continue;
    }
    const a = token.match(/^A(\d{4}|\/{3,4})$/);
    if (a) {
      result.pressure = { value: /^\d+$/.test(a[1]) ? inchesHgToHpa(Number(a[1]) / 100) : null, unit: "hPa" };
      continue;
    }

    // Phenomene meteo (pluie, orage, brouillard...). Matcher STRICT : le token doit
    // etre entierement compose de codes connus, sinon on ignore (anti-corruption).
    const wx = token.match(new RegExp(`^(VC)?([+-])?((?:${WX})+)$`));
    if (wx) {
      const code = token;
      // « danger » reserve aux orages (TS) et a la pluie/bruine verglacante (FZRA/FZDZ).
      const severity = /TS/.test(code) || /FZ(RA|DZ)/.test(code) ? "danger" : "info";
      result.phenomena.push({ code, severity });
      continue;
    }

    // Tout le reste (corruption, groupes exotiques) : ignore silencieusement.
  }

  // 4. Finalisation des nuages.
  if (cloudAcc.vv !== null) {
    // Visibilite verticale presente (brouillard) : elle remplace les couches.
    result.verticalVisibility = cloudAcc.vv;
    result.clouds = [];
  } else if (cloudsSeen) {
    result.clouds = cloudAcc.clouds; // [] si CAVOK/CLR, sinon les couches lues.
  }
  // Sinon (aucune info nuageuse du tout) : clouds reste null (inconnu).

  // 5. Temperature ressentie : maintenant qu'on connait le vent.
  if (result.temperature && tempValue !== null) {
    result.temperature.feelsLike = computeFeelsLike(tempValue, result.temperature.humidity, result.wind?.speed ?? null);
  }

  return result;
}
