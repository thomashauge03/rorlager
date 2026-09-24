import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { kodeFraSkann } from "@/lib/scanner";

type Detektor = { detect: (kjelde: HTMLVideoElement) => Promise<{ rawValue?: string }[]> };

type InnebygdKlasse = {
  new (o: { formats: string[] }): Detektor;
  getSupportedFormats?: () => Promise<string[]>;
};

const FORMATER = ["qr_code", "ean_13", "ean_8", "code_128", "code_39"] as const;

/**
 * Den innebygde lesaren der han finst (Chrome på Android), elles ein som køyrer
 * i nettlesaren. Safari på iPhone har ingen innebygd, og før denne fanst sa
 * framsida berre «bruk kameraappen» – som opnar uttakssida og ikkje bestillinga.
 *
 * WebAssembly-fila blir bygd inn av Vite og servert frå vårt eige domene.
 * Standardoppsettet hentar henne frå jsDelivr, og då ville kvar iPhone som opna
 * kameraet sendt eit kall til ein tredjepart. Ho blir berre lasta når den
 * innebygde manglar, så Android betaler ingenting.
 */
async function lagDetektor(): Promise<Detektor> {
  const Innebygd = (window as unknown as { BarcodeDetector?: InnebygdKlasse }).BarcodeDetector;
  if (Innebygd) {
    try {
      const støtta = (await Innebygd.getSupportedFormats?.()) ?? [...FORMATER];
      const formats = FORMATER.filter((f) => støtta.includes(f));
      return new Innebygd({ formats: formats.length ? formats : ["qr_code"] });
    } catch {
      /* fell gjennom til lesaren i nettlesaren */
    }
  }

  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import("barcode-detector/ponyfill"),
    import("zxing-wasm/reader/zxing_reader.wasm?url"),
  ]);
  prepareZXingModule({
    overrides: {
      locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
    },
  });
  return new BarcodeDetector({ formats: [...FORMATER] }) as unknown as Detektor;
}

type ScannerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Får koden. Returner null når ho blei teken imot – då stoppar kameraet – eller
   * ein tekst som blir vist medan kameraet held fram.
   */
  onCode: (kode: string) => string | null;
  title?: string;
  description?: string;
};

export function Scanner({
  open,
  onOpenChange,
  onCode,
  title = "Skann koden",
  description = "Hold kameraet mot QR-koden på hylla eller strekkoden på varen.",
}: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Treffet skal ikkje starte kameraet på nytt, difor ein ref og ikkje ei avhengigheit
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);
    setStarting(true);

    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    // Same avviste kode i kvart bilete skal ikkje spørje forelderen tretti
    // gonger i sekundet.
    let sisteAvviste = "";

    const stop = () => {
      stopped = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      // Utan stop() på kvar track blir kameralampa ståande på etter at dialogen er lukka
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
      const video = videoRef.current;
      if (video) video.srcObject = null;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStarting(false);
        setError("Nettleseren gir ikke tilgang til kamera her. Bruk søkefeltet, eller kameraappen på telefonen.");
        return;
      }

      let detektor: Detektor;
      try {
        detektor = await lagDetektor();
      } catch {
        setStarting(false);
        setError("Klarte ikke å starte kodelesingen. Bruk søkefeltet i stedet.");
        return;
      }
      if (stopped) return;

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch {
        setStarting(false);
        setError("Fikk ikke tilgang til kameraet. Tillat kamera for denne siden, eller bruk søkefeltet.");
        return;
      }

      if (stopped || !videoRef.current) {
        stop();
        return;
      }

      const video = videoRef.current;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        /* somme nettlesarar spelar av av seg sjølv – lesinga går uansett */
      }
      setStarting(false);

      const tick = async () => {
        if (stopped) return;
        try {
          const funn = await detektor.detect(video);
          const verdi = funn?.[0]?.rawValue;
          if (verdi) {
            const kode = kodeFraSkann(verdi);
            if (!kode) {
              setHint("Denne koden hører ikke til rørlageret. Prøv en annen.");
            } else if (kode !== sisteAvviste) {
              const svar = onCodeRef.current(kode);
              if (svar === null) {
                stop();
                return;
              }
              sisteAvviste = kode;
              setHint(svar);
            }
          }
        } catch {
          /* eitt bilete kan feile utan at skanninga er øydelagd */
        }
        if (!stopped) frame = requestAnimationFrame(tick);
      };

      frame = requestAnimationFrame(tick);
    })();

    return stop;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="text-sm text-muted-foreground">{error}</p>
        ) : (
          <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-black">
            <video
              ref={videoRef}
              muted
              playsInline
              aria-label="Kamerabilde for skanning"
              className="h-full w-full object-cover"
            />
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-48 w-48 rounded-xl border-2 border-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            {starting ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-white" aria-hidden="true" />
                <span className="sr-only">Starter kameraet</span>
              </div>
            ) : null}
          </div>
        )}

        <p aria-live="polite" className="min-h-[1.25rem] text-sm text-warning-ink">
          {hint ?? ""}
        </p>

        <Button variant="outline" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
          <X className="h-5 w-5" aria-hidden="true" />
          Avbryt
        </Button>
      </DialogContent>
    </Dialog>
  );
}
