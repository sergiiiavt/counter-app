import AuthenticationServices
import Combine
import Foundation

@MainActor
final class AuthStore: ObservableObject {
    @Published private(set) var isSignedIn = SessionStore.shared.token != nil
    @Published var errorMessage: String?

    func handleAuthorization(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case let .failure(error):
            errorMessage = error.localizedDescription
        case let .success(authorization):
            guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = credential.identityToken,
                  let identityToken = String(data: tokenData, encoding: .utf8) else {
                errorMessage = "Apple did not return an identity token."
                return
            }

            Task {
                do {
                    let session = try await CounterAPI.shared.exchangeAppleIdentityToken(identityToken)
                    SessionStore.shared.token = session.token
                    WatchSessionBridge.shared.sendSessionToken(session.token)
                    isSignedIn = true
                    errorMessage = nil
                } catch {
                    errorMessage = error.localizedDescription
                }
            }
        }
    }

    func signOut() async {
        if SessionStore.shared.token != nil {
            try? await CounterAPI.shared.logout()
        }
        SessionStore.shared.token = nil
        WatchSessionBridge.shared.sendSessionToken(nil)
        isSignedIn = false
    }
}
