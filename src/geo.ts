// src/geo.ts
// Géographie et astronomie de la station. Quatre responsabilités, toutes PURES
// (aucun état, aucune I/O) sauf resolveTimezone qui délègue à tz-lookup :
//   1. haversineKm  : distance orthodromique entre deux points du globe.
//   2. bearingDeg   : cap initial (azimut) du point 1 vers le point 2.
//   3. solar        : lever/coucher du soleil (en UTC) + jour/nuit à un instant.
//   4. resolveTimezone : nom de fuseau IANA de la station depuis ses coordonnées.
//
// Choix d'architecture (rappel du contrat) : ce module renvoie des VALEURS
// (nombres, Date UTC), jamais des chaînes formatées. La conversion en heure
// locale murale ("05:47") est un travail de PRÉSENTATION, fait à l'assemblage
// (étape 10) à partir du fuseau. On respecte ainsi « valeurs séparées des textes ».

import tzlookup from "tz-lookup";

// Rayon moyen de la Terre en kilomètres (modèle sphérique, suffisant ici :
// l'erreur due à l'aplatissement terrestre reste sous 0,3 %).
const EARTH_RADIUS_KM = 6371;

// Conversions degrés <-> radians. Les fonctions trigonométriques de JS
// travaillent en radians ; nos entrées/sorties sont en degrés.
const toRad = (deg: number): number => (deg * Math.PI) / 180;
const toDeg = (rad: number): number => (rad * 180) / Math.PI;

// ---------- 1. Distance haversine ----------
// Distance « à vol d'oiseau » le long de la sphère. Formule de la haversine,
// numériquement stable même pour de très petites distances.
export function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  // asin(sqrt(a)) est le demi-angle central ; on le multiplie par 2R.
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

// ---------- 2. Cap (azimut initial) ----------
// Cap à suivre au départ du point 1 pour rejoindre le point 2, en degrés
// depuis le nord (0 = nord, 90 = est, 180 = sud, 270 = ouest). Toujours [0, 360[.
export function bearingDeg(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  // atan2 renvoie ]-180, 180] ; on remet dans [0, 360[ par +360 puis modulo.
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// ---------- 3. Soleil : lever, coucher, jour/nuit ----------

// Résultat du calcul solaire. Les instants sont en UTC (Date), null quand le
// soleil ne se lève ou ne se couche pas ce jour-là (jour ou nuit polaire).
export interface SolarResult {
  isDay: boolean; // le soleil est-il au-dessus de l'horizon à l'instant donné ?
  sunriseUtc: Date | null; // instant du lever, UTC ; null si pas de lever ce jour
  sunsetUtc: Date | null; // instant du coucher, UTC ; null si pas de coucher ce jour
}

// Angle standard du centre du soleil au lever/coucher : -0,833° sous l'horizon
// (0,833° = demi-diamètre solaire + réfraction atmosphérique). C'est la
// convention officielle « sunrise/sunset ».
const SUNRISE_ANGLE_DEG = 90.833;

// Calcul solaire NOAA. On dérive la position du soleil (déclinaison, équation
// du temps) à partir de la date, puis :
//   - lever/coucher : angle horaire pour lequel le soleil atteint l'horizon ;
//   - isDay : élévation réelle du soleil à l'instant précis de l'observation.
// Les hautes latitudes sont gérées : si le soleil ne franchit jamais l'horizon
// ce jour-là, sunrise/sunset valent null et isDay est déterminé par l'élévation.
export function solar(lat: number, lon: number, instant: Date): SolarResult {
  // Jour julien puis siècle julien depuis J2000.0, base de tous les calculs.
  const jd = instant.getTime() / 86_400_000 + 2_440_587.5;
  const T = (jd - 2_451_545) / 36_525;

  // Longitude moyenne et anomalie moyenne du soleil (degrés).
  const L0 = (280.46646 + T * (36000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  // Excentricité de l'orbite terrestre.
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  // Équation du centre : correction de l'orbite elliptique.
  const C =
    Math.sin(toRad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(toRad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(toRad(3 * M)) * 0.000289;
  const trueLong = L0 + C; // longitude vraie du soleil
  // Longitude apparente (corrigée de la nutation/aberration).
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(toRad(omega));

  // Obliquité de l'écliptique (inclinaison de l'axe terrestre), corrigée.
  const eps0 =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(toRad(omega));

  // Déclinaison du soleil : sa « latitude » sur la sphère céleste.
  const decl = toDeg(Math.asin(Math.sin(toRad(eps)) * Math.sin(toRad(lambda))));

  // Équation du temps (minutes) : écart entre midi solaire vrai et midi moyen.
  const y = Math.tan(toRad(eps / 2)) ** 2;
  const eqTime =
    4 *
    toDeg(
      y * Math.sin(2 * toRad(L0)) -
        2 * e * Math.sin(toRad(M)) +
        4 * e * y * Math.sin(toRad(M)) * Math.cos(2 * toRad(L0)) -
        0.5 * y * y * Math.sin(4 * toRad(L0)) -
        1.25 * e * e * Math.sin(2 * toRad(M)),
    );

  // Midi solaire local, exprimé en minutes UTC dans la journée.
  // 720 = midi ; -4*lon décale selon la longitude ; -eqTime corrige l'orbite.
  const solarNoonMin = 720 - 4 * lon - eqTime;

  // Angle horaire du soleil au moment où il touche l'horizon.
  // cosH hors de [-1, 1] => le soleil ne franchit jamais l'horizon ce jour-là.
  const cosH =
    (Math.cos(toRad(SUNRISE_ANGLE_DEG)) -
      Math.sin(toRad(lat)) * Math.sin(toRad(decl))) /
    (Math.cos(toRad(lat)) * Math.cos(toRad(decl)));

  let sunriseUtc: Date | null = null;
  let sunsetUtc: Date | null = null;
  if (cosH >= -1 && cosH <= 1) {
    const haMin = 4 * toDeg(Math.acos(cosH)); // demi-durée du jour, en minutes
    sunriseUtc = minutesToUtc(instant, solarNoonMin - haMin);
    sunsetUtc = minutesToUtc(instant, solarNoonMin + haMin);
  }

  // isDay : élévation réelle du soleil à l'instant EXACT de l'observation.
  // On la calcule toujours (elle tranche aussi jour/nuit polaire, où il n'y a
  // ni lever ni coucher mais où le soleil reste haut ou reste bas).
  const minsUtc =
    instant.getUTCHours() * 60 +
    instant.getUTCMinutes() +
    instant.getUTCSeconds() / 60;
  // Angle horaire réel : 0 au midi solaire, ±180° à minuit solaire.
  const trueSolarMin = (minsUtc + eqTime + 4 * lon + 1440) % 1440;
  const hourAngle = trueSolarMin / 4 - 180;
  const elevation = toDeg(
    Math.asin(
      Math.sin(toRad(lat)) * Math.sin(toRad(decl)) +
        Math.cos(toRad(lat)) * Math.cos(toRad(decl)) * Math.cos(toRad(hourAngle)),
    ),
  );
  // « Jour » = centre du soleil au-dessus de l'horizon corrigé (-0,833°),
  // cohérent avec la définition utilisée pour le lever/coucher.
  const isDay = elevation > -(SUNRISE_ANGLE_DEG - 90);

  return { isDay, sunriseUtc, sunsetUtc };
}

// Construit un instant UTC à partir de la DATE de `instant` (année/mois/jour UTC)
// et d'un nombre de minutes écoulées depuis 00:00 UTC ce jour-là. Les minutes
// peuvent déborder (négatives ou > 1440) : Date le normalise correctement.
function minutesToUtc(instant: Date, minutesFromMidnight: number): Date {
  const midnight = Date.UTC(
    instant.getUTCFullYear(),
    instant.getUTCMonth(),
    instant.getUTCDate(),
  );
  return new Date(midnight + minutesFromMidnight * 60_000);
}

// ---------- 4. Fuseau horaire depuis les coordonnées ----------
// Délègue à tz-lookup (jeu de données IANA embarqué). tz-lookup lève si les
// coordonnées sont hors bornes ; on rattrape et on renvoie null, car le contrat
// autorise timezone = null (station sans position exploitable).
export function resolveTimezone(lat: number, lon: number): string | null {
  try {
    return tzlookup(lat, lon);
  } catch {
    return null;
  }
}
