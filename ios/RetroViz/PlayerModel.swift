import Foundation
import UIKit
import QuartzCore

/// Polls Spotify for the current track and keeps the renderer's state up to date.
@MainActor
final class PlayerModel: ObservableObject {
    @Published private(set) var state = VizState()
    @Published private(set) var artwork: UIImage?
    @Published var status = ""
    @Published var mode: VizMode {
        didSet { UserDefaults.standard.set(mode.rawValue, forKey: "mode"); state.mode = mode; push() }
    }

    let pip = PiPManager()
    private let auth: SpotifyAuth
    private var pollTask: Task<Void, Never>?
    private var taps: [CFTimeInterval] = []

    init(auth: SpotifyAuth) {
        self.auth = auth
        mode = VizMode(rawValue: UserDefaults.standard.string(forKey: "mode") ?? "") ?? .bars
        state.mode = mode
    }

    func start() {
        push()
        pip.start()
        guard pollTask == nil else { return }
        pollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                let wait = await self.pollOnce()
                try? await Task.sleep(nanoseconds: UInt64(wait * 1_000_000_000))
            }
        }
    }

    private func push() { pip.renderer.update(state) }

    // MARK: Spotify polling

    private struct CurrentlyPlaying: Decodable {
        let progress_ms: Int?
        let is_playing: Bool
        let item: Item?
        struct Item: Decodable {
            let id: String?
            let uri: String
            let name: String
            let duration_ms: Int
            let artists: [Named]?
            let album: Album?
            let images: [Img]?
            let show: Named?
        }
        struct Named: Decodable { let name: String }
        struct Album: Decodable { let images: [Img] }
        struct Img: Decodable { let url: String }
    }

    /// One request; returns seconds to wait before the next one.
    private func pollOnce() async -> Double {
        do {
            guard let token = try await auth.validToken() else { return 3 }
            var req = URLRequest(url: URL(string: "https://api.spotify.com/v1/me/player/currently-playing?additional_types=episode")!)
            req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            let (data, resp) = try await URLSession.shared.data(for: req)
            let http = resp as? HTTPURLResponse
            switch http?.statusCode ?? 0 {
            case 200:
                let cp = try JSONDecoder().decode(CurrentlyPlaying.self, from: data)
                await apply(cp)
                status = ""
                return 3
            case 204:
                pause(title: "Niets aan het spelen op Spotify")
                return 4
            case 401:
                auth.invalidateAccessToken()
                return 0.5
            case 429:
                return Double(http?.value(forHTTPHeaderField: "Retry-After") ?? "") ?? 10
            case let code:
                status = "Spotify antwoordde met code \(code)."
                return 8
            }
        } catch {
            status = "Geen verbinding met Spotify: \(error.localizedDescription)"
            return 10
        }
    }

    private func pause(title: String) {
        let now = CACurrentMediaTime()
        state.progressMs = state.position(at: now)
        state.fetchedAt = now
        state.isPlaying = false
        if state.trackID == "demo" { state.title = title; state.artist = "" }
        push()
    }

    private func apply(_ cp: CurrentlyPlaying) async {
        guard let item = cp.item else { pause(title: "Reclame of onbekend item"); return }
        let id = item.id ?? item.uri
        let changed = id != state.trackID
        state.trackID = id
        state.title = item.name
        state.artist = item.artists?.map(\.name).joined(separator: ", ") ?? item.show?.name ?? ""
        state.durationMs = Double(item.duration_ms)
        state.progressMs = Double(cp.progress_ms ?? 0)
        state.fetchedAt = CACurrentMediaTime()
        state.isPlaying = cp.is_playing
        if changed {
            let t = Self.loadTempo(id)
            state.bpm = t.bpm; state.offsetMs = t.offset
        }
        push()

        if changed {
            let urlString = item.album?.images.first?.url ?? item.images?.first?.url
            var image: UIImage?
            if let s = urlString, let url = URL(string: s),
               let result = try? await URLSession.shared.data(from: url) {
                image = UIImage(data: result.0)
            }
            guard state.trackID == id else { return }   // track changed meanwhile
            artwork = image
            state.palette = Palette.from(image: image)
            push()
        }
    }

    // MARK: tap tempo

    func tap() {
        let now = CACurrentMediaTime()
        if let last = taps.last, now - last > 2 { taps.removeAll() }
        taps.append(now)
        if taps.count > 8 { taps.removeFirst() }
        guard taps.count >= 3 else { return }
        let avg = (taps.last! - taps.first!) / Double(taps.count - 1)
        let bpm = min(220, max(50, 60 / avg))
        let beatLen = 60_000 / bpm
        let pos = state.position(at: now)
        let off = (pos.truncatingRemainder(dividingBy: beatLen) + beatLen).truncatingRemainder(dividingBy: beatLen)
        state.bpm = bpm; state.offsetMs = off
        UserDefaults.standard.set([bpm, off], forKey: "tempo.\(state.trackID)")
        push()
    }

    private static func loadTempo(_ id: String) -> (bpm: Double, offset: Double) {
        if let a = UserDefaults.standard.array(forKey: "tempo.\(id)") as? [Double], a.count == 2 { return (a[0], a[1]) }
        return (120, 0)
    }
}
