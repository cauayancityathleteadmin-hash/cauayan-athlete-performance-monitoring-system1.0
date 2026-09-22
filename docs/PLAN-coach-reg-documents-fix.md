# Fix Coach Registration & Athlete Documents — Plan

## Problem Summary
1. **Coach registration requires ID photo upload** — coaches shouldn't be required to upload documents during registration
2. **Registration form layout is cramped/informal** — needs proper field grouping, consistent spacing, formal appearance
3. **Athlete documents** — ensure all required document types are available in the system and can be downloaded/printed

## Current State Analysis
- Coach registration (`/coach-register`) has a required 2x2 ID picture upload field
- Athlete documents are managed via `AthleteDocuments` component on athlete profile
- Document types are seeded: PSA Birth Certificate, School ID, Form 137, Form 138 (required), Medical Certificate, Consent Form, Barangay Certificate (optional), Other
- Download/print already implemented via `/api/athletes/[id]/documents/[documentId]` with `?inline=1`

## Plan

### Phase 1: Coach Registration — Remove Document Requirement & Formalize Layout
1. Make ID photo upload **optional** (not required) in coach registration
2. Restructure form with proper field groups:
   - Personal Information (name, birthdate, gender)
   - Contact Information (email, phone, address)
   - Professional Information (school, sports, coach code)
   - Credentials (password)
   - Optional: ID Photo (2x2)
3. Improve visual hierarchy: clear section headers, consistent spacing, formal typography
4. Ensure responsive grid works cleanly at all breakpoints

### Phase 2: Athlete Documents — Verify Completeness
1. Confirm all document types from seed are available and functional
2. Verify download/print works for all document types
2. Ensure checklist shows required vs optional clearly
3. Ensure admins/coaches can upload on behalf of athletes

### Phase 3: Testing & Verification
1. Build + lint pass
2. Manual test: coach registration flow (no document required)
3. Manual test: athlete document upload/download/print
4. Responsive check at 360px, 768px, 1024px, 1440px

---

## Execution Notes
- **Don't change theme** — only layout/formatting
- **Don't change logic** — only make ID photo optional, not required
- **Keep CSRF, captcha, validation intact**
- **Use existing tokens** (--space-*, --radius-*, --auth-*-width)
- **Formal appearance**: proper labels, consistent field heights, clear visual sections