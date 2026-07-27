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

&#x20;   "wind": "Vent du sud-ouest, 15 km/h, rafales à 30",

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

## État d'avancement (dernière session : 26/07/2026)

Construction par étapes selon `PROMPT.md`. On s'arrête après CHAQUE étape et on
attend la validation explicite de Xavier avant la suivante. Les tests précèdent
toujours le code. À ce jour : 244 tests passent, `npm run type-check` exit 0.

Fait et validé :
- Étape 1 — `src/types.ts` (contrat d'API, source de vérité).
- Étape 2 — `corpus-brut.txt` téléchargé depuis VATSIM (7109 METAR, gitignored).
- Étape 3 — `tests/corpus.json` : 30 cas réels (25 robustesse + 5 nominaux).
- Étape 4 — `src/units.ts` + `tests/units.test.ts` : 37 tests passent.
- Étape 5 — `src/decode.ts` + `tests/decode.test.ts` : décodeur défensif
  (jamais d'exception, `null` partout où c'est illisible). Type de retour
  interne `DecodedMetar` (PAS le contrat public, assemblé depuis `types.ts`).
- `tsconfig.json` ajouté (micro-étape hors plan) : strict, `moduleResolution:
  "bundler"`, `noEmit`. Active `npm run type-check`.
- Étape 6 — `src/i18n/fr.ts` + `tests/i18n.test.ts` : `windText`,
  `visibilityText`, `cloudsText`, `phenomenaText`, `translateFr`. Fonctions
  pures, dépendantes de `types.ts` seul (un `en.ts` se glissera à côté).
- Étape 7 — `src/icon.ts` + `tests/icon.test.ts`, plus `headlineText` ajouté à
  `src/i18n/fr.ts`. `icon.ts` = sélecteur NEUTRE (`dominantCondition` → jeton
  `WeatherCondition`, puis `pickIcon(decoded, isDay)`), AUCUN français dedans.
  `headlineText(jeton)` en français dans `fr.ts` ; les deux partagent le même
  sélecteur donc icône et headline ne peuvent pas diverger. `headline` est
  désormais câblé dans `translateFr` (plus vide).
- Étape 8 — `src/geo.ts` + `tests/geo.test.ts` (16 tests) : `haversineKm`,
  `bearingDeg` (0..360), `solar` (calcul NOAA), `resolveTimezone`. Ajout déps :
  `tz-lookup` (choix de Xavier vs zéro-dép, pour un vrai nom IANA mondial) +
  `src/tz-lookup.d.ts` (déclaration maison, pas de types fournis). `geo.ts`
  renvoie des VALEURS (nombres, `Date` UTC), jamais de chaînes formatées : la
  conversion en heure locale murale (« 05:47 ») est reportée à l'assemblage
  (étape 10) via le fuseau. `solar` retourne `{ isDay, sunriseUtc, sunsetUtc }` ;
  `isDay` vient de l'élévation solaire réelle à l'instant UTC (donc SANS fuseau).
  Hautes latitudes gérées : jour/nuit polaire → `sunriseUtc`/`sunsetUtc = null`,
  `isDay` tranché par l'élévation. Validé contre almanach (Paris solstice
  03:47/19:57 UTC) et cercle arctique (URMM).

- Étape 9 — `src/awc.ts` + `tests/awc.test.ts` (40 tests) : source de PRODUCTION
  aviationweather.gov, `bbox=latMin,lonMin,latMax,lonMax&format=json`, sans clé.
  Découpage PUR / IMPUR : `splitBboxes`, `buildBboxUrl(s)`, `normalizeRows`,
  `selectNearest` sont
  pures ; `fetchNearest` est la seule I/O et reçoit `fetchImpl` + `nowMs` en
  paramètres (injection), donc AUCUN appel réseau dans `npm test`. Fixture =
  4 vraies lignes AWC capturées le 24/07/2026, inlinées dans le test, horloge
  figée. Retour = union discriminée `{found:true,...}` / `{found:false,reason}`
  avec `reason` ∈ `invalid_position | no_station | only_stale | network_error`
  (panne réseau, HTTP≠200, JSON illisible → donnée, jamais d'exception).
  `distanceKm`/`bearingDeg` NON arrondis (arrondi = présentation, étape 10).
  Type interne `AwcStation` (≠ `Station` du contrat).

- Étape 10 — `api/nearest.ts` + `tests/nearest.test.ts` (27 tests), plus ajout
  de `ApiErrorCode`/`ApiError` dans `src/types.ts`. TROIS fichiers, imposés par
  deux règles absolues : le contrat évolue dans `types.ts` en premier, puis le
  test, puis le code. Assemblage complet : awc → decode → geo → icon → i18n.
  Même séparation PUR / IMPUR qu'awc.ts : `parseQuery`, `cleanStationName`,
  `formatWallTime`, `localMiddayInstant`, `buildResponse`, `statusForReason`,
  `cacheKey` sont pures ; `handleNearest` reçoit `fetchImpl`, `nowMs` ET
  `cache` en paramètres ; le `handler` Vercel (défaut) ne contient aucune
  logique. `sun.isDay` est désormais BRANCHÉ sur `pickIcon` (la tâche ouverte
  de l'étape 8 est close). Vérifié en vrai le 26/07/2026 : Brumath (LFST,
  `clear_day`, 19:30 locales), Fidji (NFNA, `isDay:false`), Tromsø (lever
  01:15 / coucher 00:26), position invalide → 400.
  ATTENTION : relecture de Xavier encore à faire, l'étape n'est pas validée.

- Hors plan, choisi par Xavier le 26/07/2026 — RÉESSAI RÉSEAU dans `src/awc.ts`
  (+ tests). 2 tentatives par URL, 200 ms d'écart. Motivé par un incident réel
  du même jour et non par principe : le PREMIER appel d'un processus froid a
  échoué (502), l'essai suivant a réussi. Sur Vercel chaque invocation à froid
  est un premier appel. Vérifié par mutation dans les deux sens : supprimer le
  réessai fait tomber 9 tests, réessayer un 400 en fait tomber 1.

Prochaine étape (à décider avec Xavier) :
- PAS DE TIMEOUT sur les appels réseau, et c'est le point à traiter en premier
  avant une mise en ligne. `fetch` n'a aucune limite de temps ici : face à une
  source qui PEND (au lieu de refuser franchement), le réessai fait maintenant
  attendre DEUX fois plus longtemps qu'avant. Le réessai aide contre un refus
  rapide et aggrave la connexion suspendue. Complément attendu :
  `AbortSignal.timeout` par tentative — ce qui change le contrat de `FetchLike`
  (second paramètre `init`), d'où la décision séparée.
- `src/i18n/en.ts` n'existe pas : `lang=en` est accepté et servi EN FRANÇAIS.
- `tests/corpus.json` : les `expect` restent à compléter par Xavier (voir plus bas).
- Utile pour les essais manuels : le flux AWC ne contient pas
  toutes les stations attendues à tout instant (le 26/07/2026, Nadi NFFN était
  absente alors que NFNA était présente). Un `no_station` sur une zone habitée
  n'est donc pas forcément un bug de notre code.

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
- Décodeur (étape 5) : `=` coupe le bulletin ; `RMK`/`BECMG`/`TEMPO`/`INTER`/
  `NOSIG` arrêtent l'extraction ; nuages collés séparés (`OVC007FEW040CB`) ;
  `VV` en mètres SANS arrondi à la centaine ; `feelsLike` calculé ici (froid =
  refroidissement éolien, chaud = indice de chaleur, approximatif).
- Traduction (étape 6) : `headline` reporté à l'étape 7 (même priorité que
  l'icône). Nuages multiples → on décrit la couche la plus couvrante
  (OVC>BKN>SCT>FEW). Phénomènes composés → base + intensité en suffixe
  (`-TSRA` = « Orage avec pluie faible »), plusieurs phénomènes séparés par
  virgule. Vent : « du nord/sud/... », « d'est/d'ouest ». Visibilité sous
  1 km en mètres bruts (« 400 m »), 9999 et + = « Plus de 10 km ».
- Icône/headline (étape 7) : GR/GS/PL → `hail` ; pluie+neige (RASN) → `sleet` ;
  HZ (brume sèche) → `mist` ; IC (cristaux de glace) → sans icône (retombe sur
  les nuages) ; SS/DS (tempêtes) → `dust`. Suffixe jour/nuit UNIQUEMENT sur
  clear/few/partly_cloudy/showers (BKN=`cloudy`, OVC=`overcast`, pluie/neige
  neutres). `isDay=null` → variante jour par défaut. headline ciel clair =
  « Ciel dégagé », mélange = « Neige fondue ». Distinction clé : `clouds=[]`
  (dégagé connu) → clear ; `clouds=null` sans phénomène → unknown.
- AWC (étape 9), vérifié sur un vrai appel du 24/07/2026 : la réponse ne
  contient NI fuseau NI offset (champs : `icaoId, receiptTime, obsTime,
  reportTime, temp, dewp, wdir, wspd, altim, qcField, metarType, rawOb, lat,
  lon, elev, name`). `resolveTimezone` reste donc à notre charge. `obsTime`
  (epoch secondes) == `reportTime` sur les 16 lignes de l'échantillon ; on
  utilise `obsTime` (repli `reportTime`), JAMAIS le groupe `DDHHMMZ` du METAR
  qui n'a ni mois ni année. `name` AWC = « Buechel Arpt, RP, DE », passé tel
  quel : normalisation éventuelle = étape 10.
- Antiméridien (étape 9) : ARBITRAGE DE XAVIER (24/07/2026) = solution propre,
  donc DEUX requêtes de part et d'autre de la ligne de changement de date, pas
  le bornage. FAIT le 26/07/2026, la tâche n'est plus ouverte.
  `splitBboxes(lat, lon, marge)` renvoie UNE ou DEUX boîtes (`Bbox`), la
  PREMIÈRE étant toujours celle qui contient la position ; `buildBboxUrls` les
  met en URL ; `fetchNearest` les appelle EN PARALLÈLE et fusionne les lignes
  (simple concat : boîtes disjointes en longitude, donc aucun doublon possible)
  AVANT `selectNearest`. Le découpage est recalculé À CHAQUE marge et non une
  fois pour toutes : à 178° E la boîte serrée (±1,5°) ne coupe pas, l'élargie
  (±3°) coupe. La latitude reste bornée à ±90 (correct : au pôle il n'y a rien
  au-delà) ; la longitude ne l'est plus, car elle est circulaire.
  Vérifié : AWC ACCEPTE une bbox bornée à -180 (appel réel du 26/07/2026,
  `bbox=-22,-180,-14,-172` → HTTP 200 + stations de Tonga NFTF/NFTV) ; une bbox
  absurde → HTTP 400. En revanche le classement transfrontalier lui-même est
  prouvé sur FIXTURES seulement (station à -179,8 gagnant contre une à 178,2),
  pas sur un appel de production : aucune des positions réelles testées
  (Fidji, Kiribati, Samoa) n'avait sa station la plus proche de l'autre côté
  de la ligne. `haversineKm` et `bearingDeg` de geo.ts sont périodiques en Δλ
  (sin²(Δλ/2) et atan2), donc corrects à cheval sans modification ; un test
  d'awc.test.ts verrouille cette propriété pour l'avenir.
- Panne PARTIELLE (étape 9) : quand une seule des deux moitiés répond, on sert
  quand même ce qu'on a (la station la plus proche est peut-être justement là).
  Précédence en cas d'échec final : une moitié restée sans réponse l'emporte
  sur tout, donc `network_error` et JAMAIS `only_stale` ni `no_station` : on ne
  peut pas affirmer ce que contenait une zone qui n'a pas répondu. Panne
  TOTALE = court-circuit immédiat, pas d'élargissement inutile.
- HTTP 204 (correctif du 26/07/2026, HORS périmètre initial de l'étape 9,
  accepté par Xavier) : AWC répond 204 avec un corps de ZÉRO octet pour une
  zone sans station (vérifié en plein océan). Piège : `res.ok` vaut true sur un
  204, et `res.json()` sur un corps vide LÈVE — toute zone déserte était donc
  comptée comme `network_error`. D'où le test explicite `res.status === 204 →
  []`. Cas devenu courant avec le découpage, une moitié sur deux étant
  souvent de la haute mer.
- Tests d'awc (leçon du 26/07/2026) : le faux `fetch` à deux moitiés
  (`fakeFetchParUrl`) aiguille sur le SIGNE des longitudes de la bbox analysée,
  jamais sur un fragment de texte de l'URL. La version par fragment a fait
  passer quatre tests pour de mauvaises raisons (« 177.5 » se retrouve dans
  « -177.5 » et change selon la marge). Les branches critiques ont été
  vérifiées par MUTATION : forcer une seule boîte fait tomber les 5 tests
  d'antiméridien, désactiver le 204 en fait tomber 2.
- Fraîcheur (étape 9) : obs > 3 h écartée ; obs datée > 1 h dans le futur
  écartée aussi (station mal réglée, sinon elle gagnerait le tri).
- Étape 10, les QUATRE arbitrages de Xavier (26/07/2026) :
  (a) `isStale = ageMinutes > 90`. Seuil SOUPLE de présentation, à ne jamais
  confondre avec le seuil DUR de 3 h d'awc.ts qui, lui, écarte l'observation.
  90 et non 60 : beaucoup de stations ne publient qu'une fois par heure et
  seraient signalées « périmées » à tort la moitié du temps.
  (b) `ageMinutes` négatif RAMENÉ À 0, avec l'anomalie ajoutée à `warnings`.
  (c) `name` : nettoyage LÉGER. On retire par la FIN les segments qui
  ressemblent à des codes (1 à 3 caractères majuscules/chiffres, ou vides),
  puis les suffixes `Arpt|Airport|Intl|International|Ap`. Jamais de chaîne
  vide en sortie (repli sur l'étape précédente du nettoyage).
  (d) Échecs = code HTTP + `{ "error": code }` : 400 `invalid_position`,
  404 `no_station` et `only_stale`, 502 `network_error`. `ApiErrorCode` de
  `types.ts` double VOLONTAIREMENT `NotFoundReason` d'awc.ts (l'une est
  publique et engage le contrat, l'autre est interne). `switch` exhaustif
  avec `never` : un 5e motif dans awc.ts = erreur de compilation, pas un 500.
- Soleil et fuseau (étape 10) : DEUX appels à `solar`. `isDay` à l'instant
  EXACT de l'observation ; lever/coucher à MIDI LOCAL de la station, via
  `localMiddayInstant`. Raison : `solar` calcule le jour UTC de l'instant reçu
  (`minutesToUtc`, geo.ts), or à UTC+12/-11 le jour UTC n'est pas le jour
  local. HONNÊTETÉ SUR L'ENJEU, mesuré le 26/07/2026 : l'écart visible n'est
  que d'UNE minute (Anadyr 02:51 vs 02:52), car le lever bouge peu d'un jour à
  l'autre. La correction est juste et coûte trois lignes, mais elle n'est PAS
  prouvée par un test au niveau de la réponse (`sun.sunrise` ne porte qu'un
  « HH:MM ») : c'est le test unitaire de `localMiddayInstant` qui la verrouille.
  Recherche d'un cas de bascule au jour polaire (66-71° N, tout juillet) :
  infructueuse, abandonnée.
- Cache (étape 10) : 5 min, INJECTÉ en paramètre (jamais au niveau du module,
  sinon un test hériterait de la réponse du précédent ; l'unique Map de module
  vit dans le `handler` Vercel, hors tests). On met en cache la STATION
  RETENUE et non le corps : sinon `ageMinutes` serait figé et le client lirait
  « il y a 30 minutes » quatre minutes plus tard. Clé = position arrondie au
  centième de degré (~1 km), sans la langue. Un ÉCHEC n'est jamais mis en
  cache. Conséquence assumée : une entrée du cache ne repasse pas le filtre de
  fraîcheur, donc une obs de 2 h 56 peut être servie à 3 h 01 (débordement
  borné à 5 min sur un seuil de 3 h). En-tête HTTP : `s-maxage=300,
  stale-while-revalidate=60` sur les 200, `no-store` sur les échecs.
- Paramètres de requête (étape 10) : `lang`/`units` inconnus → valeur par
  défaut SANS échec (une faute de frappe ne doit pas priver de météo) ;
  position invalide → 400, rédhibitoire. `?lat=` vide n'est pas l'équateur :
  on exige une chaîne non vide ET un nombre fini.
- `bearingDeg` (étape 10) : `Math.round` PUIS `% 360`, jamais l'inverse.
  Un cap de 359,7° arrondirait sinon à 360, qui n'existe pas dans [0, 360[.
- Réessai réseau (26/07/2026) : le cœur n'est PAS la boucle mais le TRI entre
  panne passagère et refus définitif, dans `tenterUnAppel`.
  RÉESSAYÉ : exception réseau/DNS/TLS, HTTP 5xx, HTTP 429, corps JSON illisible
  (réponse tronquée).
  PAS RÉESSAYÉ : HTTP 400/403 (c'est NOTRE requête qui est fautive, insister
  double la charge sans aucune chance d'aboutir) ; HTTP 204 (zone déserte, pas
  une panne) — cette exclusion-là est devenue critique avec le découpage de
  l'antiméridien, où une moitié sur deux est de l'océan vide : sans elle, on
  doublerait la charge sur la moitié des requêtes du Pacifique.
  RÉSERVE ASSUMÉE sur le 429 : réessayer une limitation de débit après 200 ms
  est le seul cas où l'on peut EMPIRER les choses (la source demande justement
  qu'on ralentisse). Acceptable à 2 tentatives ; à revoir si le trafic monte.
- Réglages du réessai : `MAX_ATTEMPTS = 2`, `RETRY_DELAY_MS = 200`, tous deux
  surchargeables par `retryDelayMs` / `maxAttempts` des options (même patron
  d'injection que `fetchImpl` et `nowMs`). Les tests passent TOUJOURS
  `retryDelayMs: 0` : sans ça la suite dormirait pour de vrai (447 ms → 763 ms
  constaté avant l'injection). `maxAttempts: 1` coupe le réessai sans toucher
  au code, et un test fige ce comportement. `handleNearest` (api/nearest.ts)
  relaie `retryDelayMs`.
- Coût maximal du réessai, mesuré par les tests (ne pas s'inquiéter en lisant
  les comptes d'URL) : source totalement à terre = 4 requêtes (2 boîtes x 2
  tentatives, court-circuit AVANT l'élargissement) ; pire cas réel = 6 (panne
  partielle à l'antiméridien sur les deux tours). Jamais 8. D'où les attendus
  3 / 6 / 4 dans les tests d'antiméridien, qui valaient 2 / 4 / 2 avant.

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

