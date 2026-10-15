// Skannaren når den innebygde lesaren på Android ikkje virkar: han blir hoppa
// over når han ikkje kan QR, og får hjelp når han aldri finn noko. Og
// varenummeret kan skrivast inn når kameraet ikkje vil.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const { nettlesarFinn, nettlesarLaga } = vi.hoisted(() => ({
  nettlesarFinn: vi.fn(),
  nettlesarLaga: vi.fn(),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  prepareZXingModule: vi.fn(),
  BarcodeDetector: class {
    constructor() {
      nettlesarLaga();
    }
    detect() {
      return nettlesarFinn();
    }
  },
}));

import { Scanner } from "@/components/Scanner";

const KODE = "https://rorlager.vercel.app/r/pvc-110";

function innebygd({ formats, finn }: { formats: string[]; finn: () => Promise<{ rawValue?: string }[]> }) {
  const laga = vi.fn();
  (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector = class {
    static getSupportedFormats = () => Promise.resolve(formats);
    constructor() {
      laga();
    }
    detect() {
      return finn();
    }
  };
  return laga;
}

beforeEach(() => {
  nettlesarFinn.mockReset().mockResolvedValue([]);
  nettlesarLaga.mockReset();
  const spor = { stop: vi.fn(), getCapabilities: () => ({}), applyConstraints: vi.fn() };
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [spor], getVideoTracks: () => [spor] }),
    },
  });
  // jsdom har ikkje avspeling
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  // Kvar lesing ser ut til å skje eitt sekund etter den førre
  let no = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (no += 1000));
});

afterEach(() => {
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
  vi.restoreAllMocks();
});

describe("lesaren", () => {
  it("hoppar over den innebygde når han ikkje kan lese QR", async () => {
    const laga = innebygd({ formats: [], finn: () => Promise.resolve([]) });
    nettlesarFinn.mockResolvedValue([{ rawValue: KODE }]);
    const onCode = vi.fn().mockReturnValue(null);
    render(<Scanner open onOpenChange={() => {}} onCode={onCode} />);

    await waitFor(() => expect(onCode).toHaveBeenCalledWith("pvc-110"));
    expect(laga).not.toHaveBeenCalled();
  });

  it("får hjelp når den innebygde aldri finn noko", async () => {
    innebygd({ formats: ["qr_code"], finn: () => Promise.resolve([]) });
    nettlesarFinn.mockResolvedValue([{ rawValue: KODE }]);
    const onCode = vi.fn().mockReturnValue(null);
    render(<Scanner open onOpenChange={() => {}} onCode={onCode} />);

    await waitFor(() => expect(onCode).toHaveBeenCalledWith("pvc-110"));
    expect(nettlesarLaga).toHaveBeenCalledTimes(1);
  });

  it("brukar den innebygde åleine når han finn koden med ein gong", async () => {
    // Klokka står: React les ho òg, og skulle ikkje få to sekund til å gå
    vi.spyOn(performance, "now").mockReturnValue(5);
    innebygd({ formats: ["qr_code"], finn: () => Promise.resolve([{ rawValue: KODE }]) });
    const onCode = vi.fn().mockReturnValue(null);
    render(<Scanner open onOpenChange={() => {}} onCode={onCode} />);

    await waitFor(() => expect(onCode).toHaveBeenCalledWith("pvc-110"));
    expect(nettlesarLaga).not.toHaveBeenCalled();
  });
});

describe("skriv varenummeret", () => {
  it("sender det som er skrive, og seier frå når feltet er tomt", async () => {
    innebygd({ formats: ["qr_code"], finn: () => new Promise(() => {}) });
    const onCode = vi.fn().mockReturnValue("Fant ingen vare med koden 123.");
    render(<Scanner open onOpenChange={() => {}} onCode={onCode} />);

    fireEvent.click(screen.getByRole("button", { name: "Finn" }));
    expect(screen.getByText("Skriv varenummeret eller koden som står på etiketten.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Varenummer eller kode"), { target: { value: " 5020362 " } });
    fireEvent.click(screen.getByRole("button", { name: "Finn" }));
    expect(onCode).toHaveBeenCalledWith("5020362");
    expect(await screen.findByText("Fant ingen vare med koden 123.")).toBeInTheDocument();
  });
});

describe("zoom", () => {
  it("startar på 2× og byter når ein trykkjer", async () => {
    const applyConstraints = vi.fn().mockResolvedValue(undefined);
    const spor = {
      stop: vi.fn(),
      getSettings: () => ({ deviceId: "x" }),
      getCapabilities: () => ({ zoom: { min: 1, max: 5 }, focusMode: ["continuous", "single-shot"] }),
      applyConstraints,
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [spor], getVideoTracks: () => [spor] }),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
    });
    innebygd({ formats: ["qr_code"], finn: () => new Promise(() => {}) });
    render(<Scanner open onOpenChange={() => {}} onCode={() => null} />);

    const to = await screen.findByRole("button", { name: "Zoom 2×" });
    await waitFor(() => expect(to).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("button", { name: "Zoom 4×" })).toBeInTheDocument();
    expect(screen.getByText(/Trykk på bildet for å fokusere/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Zoom 3×" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Zoom 3×" })).toHaveAttribute("aria-pressed", "true"));
    expect(applyConstraints).toHaveBeenCalledWith({ advanced: [{ zoom: 3 }] });
  });

  it("byter til hovudkameraet når telefonen gav vidvinkelen", async () => {
    const lag = (id: string) => ({
      stop: vi.fn(),
      getSettings: () => ({ deviceId: id }),
      getCapabilities: () => ({}),
      applyConstraints: vi.fn(),
    });
    const vid = lag("vid");
    const hovud = lag("hovud");
    const getUserMedia = vi
      .fn()
      .mockResolvedValueOnce({ getTracks: () => [vid], getVideoTracks: () => [vid] })
      .mockResolvedValueOnce({ getTracks: () => [hovud], getVideoTracks: () => [hovud] });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
        enumerateDevices: vi.fn().mockResolvedValue([
          { deviceId: "vid", label: "camera2 2, facing back", kind: "videoinput" },
          { deviceId: "hovud", label: "camera2 0, facing back", kind: "videoinput" },
        ]),
      },
    });
    innebygd({ formats: ["qr_code"], finn: () => new Promise(() => {}) });
    render(<Scanner open onOpenChange={() => {}} onCode={() => null} />);

    await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
    expect(getUserMedia.mock.calls[1][0].video.deviceId).toEqual({ exact: "hovud" });
    expect(vid.stop).toHaveBeenCalled();
  });
});

