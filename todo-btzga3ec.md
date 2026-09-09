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

## Iteration 5: Security Privacy (Hide 494 Code), Full Frontend Text Edit Mode, Date Presets, Range Picker, Dynamic Comparison Auto-Naming, Delta Badges & History

 - [x] 43. Update version records in versionHistory.ts: record v18 commit (03a8cbfd) and initialize v1.19 (Version 19)
 - [x] 44. Remove any public display of "494" in sidebar, placeholders, subtitles, error messages, and version logs
 - [x] 45. Remove the fixed banner sentences ("Operations Notice..." and "Analysis Studio Scope...") in Report Studio and Analysis Studio
 - [x] 46. Implement operator front-end text editing mode: enable editing of titles, section names, card headers, labels, and copy across the UI with persistent save
 - [x] 47. Add quick date presets in Analysis Studio: "Yesterday", "Last 7 Days", "Latest Only", "All Available", and "Clear"
 - [x] 48. Implement start & end date range selection in Comparison Studio calendar picker
 - [x] 49. Display exact selected dates in Comparison Studio column headers and in the "Reporting Days" spec row
 - [x] 50. Auto-hide rides that have 100% availability in all compared columns; only show rides with downtime (<100%)
 - [x] 51. Auto-rename scenarios following format `TTC on 21/8` or `All rides on 21/8` based on selected date(s) and ride(s)
 - [x] 52. Implement "Start Comparison" button positioned before the comparison table to trigger calculation
 - [x] 53. Auto-save up to 5 previous comparison history items above scenario selection for one-click re-loading
 - [x] 54. Implement Side-by-Side Delta Metrics in Column 2 (and 3) showing percentage and minute difference badges against Column 1
 - [x] 55. Run vitest test suite and typescript check
 - [x] 56. Capture browser screenshots to verify all new features visually
 - [x] 57. Save checkpoint and deliver result

## Iteration 6: Total Front-End Text Editability and Pure Password Security

 - [x] 58. Update versionHistory.ts to record v19 commit (41369914) and initialize v1.20 (Version 20)
 - [x] 59. Ensure password prompt only asks for password with zero hints (no mention of 3 digits, standard masked password field)
 - [x] 60. Enhance TextEditContext so that all editable elements have direct, visible inline click/focus editing with visual cues
 - [x] 61. Wrap all titles, subtitles, card headers, section labels, and buttons in Downtime Studio (Home.tsx) with EditableText
 - [x] 62. Wrap all bottom section texts in Analysis Studio (Saved report library, Evac of 11-7/11-17 (mins), Daily comparison, Weekday pattern, Ride ranking, Incident log intelligence, etc.) with EditableText
 - [x] 63. Wrap all section headers, metric category rows, and card labels in Comparison Studio with EditableText
 - [x] 64. Run vitest test suite and typescript check
 - [x] 65. Capture browser screenshots to visually verify editing across all 3 pages
 - [x] 66. Save checkpoint and deliver result

## Iteration 7: Favicon Restoration, Sidebar Collapse Fix, and Calendar Range Highlighting

 - [x] 67. Update versionHistory.ts to record v20 (975a6e02) and initialize v1.21 (Version 21)
 - [x] 68. Restore missing favicon: generate and place favicon.ico, favicon.png, and favicon.svg into client/public, and link properly in client/index.html
 - [x] 69. Fix sidebar collapse bug: ensure logo and branding hide cleanly when the sidebar is collapsed (prevent logo leaking onto main content)
 - [x] 70. Implement seamless 2-click date range selection (start date + end date) in Analysis Studio with in-between date highlighting
 - [x] 71. Ensure "Latest" preset selects today if a log exists for today, or the latest available downtime log date, and highlights it in calendar
 - [x] 72. Implement seamless 2-click date range selection (start date + end date) in Comparison Studio with in-between date highlighting
 - [x] 73. Run vitest test suite and typescript check
 - [x] 74. Capture browser screenshots to visually verify collapsed sidebar, favicon link, and range highlighting
 - [x] 75. Save checkpoint and deliver result
