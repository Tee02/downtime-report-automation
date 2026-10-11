import { FLEET_RIDES } from "@/components/RideCombinationSwitch";

export type PmZone = "Zone A" | "Zone B";

export type PmWorkType =
  | "Opening startup"
  | "Closing inspection"
  | "Morning OT"
  | "Night OT"
  | "Darkday work"
  | "Rehab work"
  | "Weekly PM"
  | "Monthly PM"
  | "Unscheduled repair";

export type PmStatus = "Completed" | "Pending" | "In Progress";

/** Official Genting SkyWorlds Zone A and Zone B assignment per specification */
export const ZONE_A_RIDES: string[] = [
  "BWZ",
  "AFP",
  "ESD",
  "IDD",
  "BCT (EV)",
  "BCT (RC)",
  "BCT (UZ)",
  "BCT (ZC)",
  "NTM",
  "PTA",
  "RTR",
  "TTC",
];

export const ZONE_B_RIDES: string[] = [
  "ACR",
  "BSC",
  "EHF",
  "VTM",
  "ETI",
  "MFZ",
  "RCC",
  "SAG",
  "SRS",
];

export function getRideZone(rideCode: string): PmZone {
  return ZONE_B_RIDES.includes(rideCode) ? "Zone B" : "Zone A";
}

export function getRideFullName(rideCode: string): string {
  const match = FLEET_RIDES.find(([code]: [string, string]) => code === rideCode);
  return match ? match[1] : rideCode;
}

export const PM_WORK_TYPES: PmWorkType[] = [
  "Opening startup",
  "Closing inspection",
  "Morning OT",
  "Night OT",
  "Darkday work",
  "Rehab work",
  "Weekly PM",
  "Monthly PM",
  "Unscheduled repair",
];
