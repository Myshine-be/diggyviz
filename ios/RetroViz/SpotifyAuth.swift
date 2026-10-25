import Foundation
import AuthenticationServices
import CryptoKit
import UIKit

/// Spotify login with Authorization Code + PKCE (no server, no client secret).
///
/// Spotify only accepts https redirect URIs, so the redirect goes to the RetroViz
/// web page on GitHub Pages. That page sees `state=ios.…` and immediately forwards
/// to `retroviz://callback?…`, which ASWebAuthenticationSession catches.
@MainActor
final class SpotifyAuth: ObservableObject {
    @Published var clientID: String {
        didSet { UserDefaults.standard.set(clientID, forKey: "clientID") }
    }
    @Published var redirectURI: String {
        didSet { UserDefaults.standard.set(redirectURI, forKey: "redirectURI") }
    }
    @Published private(set) var isLoggedIn: Bool
    @Published var message: String?

    private var accessToken: String?
    private var expiry = Date.distantPast
    private var refreshToken: String? {
        get { UserDefaults.standard.string(forKey: "refreshToken") }
        set { UserDefaults.standard.set(newValue, forKey: "refreshToken") }
    }
    private var session: ASWebAuthenticationSession?
    private let anchor = AuthAnchor()

    static let scopes = "user-read-currently-playing user-read-playback-state"

    init() {
        let d = UserDefaults.standard
        clientID = d.string(forKey: "clientID") ?? ""
        redirectURI = d.string(forKey: "redirectURI") ?? "https://myshine-be.github.io/diggyviz/"
        isLoggedIn = d.string(forKey: "refreshToken") != nil
    }

    // MARK: login

    func login() {
        let cid = clientID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard cid.count == 32 else { message = "Client ID moet 32 tekens zijn."; return }
        guard redirectURI.hasPrefix("https://") else { message = "Redirect URI moet met https:// beginnen."; return }

        let verifier = Self.randomString(64)
        let challenge = Self.base64url(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = "ios." + Self.randomString(16)

        var c = URLComponents(string: "https://accounts.spotify.com/authorize")!
        c.queryItems = [
            .init(name: "response_type", value: "code"),
            .init(name: "client_id", value: cid),
            .init(name: "scope", value: Self.scopes),
            .init(name: "redirect_uri", value: redirectURI),
            .init(name: "code_challenge_method", value: "S256"),
            .init(name: "code_challenge", value: challenge),
            .init(name: "state", value: state),
        ]

        let s = ASWebAuthenticationSession(url: c.url!, callbackURLScheme: "retroviz") { [weak self] url, error in
            Task { @MainActor in
                await self?.handleCallback(url: url, error: error, verifier: verifier, state: state)
            }
        }
        s.presentationContextProvider = anchor
        s.prefersEphemeralWebBrowserSession = false
        session = s
        if !s.start() { message = "Kon het Spotify-loginscherm niet openen." }
    }

    private func handleCallback(url: URL?, error: Error?, verifier: String, state: String) async {
        session = nil
        if let error {
            if (error as? ASWebAuthenticationSessionError)?.code == .canceledLogin { message = "Inloggen geannuleerd." }
            else { message = "Inloggen mislukt: \(error.localizedDescription)" }
            return
        }
        guard let url, let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems else {
            message = "Geen antwoord van Spotify."; return
        }
        if let err = items.first(where: { $0.name == "error" })?.value { message = "Spotify weigerde: \(err)"; return }
        guard items.first(where: { $0.name == "state" })?.value == state else { message = "Ongeldige login-status, probeer opnieuw."; return }
        guard let code = items.first(where: { $0.name == "code" })?.value else { message = "Geen code ontvangen."; return }
        do {
            try await requestToken([
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirectURI,
                "client_id": clientID,
                "code_verifier": verifier,
            ])
            message = "Gekoppeld met Spotify."
        } catch {
            message = "Token ophalen mislukt: \(error.localizedDescription)"
        }
    }

    func logout() {
        refreshToken = nil
        accessToken = nil
        expiry = .distantPast
        isLoggedIn = false
        message = "Uitgelogd."
    }

    // MARK: tokens

    /// Returns a valid access token, refreshing when needed. Nil when logged out.
    func validToken() async throws -> String? {
        if let accessToken, Date() < expiry { return accessToken }
        guard let rt = refreshToken else { return nil }
        try await requestToken(["grant_type": "refresh_token", "refresh_token": rt, "client_id": clientID])
        return accessToken
    }

    func invalidateAccessToken() { expiry = .distantPast }

    private func requestToken(_ form: [String: String]) async throws {
        var req = URLRequest(url: URL(string: "https://accounts.spotify.com/api/token")!)
        req.httpMethod = "POST"
        req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        req.httpBody = form.map { "\(Self.formEncode($0.key))=\(Self.formEncode($0.value))" }
            .joined(separator: "&").data(using: .utf8)

        let (data, resp) = try await URLSession.shared.data(for: req)
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (resp as? HTTPURLResponse)?.statusCode == 200, let at = json["access_token"] as? String else {
            let desc = (json["error_description"] as? String) ?? (json["error"] as? String) ?? "onbekende fout"
            if (json["error"] as? String) == "invalid_grant", form["grant_type"] == "refresh_token" { logout() }
            throw NSError(domain: "Spotify", code: 1, userInfo: [NSLocalizedDescriptionKey: desc])
        }
        accessToken = at
        let expiresIn = (json["expires_in"] as? Double) ?? 3600
        expiry = Date().addingTimeInterval(expiresIn - 60)
        if let rt = json["refresh_token"] as? String { refreshToken = rt }
        isLoggedIn = refreshToken != nil
    }

    // MARK: helpers

    static func randomString(_ n: Int) -> String {
        let chars = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
        var rng = SystemRandomNumberGenerator()
        return String((0..<n).map { _ in chars[Int(rng.next(upperBound: UInt32(chars.count)))] })
    }

    static func base64url(_ d: Data) -> String {
        d.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    static func formEncode(_ s: String) -> String {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        return s.addingPercentEncoding(withAllowedCharacters: allowed) ?? s
    }
}

/// Tells the login sheet which window to appear over.
final class AuthAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        return windows.first(where: { $0.isKeyWindow }) ?? windows.first ?? ASPresentationAnchor()
    }
}
