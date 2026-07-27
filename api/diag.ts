// api/diag.ts
//
// ===================================================================
// FICHIER TEMPORAIRE DE DIAGNOSTIC — À SUPPRIMER UNE FOIS LE PROBLÈME
// COMPRIS. Il ne fait partie ni du contrat d'API, ni de la suite de tests.
// ===================================================================
//
// Pourquoi il existe : le 27/07/2026, le service déployé sur Vercel rend
// `network_error` alors que le même code, depuis la machine de Xavier, obtient
// un HTTP 200 en 130 ms. La différence n'est donc pas dans le code mais dans
// l'ENVIRONNEMENT (adresse IP de centre de données, en-têtes, sortie réseau).
//
// Or `awc.ts` transforme volontairement toute panne en une donnée unique
// (`network_error`) sans jamais dire laquelle : c'est très bien pour
// l'utilisateur final, et inexploitable pour un diagnostic. Cette sonde
// contourne le module et interroge la source À NU, en rendant ce qu'on ne voit
// jamais autrement : le code HTTP réel, le début du corps, et le temps passé.
//
// Elle teste plusieurs en-têtes dans le même appel, parce que la première
// hypothèse (un `User-Agent` refusé) ne peut être ni confirmée ni écartée
// depuis une ligne domestique : là-bas, les trois variantes répondent 200.

import type { VercelRequest, VercelResponse } from "@vercel/node";

const URL_TEST =
  "https://aviationweather.gov/api/data/metar?bbox=47.23,6.21,50.23,9.21&format=json";

// Une tentative, décrite sans rien masquer. Aucune exception ne remonte :
// une sonde qui plante ne diagnostique rien.
async function sonder(nom: string, headers: Record<string, string>) {
  const debut = Date.now();
  try {
    const res = await fetch(URL_TEST, {
      headers,
      signal: AbortSignal.timeout(15000),
    });
    // On lit le corps en TEXTE et non en JSON : si la source renvoie une page
    // d'erreur HTML ou un message de blocage, `res.json()` lèverait et on
    // perdrait justement l'information qu'on cherche.
    const texte = await res.text();
    return {
      nom,
      ms: Date.now() - debut,
      status: res.status,
      ok: res.ok,
      taille: texte.length,
      // Assez pour reconnaître un tableau JSON, une page de blocage ou un
      // message d'erreur, sans déverser des milliers de lignes de METAR.
      debut: texte.slice(0, 300),
      contentType: res.headers.get("content-type"),
    };
  } catch (e) {
    // Le cas le plus probable si l'IP est filtrée : pas de réponse du tout.
    return {
      nom,
      ms: Date.now() - debut,
      erreur: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      cause: e instanceof Error && e.cause ? String(e.cause) : null,
    };
  }
}

// Deuxième volet, ajouté après le premier verdict : la source répond 200 en
// 23 ms depuis Vercel, donc le réseau est hors de cause et le défaut est chez
// nous. On exerce donc NOTRE chaîne complète, en capturant tout.
//
// Les imports sont DYNAMIQUES et sous try/catch, et c'est essentiel : si un
// module échoue à se charger (typiquement `tz-lookup`, seule dépendance
// externe, en CommonJS avec une déclaration de types maison), un import
// statique ferait planter la sonde elle-même et on ne verrait toujours rien.
// Là, l'échec de chargement devient une ligne de rapport.
async function sonderNotreChaine() {
  const etapes: Record<string, unknown> = {};

  // 1. Le fuseau, c'est-à-dire tz-lookup, le suspect numéro un.
  try {
    const geo = await import("../src/geo");
    etapes.resolveTimezone = geo.resolveTimezone(48.549, 7.64);
  } catch (e) {
    etapes.resolveTimezone = { ECHEC: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }

  // 2. Le calcul solaire, pur, sans dépendance externe.
  try {
    const geo = await import("../src/geo");
    const s = geo.solar(48.549, 7.64, new Date());
    etapes.solar = { isDay: s.isDay, sunriseUtc: s.sunriseUtc?.toISOString() ?? null };
  } catch (e) {
    etapes.solar = { ECHEC: e instanceof Error ? `${e.name}: ${e.message}` : String(e) };
  }

  // 3. La recherche de station : le réseau, mais via NOTRE code cette fois.
  try {
    const awc = await import("../src/awc");
    const r = await awc.fetchNearest(48.73, 7.71);
    etapes.fetchNearest = r.found
      ? { trouve: r.station.icao, distanceKm: Math.round(r.distanceKm) }
      : { echec: r.reason };
  } catch (e) {
    etapes.fetchNearest = {
      ECHEC: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      pile: e instanceof Error ? e.stack?.split("\n").slice(0, 4).join(" | ") : null,
    };
  }

  // 4. L'assemblage complet, exactement ce que fait l'API publique.
  try {
    const near = await import("./nearest");
    const sortie = await near.handleNearest({ lat: 48.73, lon: 7.71, lang: "fr", units: "metric" }, {});
    etapes.handleNearest = { status: sortie.status, corps: JSON.stringify(sortie.body).slice(0, 200) };
  } catch (e) {
    etapes.handleNearest = {
      ECHEC: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      pile: e instanceof Error ? e.stack?.split("\n").slice(0, 5).join(" | ") : null,
    };
  }

  return etapes;
}

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  // Les trois variantes sont lancées EN SÉRIE et non en parallèle : si la
  // source limite le débit, trois appels simultanés fausseraient le résultat.
  const resultats = [];
  resultats.push(await sonder("sans en-tete", {}));
  resultats.push(await sonder("ua applicatif", { "User-Agent": "metar-proche/0.1 (+github.com/Xavier-ctrl24/metar-proche)" }));
  resultats.push(await sonder("ua navigateur", { "User-Agent": "Mozilla/5.0 (compatible)" }));

  const notreChaine = await sonderNotreChaine();

  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({
    // De quelle région part l'appel : utile si la source filtre par pays.
    region: process.env.VERCEL_REGION ?? null,
    node: process.version,
    sourceANu: resultats,
    notreChaine,
  });
}
