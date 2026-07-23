\# MISSION



Construire le backend d'une application météo grand public qui décode

les METAR aéronautiques en langage courant. Couverture mondiale.



Tu construis UNIQUEMENT le backend et le décodeur. Aucune interface,

aucun front-end, aucun composant React. Si tu es tenté d'en écrire, arrête-toi.



\# CONTEXTE



\- Stack : TypeScript, fonctions serverless Vercel, Vitest

\- Dépôt déjà initialisé, dépendances installées

\- Je suis DÉBUTANT en TypeScript. Explique chaque décision de conception

&#x20; en français, en une ou deux phrases, avant d'écrire le fichier.

\- Je suis en revanche expert du domaine aéronautique. Sur le sens des

&#x20; codes METAR et la justesse des traductions, mon avis prime sur le tien.



\# ORDRE DE CONSTRUCTION — IMPÉRATIF



Tu suis cet ordre exact. Après CHAQUE étape tu t'arrêtes, tu montres

le résultat, et tu attends ma validation explicite avant de continuer.

Ne jamais enchaîner deux étapes sans validation.



&#x20; Étape 1 : src/types.ts

&#x20; Étape 2 : téléchargement du corpus brut + sélection des cas

&#x20; Étape 3 : tests/corpus.json (cas remplis par MOI)

&#x20; Étape 4 : src/units.ts + tests

&#x20; Étape 5 : src/decode.ts + tests

&#x20; Étape 6 : src/i18n/fr.ts (traduction)

&#x20; Étape 7 : src/icon.ts

&#x20; Étape 8 : src/geo.ts

&#x20; Étape 9 : src/awc.ts

&#x20; Étape 10 : api/nearest.ts



Les tests précèdent toujours le code de l'étape correspondante.



\# ÉTAPE 1 — LE CONTRAT D'API



Écris src/types.ts, et rien d'autre. C'est la source de vérité du projet.



Requête : GET /api/nearest?lat=48.73\&lon=7.71\&lang=fr\&units=metric



Réponse :



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

&#x20; "wind": { "speed": 15, "unit": "kmh", "gust": 30,

&#x20;           "directionDeg": 240, "isVariable": false, "isCalm": false },

&#x20; "visibility": { "value": 9999, "unit": "m", "isCavok": false },

&#x20; "clouds": \[{ "coverage": "SCT", "altitude": 900, "unit": "m" }],

&#x20; "verticalVisibility": null,

&#x20; "phenomena": \[{ "code": "RA", "severity": "info" }],

&#x20; "pressure": { "value": 1018, "unit": "hPa" },

&#x20; "sun": { "isDay": true, "sunrise": "05:47", "sunset": "21:22" },

&#x20; "text": { "headline": "", "wind": "", "visibility": "",

&#x20;           "clouds": "", "phenomena": "" },

&#x20; "raw": "METAR LFST 231200Z ...",

&#x20; "warnings": \[]

}



Règles du contrat :

\- TOUT champ peut valoir null. Les stations en panne existent.

\- Valeurs numériques et textes générés strictement séparés.

\- `icon` est une union fermée de littéraux, jamais un string.

\- `severity` : "info" | "warning" | "danger". "danger" est réservé aux

&#x20; orages et à la pluie verglaçante.

\- `warnings` liste les anomalies détectées (données aberrantes, champs

&#x20; corrompus). Il ne doit JAMAIS y avoir d'exception levée à la place.



\# ROBUSTESSE — LA CONTRAINTE CENTRALE



Le décodeur est DÉFENSIF par défaut. Règle absolue : extraire ce qui est

extractible, mettre null partout ailleurs, ne jamais lever d'exception.

Une entrée illisible produit un objet valide avec des null, pas un crash.



Cas réels observés dans le flux mondial, tous à gérer :



&#x20; Identifiant absent      020852Z AUTO 22009KT 10SM CLR 15/M09 A2998

&#x20; Panne totale            RJSN 231700Z AUTO /////KT //// // ////// ///// Q////

&#x20; Vent absent             SVVA 231700Z /////KT 9999 BKN016 31/22 Q1017

&#x20; Vitesse absente         271400Z 090//KT 9999 SCT016 30/25 Q1010

&#x20; Point de rosée absent   DAOR 231700Z 18004KT 9999 SCT033 43/// Q1019

&#x20; Type de nuage inconnu   ESKS 231650Z AUTO 22007KT 9999 FEW230/// 18/02

&#x20; Données aberrantes      181800Z 11014KT 9999 FEW015 BKN290 21/25 Q1020

&#x20;                         (point de rosée > température : impossible)

&#x20; Ligne corrompue         030046Z AZIS\&LM)U10SM 18/10J RJS135 T01830128

&#x20; Pas d'observation       DNZA 221400SK 221400Z NIL

&#x20; TAF mélangé             081030Z 0812/0912 28010KT CAVOK TEMPO 0818/0824

&#x20; Groupes collés          SGPJ ... OVC007FEW040CB

&#x20; Faute à la source       VIPK ... NOISG=



Variantes d'unités :

&#x20; Nœuds (défaut) / MPS (Russie, Chine, Asie centrale)

&#x20; Mètres (défaut) / SM avec fractions : 10SM, 1/4SM, 1 1/2SM, M1/4SM

&#x20; hPa via Q1018 / pouces de mercure via A3013 / QFE (pression au sol, à ignorer)

&#x20; Températures négatives préfixées M : 15/M09, M26/M29, M60/



Groupes particuliers :

&#x20; CAVOK           remplace visibilité ET nuages

&#x20; VV001           visibilité verticale, remplace les nuages (brouillard)

&#x20; 00000KT         vent calme, sans direction

&#x20; VRB03KT         direction variable

&#x20; 150V210         direction oscillant entre deux caps

&#x20; R22/1200        portée visuelle de piste ; variantes R20/CLRD60, R01R/P6000

&#x20; BECMG / TEMPO / NOSIG / INTER   groupes de tendance, à ignorer en v1

&#x20; RMK             tout ce qui suit est ignoré

&#x20; =               fin de bulletin



À EXCLURE : toute ligne contenant "VATSIM USE ONLY". Ce sont des données

synthétiques de simulation, pas des observations réelles.



\# ÉTAPES 2 ET 3 — LE CORPUS



Télécharge le flux mondial (une seule fois, jamais en production) :



&#x20; Invoke-WebRequest -Uri "https://metar.vatsim.net/metar.php?id=all" -OutFile corpus-brut.txt



Ajoute corpus-brut.txt au .gitignore.



Sélectionne 25 METAR RÉELS depuis ce fichier, couvrant tous les cas

listés en section ROBUSTESSE, plus 5 cas nominaux (Europe, USA, Asie).



Écris tests/corpus.json au format suivant, avec expect VIDE :



&#x20; {

&#x20;   "raw": "URMM 231700Z 26007MPS 9999 VCTS SCT066CB 23/19 Q1005",

&#x20;   "note": "MPS + orage à proximité + cumulonimbus",

&#x20;   "expect": {}

&#x20; }



TU NE REMPLIS PAS expect. C'est moi qui le fais. Un test dont tu produis

toi-même la réponse attendue ne teste rien : il valide ton parser contre

lui-même. Présente-moi le fichier et attends.



\# TRADUCTION FRANÇAISE



Sortie destinée au grand public, jamais aux pilotes. Aucun jargon.



&#x20; Vent        "Vent de sud-ouest, 15 km/h, rafales à 30"

&#x20;             Vent calme → "Pas de vent"

&#x20;             VRB → "Vent variable, 10 km/h"

&#x20; Visibilité  9999 → "Plus de 10 km" ; 2500 → "2,5 km"

&#x20; Nuages      FEW "Quelques nuages" · SCT "Éclaircies"

&#x20;             BKN "Ciel très nuageux" · OVC "Ciel couvert"

&#x20;             Altitude convertie en mètres, arrondie à la centaine

&#x20; Phénomènes  RA pluie · SHRA averses · TSRA orage avec pluie

&#x20;             DZ bruine · SN neige · GR grêle · GS grésil

&#x20;             FG brouillard · BR brume · HZ brume sèche · FU fumée

&#x20;             SA sable · DU poussière · IC cristaux de glace

&#x20;             FZRA pluie verglaçante (severity: danger)

&#x20;             TS orage (severity: danger)

&#x20;             Préfixes : - faible · + fort · VC à proximité



Calcule aussi humidité relative et température ressentie à partir de

température et point de rosée. Si le point de rosée dépasse la

température, plafonne l'humidité à 100 % et ajoute un warning.



\# ICÔNES



Union fermée :

&#x20; clear\_day, clear\_night, few\_day, few\_night,

&#x20; partly\_cloudy\_day, partly\_cloudy\_night, cloudy, overcast,

&#x20; fog, mist, drizzle, rain\_light, rain, rain\_heavy,

&#x20; showers\_day, showers\_night, snow, sleet, hail,

&#x20; freezing\_rain, thunderstorm, dust, smoke, unknown



Priorité décroissante :

&#x20; orage → pluie verglaçante → grêle → neige → pluie → brouillard →

&#x20; brume → fumée/sable → couverture nuageuse → unknown



Jour/nuit calculé sur les coordonnées et l'heure de LA STATION.



\# ÉTAPES 8 À 10 — GÉO ET SOURCE



Source de production : https://aviationweather.gov/api/data/metar

Paramètres : bbox=latMin,lonMin,latMax,lonMax\&format=json

Gratuite, sans clé, domaine public. Elle renvoie les coordonnées de

chaque station — c'est ce qui permet le calcul de distance.



VATSIM ne sert QU'AU CORPUS DE TEST. Jamais d'appel en production.



Logique : bbox de ±1,5° autour de la position, distance haversine,

tri croissant, retenir la station la plus proche dont l'observation a

moins de 3 heures. Aucune station trouvée → élargir à ±3° une fois,

puis renvoyer une réponse explicite plutôt qu'une erreur.



Fuseau horaire de la station résolu depuis ses coordonnées.

Cache de 5 minutes sur l'endpoint.



\# INTERDICTIONS



\- Ne crée jamais plus d'un fichier par étape.

\- Ne remplis jamais les valeurs attendues d'un test.

\- Ne lève jamais d'exception dans le décodeur.

\- Ne passe jamais à l'étape suivante sans ma validation.

\- N'écris aucun code d'interface.

\- Maximum 3 tentatives sur un test qui échoue, puis arrête-toi et

&#x20; explique-moi le blocage.



\# CRITÈRE DE RÉUSSITE



`npm test` passe sur les 30 cas du corpus, dont la ligne entièrement

composée de barres obliques et la ligne corrompue, sans aucune exception.



Commence par l'étape 1. Explique-moi d'abord ce que tu vas faire.

