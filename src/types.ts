// src/types.ts
// Contrat d'API du décodeur METAR. SOURCE DE VÉRITÉ du projet :
// tous les autres modules importent leurs types d'ici.
// Règle d'or : quasiment tout champ peut valoir null (station en panne,
// groupe METAR illisible). Le décodeur ne lève jamais d'exception.

// ---------- 1. Unions de littéraux fermées ----------

export type Lang = "fr" | "en";
export type UnitSystem = "metric" | "imperial"; // "imperial" réservé V2
export type Severity = "info" | "warning" | "danger"; // "danger" = orage / pluie verglaçante
export type CloudCoverage = "FEW" | "SCT" | "BKN" | "OVC";

export type WeatherIcon =
  | "clear_day" | "clear_night"
  | "few_day" | "few_night"
  | "partly_cloudy_day" | "partly_cloudy_night"
  | "cloudy" | "overcast"
  | "fog" | "mist"
  | "drizzle" | "rain_light" | "rain" | "rain_heavy"
  | "showers_day" | "showers_night"
  | "snow" | "sleet" | "hail"
  | "freezing_rain" | "thunderstorm"
  | "dust" | "smoke"
  | "unknown"; // valeur de repli : icon n'est donc jamais null

// ---------- 2. Unités (v1 : metric uniquement) ----------
export type TempUnit = "C";
export type SpeedUnit = "kmh";
export type VisibilityUnit = "m";
export type AltitudeUnit = "m"; // altitude nuages, convertie en mètres
export type PressureUnit = "hPa";

// ---------- 3. Requête : GET /api/nearest?lat=&lon=&lang=&units= ----------
export interface NearestQuery {
  lat: number;
  lon: number;
  lang: Lang;
  units: UnitSystem;
}

// ---------- 4. Sous-objets de la réponse ----------
export interface Station {
  icao: string | null;
  name: string | null;
  distanceKm: number | null;
  bearingDeg: number | null;
  isAuto: boolean | null;
  timezone: string | null; // fuseau de la station, ex. "Europe/Paris"
}

export interface Temperature {
  value: number | null;
  unit: TempUnit;
  feelsLike: number | null;
  dewPoint: number | null;
  humidity: number | null; // % ; plafonné à 100 si dewPoint > value (+ warning)
}

export interface Wind {
  speed: number | null;
  unit: SpeedUnit;
  gust: number | null;
  directionDeg: number | null;
  isVariable: boolean; // VRB
  isCalm: boolean; // 00000KT
}

export interface Visibility {
  value: number | null;
  unit: VisibilityUnit;
  isCavok: boolean;
}

export interface Cloud {
  coverage: CloudCoverage | null; // null si couche non reconnue
  altitude: number | null;
  unit: AltitudeUnit;
}

export interface Phenomenon {
  code: string; // ex. "RA", "TSRA", "FZRA"
  severity: Severity;
}

export interface Pressure {
  value: number | null;
  unit: PressureUnit;
}

export interface Sun {
  isDay: boolean | null;
  sunrise: string | null; // "05:47"
  sunset: string | null; // "21:22"
}

export interface WeatherText {
  headline: string;
  wind: string;
  visibility: string;
  clouds: string;
  phenomena: string;
}

// ---------- 5. Réponse d'ERREUR ----------
// Quand aucune station ne peut être servie, l'API ne renvoie PAS un
// MetarResponse vide : elle renvoie un code HTTP parlant et cet objet.
// Deux raisons : le client distingue les cas sans inspecter dix champs à null,
// et un cache HTTP ou une supervision voient réellement passer la panne.
//
// Cette union double volontairement `NotFoundReason` de `awc.ts` : celle-là est
// INTERNE au module de collecte, celle-ci est PUBLIQUE et engage le contrat.
// Les garder distinctes permet de refondre awc.ts sans casser les clients.
export type ApiErrorCode =
  | "invalid_position" // lat/lon absents, non numériques ou hors bornes -> HTTP 400
  | "no_station" // aucune station dans la zone, même élargie -> HTTP 404
  | "only_stale" // des stations, mais aucune observation de moins de 3 h -> HTTP 404
  | "network_error"; // source de données injoignable ou illisible -> HTTP 502

export interface ApiError {
  error: ApiErrorCode;
}

// ---------- 6. Réponse racine ----------
export interface MetarResponse {
  station: Station | null;
  observedAt: string | null; // ISO UTC
  observedLocal: string | null; // "14:00" heure station
  ageMinutes: number | null;
  isStale: boolean | null;
  icon: WeatherIcon; // jamais null ("unknown" en repli)
  temperature: Temperature | null;
  wind: Wind | null;
  visibility: Visibility | null;
  clouds: Cloud[] | null;
  verticalVisibility: number | null; // VV001 (brouillard), en mètres
  phenomena: Phenomenon[]; // [] si aucun, jamais null
  pressure: Pressure | null;
  sun: Sun | null;
  text: WeatherText; // toujours présent, "" par défaut
  raw: string | null; // METAR brut d'origine
  warnings: string[]; // [] si aucune anomalie, jamais null
}
