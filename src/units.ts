// src/units.ts
// Conversions d'unites PURES : aucune dependance, aucun effet de bord, aucune
// exception. On entre un nombre (ou un texte de fraction), on ressort un nombre.
// L'extraction depuis le METAR brut (reperer "A3013", "26006MPS"...) est le
// travail du decodeur (etape 5), pas de ce fichier.
// Regle de sortie : arrondi a l'entier. L'arrondi grand public se fera dans la traduction.

// Un noeud vaut 1,852 km/h (definition officielle du mille marin).
export function knotsToKmh(knots: number): number {
  return Math.round(knots * 1.852);
}

// 1 metre par seconde = 3,6 km/h. Unite utilisee par la Russie, la Chine, l'Asie centrale.
export function mpsToKmh(mps: number): number {
  return Math.round(mps * 3.6);
}

// 1 pouce de mercure = 33,8639 hectopascals. Sert a convertir les pressions codees A3013.
export function inchesHgToHpa(inchesHg: number): number {
  return Math.round(inchesHg * 33.8639);
}

// 1 mile terrestre (statute mile) = 1609,344 metres. Sert aux visibilites codees en SM.
export function statuteMilesToMeters(miles: number): number {
  return Math.round(miles * 1609.344);
}

// Transforme un texte de fraction METAR en nombre : "10" -> 10, "1/4" -> 0.25,
// "1 1/2" -> 1.5. Renvoie null (jamais d'exception) si le texte est illisible.
// La partie entiere et la partie fractionnaire sont separees par un espace.
export function parseFraction(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  let total = 0;
  for (const part of trimmed.split(/\s+/)) {
    if (part.includes("/")) {
      const [rawNum, rawDen] = part.split("/");
      const num = Number(rawNum);
      const den = Number(rawDen);
      // Numerateur/denominateur non numeriques ou division par zero : on abandonne proprement.
      if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
      total += num / den;
    } else {
      const value = Number(part);
      if (!Number.isFinite(value)) return null;
      total += value;
    }
  }
  return total;
}

// 1 pied = 0,3048 metre. Convertit une altitude de nuage en metres, arrondie a la
// centaine (choix valide : SCT016 = 1600 ft -> 487,7 m -> 500 m).
export function feetToMeters(feet: number): number {
  return Math.round((feet * 0.3048) / 100) * 100;
}
