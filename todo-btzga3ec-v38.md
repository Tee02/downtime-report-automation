# Version 38 Implementation Checklist

- [ ] 1. Troubleshoot Wiki -> Faultpedia rename
  - Rename page title, subtitle, header, and sidebar navigation to "Faultpedia".
  - Route `/troubleshoot-wiki` remains active and clean; navigation links point to Faultpedia.

- [ ] 2. Faultpedia Rides & Categories
  - Dropdown selection includes ALL 21 attractions from `FLEET_RIDES`.
  - Categories strictly limited to: "Electrical", "Mechanical", "Other" (removed Controls and Safety).
  - Filter bar categories: "All faults", "Electrical", "Mechanical", "Other".

- [ ] 3. No Severity Tag in Listing
  - Removed severity chips/tags from fault cards listing and summary cards.
  - Cards focus cleanly on Title, Fault code, Ride code, and Category.

- [ ] 4. Auto-Numbering on Line Break
  - Corrective Action: typing "1. " and pressing Enter automatically starts the next line with "2. ", etc.
  - Preventive Action: typing "1. " and pressing Enter automatically starts the next line with "2. ", etc.

- [ ] 5. Drag-and-Drop Image Upload with Delete Before Save
  - Manual screenshot upload zone supports drag & drop as well as browse.
  - Supporting photo upload zone supports drag & drop as well as browse.
  - Preview thumbnail/name shown with a Delete (trash/X) button to remove the photo before saving the card.
  - Uploads persist securely via project storage API (`/api/downtime/upload-attachment`).

- [ ] 6. Database Persistence for Faultpedia
  - Backend procedures: `faultpedia.list`, `faultpedia.create`, `faultpedia.update`, `faultpedia.delete`.
  - Stored in MySQL `faultpediaCards` table.
  - Newly created cards persist and stay visible after browser refresh.
  - Preloaded initial seed/reference cards shown when database is empty so users have immediate reference data.

- [ ] 7. Fault Card Window Pop-Up (Modal Dialog)
  - Clicking a fault card opens a detailed Window Pop-up (Dialog modal) instead of expanding an accordion.
  - Pop-up displays full fault details: Ride name & code, Category, Title, Fault Code, Symptom, Root Cause, Numbered Corrective Actions, Preventive Action, and displayed Photos/Screenshots (with full-size view support).

- [ ] 8. Downtime Summary Report Template v2 Line Breaks
  - Add 1 blank line break after the document header on page 1 before Table 1 (Date/Ride table).
  - Add 1 line break on page 2 before the Preventive Action row/table.
  - Maintain standard 2 pages per incident and Cambria typography.
  - Verify generated DOCX against template v2 and convert to PDF/images to confirm visual alignment.

- [ ] 9. Automated Regression Tests & Verification
  - Unit tests for Faultpedia CRUD router.
  - Unit tests for Faultpedia filter logic with revised categories.
  - Unit tests for DOCX generation line breaks.
  - End-to-end browser verification of UI, drag-and-drop, pop-up dialog, and persistence.
  - Version history update to v1.38 with accurate tasks, date, and commit checkpoint.
