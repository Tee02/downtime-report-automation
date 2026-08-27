# Project TODO

- [x] Inspect the Operations downtime workbook layout, data rows, codes, and color meanings.
- [x] Inspect the Technical Department weekly template layout, timing grid, and existing formatting.
- [x] Specify and verify the 11-1 selection, equipment matching, duration calculation, and color mapping rules.
- [x] Implement XLSX upload storage and server-side parsing for Operations and Technical template workbooks.
- [x] Generate a department-ready XLSX workbook that preserves the Technical template layout and applies required highlights.
- [x] Build the pre-export review table with matched and unmatched downtime records.
- [x] Build a downtime-minutes-by-ride/equipment bar chart with the matching color legend.
- [x] Add automated tests for the transformation logic and output safeguards.
- [x] Create a final release checkpoint after the verified desktop/mobile UI review and end-to-end workbook flow.
- [x] Add end-to-end regression coverage for supplied workbooks, template preservation, and representative timeline highlight styles.
- [x] Diagnose and repair the corrupt XLSX export so the output opens reliably in spreadsheet applications.
- [x] Use the supplied WKtemplate.xlsx as the fixed Technical Department template so users upload only the Operations downtime log.
- [x] Calculate per-ride daily downtime percentage as downtime minutes divided by 480 minutes and display it in review and generated workbooks.
- [x] Add the column E total-percentage formula using total downtime minutes divided by 8,640 minutes across 18 rides.
- [x] Detect Operations workbook closed-ride entries and represent closures with the required template color conventions.
- [x] Revise the interface for one-file input, downtime percentages, and closed-ride status review.
- [x] Add regression tests confirming the workbook opens and contains the revised formulas, percentages, and closure markings.
