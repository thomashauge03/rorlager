// Lager QR-matrisene som tegnes i filmen.
//
//   node scripts/lag-qr.mjs
//
// Kodene er ekte og kan skannes fra skjermen, men de peker til nettsiden —
// aldri til en maskinside. Da kan ingen starte en leie fra filmen.
//
// Skriver src/merke/qr-data.ts.
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";
import path from "node:path";

const ADRESSE = "https://haugemaskin.no";

const qr = QRCode.create(ADRESSE, { errorCorrectionLevel: "M" });
const n = qr.modules.size;
let bits = "";
for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) bits += qr.modules.get(y, x) ? "1" : "0";

writeFileSync(
  path.resolve("src/merke/qr-data.ts"),
  `// Laget av scripts/lag-qr.mjs. Ikke rediger for hånd.

/** QR-koden i filmen: ${ADRESSE} (feilretting M). */
export const QR = {
  adresse: "${ADRESSE}",
  storrelse: ${n},
  /** Modulene rad for rad, «1» er mørk */
  moduler: "${bits}",
} as const;
`,
);
console.log(`qr: ${ADRESSE}, ${n} × ${n} moduler`);
