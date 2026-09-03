import Foundation

actor PendingEntryQueue {
    static let shared = PendingEntryQueue()

    private let storageKey = "counter-app.pending-water-entries.v1"
    private var entries: [PendingWaterEntry]

    private init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode([PendingWaterEntry].self, from: data) {
            entries = decoded
        } else {
            entries = []
        }
    }

    func all() -> [PendingWaterEntry] {
        entries
    }

    func append(_ entry: PendingWaterEntry) {
        guard !entries.contains(where: { $0.id == entry.id }) else { return }
        entries.append(entry)
        persist()
    }

    func remove(id: String) {
        entries.removeAll { $0.id == id }
        persist()
    }

    func contains(id: String) -> Bool {
        entries.contains { $0.id == id }
    }

    private func persist() {
        guard let data = try? JSONEncoder().encode(entries) else { return }
        UserDefaults.standard.set(data, forKey: storageKey)
    }
}
