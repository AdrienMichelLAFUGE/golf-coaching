# Smoke E2E: workspace switch

Objectif: verifier le switch de workspace (perso -> org -> perso).

Prerequis

- Une instance accessible (local dev, preview ou staging).
- Un utilisateur coach de test membre d'une organisation de test.

Variables d'environnement

- `E2E_BASE_URL` (ex: `http://localhost:3000`)
- `E2E_USER_EMAIL`
- `E2E_USER_PASSWORD`
- `E2E_ORG_NAME` (nom exact de l'organisation a selectionner)

Installation Playwright (une fois)

```
npx playwright install
```

Lancer le test

```
npm run e2e
```

Mode UI (debug)

```
npm run e2e:ui
```

## Test visuel Smart2Move: overlay impact

Le test `e2e/smart2move-impact-overlay.spec.ts` valide que la fin de la zone
`Transition -> Impact` est alignee sur la ligne d'impact detectee, et attache une
capture preview dans les artefacts Playwright.
