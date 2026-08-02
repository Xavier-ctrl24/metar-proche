// Compile l'APK et le depose dans APK/ sous un nom NUMEROTE :
// queltemps-build1.apk, queltemps-build2.apk, etc. (demande de Xavier,
// 01/08/2026).
//
// POURQUOI UN SCRIPT ET PAS UNE COPIE A LA MAIN : gradle ecrit toujours au
// meme endroit (app-debug.apk), donc chaque compilation ECRASE la
// precedente. Sans numerotation, impossible de revenir a la version qu'on
// avait sur le telephone la veille. Le numero se DEDUIT du contenu du
// dossier et n'est stocke nulle part : un compteur dans un fichier
// divergerait le jour ou l'on effacerait un APK a la main.
//
// Node pur, aucune dependance ajoutee : le depot n'en a pris aucune pour
// fabriquer ses icones non plus.

import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const racine = join(dirname(fileURLToPath(import.meta.url)), "..");
const sortie = join(racine, "APK");

// DEUX MODES (02/08/2026, preparation Play Store). `npm run apk` sans
// argument ne change PAS de comportement : c'est toujours l'APK de debogage
// que l'on installe a la main sur le telephone.
//
//   npm run apk              -> APK debug,   APK/queltemps-buildN.apk
//   npm run apk -- --release -> AAB release, APK/queltemps-releaseN.aab
//
// POURQUOI UN AAB ET NON UN APK pour le Play Store : Google n'accepte plus
// que le "Android App Bundle" depuis aout 2021. Ce n'est pas une variante
// d'emballage mais un format d'ENVOI : Google y decoupe lui-meme un APK par
// appareil. Un .aab ne s'installe donc pas sur un telephone, et un .apk ne
// se televerse pas. Les deux modes existent parce que les deux sont utiles,
// pas parce que l'un remplacerait l'autre.
const release = process.argv.includes("--release");

const tache = release ? "bundleRelease" : "assembleDebug";
const source = release
  ? join(racine, "android", "app", "build", "outputs", "bundle", "release", "app-release.aab")
  : join(racine, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const prefixe = release ? "queltemps-release" : "queltemps-build";
const ext = release ? "aab" : "apk";

// JAVA_HOME : Android Studio vit sur H: sur CE poste (voir CLAUDE.md,
// 29/07/2026). Si Java est deja sur le PATH ou JAVA_HOME est defini, on n'y
// touche pas : ce chemin est propre a une machine, il ne doit pas s'imposer.
const jbrLocal = "H:\\AndroidStudio\\jbr";
const env = { ...process.env };
if (!env.JAVA_HOME && existsSync(jbrLocal)) env.JAVA_HOME = jbrLocal;

// La commande est passee ENTIERE et `args` reste vide : avec `shell: true`,
// Node deconseille de lui confier des arguments (il les concatene sans les
// echapper). Aucune de ces commandes ne prend de valeur venue de l'exterieur.
function lancer(cmd, args, cwd) {
  const r = spawnSync([cmd, ...args].join(" "), [], { cwd, env, stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error(`\nEchec : ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

// Toujours resynchroniser public/ vers les assets de l'APK avant de compiler :
// oublier ce pas livre une application dont la page est celle d'hier, sans
// aucun signe.
lancer("npx", ["cap", "sync", "android"], racine);
// Le prefixe de chemin est OBLIGATOIRE : ni cmd ni sh ne cherchent un
// executable dans le repertoire courant, meme quand c'est le cwd du processus.
lancer(process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew", [tache], join(racine, "android"));

if (!existsSync(sortie)) mkdirSync(sortie);

// Le numero se DEDUIT du contenu du dossier, et les deux familles se comptent
// SEPAREMENT : le build debug 7 et la release 1 peuvent coexister sans que
// l'un decale l'autre.
const motif = new RegExp(`^${prefixe}(\\d+)\\.${ext}$`);
const nums = readdirSync(sortie)
  .map((f) => motif.exec(f))
  .filter(Boolean)
  .map((m) => Number(m[1]));
const numero = (nums.length ? Math.max(...nums) : 0) + 1;

const nom = `${prefixe}${numero}.${ext}`;
copyFileSync(source, join(sortie, nom));
const ko = Math.round(statSync(join(sortie, nom)).size / 1024);
console.log(`\nAPK/${nom}  (${ko} Ko)`);

if (release && !existsSync(join(racine, "android", "keystore.properties"))) {
  // AVERTISSEMENT ET NON ECHEC : la compilation a reussi, l'artefact existe,
  // il est simplement inutilisable pour le Play Store. Le dire ICI evite de
  // ne le decouvrir qu'au refus du televersement, une demi-heure plus tard.
  console.log(
    "\nATTENTION : android/keystore.properties est absent, donc cet AAB n'est PAS SIGNE.\n" +
      "Le Play Store le refusera. Voir android/keystore.properties.exemple.",
  );
}
