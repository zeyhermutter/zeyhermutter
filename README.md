# ZeyherMutterOS

Zentrale Immobilienmaklerplattform für ZeyherMutter.

## Architektur

- React Router + TypeScript
- Cloudflare Workers / Static Assets
- Supabase PostgreSQL / Auth / Storage / Realtime
- BETA-first; Production nur nach ausdrücklicher Freigabe

## Isolation

Dieses Repository und seine Infrastruktur sind ausschließlich für ZeyherMutterOS bestimmt. SeasonCrew-Ressourcen dürfen niemals referenziert, verändert oder als Fallback verwendet werden.

## Environments

- `develop` → `BETA`: Cloudflare Worker `zeyhermutter` unter `https://zeyhermutter.playsony.workers.dev` + Supabase `zeyhermutteros-staging` (`zqhcxudpfwsfuokencvy`)
- `main` → `PROD`: Cloudflare Worker `zeyhermutter-production` unter `https://zeyhermutter-production.playsony.workers.dev` + Supabase `zeyhermutteros-production` (`vtmtxaaojbqqzwxkodye`)

## Befehle

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run check
pnpm run check:production
```

`pnpm run check` prüft BETA mit React-Router-Typgenerierung, strengem TypeScript,
Produktions-Build und Cloudflare-Deploy-Dry-Run. `pnpm run check:production`
prüft denselben Stand gegen die getrennte PROD-Konfiguration.

## Secrets

Keine Secrets committen. Publishable Keys und spätere Integrations-Secrets werden über Cloudflare-Konfiguration beziehungsweise lokale `.dev.vars` bereitgestellt.

## Betriebsdokumentation

- Senior Review: `docs/project/SENIOR_REVIEW_2026-08-31.md`
- Datenmodell: `docs/architecture/DATA_MODEL.md`
- Workflows: `docs/architecture/WORKFLOWS.md`
- Rollen/Rechte: `docs/architecture/PERMISSIONS.md`
- Produktions-Runbook: `docs/operations/PRODUCTION_RUNBOOK.md`
- Branch-/Umgebungsmodell: `docs/operations/ENVIRONMENTS.md`
