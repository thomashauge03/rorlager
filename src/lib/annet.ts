// «Annet»: det katalogen manglar, lagt i kurva med eigne ord.
//
// Ei annet-linje bur i same kurv som dei andre, men har ingen vare bak seg.
// Ho får ein nøkkel med prefikset «annet-» i staden for ein vare-id, slik at to
// annet-linjer aldri blir slått saman og aldri blir forveksla med ei vare.
// Basen sjekkar dei same grensene; desse er her så skjemaet kan seie frå med
// ein gong. Sjå supabase/migrations/20261013110000_annet_forslag.sql.

export const ANNET_GRENSER = {
  namn: 120,
  dimensjon: 60,
  merknad: 300,
  /** Per uttak eller bestilling. */
  linjer: 10,
} as const;

export type AnnetEining = "m" | "stk";

/** Det som er særeige for ei annet-linje. Namn, dimensjon og eining står på linja. */
export type AnnetData = { note: string | null };

/** Det skjemaet gir frå seg. */
export type AnnetSkjema = {
  name: string;
  dimension: string;
  unit: AnnetEining;
  quantity: number | null;
  note: string;
};

/** Det kunden les om ei annet-linje, same ord overalt. */
export const ANNET_TEKST = {
  merke: "Annet",
  uttak: "Pris settes av kontoret",
  bestilling: "Forespørsel – du får pris før vi godkjenner",
  /** Der ei linje utan pris står på ei kvittering, ein PDF eller i ein e-post. */
  prisKjem: "Pris kommer",
  utanPris: (n: number) => `+ ${n} ${n === 1 ? "forespørsel" : "forespørsler"} uten pris`,
  ikkjeBindande:
    "Forespørsler uten pris er ikke bindende. Prisen står i e-posten når bestillingen er klar – vil du ikke ha varen, sier du fra når du henter.",
} as const;

export const TOMT_ANNET: AnnetSkjema = { name: "", dimension: "", unit: "m", quantity: null, note: "" };

const PREFIKS = "annet-";

export const erAnnetId = (id: string) => id.startsWith(PREFIKS);

export const nyAnnetId = () =>
  PREFIKS +
  (typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

/** Første feil i skjemaet, eller null. Same meldingar som basen gir. */
export function sjekkAnnet(s: AnnetSkjema): string | null {
  const namn = s.name.trim();
  if (!namn) return "Skriv hva varen er";
  if (namn.length > ANNET_GRENSER.namn) return `Navnet på varen er for langt (høyst ${ANNET_GRENSER.namn} tegn)`;
  if (s.dimension.trim().length > ANNET_GRENSER.dimensjon)
    return `Dimensjonen er for lang (høyst ${ANNET_GRENSER.dimensjon} tegn)`;
  if (s.unit !== "m" && s.unit !== "stk") return "Velg meter eller stykk";
  if (s.quantity === null || !Number.isFinite(s.quantity) || s.quantity <= 0) return "Skriv hvor mye";
  if (s.quantity > 100000) return "Mengden er urimelig stor";
  if (s.note.trim().length > ANNET_GRENSER.merknad) return `Merknaden er for lang (høyst ${ANNET_GRENSER.merknad} tegn)`;
  return null;
}

/** Felta ei kurvlinje treng, for begge kurvene. */
export const annetLinjeFelt = (s: AnnetSkjema) => ({
  pipe_type_id: nyAnnetId(),
  name: s.name.trim(),
  dimension: s.dimension.trim() || null,
  sku: null,
  unit: s.unit,
  price: null,
  quantity: Math.round((s.quantity ?? 0) * 100) / 100,
  annet: { note: s.note.trim() || null } satisfies AnnetData,
});

/** Ei linje slik pipe_submit_order og pipe_submit_pickup_order vil ha henne. */
export type InnsendingsLinje =
  | { pipe_type_id: string; quantity: number }
  | { annet: { name: string; dimension: string | null; unit: string; note: string | null }; quantity: number };

export const tilInnsendingslinje = (l: {
  pipe_type_id: string;
  quantity: number;
  name?: string;
  dimension?: string | null;
  unit?: string;
  annet?: AnnetData;
}): InnsendingsLinje =>
  l.annet
    ? {
        annet: { name: l.name ?? "", dimension: l.dimension ?? null, unit: l.unit ?? "m", note: l.annet.note },
        quantity: l.quantity,
      }
    : { pipe_type_id: l.pipe_type_id, quantity: l.quantity };

export const talAnnet = (lines: { annet?: AnnetData }[]) => lines.filter((l) => l.annet).length;
