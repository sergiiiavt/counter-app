import AuthenticationServices
import SwiftUI

struct ContentView: View {
    @StateObject private var store = WaterStore(source: "iphone")
    @StateObject private var auth = AuthStore()
    @State private var customAmount = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 22) {
                    summary
                    quickAdd
                    customAdd
                    if store.requiresAuthentication || !auth.isSignedIn {
                        authentication
                    }
                    history
                }
                .padding()
            }
            .navigationTitle("Water")
            .refreshable { await store.load() }
            .task(id: auth.isSignedIn) { await store.load() }
        }
    }

    private var summary: some View {
        VStack(spacing: 8) {
            Text("\(Int(store.total.rounded())) ml")
                .font(.system(size: 48, weight: .bold, design: .rounded))
                .contentTransition(.numericText())
            Text("of \(Int(store.dailyGoal.rounded())) ml today")
                .foregroundStyle(.secondary)
            ProgressView(value: min(store.total, store.dailyGoal), total: max(store.dailyGoal, 1))
        }
        .frame(maxWidth: .infinity)
        .padding(22)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 22))
    }

    private var quickAdd: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Quick add").font(.headline)
            HStack(spacing: 10) {
                ForEach([100, 250, 500], id: \.self) { amount in
                    Button("+\(amount)") {
                        Task { await store.add(amount: Double(amount)) }
                    }
                    .buttonStyle(.borderedProminent)
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    private var customAdd: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Custom amount").font(.headline)
            HStack {
                TextField("350", text: $customAmount)
                    .keyboardType(.numberPad)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityLabel("Water amount in milliliters")
                Text("ml").foregroundStyle(.secondary)
                Button("Add") {
                    guard let amount = Double(customAmount) else {
                        store.statusMessage = "Enter a number."
                        return
                    }
                    customAmount = ""
                    Task { await store.add(amount: amount) }
                }
                .buttonStyle(.borderedProminent)
            }
            Text("You can use iPhone keyboard dictation for the amount.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let status = store.statusMessage {
                Text(status).font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var authentication: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(auth.isSignedIn ? "Signed in" : "Keep your data private")
                .font(.headline)
            if !auth.isSignedIn {
                Text("The current server still permits shared demo access. Sign in with Apple creates your private account and session.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                SignInWithAppleButton(.signIn) { request in
                    request.requestedScopes = [.email]
                } onCompletion: { result in
                    auth.handleAuthorization(result)
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 48)
            } else {
                Button("Sign out", role: .destructive) {
                    Task { await auth.signOut() }
                }
            }
            if let error = auth.errorMessage {
                Text(error).font(.caption).foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 18))
    }

    private var history: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Today").font(.headline)
            if store.entries.isEmpty {
                Text("No water logged yet.")
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 20)
            } else {
                ForEach(store.entries) { entry in
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("+\(Int(entry.amount.rounded())) ml").fontWeight(.semibold)
                            Text(entry.isPending ? "Waiting to sync" : displayTime(from: entry.occurredAt))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Undo") {
                            Task { await store.undo(entry) }
                        }
                    }
                    Divider()
                }
            }
        }
    }
}
