import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hovudkamera, kodeFraSkann, kodeFraSkannMedOppslag, zoomTrinn, type Kameraevne, type Skannsvar } from "@/lib/scanner";

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
 *
 * Den innebygde blir berre brukt når han seier at han kan lese QR. På ein del
 * Android-telefonar finst klassen, men strekkodemodulen frå Google er ikkje
 * lasta ned: getSupportedFormats gir ei tom liste, og detect svarar «ingenting»
 * på kvart bilete utan ein einaste feil. Før blei han brukt likevel, og då stod
 * kameraet og såg på QR-koden utan at noko skjedde.
 */
async function lagDetektor(): Promise<{ detektor: Detektor; innebygd: boolean }> {
  const Innebygd = (window as unknown as { BarcodeDetector?: InnebygdKlasse }).BarcodeDetector;
  if (Innebygd) {
    try {
      const støtta = (await Innebygd.getSupportedFormats?.()) ?? [];
      if (støtta.includes("qr_code")) {
        const formats = FORMATER.filter((f) => støtta.includes(f));
        return { detektor: new Innebygd({ formats }), innebygd: true };
      }
    } catch {
      /* fell gjennom til lesaren i nettlesaren */
    }
  }

  return { detektor: await lesarINettlesaren(), innebygd: false };
}

async function lesarINettlesaren(): Promise<Detektor> {
  const BarcodeDetector = await lesarIKlienten();
  return new BarcodeDetector({ formats: [...FORMATER] }) as unknown as Detektor;
}

/** Kor lenge den innebygde får prøve åleine før lesaren i nettlesaren hjelper til */
const RESERVE_ETTER_MS = 2000;

const VIDEO_ØNSKE = { width: { ideal: 1920 }, height: { ideal: 1080 } } as const;


type Ponyfill = typeof import("barcode-detector/ponyfill");

/*
 * Éin gong per sidelasting. prepareZXingModule samanliknar overrides med dei
 * førre, og eit nytt locateFile kvar gong kameraet blei opna, kasta den ferdige
 * WebAssembly-modulen, som då måtte byggjast på nytt. No er det same objektet
 * heile tida. Kvar opning lagar framleis sin eigen detektor.
 */
let lesar: Promise<Ponyfill["BarcodeDetector"]> | null = null;

function lesarIKlienten(): Promise<Ponyfill["BarcodeDetector"]> {
  lesar ??= (async () => {
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
      },
    });
    return BarcodeDetector;
  })().catch((e: unknown) => {
    // Feila lastinga (dårleg nett), skal neste opning prøve på nytt.
    lesar = null;
    throw e;
  });
  return lesar;
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
  const [skrive, setSkrive] = useState("");
  // Kva skannaren held på med, synleg under biletet. Når kameraappen les ein
  // kode som appen ikkje les, er dette det einaste som seier kvar det stoppar.
  const [status, setStatus] = useState<{ lesar: string; storleik: string; kamera: string; bilete: number; oppslag: boolean } | null>(null);
  // Sporet kameraet gir, så zoomknappane og trykk-for-fokus når det
  const sporRef = useRef<MediaStreamTrack | null>(null);
  const [zoomar, setZoomar] = useState<number[]>([]);
  const [zoom, setZoom] = useState<number | null>(null);
  const [kanFokusere, setKanFokusere] = useState(false);

  // Treffet skal ikkje starte kameraet på nytt, difor ein ref og ikkje ei avhengigheit
  const onCodeRef = useRef(onCode);
  useEffect(() => {
    onCodeRef.current = onCode;
  }, [onCode]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setHint(null);
    setSkrive("");
    setStatus(null);
    setZoomar([]);
    setZoom(null);
    setKanFokusere(false);
    sporRef.current = null;
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
      let innebygd: boolean;
      try {
        ({ detektor, innebygd } = await lagDetektor());
      } catch {
        setStarting(false);
        setError("Klarte ikke å starte kodelesingen. Bruk søkefeltet i stedet.");
        return;
      }
      if (stopped) return;

      try {
        // Utan ønskt oppløysing gir mange Android-telefonar 640 × 480. Då blir
        // rutene i ein QR-kode på 22 mm frå dei små lageretikettane berre eit par
        // pikslar, og ingenting blir lese. «ideal» er eit ønske: ein telefon som
        // ikkje har full HD, gir det beste han har.
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, ...VIDEO_ØNSKE },
          audio: false,
        });
        // Kameranamna er tomme før løyvet er gitt, så hovudkameraet kan først
        // veljast no. Er det eit anna enn det vi fekk, blir straumen bytt.
        const einingar = (await navigator.mediaDevices.enumerateDevices?.().catch(() => [])) ?? [];
        const hovud = hovudkamera(einingar);
        if (hovud && hovud !== stream.getVideoTracks()[0]?.getSettings?.().deviceId && !stopped) {
          try {
            const ny = await navigator.mediaDevices.getUserMedia({
              video: { deviceId: { exact: hovud }, ...VIDEO_ØNSKE },
              audio: false,
            });
            stream.getTracks().forEach((t) => t.stop());
            stream = ny;
          } catch {
            /* held fram med kameraet vi fekk */
          }
        }

        const spor = stream.getVideoTracks()[0];
        sporRef.current = spor ?? null;
        const kan = (spor?.getCapabilities?.() ?? {}) as Kameraevne;
        // Kontinuerleg autofokus der kameraet kan det, så ein etikett på kort hald
        // blir skarp. Ikkje alle nettlesarar kjenner valet – då går det utan.
        if (kan.focusMode?.includes("continuous")) {
          void spor
            .applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] })
            .catch(() => {});
        }
        setKanFokusere(!!kan.focusMode?.includes("single-shot"));
        // Zoom: ein liten etikett kan haldast 20–30 cm unna, der fokus verkar,
        // og likevel fylle biletet. 2× frå start der kameraet kan zoome.
        const trinn = zoomTrinn(kan.zoom);
        setZoomar(trinn);
        if (trinn.includes(2)) {
          void spor
            .applyConstraints({ advanced: [{ zoom: 2 } as MediaTrackConstraintSet] })
            .then(() => setZoom(2))
            .catch(() => {});
        } else if (trinn.length) {
          setZoom(trinn[0]);
        }
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

      // Same etikett ligg i biletet i fleire sekund. Utan minnet ville ein QR
      // Admin-kode blitt slått opp på nytt for kvart einaste bilete.
      const oppslag = new Map<string, Promise<Skannsvar>>();
      const tolk = (verdi: string) => {
        let svar = oppslag.get(verdi);
        if (!svar) {
          svar = kodeFraSkannMedOppslag(verdi);
          oppslag.set(verdi, svar);
          // Eit mislukka oppslag skal kunne prøvast att når dekninga kjem tilbake
          void svar.then((s) => s.grunn && setTimeout(() => oppslag.delete(verdi), 2000));
        }
        return svar;
      };

      /*
       * Reserve for den innebygde. Han kan seie at han kan lese QR og likevel
       * aldri finne noko. Har han ikkje funne ein einaste kode på to sekund,
       * blir lesaren i nettlesaren lasta, og dei to prøver annankvart bilete.
       * Ein telefon der den innebygde virkar, finn koden før reserven trengst.
       */
      const start = performance.now();
      let reserve: Detektor | null = null;
      let lastarReserve = false;
      let teljar = 0;
      let sistVist = 0;
      const lesarNamn = () => (innebygd ? (reserve ? "innebygd + nettleser" : "innebygd") : "nettleser");
      const vis = (oppslag = false) =>
        setStatus({
          lesar: lesarNamn(),
          storleik: `${video.videoWidth}×${video.videoHeight}`,
          kamera: stream?.getVideoTracks()[0]?.label ?? "",
          bilete: teljar,
          oppslag,
        });

      const tick = async () => {
        if (stopped) return;
        try {
          if (innebygd && !reserve && !lastarReserve && performance.now() - start > RESERVE_ETTER_MS) {
            lastarReserve = true;
            lesarINettlesaren()
              .then((d) => (reserve = d))
              .catch(() => {});
          }
          teljar += 1;
          const lesar = reserve && teljar % 2 === 0 ? reserve : detektor;
          const funn = await lesar.detect(video);
          const verdi = funn?.[0]?.rawValue;
          // Oppdatert to gonger i sekundet, ikkje for kvart bilete
          const no = performance.now();
          if (no - sistVist > 500) {
            sistVist = no;
            vis();
          }
          if (verdi) {
            vis(true);
            const { kode, grunn } = await tolk(verdi);
            vis(false);
            if (stopped) return;
            if (!kode) {
              setHint(grunn ?? "Denne koden hører ikke til rørlageret. Prøv en annen.");
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

  const brukZoom = (z: number) => {
    const spor = sporRef.current;
    if (!spor) return;
    void spor
      .applyConstraints({ advanced: [{ zoom: z } as MediaTrackConstraintSet] })
      .then(() => setZoom(z))
      .catch(() => {});
  };

  // Trykk på biletet: fokuser på nytt éin gong, så tilbake til kontinuerleg
  const fokuser = () => {
    const spor = sporRef.current;
    if (!spor || !kanFokusere) return;
    void spor
      .applyConstraints({ advanced: [{ focusMode: "single-shot" } as MediaTrackConstraintSet] })
      .then(() =>
        setTimeout(() => {
          void spor.applyConstraints({ advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet] }).catch(() => {});
        }, 1500),
      )
      .catch(() => {});
  };

  // Når kameraet ikkje vil: varenummeret står trykt på etiketten
  const finnSkrive = (e: FormEvent) => {
    e.preventDefault();
    const kode = kodeFraSkann(skrive);
    if (!kode) {
      setHint("Skriv varenummeret eller koden som står på etiketten.");
      return;
    }
    const svar = onCodeRef.current(kode);
    if (svar !== null) setHint(svar);
  };

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
              onClick={fokuser}
            />
            {zoomar.length > 1 ? (
              <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1 rounded-full bg-black/55 p-1">
                {zoomar.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => brukZoom(z)}
                    aria-pressed={zoom === z}
                    aria-label={`Zoom ${z}×`}
                    className={`h-10 min-w-10 rounded-full px-3 text-sm font-semibold ${
                      zoom === z ? "bg-white text-black" : "text-white hover:bg-white/15"
                    }`}
                  >
                    {z}×
                  </button>
                ))}
              </div>
            ) : null}
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

        {!error && !starting ? (
          <p className="-mb-2 text-xs text-muted-foreground">
            Små etiketter: hold telefonen 20–30 cm unna{zoomar.length > 1 ? " og zoom inn" : ""}
            {kanFokusere ? ". Trykk på bildet for å fokusere." : "."}
          </p>
        ) : null}

        <p aria-live="polite" className="min-h-[1.25rem] text-sm text-warning-ink">
          {hint ?? ""}
        </p>

        {status && !error ? (
          <p className="-mt-2 text-xs text-muted-foreground tabular break-all">
            {status.oppslag
              ? "Fant en kode – slår den opp …"
              : `Leser med ${status.lesar} · ${status.storleik} · ${status.bilete} bilder${status.kamera ? ` · ${status.kamera}` : ""}`}
          </p>
        ) : null}

        <form onSubmit={finnSkrive} className="flex gap-2">
          <Input
            aria-label="Varenummer eller kode"
            placeholder="Eller skriv varenummer"
            inputMode="text"
            autoComplete="off"
            className="h-12 text-base"
            value={skrive}
            onChange={(e) => setSkrive(e.target.value)}
          />
          <Button type="submit" variant="secondary" className="h-12 shrink-0 px-5 text-base">
            Finn
          </Button>
        </form>

        <Button variant="outline" className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>
          <X className="h-5 w-5" aria-hidden="true" />
          Avbryt
        </Button>
      </DialogContent>
    </Dialog>
  );
}
