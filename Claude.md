\# METAR Proche



Backend TypeScript sur Vercel qui décode des METAR pour le grand public.

Couverture mondiale. Le client ne fait que du rendu : tout le décodage

et toute la traduction sont ici.



\## Règles absolues



\- `src/types.ts` est la source de vérité. Toute évolution du contrat

&#x20; d'API se fait là en premier, jamais dans un fichier consommateur.

\- Les tests précèdent le code. Aucun décodeur n'est écrit avant

&#x20; l'existence du cas de test correspondant dans `tests/corpus.json`.

\- Les sorties sont métriques par défaut. Les unités sources varient :

&#x20; SM et inHg en Amérique du Nord, MPS en Russie et en Chine, kt ailleurs.

\- L'heure affichée est l'heure locale de la STATION, jamais celle du client.

\- Le calcul jour/nuit se fait sur les coordonnées de la station.

\- Maximum 3 itérations sur un test qui échoue, puis arrêt et rapport.

\- Un seul fichier par demande sauf instruction contraire explicite.



\## Contexte



Utilisateur débutant en TypeScript. Expliquer chaque décision.

Ne jamais produire un bloc de code sans le commenter.



\## Contrat d'API



`GET /api/nearest?lat=48.73\&lon=7.71\&lang=fr\&units=metric`



```json

{

&#x20; "station": {

&#x20;   "icao": "LFST",

&#x20;   "name": "Strasbourg-Entzheim",

&#x20;   "distanceKm": 19.4,

&#x20;   "bearingDeg": 210,

&#x20;   "isAuto": false,

&#x20;   "timezone": "Europe/Paris"

&#x20; },

&#x20; "observedAt": "2026-07-23T12:00:00Z",

&#x20; "observedLocal": "14:00",

&#x20; "ageMinutes": 23,

&#x20; "isStale": false,

&#x20; "icon": "partly\_cloudy\_day",

&#x20; "temperature": { "value": 24, "unit": "C", "feelsLike": 25,

&#x20;                  "dewPoint": 14, "humidity": 54 },

&#x20; "wind": { "speed": 15, "unit": "kmh", "gust": 30, "directionDeg": 240,

&#x20;           "isVariable": false },

&#x20; "visibility": { "value": 9999, "unit": "m", "isCavok": false },

&#x20; "clouds": \[{ "coverage": "SCT", "altitude": 900, "unit": "m" }],

&#x20; "phenomena": \[{ "code": "RA", "severity": "info" }],

&#x20; "pressure": { "value": 1018, "unit": "hPa" },

&#x20; "sun": { "isDay": true, "sunrise": "05:47", "sunset": "21:22" },

&#x20; "text": {

&#x20;   "headline": "Éclaircies",

&#x20;   "wind": "Vent de sud-ouest, 15 km/h, rafales à 30",

&#x20;   "visibility": "Plus de 10 km",

&#x20;   "clouds": "Éclaircies vers 900 m",

&#x20;   "phenomena": "Pluie faible"

&#x20; },

&#x20; "raw": "METAR LFST 231200Z 24008KT 9999 SCT030 24/14 Q1018 NOSIG"

}

```



Règles du contrat :

\- Valeurs numériques et textes générés restent séparés. Le client peut

&#x20; recomposer un affichage impérial sans nouvel appel réseau.

\- `icon` est une union fermée de littéraux, jamais un `string`.

\- `severity` vaut `info`, `warning` ou `danger`. `danger` est réservé

&#x20; aux orages et à la pluie verglaçante.

\- `null` autorisé sur tout champ absent du METAR source.



\## Icônes



Jour/nuit uniquement là où c'est pertinent :



```

clear\_day, clear\_night, few\_day, few\_night,

partly\_cloudy\_day, partly\_cloudy\_night,

cloudy, overcast, fog, mist,

drizzle, rain\_light, rain, rain\_heavy,

showers\_day, showers\_night,

snow, sleet, hail, freezing\_rain,

thunderstorm, dust, smoke, unknown

```



Ordre de priorité décroissant pour le choix de l'icône :

orage → pluie verglaçante → grêle → neige → pluie → brouillard →

brume → couverture nuageuse.



\## Source de données



\- Production : aviationweather.gov (bbox géographique, coordonnées incluses)

\- Corpus de test uniquement : metar.vatsim.net?id=all — jamais en production



\## Commandes



```

npm test        vitest

npx tsc --noEmit  vérification des types

```

## État d'avancement (dernière session : 23/07/2026)

Construction par étapes selon `PROMPT.md`. On s'arrête après CHAQUE étape et on
attend la validation explicite de Xavier avant la suivante. Les tests précèdent
toujours le code.

Fait et validé :
- Étape 1 — `src/types.ts` (contrat d'API, source de vérité).
- Étape 2 — `corpus-brut.txt` téléchargé depuis VATSIM (7109 METAR, gitignored).
- Étape 3 — `tests/corpus.json` : 30 cas réels (25 robustesse + 5 nominaux).
- Étape 4 — `src/units.ts` + `tests/units.test.ts` : 37 tests passent.

Prochaine étape :
- Étape 5 — `src/decode.ts` + tests. C'est là que `tests/corpus.json` sera
  branché et comparé aux `expect`. Décodeur défensif : jamais d'exception,
  `null` partout où c'est illisible.

Décisions déjà tranchées en session (ne pas les redécider) :
- Nullabilité à deux niveaux (bloc entier ET champs internes). Sentinelles NON
  nulles : `icon="unknown"`, `phenomena=[]`, `warnings=[]`, `text=""`.
- Unités v1 = métrique seulement. Chaque champ `unit` est un littéral unique
  (`"C"`, `"kmh"`, `"m"`, `"hPa"`). Impérial (°F...) = V2. Le paramètre `units`
  est déjà typé `"metric" | "imperial"`.
- `lang = "fr" | "en"`.
- Humidité relative : formule Magnus August-Roche-Magnus, coefficients
  17,625 / 243,04, arrondie au % entier.
- Conversions d'unités : arrondi à l'entier partout (vitesse, visibilité en m,
  pression). Altitude nuages : pieds → m arrondie à la centaine de mètres.
- Couches nuageuses situées dans les groupes de tendance TEMPO / INTER : ignorées.

Sur les `expect` du corpus :
- Règle stricte : Xavier remplit les valeurs attendues (anti « parser contre
  lui-même »). En session, Claude n'a rempli que les parties objectives
  (température, point de rosée, humidité, nuages), validées par Xavier. Le reste
  (`wind`, `visibility`, `pressure`, `icon`, `text`, `phenomena`, `warnings`,
  horodatages, `sun`, `feelsLike`) reste à compléter.
- Cas laissés à Xavier : aberrant (rosée > temp), VV (`verticalVisibility`),
  ligne corrompue, NIL, TAF mélangé, panne totale.
- Exception convenue : pour les maths pures (`units`), Claude écrit les valeurs
  attendues et les vérifie par programme, Xavier valide.

