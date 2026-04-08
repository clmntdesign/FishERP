# Fish ERP Workspace

## Structure

- `web/` - Next.js application
- `supabase/` - Database migrations and seed data
- `docs/` - Build notes and MVP specifications
- `scripts/` - One-off tools (historical migration scaffolding)

## Quick Start

1. Install dependencies

```bash
cd "web"
npm install
```

2. Run app

```bash
npm run dev
```

3. (Optional) Link and push Supabase schema

```bash
supabase link --project-ref iglzkacsbpekmwerbcef
supabase db push
```
