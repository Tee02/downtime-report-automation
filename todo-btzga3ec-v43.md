# Version 1.43 — Calendar Alignment & Operations Workspace Refinement

**Created:** 2026-10-14 (GMT+8)  
**Completed:** 2026-10-14 23:12 GMT+8

## Scope
- [x] Diagnose DOCX export state loss caused by persistence of selected entries only.
- [x] Diagnose one-day-back date picker behavior in Analysis Studio and integrated Compare workspace.
- [x] Preserve all summary cards and entries while exporting only ticked, ready entries to DOCX.
- [x] Use local calendar dates consistently in Analysis and Compare selections.
- [x] Add a protected double-confirm deletion path for user-created Faultpedia cards.
- [x] Rename supervisor-message entry actions to **Add log** and standardize visible “fleet” wording to “rides”.
- [x] Make mobile KPI and PM Tracker default to calendar view with an explicit agenda switch.
- [x] Limit desktop ride ranking to five immediately visible rows and scroll remaining rides.
- [x] Apply the supplied park-map background behind workspace cards across all dashboard pages.
- [x] Run type checks, focused and complete regression suites, production build, desktop/mobile visual validation, browser date validation, and save a Version 1.43 checkpoint.

## Validation
- `pnpm check` — passed.
- Focused summary, Faultpedia, and readiness regression tests — 10 tests passed.
- Full test suite — 51 active tests passed; 4 intentionally skipped.
- `pnpm build` — passed.
- Browser verification — clicking **8 October** selects **8 October** in both Analysis Overview and Compare Scenario A.
- Browser console — no output/errors.
