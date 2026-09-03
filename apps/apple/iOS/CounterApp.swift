import SwiftUI

@main
struct CounterApp: App {
    init() {
        WatchSessionBridge.shared.activate()
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
