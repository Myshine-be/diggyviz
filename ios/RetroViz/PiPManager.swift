import AVKit
import AVFoundation
import UIKit

/// A UIView backed by an AVSampleBufferDisplayLayer — the surface the PiP window shows.
final class SampleBufferView: UIView {
    override class var layerClass: AnyClass { AVSampleBufferDisplayLayer.self }
    var displayLayer: AVSampleBufferDisplayLayer { layer as! AVSampleBufferDisplayLayer }
}

/// Owns the renderer, the Picture-in-Picture controller and the silent audio
/// that keeps the app (and so the animation) running while you are in other apps.
final class PiPManager: NSObject, ObservableObject,
                        AVPictureInPictureControllerDelegate,
                        AVPictureInPictureSampleBufferPlaybackDelegate {
    @Published var isActive = false
    @Published var isPossible = false
    @Published var problem: String?

    let view = SampleBufferView()
    let renderer = Renderer()
    private let silence = SilentAudio()
    private var controller: AVPictureInPictureController?
    private var possibleObservation: NSKeyValueObservation?

    override init() {
        super.init()
        view.backgroundColor = .black
        view.displayLayer.videoGravity = .resizeAspect
        renderer.layer = view.displayLayer
    }

    func start() {
        silence.start()
        renderer.start()
        guard controller == nil else { return }
        guard AVPictureInPictureController.isPictureInPictureSupported() else {
            problem = "Zwevend venster wordt niet ondersteund op dit toestel."; return
        }
        let source = AVPictureInPictureController.ContentSource(sampleBufferDisplayLayer: view.displayLayer,
                                                                playbackDelegate: self)
        let c = AVPictureInPictureController(contentSource: source)
        c.delegate = self
        c.canStartPictureInPictureAutomaticallyFromInline = true   // swipe home → window floats
        c.requiresLinearPlayback = true
        possibleObservation = c.observe(\.isPictureInPicturePossible, options: [.initial, .new]) { [weak self] c, _ in
            let possible = c.isPictureInPicturePossible
            DispatchQueue.main.async { self?.isPossible = possible }
        }
        controller = c
    }

    func toggle() {
        guard let c = controller else { return }
        if c.isPictureInPictureActive { c.stopPictureInPicture() } else { c.startPictureInPicture() }
    }

    // MARK: AVPictureInPictureControllerDelegate

    func pictureInPictureControllerDidStartPictureInPicture(_ c: AVPictureInPictureController) {
        DispatchQueue.main.async { self.isActive = true; self.problem = nil }
    }
    func pictureInPictureControllerDidStopPictureInPicture(_ c: AVPictureInPictureController) {
        DispatchQueue.main.async { self.isActive = false }
    }
    func pictureInPictureController(_ c: AVPictureInPictureController, failedToStartPictureInPictureWithError error: Error) {
        DispatchQueue.main.async { self.problem = "Zwevend venster starten mislukt: \(error.localizedDescription)" }
    }

    // MARK: AVPictureInPictureSampleBufferPlaybackDelegate (a "live" stream: no seeking)

    func pictureInPictureController(_ c: AVPictureInPictureController, setPlaying playing: Bool) {}
    func pictureInPictureControllerTimeRangeForPlayback(_ c: AVPictureInPictureController) -> CMTimeRange {
        CMTimeRange(start: .negativeInfinity, duration: .positiveInfinity)
    }
    func pictureInPictureControllerIsPlaybackPaused(_ c: AVPictureInPictureController) -> Bool { false }
    func pictureInPictureController(_ c: AVPictureInPictureController, didTransitionToRenderSize newRenderSize: CMVideoDimensions) {}
    func pictureInPictureController(_ c: AVPictureInPictureController, skipByInterval skipInterval: CMTime,
                                    completion completionHandler: @escaping () -> Void) { completionHandler() }
}

/// Plays silence, mixed with other audio, so Spotify keeps playing and iOS keeps
/// this app alive in the background. Requires UIBackgroundModes = audio.
final class SilentAudio {
    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private var started = false

    func start() {
        guard !started else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch { return }
        guard let format = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_410) else { return }
        buffer.frameLength = 4_410
        if let ch = buffer.floatChannelData {
            for c in 0..<Int(format.channelCount) { ch[c].initialize(repeating: 0, count: Int(buffer.frameLength)) }
        }
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: format)
        do { try engine.start() } catch { return }
        player.scheduleBuffer(buffer, at: nil, options: .loops)
        player.play()
        started = true

        // Restart after phone calls / Siri interruptions
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            guard let self,
                  let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
                  AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
            try? AVAudioSession.sharedInstance().setActive(true)
            try? self.engine.start()
            self.player.play()
        }
    }
}
