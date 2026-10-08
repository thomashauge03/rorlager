import { describe, expect, it } from "vitest";
import { byggQrAdminRader } from "@/lib/qr-admin-eksport";

const BASE = "https://rorlager.vercel.app";
const ror = (o: Partial<Parameters<typeof byggQrAdminRader>[0][number]> = {}) => ({
  name: "PVC-rør",
  dimension: "110 mm",
  sku: "3100501",
  qr_slug: "pvc-110",
  location: "A3",
  category_name: "Avløp",
  ...o,
});

describe("byggQrAdminRader", () => {
  it("lagar ei rad per rør, med lenkja til rørsida", () => {
    const { rader, utanKode } = byggQrAdminRader([ror()], BASE);
    expect(utanKode).toBe(0);
    expect(rader).toEqual([
      {
        name: "PVC-rør 110 mm",
        shelf_number: "A3",
        description: "Avløp",
        color: "#D3121C",
        qr_type: "url",
        qr_data: { type: "url", url: "https://rorlager.vercel.app/r/pvc-110" },
        info_lines: [
          { label: "Dimensjon", value: "110 mm" },
          { label: "Varenr.", value: "3100501" },
          { label: "Hylle", value: "A3" },
        ],
        folder_id: null,
      },
    ]);
  });

  it("hoppar over rør utan QR-kode og tel dei", () => {
    const { rader, utanKode } = byggQrAdminRader([ror(), ror({ qr_slug: "" })], BASE);
    expect(rader).toHaveLength(1);
    expect(utanKode).toBe(1);
  });

  it("fyller hyllenummeret når hylla manglar, og tek med det som finst", () => {
    const [rad] = byggQrAdminRader([ror({ location: null, dimension: null, category_name: null })], BASE).rader;
    expect(rad.name).toBe("PVC-rør");
    expect(rad.shelf_number).toBe("3100501");
    expect(rad.description).toBeNull();
    expect(rad.info_lines).toEqual([{ label: "Varenr.", value: "3100501" }]);
    // Utan varenummer òg: koden er det einaste som står att
    expect(byggQrAdminRader([ror({ location: null, sku: null })], BASE).rader[0].shelf_number).toBe("pvc-110");
  });

  it("tåler skråstrek bak adressa", () => {
    expect(byggQrAdminRader([ror()], `${BASE}/`).rader[0].qr_data.url).toBe(`${BASE}/r/pvc-110`);
  });
});
