import {
  AlignmentType,
  BorderStyle,
  Document,
  HeightRule,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "docx";
import { storageGetSignedUrl } from "./storage";

export type SummaryEntryData = {
  id?: number;
  incidentKey: string;
  zone: string;
  rideCode: string;
  attraction: string;
  description: string;
  downtimeStart: string;
  downtimeEnd: string;
  durationMinutes: number;
  shift: string;
  recurringDowntime?: string | null;
  recurringDowntimeDays?: string | null;
  incident?: string | null;
  rootCause?: string | null;
  correctiveAction?: string | null;
  preventiveAction?: string | null;
  partsReplaced?: string | null;
  followUpAction?: string | null;
  anrNo?: string | null;
  supportInfo?: string | null;
  supportPhotoUrl?: string | null;
  supportPhotoName?: string | null;
  status: string;
};

export type SummaryReportPayload = {
  reportDate: string;
  amExecutive: string;
  pmExecutive: string;
  zoneBAmExecutive?: string;
  zoneBPmExecutive?: string;
  entries: SummaryEntryData[];
};

function formatDisplayDate(dateKey: string): string {
  const parts = dateKey.split("-");
  if (parts.length === 3) {
    const day = parseInt(parts[2], 10);
    const month = parseInt(parts[1], 10);
    const year = parts[0];
    return `${day}/${month}/${year}`;
  }
  return dateKey;
}

function normalizeTime(val: string): string {
  return (val || "").replace(/[^0-9]/g, "").padStart(4, "0").slice(0, 4);
}

const BORDER_SINGLE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: "000000",
};

const TABLE_BORDERS = {
  top: BORDER_SINGLE,
  bottom: BORDER_SINGLE,
  left: BORDER_SINGLE,
  right: BORDER_SINGLE,
  insideHorizontal: BORDER_SINGLE,
  insideVertical: BORDER_SINGLE,
};

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function labelPara(text: string, bold = true): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: [
      new TextRun({
        text,
        font: "Calibri",
        size: 19,
        bold,
        color: "000000",
      }),
    ],
  });
}

function valuePara(text?: string | null, bold = false): Paragraph {
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: [
      new TextRun({
        text: (text || "").trim() || "N/A",
        font: "Calibri",
        size: 19,
        bold,
        color: "000000",
      }),
    ],
  });
}

function cell(children: Paragraph[], widthDxa: number, colSpan = 1): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    columnSpan: colSpan > 1 ? colSpan : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}

export async function buildDowntimeSummaryDocx(payload: SummaryReportPayload): Promise<Buffer> {
  const displayDate = formatDisplayDate(payload.reportDate);
  const sectionsChildren: (Paragraph | Table)[] = [];

  for (let i = 0; i < payload.entries.length; i++) {
    const entry = payload.entries[i];
    const isPm = entry.shift === "PM" || parseInt((entry.downtimeStart || "").replace(":", ""), 10) >= 1400;
    const isZoneB = entry.zone === "Zone B" || entry.zone === "Zone 2";
    const activeAm = isZoneB ? (payload.zoneBAmExecutive || payload.amExecutive) : payload.amExecutive;
    const activePm = isZoneB ? (payload.zoneBPmExecutive || payload.pmExecutive) : payload.pmExecutive;
    const execName = isPm
      ? (activePm ? `PM – ${activePm}` : "PM – ")
      : (activeAm ? `AM – ${activeAm}` : "AM – ");

    if (i > 0) {
      sectionsChildren.push(new Paragraph({ children: [new PageBreak()] }));
    }

    const t0 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("Date")], 1700),
            cell([valuePara(displayDate)], 1660),
            cell([labelPara("Ride/Attraction")], 1820),
            cell([valuePara(entry.rideCode || entry.attraction, true)], 4180),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Executive In Charge")], 1700),
            cell([valuePara(execName, true)], 7660, 3),
          ],
        }),
      ],
    });

    const t1 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("Recurring Downtime")], 4600),
            cell([new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [
                new TextRun({ text: entry.recurringDowntime === "Yes" ? "☑ Yes   " : "☐ Yes   ", font: "Calibri", size: 19, bold: entry.recurringDowntime === "Yes" }),
                new TextRun({ text: entry.recurringDowntime === "Yes" ? "☐ No" : "☑ No", font: "Calibri", size: 19, bold: entry.recurringDowntime !== "Yes" }),
              ],
            })], 4760),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Downtime No. of Day (if recurring)")], 4600),
            cell([valuePara(entry.recurringDowntime === "Yes" ? (entry.recurringDowntimeDays || "N/A") : "N/A")], 4760),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Incident")], 4600),
            cell([new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [
                new TextRun({ text: entry.incident === "Yes" ? "☑ Yes   " : "☐ Yes   ", font: "Calibri", size: 19, bold: entry.incident === "Yes" }),
                new TextRun({ text: entry.incident === "Yes" ? "☐ No" : "☑ No", font: "Calibri", size: 19, bold: entry.incident !== "Yes" }),
              ],
            })], 4760),
          ],
        }),
      ],
    });

    const t2 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1574, rule: HeightRule.ATLEAST }, // 78.7pt
          children: [
            cell([labelPara("Downtime Description\n(RV / Train / Seat / Scene / System)")], 2050),
            cell([valuePara(entry.description)], 7310),
          ],
        }),
      ],
    });

    const t3 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara(`Time Down: ${normalizeTime(entry.downtimeStart)}`)], 2400),
            cell([labelPara(`Time Up: ${normalizeTime(entry.downtimeEnd)}`)], 2190),
            cell([labelPara(`Duration of Downtime: ${entry.durationMinutes}min`)], 4770),
          ],
        }),
      ],
    });

    const t4 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1664, rule: HeightRule.ATLEAST }, // 83.2pt
          children: [
            cell([labelPara("Root Cause(s)")], 2070),
            cell([valuePara(entry.rootCause || "N/A")], 7290),
          ],
        }),
      ],
    });

    const t5 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1475, rule: HeightRule.ATLEAST }, // 73.8pt
          children: [
            cell([labelPara("Corrective Action")], 2070),
            cell([valuePara(entry.correctiveAction || "N/A")], 7290),
          ],
        }),
      ],
    });

    const t6 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 755, rule: HeightRule.ATLEAST }, // 37.8pt
          children: [
            cell([labelPara("Preventive Action")], 2050),
            cell([valuePara(entry.preventiveAction || "N/A")], 7310),
          ],
        }),
      ],
    });

    const t7 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 422, rule: HeightRule.ATLEAST }, // 21.1pt
          children: [
            cell([labelPara("Part(s) Replaced (if any)")], 4680),
            cell([valuePara(entry.partsReplaced || "N/A")], 4680),
          ],
        }),
      ],
    });

    const t8 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 683, rule: HeightRule.ATLEAST }, // 34.15pt
          children: [
            cell([labelPara("Follow-Up Action (if any)")], 4680),
            cell([valuePara(entry.followUpAction || "N/A")], 4680),
          ],
        }),
      ],
    });

    const t9 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("ANR No. (if applicable)")], 4680),
            cell([valuePara(entry.anrNo || "N/A")], 4680),
          ],
        }),
      ],
    });

    const photoChildren: Paragraph[] = [];
    if (entry.supportInfo && entry.supportInfo.trim()) {
      photoChildren.push(new Paragraph({
        spacing: { before: 20, after: 40 },
        children: [
          new TextRun({ text: entry.supportInfo.trim(), font: "Calibri", size: 19 }),
        ],
      }));
    }

    if (entry.supportPhotoUrl) {
      try {
        let photoBuffer: Buffer | null = null;
        if (entry.supportPhotoUrl.startsWith("data:image/")) {
          const base64Data = entry.supportPhotoUrl.split(",")[1];
          photoBuffer = Buffer.from(base64Data, "base64");
        } else if (entry.supportPhotoUrl.startsWith("/manus-storage/")) {
          const key = entry.supportPhotoUrl.replace("/manus-storage/", "");
          const signedUrl = await storageGetSignedUrl(key);
          const res = await fetch(signedUrl);
          if (res.ok) photoBuffer = Buffer.from(await res.arrayBuffer());
        }
        if (photoBuffer) {
          photoChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [
              new ImageRun({
                data: photoBuffer,
                transformation: {
                  width: 380,
                  height: 240,
                },
              } as any),
            ],
          }));
        }
      } catch (err) {
        console.warn("Failed to embed photo into docx:", err);
      }
    }

    if (!photoChildren.length) {
      photoChildren.push(new Paragraph({
        spacing: { before: 30, after: 30 },
        children: [new TextRun({ text: "N/A", font: "Calibri", size: 19, color: "666666" })],
      }));
    }

    const t10 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1718, rule: HeightRule.ATLEAST }, // 85.9pt
          children: [
            cell([labelPara("Other Supporting Information:\n(Ex: Photo, Service sheet, Checklist &etc.)")], 2140),
            cell(photoChildren, 7220),
          ],
        }),
      ],
    });

    const isMonitoring = true;
    const isClosedStatus = entry.status === "Closed";
    const isPendingParts = entry.status === "Pending Parts";

    const t11 = new Table({
      width: { size: 9360, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 422, rule: HeightRule.ATLEAST }, // 21.1pt
          children: [
            cell([labelPara("Status:")], 1650),
            cell([
              new Paragraph({
                spacing: { before: 20, after: 20 },
                children: [
                  new TextRun({ text: isClosedStatus ? "☑ Closed   " : "☐ Closed   ", font: "Calibri", size: 19, bold: isClosedStatus }),
                  new TextRun({ text: isMonitoring ? "☑ Monitoring   " : "☐ Monitoring   ", font: "Calibri", size: 19, bold: isMonitoring }),
                  new TextRun({ text: isPendingParts ? "☑ Pending Parts" : "☐ Pending Parts", font: "Calibri", size: 19, bold: isPendingParts }),
                ],
              }),
            ], 7710),
          ],
        }),
      ],
    });

    const spacer = () => new Paragraph({ spacing: { before: 40, after: 40 } });

    sectionsChildren.push(
      t0, spacer(),
      t1, spacer(),
      t2, spacer(),
      t3, spacer(),
      t4, spacer(),
      t5, spacer(),
      t6, spacer(),
      t7, spacer(),
      t8, spacer(),
      t9, spacer(),
      t10, spacer(),
      t11
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            size: {
              width: 11906,
              height: 15418,
            },
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1273,
              right: 1273,
            },
          },
        },
        children: sectionsChildren,
      },
    ],
  });

  return await Packer.toBuffer(doc);
}
