import { Link } from "react-router-dom";
import { visOrgnr } from "@/lib/orgnr";
import { useSettings } from "@/lib/settings";

/**
 * Firmanamn og org.nr. nedst, med lenkjer til vilkåra og personvernet. Eit AS
 * skal vise kven det er, og ein kunde som bestiller skal kunne finne vilkåra
 * frå kvar side i flyten.
 */
export function LegalFooter() {
  const { data: s } = useSettings();
  const firma = s?.company_name?.trim() || "Hauge Maskin AS";

  return (
    <footer className="mx-auto mt-10 max-w-5xl px-3 pb-6 text-center text-xs text-muted-foreground sm:px-4">
      <p>
        {firma}
        {s?.org_number ? ` · Org.nr. ${visOrgnr(s.org_number)}` : ""}
      </p>
      <p className="mt-1 space-x-4">
        <Link to="/vilkar" className="underline underline-offset-2 hover:text-foreground">
          Vilkår
        </Link>
        <Link to="/personvern" className="underline underline-offset-2 hover:text-foreground">
          Personvern
        </Link>
      </p>
    </footer>
  );
}
