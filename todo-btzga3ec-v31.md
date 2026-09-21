# Version 31 Task Plan

- [x] Trace root causes for:
  1. Dark-day gray highlight missing in Report Studio saved-log calendar and Analysis Studio date-range popover calendar.
  2. Avg tech interruption subtitle displaying "Min X min day" instead of single incident min/max format: `(Max 76 mins) (Min 6 mins)`.
  3. Downtime calendar card only highlighting selected dates instead of the whole month based on active scope.
  4. Line chart button restricted to ranges under 7 days.
  5. Mapping applied step count showing static 6 steps and progress jumping abruptly.
  6. Direct upload not saving to website because `canSaveUpload` was restricted to logged-in user.
- [ ] Implement backend & data model additions (incidentMin/incidentMax, whole-month calendar data support).
- [ ] Implement Report Studio auto-save for all valid uploads, dynamic mapping progress, and dark-day calendar modifiers.
- [ ] Implement Analysis Studio dark-day calendar sync, month-wide severity calendar, unrestricted line chart, and corrected `(Max X mins) (Min Y mins)` badge.
- [ ] Run full test suite, regression checks, and responsive UI screenshots.
- [ ] Record Version 31 in version history and save checkpoint.
