# ZeyherMutterOS – Branch- und Umgebungsmodell

Stand: 31.08.2026

## Verbindliche Zuordnung

| Git | Umgebung | Cloudflare | Supabase | Deployment |
|---|---|---|---|---|
| Feature-Branch | kurzlebige Prüfung | kein permanenter Worker | optionaler Preview-Branch | Pull Request gegen `develop` |
| `develop` | BETA | `zeyhermutter` | `zeyhermutteros-staging` (`zqhcxudpfwsfuokencvy`) | nach Quality Gate; Automatik erst nach Secret-Freigabe |
| `main` | PROD | `zeyhermutter-production` (vorbereitet, nicht deployed) | `zeyhermutteros-production` (`vtmtxaaojbqqzwxkodye`) | ausschließlich manuell aus geschützter GitHub-Environment |

`develop` ist der BETA-/Development-Branch. Ein zusätzlicher `beta`-Branch wird bewusst nicht gepflegt, damit keine zwei konkurrierenden Integrationslinien entstehen.

## Promotion

1. Feature-Branch von `develop` erstellen.
2. Pull Request nach `develop`; beide Quality-Gate-Matrizen (`beta`, `production`) müssen grün sein.
3. BETA-Deployment und fachliche Abnahme durchführen.
4. Release-PR ausschließlich von `develop` nach `main`.
5. PROD nach Merge über den manuellen Workflow `Deploy PROD` und die GitHub-Environment `production` freigeben.

Direkte fachliche Entwicklung auf `main` ist nicht vorgesehen. Hotfixes starten von `main`, werden nach PROD zusätzlich zurück nach `develop` gemerged.

## Cloudflare

Die Vite-Integration wählt die Umgebung beim Build über `CLOUDFLARE_ENV`. Der erzeugte `build/server/wrangler.json` ist bereits auf genau eine Umgebung reduziert; ein nachträgliches `--env` beim Deploy hat deshalb keine Wirkung.

- `pnpm run check:beta` / `pnpm run deploy:beta`
- `pnpm run check:production`
- `DEPLOY_PRODUCTION=YES pnpm run deploy:production` nur auf sauberem `main`

Der PROD-Guard blockiert Platzhalter, falschen Branch, uncommittete Änderungen und fehlende Freigabe. Der uneindeutige Befehl `pnpm run deploy` bricht absichtlich ab.

## GitHub Actions

Benötigte GitHub-Environments:

- `beta`
- `production`; ein erforderlicher zweiter Reviewer wird vor der ersten Aktivierung eingerichtet

Benötigte Environment-Secrets in beiden Umgebungen:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

Das Repository-Variable `CLOUDFLARE_DEPLOY_ENABLED=true` aktiviert das automatische BETA-Deployment. Ohne diese Variable wird der Deploy-Job sicher übersprungen; das Quality Gate läuft trotzdem.

Solange nur ein GitHub-Verantwortlicher vorhanden ist, bleibt PROD zusätzlich durch den manuellen Workflow, die Bestätigungsphrase, den `main`-Branch und den lokalen Deploy-Guard geschützt. Eine Reviewer-Regel darf nicht so eingerichtet werden, dass der einzige Verantwortliche sich selbst aussperrt.

## Supabase

Das bisherige STAGING-Projekt wird als BETA verwendet. PROD ist als eigenes Projekt `zeyhermutteros-production` (`vtmtxaaojbqqzwxkodye`) in `eu-central-1` angelegt und teilt weder Datenbank noch Storage mit BETA. Die 73 versionierten Migrationen und `generate-property-expose` sind ausgerollt; `website-inquiry` bleibt bis zur ausdrücklichen Freigabe des anonymen PII-Endpunkts deaktiviert.

Supabase Preview-Branches sind datenlos und eignen sich für Pull Requests. Ein persistenter Branch verursacht eigene Nutzungskosten; vor seiner Anlage ist eine Kostenbestätigung erforderlich. Neue Tabellen benötigen weiterhin explizite Data-API-Grants und RLS.

Die PROD-Ref steht in `supabase/config.toml`; URL, Publishable Key und vorbereitete `workers.dev`-Adresse stehen in `wrangler.json`. Publishable Keys sind für Client-Nutzung vorgesehen; Service-Role-Key und sonstige Secrets werden niemals committed.
