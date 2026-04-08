# Fish ERP Web

Korean-first, bilingual-ready web app for OFECO seafood import operations.

## Stack

- Next.js (App Router)
- TypeScript
- Tailwind CSS v4
- Supabase (DB/Auth)

## Local Setup

1. Install dependencies

```bash
npm install
```

2. Create env file

```bash
cp .env.example .env.local
```

3. Start dev server

```bash
npm run dev
```

## Routes (MVP shell)

- `/dashboard`
- `/shipments`
- `/inventory`
- `/sales`
- `/payables`
- `/master-data`

## Notes

- UI is Korean-primary with English support labels.
- Mobile responsiveness is built into the initial shell.
- Database schema and migration files are managed in `../supabase`.
