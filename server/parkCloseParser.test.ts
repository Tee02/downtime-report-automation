import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { parseParkCloseTimesFromPdf } from "./parkCloseParser";

describe("parkCloseParser", () => {
  it("extracts 10-7 close times from 10.09.2026 Operations log PDF", async () => {
    const samplePath = "/home/ubuntu/upload/10.09.2026GentingSkyWorldsParkOperationsLogV1.1.pdf";
    if (!fs.existsSync(samplePath)) {
      return; // Skip if test file not in sandbox
    }
    const buf = fs.readFileSync(samplePath);
    const result = await parseParkCloseTimesFromPdf(buf);

    expect(result["ACR"]).toBe("18:05");
    expect(result["IDD"]).toBe("18:09");
    expect(result["EHF"]).toBe("18:00");
    expect(result["VTM"]).toBe("18:00");
    expect(result["PTA"]).toBe("18:00");
    expect(result["BSC"]).toBe("18:00");
    expect(result["NTM"]).toBe("CLOSED");
    expect(result["SRS"]).toBe("CLOSED");
    expect(result["BCT (ZC)"]).toBe("CLOSED");
  });
});
