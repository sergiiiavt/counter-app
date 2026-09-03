# Counter App

Independent counter application. V1 exposes one counter: **Water**.

The storage/API model is intentionally generic so future counters can be added without redesigning the backend.

## Architecture

```text
Web ────────────┐
iPhone ─────────┼── Cloudflare Worker ── D1
Apple Watch ────┘
```

The Worker also serves the static web app, so the current version does not need a separate Cloudflare Pages project.

Production: `https://counter-app.gimmejob.workers.dev`

## Implemented

### Backend and web

- independent GitHub repository and Cloudflare resources
- generic `counters` table
- generic append-only `counter_entries` table
- default Water counter
- daily sum
- idempotent entry creation using client-generated UUIDs
- entry history and Undo
- responsive web UI
- Cloudflare Worker + static assets
- D1 migrations
- GitHub CI and automatic Cloudflare deployment
- server-side verification of Sign in with Apple identity tokens
- hashed application sessions with expiration and revocation
- logout and account deletion endpoints
- shared web demo clearly labeled as demo data

### iPhone

- native SwiftUI app
- today's Water total and goal
- +100 / +250 / +500 quick-add actions
- custom amount
- history and Undo
- offline queue with safe retry
- Sign in with Apple UI and backend token exchange
- Counter session stored in Keychain
- WatchConnectivity session transfer to the paired Apple Watch

### Apple Watch

- native SwiftUI watchOS app
- today's Water total
- +100 / +250 / +500 quick-add actions
- custom amount through watchOS text input/dictation
- latest-entry Undo
- offline queue and later synchronization
- session received from the paired iPhone and stored in Keychain

### Apple cloud build

`apps/apple/project.yml` defines the native project with XcodeGen. GitHub Actions uses a hosted macOS runner to generate the Xcode project and compile both the iPhone and Watch simulator targets. No personally owned Mac is required for this build stage.

## API

### `GET /api/health`

Health check.

### `GET /api/me`

Returns the current authentication mode.

### `POST /api/auth/apple`

Exchanges a valid Apple identity token for a Counter App session token.

### `POST /api/auth/logout`

Revokes the current Counter App session.

### `DELETE /api/account`

Deletes the authenticated user's Counter App data and sessions.

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
  "occurredAt": "2026-09-03T14:00:00.000Z",
  "localDate": "2026-09-03",
  "source": "iphone"
}
```

### `DELETE /api/entries/:id`

Removes an entry. This powers Undo.

## Authentication and current demo mode

The backend supports private authenticated Apple users now. A native Apple identity token is verified server-side against Apple's signing keys, and the Worker returns a random Counter App session token. Only the SHA-256 hash of that session token is stored in D1.

`DEMO_MODE=true` is still intentionally enabled for the website. Requests without an app session use `demo-user`; requests with a valid Counter App bearer session use that private user instead.

This lets the public website remain testable while the Apple Developer identifiers and signing setup are completed. The website visibly warns that demo data is shared and should not contain personal information.

## Cloudflare

This project uses resources completely separate from Gimme Job:

- Worker: `counter-app`
- D1 database: `counter-app-db`
- separate GitHub Actions deployment
- separate D1 migrations

Production deployment automatically applies pending D1 migrations before deploying the Worker and web assets.

## Apple identifiers

The native project currently uses:

- iOS: `com.sergiiiavt.counterapp`
- watchOS: `com.sergiiiavt.counterapp.watchkitapp`

Before a signed device/TestFlight build, these identifiers must exist in the Apple Developer account and the iOS App ID must have **Sign in with Apple** enabled.

## Local development

```bash
npm install
npx wrangler d1 migrations apply DB --local
npm run dev
```

Native project generation on macOS is optional because CI already performs it:

```bash
brew install xcodegen
cd apps/apple
xcodegen generate
```

## Current status

- backend CI: passing
- authentication tests: passing
- Cloudflare deployment: passing
- D1 auth migration: deployed
- iPhone simulator build: passing
- Watch simulator build: passing
- production Worker/web: deployed

## Next milestone

1. Register the iOS and watchOS bundle IDs in the Apple Developer account.
2. Enable Sign in with Apple for the iOS App ID.
3. Create the App Store Connect app record.
4. Configure signing/App Store Connect credentials for GitHub Actions.
5. Produce the first signed archive and upload it to TestFlight.
6. Install and test on the physical iPhone and Apple Watch.
7. After native authentication is verified, add private Sign in with Apple to the website and disable shared demo mode.
