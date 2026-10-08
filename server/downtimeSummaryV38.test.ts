import { describe, expect, it } from "vitest";
import { buildDowntimeSummaryDocx, type SummaryReportPayload } from "./downtimeSummaryDocx";
import JSZip from "jszip";

describe("Version 38 enhancements", () => {
  it("formats both slash and hyphen dates cleanly as D/M/YYYY without corrupting formatting", async () => {
    const payloadHyphen: SummaryReportPayload = {
      reportDate: "2026-10-09",
      amExecutive: "Alex",
      pmExecutive: "Brian",
      entries: [
        {
          incidentKey: "test-hyphen",
          zone: "Zone A",
          rideCode: "ETI",
          attraction: "Expedition Thin Ice",
          description: "Lap bar test",
          downtimeStart: "10:00",
          downtimeEnd: "10:30",
          durationMinutes: 30,
          shift: "AM",
          status: "Monitoring",
        },
      ],
    };

    const bufHyphen = await buildDowntimeSummaryDocx(payloadHyphen);
    const zipHyphen = await JSZip.loadAsync(bufHyphen);
    const docXmlHyphen = await zipHyphen.file("word/document.xml")!.async("string");
    expect(docXmlHyphen).toContain("9/10/2026");

    const payloadSlash: SummaryReportPayload = {
      reportDate: "2026/10/09",
      amExecutive: "Alex",
      pmExecutive: "Brian",
      entries: [
        {
          incidentKey: "test-slash",
          zone: "Zone A",
          rideCode: "ETI",
          attraction: "Expedition Thin Ice",
          description: "Lap bar test",
          downtimeStart: "10:00",
          downtimeEnd: "10:30",
          durationMinutes: 30,
          shift: "AM",
          status: "Monitoring",
        },
      ],
    };

    const bufSlash = await buildDowntimeSummaryDocx(payloadSlash);
    const zipSlash = await JSZip.loadAsync(bufSlash);
    const docXmlSlash = await zipSlash.file("word/document.xml")!.async("string");
    expect(docXmlSlash).toContain("9/10/2026");
  });

  it("ensures the document header contains the standardized title run and Cambria font", async () => {
    const payload: SummaryReportPayload = {
      reportDate: "2026-10-09",
      amExecutive: "Alex",
      pmExecutive: "Brian",
      entries: [
        {
          incidentKey: "test-header",
          zone: "Zone A",
          rideCode: "BWZ",
          attraction: "Big Weld's Zeppelin",
          description: "Gate issue",
          downtimeStart: "14:15",
          downtimeEnd: "14:45",
          durationMinutes: 30,
          shift: "PM",
          status: "Monitoring",
        },
      ],
    };

    const buf = await buildDowntimeSummaryDocx(payload);
    const zip = await JSZip.loadAsync(buf);
    const headerXml = await zip.file("word/header1.xml")!.async("string");
    expect(headerXml).toContain("DAILY DOWNTIME SUMMARY REPORT FORM");
    expect(headerXml).toContain("Cambria");
  });
});
