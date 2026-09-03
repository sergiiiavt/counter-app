import Combine
import Foundation

@MainActor
final class WaterStore: ObservableObject {
    @Published private(set) var total: Double = 0
    @Published private(set) var entries: [DisplayWaterEntry] = []
    @Published private(set) var dailyGoal: Double = 2000
    @Published private(set) var isLoading = false
    @Published private(set) var requiresAuthentication = false
    @Published var statusMessage: String?

    private let source: String
    private var serverTotal: Double = 0
    private var serverEntries: [CounterEntry] = []

    init(source: String) {
        self.source = source
    }

    func load() async {
        isLoading = true
        defer { isLoading = false }

        await syncPending()
        await refreshServerState()
        await mergePending()
    }

    func add(amount: Double) async {
        guard amount.isFinite, amount > 0, amount <= 10_000 else {
            statusMessage = "Enter an amount from 1 to 10,000 ml."
            return
        }

        let pending = PendingWaterEntry(
            id: UUID().uuidString,
            amount: amount,
            occurredAt: currentISO8601String(),
            localDate: currentLocalDateString(),
            source: source
        )
        await PendingEntryQueue.shared.append(pending)
        statusMessage = "Saved. Syncing…"
        await mergePending()
        await syncPending()
        await refreshServerState()
        await mergePending()
    }

    func undo(_ entry: DisplayWaterEntry) async {
        if await PendingEntryQueue.shared.contains(id: entry.id) {
            await PendingEntryQueue.shared.remove(id: entry.id)
            statusMessage = "Entry removed."
            await mergePending()
            return
        }

        do {
            try await CounterAPI.shared.deleteEntry(id: entry.id)
            statusMessage = "Entry removed."
            await refreshServerState()
            await mergePending()
        } catch CounterAPI.APIError.unauthorized {
            requiresAuthentication = true
            statusMessage = "Sign in on iPhone to continue."
        } catch {
            statusMessage = error.localizedDescription
        }
    }

    private func syncPending() async {
        let pending = await PendingEntryQueue.shared.all()
        guard !pending.isEmpty else { return }

        for entry in pending {
            do {
                _ = try await CounterAPI.shared.createEntry(entry)
                await PendingEntryQueue.shared.remove(id: entry.id)
                requiresAuthentication = false
            } catch CounterAPI.APIError.unauthorized {
                requiresAuthentication = true
                statusMessage = "Saved offline. Sign in to sync."
                return
            } catch {
                statusMessage = "Saved offline. Will retry automatically."
                return
            }
        }
        statusMessage = nil
    }

    private func refreshServerState() async {
        do {
            let today = currentLocalDateString()
            async let countersTask = CounterAPI.shared.counters()
            async let dailyTask = CounterAPI.shared.daily(date: today)
            async let entriesTask = CounterAPI.shared.entries(date: today)
            let (counterResponse, daily, entryResponse) = try await (countersTask, dailyTask, entriesTask)

            if let water = counterResponse.counters.first(where: { $0.id == "water" }),
               let goal = water.dailyGoal {
                dailyGoal = goal
            }
            serverTotal = daily.total
            serverEntries = entryResponse.entries
            requiresAuthentication = false
        } catch CounterAPI.APIError.unauthorized {
            requiresAuthentication = true
        } catch {
            if statusMessage == nil {
                statusMessage = "Offline. Showing locally saved changes."
            }
        }
    }

    private func mergePending() async {
        let today = currentLocalDateString()
        let pending = await PendingEntryQueue.shared.all().filter { $0.localDate == today }
        let pendingIds = Set(pending.map(\.id))

        let server = serverEntries
            .filter { !pendingIds.contains($0.id) }
            .map {
                DisplayWaterEntry(
                    id: $0.id,
                    amount: $0.amount,
                    occurredAt: $0.occurredAt,
                    source: $0.source,
                    isPending: false
                )
            }
        let local = pending.map {
            DisplayWaterEntry(
                id: $0.id,
                amount: $0.amount,
                occurredAt: $0.occurredAt,
                source: $0.source,
                isPending: true
            )
        }

        total = serverTotal + pending.reduce(0) { $0 + $1.amount }
        entries = (server + local).sorted { $0.occurredAt > $1.occurredAt }
    }
}
