import { AlertTriangle } from "lucide-react";
import { isSupabaseConfigured } from "@/integrations/supabase/client";

/**
 * Ligg over heile appen så lenge .env manglar eit Supabase-prosjekt.
 *
 * Utan dette blir første møtet med appen ein tom skjerm og ein feil i konsollen
 * som ingen utanfor utviklarstolen ser. Her står det i staden kva som manglar og
 * kva ein gjer med det.
 */
export function SetupBanner() {
  if (isSupabaseConfigured) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-2xl rounded-lg border border-warning/40 bg-warning/10 p-4 shadow-lg backdrop-blur">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning-ink dark:text-warning" />
          <div className="space-y-2 text-sm">
            <p className="font-semibold text-warning-ink dark:text-warning">Databasen er ikke koblet til ennå</p>
            <ol className="list-decimal space-y-1 pl-4 text-foreground/80">
              <li>
                Opprett et prosjekt på <span className="font-medium">supabase.com</span>
              </li>
              <li>
                Kopier <span className="font-medium">Project URL</span> og{" "}
                <span className="font-medium">anon public</span>-nøkkelen inn i <code className="rounded bg-muted px-1">.env</code>
              </li>
              <li>
                Kjør <code className="rounded bg-muted px-1">supabase-setup.sql</code> i SQL Editor
              </li>
              <li>Start appen på nytt</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
