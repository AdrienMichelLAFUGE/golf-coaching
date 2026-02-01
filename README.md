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

## Workspaces & Org permissions

- Chaque utilisateur a un workspace personal et peut rejoindre 0..n orgs.
- Le workspace courant est stocke dans `profiles.org_id` et pilote l isolation des donnees.
- Roles org : `admin` (unique, premium requis) et `coach`.
- Freemium en org = lecture seule. Les ecritures sensibles sont revalidees cote serveur.
- Assignations (`student_assignments`) definissent qui peut publier. Les non assignes peuvent proposer.
- Les propositions (`org_proposals`) sont immuables apres soumission et l acceptation cree un nouveau contenu publie.
- Script RLS/migrations : `scripts/supabase-workspaces.sql` (a executer sur Supabase).
