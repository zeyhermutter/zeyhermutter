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

- `STAGING`: Cloudflare Worker `zeyhermutteros-app-staging` + Supabase `zeyhermutteros-staging`
- `PRODUCTION`: wird erst nach ausdrücklicher Freigabe eingerichtet

## Befehle

```bash
npm install
npm run dev
npm run check
```

## Secrets

Keine Secrets committen. Publishable Keys und spätere Integrations-Secrets werden über Cloudflare-Konfiguration beziehungsweise lokale `.dev.vars` bereitgestellt.
