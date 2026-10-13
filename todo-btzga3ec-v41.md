# Version 1.41 — Operations-First UI Polish

## Goal
Implement the selected Top 3 Operational Priorities from the dual-agent UI review:
1. Replace the decorative lavender/glass treatment with a calm, semantic operations palette.
2. Add field-ready mobile agenda modes for Analysis Studio KPI Calendar and PM Tracker.
3. Add Downtime Summary narrative-completion states and ready-only export guidance.

## Plan
- [x] Replace global workspace `!important` utility remaps with explicit operations design tokens; retain clear semantic success/warning/danger colors.
- [x] Rework shared dashboard workspace chrome toward a neutral slate operational canvas.
- [x] Add a mobile KPI agenda/list to Analysis Studio while retaining its detailed desktop heat map.
- [x] Add a mobile PM Tracker agenda/list and compact month navigation with 44px controls while retaining the desktop calendar grid.
- [x] Create reusable summary narrative-completion logic with exact missing-field labels.
- [x] Add per-incident readiness badges, selected-ready count, and a “Next incomplete” action in Downtime Summary.
- [x] Restrict DOCX output to export-ready selected incidents with clear guidance for incomplete entries.
- [x] Add focused regression tests for narrative completeness and export readiness.
- [x] Verify desktop/mobile render, type checks, full test suite, production build, and record Version 1.41 history/checkpoint.
