import Foundation

struct CounterDefinition: Codable, Identifiable, Sendable {
    let id: String
    let name: String
    let unit: String
    let aggregation: String
    let dailyGoal: Double?
    let presets: [Double]
}

struct CounterListResponse: Codable, Sendable {
    let counters: [CounterDefinition]
}

struct DailySummary: Codable, Sendable {
    let counterId: String
    let date: String
    let total: Double
    let entryCount: Int
}

struct CounterEntry: Codable, Identifiable, Sendable {
    let id: String
    let counterId: String
    let amount: Double
    let occurredAt: String
    let localDate: String
    let source: String
}

struct EntryListResponse: Codable, Sendable {
    let entries: [CounterEntry]
}

struct CreateEntryResponse: Codable, Sendable {
    let entry: CounterEntry
    let daily: DailySummary
}

struct AppleSessionEnvelope: Codable, Sendable {
    let session: SessionPayload
}

struct SessionPayload: Codable, Sendable {
    let token: String
    let expiresAt: String
}

struct MeResponse: Codable, Sendable {
    let authenticated: Bool
    let authMode: String
}

struct APIErrorPayload: Codable, Sendable {
    let error: String?
    let message: String?
}

struct PendingWaterEntry: Codable, Identifiable, Sendable {
    let id: String
    let amount: Double
    let occurredAt: String
    let localDate: String
    let source: String
}

struct DisplayWaterEntry: Identifiable, Sendable {
    let id: String
    let amount: Double
    let occurredAt: String
    let source: String
    let isPending: Bool
}
