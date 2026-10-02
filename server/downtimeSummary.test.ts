import { describe, expect, it } from "vitest";
import { buildDowntimeSummaryDocx } from "./downtimeSummaryDocx";
import JSZip from "jszip";

describe("downtimeSummaryDocx", () => {
  it("builds a valid DOCX with prefilled technical fields, 2-page pacing per incident, and Monitoring status", async () => {
    const buffer = await buildDowntimeSummaryDocx({
      reportDate: "2026-09-21",
      amExecutive: "Firdaus, Adam",
      pmExecutive: "Yik Seng",
      entries: [
        {
          incidentKey: "test-inc-1",
          zone: "Zone 1",
          rideCode: "PTA",
          attraction: "Invasion of the Planet of the Apes",
          description: "Technical inspection on RV06 (BGM ISSUE)",
          downtimeStart: "10:26",
          downtimeEnd: "10:49",
          durationMinutes: 23,
          shift: "AM",
          rootCause: "Suspect wiring loose for audio system.",
          correctiveAction: "Verified the issue, no fault on HMI. Power cycle RV06. Reconnected connector.",
          preventiveAction: "To ensure the connector is tight during weekly PM.",
          partsReplaced: "N/A",
          followUpAction: "N/A",
          anrNo: "N/A",
          supportInfo: "Inspected wiring under cover.",
          status: "Monitoring",
        },
        {
          incidentKey: "test-inc-2",
          zone: "Zone 2",
          rideCode: "BWZ",
          attraction: "Big Weld's Zeppelin",
          description: "Technical Inspection On RV3 (Joystick Broken)",
          downtimeStart: "16:44",
          downtimeEnd: "16:48",
          durationMinutes: 4,
          shift: "PM",
          rootCause: "Broken joystick.",
          correctiveAction: "Disabled RV3. Handover to ops.",
          preventiveAction: "Confirm spec with supplier.",
          partsReplaced: "N/A",
          followUpAction: "Replace joystick on next dark day.",
          anrNo: "N/A",
          supportInfo: "Photo attached in log.",
          status: "Monitoring",
        },
      ],
    });

    expect(buffer).toBeDefined();
    expect(buffer.length).toBeGreaterThan(1000);

    const zip = await JSZip.loadAsync(buffer);
    const docXml = await zip.file("word/document.xml")?.async("string");
    expect(docXml).toBeDefined();
    expect(docXml).toContain("AM – Firdaus, Adam");
    expect(docXml).toContain("PM – Yik Seng");
    expect(docXml).toContain("Technical inspection on RV06 (BGM ISSUE)");
    expect(docXml).toContain("Duration of Downtime: 23min");
    expect(docXml).toContain("☑ Monitoring");
    expect(docXml).toContain("w:br w:type=\"page\"");
  });
});
