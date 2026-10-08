# Version 38 — Faultpedia Persistence, Analysis Intelligence & Report Formatting

Created: 2026-10-09 (GMT+8)

## Scope
- [x] Convert Troubleshoot Wiki into persistent Faultpedia backed by database records and storage-backed image uploads.
- [x] Expand Faultpedia ride browser to all active rides and add date-range/sort/search/category workflows.
- [x] Add Dashboard Faultpedia navigation and retain sidebar gallery navigation.
- [x] Persist compact report KPI snapshots at upload, then expose Analysis heat-map data without re-reading historical XLSX logs.
- [x] Add selectable stacked bar, line, and heat-map visualisations to Analysis Studio.
- [x] Add persistent 10-item Analysis Compare history with reload, delete, and clear-all controls.
- [x] Correct Downtime Summary DOCX date formatting and report header structure.
- [x] Add regression coverage, validate browser UI and document output, update version history, and checkpoint.

## Notes
- Existing Troubleshoot Wiki client-side data will be preserved as initial reference defaults if no persistent records are present.
- New upload snapshots must support fleet and per-ride daily values; existing saved logs retain the existing analysis path until re-uploaded.
- Completed: 2026-10-09 00:54 GMT+8. A temporary browser persistence card was created, verified after a full reload, and removed from the database before release.
