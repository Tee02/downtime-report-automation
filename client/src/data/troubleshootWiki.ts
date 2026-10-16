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

export const INITIAL_TROUBLE_FAULTS: TroubleFault[] = [];

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
