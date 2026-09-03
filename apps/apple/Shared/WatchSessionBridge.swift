import Foundation
import WatchConnectivity

extension Notification.Name {
    static let counterSessionDidChange = Notification.Name("counterSessionDidChange")
}

final class WatchSessionBridge: NSObject, WCSessionDelegate {
    static let shared = WatchSessionBridge()

    private override init() {
        super.init()
    }

    func activate() {
        guard WCSession.isSupported() else { return }
        let session = WCSession.default
        session.delegate = self
        session.activate()
    }

    #if os(iOS)
    func sendSessionToken(_ token: String?) {
        guard WCSession.isSupported() else { return }
        do {
            try WCSession.default.updateApplicationContext(["sessionToken": token ?? ""])
        } catch {
            // The next activation or sign-in will retry.
        }
    }
    #endif

    func session(
        _ session: WCSession,
        activationDidCompleteWith activationState: WCSessionActivationState,
        error: Error?
    ) {
        #if os(iOS)
        if activationState == .activated {
            sendSessionToken(SessionStore.shared.token)
        }
        #endif
    }

    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        #if os(watchOS)
        let token = applicationContext["sessionToken"] as? String
        SessionStore.shared.token = (token?.isEmpty == false) ? token : nil
        NotificationCenter.default.post(name: .counterSessionDidChange, object: nil)
        #endif
    }

    #if os(iOS)
    func sessionDidBecomeInactive(_ session: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
    #endif
}
