import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QuantityInput } from "@/components/QuantityInput";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Toast, ToastClose, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

// Ein skjermlesar les namnet på feltet eller knappen, ikkje det som står rundt.
// Eit mengdefelt som berre heiter «0», eller ein lukkeknapp som heiter «Close»
// – eller ingenting – midt i ei norsk side, seier ingenting til den som ikkje
// ser skjermen.

describe("mengdefeltet", () => {
  it("heiter «Antall» og eininga", () => {
    render(<QuantityInput value={null} onChange={() => {}} unit="m" />);
    expect(screen.getByRole("textbox", { name: "Antall m" })).toBeInTheDocument();
  });

  it("følgjer eininga", () => {
    render(<QuantityInput value={2} onChange={() => {}} unit="stk" />);
    expect(screen.getByRole("textbox", { name: "Antall stk" })).toBeInTheDocument();
  });

  // Står det ein synleg tekst over feltet, skal namnet innehalde han. Den som
  // styrer med stemma, seier det han ser – ikkje eit namn berre skjermlesaren kjenner.
  it("les den synlege teksten saman med eininga", () => {
    render(
      <>
        <h3 id="sporsmal">Hvor mye tar du ut?</h3>
        <QuantityInput value={null} onChange={() => {}} unit="m" labelledBy="sporsmal" />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Hvor mye tar du ut? Antall m" })).toBeInTheDocument();
  });
});

describe("lukkeknappane", () => {
  it("dialogen har «Lukk»", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Tittel</DialogTitle>
          <DialogDescription>Tekst</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    expect(screen.getByRole("button", { name: "Lukk" })).toBeInTheDocument();
  });

  it("sidepanelet har «Lukk»", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Tittel</SheetTitle>
          <SheetDescription>Tekst</SheetDescription>
        </SheetContent>
      </Sheet>,
    );
    expect(screen.getByRole("button", { name: "Lukk" })).toBeInTheDocument();
  });

  it("varselet har «Lukk»", () => {
    render(
      <ToastProvider>
        <Toast open>
          <ToastTitle>Lagret</ToastTitle>
          <ToastClose />
        </Toast>
        <ToastViewport />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: "Lukk" })).toBeInTheDocument();
  });
});
