import { TopBar } from "@/components/TopBar";
import { useSettings } from "@/lib/settings";

/**
 * Personvernerklæring.
 *
 * Uttaksskjemaet samlar namn, mobilnummer og adresse frå kundar som ikkje er
 * innlogga. GDPR artikkel 13 krev at dei får vite kven som er ansvarleg, kva
 * som blir lagra og kvifor — på innsamlingstidspunktet, ikkje på førespurnad.
 *
 * Firmaopplysningane kjem frå pipe_settings, som allereie er lesbar for anon,
 * så sida fungerer utan innlogging slik ho skal.
 */
export default function Personvern() {
  const { data: settings } = useSettings();

  const firma = settings?.company_name?.trim() || "Hauge Maskin AS";
  const orgnr = settings?.org_number?.trim();
  const epost = settings?.email?.trim();
  const telefon = settings?.phone?.trim();
  const adresse = settings?.address?.trim();

  return (
    <div className="min-h-screen bg-background">
      <TopBar title="Personvern" back="/" />

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <h1 className="text-2xl font-semibold">Personvernerklæring</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          For selvbetjent uttak av rør hos {firma}.
        </p>

        <div className="mt-8 space-y-6 text-sm leading-relaxed">
          <Avsnitt tittel="Hvem er behandlingsansvarlig">
            <p>
              {firma}
              {orgnr ? ` (org.nr. ${orgnr})` : ""} er ansvarlig for
              personopplysningene som samles inn gjennom denne tjenesten.
              {adresse ? ` Adresse: ${adresse}.` : ""}
            </p>
            {(epost || telefon) && (
              <p className="mt-2">
                Har du spørsmål om personvern, ta kontakt
                {epost ? (
                  <>
                    {" "}på{" "}
                    <a className="font-medium underline underline-offset-2" href={`mailto:${epost}`}>
                      {epost}
                    </a>
                  </>
                ) : null}
                {telefon ? `${epost ? " eller" : " på"} ${telefon}` : ""}.
              </p>
            )}
          </Avsnitt>

          <Avsnitt tittel="Hva vi behandler">
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Navn på deg eller firmaet som henter</li>
              <li>Mobilnummer, så vi kan ta kontakt om uttaket</li>
              <li>Adresse og e-post når det trengs for faktura</li>
              <li>Hva du tok ut, hvor mye og når</li>
              <li>Signatur, dersom utleier har slått på signering</li>
            </ul>
          </Avsnitt>

          <Avsnitt tittel="Hvorfor">
            <p>
              Opplysningene er nødvendige for å gjennomføre uttaket: for å vite
              hvem som har hentet hva, for å kunne ta kontakt ved feil, og for å
              fakturere. Det rettslige grunnlaget er å oppfylle avtalen med deg,
              jf. personvernforordningen artikkel 6 nr. 1 bokstav b, og
              bokføringsplikten for det som gjelder faktura.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvor lenge">
            <p>
              Uttak som er fakturert lagres så lenge bokføringsloven krever, i
              dag fem år etter regnskapsåret. Uttak som ikke blir fakturert
              slettes når de ikke lenger har noe formål.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvem ser opplysningene">
            <p>
              Bare ansatte hos {firma} som har med lager og fakturering å gjøre.
              Data ligger hos Supabase, som er databehandler for oss. Vi selger
              ikke opplysninger videre, og bruker dem ikke til markedsføring.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Informasjonskapsler">
            <p>
              Siden bruker bare lagring som er nødvendig for at handlekurven og
              innloggingen skal virke. Vi har ingen analyse- eller
              markedsføringssporing, og derfor heller ikke noe samtykkebanner.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Rettighetene dine">
            <p>
              Du har rett til innsyn i hva vi har lagret om deg, til å få rettet
              feil, og til å be om sletting av det vi ikke er pålagt å ta vare
              på. Ta kontakt på adressen over. Du kan også klage til
              Datatilsynet dersom du mener vi behandler opplysningene feil.
            </p>
          </Avsnitt>
        </div>
      </main>
    </div>
  );
}

function Avsnitt({ tittel, children }: { tittel: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-base font-semibold">{tittel}</h2>
      <div className="mt-1 text-muted-foreground">{children}</div>
    </section>
  );
}
