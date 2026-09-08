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

## Iteration 3: Compact Desktop Layout, Ride-Sorted Incident Logs with Dark Days, v17 Version History, and GSMArena-Style 3-Column Comparison Studio

 - [x] 24. Update version records in versionHistory.ts to catalog v15 (7d91a4b), v16 (8c94decf), and v17 (current live release) with timestamps and jobs
 - [x] 25. Reorganize Analysis Studio top layout on desktop: compact Calendar on left, Ride Combination switch on top-right, and Saved Report Library right below it
 - [x] 26. Refactor Ride Incident Logs: group and sort by ride (e.g. PTA:, RCC:, RTR:) with chronological incidents and Dark Day entries under each ride
 - [x] 27. Build GSMArena-style 3-column Comparison Studio page (/comparison) allowing side-by-side selection of dates and rides with structured comparison tables
 - [x] 28. Add Comparison Studio navigation entry in DashboardLayout sidebar and route in App.tsx
 - [x] 29. Run vitest test suite and ensure all tests pass
 - [x] 30. Capture full-page visual screenshots to verify both Analysis Studio and Comparison Studio
 - [x] 31. Save checkpoint and deliver result

## Iteration 4: Passcode 494 Login, Latest-Only Analysis Auto-Select, Calendar Comparison Picker & 2-to-3 Dynamic Columns

 - [x] 32. Update version records in versionHistory.ts for v17 (8e81d68c) and initialize v1.18 (Version 18)
 - [x] 33. Implement in-app passcode modal for sign in with single passcode "494", replacing manus.im OAuth redirect
 - [x] 34. Implement backend passcode verification endpoint / session cookie management so logged-in user can delete saved reports and edit frontend texts
 - [x] 35. Add editable front-end text capability for logged-in operators (e.g. editable studio titles, remarks, and saved descriptions)
 - [x] 36. Update Analysis Studio initial load behavior: auto-select ONLY the single latest available downtime log date and calculate it alone
 - [x] 37. Update Comparison Studio date selection: replace list with interactive month calendar date picker in popover
 - [x] 38. Update Comparison Studio default state: zero dates selected by default across columns to save calculation execution
 - [x] 39. Update Comparison Studio column layout: show 2 columns by default with clean wide view, and provide "+ Add 3rd Column" / "Remove Column" toggle
 - [x] 40. Run vitest test suite and typescript check
 - [x] 41. Capture browser screenshots to visually verify passcode login, Analysis Studio latest-only selection, and Comparison Studio 2-column layout
 - [x] 42. Save checkpoint and deliver result
