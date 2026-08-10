import { Link, useLocation } from "react-router-dom";
import { Compass, Home } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const location = useLocation();

  return (
    <div className="hm-page min-h-screen">
      <TopBar title="Rørlager" />

      <main className="mx-auto max-w-lg px-3 pt-8 sm:px-4">
        <div className="hm-card animate-fade-in flex flex-col items-center gap-3 p-8 text-center">
          <Compass className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="tabular text-4xl font-bold text-primary">404</p>
          <h2 className="text-xl font-bold text-foreground">Denne siden finnes ikke</h2>
          <p className="text-sm text-muted-foreground">
            Adressen <span className="break-all font-medium text-foreground">{location.pathname}</span> førte ingen
            steder. Skann koden på hylla på nytt, eller gå til rørlista.
          </p>
          <Button asChild className="mt-2 h-14 w-full text-base font-semibold [&_svg]:size-5">
            <Link to="/">
              <Home aria-hidden="true" />
              Til forsiden
            </Link>
          </Button>
        </div>
      </main>
    </div>
  );
}
