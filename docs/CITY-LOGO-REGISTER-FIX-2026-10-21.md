# Plan — City logo rollout + login kicker + coach-registration alignment

Date: 2026-10-21
Source logo: `C:\Users\FUJITSU\Downloads\cauayan logo.png` → already present at
`next-app/public/cauayan logo.png` (608 KB).

## User decisions (confirmed)

- **KEEP the sports logo everywhere. ADD the city logo alongside it** — do not
  replace/remove the sports logo.
- **Report header must show BOTH logos**, formatted correctly and government-formal
  (left seal + centered text + right logo).

## What the user asked for

1. Add the Cauayan City logo to the system — the printable report and "basically
   everywhere", placed exactly like the sports logo (same spots, same styling),
   WITHOUT removing the sports logo.
2. Login: change the top kicker from "Sign in" to "Cauayan City" and center it.
3. Coach registration:
   - Fix the **Birthdate** field so the label sits perfectly inline (with the
     name fields), and do not center it — left-aligned like the rest of the form.
   - Move **Password** and **School coached** content to the left side
     (currently centered/misaligned).
   - Put the **asterisk** next to the label text, not below it.

## Findings (current state)

Already done before this change:
- `lib/report-doc.js` `ReportHeader` uses `/cauayan logo.png` (shared reports).
- `pages/reports.js` uses `/cauayan logo.png` in both report headers (lines 369, 627).

Still using only the sports logo (need to ADD the city logo alongside it):
- `pages/login.js:48` — auth card logo.
- `pages/coach-register.js:221` — auth card logo.
- `pages/forgot-password.js:43` — auth card logo.
- `pages/reset-password.js:62` — auth card logo.
- `components/AppShell.js:330` — top-bar brand logo (seen on every signed-in page).
- `components/ErrorState.js:42` — error page logo.
- `pages/_document.js:10-12` — favicon / apple-touch-icon.

## Dual-logo design (both logos kept)

- **Auth pages / error page**: a small centred lockup — city logo + sports logo
  side by side above the title (both same height, aligned to a common baseline).
- **Top bar brand**: show the city logo next to the existing sports logo, same
  `44px` box, so the brand line reads as "City + Sports".
- **Report header (formal government style)**: three columns —
  left = Cauayan City seal (`rd-logo-left`),
  centre = Republic of the Philippines / Province of Isabela / City Government of
  Cauayan / City Sports Development Office / address (unchanged text),
  right = sports logo (`rd-logo-right`).
  Both seals same height (84px print / 64px compact), vertically centred on the
  double-rule header. Applies to `lib/report-doc.js` + both headers in
  `pages/reports.js`.
- **Favicon**: keep the sports logo as the site icon (do not change) — the city
  logo is added in-page, not as the tab icon.

## The three register-form bugs, explained simply

1. **Birthdate label not inline / looks centered** — the Birthdate field is a
   standalone `.field-group` set to full width, and the section rule
   `.login-page.register-box h1 … { text-align: center }` plus `.field-group label
   { display:flex; align-items:center }` make its label drift. Fix: keep the
   Birthdate label left-aligned and inline with its input, same as the name row.

2. **Password / School coached centered** — these sit inside `.field-group.full-width`
   and a nested-label sports grid; the register-box centering rules bleed into them.
   Fix: scope the centering rules to only the page header (kicker/logo/title),
   never to form fields.

3. **Asterisk below the name** — `.required` is a `<span>` after the label text;
   because the label is `display:flex` with wrapping, the asterisk can drop to its
   own line on narrow cards. Fix: keep label + asterisk on one line
   (`flex-wrap: nowrap`, `white-space: nowrap` on the label text span).

## Execution plan (one change, one deploy, verified)

1. **Backup** the working tree to
   `C:\Users\FUJITSU\AppData\Local\Temp\opencode\backups\city-logo-<timestamp>`.
2. **Add the city logo alongside the sports logo** (keep sports logo everywhere):
   - Auth pages: dual centred lockup (city + sports) above the title.
   - `AppShell.js` top bar: city logo + sports logo in the brand.
   - `ErrorState.js`: dual centred lockup.
   - `lib/report-doc.js` + `pages/reports.js` (both headers): formal three-column
     header with city seal left, sports logo right, centered text.
   - `_document.js` favicon: unchanged (keep sports logo).
3. **Login kicker** — `pages/login.js`: `auth-kicker` text "Sign in" → "Cauayan City".
   It is already centered by the shared auth CSS; confirm and keep centered.
4. **Register form CSS fix** (in `globals.css`):
   - Scope `.login-page.register-box … text-align:center` to the header chrome only.
   - Give `.field-group label` an explicit left align and one-line label+asterisk.
   - Make the Birthdate row share the same left-aligned label treatment as the name row.
   - Ensure Password (`PasswordInput`) and Sports Coached blocks align left.
   - Keep tokens only (`--space-*`, `--radius-*`); no raw px beyond existing ones.
5. **Verify locally**: `npm run lint` (0 errors) + `npx next build` compiles.
6. **Commit + push** to `main`.
7. **Deploy check**: Vercel production for the new commit = SUCCESS; then
   `/api/health` = HTTP 200 `{"status":"ok","db":"up",...}` with a fresh uptime.
8. **Live verification**:
   - Auth pages render the city logo (login, coach-register, forgot, reset).
   - Top-bar brand + error page show the city logo.
   - Login kicker reads "Cauayan City", centered.
   - Coach register: Birthdate label inline + left; Password/School left; asterisks
     inline beside the label text — measured across 320–1920px widths.
   - Printable report header shows the city seal (already present, re-confirm).
   - Run the standing suites: live regression, pages-check, panel-verify,
     event-results — all must stay green.

## Guardrails

- Do not change theme, colors, or the report's formal structure.
- Do not touch the signature chain (Prepared by → Reviewed by → Certified Correct).
- Keep everything working together; no other page may regress.

## Status: DONE (2026-10-21)

Commits: `a747331` (dual logos + login kicker + register padding), `7e9bfb9`
(register single-line labels + centered kicker). Live verified.

Done:
- City seal added alongside the sports logo on: login, coach-register,
  forgot-password, reset-password, error page, top-bar brand.
- Login kicker = "Cauayan City", centered (`text-align: center`, measured centered).
- Coach-register labels: single line (18px, was 46px), asterisk inline after the
  text (`asteriskSameLine: true` on every required field), all left-aligned.
- Password field left padding fixed 66px → 16px (was indented/"centered").
- Report headers (lib/report-doc.js + both pages/reports.js headers): formal
  three-column layout — city seal left, centered government text, sports logo right.
- Sports logo kept everywhere (not removed).

Verification (all green):
- branding-check 13/13, live regression 46/46, pages-check 26/26,
  panel-verify 12/12, event-results 8/8.
- Login page a11y snapshot shows both logos + "CAUAYAN CITY" kicker.
- Register measured at the live card: all labels one line, asterisks inline, left.

Backup: `backups\city-logo-20261021-182229`.

