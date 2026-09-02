# Counter App

Independent counter application. V1 exposes one counter: **Water**.

The storage/API model is intentionally generic so future counters can be added without redesigning the backend.

## V1 architecture

```text
Web ───────────────┐
iPhone (next) ─────┼── Cloudflare Worker ── D1
Apple Watch (next) ┘
```

The Worker also serves the static web app, so V1 does not need a separate Cloudflare Pages project.

## Implemented

- independent GitHub repository
- generic `counters` table
- generic append-only `counter_entries` table
- default Water counter
- daily sum
- idempotent entry creation using client-generated IDs
- entry history
- delete/undo
- responsive web UI
- Cloudflare Worker + static assets
- D1 migration
- GitHub CI
- Cloudflare deployment workflow with a safety guard

## API

### `GET /api/health`

Health check.

### `GET /api/counters`

Returns the user's counters.

### `GET /api/daily?counterId=water&date=YYYY-MM-DD`

Returns the daily aggregate.

### `GET /api/entries?counterId=water&date=YYYY-MM-DD`

Returns up to 100 entries for that day.

### `POST /api/entries`

```json
{
  "id": "client-generated-uuid",
  "counterId": "water",
  "amount": 250,
  "occurredAt": "2026-09-02T18:00:00.000Z",
  "localDate": "2026-09-02",
  "source": "web"
}
```

### `DELETE /api/entries/:id`

Removes an entry. This powers Undo.

## Security state

`DEMO_MODE=true` is intentionally enabled for the first development slice. In demo mode all requests use `demo-user`.

This is **not production authentication** and must be disabled before real user data is stored.

The next security milestone is Sign in with Apple for web/iOS plus server-side token validation and a real user ID.

## Cloudflare setup

This project must use its own Cloudflare resources, separate from Gimme Job:

- Worker: `counter-app`
- D1 database: `counter-app-db`
- separate secrets
- separate deployment

The deploy workflow intentionally refuses to deploy while `wrangler.jsonc` contains `REPLACE_WITH_D1_DATABASE_ID`. This prevents accidental deployment against an unrelated database.

After creating `counter-app-db`, replace that placeholder with its database ID.

Add these GitHub repository secrets:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The deploy workflow applies migrations first and then deploys the Worker and website.

## Local development

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

## Current status

GitHub CI passes. Cloudflare deployment is intentionally blocked until the project's own D1 ID and Cloudflare repository secrets are configured.

## Next milestone

1. Create the independent Cloudflare D1 database `counter-app-db`.
2. Configure Cloudflare credentials in this repository.
3. Deploy and smoke-test the web/API slice.
4. Add Sign in with Apple.
5. Add native iPhone app.
6. Add watchOS app.
7. Add cloud macOS CI → TestFlight.
