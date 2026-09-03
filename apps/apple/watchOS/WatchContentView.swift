import SwiftUI

struct WatchContentView: View {
    @StateObject private var store = WaterStore(source: "watch")
    @State private var customAmount = ""

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                Text("Water")
                    .font(.headline)
                Text("\(Int(store.total.rounded())) ml")
                    .font(.system(.title2, design: .rounded, weight: .bold))

                ForEach([100, 250, 500], id: \.self) { amount in
                    Button("+\(amount) ml") {
                        Task { await store.add(amount: Double(amount)) }
                    }
                    .buttonStyle(.borderedProminent)
                }

                TextField("Other ml", text: $customAmount)
                    .multilineTextAlignment(.center)
                    .accessibilityHint("Use watchOS text input or dictation to enter milliliters")

                Button("Add other") {
                    guard let amount = Double(customAmount) else {
                        store.statusMessage = "Enter a number."
                        return
                    }
                    customAmount = ""
                    Task { await store.add(amount: amount) }
                }

                if store.requiresAuthentication {
                    Text("Open the iPhone app and sign in to sync.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else if let status = store.statusMessage {
                    Text(status)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                if let latest = store.entries.first {
                    Button("Undo +\(Int(latest.amount.rounded()))") {
                        Task { await store.undo(latest) }
                    }
                    .buttonStyle(.bordered)
                }
            }
            .padding(.horizontal, 4)
        }
        .task { await store.load() }
        .onReceive(NotificationCenter.default.publisher(for: .counterSessionDidChange)) { _ in
            Task { await store.load() }
        }
    }
}
