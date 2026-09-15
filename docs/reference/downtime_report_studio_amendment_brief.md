# Downtime Report Studio — UI and Workflow Amendment Brief

**Purpose:** This document is a self-contained specification for updating the **Downtime Report Studio** page. It consolidates the approved UI decisions and functional requirements for source upload, saved-log recall, multi-date mapping, mapping progress, and Mapping Excel preview.

**Primary outcome:** A user can either upload new downtime files or recall one or more previously saved downtime logs from any signed-in device, optionally add context, and generate a **Mapping Excel** in chronological date order.

The work applies to the current **Report Studio** page in the SkyWorlds 11-1 Downtime Studio application. The existing application contains the three workspaces Report Studio, Analysis Studio, and Comparison Studio. [1]

---

## 1. Product Decisions to Preserve

The amended page must preserve these decisions throughout the user journey.

| Decision | Required behavior |
|---|---|
| Naming | Use **Mapping Excel** consistently. Do not use “review Excel,” “review report,” or “Build review” in the Report Studio workflow. |
| Default source method | **Upload new file** is the first tab and is selected by default. |
| Saved source files | Users can opt in to save an uploaded downtime log to the website, allowing recall and reprocessing from another signed-in device. |
| Recall method | **Saved downtime logs** is the second tab. It must use a calendar-first multi-date selector rather than a long report library table. |
| Mapping order | When multiple saved dates are selected, the output must process and write data in **ascending chronological date order**, regardless of the order in which the user clicked dates. |
| Additional context | The second stage is named **Additional context** and clearly marked optional. |
| Mapping feedback | While the Mapping Excel is generating, show an in-progress checklist on the right side. Completed items receive green ticks. The active item uses a spinner. Remaining items stay pending. |
| Output preview | The output preview table displays **Downtime %**, not Availability. The workbook preview also includes a **Downtime chart** tab or panel that presents the daily downtime as a bar chart. |

---

## 2. Page-Level Information Architecture

Keep the existing compact left navigation and overall SkyWorlds visual language. The Report Studio remains the selected navigation item.

### 2.1 Persistent left navigation

| Item | Required state |
|---|---|
| Brand area | Keep the **SkyWorlds 11-1 / Downtime Studio** identity at the top. |
| Report studio | Selected / active state. |
| Analysis studio | Available navigation item. |
| Comparison studio | Available navigation item. |
| User area | Keep current signed-in or guest state at the bottom. |

### 2.2 Main page hierarchy

The page must use this order from top to bottom:

1. Hero header and workflow stepper.
2. **1. Choose your source** section.
3. **2. Additional context** section, explicitly optional.
4. Context-sensitive right-side **Mapping readiness** panel, or **Mapping applied** panel after generation begins.
5. Persistent bottom action bar before submission.
6. Generation screen after the mapping action starts.
7. Completion screen with Mapping Excel preview and download action after success.

The implementation should use a responsive two-column desktop layout. The source/context content is the main column. Readiness, processing, and mapping status belong in a narrower right column. On smaller screens, the right column may move below the main content without losing content or state.

---

## 3. Visual System

The new screens should match the approved visual direction rather than introducing a new brand style.

| Element | Direction |
|---|---|
| Page background | Soft pale lavender-blue or periwinkle background. |
| Hero | Pale blue panel with subtle technical grid texture. |
| Content panels | White panels with rounded corners, thin cool-grey borders, and very subtle shadows. |
| Primary text | Deep navy. |
| Secondary text | Blue-grey/slate. |
| Primary action | Emerald green. |
| Information | Blue. |
| Optional / attention | Amber. |
| Destructive action | A restrained red/rose hover or confirmation treatment only when deleting a loaded file. |
| Success states | Emerald circular check icons and green status chips. |
| Loading state | Emerald spinner/progress ring and a slim emerald progress bar. |

Do not use a large visible saved-report table in the default page content. Do not use “Availability” as the Mapping Excel preview column label. Do not hide mapping status during processing.

---

## 4. Hero Header and Stepper

### 4.1 Header copy

Use the following default header text on both source-selection tabs.

> **PARK OPERATIONS**  
> **Downtime Report Studio**  
> Upload a daily log or reopen a saved log to build a Mapping Excel.

When the Saved downtime logs tab is active, the subtitle may be more specific:

> Select saved logs and build one Mapping Excel in date order.

### 4.2 Stepper

Show a three-step horizontal stepper aligned at the upper right of the hero.

| Step | Label | State before generation | State during generation | State after success |
|---|---|---|---|---|
| 1 | Choose source | Active while selecting source | Green completion tick | Green completion tick |
| 2 | Additional context | Inactive until source is valid | Green completion tick | Green completion tick |
| 3 | Build mapping Excel | Inactive until submission | Active emerald spinner/progress ring | Green completion tick |

The stepper must reflect real state. It must not show stage 2 as complete while a required source file is still absent.

---

## 5. State A — Upload New File (Default Tab)

### 5.1 Tab order

The source selector must have exactly two tabs in this order:

1. **Upload new file** — selected by default.
2. **Saved downtime logs** — second tab.

Use distinct icons if the product uses them, such as cloud upload for the first tab and a storage/database icon for the second tab.

### 5.2 Source cards before upload

The upload tab shows two side-by-side cards on desktop.

| Card | Requirement | Empty state |
|---|---|---|
| Operations downtime log (XLSX) | Required | Drag and drop or click to select an XLSX downtime log. |
| Park Close log (PDF) | Optional | Drag and drop or click to select a daily Park Close Log PDF. |

The required downtime-log card should make the required state unambiguous. The optional Park Close card must never prevent mapping generation.

### 5.3 Source cards after upload

When either file is loaded, transform its card into a compact loaded-file state.

| Card element | Required behavior |
|---|---|
| Filename | Display the selected filename. |
| File state | Display a meaningful loaded state, such as **Ready to map** for the downtime log and **Loaded** for the Park Close PDF. |
| Removal control | Show a small circular **×** button at the **top-right corner of the card**. |
| Removed file result | Clicking the × removes only that file and immediately returns its card to the empty upload state. |
| Forbidden UI | Do **not** show “Replace file,” a replace-file link, or a replace-file button. |

### 5.4 File removal rules

| User action | Required UI and workflow result |
|---|---|
| Remove Operations downtime log | Clear the file, return the required card to its empty drop zone, remove its readiness check, and disable the mapping action until a valid downtime log or saved-log selection is supplied. |
| Remove Park Close log | Clear the PDF, return its card to empty state, change readiness to an optional amber/info note, and keep mapping enabled if another valid source exists. |
| Remove then upload another file | Allow the user to upload normally into the cleared card. |

Use an accessible icon button with an explicit aria-label, such as `Remove Operations downtime log` and `Remove Park Close log`. If the product uses confirmation for destructive actions, only ask for confirmation when the selected file has unsaved context changes; otherwise removal should be immediate and reversible by re-uploading.

### 5.5 Save source log control

When a new Operations downtime log has been loaded, show a visible switch below the source cards:

> **Save source log to website**  
> Store this source file securely so it can be recalled and reprocessed from any signed-in device.

Requirements:

- The switch may default to the agreed product default, but the selected state must be visually obvious.
- When the switch is enabled, the bottom action explicitly reads **Save & build mapping Excel**.
- When disabled, the action reads **Build mapping Excel**.
- Only the source downtime log is required for recall. If product policy allows saving the optional Park Close PDF too, save it together and disclose that in the action-bar helper text.
- If a guest user cannot persist files, show a non-blocking explanation and sign-in route before attempting storage.

### 5.6 Upload-state Mapping readiness panel

On the right, show a context-sensitive **Mapping readiness** panel. Example content when both files are loaded:

| Status | Copy |
|---|---|
| Complete | Downtime log loaded — `11.09.2026 Tech – SkyWorlds Downtime Log.xlsx` |
| Complete | Park Close log loaded — `11.09.2026 Park Close Log.pdf` |
| Complete | Technical 11-1 scope confirmed |
| Complete | AVL excluded |

Example content when the PDF is missing:

| Status | Copy |
|---|---|
| Complete | Downtime log loaded |
| Complete | Technical 11-1 scope confirmed |
| Complete | AVL excluded |
| Optional / amber | Park Close log not added — optional. PDF file is not required to build the Mapping Excel. |

The scope message must make clear that weather, ride, and closure context is handled only when provided or available. Do not imply user-entered context was included when it was not.

### 5.7 Upload-state action bar

Pin an emerald action bar to the bottom of the active page content or viewport without covering controls.

| Situation | Main line | Supporting line | Primary button |
|---|---|---|---|
| Valid new upload, saving enabled | Ready to save and build mapping Excel | The uploaded source log will be saved to the website. | Save & build mapping Excel → |
| Valid new upload, saving disabled | Ready to build mapping Excel | The uploaded source log will be used for this mapping only. | Build mapping Excel → |
| Required log missing | Add a downtime log to continue | An Operations downtime XLSX file is required. | Disabled Build mapping Excel → |

A secondary outlined action can read **View source file** or **View source files** when a loaded source exists.

---

## 6. State B — Saved Downtime Logs (Second Tab)

### 6.1 Purpose

This tab lets a signed-in user recall one or more source logs previously saved to the website. It replaces the long list/library table with a **calendar-first selection workflow**.

The saved-log tab must not be the default tab. It is the second tab after Upload new file.

### 6.2 Calendar behavior

The calendar is the primary selection control.

| Requirement | Expected behavior |
|---|---|
| Month navigation | Users can move backward and forward between months. |
| Saved log indicator | Every date with at least one saved downtime log has a muted blue dot or similar subtle marker. |
| Multi-select | Users can select multiple saved-log dates. Each selected date receives a high-contrast selected state. |
| Selection order | Display a small number badge on selected dates to clarify the current chronological mapping order. |
| Chronology rule | Sort selected dates ascending by actual date before mapping, regardless of click order. |
| Date without saved log | It is not selectable as a saved source. It may show no marker or a disabled state. |
| Toggle selection | Clicking a selected date again removes it from the selection and recalculates all order badges. |
| Month continuity | Multiple months can be selected if each date has a saved log. |

Use a legend below the calendar:

- Muted blue dot: **Saved log**
- Emerald highlighted date: **Selected**

### 6.3 Selected-log and Mapping order panel

Place a panel to the right of the calendar. When multiple dates are selected, use this content hierarchy:

> **4 saved logs selected**  
> **Mapping order**

Show one row per selected log in chronological output order. Example:

| Order | Date | Technical downtime |
|---:|---|---:|
| 1 | 7 Sept 2026 | 286 min |
| 2 | 9 Sept 2026 | 104 min |
| 3 | 10 Sept 2026 | 92 min |
| 4 | 11 Sept 2026 | 52 min |

Below the rows, display this clear rule:

> Mapping Excel will follow the selected dates in chronological order.

Then show:

- **Clear selection** link.
- **View selected logs** link or action.
- A non-intrusive information note: “Saved source logs can be reopened and processed from any signed-in device.”
- An optional search field or link to browse saved logs only if the user needs file-name lookup. Search is secondary to calendar selection and must not replace the calendar.

When exactly one date is selected, the same panel can show **Selected saved log** and that date’s filename, saved state, and technical downtime total.

### 6.4 Saved-log readiness panel

When saved dates are selected, the right-side Mapping readiness panel must show real selection state.

| Status | Example copy |
|---|---|
| Complete | 4 saved logs selected — 7–11 Sept 2026 · 4 logs |
| Complete | Date order confirmed — In chronological order |
| Complete | Technical 11-1 scope confirmed |
| Complete | AVL excluded |
| Informational | Park Close log and weather context are optional. |

### 6.5 Saved-log action bar

| Condition | Main line | Supporting line | Primary button |
|---|---|---|---|
| One selected saved log | Ready to build mapping Excel | 11 Sept 2026 saved source log selected. | Build mapping Excel → |
| Multiple selected saved logs | Ready to build multi-date mapping Excel | 4 saved source logs selected · 7–11 Sept 2026 | Build mapping Excel → |
| No saved dates selected | Select at least one saved log | Use the calendar to select saved-log dates. | Disabled Build mapping Excel → |

The action must build **one Mapping Excel** from all selected saved logs, not generate one workbook per date unless that behavior is separately requested.

---

## 7. Additional Context (Optional)

Rename the second section exactly:

> **2. Additional context**  
> **Optional**

This section must look optional and must not appear to be a required workflow blocker.

### 7.1 Handover closure

Show a collapsed row titled **Handover closure**. When expanded, it permits the user to add or select a ride only when it did not hand over but is not marked CLOSED in the Operations log.

The row may include a toggle. The ride selector is only enabled when the handover closure control is active.

### 7.2 Weather / 11-3 messages

Show a collapsed row titled **Weather / 11-3 messages** with the supporting text:

> Weather maps 11-3 messages to the report timeline automatically.

If automatic mapping is operational, display a green status chip:

> Automatic mapping enabled

Manual message entry can appear after expansion. Weather mappings should not be represented as Technical 11-1 downtime percentage unless the existing business logic explicitly requires it.

---

## 8. Submission and Validation Rules

Before creating a Mapping Excel, validate the source state.

| Scenario | Allow mapping? | Required response |
|---|---:|---|
| New valid Operations downtime XLSX loaded | Yes | Continue with optional context. |
| New upload with Park Close PDF absent | Yes | Continue with optional note. |
| New upload without Operations downtime XLSX | No | Disable primary action and show clear required-file guidance. |
| One valid saved downtime date selected | Yes | Build from that saved log. |
| Multiple valid saved dates selected | Yes | Sort ascending by date and build one output. |
| No saved dates selected | No | Disable action and prompt calendar selection. |
| Saved source inaccessible or deleted | No | Mark entry unavailable, remove it from active selection, and present an actionable error. |
| Session lacks permission to recall saved source | No | Tell the user why and route to sign-in/authorization; do not silently fall back to stale data. |

The primary action must prevent duplicate submissions while a mapping job is already in progress.

---

## 9. State C — Mapping Excel Generation / Loading Screen

After the user clicks **Save & build mapping Excel** or **Build mapping Excel**, transition to an explicit processing state. Do not leave the user on a static form without feedback.

### 9.1 Header and stepper

Use this header copy for multi-date processing:

> **Building mapping Excel**  
> Applying selected logs in chronological order.

The stepper should show:

- **Choose source:** completed green tick.
- **Additional context:** completed green tick.
- **Build mapping Excel:** active emerald spinner/progress ring.

### 9.2 Preview loading state

The main panel title is:

> **Mapping Excel preview**  
> **Generating…**

Show a spreadsheet-like preview skeleton. Headers remain visible, but cell data may be displayed as muted placeholder bars until the output is ready.

The required preview columns are:

| Column | Required label | Content |
|---|---|---|
| A | Ride | Ride name or ride code. |
| B | Date | Mapping date, shown in workbook chronological order. |
| C | Technical downtime | Technical 11-1 downtime duration. |
| D | Downtime % | Downtime percentage; do not label this column Availability. |
| E | Event remarks | Mapped technical incident notes/counts. |

### 9.3 Workbook tabs and downtime bar chart

At the bottom of the workbook preview, show workbook-style tabs:

1. **WK_template_v4** — selected by default.
2. **Summary**.
3. **Downtime chart**.

During loading, a chart preview or chart-area skeleton must be visible below or adjacent to the sheet tabs. Use this copy:

> **Downtime trend**  
> Preparing daily downtime chart

The completed chart is a **daily downtime bar chart**. It must use selected dates in chronological order on the x-axis. The y-axis must use downtime minutes. Color bars according to the existing severity logic when possible:

| Severity | Technical downtime range | Suggested colour |
|---|---:|---|
| Monitor | Under 30 min | Light blue |
| Elevated | 30–59 min | Dark blue |
| High | 60–119 min | Amber/orange |
| Critical | 120+ min | Rose/red |

Do not show a percentage y-axis for this downtime-minutes chart. Do not use bars in an arbitrary selection-click order.

### 9.4 Mapping applied side panel

Keep a persistent right-side panel titled **Mapping applied**. It must show the mapping workflow as sequential states.

| Mapping step | Successful state | Active state | Pending state |
|---|---|---|---|
| Source logs read | Solid green tick | Emerald spinner if active | Outlined empty circle |
| Technical 11-1 rows selected | Solid green tick | Emerald spinner if active | Outlined empty circle |
| AVL downtime excluded | Solid green tick | Emerald spinner if active | Outlined empty circle |
| Weather messages mapped | Solid green tick | Emerald spinner if active | Outlined empty circle |
| Handover closures applied | Solid green tick | Emerald spinner if active | Outlined empty circle |
| Downtime percentage written to template | Solid green tick | Emerald spinner if active | Outlined empty circle |

Use meaningful dynamic descriptions. Example:

| Step | Example description |
|---|---|
| Source logs read | Successfully read 4 selected Technical 11-1 source logs. |
| Technical 11-1 rows selected | Filtered and validated relevant rows. |
| AVL downtime excluded | Removed AVL-related downtime. |
| Weather messages mapped | Mapping weather events to the timeline. |
| Handover closures applied | Applying selected handover closure logic. |
| Downtime percentage written to template | Updating the template with calculated downtime percentage. |

Below the checklist, show a real progress label and bar, such as:

> **4 of 6 mapping steps completed** · **67%**

Then show chronological processing scope:

> Processing 4 selected days in date order: 7 Sept → 9 Sept → 10 Sept → 11 Sept

Disable download and open-source actions until their resources are ready. A disabled state must be visibly disabled and explain no false completion.

---

## 10. State D — Mapping Excel Generated / Completed Preview

After a successful job, transition to a completed state.

### 10.1 Header

> **Mapping Excel generated**  
> Your Technical 11-1 downtime mapping is ready to review and download.

All three stepper stages show green completion ticks.

### 10.2 Completed workbook preview

The panel title remains **Mapping Excel preview** with a green **Generated successfully** status chip.

Show a sample of actual mapped rows, sorted by date ascending. The preview must retain the following column names:

| Ride | Date | Technical downtime | Downtime % | Event remarks |
|---|---|---:|---:|---|
| Expedition Thin Ice | 7 Sept 2026 | 42 min | 8.75% | 2 technical incidents |
| Rio Carnaval Chaos | 7 Sept 2026 | 32 min | 6.67% | 2 technical incidents |
| Samba Gliders | 9 Sept 2026 | 11 min | 2.29% | 1 technical incident |
| Epic Hummingbird Flyers | 10 Sept 2026 | 7 min | 1.46% | 1 technical incident |

The rows above are layout examples only. The implemented values must come from the selected source files. Do not fabricate operational results.

The full workbook must preserve the chronological selected-date order in all relevant mapping sections. If rows are grouped by date, groups appear from earliest selected date to latest selected date.

### 10.3 Completed downtime chart

The **Downtime chart** tab must display the completed daily downtime bar chart. Requirements:

- X-axis: selected dates in ascending chronological order.
- Y-axis: technical downtime in minutes.
- One bar per selected date.
- Tooltip or hover state: date, technical downtime minutes, and severity category.
- Bar color: determined from the severity threshold configuration.
- If only one date is selected, show a single bar and explain that the chart represents the selected day.
- If no downtime exists in a selected log, show a zero-height bar or clearly labelled zero-value state; do not omit the date without explanation.

### 10.4 Completed Mapping applied panel

Mark all six mapping steps as complete with solid green ticks. Include a compact output summary populated from actual output:

| Metric | Example label |
|---|---|
| Rides affected | 4 rides affected |
| Total technical downtime | 92 min technical downtime |
| Recorded incidents | 6 incidents |
| Dates mapped | 4 selected dates |

Show the source/audit footer, for example:

> Sources: 07.09.2026 … through 11.09.2026 … · Saved to website

For one source, use the singular form `Source:`. For multiple saved logs, use the plural form `Sources:`.

### 10.5 Completion actions

| Priority | Label | Required behavior |
|---:|---|---|
| Primary | **Download mapping Excel** | Downloads the generated Mapping Excel. |
| Secondary | **Open source log** or **Open source logs** | Opens the underlying selected source file(s), respecting access controls. |
| Tertiary | **Build another mapping** | Returns the user to source selection without deleting saved sources. |

---

## 11. Data and State Model

The implementation should separate the user’s source choice from the generated output. The following conceptual model is sufficient regardless of frontend framework.

| Data field | Type / example | Purpose |
|---|---|---|
| `sourceMode` | `upload` or `saved` | Controls which source tab and data pathway are active. |
| `uploadedDowntimeLog` | File metadata or `null` | Required uploaded XLSX source. |
| `uploadedParkCloseLog` | File metadata or `null` | Optional uploaded PDF source. |
| `saveSourceToWebsite` | Boolean | Determines whether an uploaded source is persisted for later recall. |
| `savedLogs` | Array of saved-log metadata | Calendar source inventory. |
| `selectedSavedLogIds` | Array | The saved log dates/files selected for this mapping. |
| `orderedSelectedLogs` | Derived ascending date array | The authoritative output order. Never rely on click order. |
| `additionalContext` | Handover and weather values | Optional mapping annotations. |
| `mappingJobStatus` | `idle`, `validating`, `processing`, `success`, `error` | Controls UI state and submission lock. |
| `mappingProgress` | Step state and percentage | Drives moving ticks/spinner and progress bar. |
| `mappingWorkbook` | Job output / `null` | Enables preview and download after completion. |

### 11.1 Chronological sort rule

Use the saved record’s real normalized date value, not displayed text, to determine output order.

```text
orderedSelectedLogs = selectedSavedLogs.sort((a, b) => a.reportDate - b.reportDate)
```

The UI’s numbered calendar badges, Mapping order list, processing message, workbook row order, and downtime chart x-axis must all derive from this same ordered array.

### 11.2 Multi-date output semantics

When multiple saved logs are selected:

1. Validate every selected source independently.
2. Sort logs in ascending date order.
3. Map each source according to that date order.
4. Write each day’s data into the correct chronological position in the Mapping Excel template.
5. Calculate and write the **Downtime %** for each relevant row/day using the existing calculation rule.
6. Build the daily downtime bar chart from the same chronological series.
7. Preserve source references in the generated workbook/audit metadata.

---

## 12. Error, Empty, and Edge States

| Situation | Required user-facing treatment |
|---|---|
| No saved logs exist | Calendar remains visible but no dates are selectable. Show: “No saved downtime logs are available yet. Upload a new file and enable Save source log to website to recall it later.” |
| Saved log has no usable file | Mark the date as unavailable. Do not let it enter the mapping order. Explain that the source must be re-uploaded or restored. |
| Selected dates include duplicates | Prevent duplicate selected records. One date/log should map once per output selection unless multi-file-per-day support is explicitly defined. |
| Multiple saved logs on one date | Show an intermediate chooser after clicking the date, or establish and display a clear selection rule. Do not silently choose one file. |
| Park Close PDF invalid | Keep the downtime source valid. Show file-specific guidance and let the user remove/re-upload the PDF. |
| Mapping job fails | Preserve the source selection and additional-context values. Show an error summary and a retry action. Do not claim the Mapping Excel is generated. |
| Partial multi-date failure | Identify the failed date/source. Offer retry after correction. Do not download a workbook labelled complete if it omitted selected dates. |
| User changes source during processing | Disable source-switching and destructive controls until cancellation or completion, or prompt to cancel the active job first. |

---

## 13. Accessibility and Interaction Requirements

| Area | Requirement |
|---|---|
| Tabs | Use real tab semantics or equivalent keyboard-accessible controls. Clearly expose selected state. |
| Calendar | Support keyboard navigation and expose saved/selected/unavailable state to assistive technology. |
| File controls | The × buttons need explicit accessible labels; color cannot be the only indication of file state. |
| Progress | Announce significant mapping progress changes to assistive technology without repeatedly interrupting the user. |
| Loading | Pair spinners with clear text such as `Generating…` or `Weather messages mapped`. |
| Charts | Provide a text equivalent of daily downtime values and severity states, via accessible summary/table or chart description. |
| Contrast | Ensure text, icons, and status color chips meet readable contrast requirements against light panels. |

---

## 14. Acceptance Checklist

The Report Studio amendment is complete only when all items below pass.

### Source selection

- [ ] Upload new file appears first and is active on initial page load.
- [ ] Saved downtime logs appears second.
- [ ] Loaded Operations downtime log displays a top-right × removal control.
- [ ] Loaded Park Close log displays a top-right × removal control.
- [ ] No loaded-file state uses “Replace file.”
- [ ] Removing the Operations downtime log disables Mapping Excel generation until another valid source is selected.
- [ ] Removing Park Close log keeps generation available when the main downtime log is valid.
- [ ] The save-to-website switch is visible after upload and the button copy responds to its state.

### Saved-log recall and order

- [ ] Saved-log recall uses a calendar as the primary control.
- [ ] Dates with saved logs are visually distinguished from dates without saved logs.
- [ ] Users can select multiple saved dates.
- [ ] Selected dates display chronological order markers.
- [ ] Clicking dates in a random order still produces an ascending chronological Mapping order list.
- [ ] The Mapping Excel data writes in the same chronological order.
- [ ] The daily downtime bar chart x-axis uses the same chronological order.

### Terminology and optional context

- [ ] All main actions and headings use **Mapping Excel** terminology.
- [ ] No UI copy calls the output “Review Excel” or “review report.”
- [ ] Section 2 is labelled **Additional context** with an **Optional** badge.
- [ ] Handover closure and Weather / 11-3 messages are optional and expandable.

### Processing and preview

- [ ] Submission transitions to a visible generation/loading state.
- [ ] The right-side Mapping applied panel remains visible during processing.
- [ ] Completed mapping steps show green ticks.
- [ ] The active mapping step shows a spinner/progress state.
- [ ] Pending steps remain visually distinct from completed steps.
- [ ] The preview table column is named **Downtime %**.
- [ ] The preview does not label the column Availability.
- [ ] Workbook-style tabs include WK_template_v4, Summary, and Downtime chart.
- [ ] The Downtime chart is a daily downtime **bar chart** measured in minutes.
- [ ] Download only becomes enabled after successful Mapping Excel generation.

---

## 15. Visual References

Use the following approved concepts as visual direction. They are reference assets, not functional specifications; the requirements above take precedence where a visual conflicts with detailed behavior.

| Screen | Reference asset |
|---|---|
| Upload new file, loaded file cards with corner × removal controls | `/home/ubuntu/downtime_studio_upload_delete_controls_concept.png` |
| Saved downtime logs, multi-date calendar selection and chronological Mapping order | `/home/ubuntu/downtime_studio_saved_logs_multi_date_calendar_concept.png` |
| Mapping Excel generation/loading, Mapping applied progress, Downtime % preview column, and bar-chart preparation | `/home/ubuntu/downtime_studio_mapping_excel_loading_concept.png` |

---

## References

[1]: https://11-1.yikseng.com/ "SkyWorlds 11-1 Downtime Studio"
