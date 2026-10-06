import { describe, expect, it } from "vitest";
import { parseSummaryIncidentsFromText } from "./downtimeRoutes";

describe("parseSummaryIncidentsFromText", () => {
  it("extracts rideCode, time down/up, root cause, corrective, and preventive actions from summary text", () => {
    const sampleText = `
Date 
21/9/2026 
Ride/Attraction 
POTA 
Executive In Charge 
AM – Firdaus, Adam 
Recurring Downtime 
Yes No 
Downtime No. of Day (if recurring) 
3 
Incident 
Yes No 
Downtime Description (RV / Train / Seat / Scene / System) 
Technical inspection on RV06 (BGM ISSUE) 
Time Down: 1026 
Time Up: 1049 
Duration of Downtime: 23min 
Root Cause(s) 
Suspect wiring loose for audio system. 
Corrective Action 
1. Verified the issue, no fault on HMI. 
2. Power cycle RV06. 
Preventive Action 
1. Ensure the connector is tight during weekly PM. 
Part(s) Replaced (if any) 
N/A 
Follow-Up Action (if any)
Inspect RV06 audio connector on the next dark day.
ANR No. (if applicable)
N/A
`;

    const matched = parseSummaryIncidentsFromText(sampleText);
    expect(matched.length).toBeGreaterThan(0);
    const pota = matched[0];
    expect(pota.rideCode).toBe("PTA");
    expect(pota.downtimeStart).toBe("10:26");
    expect(pota.downtimeEnd).toBe("10:49");
    expect(pota.durationMinutes).toBe(23);
    expect(pota.description).toContain("Technical inspection on RV06");
    expect(pota.rootCause).toContain("wiring loose");
    expect(pota.correctiveAction).toContain("Verified the issue");
    expect(pota.preventiveAction).toContain("weekly PM");
    expect(pota.followUpAction).toContain("next dark day");
  });
});
