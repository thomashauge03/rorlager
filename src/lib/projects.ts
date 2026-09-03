// Datalaget for prosjekt, bestilling og mottakskontroll.
//
// Skild frå orders.ts med vilje: dette er ein annan kjede. orders.ts handlar om
// varer firmaet EIG og som blir tekne ut av lageret; her blir varer KJØPTE inn
// og køyrde frå leverandøren rett ut på byggjeplassen. Ingen beholdning blir
// rørt, og ingenting her skriv til pipe_stock_log.

import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import type {
  Deviation,
  ProjectMemberRow,
  ProjectOrderLine,
  ProjectOrderLineRow,
  ProjectOrderRow,
  ProjectOrderWithLines,
  ProjectReceiptLineRow,
  ProjectReceiptRow,
  ProjectRow,
} from "@/lib/types";

/** Same mønster som i orders.ts: norsk kontekst utanpå Postgres-feilen. */
function fail(context: string, error: { message?: string } | null): never {
  const detail = error?.message?.trim();
  throw new Error(detail ? `${context}: ${detail}` : context);
}

const nb = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? "").localeCompare(b ?? "", "nb", { numeric: true });

/**
 * Eit nei frå RLS er ikkje ein feil – det er null rader.
 *
 * PostgREST svarar 204 utan feilmelding når ein policy filtrerer bort rada, så
 * ein delete som ikkje sletta noko ser nøyaktig ut som ein som gjorde det.
 * Klienten sa då «Behovet er trukket tilbake» om ei bestilling som framleis
 * står, og brukaren trur ho er borte medan kontoret bestiller ho.
 *
 * Difor ber vi alltid om rada tilbake, og reknar tomt svar som avvist.
 */
function kreverTreff(rader: unknown[] | null, nekting: string): void {
  if (!rader || rader.length === 0) throw new Error(nekting);
}

// ---------------------------------------------------------------- rekning
//
// Reine funksjonar, utan Supabase. Dei er det einaste her som reknar, og difor
// det einaste som er verdt å enhetsteste.

/**
 * Rundar bort flyttalsstøy.
 *
 * `6.4 - 2.3` er `4.1000000000000005` i IEEE754. Det talet blei forhåndsfylt
 * rått i mottaksskjemaet, medan overskrifta over feltet viste «4,1» – og når
 * plassen sende inn, såg databasen 2,3 + 4,1000000000000005 > 6,4 og stempla ei
 * heilt korrekt leveranse som «For mye». Tre desimalar er rikeleg for meter og
 * stykk, og fjernar heile klassen.
 */
const rundAv = (n: number) => Math.round(n * 1000) / 1000;

/** Kva som er mottatt på éi bestillingslinje, summert over alle puljer. */
export function receivedForLine(lineId: string, receiptLines: ProjectReceiptLineRow[]): number {
  return rundAv(
    receiptLines
      .filter((rl) => rl.order_line_id === lineId)
      .reduce((sum, rl) => sum + Number(rl.received_qty ?? 0), 0),
  );
}

/**
 * Legg mottatt og rest på linjene.
 *
 * Rest kan bli negativ, og det er meininga: kom det meir enn bestilt, er det
 * reell informasjon. Same haldning som at beholdninga får gå i minus i
 * uttaksdelen framfor å bli runda opp til noko penare.
 */
export function withReceived(
  lines: ProjectOrderLineRow[],
  receiptLines: ProjectReceiptLineRow[],
): ProjectOrderLine[] {
  return lines.map((l) => {
    const received = receivedForLine(l.id, receiptLines);
    const ordered = l.ordered_qty === null || l.ordered_qty === undefined ? null : Number(l.ordered_qty);
    return {
      ...l,
      received_qty: received,
      // Er ingenting bestilt enno, finst det ingen rest å snakke om.
      remaining_qty: ordered === null ? 0 : rundAv(ordered - received),
    };
  });
}

/*
 * Her låg derivedStatus(), ein TS-kopi av statusutrekninga i databasen.
 *
 * Den blei fjerna fordi ingen kalla henne: sidene viser statusen frå basen, som
 * er den einaste som gjeld. Ein kopi som ingen bruker kan berre gjere éin ting,
 * og det er å bli usamd med originalen i det stille – noko testane hennar aldri
 * ville oppdaga, sidan dei prøvde kopien og ikkje databasen.
 *
 * Utrekninga står no eitt stad: public.project_recompute_status().
 */

/**
 * Er leveransen forsinka?
 *
 * Rein utleiing frå forventet dato og status – ingen kolonne, ingenting som kan
 * bli ståande feil fordi ingen har rydda i det.
 */
export function isOverdue(order: Pick<ProjectOrderRow, "expected_at" | "status">, today = new Date()): boolean {
  if (!order.expected_at) return false;
  if (order.status !== "bestilt" && order.status !== "delvis") return false;
  const dag = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return new Date(order.expected_at) < dag;
}

/**
 * Avviket tala åleine kan slå fast.
 *
 * MERK at for lite IKKJE gir 'mangler'. Ei bestilling kjem i puljer – det er
 * heile grunnen til at mottak er ein eigen tabell – så pulje 1 av 3 er ikkje eit
 * avvik, det er ein pulje. Ein tidlegare versjon stempla kvar delleveranse som
 * «Mangler», og kontorets avviksliste fyltest med leveransar der ingenting var
 * gale. Kva som står att, står allereie i remaining_qty.
 *
 * For mykje er derimot alltid verdt å seie frå om, og databasen tvingar det
 * same uansett kva klienten sender.
 */
export function suggestDeviation(received: number, remaining: number): Deviation {
  return received > remaining ? "for_mye" : "ingen";
}

// ---------------------------------------------------------------- rolle

/** Rolla til den innlogga: 'super_admin', 'admin', 'prosjekt' … eller null. */
export async function fetchRole(): Promise<string | null> {
  const { data, error } = await supabase.rpc("hm_rolle");
  if (error) throw new Error(error.message);
  return (data as string | null) ?? null;
}

// ---------------------------------------------------------------- prosjekt

export async function fetchProjects(): Promise<ProjectRow[]> {
  const { data, error } = await supabase.from("projects").select("*");
  if (error) fail("Klarte ikke å hente prosjektene", error);
  return (data ?? []).sort(
    (a, b) => Number(a.status === "avsluttet") - Number(b.status === "avsluttet") || nb(a.name, b.name),
  );
}

export async function fetchProject(id: string): Promise<ProjectRow | null> {
  const { data, error } = await supabase.from("projects").select("*").eq("id", id).maybeSingle();
  if (error) fail("Klarte ikke å hente prosjektet", error);
  return data ?? null;
}

export async function saveProject(patch: Partial<ProjectRow> & { id?: string }): Promise<ProjectRow> {
  const { id, ...values } = patch;
  const query = id
    ? supabase.from("projects").update(values).eq("id", id).select("*").single()
    : supabase.from("projects").insert(values as ProjectRow).select("*").single();

  const { data, error } = await query;
  if (error) fail("Klarte ikke å lagre prosjektet", error);
  return data as ProjectRow;
}

export async function deleteProject(id: string): Promise<void> {
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id");
  if (error) fail("Klarte ikke å slette prosjektet", error);
  kreverTreff(data, "Prosjektet ble ikke slettet. Du har kanskje ikke tilgang til det lenger.");
}

// ---------------------------------------------------------------- medlemmer

export async function fetchProjectMembers(projectId: string): Promise<ProjectMemberRow[]> {
  const { data, error } = await supabase.from("project_members").select("*").eq("project_id", projectId);
  if (error) fail("Klarte ikke å hente medlemmene", error);
  return (data ?? []).sort((a, b) => nb(a.email, b.email));
}

export async function addProjectMember(projectId: string, email: string): Promise<void> {
  const { error } = await supabase
    .from("project_members")
    .insert({ project_id: projectId, email: email.trim().toLowerCase() } as ProjectMemberRow);
  // Unik-indeksen er på lower(email), så to skrivemåtar av same adresse kolliderer
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("Personen er allerede satt på prosjektet.");
    fail("Klarte ikke å legge til personen", error);
  }
}

/**
 * Kva prosjekt ein person er sett på.
 *
 * .eq og IKKJE .ilike. ilike sender mønsteret rått til Postgres, der `_` matchar
 * eit vilkårleg teikn – så «per_hansen@hm.no» ville òg treft «per.hansen@hm.no».
 * På lesing gir det feil avkryssingar; på sletting ville det fjerna ein ANNAN
 * person sin tilgang. Alle skrivingar legg inn med små bokstavar, så .eq mot ei
 * småskriven adresse treffer det som finst.
 */
export async function fetchMemberProjects(email: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("project_members")
    .select("project_id")
    .eq("email", email.trim().toLowerCase());
  if (error) fail("Klarte ikke å hente prosjekttilgangen", error);
  return (data ?? []).map((r) => r.project_id);
}

/**
 * Set heile lista over prosjekt ein person har tilgang til.
 *
 * Skriv berre skilnaden. Å slette alt og setje inn på nytt ville gitt eit
 * augeblikk der personen ikkje såg prosjekta sine – og står han midt i ein
 * mottakskontroll då, mistar han det han har skrive.
 *
 * Feilar noko halvvegs, seier vi kva som faktisk skjedde. Ei melding om at
 * «ingenting blei lagra» når halvparten landa, er verre enn inga melding: då
 * prøver superadmin på nytt utan å vite kva han rettar.
 */
export async function setMemberProjects(email: string, projectIds: string[]): Promise<void> {
  const e = email.trim().toLowerCase();
  const har = await fetchMemberProjects(e);

  const skalLeggjeTil = projectIds.filter((id) => !har.includes(id));
  const skalFjerne = har.filter((id) => !projectIds.includes(id));

  let lagtTil = 0;

  if (skalLeggjeTil.length > 0) {
    const { error } = await supabase
      .from("project_members")
      .insert(skalLeggjeTil.map((project_id) => ({ project_id, email: e })) as ProjectMemberRow[]);
    if (error) fail("Klarte ikke å legge til prosjekttilgang", error);
    lagtTil = skalLeggjeTil.length;
  }

  if (skalFjerne.length > 0) {
    const { error } = await supabase
      .from("project_members")
      .delete()
      .eq("email", e)
      .in("project_id", skalFjerne);
    if (error) {
      const halvvegs = lagtTil > 0 ? ` ${lagtTil} nye prosjekt ble lagt til, men` : "";
      throw new Error(`Klarte ikke å fjerne prosjekttilgang.${halvvegs} de gamle står fortsatt.`);
    }
  }
}

export async function removeProjectMember(id: string): Promise<void> {
  const { data, error } = await supabase.from("project_members").delete().eq("id", id).select("id");
  if (error) fail("Klarte ikke å fjerne personen", error);
  kreverTreff(data, "Personen ble ikke fjernet. Bare kontoret kan endre hvem som er på et prosjekt.");
}

// ---------------------------------------------------------------- bestillingar

const ORDER_SELECT = "*, project_order_lines(*), project_receipts(*, project_receipt_lines(*))";

type RaaBestilling = ProjectOrderRow & {
  project_order_lines?: ProjectOrderLineRow[] | null;
  project_receipts?: (ProjectReceiptRow & { project_receipt_lines?: ProjectReceiptLineRow[] | null })[] | null;
};

/** Set saman rada, linjene og mottaka til det sidene faktisk vil ha. */
function formBestilling(rad: RaaBestilling): ProjectOrderWithLines {
  const { project_order_lines, project_receipts, ...order } = rad;

  const receipts = [...(project_receipts ?? [])]
    .map(({ project_receipt_lines, ...r }) => ({ ...r, lines: project_receipt_lines ?? [] }))
    .sort((a, b) => a.received_at.localeCompare(b.received_at));

  const alleMottakslinjer = receipts.flatMap((r) => r.lines);

  const lines = withReceived(
    [...(project_order_lines ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || nb(a.name, b.name)),
    alleMottakslinjer,
  );

  return { ...order, lines, receipts };
}

export async function fetchProjectOrders(projectId: string): Promise<ProjectOrderWithLines[]> {
  const { data, error } = await supabase.from("project_orders").select(ORDER_SELECT).eq("project_id", projectId);
  if (error) fail("Klarte ikke å hente bestillingene", error);
  return ((data ?? []) as unknown as RaaBestilling[])
    .map(formBestilling)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Alle bestillingar på tvers av prosjekt. Kontoret sitt oversyn. */
export async function fetchAllProjectOrders(): Promise<ProjectOrderWithLines[]> {
  const { data, error } = await supabase.from("project_orders").select(ORDER_SELECT);
  if (error) fail("Klarte ikke å hente bestillingene", error);
  return ((data ?? []) as unknown as RaaBestilling[])
    .map(formBestilling)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchProjectOrder(id: string): Promise<ProjectOrderWithLines | null> {
  const { data, error } = await supabase.from("project_orders").select(ORDER_SELECT).eq("id", id).maybeSingle();
  if (error) fail("Klarte ikke å hente bestillingen", error);
  return data ? formBestilling(data as unknown as RaaBestilling) : null;
}

export type NyLinje = {
  pipe_type_id: string | null;
  name: string;
  dimension: string | null;
  sku: string | null;
  unit: string;
  requested_qty: number;
  line_note: string | null;
};

/**
 * Melder inn eit behov: hovudrada og linjene i éin transaksjon.
 *
 * Gjekk tidlegare som to skrivingar med ei opprydding imellom. Den oppryddinga
 * kunne sjølv feile, og dett nettet mellom rundturane køyrer ho ikkje i det
 * heile – då blei det ståande att ei tom bestilling på kontorets liste som
 * ingen kunne fjerne derifrå. Plassen har heller ikkje skriverett på tabellane
 * lenger; vakta ligg i RPC-en, slik ho gjer for uttaka.
 */
export async function createProjectOrder(input: {
  projectId: string;
  requestedByName: string;
  neededBy: string | null;
  note: string | null;
  lines: NyLinje[];
}): Promise<ProjectOrderRow> {
  if (input.lines.length === 0) throw new Error("Legg til minst én vare før du melder inn behovet.");

  const { data, error } = await supabase.rpc("project_submit_request", {
    p_project_id: input.projectId,
    p_requested_by_name: input.requestedByName,
    p_lines: input.lines as unknown as Json,
    p_needed_by: input.neededBy,
    p_note: input.note,
  });

  // Meldingane frå databasen er alt norske og skrivne for brukaren
  if (error) throw new Error(error.message || "Klarte ikke å melde inn behovet");
  return data as ProjectOrderRow;
}

/** Kontorets notat på bestillinga. Blir vist til plassen, ikkje berre lagra. */
export async function saveOfficeNote(id: string, note: string | null): Promise<void> {
  const { data, error } = await supabase.from("project_orders").update({ office_note: note }).eq("id", id).select("id");
  if (error) fail("Klarte ikke å lagre notatet", error);
  kreverTreff(data, "Notatet ble ikke lagret. Bare kontoret kan endre en bestilling.");
}

export async function setOrderStatus(id: string, status: ProjectOrderRow["status"]): Promise<void> {
  const { data, error } = await supabase.from("project_orders").update({ status }).eq("id", id).select("id");
  if (error) fail("Klarte ikke å endre statusen", error);
  kreverTreff(data, "Statusen ble ikke endret. Bare kontoret kan endre en bestilling.");
}

export async function deleteProjectOrder(id: string): Promise<void> {
  const { data, error } = await supabase.from("project_orders").delete().eq("id", id).select("id");
  if (error) fail("Klarte ikke å slette bestillingen", error);
  // Har kontoret rukket å bestille i mellomtida, er den ikkje lenger vår å
  // trekkje – og då skal brukaren få vite det, ikkje sjå «trukket tilbake».
  kreverTreff(data, "Behovet ble ikke trukket tilbake. Kontoret har trolig alt bestilt det.");
}

/** Kontorets bekreftelse på kva som faktisk blei tinga. */
export async function markOrdered(input: {
  orderId: string;
  supplier: string | null;
  supplierRef: string | null;
  expectedAt: string | null;
  officeNote: string | null;
  lines: { id: string; ordered_qty: number }[];
}): Promise<void> {
  const { error } = await supabase.rpc("project_mark_ordered", {
    p_order_id: input.orderId,
    p_supplier: input.supplier,
    p_supplier_ref: input.supplierRef,
    p_expected_at: input.expectedAt,
    p_lines: input.lines as unknown as Json,
    p_office_note: input.officeNote,
  });
  // Meldingane frå databasen er alt norske og skrivne for brukaren
  if (error) throw new Error(error.message || "Klarte ikke å registrere bestillingen");
}

/**
 * Mottakskontrollen. Ei skriving, heil eller ingen.
 *
 * clientRef er laga FØR første forsøk og er den same om brukaren prøver på
 * nytt. Går skrivinga gjennom men svaret blir borte – som det gjer på ein
 * byggjeplass med dårleg dekning – svarar andre forsøket med det same mottaket
 * i staden for å lage ei pulje nummer to med dei same tala.
 */
export async function submitReceipt(input: {
  orderId: string;
  receivedByName: string;
  signature: string | null;
  note: string | null;
  clientRef: string;
  lines: { order_line_id: string; received_qty: number; deviation: Deviation; note: string | null }[];
}): Promise<ProjectReceiptRow> {
  const { data, error } = await supabase.rpc("project_submit_receipt", {
    p_order_id: input.orderId,
    p_received_by_name: input.receivedByName,
    p_lines: input.lines as unknown as Json,
    p_signature: input.signature,
    p_note: input.note,
    p_client_ref: input.clientRef,
  });
  if (error) throw new Error(error.message || "Klarte ikke å registrere mottaket");
  return data as ProjectReceiptRow;
}
