# Apple clients

Native SwiftUI clients for the Counter API.

## Current functionality

- iPhone: daily Water total, +100/+250/+500, custom amount, history, Undo
- Apple Watch: daily total, quick add, custom amount through watchOS text input/dictation, latest-entry Undo
- offline-first additions: client-generated UUIDs are queued locally and retried safely
- Sign in with Apple on iPhone
- the backend exchanges the Apple identity token for a Counter session; only the session token is stored on-device
- session token is stored in Keychain
- WatchConnectivity transfers the Counter session from paired iPhone to Watch
- both clients use `https://counter-app.gimmejob.workers.dev`

## Project generation

The Xcode project is generated from `project.yml` with XcodeGen. This keeps the project editable without owning a Mac.

```bash
brew install xcodegen
cd apps/apple
xcodegen generate
```

GitHub Actions generates and builds both targets on a hosted macOS runner.

## Apple account work still required before device/TestFlight use

The bundle IDs must be registered in the Apple Developer account:

- `com.sergiiiavt.counterapp`
- `com.sergiiiavt.counterapp.watchkitapp`

Enable **Sign in with Apple** for the iOS App ID. TestFlight signing/upload credentials are a later deployment step.
