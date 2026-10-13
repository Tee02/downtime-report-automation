export type SummaryNarrativeFields = {
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
};

export type SummaryCompletion = {
  isReady: boolean;
  missing: Array<"Root cause" | "Corrective action" | "Preventive action">;
  label: string;
  detail: string;
  tone: "ready" | "attention";
};

const REQUIRED_NARRATIVES: Array<{
  key: keyof SummaryNarrativeFields;
  label: "Root cause" | "Corrective action" | "Preventive action";
}> = [
  { key: "rootCause", label: "Root cause" },
  { key: "correctiveAction", label: "Corrective action" },
  { key: "preventiveAction", label: "Preventive action" },
];

function hasMeaningfulValue(value?: string | null) {
  return Boolean(value?.trim());
}

export function getSummaryCompletion(entry: SummaryNarrativeFields): SummaryCompletion {
  const missing = REQUIRED_NARRATIVES
    .filter(field => !hasMeaningfulValue(entry[field.key]))
    .map(field => field.label);

  if (!missing.length) {
    return {
      isReady: true,
      missing,
      label: "Ready to export",
      detail: "Root cause, corrective action, and preventive action are recorded.",
      tone: "ready",
    };
  }

  if (missing.length === 1) {
    return {
      isReady: false,
      missing,
      label: `Needs ${missing[0].toLowerCase()}`,
      detail: `${missing[0]} is still required before export.`,
      tone: "attention",
    };
  }

  return {
    isReady: false,
    missing,
    label: `Needs ${missing.length} narratives`,
    detail: `${missing.join(", ")} are still required before export.`,
    tone: "attention",
  };
}
