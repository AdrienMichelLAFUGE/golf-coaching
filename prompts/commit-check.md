# commit-check

Tu es Codex dans VS Code. Ta mission: preparer un commit "prod-ready" propre et sur, puis faire le commit git avec un message GENERE automatiquement a partir du contenu du commit.

INPUT

- Aucun. Le message de commit est genere automatiquement a partir des changements stagés.

REGLES

- Ne commite PAS tant que la qualite n est pas verte.
- Ne touche pas a l architecture "pour ameliorer". Seulement ce qui est necessaire pour securiser le changement.
- Pas de secrets en repo (Supabase / Vercel / tokens). Si tu detectes un secret: stop, retire-le, et propose une remediation.

CHECKLIST AVANT COMMIT (obligatoire)

1. Etat git

- Execute: git status, git diff
- Resume en 5 lignes: ce qui change + impact.

2. Qualite locale (priorite au script ci si present)

- Si "npm run ci" existe: execute-le.
- Sinon execute au minimum, dans cet ordre:
  - npm run lint
  - npm run typecheck
  - npm run test (si le script existe)
  - npm run build (Next) (si le script existe)
- Si un script format/format:check existe, execute-le (sinon ignore).
- Si un de ces checks echoue: corrige, relance, jusqu a vert.

3. Tests (habitude prod-ready)

- Si le changement modifie de la logique, une route API, une action server ou un composant important:
  - ajoute au moins 1 test cible (happy path + 1 edge case si simple)
- Si aucun framework de test n existe encore et que le changement est non-trivial:
  - ajoute le minimum pour permettre 1-2 tests (sans sur-outillage), puis relance les checks.

4. Securite & config (Next + Supabase + Vercel)

- Verifie qu aucun secret n est commite:
  - pas de SUPABASE_SERVICE_ROLE_KEY cote client
  - aucune cle/token en dur dans le code
  - .env.local non tracke
- Verifie que les env vars utilisees sont documentees:
  - mets a jour .env.example et/ou README si tu ajoutes/modifies une env
- Verifie import server/client Supabase:
  - server-only helpers jamais importes dans du code "use client"

5. Staging du commit

- Fais un staging propre:
  - git add -p (ou staging manuel) pour eviter d embarquer du bruit
- N inclus pas: logs temporaires, fichiers de debug, changements non lies.

5bis) Generation du message de commit (obligatoire)

- Genere le message a partir du diff STAGE (git diff --cached).
- Format conseille: Conventional Commits (type(scope): resume).
- Choisis le type:
  - feat: nouvelle fonctionnalite
  - fix: correction de bug
  - docs: documentation
  - test: ajout/modif de tests
  - chore: outillage/CI/config
  - refactor: refacto sans changement de comportement
- Scope: dossier principal touche (ex: api, app, ci, supabase, prompt).
- Resume: 50-72 caracteres, present, concis, sans point final.
- Si le diff touche plusieurs zones, priorise l impact principal; le reste va dans un body optionnel.

6. Commit

- Cree le commit avec le message genere:
  - git commit -m "<MESSAGE_AUTO>"
- Ne push PAS sauf si je le demande.

SORTIE ATTENDUE (a afficher a la fin)

- Checks executes + resultat (OK/KO)
- Fichiers inclus dans le commit
- Commande(s) a rejouer localement
- Message de commit genere
- Hash du commit (si commit realise)
