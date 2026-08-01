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
const source = join(racine, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");

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
lancer(process.platform === "win32" ? ".\\gradlew.bat" : "./gradlew", ["assembleDebug"], join(racine, "android"));

if (!existsSync(sortie)) mkdirSync(sortie);

const nums = readdirSync(sortie)
  .map((f) => /^queltemps-build(\d+)\.apk$/.exec(f))
  .filter(Boolean)
  .map((m) => Number(m[1]));
const numero = (nums.length ? Math.max(...nums) : 0) + 1;

const cible = join(sortie, `queltemps-build${numero}.apk`);
copyFileSync(source, cible);
const ko = Math.round(statSync(cible).size / 1024);
console.log(`\nAPK/queltemps-build${numero}.apk  (${ko} Ko)`);
