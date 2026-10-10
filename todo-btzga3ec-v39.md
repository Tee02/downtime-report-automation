# Version 1.39 Implementation Plan

## Goal
Implement the Version 1.39 requirements from `v1-39update.docx`:
1. **KPI Calendar**:
   - Rename "Downtime calendar" to "KPI Calendar".
   - Subtitle: "Spot if everyday is within 1% KPI percentage" (short and natural).
   - Dynamic heat map coloring based on total daily downtime %:
     - 0.00% to 0.99%: Blue highlight ("Within KPI")
     - 1.00% to 1.99%: Light red
     - 2.00% to 2.99%: Darker red
     - 3.00%+: Deep/darkest red
   - Dark day: keep standard dark day grey highlight.
   - Unuploaded date (e.g. 7/10): slightly lighter grey compared to dark day grey.
   - Tooltips on mouse hover:
     - Dark day: "Dark day"
     - Highlighted/uploaded dates: Total downtime % (e.g. "Downtime: 0.65% (Within KPI)" or "0.65%")
     - No upload date: "No log detected"
   - Display across all previous uploaded dates (not just active month), cached / recorded note so switching months does not recalculate.
2. **Technical Downtime Trend**:
   - Single date selected: show stacked bar chart split by affected rides with longest downtime at bottom, shortest at top.
   - Each ride has distinct color.
   - Tooltip format: `{ride} • {total time} • {number of incidents} inc • {percentage}%` (e.g. "RTR • 12min • 1 inc • 2.5%").
   - 3rd tab: Pie chart showing contribution of each ride with same tooltip format.
3. **Compare Tab (Analysis Page)**:
   - Chart switcher with 3 tabs: Bar chart (default), Line chart (2nd), Pie chart (3rd).
   - Display rides breakdown in bar and pie charts with same tooltip format.
   - History section:
     - Format: "rides on day/month" (e.g. "TTC on 21/6", "ACR on 21/6 – 23/6", "All rides on 21/8").
     - Up to 5 previous comparisons saved; older deleted.
     - Narrow horizontal scroll placed before date selection, latest on left.
     - Clicking pre-fills dates & rides; user clicks "Start comparison" to run.
4. **Downtime Summary Page**:
   - Recategorize rides according to official table:
     - Zone A: BWZ, AFP, ESD, IDD, BCT (EV), BCT (RC), BCT (UZ), BCT (ZC), NTM, PTA, RTR, TTC (12 rides)
     - Zone B: ACR, BSC, EHF, VTM, ETI, MFZ, RCC, SAG, SRS (9 rides)
   - "Tick All" / "Untick All" under Zone A sub-tab ticks/unticks only Zone A rides; under Zone B sub-tab ticks/unticks only Zone B rides; under ALL ticks/unticks all.
5. **Release & Quality**:
   - Update version history to v1.39.
   - Add/update vitest tests.
   - Verify build, tests, and screenshots.
