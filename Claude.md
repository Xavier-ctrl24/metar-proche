\# METAR Proche



Backend TypeScript sur Vercel qui décode des METAR pour le grand public.

Couverture mondiale. Le client ne fait que du rendu : tout le décodage

et toute la traduction sont ici.



## Règles absolues

Ces règles-là ne se négocient pas et ne se redécident pas en session.

- `src/types.ts` est la source de vérité. Toute évolution du contrat d'API se
  fait là en premier, jamais dans un fichier consommateur.
- Les tests précèdent le code. Aucun décodeur n'est écrit avant l'existence du
  cas de test correspondant.
- ANTI « PARSER CONTRE LUI-MÊME » : Claude ne fabrique JAMAIS une valeur de
  référence ni une formulation destinée à l'utilisateur final. Les `expect` de
  `tests/corpus.json` et les phrases des fichiers `src/i18n/*` sont écrits par
  Xavier. Claude peut proposer, jamais entériner. Une valeur attendue produite
  par le code qu'elle est censée vérifier ne prouve rien.
  Deux exceptions, déjà convenues : les mathématiques pures (`src/units.ts`),
  où Claude calcule les attendus et les vérifie par programme ; et les
  propriétés STRUCTURELLES (une chaîne vide, un séparateur décimal, une place
  d'intensité, la parité entre deux langues), qui ne dépendent d'aucun choix de
  vocabulaire. Tout ce qui reste en attente de validation est signalé.
- Les sorties sont métriques par défaut. Les unités sources varient : SM et
  inHg en Amérique du Nord, MPS en Russie et en Chine, kt ailleurs.
- L'heure affichée est l'heure locale de la STATION, jamais celle du client.
- Le calcul jour/nuit se fait sur les coordonnées de la station.
- Ne jamais produire un bloc de code sans le commenter.

## Mode de travail

Xavier a demandé le 27/07/2026 une AUTONOMIE LARGE. Ce qui suit remplace le
fonctionnement par étapes validées une à une.

- Une demande se mène de bout en bout, sans s'arrêter pour faire valider. Autant
  de fichiers que la demande en exige, y compris les tests, le câblage et le
  journal de décisions. Plus de limite d'un fichier par demande.
- Les décisions de conception COURANTES se tranchent seules : découpage des
  modules, nommage, structure des tests, valeurs de réglage, ordre des travaux.
  On documente le pourquoi, on ne demande pas l'autorisation.
- On interrompt Xavier dans trois cas seulement : un choix qui ENGAGE LE CONTRAT
  d'API (`src/types.ts`), une action irréversible ou tournée vers l'extérieur
  (pousser, déployer, supprimer), et une valeur de référence ou une formulation
  qui relève de la règle anti « parser contre lui-même ».
- Sur un test qui résiste : trois tentatives, puis on change d'approche au lieu
  de s'acharner. On ne s'arrête pas pour autant, et on ne désactive JAMAIS un
  test pour faire passer la suite. Si le blocage tient, on finit tout le reste
  et on rapporte précisément ce qui coince.
- GIT : Claude commite lui-même, sur une branche de travail, dès que
  `npm test` et `npm run type-check` passent tous les deux. Jamais de `push`,
  jamais de commit sur `main` sans demande explicite.
- Ce qu'on ne troque PAS contre de la vitesse : les tests avant le code, la
  vérification par MUTATION des branches critiques (casser le code doit faire
  tomber un test précis), la mesure avant de figer une constante, et le rapport
  honnête (un échec se dit, une étape sautée se dit, une valeur non validée se
  signale).
- Le rapport de fin de travail dit ce qui a été fait, ce qui a été tranché seul
  et pourquoi, et ce qui reste en attente de Xavier. Il n'énumère pas les pistes
  écartées.

## Contexte

Xavier est débutant en TypeScript : les décisions s'expliquent, et les
commentaires du code portent le journal de conception (c'est la mémoire du
projet d'une session à l'autre). L'autonomie porte sur le fait de ne plus
demander la permission, jamais sur le fait d'expliquer moins.


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

Construction par étapes selon `PROMPT.md`. L'arrêt-validation après chaque étape
a été LEVÉ le 27/07/2026 (voir « Mode de travail ») : les étapes s'enchaînent
désormais sans attendre. Les tests précèdent toujours le code.
À ce jour : 298 tests passent, `npm run type-check` exit 0.

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

- Hors plan, 27/07/2026 — DÉLAI D'ATTENTE dans `src/awc.ts` (+ tests). FAIT :
  `AbortSignal.timeout` par tentative, `TIMEOUT_MS = 8000`, option `timeoutMs`
  (0 = désactivé). `FetchLike` prend un second paramètre `init` OPTIONNEL, donc
  les faux `fetch` existants et `api/nearest.ts` compilent sans retouche.
  250 tests passent, `npm run type-check` exit 0.

- Étape 10 VALIDÉE par Xavier le 27/07/2026 (relecture faite).

- Hors plan, 27/07/2026 — TRADUCTION ANGLAISE. `src/i18n/en.ts` +
  `tests/i18n.en.test.ts` (40 tests), plus le CÂBLAGE dans `api/nearest.ts` et
  5 tests de langue dans `tests/nearest.test.ts`. `src/types.ts` NON touché :
  `Lang` valait déjà `"fr" | "en"`. `lang=en` n'est donc plus un mensonge du
  contrat. 295 tests passent, `npm run type-check` exit 0.

Prochaine étape (à décider avec Xavier) :
- VOCABULAIRE ANGLAIS À VALIDER par Xavier. C'est la seule vraie dette de
  cette session, et le 27/07/2026 Xavier a explicitement MAINTENU la règle qui
  la rend anormale : les formulations restent à sa main. Ce qui est dans
  `en.ts` est donc une PROPOSITION en attente, pas un acquis, et c'est le seul
  endroit du projet dans cet état. La règle anti « parser contre lui-même » veut que Xavier
  formule les phrases (c'est ainsi que le français a été fait à l'étape 6) ;
  pour l'anglais, Claude les a proposées faute de mieux. Les tests le disent en
  tête de fichier et vérifient donc surtout ce qui est OBJECTIF (séparateur
  décimal, place de l'intensité, sentinelles, parité), mais les mots eux-mêmes
  n'engagent que Claude. À relire en priorité : « No wind », « Partly cloudy »
  (SCT), « Mostly cloudy » (BKN), « A few clouds » (FEW), « Clear sky ».
- Pas de BUDGET GLOBAL de temps, seulement un plafond PAR TENTATIVE. Deux cas
  peuvent donc encore dépasser 10 s : panne PARTIELLE à l'antiméridien sur les
  deux tours (2 x 8 s), et un 5xx qui arrive juste avant l'expiration puis un
  blocage (~4 x 8 s). Rares tous les deux. Un budget global lèverait la tension
  entre « plafond assez large pour un démarrage à froid » et « total assez court
  pour Vercel », mais c'est une machinerie d'un autre ordre : décision séparée.
  Si on la prend, NE PAS réutiliser `nowMs` (horloge d'observation, figée en
  test) : le temps écoulé exige sa propre source. À défaut, régler `maxDuration`
  dans vercel.json, ce qui est une ligne.
- `timeoutMs` n'est PAS relayé par `handleNearest` (`api/nearest.ts`), à la
  différence de `retryDelayMs`. Sans conséquence : la valeur par défaut
  s'applique. À ajouter le jour où un test de l'étape 10 en aura besoin.
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
- Délai d'attente (27/07/2026), L'ARBITRAGE CENTRAL : un délai dépassé n'est
  JAMAIS réessayé, contrairement à un ECONNRESET. Raisons opposées à celles du
  400 : la requête n'est pas fautive, c'est le temps qui manque, et réessayer
  une connexion suspendue double mécaniquement l'attente, donc aggrave le mal
  que le délai vient soigner. D'où un 3e marqueur `"delai_depasse"` dans
  `Tentative` (même sortie `network_error` que `"fatal"`, mais ce ne sont pas
  les mêmes faits, et les commentaires de ce dépôt portent le journal).
  PROUVÉ, pas supposé : sur un processus froid réellement en panne (mesure du
  27/07/2026, sans plafond), les DEUX tentatives ont échoué en 20,6 s au total,
  soit ~10 s chacune (délai de connexion interne d'undici). Réessayer un blocage
  n'a donc rien sauvé et a coûté le double. Avec le plafond : 4 s et un échec
  propre, au lieu de 20,6 s et le même échec.
- Détection du délai : on interroge `signal.aborted`, JAMAIS le nom ni le
  message de l'erreur (`AbortError`, `TimeoutError`... varient selon
  l'environnement). Le signal couvre aussi la lecture d'un corps interrompue en
  cours de route, pas seulement l'attente de l'en-tête.
- Valeur de 8 s, et le PIÈGE évité de justesse. Premier choix : 4 s, calculé sur
  le seul budget Vercel. Mesure faite ENSUITE (12 processus froids, un appel
  réel chacun, sans plafond, depuis Brumath) : 165, 185, 321, 352, 369, 433,
  628, 736, 1219, 1945, 5295, 6825 ms, TOUS réussis. À chaud, 26 à 466 ms sur
  10 appels. La latence à froid ne se range donc PAS en deux paquets nets
  (rapide / bloqué), elle s'étale : un plafond à 4 s aurait coupé 2 appels sur
  12 qui allaient aboutir. Leçon générale : un délai trop zélé fabrique les
  erreurs qu'il prétend éviter, et seule la mesure le dit.
  8 s couvre le pire démarrage à froid observé (6825 ms) tout en ramenant le
  blocage réel de 20,6 s à un échec propre. Budget : panne totale = court-circuit
  au premier tour = 8 s, et c'est le cas de ~99 % des positions (une seule
  boîte). 16 s exige une panne PARTIELLE, donc l'antiméridien. Au-delà des 10 s
  par défaut de Vercel, régler `maxDuration` dans vercel.json.
  RÉSERVE : mesuré depuis une ligne domestique française vers un service
  américain. Vercel devrait être meilleur. Si des `network_error` inexpliqués
  apparaissent en production, c'est le premier réglage à remonter.
- `timeoutMs: 0` n'est pas de la configuration morte : c'est ce qui a permis de
  MESURER la latence nue et le blocage de 20,6 s. Ne pas le supprimer.
- Piège vérifié par MUTATION (27/07/2026) : le `fetch` natif de `fetchNearest`
  doit RELAYER `init`. Écrire `(url) => fetch(url)` laisse les 250 tests au vert
  (chacun injecte son propre `fetchImpl`) pendant que le délai est purement
  décoratif en production. Un test remplace donc le `fetch` GLOBAL (`vi.stubGlobal`)
  pour verrouiller cette ligne-là. Mutations passées : supprimer la transmission
  du signal fait tomber 4 tests (dont 2 qui pendent 5 s avant que vitest ne les
  tue, ce qui EST la panne de production) ; classer le délai comme réessayable
  en fait tomber 2.
- Coût maximal du réessai, mesuré par les tests (ne pas s'inquiéter en lisant
  les comptes d'URL) : source totalement à terre = 4 requêtes (2 boîtes x 2
  tentatives, court-circuit AVANT l'élargissement) ; pire cas réel = 6 (panne
  partielle à l'antiméridien sur les deux tours). Jamais 8. D'où les attendus
  3 / 6 / 4 dans les tests d'antiméridien, qui valaient 2 / 4 / 2 avant.

- Anglais (27/07/2026), les décisions de structure. COPIE STRUCTURÉE de fr.ts
  et non factorisation : les deux langues ne partagent pas leur grammaire (le
  français accorde en genre et en nombre et élide « d'ouest », l'anglais ne
  fait ni l'un ni l'autre), une fonction commune aurait dû modéliser les deux
  grammaires pour deux langues. Coût réel de la duplication : quatre tables de
  mots. `fr.ts` n'a PAS été retouché (244 tests en dépendaient).
- Trois écarts qu'un portage ligne à ligne aurait ratés :
  (a) SÉPARATEUR DÉCIMAL. `fr.ts` finit par `.replace(".", ",")` pour écrire
  « 2,5 km ». Recopié tel quel, l'anglais aurait dit « 2,5 km ».
  (b) PLACE DE L'INTENSITÉ. Suffixe en français (« Pluie faible »), préfixe en
  anglais (« Light rain »)... mais pas toujours devant le PREMIER mot : dans
  `-TSRA` c'est la pluie qui est faible, pas l'orage. Préfixer bêtement donnait
  « Light thunderstorm with rain », qui affirme autre chose que le METAR. D'où
  un repère d'insertion `{i}` dans chaque libellé : `"thunderstorm with {i}rain"`
  → « Thunderstorm with light rain ». `VC` reste un SUFFIXE dans les deux langues.
  PIÈGE DANS LE PIÈGE, trouvé en relecture : `TS` SEUL n'a pas de précipitation
  associée, donc l'intensité y qualifie l'orage et repasse devant. Le libellé
  composé et le libellé simple n'obéissent pas à la même règle de place. Écrit
  d'abord `"thunderstorm{i}"`, ce qui rendait « Thunderstormlight ». Corrigé en
  `"{i}thunderstorm"` (« Light thunderstorm »), avec `-TS`, `+TS` et `VCTS`
  ajoutés au tableau de cas. Aucun test ne le voyait : le tableau ne contenait
  que `TS` (sans intensité) et `-TSRA` (composé), et la parité ne compare que
  les VIDES, or « Thunderstormlight » n'est pas vide.
  (c) L'élision `du`/`d'` de `ventDe` n'est pas traduite, elle DISPARAÎT :
  « from the » est invariable.
- Unités : l'anglais reste MÉTRIQUE (« km/h », « m »). L'impérial est une
  affaire du paramètre `units` (V2), jamais de la langue. Un test l'interdit
  explicitement (`not.toContain("mph")`) : c'est le réflexe le plus tentant et
  il casserait le contrat, qui promet des valeurs et des textes séparés.
- Test de PARITÉ fr/en : sur 6 cas représentatifs, on vérifie les mêmes clés,
  le même motif de CHAÎNES VIDES, et qu'au moins une phrase diffère. Il ne
  regarde aucun mot, donc il survivra à une reformulation de Xavier. C'est lui
  qui attrape la branche oubliée dans en.ts, c'est-à-dire le trou qu'un test
  écrit de mémoire ne voit jamais (on ne teste que les cas auxquels on pense).
  « au moins une phrase diffère » et non « toutes » : une visibilité de 400 m
  s'écrit « 400 m » dans les deux langues.
- Câblage : `buildResponse` prend un 3e paramètre `lang` OBLIGATOIRE, jamais
  optionnel. Motif : la fonction est appelée à DEUX endroits de `handleNearest`
  (cache et réseau) et le chemin du cache n'est atteint qu'à la SECONDE requête
  sur la même position. Un défaut `"fr"` aurait rendu l'oubli silencieux et
  invisible aux tests ; obligatoire, l'oubli est une erreur de compilation.
  Un test le verrouille quand même (deux requêtes `en` d'affilée, la seconde
  `fromCache: true`), vérifié par MUTATION : figer `"fr"` sur le chemin du
  cache fait tomber 2 tests. Mutation de la parité vérifiée aussi : faire
  diverger une sentinelle de `cloudsText` en fait tomber 2, dont 1 de parité.
- `cacheKey` ne contient toujours PAS la langue, et c'est cohérent : on met en
  cache la STATION, jamais le texte traduit. Un test fige la conséquence
  visible (un francophone passé avant ne fait pas servir du français à
  l'anglophone suivant). Ne pas « corriger » cacheKey.

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

