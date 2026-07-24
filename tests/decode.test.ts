// tests/decode.test.ts
// Tests de l'etape 5. Deux familles :
//   1. TESTS DIRIGES PAR LE CORPUS : on rejoue les 30 METAR reels de
//      tests/corpus.json et on compare UNIQUEMENT les champs que Xavier a
//      remplis a la main (temperature + clouds). Regle anti « parser contre
//      lui-meme » : on ne verifie jamais un champ que Claude aurait rempli seul.
//   2. TESTS CIBLES : petits cas isoles pour verifier un comportement precis
//      (vent en MPS, vent calme, CAVOK, VV, pression, severite orage...).
//
// Invariant absolu teste partout : decode() ne leve JAMAIS d'exception, meme
// sur la ligne entierement barree ou la ligne corrompue.

import { describe, it, expect } from "vitest";
import corpus from "./corpus.json";
import { decode } from "../src/decode";

// ---------- Famille 1 : dirigee par le corpus ----------

describe("decode() sur le corpus reel", () => {
  // Chaque entree du corpus devient un test nomme par sa note.
  for (const cas of corpus) {
    it(cas.note, () => {
      // Invariant de robustesse : aucune entree ne doit faire planter le decodeur.
      expect(() => decode(cas.raw)).not.toThrow();
      const r = decode(cas.raw);

      // On ne compare que les sous-champs presents dans expect. Si expect est
      // vide ({}), on ne verifie que l'absence d'exception (deja faite ci-dessus).
      const attendu = cas.expect as Record<string, unknown>;

      // -- temperature : comparaison cle par cle, seulement les cles fournies --
      if (attendu.temperature) {
        const t = attendu.temperature as Record<string, unknown>;
        expect(r.temperature).not.toBeNull();
        for (const cle of Object.keys(t)) {
          // Ex. verifie r.temperature.value === 15, r.temperature.humidity === 18...
          expect(r.temperature?.[cle as keyof typeof r.temperature]).toBe(t[cle]);
        }
      }

      // -- clouds : comparaison stricte du tableau entier quand il est fourni --
      if (attendu.clouds) {
        expect(r.clouds).toEqual(attendu.clouds);
      }
    });
  }
});

// ---------- Famille 2 : tests cibles ----------

describe("vent", () => {
  it("noeuds : 24008KT -> 15 km/h, direction 240", () => {
    const r = decode("LFST 231800Z 24008KT CAVOK 24/07 Q1018");
    expect(r.wind?.speed).toBe(15); // 8 kt * 1,852 = 14,8 -> 15
    expect(r.wind?.directionDeg).toBe(240);
    expect(r.wind?.unit).toBe("kmh");
    expect(r.wind?.isCalm).toBe(false);
    expect(r.wind?.isVariable).toBe(false);
  });

  it("metres par seconde : 26007MPS -> 25 km/h", () => {
    const r = decode("URMM 231800Z 26007MPS 9999 22/20 Q1006");
    expect(r.wind?.speed).toBe(25); // 7 mps * 3,6 = 25,2 -> 25
    expect(r.wind?.directionDeg).toBe(260);
  });

  it("rafales : 21015G30KT -> rafale 56 km/h", () => {
    const r = decode("CWLY 231800Z 21015G30KT 9999 29/12 Q1010");
    expect(r.wind?.gust).toBe(56); // 30 kt * 1,852 = 55,6 -> 56
  });

  it("calme : 00000KT -> isCalm, pas de direction", () => {
    const r = decode("EDDF 231800Z 00000KT CAVOK 22/08 Q1019");
    expect(r.wind?.isCalm).toBe(true);
    expect(r.wind?.directionDeg).toBeNull();
    expect(r.wind?.speed).toBe(0);
  });

  it("variable : VRB03KT -> isVariable, pas de direction", () => {
    const r = decode("KEYE 231800Z VRB03KT 9999 23/09 Q1013");
    expect(r.wind?.isVariable).toBe(true);
    expect(r.wind?.directionDeg).toBeNull();
    expect(r.wind?.speed).toBe(6); // 3 kt -> 5,556 -> 6
  });

  it("absent : /////KT -> tout null, aucune exception", () => {
    const r = decode("SVVA 231800Z /////KT 9999 32/22 Q1016");
    expect(r.wind?.speed).toBeNull();
    expect(r.wind?.directionDeg).toBeNull();
  });

  it("vitesse absente : 090//KT -> direction 090, vitesse null", () => {
    const r = decode("XXXX 231800Z 090//KT 9999 30/25 Q1010");
    expect(r.wind?.directionDeg).toBe(90);
    expect(r.wind?.speed).toBeNull();
  });
});

describe("visibilite", () => {
  it("9999 reste 9999 metres (signifie « plus de 10 km »)", () => {
    const r = decode("LFST 231800Z 24008KT 9999 24/07 Q1018");
    expect(r.visibility?.value).toBe(9999);
    expect(r.visibility?.isCavok).toBe(false);
  });

  it("CAVOK -> isCavok, et remplace les nuages (clouds vide)", () => {
    const r = decode("LFST 231800Z 24008KT CAVOK 24/07 Q1018");
    expect(r.visibility?.isCavok).toBe(true);
    expect(r.clouds).toEqual([]);
  });

  it("SM fractionnaire compose : 1 3/4SM -> 2816 metres", () => {
    const r = decode("CWLY 231800Z 21015KT 1 3/4SM 29/12 A2987");
    expect(r.visibility?.value).toBe(2816); // 1,75 * 1609,344 = 2816,3 -> 2816
  });

  it("SM prefixe M : M1/4SM -> 402 metres", () => {
    const r = decode("KSMP 231800Z VRB05KT M1/4SM 14/14 A3013");
    expect(r.visibility?.value).toBe(402); // 0,25 * 1609,344 = 402,3 -> 402
  });
});

describe("nuages colles et annotations", () => {
  it("OVC007FEW040CB -> deux couches separees", () => {
    const r = decode("SGPJ 231800Z 14004KT 9999 OVC007FEW040CB 17/17 Q1018");
    expect(r.clouds).toEqual([
      { coverage: "OVC", altitude: 200, unit: "m" },
      { coverage: "FEW", altitude: 1200, unit: "m" },
    ]);
  });

  it("FEW010(CBSW) -> annotation entre parentheses ignoree", () => {
    const r = decode("SVMC 231800Z 18004KT 9999 FEW010(CBSW) 33/25 Q1013");
    expect(r.clouds).toEqual([{ coverage: "FEW", altitude: 300, unit: "m" }]);
  });

  it("CLR -> aucune couche (tableau vide, pas null)", () => {
    const r = decode("KCIR 231800Z 03008KT 10SM CLR 26/17 A3016");
    expect(r.clouds).toEqual([]);
  });
});

describe("visibilite verticale (brouillard)", () => {
  it("VV001 -> verticalVisibility renseignee, clouds vide", () => {
    const r = decode("KSMP 231800Z VRB05KT M1/4SM FG VV001 14/14 A3013");
    expect(r.verticalVisibility).not.toBeNull();
    expect(r.clouds).toEqual([]);
  });
});

describe("pression", () => {
  it("Q1018 -> 1018 hPa", () => {
    const r = decode("LFST 231800Z 24008KT CAVOK 24/07 Q1018");
    expect(r.pressure).toEqual({ value: 1018, unit: "hPa" });
  });

  it("A2998 (pouces) -> 1015 hPa", () => {
    const r = decode("KLAX 231800Z 25008KT 10SM CLR 26/18 A2998");
    expect(r.pressure).toEqual({ value: 1015, unit: "hPa" }); // 29,98 * 33,8639 = 1015,2
  });

  it("Q//// -> valeur null, pas d'exception", () => {
    const r = decode("RJSN 231800Z /////KT //// // ////// ///// Q////");
    expect(r.pressure?.value).toBeNull();
  });
});

describe("phenomenes et severite", () => {
  it("TS -> severite danger", () => {
    const r = decode("SGPJ 231800Z 14004KT 9999 TS 17/17 Q1018");
    const ts = r.phenomena.find((p) => p.code.includes("TS"));
    expect(ts?.severity).toBe("danger");
  });

  it("-TSRA -> severite danger (orage avec pluie)", () => {
    const r = decode("WIMM 231800Z 22004KT 6000 -TSRA 25/25 Q1010");
    const p = r.phenomena.find((x) => x.code.includes("TSRA"));
    expect(p?.severity).toBe("danger");
  });

  it("FZRA -> severite danger (pluie verglacante)", () => {
    const r = decode("XXXX 231800Z 24008KT 2000 FZRA 00/M02 Q1005");
    const p = r.phenomena.find((x) => x.code.includes("FZRA"));
    expect(p?.severity).toBe("danger");
  });

  it("-RA -> severite info", () => {
    const r = decode("XXXX 231800Z 18005KT 8000 -RA 21/20 Q1014");
    const p = r.phenomena.find((x) => x.code.includes("RA"));
    expect(p?.severity).toBe("info");
  });
});

describe("humidite plafonnee et warning", () => {
  it("point de rosee > temperature -> humidite 100 + warning", () => {
    // Cas aberrant du corpus : 21/25 (rosee 25 > temp 21).
    const r = decode("181800Z 11014KT 9999 FEW015 BKN290 21/25 Q1020");
    expect(r.temperature?.humidity).toBe(100);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("robustesse extreme", () => {
  it("ligne entierement barree : objet valide, aucune exception", () => {
    expect(() => decode("RJSN 231800Z AUTO /////KT //// // ////// ///// Q////")).not.toThrow();
  });

  it("NIL : pas d'observation, aucune exception", () => {
    expect(() => decode("DNZA 221400SK 221400Z NIL")).not.toThrow();
  });

  it("ligne corrompue : aucune exception, pas de temperature parasite", () => {
    const r = decode("030046Z AZIS&LM)U10SM 18/10J RJS135 T01830128 TSNO $");
    expect(r.temperature).toBeNull(); // « 18/10J » n'est pas une temperature valide
  });

  it("chaine vide : objet valide, aucune exception", () => {
    expect(() => decode("")).not.toThrow();
    expect(decode("").temperature).toBeNull();
  });
});
