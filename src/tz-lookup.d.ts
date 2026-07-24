// src/tz-lookup.d.ts
// tz-lookup ne fournit pas ses propres types. On déclare ici sa signature.
// C'est un module CommonJS qui exporte directement une fonction
// (module.exports = tzlookup), d'où la forme "export =". Avec esModuleInterop
// (activé dans tsconfig), on l'importe côté ES par « import tzlookup from ... ».
declare module "tz-lookup" {
  /** Renvoie le nom de fuseau IANA (ex. "Europe/Paris") le plus proche des
   *  coordonnées. Lève une erreur si lat/lon sont hors bornes. */
  function tzlookup(lat: number, lon: number): string;
  export = tzlookup;
}
