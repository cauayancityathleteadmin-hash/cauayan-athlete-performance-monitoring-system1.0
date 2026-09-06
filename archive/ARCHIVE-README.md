# Archive — Legacy / Offline Systems (Do Not Deploy)

This folder holds every version of the system that is **no longer in production**.
Nothing here is deployed, maintained, or required by the live application.

- **Live system:** `../next-app/` (the only deploy source).
- **Archive policy:** read-only reference. Do not run, modify, or push changes to
  archived code and data. If a file here is ever needed again, bring a copy forward
  into `next-app/`, never edit it in place.

## Contents

| Path | What it is | How to run offline (if ever needed) |
| --- | --- | --- |
| `php-legacy/` | The original PHP web application (login, coach/admin dashboards, athlete & event tracking, MySQL `database/schema.sql`). Superseded by `next-app/`. | Needs PHP and MySQL. Import `php-legacy/database/schema.sql`, set credentials in `includes/config.php`, serve the folder with a web server. |
| `nextjs-upgraded-v1/` | An early Next.js rewrite attempt, superseded by `next-app/`. Kept for reference only. | `npm install` + `npm run dev` (requires its own env + Prisma-managed DB). |
| `original-system.zip` | A compressed master copy of the original PHP project, **including its original `.git` history**. This is the ultimate fallback backup. | Extract anywhere; not connected to this repository. |

## Why this folder exists

- Keeps the repository root clean and unambiguous: one active application (`next-app/`)
  plus one clearly labelled archive.
- Preserves the complete history of the project without deleting anything.
- Moves are pure renames in git, so history for every archived file is intact.