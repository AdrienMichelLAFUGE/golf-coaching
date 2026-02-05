# Golf Coaching

Plateforme de coaching golf (Next 16 App Router + TypeScript + Supabase).

## Node

Le repo cible Node 20 (`.nvmrc`). Configure la même version sur Vercel.

## Scripts

```bash
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run ci
```

## Database workflow

Principes :

- Toujours tester en staging d'abord.
- 1 changement = 1 migration (pas de modifs via SQL editor sans migration).
- Les migrations sont dans `supabase/migrations/`.
- La baseline est un schema-only exporte de PROD : ne pas reappliquer en PROD.

Variables requises :

- `DATABASE_URL_STAGING`
- `DATABASE_URL_PROD`

Creer une migration :

1. Ajouter un fichier SQL dans `supabase/migrations/` (ex: `20260203090000_add_workspaces.sql`).
2. Appliquer sur staging, valider, puis appliquer sur prod.

Appliquer une migration :

```bash
npm run db:staging:apply -- supabase/migrations/20260203090000_add_workspaces.sql
npm run db:prod:apply -- supabase/migrations/20260203090000_add_workspaces.sql
```

Prod-safe :

- Faire un backup et une review avant application.
- MCP/Codex ne doit jamais se connecter a PROD.

## Variables d’environnement (Vercel)

Configurer ces variables dans **Development / Preview / Production**.

Public (client + server) :

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_ADMIN_EMAILS` (optionnel, CSV d’emails admin)

Server-only :

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRO_PRICE_MONTH_ID`
- `STRIPE_PRO_PRICE_YEAR_ID`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`

Stripe (webhooks attendus) :

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

Notes Stripe :

- `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` doivent être absolues (ou relatives à `NEXT_PUBLIC_SITE_URL`).

## Workspaces & Org permissions

- Chaque utilisateur a un workspace personal et peut rejoindre 0..n orgs.
- Le workspace courant est stocke dans `profiles.org_id` et pilote l isolation des donnees.
- Roles org : `admin` (unique, premium requis) et `coach`.
- Freemium en org = lecture seule. Les ecritures sensibles sont revalidees cote serveur.
- Assignations (`student_assignments`) definissent qui peut publier. Les non assignes peuvent proposer.
- Les propositions (`org_proposals`) sont immuables apres soumission et l acceptation cree un nouveau contenu publie.
- Script RLS/migrations : `scripts/supabase-workspaces.sql` (a executer sur Supabase).
