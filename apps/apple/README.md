# Apple clients

The iPhone and Apple Watch applications will be separate clients of the same Counter API.

Planned first native slice:

- SwiftUI iPhone app
- SwiftUI watchOS app
- shared `Counter` / `CounterEntry` models
- local optimistic entry storage
- background sync to `/api/entries`
- App Intent for "Log water"
- cloud macOS build in GitHub Actions
- TestFlight delivery (no personally owned Mac required)

The Apple targets are intentionally not generated in the first backend/web commit.
The next milestone will add the Xcode project generation/build pipeline after the API is deployed.
