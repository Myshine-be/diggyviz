import SwiftUI

private let phosphor = Color(red: 0.49, green: 1, blue: 0.54)
private let chassis = Color(red: 0.086, green: 0.094, blue: 0.114)
private let edge = Color(red: 0.19, green: 0.2, blue: 0.24)
private let amber = Color(red: 1, green: 0.71, blue: 0.24)

struct ContentView: View {
    @EnvironmentObject var auth: SpotifyAuth
    @EnvironmentObject var player: PlayerModel
    @State private var showSettings = false

    var body: some View {
        ScrollView {
            VStack(spacing: 14) {
                HStack(spacing: 10) {
                    Circle().fill(auth.isLoggedIn ? phosphor : Color(white: 0.25)).frame(width: 8, height: 8)
                    Text("RETROVIZ").font(.system(size: 13, weight: .bold, design: .monospaced)).tracking(3)
                        .foregroundColor(.gray)
                    Spacer()
                    Button { showSettings = true } label: {
                        Image(systemName: "gearshape").foregroundColor(.white)
                    }
                    .accessibilityLabel("Instellingen")
                }

                VizSurface(view: player.pip.view)
                    .aspectRatio(4.0 / 3.0, contentMode: .fit)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .overlay(RoundedRectangle(cornerRadius: 6).stroke(edge, lineWidth: 1))

                HStack(spacing: 12) {
                    Group {
                        if let art = player.artwork { Image(uiImage: art).resizable().scaledToFill() }
                        else { Color(red: 0.05, green: 0.1, blue: 0.06) }
                    }
                    .frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 3))
                    VStack(alignment: .leading, spacing: 3) {
                        Text(player.state.title).font(.system(size: 17, weight: .semibold, design: .monospaced))
                            .foregroundColor(phosphor).lineLimit(1)
                        Text(player.state.artist).font(.system(size: 14, design: .monospaced))
                            .foregroundColor(.gray).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                    ForEach(VizMode.allCases) { m in
                        KeyButton(title: m.label, active: player.mode == m) { player.mode = m }
                    }
                }

                HStack(spacing: 8) {
                    KeyButton(title: "\(Int(player.state.bpm.rounded())) BPM", active: false, tint: amber) { player.tap() }
                    PiPButton(pip: player.pip)
                }

                Text("Tik minstens 3 keer mee op de beat om het tempo per nummer vast te leggen. Start het zwevende venster en ga naar Spotify: het blijft op je scherm.")
                    .font(.footnote).foregroundColor(.gray)
                    .frame(maxWidth: .infinity, alignment: .leading)

                if !player.status.isEmpty {
                    Text(player.status).font(.footnote.monospaced()).foregroundColor(amber)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding()
        }
        .background(chassis.ignoresSafeArea())
        .onAppear { player.start() }
        .sheet(isPresented: $showSettings) { SettingsView().environmentObject(auth) }
    }
}

struct VizSurface: UIViewRepresentable {
    let view: UIView
    func makeUIView(context: Context) -> UIView { view }
    func updateUIView(_ uiView: UIView, context: Context) {}
}

struct KeyButton: View {
    let title: String
    let active: Bool
    var tint: Color = .white
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title.uppercased())
                .font(.system(size: 12, weight: .bold, design: .monospaced)).tracking(1)
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .foregroundColor(active ? .black : tint)
                .background(active ? phosphor : Color(red: 0.137, green: 0.149, blue: 0.18))
                .clipShape(RoundedRectangle(cornerRadius: 4))
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(active ? phosphor : edge, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

struct PiPButton: View {
    @ObservedObject var pip: PiPManager
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            KeyButton(title: pip.isActive ? "Venster sluiten" : "Zwevend venster", active: pip.isActive) { pip.toggle() }
                .disabled(!pip.isPossible && !pip.isActive)
                .opacity(pip.isPossible || pip.isActive ? 1 : 0.5)
            if let p = pip.problem { Text(p).font(.caption).foregroundColor(amber) }
        }
    }
}

struct SettingsView: View {
    @EnvironmentObject var auth: SpotifyAuth
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationView {
            Form {
                Section(footer: Text("Dezelfde Client ID en Redirect URI als in je Spotify-dashboard. De Redirect URI is het adres van de RetroViz-webpagina op GitHub Pages.")) {
                    TextField("Client ID", text: $auth.clientID)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .font(.system(.body, design: .monospaced))
                    TextField("Redirect URI", text: $auth.redirectURI)
                        .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.URL)
                        .font(.system(.body, design: .monospaced))
                }
                Section {
                    Button(auth.isLoggedIn ? "Opnieuw inloggen met Spotify" : "Inloggen met Spotify") { auth.login() }
                    if auth.isLoggedIn { Button("Uitloggen", role: .destructive) { auth.logout() } }
                }
                if let m = auth.message { Section { Text(m) } }
            }
            .navigationTitle("Spotify")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Klaar") { dismiss() } } }
        }
    }
}
