# ZeyherMutterOS

Zentrale Immobilienmaklerplattform für ZeyherMutter.

## Architektur

- React Router + TypeScript
- Cloudflare Workers / Static Assets
- Supabase PostgreSQL / Auth / Storage / Realtime
- Staging-first; Production nur nach ausdrücklicher Freigabe

## Isolation

Dieses Repository und seine Infrastruktur sind ausschließlich für ZeyherMutterOS bestimmt. SeasonCrew-Ressourcen dürfen niemals referenziert, verändert oder als Fallback verwendet werden.

## Environments

- `STAGING`: Cloudflare Worker `zeyhermutter` unter `https://zeyhermutter.playsony.workers.dev` + Supabase `zeyhermutteros-staging` (`zqhcxudpfwsfuokencvy`)
- `PRODUCTION`: noch nicht eingerichtet; Anlage erst nach Kosten-/Organisationsfreigabe und Ausführung des Produktions-Runbooks

## Befehle

```bash
pnpm install --frozen-lockfile
pnpm run dev
pnpm run check
```

`pnpm run check` führt React-Router-Typgenerierung, striktes TypeScript,
Produktions-Build und einen Cloudflare-Deploy-Dry-Run aus.

## Secrets

Keine Secrets committen. Publishable Keys und spätere Integrations-Secrets werden über Cloudflare-Konfiguration beziehungsweise lokale `.dev.vars` bereitgestellt.

## Betriebsdokumentation

- Senior Review: `docs/project/SENIOR_REVIEW_2026-08-31.md`
- Datenmodell: `docs/architecture/DATA_MODEL.md`
- Workflows: `docs/architecture/WORKFLOWS.md`
- Rollen/Rechte: `docs/architecture/PERMISSIONS.md`
- Produktions-Runbook: `docs/operations/PRODUCTION_RUNBOOK.md`
