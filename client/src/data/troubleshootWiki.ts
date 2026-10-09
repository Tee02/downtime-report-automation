import { FLEET_RIDES } from "@/components/RideCombinationSwitch";

export type FaultCategory = "Electrical" | "Mechanical" | "Other";

export type TroubleFault = {
  id: string;
  dbId?: number;
  rideCode: string;
  rideName: string;
  faultDate?: string;
  title: string;
  faultCode: string;
  category: FaultCategory;
  references: number;
  symptom: string;
  rootCause: string;
  correctiveActions: string[];
  preventiveAction: string;
  manualScreenshotName?: string | null;
  manualScreenshotUrl?: string | null;
  supportPhotoName?: string | null;
  supportPhotoUrl?: string | null;
  createdAt?: string | Date;
};

export const WIKI_RIDES: Array<{ code: string; label: string; subtitle: string }> = [
  { code: "ALL", label: "All rides", subtitle: "All attractions" },
  ...FLEET_RIDES.map(([code, name]) => ({
    code,
    label: code,
    subtitle: name,
  })),
];

export const WIKI_CATEGORIES: FaultCategory[] = ["Electrical", "Mechanical", "Other"];

export const INITIAL_TROUBLE_FAULTS: TroubleFault[] = [
  {
    id: "eti-heartbeat",
    rideCode: "ETI",
    rideName: "Expedition Thin Ice",
    title: "Vehicle navigation communication heartbeat stopped updating",
    faultCode: "Alarms.Active.Estop1[12].2",
    category: "Other",
    references: 18,
    symptom: "Vehicle stops responding, the navigation heartbeat timestamp no longer updates, and the ride enters a safe state.",
    rootCause: "Loose vehicle navigation connector after vibration.",
    correctiveActions: [
      "Check network-switch status and link lights.",
      "Verify vehicle-node power and communication cables.",
      "Restart the vehicle controller and confirm heartbeat resumes.",
    ],
    preventiveAction: "Inspect connector seating during weekly PM.",
    manualScreenshotName: "Manual pages 42–44",
    supportPhotoName: "Connector inspection.jpg",
  },
  {
    id: "eti-motion-controller",
    rideCode: "ETI",
    rideName: "Expedition Thin Ice",
    title: "Motion controller fault — Logix",
    faultCode: "VCS15Torcs.Alarm High",
    category: "Mechanical",
    references: 12,
    symptom: "The vehicle cannot complete its commanded movement and the controller records a motion-drive fault.",
    rootCause: "Drive feedback is outside the configured operating range.",
    correctiveActions: [
      "Review the controller diagnostic code.",
      "Inspect motor and encoder connections.",
      "Clear the fault only after the movement path is safe.",
    ],
    preventiveAction: "Confirm encoder and drive connections during scheduled inspection.",
    manualScreenshotName: "Manual pages 61–63",
    supportPhotoName: "Drive diagnostic panel.jpg",
  },
  {
    id: "eti-lap-bar",
    rideCode: "ETI",
    rideName: "Expedition Thin Ice",
    title: "Lap bar 24V fuse control voltage tripped",
    faultCode: "LB24V.Fuse.Trip",
    category: "Electrical",
    references: 9,
    symptom: "A restraint circuit does not initialise and the lap bar status remains unavailable.",
    rootCause: "Temporary overload or intermittent resistance at the lap-bar control circuit.",
    correctiveActions: [
      "Isolate the affected vehicle safely.",
      "Check the 24V fuse and associated connector seating.",
      "Restore power and perform a restraint functional check.",
    ],
    preventiveAction: "Inspect fuse-holder tension and connector condition during weekly PM.",
    manualScreenshotName: "Manual pages 18–20",
    supportPhotoName: "Lap bar control circuit.jpg",
  },
  {
    id: "rcc-home-position",
    rideCode: "RCC",
    rideName: "Rio Carnaval Chaos",
    title: "Vehicle not at home position after cycle reset",
    faultCode: "RCC.Home.Position",
    category: "Other",
    references: 7,
    symptom: "The ride cannot begin the next cycle because a vehicle remains outside its expected home position.",
    rootCause: "Position confirmation did not return after a controlled stop.",
    correctiveActions: [
      "Confirm the vehicle location from the HMI.",
      "Inspect position sensor feedback and clearance.",
      "Perform the approved recovery sequence and verify home confirmation.",
    ],
    preventiveAction: "Clean and inspect position sensor targets during PM.",
    manualScreenshotName: "Manual pages 34–36",
    supportPhotoName: "Home position check.jpg",
  },
  {
    id: "ttc-valve-response",
    rideCode: "TTC",
    rideName: "Terraform Tower Challenge",
    title: "Hydraulic valve response delay",
    faultCode: "TTC.Hydraulic.Valve.Delay",
    category: "Mechanical",
    references: 5,
    symptom: "A movement command completes slower than its normal operating window.",
    rootCause: "Valve response is affected by contamination or an incomplete control signal.",
    correctiveActions: [
      "Check hydraulic pressure indication.",
      "Inspect the valve harness and connector seating.",
      "Escalate for hydraulic service if response remains delayed.",
    ],
    preventiveAction: "Review hydraulic condition during the next planned maintenance window.",
    manualScreenshotName: "Manual pages 72–75",
    supportPhotoName: "Valve inspection.jpg",
  },
];

export type WikiSort = "referenced" | "alphabetical" | "recent";

export function filterWikiFaults(
  faults: TroubleFault[],
  rideCode: string,
  category: FaultCategory | "All faults",
  query: string,
  sort: WikiSort,
): TroubleFault[] {
  const normalizedQuery = query.trim().toLowerCase();

  return faults
    .filter((fault) => rideCode === "ALL" || fault.rideCode === rideCode)
    .filter((fault) => category === "All faults" || fault.category === category)
    .filter((fault) => {
      if (!normalizedQuery) return true;
      return [fault.title, fault.faultCode, fault.symptom, fault.rootCause, fault.rideCode, fault.rideName]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    })
    .sort((a, b) => {
      if (sort === "alphabetical") return a.title.localeCompare(b.title);
      if (sort === "recent") return (b.dbId || 0) - (a.dbId || 0);
      return b.references - a.references;
    });
}
