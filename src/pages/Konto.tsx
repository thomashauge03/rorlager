// Min konto: der ein tilsett byter passordet sitt sjølv.
//
// «Bytt passord» låg berre på /admin/brukere, som er stengd for alle utanom
// superadmin. Ein lagermann eller ein på byggjeplassen hadde då ingen veg til å
// byte det, anna enn å be superadmin om eit nytt mellombels.

import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut } from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Button } from "@/components/ui/button";
import { loggUt, useAuth } from "@/lib/auth";

export default function Konto() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const auth = useAuth(() => navigate("/login", { replace: true }));

  const logout = async () => {
    await loggUt(queryClient);
    navigate("/login", { replace: true });
  };

  if (auth.checking || !auth.email) {
    return (
      <div className="hm-page min-h-dvh flex items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Sjekker innlogging</span>
      </div>
    );
  }

  return (
    <div className="hm-page min-h-dvh flex flex-col">
      {/* Tilbake til der han kom frå: adminpanelet eller prosjekta */}
      <TopBar title="Min konto" subtitle={auth.email} back />

      <main className="mx-auto w-full max-w-xl flex-1 space-y-4 px-3 pb-10 pt-4 sm:px-4">
        <section className="hm-card p-4 sm:p-5" aria-labelledby="bytt-passord">
          <h2 id="bytt-passord" className="text-lg font-semibold text-foreground">
            Bytt passord
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground">
            Skriv det du bruker i dag, og det nye to ganger.
          </p>
          <ChangePasswordForm email={auth.email} />
        </section>

        <Button variant="outline" className="h-12 w-full" onClick={logout}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          Logg ut
        </Button>
      </main>
    </div>
  );
}
