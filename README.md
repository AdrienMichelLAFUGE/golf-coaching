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
