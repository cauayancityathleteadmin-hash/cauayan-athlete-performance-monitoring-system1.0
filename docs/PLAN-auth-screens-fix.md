# Fix Auth Screens — Plan & Verification Log

## Phase 1: Audit (Complete)

### Issues Found

**Login** (`/login`)
- Max width 520px — too narrow for desktop, wastes space
- Only 2 fields but stacked vertically with excessive vertical space
- Label/input styling differs from register page

**Coach Register** (`/coach-register`)
- Max width 760px — better but still narrow on large screens
- **Sports grid**: `auto-fill` with `minmax(200px,1fr)` leaves ragged edges; long sport names wrap/cut off; grid doesn't fill container evenly
- `contact-row` CSS class defined but **not used in JSX**
- Fieldsets break the grid layout (block elements inside grid container)
- PasswordInput has strength meter making it taller than other fields
- Fieldsets used for grouping but don't leverage grid for side-by-side fields
- No visual hierarchy between field groups beyond fieldset borders

**Reset Password** (`/reset-password`)
- Uses `.login-page` (420-520px) instead of wider container
- Two PasswordInputs stacked vertically — could be side-by-side on wider screens
- Strength meter adds vertical height making form tall

**All Auth Screens**
- No breakpoint >1200px for very large monitors
- Short fields (birthdate, phone) stretch full width unnecessarily
- Inconsistent label/input styling between login and register
- Sports grid `auto-fill` leaves uneven gaps on last row

---

## Phase 2-4: Implementation Plan

### 2.1 CSS Variables & Container Widths
- Increase `--auth-card-width` to 480px (login/reset)
- Increase `--auth-register-width` to 900px (register)
- Add `--auth-wide-width: 1000px` for very large screens
- Add new breakpoint `@media (min-width: 1200px)`

### 2.2 Login Page
- Use wider container (up to 480px)
- Keep centered, compact but comfortable
- Match label/input styling to register page

### 2.3 Coach Register — Major Restructure
- **Remove fieldsets from grid flow** — use CSS Grid on form directly with named areas
- **Named grid areas** for semantic grouping:
  - `name-row`: first | middle | last (3-col at ≥900px, 2-col at ≥560px)
  - `contact-row`: email | contact (2-col at ≥560px)
  - `credentials`: password (full width, spans 2)
  - `professional`: school | sports (2-col at ≥900px)
  - `optional`: ID photo (full width)
- **Sports grid fix**: Use `grid-template-columns: repeat(auto-fit, minmax(180px, 1fr))` with `justify-items: stretch` so items fill cells evenly; add `text-overflow: ellipsis` for long names
- **Consistent field heights**: All inputs 48px; PasswordInput matches
- **Visual section headers**: Use `<h3>` with accent color instead of fieldset legends

### 2.4 Reset Password
- Use `.register-box` container (wider, up to 760px)
- Two PasswordInputs side-by-side at ≥560px
- Strength meter inline or collapsible

### 2.5 Shared Styles
- Consistent input height: 48px (`var(--space-12)` equivalent)
- Consistent label style: muted, 13px, 700 weight, block, 6px gap
- Consistent spacing: `--space-4` between fields, `--space-6` between sections
- Section headers: 14px, 700 weight, accent color, uppercase, letter-spacing

---

## Phase 5: Full System Scan
After auth fixes, run build + lint + manual route check for all features.

---

## Phase 6: Full Regression
- Login, register, reset password flows
- Sports selection saves correctly
- All other features work
- Theme unchanged
- Mobile responsive
- Console clean