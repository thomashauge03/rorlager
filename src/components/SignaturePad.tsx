import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";
import { Button } from "@/components/ui/button";

type SignaturePadProps = {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
  label?: string;
};

/** Signaturen hamnar i PDF-en, og der er arket kvitt. Difor alltid mørk strek
 *  på kvit botn – ein kvit strek i mørk modus ville blitt usynleg på papiret. */
const INK = "#111111";
const PAPER = "#ffffff";
const HEIGHT = 176;

export function SignaturePad({ value, onChange, label = "Signatur" }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  /** Siste ferdige strek. Held teikninga trygg når canvas må byggjast opp på nytt. */
  const ink = useRef<string | null>(value ?? null);
  const [hasInk, setHasInk] = useState(Boolean(value));

  const context = () => {
    const canvas = canvasRef.current;
    return canvas ? canvas.getContext("2d") : null;
  };

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, w, h);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    if (ink.current) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, w, h);
      img.src = ink.current;
    }
  }, []);

  /** Å setje canvas.width tømmer flata, så teikninga må leggjast attende etterpå */
  const resize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Utan devicePixelRatio blir streken grov og hakkete på telefon
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (!w || !h || (canvas.width === w && canvas.height === h)) return;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint();
  }, [paint]);

  useEffect(() => {
    resize();
    const ro = new ResizeObserver(() => resize());
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [resize]);

  // Nullstilling utanfrå (til dømes etter innsendt uttak) skal tømme flata òg
  useEffect(() => {
    if ((value ?? null) === ink.current) return;
    ink.current = value ?? null;
    setHasInk(Boolean(value));
    paint();
  }, [value, paint]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = context();
    if (!ctx) return;
    e.preventDefault();
    // Fangar peikaren så streken held fram sjølv om fingeren glir utanfor ruta
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    // Eit reint trykk utan rørsle skal setje eit punkt, ikkje ingenting
    ctx.lineTo(x + 0.01, y);
    ctx.stroke();
  };

  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = context();
    if (!ctx) return;
    e.preventDefault();
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const onUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* peikaren kan alt vere sloppen */
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    ink.current = canvas.toDataURL("image/png");
    setHasInk(true);
    onChange(ink.current);
  };

  const clear = () => {
    ink.current = null;
    setHasInk(false);
    paint();
    onChange(null);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{label}</span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clear}
          disabled={!hasInk}
          className="h-9 text-muted-foreground"
        >
          <Eraser className="h-4 w-4" aria-hidden="true" />
          Tøm
        </Button>
      </div>

      <div className="relative rounded-lg border border-input overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={label}
          style={{ height: HEIGHT, touchAction: "none" }}
          className="block w-full cursor-crosshair"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {!hasInk && (
          <span className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-sm text-neutral-400">
            Skriv signaturen her
          </span>
        )}
      </div>
    </div>
  );
}
