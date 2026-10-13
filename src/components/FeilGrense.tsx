// Siste skanse når noko kræsjar under teikning.
//
// Utan denne gav eitt unntak i éi side ein heilt kvit skjerm, utan knappar og
// utan forklaring – og i lageret står det nokon med telefonen i handa og veit
// ikkje om uttaket blei sendt. Kurva ligg i localStorage og overlever ei ny
// innlasting, så «Last inn på nytt» mistar ingenting.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, Home, RotateCw } from "lucide-react";

type Tilstand = { feil: Error | null };

export class FeilGrense extends Component<{ children: ReactNode }, Tilstand> {
  state: Tilstand = { feil: null };

  static getDerivedStateFromError(feil: Error): Tilstand {
    return { feil };
  }

  componentDidCatch(feil: Error, info: ErrorInfo) {
    // Til konsollen, ikkje til ei teneste: ingen tredjepart skal få sjå kva
    // kunden heldt på med.
    console.error("Siden krasjet", feil, info.componentStack);
  }

  render() {
    if (!this.state.feil) return this.props.children;

    return (
      <div className="hm-page flex min-h-dvh items-center justify-center px-4" role="alert">
        <div className="hm-card w-full max-w-md space-y-4 p-6 text-center">
          <AlertTriangle className="mx-auto h-9 w-9 text-warning-ink" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground">Noe gikk galt</h1>
          <p className="text-sm text-muted-foreground">
            Siden stoppet uventet. Handlekurven din er lagret – last inn på nytt og prøv igjen.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <RotateCw className="h-5 w-5" aria-hidden="true" />
              Last inn på nytt
            </button>
            <a
              href="/"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-4 text-base text-foreground hover:bg-muted"
            >
              <Home className="h-5 w-5" aria-hidden="true" />
              Til forsiden
            </a>
          </div>
        </div>
      </div>
    );
  }
}
