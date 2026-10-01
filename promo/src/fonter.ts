import { loadFont as lastDmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as lastGeist } from "@remotion/google-fonts/Geist";

// Æ, ø og å ligger i «latin» (U+00C0–00FF).

/**
 * Filmens egen tekst, som i Leveringsseddel-filmen — og rørlagerets font
 * (src/index.css i appen), så skjermene og teksten rundt dem er like.
 */
export const dmSans = lastDmSans("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] }).fontFamily;

/** Telefonens egen tekst: statuslinja, tastaturet og kameraappen. */
export const geist = lastGeist("normal", { weights: ["400", "500", "600", "700"], subsets: ["latin"] }).fontFamily;
