import {
  AlignmentType,
  BorderStyle,
  Document,
  Header,
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
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
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

function labelPara(text: string, bold = false): Paragraph {
  const lines = text.split("\n");
  const runs: TextRun[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) runs.push(new TextRun({ text: "", break: 1 }));
    runs.push(
      new TextRun({
        text: line,
        font: "Cambria",
        size: 20,
        bold,
        color: "000000",
      })
    );
  });
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: runs,
  });
}

function valuePara(text?: string | null, bold = false): Paragraph {
  const trimmed = (text || "").trim() || "N/A";
  const lines = trimmed.split(/\r?\n/);
  const runs: TextRun[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) runs.push(new TextRun({ text: "", break: 1 }));
    runs.push(
      new TextRun({
        text: line,
        font: "Cambria",
        size: 20,
        bold,
        color: "000000",
      })
    );
  });
  return new Paragraph({
    spacing: { before: 20, after: 20 },
    children: runs,
  });
}

/**
 * Requirement:
 * In corrective action, when numbered lists are provided, each numbered item must
 * have its own line break, and the numbering prefix (e.g. "1.", "2.") must be bold
 * while the text following behind is regular weight.
 */
function formattedNumberedActionParas(raw?: string | null): Paragraph[] {
  const text = (raw || "").trim();
  if (!text) return [valuePara("N/A")];

  const rawLines = text
    .split(/\r?\n/)
    .flatMap(line => line.split(/(?=\b\d+\.\s+)/))
    .map(l => l.trim())
    .filter(Boolean);

  if (!rawLines.length) return [valuePara("N/A")];

  const paragraphs: Paragraph[] = [];
  for (const line of rawLines) {
    const match = /^(\d+\.)\s*(.*)$/.exec(line);
    if (match) {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 30, after: 30 },
          children: [
            new TextRun({
              text: `${match[1]} `,
              font: "Cambria",
              size: 20,
              bold: true,
              color: "000000",
            }),
            new TextRun({
              text: match[2] || "",
              font: "Cambria",
              size: 20,
              bold: false,
              color: "000000",
            }),
          ],
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          spacing: { before: 20, after: 20 },
          children: [
            new TextRun({
              text: line,
              font: "Cambria",
              size: 20,
              bold: false,
              color: "000000",
            }),
          ],
        })
      );
    }
  }
  return paragraphs;
}

function cell(children: Paragraph[], widthDxa: number, colSpan = 1): TableCell {
  return new TableCell({
    width: { size: widthDxa, type: WidthType.DXA },
    columnSpan: colSpan > 1 ? colSpan : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    verticalAlign: VerticalAlign.CENTER,
    children,
  });
}

let cachedLogoBuffer: Buffer | null = null;
function getHeaderLogoBuffer(): Buffer | null {
  if (cachedLogoBuffer) return cachedLogoBuffer;
  const paths = [
    path.resolve(process.cwd(), "templates", "downtime-summary-template-v2-logo.jpeg"),
    path.resolve(process.cwd(), "templates", "downtime-summary-template-logo.jpeg"),
    "/home/ubuntu/downtime-report-automation/templates/downtime-summary-template-v2-logo.jpeg",
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      try {
        cachedLogoBuffer = readFileSync(p);
        return cachedLogoBuffer;
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function buildDocumentHeader(): Header {
  const logo = getHeaderLogoBuffer();
  const children: any[] = [];
  if (logo) {
    children.push(
      new ImageRun({
        data: logo,
        transformation: {
          width: 146,
          height: 61,
        },
      } as any)
    );
    children.push(new TextRun({ text: " " }));
  }
  children.push(
    new TextRun({
      text: "DAILY DOWNTIME SUMMARY REPORT FORM",
      font: "Cambria",
      size: 24,
      bold: true,
      color: "000000",
    })
  );

  return new Header({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children,
      }),
    ],
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

    // Table 1: Date & Ride, Executive
    const t0 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("Date")], 1546),
            cell([valuePara(displayDate)], 1476),
            cell([labelPara("Ride/Attraction")], 1678),
            cell([valuePara(entry.rideCode || entry.attraction, true)], 3930),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Executive In Charge")], 1546),
            cell([valuePara(execName, true)], 7084, 3),
          ],
        }),
      ],
    });

    // Table 2: Recurring, Days, Incident
    const t1 = new Table({
      width: { size: 8635, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("Recurring Downtime")], 4234),
            cell([new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [
                new TextRun({ text: entry.recurringDowntime === "Yes" ? "☑ Yes   " : "☐ Yes   ", font: "Cambria", size: 20, bold: entry.recurringDowntime === "Yes" }),
                new TextRun({ text: entry.recurringDowntime === "Yes" ? "☐ No" : "☑ No", font: "Cambria", size: 20, bold: entry.recurringDowntime !== "Yes" }),
              ],
            })], 4401),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Downtime No. of Day (if recurring)")], 4234),
            cell([valuePara(entry.recurringDowntime === "Yes" ? (entry.recurringDowntimeDays || "N/A") : "N/A")], 4401),
          ],
        }),
        new TableRow({
          children: [
            cell([labelPara("Incident")], 4234),
            cell([new Paragraph({
              spacing: { before: 20, after: 20 },
              children: [
                new TextRun({ text: entry.incident === "Yes" ? "☑ Yes   " : "☐ Yes   ", font: "Cambria", size: 20, bold: entry.incident === "Yes" }),
                new TextRun({ text: entry.incident === "Yes" ? "☐ No" : "☑ No", font: "Cambria", size: 20, bold: entry.incident !== "Yes" }),
              ],
            })], 4401),
          ],
        }),
      ],
    });

    // Table 3: Description
    const t2 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1574, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Downtime Description\n(RV / Train / Seat / Scene / System)")], 1885),
            cell([valuePara(entry.description)], 6745),
          ],
        }),
      ],
    });

    // Table 4: Time Down / Up / Duration
    const t3 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara(`Time Down: ${normalizeTime(entry.downtimeStart)}`)], 2214),
            cell([labelPara(`Time Up: ${normalizeTime(entry.downtimeEnd)}`)], 2020),
            cell([labelPara(`Duration of Downtime: ${entry.durationMinutes}min`)], 4396),
          ],
        }),
      ],
    });

    // Table 5: Root Cause
    const t4 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1664, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Root Cause(s)")], 1883),
            cell([valuePara(entry.rootCause || "N/A")], 6747),
          ],
        }),
      ],
    });

    // Table 6: Corrective Action with bold numbers and line breaks
    const t5 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1475, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Corrective Action")], 1885),
            cell(formattedNumberedActionParas(entry.correctiveAction), 6745),
          ],
        }),
      ],
    });

    // Table 7: Preventive Action
    const t6 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 755, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Preventive Action")], 1887),
            cell(formattedNumberedActionParas(entry.preventiveAction), 6743),
          ],
        }),
      ],
    });

    // Table 8: Parts Replaced
    const t7 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 422, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Part(s) Replaced (if any)")], 4316),
            cell([valuePara(entry.partsReplaced || "N/A")], 4314),
          ],
        }),
      ],
    });

    // Table 9: Follow-Up Action
    const t8 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 683, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Follow-Up Action (if any)")], 4315),
            cell([valuePara(entry.followUpAction || "N/A")], 4315),
          ],
        }),
      ],
    });

    // Table 10: ANR No.
    const t9 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          children: [
            cell([labelPara("ANR No. (if applicable)")], 4316),
            cell([valuePara(entry.anrNo || "N/A")], 4314),
          ],
        }),
      ],
    });

    // Supporting Info and Photo
    const photoChildren: Paragraph[] = [];
    if (entry.supportInfo && entry.supportInfo.trim()) {
      photoChildren.push(new Paragraph({
        spacing: { before: 20, after: 40 },
        children: [
          new TextRun({ text: entry.supportInfo.trim(), font: "Cambria", size: 20 }),
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
            spacing: { before: 30, after: 30 },
            children: [
              new ImageRun({
                data: photoBuffer,
                transformation: {
                  width: 380,
                  height: 220,
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
        children: [new TextRun({ text: "N/A", font: "Cambria", size: 20, color: "666666" })],
      }));
    }

    // Table 11: Other Supporting Information
    const t10 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 1718, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Other Supporting Information:\n(Ex: Photo, Service sheet, Checklist &etc.)")], 1975),
            cell(photoChildren, 6655),
          ],
        }),
      ],
    });

    const isMonitoring = true;
    const isClosedStatus = entry.status === "Closed";
    const isPendingParts = entry.status === "Pending Parts";

    // Table 12: Status
    const t11 = new Table({
      width: { size: 8630, type: WidthType.DXA },
      borders: TABLE_BORDERS,
      rows: [
        new TableRow({
          height: { value: 422, rule: HeightRule.ATLEAST },
          children: [
            cell([labelPara("Status:")], 1525),
            cell([
              new Paragraph({
                spacing: { before: 20, after: 20 },
                children: [
                  new TextRun({ text: isClosedStatus ? "☑ Closed   " : "☐ Closed   ", font: "Cambria", size: 20, bold: isClosedStatus }),
                  new TextRun({ text: isMonitoring ? "☑ Monitoring   " : "☐ Monitoring   ", font: "Cambria", size: 20, bold: isMonitoring }),
                  new TextRun({ text: isPendingParts ? "☑ Pending Parts" : "☐ Pending Parts", font: "Cambria", size: 20, bold: isPendingParts }),
                ],
              }),
            ], 7105),
          ],
        }),
      ],
    });

    const spacer = () => new Paragraph({ spacing: { before: 35, after: 35 } });

    // Page 1: Tables t0, t1, t2, t3, t4, t5
    // Template v2 has 1 blank line break after the header before Table 1
    // Page 2: Has 1 blank line break before Preventive Action (Table 6)
    sectionsChildren.push(
      spacer(),
      t0, spacer(),
      t1, spacer(),
      t2, spacer(),
      t3, spacer(),
      t4, spacer(),
      t5
    );

    // Explicit page boundary to ensure 2 pages per incident
    sectionsChildren.push(new Paragraph({ children: [new PageBreak()] }));

    sectionsChildren.push(
      spacer(),
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
              left: 1800,
              right: 1800,
              header: 720,
              footer: 720,
            },
          },
        },
        headers: {
          default: buildDocumentHeader(),
        },
        children: sectionsChildren,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: "Cambria",
            size: 20,
          },
        },
      },
    },
  });

  return await Packer.toBuffer(doc);
}
