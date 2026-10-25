import SwiftUI

@main
struct RetroVizApp: App {
    @StateObject private var auth: SpotifyAuth
    @StateObject private var player: PlayerModel

    init() {
        let auth = SpotifyAuth()
        _auth = StateObject(wrappedValue: auth)
        _player = StateObject(wrappedValue: PlayerModel(auth: auth))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(auth)
                .environmentObject(player)
                .preferredColorScheme(.dark)
        }
    }
}
