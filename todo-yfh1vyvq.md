# Session Todo — Downtime Report Studio v1.27

## Features

- [x] Recover the approved Downtime Report Studio Markdown amendment brief and keep it in the project reference documentation.
- [x] Replace the old upload/review interface with the three-step Choose source, Additional context, and Build Mapping Excel workflow.
- [x] Preserve the required Operations XLSX and optional Park Close PDF upload flow with explicit remove controls.
- [x] Add secure source-save guidance for signed-in users without changing existing saved-report persistence behavior.
- [x] Add the Saved downtime logs tab with calendar markers, multi-date selection, duplicate-date choice, and chronological order badges.
- [x] Add server-side reprocessing of selected saved source logs through `WK_template_v4`.
- [x] Combine multiple mapped dates into one chronological Mapping Excel workbook with one dated worksheet per source day.
- [x] Add the processing state, mapped-row preview, Summary tab, Downtime chart tab, completion checklist, download, and source-open actions.
- [x] Record the release as website version v1.27.

## Bugs and Quality Checks

- [x] Prevent unavailable calendar dates from being selected.
- [x] Recalculate output order chronologically when dates are clicked out of order.
- [x] Keep file-removal controls keyboard accessible.
- [x] Use “Downtime %” consistently in the generated preview.
- [x] Prevent the operator text-edit toolbar from covering the primary desktop action.
- [x] Correct completed-step helper wording.
- [x] Verify desktop and mobile layouts without horizontal page overflow.
- [x] Verify the fresh-upload path with the supplied XLSX and Park Close PDF samples.
- [x] Verify the saved-log path with live 12 and 13 September 2026 sources.
- [x] Verify the combined workbook opens and re-saves successfully in LibreOffice.
- [x] Run TypeScript checks, automated tests, and the production build.

## Finalization

- [x] Inspect final source diff and remove temporary implementation files.
- [x] Run final regression checks after cleanup.
- [x] Save a WebDev checkpoint for review, publishing, and rollback.

## Browser QA Notes

Interactive testing confirmed that random click order is normalized to chronological order, the two-date workflow shows a real loading state before success, and the generated preview exposes all required tabs and actions. The completion helper-copy issue found during that test has been corrected. A development hot reload correctly reset volatile, unsaved page state; this is expected and does not affect generated files or saved source records.
