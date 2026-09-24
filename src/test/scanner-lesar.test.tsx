// Lesaren som køyrer i nettlesaren (iPhone): WebAssembly-modulen blir førebudd
// éin gong per sidelasting, og fila kjem frå vårt eige domene.

import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const { prepareZXingModule, konstruert } = vi.hoisted(() => ({
  prepareZXingModule: vi.fn(),
  konstruert: vi.fn(),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  prepareZXingModule,
  BarcodeDetector: class {
    constructor(o: unknown) {
      konstruert(o);
    }
    detect() {
      return Promise.resolve([]);
    }
  },
}));

import { Scanner } from "@/components/Scanner";

const vis = (open: boolean) => <Scanner open={open} onOpenChange={() => {}} onCode={() => null} />;

describe("lesaren i nettlesaren", () => {
  it("blir førebudd éin gong, sjølv om kameraet blir opna fleire gonger", async () => {
    // Ingen kameratilgang her: lesaren blir laga før kameraet blir bede om.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("nei")) },
    });

    const { rerender } = render(vis(true));
    await screen.findByText(/Fikk ikke tilgang til kameraet/);
    rerender(vis(false));
    rerender(vis(true));

    await waitFor(() => expect(konstruert).toHaveBeenCalledTimes(2));
    expect(prepareZXingModule).toHaveBeenCalledTimes(1);

    // Fila kjem frå vårt eige domene, ikkje frå jsDelivr.
    const { locateFile } = prepareZXingModule.mock.calls[0][0].overrides;
    expect(locateFile("zxing_reader.wasm", "https://fastly.jsdelivr.net/")).not.toContain("jsdelivr");
    expect(locateFile("noko.js", "/prefiks/")).toBe("/prefiks/noko.js");
  });
});
