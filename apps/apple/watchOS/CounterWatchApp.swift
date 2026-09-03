import SwiftUI

@main
struct CounterWatchApp: App {
    init() {
        WatchSessionBridge.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            WatchContentView()
        }
    }
}
