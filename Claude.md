\# QuelTemps (anciennement METAR Proche)



Backend TypeScript sur Vercel qui décode des METAR pour le grand public.

Couverture mondiale. Le client ne fait que du rendu : tout le décodage

et toute la traduction sont ici.



## Règles absolues

Ces règles-là ne se négocient pas et ne se redécident pas en session.

- `src/types.ts` est la source de vérité. Toute évolution du contrat d'API se
  fait là en premier, jamais dans un fichier consommateur.
- Les sorties sont métriques par défaut. Les unités sources varient : SM et
  inHg en Amérique du Nord, MPS en Russie et en Chine, kt ailleurs.
- L'heure affichée est l'heure locale de la STATION, jamais celle du client.
- Le calcul jour/nuit se fait sur les coordonnées de la station.

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
- SYNTHÉTIQUE (demandé le 28/07/2026). Le rapport tient en une dizaine de
  lignes : ce qui a été fait, ce qui a été tranché seul, ce qui attend Xavier.
  Une phrase par point, pas de paragraphe d'explication, pas de reprise du
  contenu des commentaires ni du message de commit. Le détail et le pourquoi
  vivent dans le code et dans ce fichier, PAS dans le message de fin : le
  rapport dit où regarder, il ne redit pas ce qui s'y trouve. Cette concision
  ne vaut QUE pour le rapport de fin : une explication demandée en cours de
  route reste aussi développée qu'il le faut (Xavier est débutant en
  TypeScript, voir « Contexte »).

## Contexte

Xavier est débutant en TypeScript : les décisions s'expliquent, et les
commentaires du code portent le journal de conception (c'est la mémoire du
projet d'une session à l'autre). L'autonomie porte sur le fait de ne plus
demander la permission.


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

## État d'avancement (dernière session : 28/07/2026)

Construction par étapes selon `PROMPT.md`. L'arrêt-validation après chaque étape
a été LEVÉ le 27/07/2026 (voir « Mode de travail ») : les étapes s'enchaînent
désormais sans attendre. Les tests précèdent toujours le code.
À ce jour : 329 tests passent, `npm run type-check` exit 0.

Les dix étapes du plan sont FAITES et validées, et la V1 est en ligne. Le
projet n'est donc plus en construction mais en amélioration : il n'y a plus
d'« étape suivante » qui s'impose, seulement la liste « Prochaine étape (à
décider avec Xavier) » plus bas, où rien n'est urgent.
Aucune dette de validation ne reste ouverte côté TEXTES : français et anglais
sont tous deux validés par Xavier. La seule chose encore en attente de lui est
d'un autre ordre : les `expect` de `tests/corpus.json` (voir la fin du
fichier).

Depuis le 28/07/2026, le design est un chantier ouvert. Ce qui existe et qu'il
faut connaître avant d'y toucher : la page prend la lumière de la STATION et
non celle du navigateur (`sun.isDay`), les couleurs passent TOUTES par des
variables de thème définies deux fois (`:root[data-sky="day"]` et `"night"`),
et le sprite d'icônes vit en ligne dans `public/index.html`, sans aucun fichier
ni CDN externe. Ces trois-là ne sont pas des détails d'implémentation : ce sont
les contraintes qui rendent la page cohérente d'un bout à l'autre du globe.

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

- Hors plan, 27/07/2026 — PAGE DE DÉMONSTRATION et serveur de développement.
  `public/index.html` (page autonome, aucun CDN, aucun script externe),
  `vite.config.ts` (routage local de `/api/nearest` vers le VRAI
  `handleNearest`, donc ce qu'on voit dans le navigateur est le code testé),
  `vitest.config.ts`, `vercel.json`, script `npm run dev`.
  PIÈGE : `vite.config.ts` déplace la racine dans `public/` et vitest lit
  `vite.config.ts` par défaut ; sans `vitest.config.ts` pour remettre la racine,
  la suite ne trouverait plus aucun test. D'où ce fichier, qui n'existe que pour
  ça.
  Le client ne décode RIEN : il affiche les phrases déjà rédigées par le bloc
  `text`. La seule chose qu'il compose lui-même est la ligne « mesures »
  (ressenti, humidité, hPa), parce que ce sont des VALEURS et non du texte.
  Parti pris visuel : la page prend la lumière de la STATION (`sun.isDay`) et
  non celle du navigateur — consulter Fidji à 3 h locales donne une page de
  nuit. Vérifié en vrai le 27/07/2026 : Brumath `clear_day`, Nadi NFFN
  `isDay: false`, `lang=en` → « Clear sky », position invalide → 400.
  `vercel.json` fixe `maxDuration: 30` (constat n° 2 de la revue de code), et
  aussi `"framework": null` + `"buildCommand": null` + `"outputDirectory":
  "public"`. Ces trois-là ne sont PAS de la décoration : la présence de
  `vite.config.ts` à la racine et de `vite` dans les dépendances suffit à faire
  détecter à Vercel un « projet Vite », donc à lancer un build et à chercher le
  site dans `dist/`, qui n'existe pas. Or vite n'est ici qu'un outil de
  DÉVELOPPEMENT : en production, Vercel doit juste servir `public/` en statique
  et `api/` en fonction, sans rien construire. On le dit donc explicitement.
- IMPORTS RELATIFS : TOUJOURS AVEC L'EXTENSION `.js`. C'est la cause du second
  échec de déploiement du 27/07/2026, et la plus instructive de la session.
  Le tsconfig disait `moduleResolution: "bundler"`, choisi à l'étape 5
  PRÉCISÉMENT pour ne pas écrire `./units.js` partout. Or Vercel compile en
  JavaScript et exécute en ESM NATIF, où Node refuse un import relatif sans
  extension : `ERR_MODULE_NOT_FOUND: Cannot find module '/var/task/src/geo'`.
  La fonction plantait donc AU CHARGEMENT, avant tout appel réseau, pendant que
  `tsc --noEmit` et les 298 tests restaient au vert. Un défaut totalement
  invisible en local, c'est-à-dire le pire scénario.
  Corrigé en passant à `"module"/"moduleResolution": "nodenext"`, qui IMPOSE
  l'extension : l'oubli devient une erreur de compilation et ne peut plus
  atteindre la production. Conséquence annexe : `tests/decode.test.ts` importe
  `corpus.json` et doit désormais écrire `with { type: "json" }`.
  On écrit `.js` même si le fichier est un `.ts` : c'est la convention ESM, le
  nom désigne le fichier COMPILÉ.
- EN LIGNE ET VÉRIFIÉ le 27/07/2026 : https://github.com/Xavier-ctrl24/queltemps
  déployé sur Vercel. (Dépôt renommé le 02/08/2026, voir plus bas ; GitHub
  redirige l'ancien nom, en web comme en git.) `/api/nearest?lat=48.73&lon=7.71` rend LFST, 27 °C,
  `few_day`, `Europe/Paris`, lever 05:57 / coucher 21:14, textes français
  corrects. Il aura fallu trois échecs de déploiement pour y arriver
  (TypeScript 7, détection de framework Vite, imports sans extension), aucun
  détectable en local.
  URL DE PRODUCTION : https://queltemps.vercel.app
  Depuis le 02/08/2026. L'ANCIENNE, `metar-proche-three.vercel.app`, reste
  ATTRIBUÉE au projet et répond toujours : la retirer la libérerait, et
  n'importe qui pourrait alors la reprendre. La garder ne coûte rien et
  laisse fonctionner les APK déjà installés qui la codent en dur.
  Ajoutée le 29/07/2026, et c'est une correction du carnet de bord plutôt
  qu'un ajout. Cette ligne consignait jusque-là l'adresse GITHUB comme preuve
  de mise en ligne, donc l'adresse réelle du service n'était écrite NULLE
  PART. Le jour où il a fallu la coder en dur pour l'application Android, la
  déduire du nom du dépôt a donné `metar-proche.vercel.app`, qui n'existe pas
  (`DEPLOYMENT_NOT_FOUND`) : Vercel avait suffixé `-three`. Quatre variantes
  essayées, aucune ne répondait. Une preuve de déploiement doit citer ce qui
  a été appelé, pas ce dont il a été construit.
- Diagnostiquer une panne qui n'existe qu'en production : ne pas deviner, mais
  déployer une SONDE (`api/diag.ts`, temporaire, SUPPRIMÉE depuis) qui
  contourne les modules et rend ce qu'ils masquent. À recréer sur le même
  patron le jour où ça se reproduit. Deux enseignements de celle du 27/07/2026 :
  (a) elle a écarté en un coup les hypothèses réseau (aviationweather.gov
  répond 200 en 23 ms depuis iad1, aucun filtrage d'IP, aucune question
  d'en-tête), alors qu'on aurait pu les creuser longtemps ;
  (b) ses imports devaient être DYNAMIQUES et sous try/catch, sinon l'échec de
  chargement aurait fait planter la sonde elle-même — et c'est justement ce
  qu'elle devait mesurer.
- TYPESCRIPT RESTE EN 5.x, NE PAS REMONTER EN 7. Premier déploiement Vercel du
  27/07/2026 en échec : « Using TypeScript 7.0.2 (local user-provided) » puis
  « Cannot read properties of undefined (reading 'readFile') ». Vercel compile
  la fonction avec la version de TypeScript trouvée dans NOS dépendances, et
  la 7 est le nouveau compilateur natif dont l'API Node utilisée par le
  constructeur Vercel n'existe pas encore. Rien à voir avec notre code : le
  `tsc --noEmit` local passait très bien en 7.0.2. Rétrogradé en `^5.9.3`,
  type-check et 298 tests toujours verts. Le jour où Vercel saura lire la 7,
  on pourra remonter ; d'ici là, une montée de version casse le déploiement
  sans casser aucun test, ce qui est le pire des scénarios.
  ATTENTION, encodage : ne JAMAIS passer ces fichiers à un
  `Get-Content | -replace | Set-Content` PowerShell. PowerShell 5.1 lit l'UTF-8
  comme du Latin-1 et réencode, ce qui transforme « données » en « donnÃ©es »
  dans tout le fichier. Fait le 27/07/2026, réparé par `git checkout`.

- 28/07/2026 — PAGE DE DÉMONSTRATION TRADUITE. Constat de Xavier sur capture :
  en `lang=en`, l'API parlait anglais mais la page restait à moitié française
  (« Strasbourg/Entzheim, à 21.4 km », « Observé à 12:30 heure locale »,
  intitulés vent/visibilité/mesures, « lever »/« coucher », boutons). Cause :
  le bloc `text` est traduit par le backend, mais tout ce qui l'ENTOURE
  appartient à la page et y était écrit en dur.
  Table `TEXTES = { fr, en }` dans `public/index.html`, et trois décisions :
  (a) PHRASES ENTIÈRES avec trous `{nom}`, jamais de fragments recollés. Même
  leçon que le repère `{i}` d'`en.ts` : « il y a 22 min » met le marqueur
  devant, l'anglais derrière (« 22 min ago ») ; « , à 21,4 km » devient
  « , 21.4 km away ». Une concaténation de mots traduits produirait de
  l'anglais faux.
  (b) `lang` est un PARAMÈTRE OBLIGATOIRE d'`afficher` et d'`afficherEchec`,
  lu une seule fois en tête de `consulter`, jamais relu depuis le `<select>`
  au fond d'une fonction. Même motif que `buildResponse(…, lang)` : un défaut
  implicite rendrait l'oubli silencieux. Effet de bord utile : changer de
  langue pendant que la réponse voyage ne peut plus mélanger les deux.
  (c) SÉPARATEUR DÉCIMAL corrigé au passage (« à 21,4 km » en français). C'est
  une propriété STRUCTURELLE, donc elle ne relève pas de la validation de
  Xavier ; elle ne concernait que le français, l'anglais était déjà juste.
  PAS DE TEST, et c'est un choix : le seul test utile serait une PARITÉ de
  clés fr/en, or l'obtenir imposait de sortir la table dans un `.js` importé
  par un test `.ts`, donc `allowJs` + un élargissement d'`include` dans
  `tsconfig.json`. Ce fichier a déjà causé trois échecs de déploiement : on ne
  le rouvre pas pour le chrome d'une page de démonstration. La page reste donc
  non testée, comme elle l'était déjà.
  Vérifié dans le navigateur le 28/07/2026 (serveur de développement, vrai
  `handleNearest`) : `fr` → « à 20,8 km », `en` → « 20.8 km away », « 30 min
  ago », « readings », « sunrise/sunset », boutons « Show »/« Locate me » ;
  400 en anglais → « Unusable position » ; bascule de langue sur l'écran
  d'échec sans position valide → message re-rendu (`dernierEchec`) ; branches
  de repli forcées à la main → « Unknown station », « Observation available »,
  « observation is 200 minutes old » (classe `stale` posée), « unknown time
  zone ». `<meta name="description">` reste en français et n'est pas mis à
  jour : hors périmètre, signalé.
  Ajout annexe : `.claude/launch.json` (lancement du serveur de développement
  depuis l'outillage), sans effet sur la production.

- 28/07/2026 — ICÔNES. Xavier a fourni `icones.png`, une planche de style
  (trait seul, deux accents : ambre pour l'astre et l'éclair, bleu pour tout
  ce qui est mouillé). Sprite SVG EN LIGNE dans `public/index.html`, à deux
  étages : des PRIMITIVES `#p-...` centrées sur leur origine, puis les 24
  icônes `#i-...` composées par `<use>`. Motif : le contrat distingue
  drizzle / rain_light / rain / rain_heavy, qui ne diffèrent que par le nombre
  de gouttes sous le MÊME nuage ; dessiner chaque icône en entier ferait
  24 nuages à maintenir. S'y ajoutent 5 icônes de rubrique `#d-...` (vent,
  visibilité, nuages, phénomènes, mesures) qui, elles, ne viennent pas du
  contrat.
  LA LISTE VIENT DE `pickIcon`, PAS DE LA PLANCHE. La planche a 12 dessins, le
  contrat 24 jetons. Un jeton sans symbole donnerait un carré vide EN
  PRODUCTION sur un cas que rien en local ne déclenche : même forme que le
  défaut d'imports du 27/07/2026. D'où aussi le repli obligatoire de
  `poserIcone` sur `#i-unknown` (un nuage en pointillé, donc un dessin et pas
  un trou). Les huit variantes nocturnes n'existent pas sur la planche : le
  croissant est un ajout, agrandi à 2,6 (contre 2,2 pour le soleil) parce
  qu'à échelle égale il pesait 39,5 unités contre 48,4.
  DEUX RÉGLAGES QUI SE MESURENT, pas qui se raisonnent :
  (a) `--sw`, l'épaisseur du trait dans le repère du dessin. Une seule valeur
  ne marche pas aux deux tailles (2,4 à 3,4 rem donne un trait juste, mais un
  cheveu invisible à 1,35 rem). Chaque taille a la sienne, et les primitives
  agrandies divisent la leur d'autant (classes `.sc*`) : sans ça, un nuage
  grossi 1,9 fois aurait un trait 1,9 fois plus gras que les gouttes d'à côté.
  (b) les accents passent par des variables de THÈME (`--ico-sun`, `--ico-wet`)
  et jamais par un hex dans le SVG : le bleu de la planche (#2b6cb0) tombe à
  1,3:1 sur le fond de nuit. Éclairci en #7fb3e8 (8,4:1).
  CORRIGÉ le 28/07/2026 sur arbitrage de Xavier (« choisis la meilleure
  option ») : l'ambre de la planche (#f5a623) ne faisait que 1,7:1 sur le fond
  de jour, sous le seuil de 3:1 des éléments graphiques. Remplacé par un
  cuivre #c96a00 (3,23:1), qui reste chaud là où un ambre conforme aurait viré
  au brun. L'ambre CLAIR est conservé de nuit, où il tient déjà 9,34:1 : c'est
  la même correction que pour le bleu, en sens inverse, et c'est pour ça que
  les accents passent par des variables de thème. Argument écarté : « l'icône
  est redondante avec le titre, donc hors du champ de 1.4.11 ». Vrai en droit,
  faux en usage — une appli météo se consulte dehors, en plein soleil.
  Mesures finales, calculées dans le navigateur sur les valeurs réellement
  résolues (jour / nuit) : astre 3,23 / 9,34 ; humide 4,62 / 8,28 ;
  encre 13,48 / 15,66.
  Pas de nom accessible sur l'icône de tête, et c'est délibéré : lui en
  écrire un créerait une formulation de plus à traduire et à faire valider,
  pour redire ce que `text.headline` dit déjà.
  VÉRIFIÉ SANS CAPTURE D'ÉCRAN (le volet navigateur ne composait pas d'image
  ce jour-là), donc autrement, et c'est la méthode à réutiliser : `getBBox()`
  sur chaque symbole posé (29 sur 29 non vides, dans la boîte, centrés à
  moins de 4 unités) et `elementFromPoint` sur un point du trait — le test de
  pointage n'atteint une forme QUE si elle est réellement peinte, ce qui
  prouve d'un coup que les `<use>` imbriqués rendent et que `currentColor` et
  les variables traversent bien les deux niveaux. Repli testé : jeton inconnu
  et jeton nul → `#i-unknown`. Mobile 375 px : aucun débordement horizontal.
  Planche de contrôle livrée à Xavier (`icones-controle.html`, fabriquée par
  un script qui EXTRAIT le style et le sprite du vrai `index.html`, donc elle
  ne peut pas diverger de la page). Le jugement visuel lui revient.

  DESSINS VALIDÉS par Xavier le 28/07/2026, y compris les six qui ne figurent
  pas sur la planche et qui ont donc été inventés : les huit variantes de nuit
  (croissant), `freezing_rain` (gouttes + sol pris en glace), `sleet` (une
  goutte et un flocon), `smoke` (panaches verticaux), `dust` (ondes + grains)
  et `unknown` (nuage en pointillé).
  `icones.png` est SUIVI par git (référence de design). La planche
  `icones-controle.html` est ignorée : elle est générée, et en commiter une
  copie ferait une seconde version du sprite qui divergerait au premier
  retouchage.

- VOCABULAIRE ANGLAIS VALIDÉ par Xavier le 28/07/2026, dans les deux endroits
  concernés : `src/i18n/en.ts` et la table `TEXTES.en` de `public/index.html`.
  Ces phrases avaient été PROPOSÉES par Claude faute de mieux, ce qui est
  l'inverse du fonctionnement normal (le français de l'étape 6 a été écrit par
  Xavier). Elles sont désormais acquises, au même titre que le français : on ne
  les retouche plus sans lui. Les en-têtes de `tests/i18n.en.test.ts` qui les
  annoncent comme non validées sont donc PÉRIMÉS et à corriger au prochain
  passage sur ce fichier.
  Ce qui reste vrai en revanche, et qui explique la forme des tests : ils
  vérifient surtout ce qui est OBJECTIF (séparateur décimal, place de
  l'intensité, sentinelles, parité fr/en) et presque aucun mot. C'est
  volontaire et ça doit le rester — un test qui épingle le vocabulaire tombe à
  la première reformulation de Xavier, alors que la parité, elle, attrape la
  branche oubliée.

- 28/07/2026 — SYSTÈME DE DESIGN APPLIQUÉ (handoff Claude Design, zip fourni
  par Xavier dans `design/`). Refonte VISUELLE de `public/index.html` : la
  logique existante a été PORTÉE sur la nouvelle mise en page, pas réécrite.
  L'idée directrice de la maquette : LE CIEL EST L'INTERFACE. Le fond n'est
  plus un thème à deux couleurs mais la traduction visuelle du METAR.
  DEUX AXES INDÉPENDANTS, à ne jamais confondre : `data-sky` = la CONDITION
  (10 dégradés : les 8 de la maquette + `neutral` pour le chargement et
  `err` pour la panne), `data-lum` = la LUMIÈRE de la station (`sun.isDay`,
  inchangé depuis le 27/07/2026), `data-pol` = la POLARITÉ d'encre.
  Le contrat rend 24 jetons, la maquette dessine 8 ciels : la table `CIELS`
  fait la correspondance par FAMILLE visuelle. Deux choix à ne pas
  redécouvrir : `unknown` prend le ciel NEUTRE et non un beau bleu (un jeton
  illisible ne doit rien affirmer), et `dust`/`smoke` prennent le ciel de
  brouillard faute d'un ciel ocre — en inventer un serait écrire du design,
  pas l'appliquer. Un jeton inconnu ou nul retombe aussi sur `neutral` :
  même réflexe que le repli `#i-unknown` des icônes.
  LA NUIT EST UN VOILE, pas sept dégradés inventés. La maquette n'en dessine
  qu'un (CAVOK nuit), et légende elle-même son écran nocturne « luminosité
  divisée par trois ». Seul le ciel clair garde son dégradé étoilé dédié.

  LE TROU QUE LA MAQUETTE NE MONTRE PAS, et la vraie difficulté de la
  session. Elle ne dessine ses cartes de verre que sur CAVOK, un bleu moyen.
  Or ses ciels `fg` et `sn` sont presque blancs, et TOUS ses dégradés
  finissent près du blanc en bas (#E2F0FB sur CAVOK). Appliquée telle
  quelle, sa carte `rgba(255,255,255,.13)` sous encre blanche donne du blanc
  sur blanc. Ses fondations ne règlent pas le cas : elles déclarent
  `--ink-on-dark` / `--ink-on-light` et s'arrêtent là.
  MESURÉ, PAS ESTIMÉ, et c'est la méthode à réutiliser : une sonde en page
  a composé le dégradé + le voile de nuit + le voile de lecture + le verre,
  pour 10 ciels x jour/nuit x 21 hauteurs d'écran, puis calculé le rapport
  WCAG réel. Verdict des valeurs de la maquette : `sct` de jour à 3,34:1 sur
  le texte courant et 2,38:1 sur les intitulés, `cavok` à 3,84 / 2,65. Sous
  AA, et invisible à l'œil sur la seule capture qui existe.
  Corrigé par un jeu de jetons de POLARITÉ (encre, verre, DEUX épaisseurs de
  bordure, voile de lecture) plus un voile renforcé. Mesures finales, pires
  cas tous ciels confondus : texte sur carte 5,56 / 5,00 / 4,73 (encre,
  atténuée, intitulé) ; texte sur ciel 6,64 / 5,38 ; bordure de carte 3,27 ;
  bordure de CONTRÔLE 3,90. Le verre BLANC de la maquette est conservé :
  c'est le voile qui a changé, pas le composant.
  `--ctl-border` existe parce que la maquette n'a qu'une bordure (.20), qui
  suffit sur son bleu et disparaît ailleurs : un bouton dont on ne voit pas
  le bord n'est plus un bouton (1.4.11). Les cibles tactiles ont été portées
  à 24 px minimum (2.5.8) : pastilles FR/EN 23 -> 27 px, « fermer » 13 -> 27
  par marge NÉGATIVE, donc sans déplacer le dessin d'un pixel.

  CE QUI A ÉTÉ RETIRÉ de la maquette, et pourquoi : le cadre de téléphone,
  la fausse barre d'état (9:41, batterie — une page web ne ment pas sur la
  charge de l'appareil) et la planche de pilotage, qui sont la présentation
  de la maquette et non le produit. Les trois écrans que le backend ne sait
  pas alimenter (décodage groupe par groupe, recherche de ville, « GPS
  refusé ») sont HORS PÉRIMÈTRE sur arbitrage de Xavier : le premier
  exigerait une évolution de `types.ts` et une dizaine de formulations, le
  deuxième un géocodeur absent du projet, et le troisième CONTREDIT le repli
  documenté (sans position, on sert Brumath « plutôt qu'un écran mort »).
  La feuille de localisation, elle, est bien là : elle ne fait que reloger
  ce qui existait dans le `<details>`, que la nouvelle mise en page ne
  pouvait plus accueillir.
  ARBITRAGE DE XAVIER sur les icônes : les 5 icônes de RUBRIQUE restent
  affichées, la grande icône de tête disparaît (le ciel dit déjà le temps
  qu'il fait, la doubler serait deux signaux pour une information). Les 24
  icônes du contrat RESTENT dans le sprite, inutilisées mais prêtes : elles
  sont validées, et les redessiner coûterait une session.
  POLICES : Instrument Sans + JetBrains Mono, auto-hébergées en `public/fonts/`
  (4 woff2 variables, latin + latin-ext, 84 Ko). Choix de Xavier contre le
  CDN Google de la maquette : la règle « aucun fichier externe » vaut aussi
  pour les polices. Piège documenté dans `public/fonts/LICENCE.txt` :
  Instrument Sans ne descend PAS sous la graisse 400 ; la maquette écrit 200
  sur le chiffre géant, le navigateur rend 400. On écrit donc 400.
  DEUX DÉFAUTS TROUVÉS PAR LA VÉRIFICATION, tous deux invisibles à la
  lecture : (a) l'écran d'accueil réaffiché après une panne gardait le fond
  chaud de la panne, donc disait deux choses à la fois ; (b) la feuille
  s'ouvrait via `requestAnimationFrame`, qui NE SE DÉCLENCHE PAS dans un
  onglet qui ne compose pas d'image — remplacé par une lecture d'
  `offsetHeight`, qui force le calcul sans dépendre d'une frame.
  VÉRIFIÉ SANS CAPTURE D'ÉCRAN (le volet navigateur ne composait toujours
  pas d'image), donc par sonde, et c'est encore la méthode : contraste
  composé sur les 20 combinaisons de ciel, table `CIELS` parcourue sur les
  24 jetons, `elementFromPoint` sur chaque contrôle de la feuille, hauteurs
  de cibles tactiles, débordement horizontal nul à 375 px et à 1280 px,
  états chargement / panne FR et EN / accueil forcés à la main. Détail à
  connaître pour la prochaine fois : sans composition, ni les TRANSITIONS
  ni les ANIMATIONS ne s'exécutent — on les coupe (`transition:none`) pour
  mesurer l'état FINAL, sinon on lit l'état de départ et on croit à un bug.
  Le jugement visuel revient à Xavier : la page tourne sur `npm run dev`.
  PAS DE TEST, comme la version précédente de cette page et pour la même
  raison (voir l'entrée du 28/07/2026 sur la traduction de la page).

- 28/07/2026 — MANIFESTE D'APPLICATION, première pierre d'un TWA. Trois
  fichiers ajoutés (`public/manifest.webmanifest`, `public/icon.svg`,
  `public/icon-512.png`) et deux retouchés (`public/index.html`,
  `vercel.json`). Sans manifeste, aucune installation possible ; sans
  installation, aucun TWA.
  CE QUI EST FACILE À RATER : un manifeste NON LIÉ ne fait rien. C'est le
  `<link rel="manifest">` du `<head>`, pas le fichier, qui rend la page
  installable. Deuxième piège du même genre : ne JAMAIS déclarer dans
  `icons` un fichier absent — une icône en 404 est pire que pas d'icône,
  le navigateur refuse alors l'installation sans rien dire.
  AUCUNE PHRASE NOUVELLE. `name` reprend le `<title>`, `description`
  reprend le `<meta name="description">` au mot près. C'était le point
  délicat : rédiger un texte pour le manifeste aurait créé une formulation
  de plus à faire valider (règle anti « parser contre lui-même ») et une de
  plus à traduire. Le manifeste ne parle que français, comme le `lang` du
  document : il n'existe pas de mécanisme standard pour le négocier selon
  le `<select>` de la page. Signalé, pas décidé seul : c'est un choix qui
  se rediscute si la page devient bilingue pour de bon.
  L'ICÔNE N'EST PAS DESSINÉE, ELLE EST RECOPIÉE. `icon.svg` reprend trait
  pour trait le symbole `#i-partly_cloudy_day` du sprite, validé le
  28/07/2026 : mêmes primitives, mêmes translations, mêmes échelles, seul
  le repère passe de 64 à 512. On recopie au lieu de référencer parce
  qu'un `<use href="index.html#…">` ne franchit pas la frontière d'un
  document chargé comme IMAGE, et c'est exactement ainsi qu'un lanceur
  charge une icône. Ce jeton-là parmi les 24 parce qu'il contient l'astre
  ET le nuage, donc dit « météo » sans annoncer un temps qu'il fera : une
  icône est peinte des mois avant le METAR.
  DEUX DESSINS ET NON UN, et c'est la correction la plus utile de la
  session. Premier jet : un seul fichier déclaré `any maskable`. Erreur.
  Android rogne l'icône en cercle, en goutte ou en écusson et ne garantit
  que le disque central de 80 %, donc la version rognable doit tenir dans
  les 60 % centraux. Mais la boîte d'installation de Chrome, la fiche du
  Play Store, l'onglet et iOS ne rognent RIEN : leur servir cette
  version-là aurait donné un petit dessin perdu dans un grand carré
  marine, PARTOUT, à cause d'une contrainte qui ne vaut que pour un
  lanceur Android. iOS ignore de surcroît `maskable`, donc
  `apple-touch-icon` était le cas le plus mal servi.
  D'où quatre fichiers : `icon.svg` / `icon-512.png` à 85 % (`any`),
  `icon-maskable.svg` / `icon-maskable-512.png` à 60 % (`maskable`). Les
  deux SVG sont gardés comme SOURCES : sans eux, régénérer un PNG
  imposerait de redessiner. Mesuré et non estimé : 0 pixel peint hors du
  disque de sécurité sur la version rognable, et le dessin occupe 73 % en
  largeur sur 63 % en hauteur sur la version `any` (le symbole a ses
  propres marges dans son repère de 64).
  ÉPAISSEUR DE TRAIT : reprise telle quelle du sprite, base `--sw: 3`, ce
  qui donne 13 px de trait sur 512, soit ~1,2 px sur une vignette de
  48 px. Ce réglage-là n'a PAS été mesuré à l'œil comme le furent ceux du
  28/07/2026 : il est repris, pas choisi. À revoir si Xavier trouve le
  trait maigre sur son téléphone.
  LE PNG A ÉTÉ FABRIQUÉ SANS AUCUNE DÉPENDANCE, et la méthode vaut d'être
  notée : `<img>` + `canvas.drawImage` + `toDataURL` dans le volet
  navigateur, puis décodage du base64. Aucun `sharp`, aucun `resvg`, aucun
  paquet ajouté pour un fichier qu'on ne régénérera presque jamais. Le PNG
  512 existe parce que Bubblewrap l'exige pour empaqueter un TWA ; le SVG,
  lui, reste net à toutes les tailles. PIÈGE RENCONTRÉ : dans un document
  SVG, `document.createElement("canvas")` crée un élément en NAMESPACE SVG,
  donc sans `getContext` — il faut `createElementNS` en XHTML.
  COULEURS FIXES, et c'est la seule chose que ce fichier ne peut pas bien
  faire : `theme_color` et `background_color` sont peints AVANT la réponse
  de l'API, donc avant qu'un `data-sky` existe. On prend le ciel NEUTRE,
  celui du chargement. Ils doivent rester ÉGAUX au `<meta name=theme-color>`
  de la page, sans quoi la barre système clignoterait à l'ouverture.
  `vercel.json` reçoit un en-tête `Content-Type` explicite pour le
  manifeste. Assurance et non correctif : vite le sert déjà en
  `application/manifest+json`, mais le comportement de Vercel n'est pas
  vérifiable sans déployer, et un manifeste servi en `octet-stream` se
  télécharge au lieu de s'appliquer. Défaut invisible en local, donc le
  scénario que ce dépôt connaît trop bien.
  TRANCHÉ SEUL, à signaler parce que ça n'allait pas de soi :
  `orientation: portrait-primary` (la page est dessinée pour le portrait
  depuis la maquette, mais ça FIGE l'orientation d'une installation sur
  tablette) et `categories: weather, utilities` (sans effet visible, lu
  par certains catalogues).
  VÉRIFIÉ sur le serveur de développement (vrai `handleNearest`) : lien
  présent, 200, JSON valide, `application/manifest+json`, les QUATRE
  icônes en 200 avec le bon type, `theme_color` égal au `<meta>` (casse
  comprise), aucune erreur de manifeste en console, page toujours
  fonctionnelle (LFST, `clear_day`, ciel `cavok`). L'icône est prouvée
  PEINTE par comptage de pixels (fond #0a1526, encre #EAF2FB, ambre
  #F5A623), même réflexe que le `getBBox` du 28/07/2026.
  CE QUI N'A PAS PU ÊTRE PROUVÉ ICI : `beforeinstallprompt` n'a pas été
  émis dans le volet navigateur. Ça ne prouve RIEN dans un navigateur
  piloté, qui supprime couramment cet événement. Ce qui est vérifié tient
  au fichier lui-même (il est lu, valide, complet) ; le déclenchement de
  l'invite se constatera sur un vrai téléphone.
  PAS DE TEST : c'est un fichier de configuration statique, et la page
  reste non testée pour la raison déjà écrite plus haut.

- 29/07/2026 — L'APPLICATION S'APPELLE « QuelTemps ». Décision de Xavier.
  Casse reprise du logo qu'il a fourni (« QuelTemps »), et non le
  « quelTemps » de la demande. Renommé aux SEPT endroits qui portaient le
  nom : le `<title>` de `public/index.html`, `name` et `short_name` du
  manifeste, `name` de `package.json`, les deux occurrences de
  `package-lock.json` (racine et `packages[""]`, sinon `npm ci` proteste),
  le titre de ce fichier, et `public/fonts/LICENCE.txt`.
  CE DERNIER A FAILLI PASSER À TRAVERS, et la leçon est générale : il
  n'était dans aucune de mes listes mentales (« la page », « le
  manifeste », « le paquet »), il ne se voit dans aucun rendu, mais il
  vit sous `public/` et n'est pas dans `.vercelignore`, donc il PART EN
  PRODUCTION. Un renommage se termine par un `grep` de l'ancien nom sur
  tout le dépôt, pas par la liste des fichiers auxquels on a pensé.
  `icones-controle.html` porte encore l'ancien nom et c'est SANS OBJET :
  il est généré, ignoré par git et par `.vercelignore`.
  PAS TOUCHÉ, et c'est délibéré : le `<meta name="description">` et la
  `description` du manifeste, qui sont des phrases validées par Xavier et
  volontairement identiques entre les deux fichiers ; `theme_color` et
  `background_color`, qui sont accrochées au ciel NEUTRE de la page et non
  au logo. RESTE DEHORS : le dépôt GitHub, le projet Vercel et l'URL
  s'appellent toujours `metar-proche`. Rien ne casse, mais ça se voit
  dans l'adresse. Xavier a demandé le renommage le 29/07/2026 ; il n'a
  PAS pu être fait ici, et pour une raison à connaître plutôt qu'à
  redécouvrir : ni `gh` ni la CLI Vercel ne sont installés, et il n'y a
  aucun jeton dans l'environnement. Git passe par le gestionnaire
  d'identifiants Windows, qui sert au TRANSPORT git et non à l'API : il
  ne permet donc pas de renommer un dépôt. Ces deux gestes demandent la
  session authentifiée de Xavier ; marche à suivre en « Prochaine étape ».
  CE QUI NE DÉPEND PAS DU DOMAINE, vérifié et non supposé : `start_url`,
  `scope` et `id` du manifeste valent `/`, donc relatifs, et les icônes
  comme les polices sont référencées en chemins absolus de SITE
  (`/icon-512.png`), jamais en URL complètes. La seule URL en dur de tout
  le dépôt est celle de la ligne « EN LIGNE ET VÉRIFIÉ » du 27/07/2026.
  Un changement de domaine ne casse donc rien dans le code.
  PÉRIMÉ DEPUIS LE 29/07/2026, et c'est important : `public/index.html`
  porte désormais `API_PROD`, l'adresse absolue de production, parce que
  l'application Android n'a aucun serveur à joindre en relatif. Un
  changement de domaine casse donc maintenant l'APPLICATION INSTALLÉE, que
  l'on ne peut pas corriger à distance : il faut republier. Renommer le
  projet Vercel n'est plus un geste sans conséquence.
  JAMAIS par `Get-Content | -replace | Set-Content` : « renommer partout »
  est exactement la tâche qui invite au massacre d'encodage du 27/07/2026.
  Six modifications ciblées.

- 29/07/2026 — LES ICÔNES VIENNENT DU LOGO DE XAVIER. `logo/logo.png`
  remplace le dessin au trait du 28/07/2026 pour tout ce qui est icône
  d'APPLICATION. Le sprite des 5 icônes de rubrique et les 24 jetons du
  contrat ne bougent pas : ils vivent dans `public/index.html` et n'ont
  rien à voir avec ce chantier.
  `logo/logo192-512.png` N'EST PAS UNE SOURCE : c'est une planche de
  présentation (4 variantes légendées sur fond de halo), au même titre
  qu'`icones.png`. En découper une vignette rapporterait le halo, la
  légende et une source de 192 px pour un besoin de 512. Tout dérive de
  `logo.png`.
  LA DIFFICULTÉ N'ÉTAIT PAS LE DESSIN, C'ÉTAIT LE MOT. « QuelTemps » est
  peint dans une bande marine en bas du carré, c'est-à-dire exactement là
  où un masque circulaire de lanceur Android coupe — et à 48 px il ne se
  lit de toute façon pas. Mettre le logo entier à 60 % sur un fond marine
  refabriquerait le « petit dessin perdu dans un grand carré » que ce
  dépôt a déjà rejeté le 28/07/2026. D'où DEUX DÉCOUPES et non deux
  échelles : « any » = le carré arrondi ENTIER, mot compris ; « maskable »
  = le CIEL SEUL, sans le mot.
  TROIS MESURES, aucune estimation. (a) La géométrie du logo a été relevée
  par sonde et non à l'œil : boîte du carré arrondi 82,60 → 1170,1190 ;
  haut de la bande marine y=876, trouvé par MÉDIANE de ligne. Les deux
  premières tentatives ont échoué pour la même raison, et elle vaut d'être
  notée : un balayage de la colonne CENTRALE tombe sur les lettres
  blanches du mot, et un balayage depuis le bord tombe sur la ligne
  adoucie du contour. La médiane ignore l'un et l'autre.
  (b) L'échelle de la version rognable, 0,4769, est CALCULÉE : c'est
  204,8 / 429, où 429 est la distance du pixel essentiel le plus éloigné
  du centre (plus grosse composante connexe du nuage + disque solaire) et
  204,8 le rayon du disque de sécurité de 80 %. Vérifié sur le fichier
  RENDU : sur 12 075 pixels essentiels, 17 sortent du disque, tous en
  x=0..1, donc le nuage décoratif de bord et non le sujet.
  (c) Le blanc de marge est retiré par DIFFUSION DEPUIS LE BORD, jamais
  par un seuil global : seul le blanc CONNECTÉ au bord devient
  transparent, sans quoi le nuage blanc du milieu partirait avec.
  LE FOND DE LA VERSION ROGNABLE SE SYNTHÉTISE LIGNE PAR LIGNE, et c'est
  le piège qui m'a coûté deux essais. Le ciel découpé ne remplit pas les
  512 en hauteur, il faut donc le prolonger jusqu'aux quatre bords. Étirer
  les lignes de bord de la boîte englobante NE MARCHE PAS : aux coins
  arrondis, ces pixels-là sont le blanc de marge, pas du ciel — on obtient
  des bandes claires en haut et en bas. Il faut, pour chaque ligne,
  chercher la largeur RÉELLE du carré et échantillonner à 15 % / 85 % de
  cette largeur, en gardant le plus bleu des deux (ce qui écarte les
  petits nuages de bord). S'y ajoute une ÉROSION de 10 px du calque de
  ciel : rendre le blanc transparent n'efface pas le liseré sombre du
  contour, qui restait lisible en arc au milieu de l'icône.
  TROIS TAILLES, ce qui est nouveau. L'ancienne icône était un SVG au
  trait de quelques kilo-octets, utilisable partout ; le logo est une
  image photographique, donc 378 Ko en 512. Servir ça en favicon ferait
  payer 378 Ko par onglet pour un dessin affiché en 16 px. D'où
  `favicon-64.png` (9 Ko) pour l'onglet, `icon-192.png` (57 Ko) pour iOS,
  `icon-512.png` pour l'installation, plus `icon-maskable-512.png`.
  LA TRANSPARENCE N'EST PAS UNIFORME, ET C'EST VOULU. `icon-192.png` est
  le seul des quatre à être TOTALEMENT OPAQUE. Motif : iOS n'honore pas
  la transparence d'un `apple-touch-icon`, il aplatit sur du NOIR avant
  d'appliquer son propre masque. Or le cadrage « contain » laisse 11 %
  de pixels translucides (coins arrondis + deux barres latérales, le
  logo n'étant pas tout à fait carré : 1089 x 1131). Servi tel quel, ça
  donnait des échardes noires sur l'écran d'accueil — une régression
  introduite le jour même, l'icône remplacée étant un SVG opaque, et sur
  la plateforme que ce fichier signalait déjà comme « le cas le plus mal
  servi ». Corrigé en ÉTENDANT les pixels opaques du bord vers
  l'extérieur (le même principe que la saignée de la version rognable),
  jusqu'à zéro pixel translucide : le remplissage est invisible puisque
  iOS découpe justement ces zones. Les trois autres GARDENT leur alpha,
  parce qu'ils sont posés sur un fond que le logiciel maîtrise (onglet,
  boîte d'installation), où des coins arrondis nets valent mieux qu'un
  carré plein. Non tranché faute de pouvoir le vérifier ici : ce que
  Bubblewrap et la fiche Play Store font de l'alpha du 512.
  LE PIÈGE DE MÉTHODE, à retenir : ma sonde comptait les pixels PEINTS
  (marine, encre, ambre) et concluait « l'icône est bien dessinée ».
  Vrai, et à côté de la question. Elle ne regardait pas le canal alpha,
  donc elle ne pouvait pas voir le défaut. Compter ce qui est là ne dit
  rien de ce qui manque.
  `icon.svg` et `icon-maskable.svg` sont SUPPRIMÉS : une photo ne se met
  pas en SVG, et les laisser aurait montré le dessin au trait dans
  l'onglet pendant que tout le reste montrait le logo. Ils restent dans
  l'historique git si besoin.
  MÉTHODE DE FABRICATION, à réutiliser : `canvas` dans le volet
  navigateur, aucune dépendance ajoutée, comme le 28/07/2026. Nouveauté :
  les PNG font 378 Ko, donc ~500 000 caractères de base64 — infaisable à
  rapatrier par le canal d'exécution. Un point d'entrée `POST /_depot`
  TEMPORAIRE a été ajouté à `vite.config.ts` le temps de la génération,
  puis retiré ; `git diff` confirme le fichier bit à bit identique au
  commit précédent. (Un petit serveur Node séparé aurait été plus propre,
  mais son lancement est refusé par la politique de permissions.)
  VÉRIFIÉ SANS CAPTURE D'ÉCRAN, une fois de plus (le volet ne compose
  toujours pas d'image), donc par sonde : les deux PNG font bien 512x512 ;
  coins du « any » transparents et non blancs, et zéro blanc opaque sur
  les bords ; zéro pixel transparent sur les quatre bords du « maskable »,
  donc le ciel saigne partout ; nuage et soleil entièrement dans le disque
  de 80 % ; les trois `src` du manifeste et les deux `<link>` du `<head>`
  répondent 200 en `image/png` ; `theme_color` toujours égal au `<meta>` ;
  le 64 et le 192 sont prouvés PEINTS par comptage (marine, encre blanche,
  ambre présents dans les deux). PIÈGE À CONNAÎTRE : un fichier supprimé
  répond quand même 200 sur le serveur de développement, car vite sert
  `index.html` en repli — un chemin inventé donne exactement la même
  réponse. Ne pas conclure de ce 200 que le fichier existe encore.
  LE JUGEMENT VISUEL REVIENT À XAVIER, comme pour la planche du
  28/07/2026 : les quatre fichiers se regardent dans `public/`.

- 29/07/2026 — APPLICATION ANDROID (Capacitor 8.4.2). La page devient une vraie
  application installée. `appId: fr.queltemps.app` (choix de Xavier, DÉFINITIF
  une fois publié sur le Play Store), `webDir: public` puisqu'il n'y a aucune
  compilation côté client. Installée et VÉRIFIÉE sur un Redmi Note 11 réel
  (Android 13, arm64).
  LE POINT CENTRAL, ET IL EST STRUCTUREL : l'APK ne contient AUCUN serveur.
  Capacitor sert la page depuis `https://localhost`, donc le
  `fetch("/api/nearest")` relatif y tombait dans le vide. D'où `baseApi()` dans
  `public/index.html`, et TROIS cas et non deux. Le troisième est celui qu'on
  rate : sous LIVE RELOAD, la WebView charge le serveur vite du poste, où
  `/api/nearest` route vers le vrai `handleNearest`. Tester « suis-je natif »
  ferait interroger la PRODUCTION en croyant tester son code local, sans le
  moindre message. La bonne question est « suis-je servi par le serveur de
  fichiers de l'APK », d'où la comparaison de `location.origin`.
  Corollaire : `androidScheme` et `hostname` sont désormais ÉCRITS dans
  `capacitor.config.ts` alors qu'ils sont déjà les défauts. Ils portent le
  fonctionnement de `baseApi()` : un changement de défaut ferait basculer la
  comparaison sans qu'aucun test ne bronche, et l'application se lancerait sans
  plus jamais afficher la météo.
  CORS, et la leçon de conception : les en-têtes ont quitté `handler` pour une
  fonction PURE `responseHeaders`, parce que `handler` est la seule partie que
  les tests n'atteignent pas. Posé sur TOUS les codes, échecs compris — un 400
  illisible depuis une autre origine forcerait le client à afficher une panne
  réseau, donc à mentir sur la cause. Vérifié par MUTATION (restreindre aux 200
  fait tomber un test, et lui seul) PUIS sur le téléphone : position invalide →
  ciel `err` + « Position inutilisable », donc le corps du 400 a bien été LU.
  Corrigé au passage un défaut réel : le rejet immédiat d'une position invalide
  sortait avant toute pose d'en-tête.
  PERMISSION : `ACCESS_COARSE_LOCATION` seule, pas FINE. La page n'active pas
  `enableHighAccuracy`, et trouver une station à 20 km n'exige pas le GPS.
  Vérifié sur le manifeste FUSIONNÉ (celui de l'APK, pas le nôtre) : FINE n'est
  pas réapparue par une bibliothèque. Question laissée ouverte à l'étape 4 et
  désormais TRANCHÉE PAR L'OBSERVATION : la WebView de Capacitor demande la
  permission d'elle-même (passage de `granted=false` à `granted=true` avec le
  drapeau `USER_SET`). `@capacitor/geolocation` est donc INUTILE, une
  dépendance évitée.
  COMMENT PROUVER LA GÉOLOCALISATION DEPUIS BRUMATH, et c'est le piège de tout
  ce projet : le repli d'échec EST Brumath (48.73, 7.71). Succès et échec
  donnent le même écran. La discrimination ne peut donc pas être visuelle. Elle
  s'est faite sur `dernierePosition`, lu dans la page en fonctionnement :
  [48.72072072072072, 7.729070390781587], c'est-à-dire une coordonnée MESURÉE
  et non la constante. Sur émulateur, la parade équivalente est de le placer
  loin de Brumath.
  MÉTHODE À RÉUTILISER, la plus précieuse de la session. MIUI refuse à adb la
  capture d'écran ET l'injection de touches (elles exigent « Débogage USB
  (paramètres de sécurité) »). On a donc lu la page AUTREMENT : la WebView d'un
  build debug expose un socket `webview_devtools_remote_<pid>`, qu'on relie par
  `adb forward tcp:9222` puis qu'on interroge en `Runtime.evaluate` via le
  protocole DevTools (script `eval.ps1`, WebSocket en PowerShell). C'est ce qui
  a permis de tout constater sans voir l'écran : origine, `baseApi()`, position
  réelle, texte affiché, polices chargées, débordement horizontal, chemin
  d'échec, bascule anglaise. Même esprit que les sondes `getBBox` du 28/07.
  PIÈGE D'ENCODAGE, une variante de plus : `adb exec-out screencap -p > f.png`
  CORROMPT le PNG sous PowerShell, qui y insère un BOM UTF-8. Passer par
  `adb shell screencap` puis `adb pull`, qui est binaire.
  XIAOMI : `adb install` échoue en `INSTALL_FAILED_USER_RESTRICTED` tant que
  « Installer via USB » n'est pas activé (compte Mi requis). Ni `/data/local/tmp`
  ni `pm install` ne contournent : la restriction porte sur QUI installe, pas
  sur l'emplacement. Repli qui marche : `adb push` vers /sdcard/Download puis
  installation à la main. À savoir aussi, sinon on cherche longtemps : un
  fichier déposé par adb n'est pas indexé, il n'apparaît donc pas dans la vue
  « Téléchargements » du gestionnaire de fichiers.
  ÉMULATEUR NON UTILISABLE ici : l'image x86_64 exige « Windows Hypervisor
  Platform », désactivé sur le poste. C'est un réglage système, laissé à
  Xavier. Le test sur matériel réel est de toute façon plus probant.
  MIS EN LIGNE le 29/07/2026 : `design-system` fusionné dans `master` en avance
  rapide et poussé, ce qui a publié D'UN COUP le système de design, les icônes,
  le logo, le renommage QuelTemps, le manifeste installable et le CORS.
  Production vérifiée : CORS `*` sur 200 ET sur 400, titre QuelTemps,
  `data-lum`, lien du manifeste, quatre icônes et polices en 200. Le
  `Content-Type` du manifeste, que l'entrée du 28/07 disait « non vérifiable
  sans déployer », est confirmé `application/manifest+json`.
  PIÈGE DE DIAGNOSTIC à ne pas répéter : j'ai d'abord cru la production
  corrompue en constatant que la page en ligne contenait `data-sky` alors que
  `master` était censé être antérieur au système de design. FAUX : `data-sky`
  existait DÉJÀ, avec les valeurs `day`/`night`. Le système de design n'a pas
  introduit cet attribut, il en a changé le SENS et ajouté `data-lum`. Le bon
  marqueur était `data-lum`. Un discriminant mal choisi fabrique une panne
  imaginaire.
  PAS DE TEST sur `capacitor.config.ts` ni sur le projet `android/` : ce sont
  des fichiers de configuration, et la page reste non testée pour la raison
  déjà écrite le 28/07.

- 29/07/2026 — FINITION « PLAY STORE ». Demande de Xavier : passer d'un design
  déjà bon à une impression de qualité premium, SANS refonte, sans casser une
  fonctionnalité et sans toucher à l'API. `public/index.html` seul. Les 301
  tests et le type-check sont restés verts de bout en bout, ce qui était
  attendu : la page n'est pas testée (raison inchangée depuis le 28/07).
  LE RENVERSEMENT PRINCIPAL : la chaîne METAR n'ouvre plus la page. Elle
  l'ouvrait depuis le premier jour, et la maquette en faisait la signature du
  produit — mais pour le grand public, qui EST la cible déclarée, c'est une
  suite de sigles illisible en première position. La page commence désormais
  par l'icône, le temps qu'il fait, le conseil, la température et le badge ;
  la provenance vient ensuite ; le METAR se déplie à la demande depuis la
  carte de provenance. Il devient une fonction d'EXPERT, il ne disparaît pas.
  DEUX DÉCISIONS DU 28/07 SONT RENVERSÉES, sur demande explicite de Xavier, et
  il faut le savoir avant de « corriger » ce qui ressemble à une régression :
  (a) l'icône météo de tête REVIENT. Elle avait été retirée sur son arbitrage
  inverse (« le ciel dit déjà le temps qu'il fait »). L'argument qui l'emporte
  aujourd'hui : le ciel est un FOND, il se lit par imprégnation ; un symbole
  se lit d'un coup d'œil. Les 24 icônes gardées « inutilisées mais prêtes »
  dans le sprite ont servi exactement à ça, et ont économisé la session
  qu'aurait coûtée leur redessin.
  (b) l'heure locale d'observation n'est plus AFFICHÉE (« Mis à jour il y a
  6 min » remplace « Observé à 15:00 heure locale · il y a 6 min »). Elle est
  toujours LUE : c'est elle qui place le soleil sur son arc. Ne pas croire
  `observedLocal` inutilisé.
  LE DÉFAUT LE PLUS INSTRUCTIF, et il dormait depuis le 28/07 : `--ico-sun` et
  `--ico-wet` n'étaient DÉFINIS NULLE PART. Les accents avaient été mesurés et
  validés le 28/07 au matin, puis le système de design a retiré l'icône de
  tête l'après-midi ; plus rien ne les consommait, et `.c-sun`/`.c-wet`
  retombaient silencieusement sur leur repli `currentColor`. Le sprite serait
  donc redevenu MONOCHROME à la seconde où l'on repose une icône. Restaurés,
  et attachés à la POLARITÉ et non à la condition : c'est l'axe qui décide
  déjà de l'encre et du verre. Leçon générale : un jeton dont plus personne ne
  se sert ne meurt pas, il attend, et son repli est ce qu'on verra.
  LA PHRASE DE CONSEIL, et son découpage. C'est la SEULE chose de la page qui
  ne vienne ni du METAR ni du bloc `text`. Elle est déduite de valeurs déjà
  rendues par le contrat, donc elle vit côté page : la mettre côté serveur
  imposerait de toucher `types.ts`. Découpage volontairement identique à
  `icon.ts` / `headlineText` : `conseilToken(r)` est NEUTRE et rend un jeton,
  le vocabulaire vit dans `TEXTES` sous `c_<jeton>`. Xavier réécrit les neuf
  phrases sans lire une seule condition, et les deux langues ne peuvent pas
  diverger sur QUAND la phrase apparaît. L'ordre des tests reprend la priorité
  d'icône du contrat, pour que le symbole et la phrase ne racontent pas deux
  histoires ; le vent s'y glisse avant la pluie (sous la pluie, c'est lui qui
  décide si le parapluie sert). Quand rien n'est notable, la ligne DISPARAÎT :
  une phrase affichée en permanence ne veut plus rien dire.
  DEUX PIÈGES ÉVITÉS DANS `conseilToken` : le brouillard exige la VALEUR de
  visibilité et pas seulement le jeton (`mist`, `dust`, `smoke` partagent le
  ciel `fg` sans forcément boucher la vue — annoncer « visibilité très
  réduite » à 8 km serait faux) ; et le froid/chaud se juge sur le RESSENTI,
  absent duquel on se tait plutôt que de retomber sur la température sèche,
  qui ment par grand vent.
  HIÉRARCHIE DES CARTES : elle ne pouvait PAS passer par la largeur, car
  `.grid .card` occupe déjà les trois colonnes — « plus large » n'existe pas
  ici. Elle passe donc par la respiration interne, la taille de l'icône et
  celle de la phrase (`.card.majeur`). Une seule rubrique la porte : le vent.
  CONTRASTE, sonde du 28/07 REPASSÉE et non supposée. Elle a d'abord été
  VALIDÉE contre une valeur connue : son témoin « texte sur ciel » ressort à
  6,64, exactement la valeur consignée le 28/07. Elle a ensuite servi : la
  bordure `--hair` du badge et de la capsule tombait à 1,01:1 sur le fond de
  la pastille, donc une pastille sans contour visible. `--card-border` la
  remonte à 3,13. Texte du badge et de la capsule à 4,78 (pire cas `sct` de
  jour), conseil sur ciel à 5,80. Les pires cas sont tous en HAUT d'écran, là
  où le voile de lecture agit le moins, et c'est justement là que vivent ces
  éléments. RÈGLE QUI EN DÉCOULE et qui vaut pour la suite : tout composant
  neuf se bâtit sur les jetons DÉJÀ mesurés. Un `rgba()` inventé passe tous
  les contrôles qu'on peut faire à l'œil et aucun de ceux qui comptent.
  ANIMATIONS : rien n'a été AJOUTÉ au ciel, qui animait déjà pluie, neige,
  étoiles, éclair, brouillard et dérive des nuages via `--fx`/`--fx-anim`.
  Une seconde couche aurait coûté du GPU pour redire la même chose. Deux
  respirations seulement, en opacité et en échelle donc composées sans
  repeinte : le halo de l'icône de tête, et celui du disque solaire. Sur ce
  dernier, l'échelle était EXCLUE d'avance : le disque est positionné par
  `cx`/`cy`, une mise à l'échelle l'aurait fait glisser vers l'origine du SVG.
  On n'anime donc que l'opacité et le rayon.
  ÉCARTÉ, et c'est un refus de promettre ce qui n'existe pas : « Choisir une
  autre ville » / « Rechercher une ville ». La feuille ne sait pas chercher
  une ville, il n'y a pas de géocodeur dans le projet. Le bouton dit donc
  « Choisir un autre lieu », ce qu'elle offre réellement.
  VÉRIFIÉ PAR SONDE, toujours sans capture d'écran : les dix jetons de conseil
  forcés un à un (y compris le cas « rien à dire »), repli `#i-unknown` sur
  jeton inconnu ET nul, `isStale`, `distanceKm` nulle, station sans nom,
  `sun` nul, `ageMinutes` absent, chargement, panne FR et EN, accueil
  réaffiché après panne (ciel bien revenu au neutre), parité fr/en des 18
  clés nouvelles, aucune clé orpheline, cibles tactiles toutes ≥ 24 px,
  débordement horizontal nul à 375 px et en pleine largeur, feuille
  atteignable par pointage réel sur chaque contrôle, rayons unifiés
  (24 px cartes, 20 px contrôles via `--radius-ctl`), accents résolus dans
  les DEUX polarités. Console sans erreur.
  LA RÉGRESSION GUETTÉE, celle du 28/07 (la page à moitié française) : tout
  libellé statique neuf est câblé dans `appliquerChrome` et non dans
  `afficher`. Vérifié dans le cas qui la déclencherait — bascule en anglais
  alors que le METAR est DÉPLIÉ : le bouton passe bien à « Hide the METAR » et
  non à « Show ». Piège voisin, évité : `openSheet` contient désormais une
  icône, donc un `textContent` sur le bouton l'effacerait à la première
  bascule de langue. Le texte va dans `#openSheetTxt`.
  TROIS CORRECTIONS DE SECONDE PASSE, toutes trouvées en relisant ce qui
  avait été vérifié sur un SEUL cas :
  (a) le halo de l'icône de tête était ambré sur TOUS les jetons, parce que
  seul `clear_day` avait été regardé. Un halo chaud derrière `#i-rain` ou
  `#i-fog` peint une source de lumière que le METAR ne rapporte pas. Il
  prend maintenant l'encre par défaut, et l'ambre seulement sur les neuf
  jetons qui portent un astre ou un éclair (`JETONS_ASTRE`), ce qui est la
  distinction de la planche d'icônes elle-même.
  (b) `hail` était rangé dans `JETONS_NEIGE` et annonçait donc « neige en
  cours ». La grêle n'est pas de la neige : elle partage son CIEL dans la
  table CIELS, ce qui est un regroupement visuel et non une équivalence de
  fait. C'est exactement la faute déjà évitée sur `mist`/`dust`/`smoke`.
  Elle a désormais son jeton `grele` et sa phrase. `sleet` reste dans la
  neige, à raison.
  (c) l'échelle typographique était restée à faire (le point 12 demandait
  d'uniformiser les tailles de police, pas seulement les rayons). Dix
  jetons `--fs-*`, et une seule valeur RÉELLEMENT changée : 12,5 px sur la
  ligne brute, seule taille hors gamme. L'intérêt n'est pas le rendu
  d'aujourd'hui mais l'addition de demain, qui prendra une taille dans la
  liste au lieu d'en inventer une. Les deux tailles fluides (titre, chiffre
  géant) restent en `clamp()`, elles dépendent de la largeur d'écran.
  L'ICÔNE PASSE À DROITE DU CHIFFRE (29/07/2026, second retour de Xavier).
  Elle ouvrait la page, au-dessus du titre, où elle ne se rattachait à
  rien ; appariée à la température, les deux signaux qui répondent à
  « quel temps fait-il » tiennent la même ligne du regard. Trois points
  qui se mesurent plutôt qu'ils ne se raisonnent : `space-between` et non
  un `gap` (le chiffre est fluide en 33vw, c'est donc l'icône qui vient à
  lui et non l'inverse) ; `align-items: center`, qui aligne les centres
  OPTIQUES — une icône n'a pas de ligne de base, un alignement sur celle
  du chiffre la ferait flotter ; et une amplitude fluide plus faible que
  celle du chiffre (19vw contre 33), sans quoi l'icône finirait par lui
  disputer la vedette. Mesuré : écart des centres 0 px à toutes les
  largeurs, rapport de hauteur 0,67, et au PIRE CAS de largeur que le
  contrat autorise (-38°, trois caractères plus le degré) il reste 28 px
  libres à 320 px d'écran, sans troncature ni débordement.
  À REVOIR, signalé plutôt que caché : `--sw: 2.6` sur l'icône de tête est
  REPRIS du sprite, pas mesuré. Or ce fichier dit lui-même que l'épaisseur
  de trait est un des deux réglages « qui se mesurent, pas qui se
  raisonnent », et qu'une valeur unique ne tient pas à deux tailles. À
  corriger si Xavier trouve le trait maigre à 5,4 rem.
  EN ATTENTE DE XAVIER — les 19 formulations nouvelles, marquées `[à valider]`
  dans `TEXTES` (règle anti « parser contre lui-même » : proposées, jamais
  entérinées), et les SEUILS de `conseilToken`, qui sont d'une autre nature :
  ce sont des décisions et non des mesures. Ils sont nommés et groupés dans
  la constante `SEUILS` pour se discuter d'un coup d'œil.

- 29/07/2026 — RECHERCHE DE VILLE. La feuille « Où êtes-vous ? » n'offrait que
  latitude et longitude depuis le premier jour : utilisable par qui sait lire
  une carte, par personne d'autre, alors que le projet vise le grand public.
  Demande de Xavier, qui a TRANCHÉ les deux points que je ne pouvais pas
  trancher seul : la source (Open-Meteo) et le sort des coordonnées (repliées
  en mode expert, pas supprimées).
  CINQ FICHIERS, dans l'ordre imposé par les règles absolues : `src/types.ts`
  (contrat d'abord), `tests/geocode.test.ts` (test avant code, 28 tests),
  `src/geocode.ts`, `api/geocode.ts`, puis `vite.config.ts` et la page.
  329 tests, type-check 0.
  POURQUOI UN POINT D'ENTRÉE SÉPARÉ et non un mode de plus sur /api/nearest :
  le service rendu n'est pas le même (traduire un nom, pas décoder un METAR),
  et les mêler aurait donné une union d'erreurs dont la moitié des codes
  n'aurait aucun sens selon l'appel. Corollaire à NE PAS « corriger » :
  `GeocodeErrorCode` ne réutilise pas `ApiErrorCode`. Y ajouter « ville
  introuvable » aurait cassé la garantie du `switch` exhaustif de
  `statusForReason`, où un motif nouveau doit rester une erreur de
  COMPILATION et non un 500.
  OPEN-METEO CONTRE NOMINATIM, et c'est un choix d'exploitation : Nominatim
  impose une requête par seconde, un en-tête d'identification et une
  attribution visible, et se réserve de bloquer. Open-Meteo ne demande ni clé
  ni compte, comme aviationweather.gov.
  LE CLIENT N'APPELLE PAS LA SOURCE DIRECTEMENT, alors qu'il le pourrait (CORS
  ouvert) et que ce serait plus simple. C'est l'engagement pris devant Xavier
  au moment du choix : passer par /api/geocode évite d'envoyer sa saisie et
  son adresse IP au tiers. `responseHeaders` est réutilisé tel quel depuis
  api/nearest.ts, l'APK étant inter-origine comme pour l'autre point d'entrée.
  LE PIÈGE DE LA SOURCE, et il vaut le détour parce que c'est LE MÊME que le
  204 d'AWC du 26/07/2026 sous un autre déguisement : une recherche sans
  résultat rend HTTP 200 avec la clé `results` PUREMENT ABSENTE, et non un
  tableau vide. Un `payload.results.map(...)` écrit de mémoire lève, et
  l'exception se serait comptée en panne réseau : une faute de frappe aurait
  affiché « source injoignable ». Vérifié par MUTATION dans les deux sens :
  supprimer la garde fait tomber 4 tests nommés, rendre le sans-résultat
  réessayable en fait tomber 1.
  ON NE CHOISIT PAS À LA PLACE DE L'UTILISATEUR. « Paris » rend cinq
  correspondances (France, Texas, Tennessee, Kentucky, Illinois) et la source
  ne documente aucun ordre de pertinence : prendre `results[0]` en silence
  l'aurait envoyé à 7000 km sans un mot. Une correspondance unique passe donc
  directement — c'est le cas courant, et faire choisir entre un seul élément
  serait une étape pour rien —, plusieurs affichent une liste avec région et
  pays, qui sont là pour LEVER l'homonymie et non pour décorer.
  LA LANGUE EST OBLIGATOIRE dans `buildGeocodeUrl`, pas un défaut, et pour une
  raison vérifiée et non supposée : la source traduit ses régions
  (« Île-de-France » / « Île-de-France Region », « États-Unis » / « United
  States »). Un défaut implicite aurait produit une liste de choix à moitié
  traduite. Même règle que le 3e paramètre de `buildResponse`.
  PAS D'AUTOCOMPLÉTION À LA FRAPPE : ce serait une requête par caractère
  contre un service gratuit, pour un gain nul quand on tape un nom qu'on
  connaît. Un `<form>` donne la validation par Entrée sans qu'on ait à
  l'écouter (avec `preventDefault`, sans quoi la page se rechargerait).
  DÉLAI D'ATTENTE 5 s, CHOISI ET NON MESURÉ, et il faut le dire : les 12 s
  d'awc.ts viennent d'une mesure sur un balayage de bbox en plein océan, lent
  par nature. Un géocodage est une recherche indexée (0,6 ms annoncés par la
  source). À remonter si des `network_error` inexpliqués apparaissent.
  DÉFAUT TROUVÉ PAR LA VÉRIFICATION, et invisible à la lecture : la feuille
  ne portait que trois contrôles, elle en porte maintenant jusqu'à onze
  (recherche, cinq propositions, coordonnées dépliées), soit 685 px mesurés.
  Sur un écran de 667 px elle sortait par le HAUT, et comme elle est `fixed`
  en bas, la partie perdue était INATTEIGNABLE : le bouton « Consulter »
  disparaissait sans que rien ne l'indique. Corrigé par `max-height: 88vh` +
  `overflow-y: auto` (+ `overscroll-behavior: contain`), vérifié à 375x667 :
  le bouton redevient atteignable au pointage après défilement.
  MESSAGES : on mémorise la CLÉ affichée, jamais le texte (`derniereCleVille`),
  ce qui permet de rejouer le message dans l'autre langue à la bascule. Même
  réflexe que `dernierEchec` pour l'écran de panne ; retenir la phrase aurait
  laissé un message français au milieu d'une page anglaise, c'est-à-dire la
  régression du 28/07 en miniature. « Ville introuvable » et « recherche
  indisponible » restent DISTINCTS : le premier est une faute de frappe, le
  second n'a rien à voir avec la saisie.
  VÉRIFIÉ de bout en bout sur la vraie source : Brumath (1 résultat → consulte
  directement), Paris (5 → liste), Reykjavik (2, la ville ET son aéroport →
  liste, puis choix → station de Reykjavik à 2 km, ciel `ovc`), Saint-Étienne
  (accents encodés), zzzzqqqq → 404 `city_not_found`, saisie vide → 400
  `invalid_query`, bascule fr/en sur un message affiché ET sur une liste
  ouverte, cibles tactiles toutes ≥ 24 px, aucun débordement horizontal,
  console sans erreur.
  LE POINT QU'ON POUVAIT RATER EN SILENCE : la bascule de langue relit
  `#lat`/`#lon` pour reconsulter. Une recherche par ville devait donc les
  renseigner, sinon changer de langue après une recherche n'aurait plus rien
  reconsulté, sans le moindre message. C'est `consulter` qui les écrit, donc
  ça marche — mais ça se VÉRIFIE, et ça l'a été (Reykjavik → « Mostly cloudy »
  en anglais, retour au français ensuite).
  EN ATTENTE DE XAVIER : les 10 formulations de la recherche, marquées
  `[à valider]` dans `TEXTES` comme les précédentes.

- 29/07/2026 — QUATRE RETOUCHES DU HÉROS, retours de Xavier sur le rendu.
  (a) LE HALO CHANGE D'ANCRAGE. Il était centré derrière l'ICÔNE, donc il
  éclairait le signal secondaire ; il passe derrière le CHIFFRE, qui est ce
  que la page a de plus important à dire. La classe `.astre` migre de
  `.hero-ico` vers `.temp-row`, qui contient les deux.
  (b) L'ICÔNE SE RAPPROCHE. `space-between` la poussait au bord droit :
  l'œil devait traverser toute la largeur pour relier les deux signaux, ce
  qui défaisait justement ce que leur mise sur une même ligne cherchait.
  `flex-start` et 0,35 rem d'écart : ils forment un seul bloc.
  (c) LE CHIFFRE DEVIENT LA SIGNATURE. Graisse 500 et dégradé blanc → crème
  à peine tiède, appliqué au glyphe. AU PASSAGE, UNE ERREUR DU JOURNAL EST
  CORRIGÉE : le commentaire disait « Instrument Sans s'arrête à la graisse
  400 ». C'est faux, le fichier est VARIABLE et déclaré `font-weight:
  400 700` ; ce qui n'existe pas, c'est le 200 que demandait la maquette,
  sous la borne BASSE. Le 500 est donc réellement rendu.
  LE DANGER DE CETTE TECHNIQUE, et pourquoi elle est sous `@supports` :
  `background-clip: text` exige `color: transparent`. Là où elle n'est pas
  gérée, le chiffre ne se dégraderait pas — il DISPARAÎTRAIT. C'est la seule
  règle de cette feuille dont l'échec efface au lieu de dégrader.
  Contraste mesuré, la couleur du BAS du dégradé étant le pire cas : 6,43
  contre 6,64 pour du blanc pur, soit 0,21 payé pour l'effet. Le témoin de
  la sonde retombe encore sur 6,64, la valeur consignée le 28/07.
  (d) LE BADGE devient « Station météo officielle ». Le repère de lieu est
  celui du SPRITE et non l'émoji 📍 de la demande : même dessin à l'écran,
  mais un émoji dépend de la police du système, donc change de style d'un
  téléphone à l'autre. C'est déjà le signe de la capsule et du bouton
  principal — trois fois le même pour la même idée.
  DÉFAUT INTRODUIT PUIS CORRIGÉ DANS LA MÊME PASSE, et il n'était visible
  qu'à la mesure : le halo fait 145 % de la largeur du chiffre et est centré
  sur lui, donc sur une température à trois caractères il dépassait de 63 px
  À GAUCHE de la page et créait une barre de défilement horizontale. Réglé
  par `overflow-x: clip` sur `main` — `clip` et NON `hidden`, qui aurait fait
  de `main` un conteneur de défilement et cassé le ciel fixe. Vérifié après
  coup que le ciel couvre toujours l'écran et que la feuille reste ancrée en
  bas (elle vit hors de `main`, donc elle n'était pas menacée, mais ça se
  vérifie plutôt que ça ne se suppose).

- 29/07/2026 — LE SIGNE « ° » AVAIT DISPARU, et le défaut mérite d'être
  consigné parce qu'il est d'une classe qu'on ne trouve pas en relisant.
  Il a été introduit par le dégradé du chiffre, quelques minutes plus tôt,
  et c'est Xavier qui l'a vu à l'écran. Mécanique : le dégradé impose
  `-webkit-text-fill-color: transparent` sur `.temp`, et le remplissage
  s'HÉRITE ; or `.deg` porte `opacity: .6`, qui l'isole dans son propre
  groupe de composition, hors d'atteinte du dégradé clippé du parent. Le
  caractère restait donc dans le document, gardait sa place (20 x 45 px
  mesurés), répondait au pointage — et n'était peint avec aucune couleur.
  CE QUE ÇA ENSEIGNE SUR MES PROPRES SONDES : toutes celles de la session
  vérifiaient la PRÉSENCE (getBBox non vide, elementFromPoint qui atteint,
  textContent juste). Les trois passaient ici. C'est la même leçon que le
  29/07 sur l'icône iOS : « compter ce qui est là ne dit rien de ce qui
  manque », et il faut y ajouter « ni de ce qui est là sans être peint ».
  Une propriété héritée qui rend invisible ne se voit qu'en interrogeant la
  COULEUR RÉSOLUE, ou en regardant l'écran.
  Corrigé en redonnant à `.deg` un remplissage explicite, pris sur `--ink`,
  donc suivant les deux polarités.
  À NOTER POUR LES PROCHAINES SESSIONS : le volet navigateur COMPOSE
  désormais des images. Les entrées des 28 et 29/07 répètent « vérifié sans
  capture d'écran » parce qu'il ne le faisait pas ; ce n'est plus vrai. Les
  sondes gardent tout leur intérêt (elles mesurent ce que l'œil ne sait pas
  mesurer), mais une capture reste le seul contrôle qui aurait attrapé
  celui-ci du premier coup.

- 29/07/2026 — `design-system` FUSIONNÉ DANS `master` ET POUSSÉ (avance
  rapide, 329 tests verts, type-check à 0). Contenu : recherche de ville,
  les quatre retouches du héros, le correctif du signe « ° ». Déploiement
  Vercel déclenché par ce push, sur `metar-proche-three.vercel.app`.

- 29/07/2026 — PREMIER APK COMPILÉ DEPUIS CETTE SESSION, et où trouver le
  JDK sur CE poste puisque ni Java ni Android Studio complet n'y étaient
  installés au départ. Android Studio vit en réalité sur `H:\AndroidStudio`
  (pas sous `Program Files` ni `AppData\Local`, contrairement à l'emplacement
  par défaut) : son chemin est lisible dans
  `%LOCALAPPDATA%\Google\AndroidStudio<version>\.home`. Le JBR qu'il embarque
  est donc en `H:\AndroidStudio\jbr`. Compilation :
  `npx cap sync android` (depuis la racine du dépôt, PAS depuis `android/` —
  piège rencontré : `cap sync` échoue en silence avec « android platform has
  not been added yet » si on est déjà dans `android/`) puis, depuis
  `android/`, `JAVA_HOME="H:\AndroidStudio\jbr" ./gradlew assembleDebug`.
  APK produit : `android/app/build/outputs/apk/debug/app-debug.apk`.
  Installé et VÉRIFIÉ FONCTIONNEL par Xavier sur son téléphone (Redmi Note
  11, méthode d'installation manuelle déjà documentée le 29/07 — pas
  d'« Installer via USB »).
  À RETENIR : ce chemin H:\AndroidStudio est propre à CE poste, comme
  `sdk.dir` dans `android/local.properties`. Un autre poste peut avoir Java
  sur le PATH directement, auquel cas cette recherche est inutile.

- 30/07/2026 — NEUF DEMANDES DE XAVIER, et pour la première fois du projet la
  session a commencé par SEPT QUESTIONS avant d'écrire une ligne. C'est lui qui
  l'a demandé, et ça valait mieux qu'un devinage : trois des sept réponses
  changeaient l'architecture, pas la présentation.
  L'INDICE UV N'EST PAS DANS UN METAR, et rien dedans ne permet de le calculer
  (couverture nuageuse, pas éclairement). C'était donc une SECONDE SOURCE amont
  et une évolution de `types.ts`, c'est-à-dire exactement l'un des trois cas où
  ce fichier impose d'interrompre Xavier. Vérifié fonctionnel avant de le
  proposer : `api.open-meteo.com/v1/forecast?current=uv_index` rend 6,10 à
  Brumath, sans clé, rafraîchi toutes les 15 minutes, même fournisseur que le
  géocodage.
  ARBITRAGE : appel SÉPARÉ et NON BLOQUANT (`/api/uv`, `src/uv.ts`,
  `tests/uv.test.ts`, 28 tests). La page lance les deux requêtes ensemble et
  n'attend JAMAIS l'UV. C'est la propriété qui compte : une source ajoutée ne
  peut pas dégrader le service qui existait avant elle. Un échec UV est
  SILENCIEUX — l'utilisateur venu voir la météo l'a déjà sous les yeux.
  LA GARDE DE GÉNÉRATION est la partie qu'on aurait pu oublier : deux
  consultations rapprochées (bascule de langue, choix de ville) lancent deux
  appels, et si le premier revient après le second il écrit l'UV de Brumath sur
  la page de Reykjavik. Un compteur suffit ; sans lui, le défaut n'apparaît
  qu'en réseau lent.
  `UvErrorCode` ne réutilise PAS `ApiErrorCode`, même raison que
  `GeocodeErrorCode` le 29/07 : le `switch` exhaustif de `statusForReason` doit
  rester une garantie de compilation.
  Quatre mutations vérifiées : classer sur la valeur brute, lire `uv_index` à
  la racine, réessayer un 4xx, rendre UV 0 sur charge inattendue.
  L'ARRONDI PRÉCÈDE LA CLASSIFICATION, sinon 2,6 s'affiche « UV 3 » en portant
  le jeton `low` : le chiffre contredirait la phrase. Même garantie que le
  sélecteur partagé entre `pickIcon` et `headlineText`.

  L'ACCENT NE POUVAIT PAS ÊTRE L'AMBRE DES ICÔNES, et il l'a été une heure.
  Xavier avait choisi de réutiliser l'ambre existant plutôt qu'une troisième
  teinte, ce qui était le bon choix — mais un accent se pose PARTOUT, alors
  qu'une icône est mesurée là où elle est posée. Repassé sur les 20 ciels x 21
  hauteurs SUR FOND DE CARTE, l'ambre validé du 28/07 tombe à 2,25:1 en
  polarité sombre (sct de jour, verre renforcé) et 2,16 en claire (sn de jour),
  sous le seuil de 3:1 des éléments graphiques. D'où DEUX jetons de la même
  famille : `--ico-sun` intact (validé, on n'y touche pas) et `--accent`
  mesuré à 3,12 / 3,28. Les valeurs plus chaudes ont été essayées et rejetées
  PAR LA MESURE (#FFC466 donne 2,89, écart que l'œil ne voit pas).
  RÈGLE D'EMPLOI À TENIR : `--accent` ne porte que du GRAPHIQUE, jamais du
  texte. En polarité claire il fait 3,28 — au-dessus du 3:1 graphique, en
  dessous du 4,5:1 du texte. Un mot écrit en accent serait une régression
  invisible à l'œil.

  LE FOND DU BOUTON METAR NE POUVAIT PAS ÊTRE « LÉGÈREMENT PLUS CLAIR », et
  c'est le défaut le plus contre-intuitif de la session. Posé en
  `--card-bg-strong` comme la demande le suggérait, il empilait un second verre
  clair sur le verre de la carte : son libellé passait de 5,00 à 3,23:1, donc
  SOUS le seuil, alors qu'il le tenait avant la retouche. Un fond « plus
  visible » qui efface son propre texte. Le remplissage va donc dans le sens
  qui SÉPARE, et ce sens dépend de la polarité (`--raw-fill` : plus sombre sous
  encre claire, plus clair sous encre sombre). Mesuré : texte 6,58, bordure
  3,70, chevron 3,97.
  CE QUE CE FOND NE FAIT PAS : sur les ciels presque noirs (ts, night),
  assombrir de 18 % ne se voit pas. Ce sont la bordure de contrôle, l'icône et
  le chevron qui portent le « c'est un bouton » là — trois signaux qui ne
  dépendent d'aucun écart de luminosité.

  LA CARTE DU SOLEIL GRANDISSAIT AU LIEU DE MAIGRIR : 211 -> 295 px. Cause,
  invisible à la lecture : `.sun svg` est un sélecteur DESCENDANT, et il
  attrapait les deux nouvelles icônes de borne en leur donnant `width: 100%`.
  Corrigé en `.sun > svg`. Une icône démesurée ressemble à un choix graphique
  tant qu'on ne compare pas les hauteurs — seule la mesure l'a vu.

  LE BARÈME DE CONFORT SE CORRIGE PAR SES SORTIES, jamais par la plausibilité
  de ses coefficients. Premier jeu de pénalités : 38 °C ressentis ressortaient
  « correct, sans plus » (dangereux à dire), un orage à 48 % « peu agréable ».
  Recalibré en regardant les treize situations rendues, pas les nombres.
  ARBITRAGE DE XAVIER, et c'est une question d'honnêteté et non de prudence :
  la carte DISPARAÎT dès qu'une seule des cinq entrées annoncées manque.
  « 94 % » calculé sur trois entrées sur cinq affirme une précision que la
  donnée n'a pas, et le libellé qui énumère les entrées rend le mensonge
  explicite. Les sept cas de retrait sont vérifiés un par un.

  FAUSSE PISTE CONSIGNÉE, parce qu'elle est la plus instructive : j'ai cru la
  rotation du chevron CASSÉE (transform calculé = identité alors que la règle
  existait, que son sélecteur correspondait, qu'aucune autre ne la
  concurrençait), j'en ai conclu que le moteur refusait un `transform` sur un
  `<svg>` racine, et j'ai ajouté une enveloppe `<span>` pour le contourner.
  C'était FAUX. Le volet ne composant pas d'image, les TRANSITIONS ne
  s'exécutaient pas et `getComputedStyle` rendait l'état de DÉPART, quel que
  soit le temps d'attente. Ce fichier le documente depuis le 28/07 et je ne
  l'ai pas appliqué. Mesuré correctement (`transition: none !important`) : le
  `<svg>` racine et un `<span>` rendent tous deux la même matrice. Enveloppe
  retirée. LEÇON : avant de conclure qu'une propriété CSS ne s'applique pas,
  vérifier que l'instrument peut la voir.
  Deuxième mesure invalide du même genre, corrigée aussi : lire
  `getComputedStyle` sur les formes d'un `<symbol>` dans `<defs>` rend du noir
  par défaut, puisqu'elles ne sont pas rendues. La preuve de peinture reste le
  POINTAGE (96 points sur 384 atteignent la mascotte, ce qui est la signature
  d'un dessin au trait et non d'un rectangle plein).

  LA SONDE DE CONTRASTE A ÉTÉ CALIBRÉE AVANT D'ÊTRE CRUE, et c'est la méthode
  à reprendre : première version, témoin « texte sur ciel » à 6,19 contre 6,64
  consigné le 28/07 — donc sonde fausse, conclusions jetées. Deux causes : le
  voile de nuit était approximé au lieu d'être lu dans la feuille, et la
  polarité était héritée du dernier rendu au lieu d'être posée par
  (ciel, lumière). Corrigée, elle retrouve les QUATRE témoins au centième
  (6,64 / 5,56 / 5,00 / 4,73), ce qui prouve au passage que la compaction n'a
  déplacé aucun contraste — la question qu'elle posait.

  COMPACTION, chiffres réels (arbitrage -25 %) : visibilité 92 -> 70 (-24 %),
  mesures 108 -> 85 (-21 %), soleil 211 -> 121 (-43 %, le point 3 demandait
  plus), provenance 179 -> 158 (-12 %), vent 133 -> 119 (-11 %).
  LE VENT EST EN DESSOUS DE LA CIBLE, et c'est un arbitrage assumé plutôt
  qu'un échec : le point 2 remplace un cadran de 44 px par une rose de 56 qui
  porte quatre points cardinaux, huit graduations et la vitesse. La demande 1
  et la demande 2 tirent en sens inverse sur cette carte ; la densité a été
  préférée à la hauteur. Signalé, pas caché.

  LA ROSE DES VENTS : le défaut de l'ancien cadran n'était pas le dessin mais
  le REPÈRE. Une flèche seule dans un cercle montre une direction sans dire par
  rapport à quoi. Les quatre lettres sont l'ajout utile ; le reste les rend
  lisibles. Les points cardinaux vivent dans `TEXTES` et non dans le SVG parce
  que l'ouest est « O » en français et « W » en anglais — une lettre, et la
  boussole devient fausse pour la moitié des lecteurs. Les deux règles de
  l'ancien cadran sont conservées : l'aiguille montre où le vent VA, et il n'y
  a aucune aiguille sans direction connue.

  LA MASCOTTE : petit nuage, choisi par Xavier parmi ses cinq pistes. Motif à
  connaître, parce qu'il exclut les autres : c'est le seul qui reste JUSTE par
  tous les temps. Un soleil ou une goutte SONT chacun un temps particulier,
  donc contrediraient la moitié des conseils qu'ils portent ; une girouette ne
  parle que du vent. Trois expressions pour dix jetons, via une table
  `EXPRESSIONS` avec repli obligatoire sur `m-neutre`. Elle ne calcule RIEN :
  elle se branche sur le jeton de conseil déjà rendu, donc elle ne peut pas
  sourire pendant que la phrase annonce un orage. La LIGNE ENTIÈRE se masque
  quand il n'y a rien à conseiller — un personnage sans réplique ressemble à un
  texte qui n'a pas chargé.

  VÉRIFIÉ : 357 tests, type-check 0, parité fr/en des 86 clés (aucune
  manquante, aucune vide, aucune orpheline), les 10 jetons de conseil et leurs
  expressions, les 5 niveaux UV et leur jauge, les 7 cas de retrait du confort,
  13 situations de barème, bascule de langue avec le METAR DÉPLIÉ (« Hide the
  METAR » et non « Show », icône et chevron survivants), rose N/E/S/O -> N/E/S/W
  et retour, chevron pivoté à 180° et rendu au repos, six symboles neufs prouvés
  peints, mouvement réduit couvrant les huit nouvelles animations, cibles
  tactiles toutes >= 24 px, débordement horizontal nul à 375 px et en pleine
  largeur, console sans erreur.
  EN ATTENTE DE XAVIER : les 20 formulations nouvelles marquées `[à valider]`
  (4 points cardinaux, 6 pour l'UV, 8 pour le confort, 2 unités) et les SEUILS,
  qui sont d'une autre nature — `SEUILS_CONFORT` et `SEUILS_UV` sont des
  DÉCISIONS, groupés et nommés pour se discuter d'un coup d'œil. Un cas à lui
  soumettre en particulier : 38 °C ressentis donnent 39 % « peu agréable
  dehors », ce que je trouve encore trop généreux.
  QUATRE DÉFAUTS DE SECONDE PASSE, tous trouvés en relisant la session plutôt
  qu'en la vérifiant :
  (a) ATTRIBUTION CC-BY MANQUANTE, et elle était due depuis le 29/07 et non
  depuis l'UV. Open-Meteo distribue son offre gratuite sous CC-BY 4.0, dont le
  crédit EST la condition — or la recherche de ville l'utilisait déjà. Le
  manquement est donc antérieur à cette session. Réparé pour les deux points
  d'entrée, ligne `sources` sous le détail technique. aviationweather.gov
  (NOAA) est du domaine public et n'exige rien ; il est cité quand même, parce
  que dire d'où vient la mesure est le sujet de l'application.
  (b) `color-mix` RETIRÉ, et la leçon est utile pour la suite : sur une
  propriété PERSONNALISÉE, une valeur non comprise n'échoue pas à l'ANALYSE
  (les propriétés personnalisées acceptent presque tout flux de jetons) mais AU
  CALCUL — donc `background: var(--x)` retombe sur `initial`, c'est-à-dire
  transparent. Le chemin des jauges aurait disparu sur les deux cartes neuves.
  Et LA PARADE HABITUELLE NE MARCHE PAS : écrire un `rgba` avant le
  `color-mix` dans la même règle ne laisse aucun repli, puisque le `color-mix`
  est valide à l'analyse et l'écrase purement (vérifié dans le CSSOM, où il ne
  restait qu'une déclaration sur deux). L'accent étant un hex fixe, `color-mix`
  ne calculait rien qu'on ne puisse écrire soi-même : deux `rgba` en dur, et la
  dépendance disparaît avec le risque.
  (c) POUSSIÈRE ET FUMÉE ne coûtaient RIEN au barème de confort : elles
  tombaient à travers toutes les branches, donc une tempête de sable notait
  comme une journée dégagée. C'est la troisième fois que ce piège se présente
  dans ce projet (après `hail` dans la neige et `mist` dans le brouillard) et
  c'est toujours le même : une parenté de CIEL dans la table CIELS n'est pas
  une parenté de fait.
  (d) LE BROUILLARD SE JUGE SUR LA VALEUR de visibilité et non sur le jeton,
  ce que `conseilToken` prenait déjà soin de faire juste à côté. Facturer 20
  points à `mist` sur le seul jeton pénalisait une brume à 8 km. Et 20 ne
  suffisait pas : un vrai brouillard à 400 m ressortait « agréable dehors ».
  `vercel.json` VÉRIFIÉ et non supposé : le bloc `functions` utilise le glob
  `api/*.ts`, donc `/api/uv` hérite de `maxDuration: 30` sans rien ajouter.
  `mpSpin` retiré, orphelin depuis que le cadran a cédé la place à la rose.
  À SOUMETTRE À XAVIER, question de fond et non de mise au point : la carte UV
  porte un nombre MODÉLISÉ, calculé par un tiers, à la position de
  l'UTILISATEUR et à l'instant présent — alors que tout le reste de la page est
  une MESURE prise par un instrument, à la position de la STATION, à l'heure de
  l'observation, et que le badge dit « Station météo officielle ». La carte UV
  a aujourd'hui exactement le même costume visuel que les cartes issues du
  METAR, et rien ne signale la différence. C'est la même exigence que ce
  fichier applique partout ailleurs (refus d'afficher UV 0, confort masqué,
  pas de recherche de ville sans géocodeur) ; la corriger demande une
  formulation, donc son accord.
  PAS DE TEST sur la page, raison inchangée depuis le 28/07.

- 31/07/2026 — NUAGIO REMPLACE LA MASCOTTE DU 30/07. Demande de Xavier, avec
  une planche de style dans `nuagio/nuagio.png` (25 humeurs). `public/index.html`
  seul ; 357 tests et type-check restés verts de bout en bout, la page n'étant
  pas testée (raison inchangée depuis le 28/07).
  CE QU'IL REPRÉSENTE DÉCIDE DE TOUT LE RESTE : la STATION la plus proche, pas
  le temps qu'il fait. C'est ce qui justifie qu'il soit TOUJOURS affiché, et ça
  RENVERSE la décision du 30/07 au matin (« un personnage sans réplique
  ressemble à un texte qui n'a pas chargé »). Ne pas la « rétablir » en croyant
  corriger une régression. Seule la PHRASE se masque quand il n'y a rien à
  conseiller : on n'invente pas de banalité permanente pour lui tenir
  compagnie, ce qui était l'argument du premier passage et reste vrai.
  TROIS INSTANCES ET NON UNE, et c'était le piège de placement : `#card` est
  masqué pendant le chargement (`#skel`) et pendant une panne (`#notice`).
  « Réfléchit » et « perplexe » étaient donc INATTEIGNABLES depuis la seule
  carte. `poserNuagio` règle les trois `[data-nuagio]` d'un coup. Sur l'écran
  de service il est CRÉÉ par `rendreNotice`, qui vide `#notice` : une instance
  écrite en dur y serait effacée au premier message. Il y remplace la pastille
  `.mark` (« ! » dans un rond), même créneau, même rôle — c'est le seul endroit
  où ce chantier touche à l'interface existante, et `.mark` est SUPPRIMÉE
  plutôt que laissée à dormir (leçon `--ico-sun`).
  DOUZE EXPRESSIONS COMPOSÉES, jamais redessinées : `#n-corps` (nuage +
  anémomètre) puis des primitives de visage, et les 12 symboles ne font que les
  assembler par `<use>`. Même architecture que `#p-...` → `#i-...`. C'est ce qui
  rend la contrainte « la silhouette reste identique » vraie PAR CONSTRUCTION,
  et l'anémomètre indérivable d'une expression à l'autre — donc une signature.
  Enrichir = ajouter un assemblage. Pas de pattes (contrainte), donc repère
  32x34 et non 32x48, et le truc du 30/07 (« les pattes ne flottent pas avec le
  corps ») n'a plus d'objet.
  LE DÉFAUT LE PLUS INSTRUCTIF DE LA SESSION, et il vaut pour tout le sprite :
  un sélecteur `.nuagio .n-line` N'ATTEINT PAS le contenu cloné par `<use>`,
  qui n'est pas descendant de `.nuagio` dans le document. Sans `fill:none`
  hérité, le nuage retombait sur le remplissage par défaut : un APLAT NOIR.
  Bien dimensionné, bien atteint au pointage, et faux. C'est exactement
  pourquoi `.ico` porte `fill`/`stroke`/`stroke-width` sur la RACINE. Règle
  désormais explicite : l'héritable va sur la racine, le reste s'écrit SUR la
  forme (attribut de présentation, ou `style` en ligne quand il faut `var()`,
  qu'un attribut de présentation n'accepte pas).
  COROLLAIRE : le groupe animé `.n-body` vit dans le DOCUMENT (autour du
  `<use>`), pas dans les symboles — une classe posée sur la racine ne commande
  rien à travers la frontière du `<use>`. Et LE CLIGNEMENT passe par QUATRE
  PROPRIÉTÉS PERSONNALISÉES animées sur la racine, que les yeux se contentent
  de lire : les propriétés personnalisées s'HÉRITENT, donc elles traversent, ce
  qui est vérifiable — alors que je n'ai PAS pu prouver qu'une animation
  déclarée sur l'original s'applique au clone. Sans `@property` elles s'animent
  par paliers, ce qu'un clignement demande justement.
  QUATRE ANIMATIONS, transform et opacity uniquement. Balancement et tremblement
  REMPLACENT le flottement au lieu de s'y ajouter (deux animations sur
  `transform` se remplacent, elles ne se composent pas). Aucun seuil neuf : le
  vent et le froid viennent des jetons de `conseilToken`, un seuil inventé
  serait une décision de plus à soumettre. Clignement des deux yeux à 28 % d'un
  cycle de 24 s, clin de l'œil droit seul à 73 %, en UNE animation — superposées,
  elles porteraient toutes deux l'opacité et la seconde gagnerait en permanence.
  LA PLANCHE EST UNE RÉFÉRENCE, PAS UNE SOURCE (statut d'`icones.png`). Son
  nuage est blanc plein, contour bleu, halo : intransplantable, et ce dépôt a
  déjà mesuré deux fois cet échec (l'ambre à 1,7:1, le verre « blanc sur blanc »
  des ciels `fg`/`sn`). Nuagio reste au trait sur `--ink`, mesuré dans les deux
  polarités ; ses seuls accents sont `--accent` (joues, graphique uniquement) et
  `--ico-wet` (goutte, flocons), tous deux déjà mesurés. Aucune teinte inventée.
  LA CAPTURE D'ÉCRAN A ÉTÉ LE CONTRÔLE DÉCISIF, et c'est la leçon de méthode.
  Le volet ne composant toujours pas d'image, la planche des 12 a été fabriquée
  au `canvas` (sérialisation du sprite + `drawImage`), déposée par un
  `POST /_depot` TEMPORAIRE ajouté à `vite.config.ts` puis retiré (`git checkout`
  confirme le fichier identique). Elle a montré d'un coup quatre défauts que
  AUCUNE sonde n'avait vus : `n-heureux` indiscernable de `n-sourire` (bouche
  ouverte trop plate), goutte de sueur posée SUR le contour comme une bulle,
  joues virant au gris, anémomètre lisant comme une antenne. Corrigés puis
  revérifiés à l'image. PIÈGE DE SONDE rencontré au passage, à ne pas répéter :
  `elementFromPoint` renvoie le `<use>` quel que soit le point, donc il
  « atteint » aussi bien un aplat noir qu'un dessin au trait — il ne prouve
  RIEN ici. Ce qui prouve, c'est le COMPTAGE DE PIXELS (12-14 % de couverture =
  trait ; ~34 % = aplat). Second piège : une animation sérialisée dans une image
  autonome ne joue pas, ses `@keyframes` étant restées dans la feuille de la
  page — la première mesure du clignement était donc vide de sens.
  VÉRIFIÉ : les 10 jetons de conseil vers leur expression, les 3 états
  (carte / chargement / panne, FR et EN), repos jour et nuit, jeton inconnu →
  repli `#n-sourire`, phrase masquée sans que Nuagio parte, classes de vent et
  de frisson posées seulement où il faut, clignement et clin prouvés en
  variables PUIS en pixels (355 px par œil au repos, ~145 fermé, un seul œil
  au clin), mouvement réduit (0 animation, variables au repos), 12 symboles
  sans orphelin ni manquant, parité fr/en des 87 clés, bascule de langue avec
  le METAR DÉPLIÉ (« Hide the METAR », chevron survivant), cibles ≥ 24 px,
  débordement nul à 375 px et en pleine largeur, console sans erreur.
  DEUX DES CINQ PHRASES D'EXEMPLE SONT HORS D'ATTEINTE, et c'est signalé plutôt
  que contourné : « Le vent se renforce cet après-midi » et « Pas de pluie
  prévue » sont des PRÉVISIONS. Un METAR est une observation, et il n'y a pas
  de source de prévision dans le projet ; en ajouter une serait une seconde
  source amont plus une évolution de `types.ts`, donc l'un des trois cas où ce
  fichier impose d'interrompre Xavier. Les 10 phrases de `conseilToken`
  couvrent les trois autres exemples au présent. Aucune formulation nouvelle
  n'a donc été ajoutée, et la parité fr/en est inchangée.
  À SOUMETTRE À XAVIER : le jugement visuel sur les 12 dessins (la planche se
  refabrique par la méthode ci-dessus), et `--n-sw: 1.2`, qui est MESURÉ au
  rendu (~2,4 px pour 60 px de large, soit 3,75 %, la proportion de l'icône de
  tête) mais dont le rendu final lui appartient.

- 31/07/2026 — CINQ RETOUCHES DE HIÉRARCHIE (demandes de Xavier).
  `public/index.html` seul ; 357 tests et type-check verts de bout en bout.
  (1) LE BANDEAU « Station météo officielle » EST SUPPRIMÉ, élément, style et
  clé dans les DEUX langues. Le supprimer à moitié aurait laissé un bloc CSS
  mort et une clé orpheline, c'est-à-dire la leçon `--ico-sun` du 29/07 : ce
  qui dort revient un jour par son repli. `.capsule` n'était PAS co-stylée
  avec lui malgré ce que le commentaire laissait croire, elle est intacte.
  (2) « Station Météo Aero », repris au mot et à la casse. À SAVOIR : `.label`
  met en capitales, donc l'écran affiche « STATION MÉTÉO AERO ». L'anglais
  (« Aero weather station ») est PROPOSÉ et marqué `[à valider]`.
  (3) LE VENT PASSE SOUS LA CARTE DE STATION, dans un second conteneur
  `.grid` (`#ventSlot`) et non dans une section nue : toute la mise en forme
  mesurée de cette carte (trois colonnes de `.grid .card`, gouttière, poids de
  `.card.majeur`) vient du conteneur grille. Hors de lui il aurait fallu
  réécrire du CSS déjà mesuré ; ici, zéro règle nouvelle. Le décalage
  d'apparition suit (`.d5` ajouté, soleil en d3, relevé en d4, pied en d5).
  (4) LE CONFORT PASSE EN « n/5 » ET NUAGIO Y EMMÉNAGE. Le chiffre se DÉDUIT
  de la tranche (table `NIVEAUX_CONFORT`) et jamais du pourcentage : un
  `Math.round(pct / 20)` aurait fini par afficher « 4/5 » sous « correct, sans
  plus », qui est exactement le défaut que l'arrondi de l'UV évite depuis le
  30/07. `pct` reste calculé — il porte les tranches — mais n'est plus affiché,
  et la jauge suit le chiffre affiché et non lui.
  Nuagio quitte le héros. Son VISAGE vient désormais de la tranche de confort
  (`EXPRESSIONS_CONFORT`, cinq des douze dessins déjà validés, aucun nouveau)
  et son MOUVEMENT reste sur le jeton de conseil : `n-vent` et `n-frisson`
  disent le vent et le froid, qu'une tranche ne distingue pas (un 2/5 peut
  venir d'une canicule comme d'une bourrasque). L'invariant du 30/07 tient
  toujours — il ne recalcule rien, il dérive — et l'orage pèse 68 points donc
  tombe en 1/5, où le visage est vigilant.
  LE PIÈGE D'ORDONNANCEMENT, qui n'aurait rien signalé : l'instance de carte
  est CRÉÉE par `carteConfort`, donc `poserNuagio` a dû être déplacé APRÈS la
  construction du relevé. Laissé où il était (dans le héros, avant), il
  n'aurait plus touché que les instances de chargement et de panne, toutes
  deux masquées, et le visage serait resté figé sur celui du gabarit.
  `EXPRESSIONS` (jeton de conseil → visage) est SUPPRIMÉE, plus personne ne
  s'en servait. `.nuagio-row` aussi : la phrase de conseil restant seule, la
  rangée laissait 10 px de blanc sur les consultations sans conseil, qui sont
  les plus fréquentes.
  CONSÉQUENCE À SOUMETTRE À XAVIER, signalée plutôt qu'arbitrée : la carte de
  confort DISPARAÎT dès qu'une de ses cinq entrées manque (son arbitrage du
  30/07), donc Nuagio disparaît avec elle sur les stations laconiques. Ça
  contredit la raison d'être écrite le 31/07 au matin (« il représente la
  STATION, donc il est TOUJOURS affiché »). S'il le veut toujours visible,
  c'est la règle de disparition de la carte qu'il faut changer, et elle est à
  lui. Vérifié : sans confort, la page reste complète, seul Nuagio manque.
  (5) L'ÉCHELLE UV EST ÉCRITE : « 5/11 » au lieu de « 5 UV ». La question de
  Xavier (« sur combien ? ») EST le défaut, et ce fichier l'avait prédit le
  30/07 (« UV 6 ne dit rien à qui ignore que l'échelle va à 11 »). Le
  dénominateur prend la place de l'unité dans le `<small>` déjà prévu, donc
  AUCUNE formulation nouvelle — l'intitulé dit déjà « indice UV ». La barre
  jaune est `value / 11` peinte en `--accent`, inchangée. Cas assumé : au-delà
  de 11 la carte affiche « 12/11 », jauge pleine, chiffre vrai.
  VÉRIFIÉ (toujours sans capture : le volet ne compose plus d'image cette
  fois-ci non plus) : ordre des blocs, jauges mesurées à 0,6 et 0,4545 —
  MESURE PRISE `transition/animation: none`, sans quoi on lit le scaleX(0) de
  départ et on croit à une jauge vide, piège déjà consigné le 28/07 ; les cinq
  tranches et leurs visages, la nuit qui ne survit que sur les deux bonnes
  tranches, confort absent, chargement (`n-reflechit`) et panne (`n-perplexe`),
  bascule fr/en avec le METAR DÉPLIÉ (« Hide the METAR », chevron survivant),
  rose N/E/S/O → N/E/S/W, parité fr/en des 86 clés (aucune manquante, aucune
  vide), cibles ≥ 24 px, débordement nul à 375 px et à 1280 px, héros qui se
  referme sans conseil, console sans erreur.
  À CONNAÎTRE : le visage et la phrase de conseil peuvent désormais parler de
  deux choses différentes (« Très chaud aujourd'hui » sous un visage calme à
  3/5). Ce n'est pas une contradiction — l'un note le confort global, l'autre
  signale un fait — mais c'est un changement par rapport au 30/07, où les deux
  venaient du même jeton.

- 31/07/2026 — TROIS CORRECTIFS DE SECONDE PASSE, tous vus À L'ÉCRAN par
  Xavier sur capture annotée, aucun par une sonde.
  (a) L'AIGUILLE DE LA ROSE ÉTAIT PEINTE HORS DE LA ROSE, et c'est le défaut
  le plus instructif depuis le signe « ° » du 29/07. Le groupe portait DEUX
  mécanismes de rotation à la fois : `transform-origin: 24px 24px` en CSS et
  un attribut de présentation `transform="rotate(a 24 24)"`, qui contient
  DÉJÀ son centre. Le navigateur applique alors le centre deux fois, et la
  tête partait à ~440 px du centre — par-dessus la phrase du vent, d'où le
  « Vemt d'ouest » visible sur les captures de la veille. La boussole
  paraissait simplement n'avoir pas d'aiguille.
  CE QUI L'A RENDU INVISIBLE : `getComputedStyle` rendait la BONNE matrice
  (`matrix(0,1,-1,0,48,0)` = rotate(90 24 24)), c'est la composition qui
  ajoutait l'origine. Toutes mes vérifications du 30/07 portaient sur la
  matrice et sur `elementFromPoint`, qui atteignait la LETTRE « E » et non
  l'aiguille. Le discriminant qui l'attrape en une ligne est la BOÎTE :
  comparer `getBoundingClientRect` de la tête à celle de la rose. Règle
  générale : pour un élément transformé, mesurer OÙ IL EST, pas quelle
  transformation il déclare.
  Corrigé en passant tout en CSS (`g.style.transform = "rotate(Xdeg)"`, sans
  centre dans la valeur, centre dans `transform-origin`). C'est aussi ce dont
  `mpSweep` a besoin pour le vent variable, dont les images sont en CSS —
  d'où le choix de ce sens plutôt que de supprimer `transform-origin`.
  (b) et (c) LES DEUX JAUGES SONT RETIRÉES (confort et UV). Elles situaient la
  valeur sur son échelle, ce que le chiffre seul ne faisait pas — mais depuis
  que le dénominateur est écrit (« 3/5 », « 5/11 »), l'échelle est dite en
  toutes lettres et la barre la redisait. Même raisonnement que la grande
  icône du 28/07 puis la pastille `.mark` du 30/07.
  SONT PARTIS AVEC ELLES, plutôt que de dormir : les règles `.jauge`, l'image
  clé `mpFill`, le jeton `--accent-ghost` (qui n'existait que pour le chemin
  de la jauge) et la constante `UV_JAUGE_MAX`, plus le paramètre `fraction`
  de `carteChiffre` et `CONFORT_MAX`. La longue note sur `color-mix` que
  portait `--accent-ghost` part avec lui : le piège reste vrai, il n'a plus de
  jeton où se poser, et il est consigné ici (entrée du 30/07).
  EFFET DE BORD SIGNALÉ : les deux cartes ne font plus la même hauteur
  (102 px contre 93). La ligne invisible `.reserve` de la carte UV réserve UNE
  ligne, alors que « TEMPÉRATURE, HUMIDITÉ, VENT, SOLEIL, PLUIE » en occupe
  deux. Sans la jauge qui ajoutait 11 px identiques des deux côtés, l'écart se
  voit. Les cartes sont empilées et non côte à côte, donc rien ne l'exige :
  laissé tel quel, à corriger si Xavier le trouve gênant.
  VÉRIFIÉ, ET CETTE FOIS PAR CAPTURE D'ÉCRAN (le volet compose à nouveau) :
  aiguille dans la rose, tête à droite pour un vent d'ouest et en haut pour un
  vent du sud, vent variable qui balaie toujours autour du centre, zéro
  `.jauge` dans le document, les deux cartes rendues, débordement nul, console
  sans erreur. 357 tests, type-check 0.

- 02/08/2026 — DEUX DEMANDES DE XAVIER, `public/index.html` seul, 357 tests et
  type-check verts de bout en bout (la page n'est toujours pas testée, raison
  inchangée depuis le 28/07).
  (1) LE SQUELETTE DE CHARGEMENT SE TAIT. Il dessinait cinq barres chatoyantes
  à la place des cartes à venir. Sur une attente d'une à deux secondes, ce
  n'est pas une promesse de contenu, c'est une page qui a l'air cassée — et
  ça repoussait la phrase à trois centimètres sous Nuagio, donc elle ne se
  lisait plus comme la SIENNE. Ne restent que le personnage et sa phrase,
  collée sous lui (écart des centres mesuré à 0 px).
  RETIRÉ ET NON MASQUÉ : les règles `.skel > div` et `.s1`..`.s5`, le markup,
  ET l'image clé `mpShimmer` devenue orpheline. C'est la leçon `--ico-sun` du
  29/07, appliquée sans qu'il faille se la rappeler : un style qui dort
  revient un jour par son repli.
  (2) BOUTON D'ACTUALISATION, à gauche de la bascule FR/EN. Le bon ordre, et
  pas seulement celui demandé : la langue est un réglage qu'on pose une fois,
  l'actualisation est un geste courant.
  IL RECONSULTE, IL NE RECHARGE PAS, et c'est le seul point de conception de
  la demande. Un `location.reload()` marcherait dans l'onglet ; dans l'APK il
  relancerait le démarrage complet et REDEMANDERAIT la position. Il rejoue
  donc `consulter(...dernierePosition)`, ce qui vaut aussi pour une position
  SAISIE et pas seulement pour le GPS, puisque c'est `consulter` qui écrit
  cette variable. Sans position connue, il retombe sur `localiser`.
  AUCUNE COULEUR NI AUCUN RAYON INVENTÉS : `.iconbtn` emprunte tout à
  `.langs` (même verre `--card-bg-strong`, même `--radius-pill`, encre
  `--ink`), donc les deux lisent comme une seule barre de commandes et non
  comme deux ajouts successifs. C'est la règle posée le 29/07 — tout
  composant neuf se bâtit sur les jetons DÉJÀ mesurés. 36 px de côté, bien
  au-dessus des 24 px de cible tactile.
  `textContent` INTERDIT sur ce bouton, comme sur `openSheet` : il ne porte
  qu'une icône, et son nom accessible passe donc par `aria-label` et `title`,
  posés dans `appliquerChrome` avec tous les libellés statiques — c'est la
  place qui évite la régression du 28/07 (la page à moitié française).
  VÉRIFIÉ (sans capture : le volet ne composait pas d'image ce jour-là) :
  bouton à gauche des pastilles et sur la même ligne, 36x36, squelette sans
  aucun `div` résiduel, bascule fr/en du nom accessible dans les deux sens,
  actualisation qui rerend la carte, parité fr/en des 92 clés (aucune
  manquante, aucune vide, aucune orpheline), débordement horizontal nul,
  console sans erreur.
  À CONNAÎTRE, signalé et non corrigé : l'API met en cache 5 min, donc deux
  actualisations rapprochées rendent le même relevé et le bouton paraîtra
  sans effet. C'est juste pour un METAR horaire ; si ça gêne, la réponse est
  un signal d'ATTENTE visible, pas un contournement du cache.
  EN ATTENTE DE XAVIER : les deux formulations marquées `[à valider]`
  (« Actualiser la météo » / « Refresh the weather ») et le jugement visuel.
  MIS EN LIGNE le 02/08/2026 : fusionné dans `master` en avance rapide et
  poussé (`052f976..4559673`).

- 02/08/2026 — PRÉPARATION DE LA PUBLICATION SUR LE PLAY STORE, côté dépôt.
  357 tests et type-check verts. Ce qui est fait ici est TOUT ce qui pouvait
  l'être sans la session authentifiée de Xavier : la publication elle-même,
  la clé de signature et le compte Play Console sont des actions
  irréversibles ou tournées vers l'extérieur, donc les siennes (règle du
  « Mode de travail »). La marche à suivre est en « Prochaine étape ».
  LA LISTE REÇUE ÉTAIT LA PARTIE FACILE. « Nom, icône, splash, version »
  était déjà fait à trois quarts (voir l'entrée périmée corrigée plus bas) ;
  ce qui bloque réellement une publication est ailleurs : une clé de
  signature, un format d'envoi, une politique de confidentialité, et un
  formulaire de sécurité des données. Trois de ces quatre n'existaient pas.
  LE FORMAT D'ENVOI N'EST PAS UN APK, et c'est le point que tout le monde
  rate. Google n'accepte plus que l'Android App Bundle (`.aab`) depuis 2021.
  Ce n'est pas un emballage différent mais un format d'ENVOI : Google y
  découpe lui-même un APK par appareil. Un `.aab` ne s'installe pas sur un
  téléphone, un `.apk` ne se téléverse pas. D'où DEUX MODES dans
  `scripts/apk.mjs` (`npm run apk` inchangé, `npm run apk -- --release`) et
  non un remplacement : les deux servent, à des moments différents.
  VÉRIFIÉ ET NON SUPPOSÉ : `bundleRelease` compile réellement avec cette
  chaîne (AGP 9.3.1, targetSdk 36, JBR de H:\AndroidStudio) — 4304 Ko en
  46 s. Une compilation `assembleDebug` qui passe ne prouve RIEN sur la
  variante release, qui évalue pour la première fois la config de signature
  et la ligne proguard. C'est exactement la forme des trois échecs de
  déploiement du 27/07.
  LA CLÉ N'EST PAS GÉNÉRÉE ICI, DÉLIBÉRÉMENT. C'est un secret (keytool prend
  des mots de passe) et un objet unique : tant que le Play App Signing n'est
  pas activé, la perdre interdit toute mise à jour de l'application publiée.
  Le dépôt fournit le mode d'emploi (`android/keystore.properties.exemple`)
  et le câblage ; la commande se lance dans le terminal de Xavier.
  L'IGNORE GIT A ÉTÉ ÉCRIT AVANT LA CLÉ, et l'ordre est le sujet : ajouter
  `*.jks` après coup laisse une fenêtre où un `git add -A` distrait la
  commite, et une clé poussée est compromise pour toujours, même supprimée
  ensuite. Le `if (fichierCle.exists())` du `build.gradle` n'est pas non plus
  du style : gradle évalue ce bloc à la CONFIGURATION, donc sans la garde une
  compilation debug échouerait sur une machine sans clé.
  R8 RESTE DÉSACTIVÉ pour la 1.0.0, et c'est un choix motivé plutôt qu'un
  oubli : l'activer pour la première fois sur la version que l'on publie,
  c'est le scénario que ce dépôt connaît par cœur (vert en local, cassé dans
  l'artefact, incorrigeable à distance une fois installé). À rouvrir APRÈS
  une première publication réussie, jamais avec elle.
  POLITIQUE DE CONFIDENTIALITÉ : `public/confidentialite.html`, page statique
  autonome (aucun fichier externe, style en ligne, couleurs du ciel neutre).
  Elle est OBLIGATOIRE parce que l'application déclare
  `ACCESS_COARSE_LOCATION` — sans elle, la fiche ne peut pas être publiée, et
  Google revérifie l'URL après coup, donc elle doit rester atteignable.
  FR ET EN DANS UN SEUL FICHIER : le Play Store ne demande qu'UNE URL, deux
  fichiers obligeraient à en choisir une et à laisser la moitié des lecteurs
  devant une langue qu'ils n'ont pas choisie.
  LE TEXTE DÉCRIT CE QUE LE CODE FAIT, vérifié et non supposé : aucun compte,
  aucune publicité, aucune mesure d'audience, et — vérifié par `grep` —
  AUCUN `localStorage`, `sessionStorage` ni cookie dans toute la page. Le
  point le plus favorable est vrai par construction depuis le 29/07 : le
  client n'appelle jamais les sources tierces, c'est le serveur qui le fait,
  donc ni l'IP ni l'identité de l'appareil ne parviennent à Open-Meteo.
  Le lien depuis l'application suit le patron du lien de soutien
  (`target="_blank"`, `rel="noopener noreferrer"`, `href` posé par le script)
  et pour une raison PRATIQUE : dans l'APK, une navigation dans la WebView
  remplacerait l'application par une page dont on ne peut plus revenir,
  faute de barre de navigation. Le `href` vient de `baseApi()`, donc relatif
  en web et absolu dans l'APK, sans seconde source de vérité.
  Cible tactile : mesuré à 14 px sans rembourrage, donc sous les 24 px que ce
  projet tient partout. Seul dans son paragraphe, ce lien ne bénéficie pas de
  l'exception « lien au fil du texte » de la règle 2.5.8. Porté à 27,7 px.
  VÉRIFIÉ dans le navigateur : lien rendu, `href` juste, bascule fr/en du
  libellé dans les deux sens, encre identique à celle de l'attribution
  (`--ink-faint`, aucune couleur neuve), page de politique sans débordement à
  375 px, contraste 9,06 sur le corps et 15,73 sur les liens, 13 titres
  rendus, console sans erreur. Pas de capture : le volet ne composait pas
  d'image ce jour-là.
  ADRESSE DE CONTACT TRANCHÉE PAR XAVIER le 02/08/2026 : son adresse
  personnelle `shinai24@gmail.com`, et non une adresse dédiée. L'option lui a
  été proposée pour la raison qui compte (la page est publique et indexable,
  donc l'adresse sera moissonnée) ; il a maintenu son choix.
  EN ATTENTE DE XAVIER : TOUT le texte de `confidentialite.html` (proposé,
  jamais entériné — règle anti « parser contre lui-même »), l'IDENTITÉ du
  responsable de traitement (la page dit « nous » sans nommer personne ;
  l'adresse de contact y répond en partie), et les deux libellés
  `[à valider]` du lien. Ce texte n'a pas été relu par un juriste ; ce que je
  peux garantir, c'est qu'il décrit fidèlement ce que le code fait.

- 02/08/2026 — LA CLÉ DE SIGNATURE EXISTE, faite par Xavier dans son
  terminal. `H:\Cles\queltemps-upload.jks`, alias `queltemps`, RSA 2048,
  valide jusqu'au 18/12/2053 (Google exige au moins 2033).
  EMPREINTE SHA-256, à connaître parce que c'est elle qui identifie
  l'application partout :
  `79:42:F1:DE:36:69:FA:08:74:7D:4F:81:B8:15:35:40:3C:AC:3F:24:03:C1:4D:47:F8:60:01:1C:81:EC:91:40`
  Elle n'est PAS secrète (une empreinte est publique par nature) ; la clé et
  ses mots de passe le sont, et ne vivent que sur le poste de Xavier.
  ENREGISTRÉE chez Google, mais PAS dans la Play Console : dans la
  « Android Developer Console » (android.google.com/developerconsole), qui
  est la vérification développeur et un préalable SÉPARÉ de la fiche du
  magasin. Ne pas confondre les deux consoles, on y perd du temps.
  PIÈGE ÉVITÉ DE JUSTESSE : le nom de package y avait été enregistré comme
  `fr.xavier.queltemps`, alors que le code porte `fr.queltemps.app` depuis le
  29/07. L'enregistrement n'aurait donc couvert AUCUNE application réelle.
  Corrigé côté console (l'entrée était en brouillon, donc jetable) et non
  côté code, arbitrage de Xavier : `fr.queltemps.app` est déjà installé sur
  son téléphone, et le renommer aurait fait une seconde application.
  Statut « en cours d'examen » au moment où ces lignes sont écrites.
  PREMIER BUNDLE SIGNÉ ET VÉRIFIÉ : 4336 Ko. Les quatre contrôles, faits sur
  le fichier PRODUIT et non sur la configuration qui prétend le produire —
  `META-INF/QUELTEMP.RSA` présent, empreinte du certificat embarqué IDENTIQUE
  à celle enregistrée chez Google, validité jusqu'en 2053, et
  `base/assets/public/confidentialite.html` bien embarquée par `cap sync`.
  Ce dernier contrôle n'est pas de la coquetterie : le bundle de vérification
  de chaîne d'il y a une heure PRÉCÉDAIT l'écriture de la page, et rien dans
  son nom ne l'aurait dit.
  MOT DE PASSE : celui de la clé a transité par la conversation quand
  `keystore.properties` a été relu après remplissage. Signalé à Xavier avec
  la parade (`keytool -storepasswd` / `-keypasswd`, qui ne change PAS
  l'empreinte, donc n'invalide pas l'enregistrement chez Google). Leçon pour
  les prochaines fois : ne jamais relire un fichier de secrets, même pour
  vérifier qu'il est rempli — `awk` sur la seule LONGUEUR de la valeur suffit
  et c'est ce qui aurait dû être fait dès le premier contrôle.

Prochaine étape (à décider avec Xavier) :
- PUBLIER SUR LE PLAY STORE. Tout ce qui suit demande la session authentifiée
  de Xavier : rien de cela ne peut se faire depuis ici, comme le renommage du
  dépôt du 29/07 et pour la même raison (aucune CLI authentifiée, aucun jeton
  dans l'environnement). L'ORDRE COMPTE.
  1. GÉNÉRER LA CLÉ DE SIGNATURE. Commande et mise en garde complètes dans
     `android/keystore.properties.exemple`. La ranger HORS du dépôt et la
     SAUVEGARDER ailleurs que sur ce poste : c'est la seule étape de la liste
     qui soit irrattrapable.
  2. Copier ce fichier en `android/keystore.properties` (ignoré par git) et
     le remplir. Puis `npm run apk -- --release` : le script AVERTIT en clair
     si la clé manque, plutôt que de laisser découvrir le problème au refus
     du téléversement.
     ET INCRÉMENTER `versionCode` dans `android/app/build.gradle` avant
     CHAQUE envoi, y compris vers une piste de test : un numéro consommé
     l'est définitivement, même après rejet ou suppression. C'est le refus
     dont la cause est la moins évidente quand on croit n'avoir rien publié.
  3. CRÉER LE COMPTE PLAY CONSOLE (25 $ une fois, vérification d'identité).
     À VÉRIFIER PAR XAVIER et non affirmé ici : pour un compte PERSONNEL,
     Google impose depuis 2023 une période de test fermé avant d'autoriser
     la production (de mémoire, une douzaine de testeurs pendant deux
     semaines). Si la règle s'applique, ce n'est pas un détail de calendrier
     mais l'étape la plus LONGUE de toute la liste, et elle se commence tôt.
  4. PUBLIER LA POLITIQUE : elle est déjà dans `public/`, donc il suffit de
     pousser sur `master` pour qu'elle soit en ligne. L'URL à déclarer est
     `<domaine>/confidentialite.html`.
  5. REMPLIR LA FICHE ET LES FORMULAIRES, tous côté Console : sécurité des
     données (déclarer la position, « non collectée/non partagée » au sens
     de Google puisqu'elle n'est ni stockée ni associée à une personne),
     questionnaire de classification du contenu, description courte et
     longue, une image mise en avant 1024x500, et au moins deux captures
     d'écran de téléphone. Ce sont des FORMULATIONS et des visuels : elles
     lui reviennent, comme tout le vocabulaire de ce projet.
  RENOMMAGE FAIT le 02/08/2026, avant toute publication et c'était le bon
  moment : après, il aurait fallu modifier une fiche en ligne ET republier
  l'application, qui code `API_PROD` en dur. Détail plus bas.
  CE QUI NE SE REDISCUTE PLUS une fois la première version publiée :
  `appId: fr.queltemps.app` et la clé de signature. Les deux sont définitifs.
- FAIT, et cette entrée était PÉRIMÉE (constaté le 02/08/2026) : elle annonçait
  l'icône et l'écran de démarrage encore au gabarit Capacitor (le X bleu). Ils
  ne le sont plus. `mipmap-anydpi-v26` compose bien un `adaptive-icon` en deux
  couches, dont le fond `#0254C6` est échantillonné sur `icon-maskable-512.png`,
  et `drawable/splash.xml` est une liste de couches (couleur `#101827` égale au
  `background_color` du manifeste + `splash_logo.png` en `-nodpi`) qui remplace
  les onze `splash.png` du gabarit. LEÇON DE TENUE DE CARNET, pas de code : une
  liste « à faire » ne se relit pas toute seule. Rayer l'entrée fait partie du
  travail, sinon la session suivante refait ce qui est fait.
- « INSTALLER VIA USB » côté MIUI, si Xavier veut un cycle de développement
  fluide : sans lui, chaque version se réinstalle à la main. Alternative sans
  compte Mi : le Live Reload, où l'APK installé charge la page depuis le poste.
- WINDOWS HYPERVISOR PLATFORM, si l'émulateur devient nécessaire. Réglage
  système, avec un effet possible sur d'autres logiciels de virtualisation.

- SERVICE WORKER, si l'on veut la bannière d'installation AUTOMATIQUE.
  Le manifeste suffit pour installer à la main (menu du navigateur) et
  suffit à Bubblewrap pour empaqueter un TWA. Ce qu'il ne suffit PAS à
  déclencher, c'est l'invite spontanée de Chrome sur Android, qui réclame
  en plus un service worker gérant `fetch`. C'est un autre chantier (cache
  hors ligne, stratégie de péremption, et une page météo qui affiche des
  données périmées ment à son utilisateur) : décision séparée, rien
  d'urgent.
- PÉRIMÉ le 29/07/2026 : l'icône installée n'est plus le jeton
  `partly_cloudy_day` du sprite mais le logo fourni par Xavier. Le
  raisonnement d'alors (« une icône est peinte des mois avant le METAR,
  elle ne doit affirmer aucun temps ») tient toujours, et le logo le
  respecte : soleil ET nuage.
- POIDS DES ICÔNES, si ça devient gênant : 378 Ko pour le 512, contre
  21 Ko pour l'ancien dessin au trait. C'est le prix d'une image
  photographique, pas un défaut d'encodage. Le chemin chaud est déjà
  protégé (l'onglet ne charge que 9 Ko), donc rien d'urgent ; le jour où
  ça compte, c'est une quantification de palette qu'il faut, pas un
  redimensionnement.
- RENOMMAGE FAIT le 02/08/2026 (demandé le 29/07). `queltemps` sur GitHub,
  `queltemps` sur Vercel, `queltemps.vercel.app` en production, `API_PROD`
  et la ligne « EN LIGNE ET VÉRIFIÉ » mis à jour. La marche à suivre
  prévoyait quatre étapes ; la réalité en a corrigé une et en a ajouté une.
  CE QUI S'EST PASSÉ COMME PRÉVU : GitHub redirige l'ancien nom en web et en
  git (le `push` aurait continué de marcher sans rien toucher), et
  l'intégration Vercel a suivi le renommage du dépôt toute seule.
  CE QUI ÉTAIT FAUX DANS LA NOTE : renommer le PROJET Vercel ne déplace PAS
  le domaine. Vercel garde les domaines déjà attribués et n'en fabrique pas
  de nouveau — `queltemps.vercel.app` répondait 404 après le renommage, et
  l'ancien continuait de servir la production. Il a fallu l'AJOUTER à la
  main dans Settings → Domains. La note prédisait donc une bascule
  automatique et une libération immédiate de l'ancien nom : ni l'une ni
  l'autre ne se sont produites.
  DÉCISION QUI EN DÉCOULE : l'ancien domaine est CONSERVÉ, attribué au
  projet. Le retirer le libérerait vraiment, et un nom court se reprend ;
  le garder ne coûte rien, laisse fonctionner les APK déjà installés qui le
  codent en dur, et deux domaines peuvent pointer sur le même projet.
  LEÇON DE MÉTHODE, la même que le 29/07 : l'adresse a été LUE dans la liste
  des domaines de Vercel, pas déduite du nom du projet. Les trois candidats
  plausibles ont d'ailleurs été sondés avant, et deux répondaient 404. Une
  preuve de déploiement cite ce qui a été appelé, pas ce dont il est
  construit.
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
- Valeur finale 12 s, atteinte en DEUX mesures. La seconde (27/07/2026, via la
  page de démonstration) a corrigé la première : une bbox de PLEIN OCÉAN
  (-40, -140) met 2254 / 7487 / 1091 ms à répondre « aucune station ». Une zone
  déserte est LENTE, la source semblant balayer la boîte avant son 204. Le
  premier appel de cette série a été coupé à 8 s et servi comme `network_error`
  alors qu'il était vivant : le défaut même que le plafond doit éviter, retourné
  contre nous. Il ne restait que 500 ms de marge sur un cas courant du
  Pacifique. LEÇON À RETENIR plutôt que le chiffre : une mesure prise depuis un
  seul point du globe (Brumath) ne dit rien des autres. 12 s n'est possible que
  parce que `vercel.json` fixe `maxDuration` à 30 s.
- Historique de la valeur, parce qu'il est instructif — 4 s puis 8 s puis 12 s,
  chaque fois corrigé par une mesure et jamais par un raisonnement :
- Étape intermédiaire, 8 s, et le PIÈGE évité de justesse. Premier choix : 4 s, calculé sur
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

