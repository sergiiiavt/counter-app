import Foundation

final class CounterAPI {
    static let shared = CounterAPI()

    let baseURL = URL(string: "https://counter-app.gimmejob.workers.dev")!

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {}

    enum APIError: LocalizedError {
        case invalidResponse
        case unauthorized
        case server(status: Int, message: String)

        var errorDescription: String? {
            switch self {
            case .invalidResponse:
                return "The server returned an invalid response."
            case .unauthorized:
                return "Sign in is required."
            case let .server(_, message):
                return message
            }
        }
    }

    func me() async throws -> MeResponse {
        try await request(path: "/api/me")
    }

    func counters() async throws -> CounterListResponse {
        try await request(path: "/api/counters")
    }

    func daily(date: String) async throws -> DailySummary {
        try await request(path: "/api/daily?counterId=water&date=\(urlEncode(date))")
    }

    func entries(date: String) async throws -> EntryListResponse {
        try await request(path: "/api/entries?counterId=water&date=\(urlEncode(date))")
    }

    func createEntry(_ pending: PendingWaterEntry) async throws -> CreateEntryResponse {
        struct Body: Encodable {
            let id: String
            let counterId: String
            let amount: Double
            let occurredAt: String
            let localDate: String
            let source: String
        }

        let body = Body(
            id: pending.id,
            counterId: "water",
            amount: pending.amount,
            occurredAt: pending.occurredAt,
            localDate: pending.localDate,
            source: pending.source
        )
        return try await request(path: "/api/entries", method: "POST", body: encoder.encode(body))
    }

    func deleteEntry(id: String) async throws {
        struct DeletedResponse: Decodable { let deleted: Bool }
        let _: DeletedResponse = try await request(
            path: "/api/entries/\(urlEncode(id))",
            method: "DELETE"
        )
    }

    func exchangeAppleIdentityToken(_ identityToken: String) async throws -> SessionPayload {
        struct Body: Encodable { let identityToken: String }
        let envelope: AppleSessionEnvelope = try await request(
            path: "/api/auth/apple",
            method: "POST",
            body: encoder.encode(Body(identityToken: identityToken)),
            includeSession: false
        )
        return envelope.session
    }

    func logout() async throws {
        struct LogoutResponse: Decodable { let loggedOut: Bool }
        let _: LogoutResponse = try await request(path: "/api/auth/logout", method: "POST")
    }

    private func request<T: Decodable>(
        path: String,
        method: String = "GET",
        body: Data? = nil,
        includeSession: Bool = true
    ) async throws -> T {
        guard let url = URL(string: path, relativeTo: baseURL) else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.httpBody = body
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if includeSession, let token = SessionStore.shared.token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        if http.statusCode == 401 { throw APIError.unauthorized }
        guard (200..<300).contains(http.statusCode) else {
            let payload = try? decoder.decode(APIErrorPayload.self, from: data)
            throw APIError.server(
                status: http.statusCode,
                message: payload?.message ?? payload?.error ?? "Request failed (\(http.statusCode))."
            )
        }
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.invalidResponse
        }
    }

    private func urlEncode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? value
    }
}
