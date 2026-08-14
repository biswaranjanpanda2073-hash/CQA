# Redesign Dashboard UI

The user requested a complete UI overhaul of the Production Dashboard with specific structural changes, a new color scheme, an updated header, 5 KPI cards, and 6 new charts integrated via a CDN injection of Chart.js.

## Proposed Changes
### index.html
#### [MODIFY] [index.html](file:///c:/Users/biswa/.gemini/antigravity/scratch/CQA/index.html)
- Inject Chart.js 4.4.1 CDN link within the `<head>` or `<body>`.

### Dashboard Component
#### [MODIFY] [Dashboard.jsx](file:///c:/Users/biswa/.gemini/antigravity/scratch/CQA/src/components/Dashboard.jsx)
- **State & Data**: Keep all `useMemo`, `useCallback`, state hooks, and API structures identical.
- **Layout & CSS**: Implement the new grid layout with 100vh non-scrolling design. Change background to `#F0FFF4` and apply CSS as required.
- **Header**: Left side (Logo `TOHANDS`, Title, Subtitle bound to `projectDisp`), Right side (SHIFT, LINE ID, RUNNING badge, real-time clock). Keep existing filters/Export button below.
- **KPI Cards**: 5 new cards in a single row with custom bottoms, labels, and exact specified data fields.
- **Charts Section**: Use `window.Chart` (loaded from CDN) inside 6 new widget components, mapped to the user specifications.
   - Row 1: Daily Production (Bar), Daily Rejection (Dynamic Colors Bar), FG Yield (Doughnut with custom center text).
   - Row 2: Station-wise Load (Vertical Bar, dynamic colors), Input vs Output (Grouped Bar).
   - Row 3: Failure Pareto (Combo Bar+Line, 80% dashed threshold line).

## Verification Plan
### Manual Verification
- Render the page locally and check that it builds and resolves without scrolling issues, and that all filters/exports remain functional. Check color bounds and design aesthetics.
