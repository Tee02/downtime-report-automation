# Project Enhancement TODO

 - [x] 1. Weekday downtime tooltip: update tooltip on "Most downtime by day of week" chart to display date in format of day & month (e.g., 28 Aug or 5 Sept)
 - [x] 2. Analysis Studio Calendar: (Stopped per user instruction: "stop the implement of calendar function, proceed with the next task")
 - [x] 3. Analysis Studio Calendar: (Stopped per user instruction: "stop the implement of calendar function, proceed with the next task")
 - [x] 4. Dark Day support: (Stopped per user instruction: "stop the implement of calendar function, proceed with the next task")
 - [x] 5. Saved Report Library: remove the "Export selected log" button (display purpose only, not download)
 - [x] 6. Ride Ranking: shorten display to show up to 5 rankings, with scroll to view the rest
 - [x] 7. Ride Incident Logs section: create new scrollable section displaying ride incident logs filtered by selected ride(s) (all rides if no ride selected, or specific selected rides)
 - [x] 8. Incident log formatting: format entries like `*22 Aug, Alarm [60].19:..., 8mins (10:53-11:01).` and `*11 Aug, Dark Day.`
 - [x] 9. Incident log red highlighting: words between date and time highlighted in red; evac wording like `evac 3mins` highlighted in red (but NOT the actual time in bracket `(17:17-17:20)`)
 - [x] 10. Weather persistence & recall: save weather info keyed in at Downtime Studio into Excel downtime log and database, recall back into Analysis Studio for ride incident logs; format `Inclement Weather (10-13 Orange)` and `Moderated` in red
 - [x] 11. Run vitest unit tests and ensure full pass
 - [x] 12. Take visual screenshots and verify all features in browser
 - [x] 13. Save checkpoint and deliver result

## Iteration 2: Version History, Configurable Thresholds, Space-Saving Layout

 - [x] 14. Inspect git log to catalog all previous versions, commit hashes, dates, times, and completed tasks
 - [x] 15. Add version number button at the bottom of the sidebar panel in DashboardLayout.tsx
 - [x] 16. Implement scrollable Version History panel in sidebar showing past releases with timestamps and completed jobs
 - [x] 17. Implement configurable severity threshold controls (Monitor, Elevated, High, Critical) in Analysis Studio with live color reaction
 - [x] 18. Refactor Ride Combination into button switch: left = All rides (default), right = dropdown multi-select
 - [x] 19. Place Saved Report Library side-by-side next to Ride Combination to save space
 - [x] 20. Implement "View more" toggle button for Saved Report Library with hidden scrollbar until expanded
 - [x] 21. Run vitest tests and verify build
 - [x] 22. Capture visual screenshots and inspect UI in browser
 - [x] 23. Save checkpoint and deliver result
