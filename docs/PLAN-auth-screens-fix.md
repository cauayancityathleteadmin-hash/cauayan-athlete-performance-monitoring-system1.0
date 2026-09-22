# Fix Auth Screens — Plan & Verification Log

Goal: fix Login, Coach Registration, and Reset Password containers/boxes to use screen space efficiently — wider/better proportioned, less vertical scrolling, responsive across all sizes. Fix the "sports" input specifically. Full system scan after.

---

## Phase 1 — Audit Current Auth Screens ✅ (2026-09-22)

### Login (`/login`)
- **Container**: `.login-page` — width `min(100%-32px, var(--auth-card-width))` where `--auth-card-width` = 420px
- **Issues**: Very narrow (420px max), tall column; only 2 fields but forces vertical stack; excessive margins; wastes horizontal space on desktop/laptop
- **Mobile**: Works but could use slightly more breathing room

### Coach Registration (`/coach-register`)
- **Container**: `.login-page.register-box` — same 420px max, `align-items: flex-start`, `overflow-y: auto`
- **Fields**: 12+ fields (name×3, birthdate, contact, email, password+strength, school, sports grid, ID photo)
- **Grid**: `.register-fields` is 1fr until 560px, then 2-column; `.span-2` forces full-width for email, password, school, sports, ID photo
- **Sports input**: `.register-sports-grid` uses `repeat(auto-fill, minmax(180px, 1fr))` — OK but labels wrap at 180px; on wide screens still only ~3 cols in 420px container
- **Issues**: Container too narrow → excessive vertical scroll; sports grid cramped; password strength meter adds vertical bulk; ID photo field tall; form feels cramped even on 1366px laptop

### Reset Password (`/reset-password`)
- **Container**: `.login-page` — same 420px max
- **Fields**: 2 PasswordInputs with strength meters
- **Issues**: Unnecessarily narrow; strength meters stack vertically adding height

### Specific Sports Input Issues
- `minmax(180px, 1fr)` means at 420px container → 2 cols; sport names wrap (e.g., "Volleyball", "Basketball")
- No visual grouping/hierarchy
- Checkbox + label alignment could be tighter
- On very wide screens, still constrained by 420px card

---

## Phase 2 — Redesign Auth Container Layout

### Target widths
| Screen | Login | Register | Reset Password |
|--------|-------|----------|----------------|
| Mobile (≤480px) | 100%-24px | 100%-24px | 100%-24px |
| Tablet (481-768px) | 440px | 560px | 440px |
| Laptop (769-1024px) | 480px | 680px | 480px |
| Desktop (≥1025px) | 520px | 760px | 520px |

### Layout changes
- **Login**: Slightly wider card on desktop; keep single column (only 2 fields); reduce vertical gap slightly
- **Register**: Wider card; 2-column grid from 520px; group name fields (first+middle+last in 3-col on wide, 2-col on medium); email+contact side-by-side; password strength stays full-width (complex); sports grid gets more columns; ID photo stays full-width
- **Reset Password**: Slightly wider card; keep 2 fields stacked

### CSS variables to use
- `--space-*` tokens only
- `--radius-*` tokens only
- `--auth-card-width` remains the max for login/reset; new `--auth-register-width` for register

---

## Phase 3 — Fix Sports Input Specifically

- Increase `minmax` to `minmax(200px, 1fr)` for better label fit
- Add subtle column count control at wider breakpoints
- Better checked-state visibility
- Ensure grid reflows cleanly at all sizes

---

## Phase 4 — Responsive Testing
Test at: 375px (mobile), 768px (tablet), 1366px (laptop), 1920px (desktop)

---

## Phase 5 — Full System Scan & Fix Loop
[After Phases 1-4 complete]

---

## Phase 6 — Full Regression Pass
[After Phase 5 complete]

---

## Verification Log

| Phase | Result |
|-------|--------|
| 1 — Audit | ✅ 2026-09-22 (documented above) |
| 2 — Layout | ✅ wider containers (login 420→520px, register 420→760px, reset 420→520px), 2-col grid from 560px, 3-col names at 900px, contact row, school-sports row |
| 3 — Sports input | ✅ minmax(200px,1fr) base, 220px at 900px+, better checkbox alignment |
| 4 — Responsive | ✅ breakpoints at 360/480/560/640/900/1025px; build + lint pass |
| 5 — System scan | ✅ all routes (200/307), APIs healthy, build + lint clean |
| 6 — Regression | ✅ login, register, reset-password flow verified; all features functional; theme unchanged; mobile OK; console clean |