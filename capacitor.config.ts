// capacitor.config.ts — empaquetage de la page web en application Android.
//
// Ce fichier ne sert QU'A l'outillage Capacitor (`npx cap ...`). Il ne part
// ni sur Vercel ni dans les tests, et il n'est volontairement PAS dans le
// "include" de tsconfig.json : ce fichier-la a deja cause trois echecs de
// deploiement, on ne le rouvre pas pour valider dix lignes que le CLI
// Capacitor verifie lui-meme au lancement.
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // Identifiant Android ("package"). Choix de Xavier le 29/07/2026.
  // DEFINITIF : une fois une version publiee sur le Play Store, le changer
  // revient a publier une SECONDE application, sans les avis ni les
  // installations de la premiere. Il n'a aucun rapport avec le nom affiche.
  appId: 'fr.queltemps.app',

  // Nom affiche sous l'icone. Meme casse que partout ailleurs depuis le
  // 29/07/2026 : le <title> de la page, le manifeste, package.json.
  appName: 'QuelTemps',

  // Dossier EMBARQUE dans l'application. "public" et non "dist" parce que ce
  // projet n'a aucune etape de compilation cote client : vercel.json fixe
  // deja buildCommand: null / outputDirectory: "public". Capacitor recopie
  // donc index.html, les polices et les icones tels quels.
  //
  // CE QUE CE DOSSIER NE CONTIENT PAS : l'API. `api/nearest` est une fonction
  // serveur Vercel, elle ne peut pas etre embarquee. Dans l'application, le
  // `fetch("/api/nearest")` de index.html (ligne ~1407) viserait donc le
  // serveur d'actifs LOCAL de la WebView, qui n'a pas d'/api. C'est le point
  // a regler avant toute installation sur un telephone, pas un detail.
  webDir: 'public'
};

export default config;
