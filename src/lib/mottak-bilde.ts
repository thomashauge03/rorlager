// Bilde til mottakskontrollen: komprimering, opplasting og signerte lenker.
//
// Bøtta er PRIVAT. Bildene kan vise folk på ein byggjeplass, og då er dei
// personopplysningar – ingen offentlege URL-ar, berre signerte lenker med kort
// levetid.

import { supabase } from "@/integrations/supabase/client";

export const BØTTE = "mottak-bilder";

/** Så mange bilete per mottak. Nok til å dokumentere, lite nok til å laste opp. */
export const MAKS_BILETE = 6;

const MAKS_KANT = 1600;
const KVALITET = 0.72;

/**
 * Krympar bildet før opplasting.
 *
 * Eit mobilbilete er 3–8 MB. På ein byggjeplass med halv dekning tek det
 * minutt, og sjåføren står og ventar. Etter dette er det typisk 150–400 kB, og
 * framleis godt nok til å sjå ein sprekk i eit røyr.
 *
 * Feilar noko – eit format nettlesaren ikkje teiknar, eit canvas som ikkje gir
 * blob – sender vi originalen. Eit stort bilete er betre enn ingen.
 */
export async function krymp(fil: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(fil);
    const skala = Math.min(1, MAKS_KANT / Math.max(bitmap.width, bitmap.height));

    // Alt lite nok slepp unna ei unødvendig omkoding
    if (skala === 1 && fil.size < 600_000) return fil;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * skala);
    canvas.height = Math.round(bitmap.height * skala);

    const ctx = canvas.getContext("2d");
    if (!ctx) return fil;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", KVALITET));
    return blob && blob.size < fil.size ? blob : fil;
  } catch {
    return fil;
  }
}

/**
 * Lastar opp eitt bilete og gir stien tilbake.
 *
 * Stien startar med prosjekt-id fordi tilgangspolicyen på Storage les nettopp
 * det leddet – då kan ho avgjere tilgang utan eit tabelloppslag. Andre ledd er
 * client_ref, nøkkelen som alt gjer innsendinga idempotent; mottaket finst
 * ikkje enno når bildet blir lasta opp.
 */
/** Formata bøtta tek imot. Alt anna blir avvist av Storage, ikkje av oss. */
const GODTEKNE = ["image/jpeg", "image/png", "image/webp"] as const;

export async function lastOppBilde(
  projectId: string,
  clientRef: string,
  fil: File,
  nummer: number,
): Promise<string> {
  const blob = await krymp(fil);

  /*
   * Kom komprimeringa ikkje i mål, held vi ikkje fram med eit format bøtta
   * nektar å ta imot.
   *
   * createImageBitmap klarar ikkje HEIC i Chrome og Firefox. Då fall koden
   * tilbake til originalfila – men sette samtidig endelsa til «jpg» medan
   * contentType framleis var «image/heic», og opplastinga blei avvist med ei
   * engelsk Postgres-melding. Kommentaren sa «eit stort bilete er betre enn
   * ingen»; på den stien blei det ingen.
   */
  const type = GODTEKNE.includes(blob.type as (typeof GODTEKNE)[number]) ? blob.type : null;
  if (!type) {
    throw new Error(
      "Nettleseren klarte ikke å lese dette bildeformatet. Ta bildet med kameraet i appen i stedet for å velge det fra galleriet.",
    );
  }

  const endelse = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  // Berre teikn stien og policyen godtek: bokstavar, tal, punktum, bindestrek
  const sti = `${projectId}/${clientRef}/${nummer}-${Date.now()}.${endelse}`;

  const { error } = await supabase.storage.from(BØTTE).upload(sti, blob, {
    contentType: type,
    upsert: false,
  });

  if (error) {
    if (/exceeded|too large|maximum/i.test(error.message)) {
      throw new Error("Bildet er for stort. Prøv å ta det på nytt.");
    }
    throw new Error(`Bildet ble ikke lastet opp: ${error.message}`);
  }

  return sti;
}

/**
 * Fjernar eit bilete som er lasta opp, men ikkje kvittert for enno.
 *
 * Kastar ved feil. Tidlegare blei svaret ikkje lese i det heile, og kallaren
 * svelgde det – så brukaren såg miniatyren forsvinne frå skjermen medan fila
 * blei liggjande i bøtta. Han trudde biletet var borte. Det var det ikkje.
 */
export async function slettBilde(sti: string): Promise<void> {
  const { error } = await supabase.storage.from(BØTTE).remove([sti]);
  if (error) throw new Error(`Bildet ble ikke fjernet: ${error.message}`);
}

/**
 * Hentar bileta som data-URL-ar, klare for PDF-en.
 *
 * jsPDF kan ikkje laste ned noko sjølv, og ei signert lenke ville dessutan
 * gått ut. Bileta må difor liggje i dokumentet.
 *
 * Feilar eitt av dei, blir det hoppa over. Ein PDF utan eitt bilete er langt
 * betre enn ingen PDF når du står i ein reklamasjon.
 */
export type Bildedata = { data: string; bredde: number; høgde: number };

export async function hentBildeData(stiar: string[]): Promise<Bildedata[]> {
  const lenker = await signerteLenker(stiar);
  const ut: Bildedata[] = [];

  for (const sti of stiar) {
    const url = lenker[sti];
    if (!url) continue;
    try {
      const blob = await (await fetch(url)).blob();
      const data = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = rej;
        r.readAsDataURL(blob);
      });
      // Målene følgjer med: utan dei må PDF-en gjette eit sideforhold, og eit
      // portrettbilete av ein palle blir strekt på tvers.
      const bit = await createImageBitmap(blob);
      ut.push({ data, bredde: bit.width, høgde: bit.height });
      bit.close?.();
    } catch {
      /* hopp over dette biletet */
    }
  }
  return ut;
}

/**
 * Signerte lenker til bilete som høyrer eit mottak.
 *
 * Ei time held: dei blir brukte til å teikne miniatyrar og til å hente bileta
 * inn i PDF-en. Lenka er ikkje meint å delast.
 */
export async function signerteLenker(stiar: string[]): Promise<Record<string, string>> {
  if (stiar.length === 0) return {};
  const { data, error } = await supabase.storage.from(BØTTE).createSignedUrls(stiar, 3600);
  if (error) return {};
  return Object.fromEntries(
    (data ?? []).filter((d) => d.signedUrl).map((d) => [d.path ?? "", d.signedUrl as string]),
  );
}
