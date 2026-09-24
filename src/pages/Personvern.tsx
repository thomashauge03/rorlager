import { TopBar } from "@/components/TopBar";
import { useSettings } from "@/lib/settings";

/**
 * Personvernerklæring.
 *
 * Uttaksskjemaet og bestillingsskjemaet samlar namn, kontaktopplysningar og
 * adresse frå kundar som ikkje er innlogga. GDPR artikkel 13 krev at dei får
 * vite kven som er ansvarleg, kva som blir lagra og kvifor – på
 * innsamlingstidspunktet, ikkje på førespurnad.
 *
 * Firmaopplysningane kjem frå pipe_public_settings, som er lesbar for anon,
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
          For selvbetjent uttak og bestilling av rør hos {firma}.
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
              <li>Navn på deg eller firmaet som henter eller bestiller</li>
              <li>Mobilnummer, så vi kan ta kontakt om uttaket eller bestillingen</li>
              <li>E-post. Ved bestilling er den påkrevd: kvitteringen og beskjeden om henting går dit</li>
              <li>Fakturaadresse, når en privatperson bestiller</li>
              <li>Organisasjonsnummer, når en bedrift bestiller</li>
              <li>Hva du tok ut eller bestilte, hvor mye, og når du vil hente</li>
              <li>Signatur, dersom utleier har slått på signering</li>
            </ul>

            <p className="mt-3">
              For dem som er satt på et prosjekt og kvitterer for leveranser fra
              leverandør, behandler vi i tillegg navnet på den som tok imot,
              signaturen hans, og <strong>bildene han tar av leveransen</strong>.
              Bildene kan vise personer som er på plassen.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvorfor">
            <p>
              Opplysningene er nødvendige for å gjennomføre uttaket eller
              bestillingen: for å vite hvem som har hentet hva, for å kunne ta
              kontakt ved feil, og for å fakturere. Det rettslige grunnlaget er å
              oppfylle avtalen med deg, jf. personvernforordningen artikkel 6 nr. 1
              bokstav b, og bokføringsplikten for det som gjelder faktura, jf.
              bokstav c.
            </p>
            <p className="mt-3">
              Ved bestilling bruker vi e-postadressen til å sende kvittering,
              beskjed når varene er klare, og beskjed hvis vi ikke kan levere. Vi
              sender ikke nyhetsbrev eller reklame.
            </p>
            <p className="mt-3">
              Bilder fra mottakskontrollen tas for å dokumentere hva som faktisk
              ble levert, slik at avvik kan reklameres til leverandøren. Grunnlaget
              er vår berettigede interesse i å kunne dokumentere en leveranse,
              jf. artikkel 6 nr. 1 bokstav f. Bildene er ikke offentlige: de
              ligger utilgjengelig for andre enn kontoret og dem som er satt på
              det aktuelle prosjektet, og hentes bare fram gjennom lenker som
              utløper.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvor lenge">
            <p>
              Uttak og bestillinger som er fakturert, lagres så lenge
              bokføringsloven krever, i dag fem år etter regnskapsåret. Det som
              ikke blir fakturert, slettes når det ikke lenger har noe formål. En
              logg over hvilke e-poster som er sendt om en bestilling, slettes
              sammen med bestillingen.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Hvem ser opplysningene">
            <p>
              Bare ansatte hos {firma} som har med lager og fakturering å gjøre.
              Data ligger hos Supabase, som er databehandler for oss. E-postene om
              bestillinger sendes gjennom Resend, som også er databehandler.
              Resend er et amerikansk selskap, og overføringen til USA skjer etter
              databehandleravtalen med Resend, som bygger på EUs godkjente
              overføringsgrunnlag. Vi selger ikke opplysninger videre, og bruker
              dem ikke til markedsføring.
            </p>
          </Avsnitt>

          <Avsnitt tittel="Informasjonskapsler">
            <p>
              Siden bruker bare lagring som er nødvendig for at handlekurven,
              bestillingen og innloggingen skal virke. Vi har ingen analyse- eller
              markedsføringssporing, og derfor heller ikke noe samtykkebanner.
              Kodeleseren som lar kameraet lese QR-koder på iPhone, lastes fra
              vårt eget domene.
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
