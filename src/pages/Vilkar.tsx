// Kjøpsvilkåra for bestilling på nett, med angreskjemaet. Teksten kjem frå
// supabase/functions/_shared/angrerett.ts – same kjelde som kassen, PDF-en og
// e-postane – og firmaopplysningane frå innstillingane.

import { Link } from "react-router-dom";
import { Printer } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { LegalFooter } from "@/components/LegalFooter";
import { Button } from "@/components/ui/button";
import { useOrderSettings, useSettings } from "@/lib/settings";
import { angreskjema, selgerFra, vilkarAvsnitt } from "@/lib/vilkar";

export default function Vilkar() {
  const { data: settings } = useSettings();
  const { data: orderSettings } = useOrderSettings();
  const selger = selgerFra(settings, orderSettings);
  const skjema = angreskjema(selger);

  return (
    <div className="hm-page min-h-screen">
      <div className="print:hidden">
        <TopBar title="Vilkår" back="/bestill" />
      </div>

      <main className="mx-auto w-full max-w-2xl px-5 py-8">
        <div className="print:hidden">
          <h1 className="text-2xl font-semibold text-foreground">Vilkår for bestilling på nett</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Gjelder bestilling av rør til henting hos {selger.navn}.
          </p>

          <div className="mt-8 space-y-6 text-sm leading-relaxed">
            {vilkarAvsnitt(selger).map((a) => (
              <section key={a.tittel}>
                <h2 className="text-base font-semibold text-foreground">{a.tittel}</h2>
                <div className="mt-1 space-y-2 text-muted-foreground">
                  {a.tekst.map((t) => (
                    <p key={t}>{t}</p>
                  ))}
                  {a.tittel === "Personopplysninger" ? (
                    <p>
                      <Link to="/personvern" className="font-medium text-foreground underline underline-offset-2">
                        Les personvernerklæringen
                      </Link>
                    </p>
                  ) : null}
                  {a.tittel === "Angrerett" ? (
                    <p>
                      <a href="#angreskjema" className="font-medium text-foreground underline underline-offset-2">
                        Til angreskjemaet
                      </a>
                    </p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>

        {/* Skjemaet blir det einaste på utskrifta */}
        <section
          id="angreskjema"
          className="mt-10 rounded-lg border border-border bg-card p-5 print:mt-0 print:border-0 print:p-0"
        >
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-lg font-semibold text-foreground">{skjema.tittel}</h2>
            <Button variant="outline" className="h-11 print:hidden" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" aria-hidden="true" />
              Skriv ut
            </Button>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{skjema.ingress}</p>
          <div className="mt-4 space-y-5 text-sm text-foreground">
            {skjema.felt.map((f, i) => (
              <div key={f}>
                <p>{f}</p>
                {i > 0 ? <div className="mt-6 border-b border-dashed border-foreground/40" aria-hidden="true" /> : null}
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">{skjema.fotnote}</p>
        </section>
      </main>

      <div className="print:hidden">
        <LegalFooter />
      </div>
    </div>
  );
}
