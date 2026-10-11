import ExcelJS from "exceljs";
import type { PmTrackerLog } from "../drizzle/schema";

const EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export { EXCEL_CONTENT_TYPE };

/**
 * Builds the operational PM Tracker workbook from the persisted digital logbook.
 * A real .xlsx file is stored server-side before the browser receives its download URL.
 */
export async function buildPmTrackerWorkbook(logs: PmTrackerLog[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Genting SkyWorlds 11-1 Downtime Studio";
  workbook.created = new Date();
  workbook.modified = new Date();

  const sheet = workbook.addWorksheet("PM Tracker Log", {
    views: [{ state: "frozen", ySplit: 4 }],
    properties: { defaultRowHeight: 19 },
  });

  sheet.columns = [
    { key: "logDate", width: 14 },
    { key: "zone", width: 12 },
    { key: "rideCode", width: 14 },
    { key: "rideName", width: 30 },
    { key: "workType", width: 21 },
    { key: "status", width: 16 },
    { key: "technician", width: 26 },
    { key: "summary", width: 44 },
    { key: "message", width: 76 },
    { key: "createdAt", width: 21 },
  ];

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = "PM TRACKER · DIGITAL RIDE MAINTENANCE LOGBOOK";
  sheet.getCell("A1").font = { name: "Cambria", size: 15, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF24325E" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 28;

  sheet.mergeCells("A2:J2");
  sheet.getCell("A2").value = "Opening, closing, overtime, dark-day, rehabilitation, and preventive maintenance records";
  sheet.getCell("A2").font = { name: "Cambria", size: 10, italic: true, color: { argb: "FF475569" } };
  sheet.getCell("A2").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getCell("A2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFF4FF" } };
  sheet.getRow(2).height = 22;

  const headers = [
    "Log Date",
    "Zone",
    "Ride Code",
    "Ride / Attraction",
    "Work Type",
    "Status",
    "Technician In Charge",
    "Summarized Details",
    "Full Supervisor Message / Log Details",
    "Recorded At",
  ];
  const headerRow = sheet.getRow(4);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: "Cambria", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF38529B" } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB5C4E5" } },
      left: { style: "thin", color: { argb: "FFB5C4E5" } },
      bottom: { style: "thin", color: { argb: "FFB5C4E5" } },
      right: { style: "thin", color: { argb: "FFB5C4E5" } },
    };
  });
  headerRow.height = 30;

  const sorted = [...logs].sort((a, b) => {
    if (a.logDate !== b.logDate) return b.logDate.localeCompare(a.logDate);
    return b.id - a.id;
  });

  sorted.forEach((log, index) => {
    const row = sheet.addRow({
      logDate: log.logDate,
      zone: log.zone,
      rideCode: log.rideCode,
      rideName: log.rideName,
      workType: log.workType,
      status: log.status,
      technician: log.technician || "—",
      summary: log.summary || "—",
      message: log.message,
      createdAt: log.createdAt ? new Date(log.createdAt) : "",
    });

    row.height = Math.max(34, Math.min(100, 18 + Math.ceil((log.message || "").length / 76) * 15));

    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Cambria", size: 10, color: { argb: "FF1F2937" } };
      cell.alignment = {
        vertical: "top",
        horizontal: [1, 2, 3, 5, 6].includes(columnNumber) ? "center" : "left",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD6DEEE" } },
        left: { style: "thin", color: { argb: "FFD6DEEE" } },
        bottom: { style: "thin", color: { argb: "FFD6DEEE" } },
        right: { style: "thin", color: { argb: "FFD6DEEE" } },
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: index % 2 === 0 ? "FFF9FBFF" : "FFFFFFFF" },
      };
    });

    row.getCell(3).font = { name: "Cambria", size: 10, bold: true, color: { argb: "FF24325E" } };
    row.getCell(6).font = {
      name: "Cambria",
      size: 10,
      bold: true,
      color: {
        argb:
          log.status === "Completed"
            ? "FF166534"
            : log.status === "Pending"
            ? "FF92400E"
            : "FF1D4ED8",
      },
    };
    row.getCell(10).numFmt = "yyyy-mm-dd hh:mm";
  });

  sheet.autoFilter = { from: "A4", to: "J4" };

  const raw = await workbook.xlsx.writeBuffer();
  return Buffer.from(raw);
}
