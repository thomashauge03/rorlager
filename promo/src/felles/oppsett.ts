import { useFormat } from "../format";
import { miks } from "./hjelp";

/**
 * Hvor telefonen og teksten står i hvert format.
 *
 * `side` gjelder liggende film: 0 = telefonen til venstre og teksten til
 * høyre (steg 1–4), 1 = omvendt (steg 5). I de stående formatene står
 * teksten øverst og telefonen under, og siden spiller ingen rolle.
 */
export const useOppsett = () => {
  const { type, width, height } = useFormat();
  if (type === "liggende") {
    return {
      type,
      width,
      height,
      telefon: (side: number) => ({ x: miks(600, 1320, side), y: 540, zoom: 1, ry: miks(-9, 9, side) }),
      tekst: (side: number) => ({ x: miks(1010, 128, side), y: 540, bredde: 800, skala: 1, loddrett: "midt" as const }),
      logo: { hoyde: 58, x: width - 64, y: 54, anker: "hoyre" as const },
      skinne: { y: height - 44 },
      /** Der den store tegningen (vibroplate, skilt) står */
      scene: (side: number) => ({ x: miks(540, 1360, side), y: 560, bredde: miks(1000, 940, side) }),
    };
  }
  if (type === "staaende") {
    return {
      type,
      width,
      height,
      telefon: () => ({ x: 540, y: 1300, zoom: 1.14, ry: 0 }),
      tekst: () => ({ x: 84, y: 250, bredde: 912, skala: 0.94, loddrett: "topp" as const }),
      logo: { hoyde: 52, x: width / 2, y: 92, anker: "midt" as const },
      skinne: { y: 196 },
      scene: () => ({ x: 540, y: 1190, bredde: 1000 }),
    };
  }
  return {
    type,
    width,
    height,
    telefon: () => ({ x: 540, y: 900, zoom: 0.9, ry: 0 }),
    tekst: () => ({ x: 70, y: 76, bredde: 760, skala: 0.76, loddrett: "topp" as const }),
    logo: { hoyde: 46, x: width - 60, y: 62, anker: "hoyre" as const },
    // Ingen framdriftslinje i 4:5: den ville ligget oppå telefonen, og
    // «STEG N AV 5» sier det samme
    skinne: undefined,
    scene: () => ({ x: 540, y: 840, bredde: 980 }),
  };
};

export type Oppsett = ReturnType<typeof useOppsett>;
