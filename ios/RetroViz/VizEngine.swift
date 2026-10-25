import Foundation
import CoreGraphics
import CoreText
import CoreMedia
import CoreVideo
import AVFoundation
import QuartzCore
import UIKit

// MARK: - Colors

struct RGB: Equatable {
    var r: Double, g: Double, b: Double   // 0...1

    func mix(_ o: RGB, _ t: Double) -> RGB {
        let t = min(1, max(0, t))
        return RGB(r: r + (o.r - r) * t, g: g + (o.g - g) * t, b: b + (o.b - b) * t)
    }
    func cg(_ a: Double = 1) -> CGColor { CGColor(srgbRed: r, green: g, blue: b, alpha: a) }

    static func hsv(_ h: Double, _ s: Double, _ v: Double) -> RGB {
        let i = Int(floor(h * 6)), f = h * 6 - floor(h * 6)
        let p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s)
        switch ((i % 6) + 6) % 6 {
        case 0: return RGB(r: v, g: t, b: p)
        case 1: return RGB(r: q, g: v, b: p)
        case 2: return RGB(r: p, g: v, b: t)
        case 3: return RGB(r: p, g: q, b: v)
        case 4: return RGB(r: t, g: p, b: v)
        default: return RGB(r: v, g: p, b: q)
        }
    }
    var hsv: (h: Double, s: Double, v: Double) {
        let mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h = 0.0
        if d > 0 {
            if mx == r { h = ((g - b) / d).truncatingRemainder(dividingBy: 6) }
            else if mx == g { h = (b - r) / d + 2 }
            else { h = (r - g) / d + 4 }
            h /= 6; if h < 0 { h += 1 }
        }
        return (h, mx > 0 ? d / mx : 0, mx)
    }
}

struct Palette: Equatable {
    var dark, mid, hi, hot: RGB

    static let standard = Palette(
        dark: RGB(r: 0.024, g: 0.07, b: 0.04),
        mid: RGB(r: 0.16, g: 0.78, b: 0.35),
        hi: RGB(r: 0.98, g: 0.92, b: 0.35),
        hot: RGB(r: 1.0, g: 0.27, b: 0.2))

    /// Picks the most vivid colour from album art and builds a 4-tone palette around it.
    static func from(image: UIImage?) -> Palette {
        guard let cg = image?.cgImage else { return .standard }
        let n = 24
        var px = [UInt8](repeating: 0, count: n * n * 4)
        let ok: Bool = px.withUnsafeMutableBytes { raw in
            guard let ctx = CGContext(data: raw.baseAddress, width: n, height: n, bitsPerComponent: 8, bytesPerRow: n * 4,
                                      space: CGColorSpace(name: CGColorSpace.sRGB)!,
                                      bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            ctx.draw(cg, in: CGRect(x: 0, y: 0, width: n, height: n))
            return true
        }
        guard ok else { return .standard }
        var best = RGB(r: 0.16, g: 0.78, b: 0.35), bestScore = -1.0
        for i in stride(from: 0, to: px.count, by: 4) {
            let c = RGB(r: Double(px[i]) / 255, g: Double(px[i + 1]) / 255, b: Double(px[i + 2]) / 255)
            let (_, s, v) = c.hsv
            let score = s * s * v * (v > 0.3 ? 1 : 0.2)
            if score > bestScore { bestScore = score; best = c }
        }
        let (h, s0, _) = best.hsv
        let s = max(0.55, s0)
        return Palette(dark: .hsv(h, s * 0.8, 0.07),
                       mid: .hsv(h, s, 0.85),
                       hi: .hsv((h + 0.12).truncatingRemainder(dividingBy: 1), s * 0.6, 1),
                       hot: .hsv((h + 0.5).truncatingRemainder(dividingBy: 1), 0.85, 1))
    }
}

// MARK: - State shared with the render thread

enum VizMode: String, CaseIterable, Identifiable {
    case bars, scope, tunnel, plasma
    var id: String { rawValue }
    var label: String {
        switch self {
        case .bars: return "Balken"
        case .scope: return "Scope"
        case .tunnel: return "Tunnel"
        case .plasma: return "Plasma"
        }
    }
}

struct VizState {
    var trackID = "demo"
    var title = "Demo-modus"
    var artist = "Koppel Spotify in de instellingen"
    var durationMs = 213_000.0
    var progressMs = 0.0
    var isPlaying = true
    var fetchedAt = CACurrentMediaTime()
    var bpm = 120.0
    var offsetMs = 0.0
    var palette = Palette.standard
    var mode = VizMode.bars

    func position(at now: CFTimeInterval) -> Double {
        guard isPlaying else { return progressMs }
        let p = progressMs + (now - fetchedAt) * 1000
        if trackID == "demo" { return p.truncatingRemainder(dividingBy: durationMs) }
        return min(durationMs, p)
    }
}

// MARK: - Synthetic rhythm
// Spotify gives no audio data, so the visuals follow a generated rhythm locked
// to the song position and the tapped BPM.

final class Rhythm {
    static let count = 32
    var bands = [Double](repeating: 0, count: Rhythm.count)
    var peaks = [Double](repeating: 0, count: Rhythm.count)
    var kick = 0.0, snare = 0.0, hat = 0.0, energy = 0.0, level = 0.0, t = 0.0
    var seed: UInt32 = 1

    static func hashString(_ s: String) -> UInt32 {
        var h: UInt32 = 2166136261
        for b in s.utf8 { h = (h ^ UInt32(b)) &* 16777619 }
        return h
    }
    private func hash1(_ n: Int, _ seed: UInt32) -> Double {
        var x = UInt32(truncatingIfNeeded: n) &* 374761393 &+ seed &* 668265263
        x = (x ^ (x >> 13)) &* 1274126177
        return Double(x ^ (x >> 16)) / 4294967296.0
    }
    func noise(_ x: Double, _ seed: UInt32) -> Double {
        let fi = floor(x), f = x - fi, u = f * f * (3 - 2 * f)
        let i = Int(fi)
        return hash1(i, seed) * (1 - u) + hash1(i &+ 1, seed) * u
    }

    func update(posMs: Double, playing: Bool, seed: UInt32, bpm: Double, offsetMs: Double) {
        self.seed = seed
        let beatLen = 60000 / bpm
        let bp = (posMs - offsetMs) / beatLen
        let ph = bp - floor(bp)
        let beatIdx = Int(floor(bp))
        let bar = floor(bp / 4)
        let k = exp(-ph * 6.5)
        let sn = (beatIdx & 1) == 1 ? exp(-ph * 9) : 0
        let hp = bp * 2 - floor(bp * 2)
        let ht = exp(-hp * 16) * (0.5 + 0.5 * noise(bp * 2, seed &+ 9))
        let intro = min(1, max(0, posMs / 8000))
        let section = 0.5 + 0.5 * noise(bar / 8, seed &+ 3)
        energy = playing ? intro * (0.45 + 0.55 * section) : 0
        t = posMs / 1000
        var sum = 0.0
        for i in 0..<Rhythm.count {
            let f = Double(i) / Double(Rhythm.count - 1)
            let base = noise(t * (1.4 + f * 3) + Double(i) * 3.7, seed) * (1 - f * 0.55)
            let low = k * pow(1 - f, 2.2) * 1.15
            let mid = sn * exp(-pow((f - 0.45) / 0.18, 2)) * 0.8
            let high = ht * pow(f, 1.4) * 0.75
            let target = min(1, max(0, (base * 0.55 + low + mid + high) * energy * 0.95))
            bands[i] = target > bands[i] ? target : max(target, bands[i] - 0.05)
            peaks[i] = max(peaks[i] - 0.012, bands[i])
            sum += bands[i]
        }
        kick = k * energy; snare = sn * energy; hat = ht * energy; level = sum / Double(Rhythm.count)
    }

    /// x in 0...1 → roughly -1...1
    func wave(_ x: Double) -> Double {
        let s = Double(seed % 1000)
        let f1 = 2 + s.truncatingRemainder(dividingBy: 3)
        let f2 = 5 + s.truncatingRemainder(dividingBy: 5)
        let f3 = 11 + s.truncatingRemainder(dividingBy: 7)
        let tau = Double.pi * 2
        let a = sin((x * f1 + t * 0.9) * tau) * (0.35 + kick * 0.6)
        let b = sin((x * f2 - t * 1.7) * tau) * (0.2 + snare * 0.4)
        let c = sin((x * f3 + t * 3.1) * tau) * (0.08 + hat * 0.35)
        let n = (noise(x * 40 + t * 20, seed) - 0.5) * hat * 0.5
        return (a + b + c + n) * energy
    }
}

// MARK: - Renderer: draws frames and feeds them to the PiP display layer

final class Renderer {
    let width = 480, height = 360
    private let strip = 30.0   // track-title strip at the bottom
    private let queue = DispatchQueue(label: "retroviz.render", qos: .userInteractive)
    private var timer: DispatchSourceTimer?
    private let lock = NSLock()
    private var _state = VizState()
    private let rhythm = Rhythm()
    private let space = CGColorSpace(name: CGColorSpace.sRGB)!
    private let bitmapInfo = CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue
    private var canvas: CGContext!
    private var plasma: CGContext!
    private var pool: CVPixelBufferPool?
    private var format: CMVideoFormatDescription?
    private var lastTick = CACurrentMediaTime()
    private var plasmaTime = 0.0, spin = 0.0
    private var cachedLine: (text: String, line: CTLine, width: Double)?
    private let font = CTFontCreateWithName("Menlo-Bold" as CFString, 15, nil)

    weak var layer: AVSampleBufferDisplayLayer?

    init() {
        canvas = CGContext(data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: 0,
                           space: space, bitmapInfo: bitmapInfo)
        plasma = CGContext(data: nil, width: 96, height: 72, bitsPerComponent: 8, bytesPerRow: 96 * 4,
                           space: space, bitmapInfo: bitmapInfo)
        let attrs: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
            kCVPixelBufferWidthKey as String: width,
            kCVPixelBufferHeightKey as String: height,
            kCVPixelBufferIOSurfacePropertiesKey as String: [String: Any](),
            kCVPixelBufferCGBitmapContextCompatibilityKey as String: true,
        ]
        CVPixelBufferPoolCreate(nil, nil, attrs as CFDictionary, &pool)
    }

    func update(_ s: VizState) { lock.lock(); _state = s; lock.unlock() }
    private func snapshot() -> VizState { lock.lock(); defer { lock.unlock() }; return _state }

    func start() {
        guard timer == nil else { return }
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now(), repeating: 1.0 / 30.0, leeway: .milliseconds(4))
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    private func tick() {
        let now = CACurrentMediaTime()
        let dt = min(0.1, now - lastTick); lastTick = now
        let s = snapshot()
        let pos = s.position(at: now)
        rhythm.update(posMs: pos, playing: s.isPlaying, seed: Rhythm.hashString(s.trackID), bpm: s.bpm, offsetMs: s.offsetMs)

        switch s.mode {
        case .bars: drawBars(s.palette)
        case .scope: drawScope(s.palette)
        case .tunnel: drawTunnel(s.palette)
        case .plasma: drawPlasma(s.palette, dt: dt)
        }
        output(s, pos: pos, now: now)
    }

    private var W: Double { Double(width) }
    private var H: Double { Double(height) }

    // Core Graphics origin is bottom-left; the title strip sits at y 0...strip.

    private func drawBars(_ p: Palette) {
        let c = canvas!
        c.setFillColor(p.dark.cg()); c.fill(CGRect(x: 0, y: 0, width: W, height: H))
        let n = 20, gap = 4.0
        let bw = (W - gap * Double(n + 1)) / Double(n)
        let cell = 10.0, cg = 3.0
        let rows = Int((H - strip - 8) / cell)
        for i in 0..<n {
            let idx = i * Rhythm.count / n
            let lit = Int((rhythm.bands[idx] * Double(rows)).rounded())
            let x = gap + Double(i) * (bw + gap)
            for r in 0..<rows {
                let f = Double(r) / Double(rows)
                let col = f < 0.6 ? p.mid.mix(p.hi, f / 0.6) : p.hi.mix(p.hot, (f - 0.6) / 0.4)
                c.setFillColor(col.cg(r < lit ? 1 : 0.08))
                c.fill(CGRect(x: x, y: strip + 4 + Double(r) * cell, width: bw, height: cell - cg))
            }
            let py = strip + 4 + (rhythm.peaks[idx] * Double(rows)).rounded() * cell
            c.setFillColor(CGColor(gray: 1, alpha: 0.9))
            c.fill(CGRect(x: x, y: py, width: bw, height: 4))
        }
    }

    private func drawScope(_ p: Palette) {
        let c = canvas!
        c.setFillColor(p.dark.cg(0.38)); c.fill(CGRect(x: 0, y: 0, width: W, height: H))
        c.setStrokeColor(p.mid.cg(0.12)); c.setLineWidth(1)
        for i in 1..<8 { c.move(to: CGPoint(x: Double(i) * W / 8, y: 0)); c.addLine(to: CGPoint(x: Double(i) * W / 8, y: H)) }
        for i in 1..<6 { c.move(to: CGPoint(x: 0, y: Double(i) * H / 6)); c.addLine(to: CGPoint(x: W, y: Double(i) * H / 6)) }
        c.strokePath()
        c.saveGState()
        c.setShadow(offset: .zero, blur: 12, color: p.mid.cg())
        c.setStrokeColor(p.mid.mix(p.hi, rhythm.kick).cg()); c.setLineWidth(2.4)
        let mid = strip + (H - strip) / 2, amp = (H - strip) * 0.42
        let steps = 200
        for i in 0...steps {
            let x = Double(i) / Double(steps)
            let pt = CGPoint(x: x * W, y: mid + rhythm.wave(x) * amp)
            i == 0 ? c.move(to: pt) : c.addLine(to: pt)
        }
        c.strokePath()
        c.restoreGState()
    }

    private func drawTunnel(_ p: Palette) {
        let c = canvas!
        let prev = c.makeImage()
        c.setFillColor(p.dark.cg()); c.fill(CGRect(x: 0, y: 0, width: W, height: H))
        spin += 0.004 + rhythm.kick * 0.018
        if let prev {
            c.saveGState()
            c.translateBy(x: W / 2, y: H / 2)
            c.rotate(by: 0.012 + rhythm.snare * 0.03)
            let z = 1.025 + rhythm.kick * 0.045
            c.scaleBy(x: z, y: z)
            c.setAlpha(0.93)
            c.interpolationQuality = .low
            c.draw(prev, in: CGRect(x: -W / 2, y: -H / 2, width: W, height: H))
            c.restoreGState()
        }
        let R = min(W, H) * (0.14 + rhythm.level * 0.22)
        c.saveGState()
        c.translateBy(x: W / 2, y: H / 2 + strip / 2)
        c.rotate(by: spin)
        c.setStrokeColor(p.mid.mix(p.hot, rhythm.snare).cg())
        c.setLineWidth(1.5 + rhythm.kick * 3)
        c.setShadow(offset: .zero, blur: 9, color: p.hi.cg())
        let steps = 160
        for i in 0...steps {
            let f = Double(i) / Double(steps), a = f * .pi * 2
            let r = R * (1 + rhythm.wave(f) * 0.6)
            let pt = CGPoint(x: cos(a) * r, y: sin(a) * r)
            i == 0 ? c.move(to: pt) : c.addLine(to: pt)
        }
        c.closePath(); c.strokePath()
        c.restoreGState()
    }

    private func drawPlasma(_ p: Palette, dt: Double) {
        plasmaTime += dt * (0.4 + rhythm.energy * 1.4 + rhythm.kick * 2)
        guard let base = plasma.data else { return }
        let w = 96, h = 72, t = plasmaTime
        let buf = base.bindMemory(to: UInt8.self, capacity: w * h * 4)
        let flash = 1 + rhythm.kick * 0.35
        for y in 0..<h {
            for x in 0..<w {
                let u = Double(x) / Double(w), v = Double(y) / Double(h)
                var s = sin(u * 10 + t) + sin(v * 8 + t * 0.7) + sin(u * 6 + v * 6 + t * 1.3)
                s += sin(hypot(u - 0.5, v - 0.5) * 18 - t * 2)
                s = (s + 4) / 8
                let band = Int(s * 3) % 3, k = (s * 3).truncatingRemainder(dividingBy: 1)
                let a = band == 0 ? p.dark : band == 1 ? p.mid : p.hi
                let b = band == 0 ? p.mid : band == 1 ? p.hi : p.hot
                let col = a.mix(b, k)
                let i = (y * w + x) * 4
                buf[i] = UInt8(min(255, col.b * 255 * flash))
                buf[i + 1] = UInt8(min(255, col.g * 255 * flash))
                buf[i + 2] = UInt8(min(255, col.r * 255 * flash))
                buf[i + 3] = 255
            }
        }
        guard let img = plasma.makeImage() else { return }
        canvas.interpolationQuality = .high
        canvas.draw(img, in: CGRect(x: 0, y: 0, width: W, height: H))
    }

    private func line(for text: String, cache: Bool = false) -> (CTLine, Double) {
        if cache, let c = cachedLine, c.text == text { return (c.line, c.width) }
        let attrs: [NSAttributedString.Key: Any] = [
            NSAttributedString.Key(kCTFontAttributeName as String): font,
            NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(srgbRed: 0.49, green: 1, blue: 0.54, alpha: 1),
        ]
        let l = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attrs))
        let w = CTLineGetTypographicBounds(l, nil, nil, nil)
        if cache { cachedLine = (text, l, w) }
        return (l, w)
    }

    private func output(_ s: VizState, pos: Double, now: CFTimeInterval) {
        guard let pool, let layer, let frame = canvas.makeImage() else { return }
        var pbOut: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &pbOut)
        guard let pb = pbOut else { return }

        CVPixelBufferLockBaseAddress(pb, [])
        if let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: width, height: height, bitsPerComponent: 8,
                               bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: space, bitmapInfo: bitmapInfo) {
            ctx.draw(frame, in: CGRect(x: 0, y: 0, width: W, height: H))

            // LCD strip: scrolling title like the old players, time on the right
            ctx.setFillColor(CGColor(srgbRed: 0.03, green: 0.06, blue: 0.04, alpha: 0.92))
            ctx.fill(CGRect(x: 0, y: 0, width: W, height: strip))
            ctx.textMatrix = .identity
            let timeText = "\(Self.fmt(pos))/\(Self.fmt(s.durationMs))"
            let (tl, tw) = line(for: timeText)
            let timeX = W - tw - 8
            let marquee = "*** \(s.artist.uppercased()) — \(s.title.uppercased()) ***     "
            let (ml, mw) = line(for: marquee, cache: true)
            ctx.saveGState()
            ctx.clip(to: CGRect(x: 0, y: 0, width: timeX - 10, height: strip))
            let span = mw + (timeX - 10)
            let offset = (now * 45).truncatingRemainder(dividingBy: span)
            ctx.textPosition = CGPoint(x: (timeX - 10) - offset, y: 10)
            CTLineDraw(ml, ctx)
            ctx.restoreGState()
            ctx.textPosition = CGPoint(x: timeX, y: 10)
            CTLineDraw(tl, ctx)

            // progress hairline
            let frac = s.durationMs > 0 ? pos / s.durationMs : 0
            ctx.setFillColor(CGColor(srgbRed: 0.49, green: 1, blue: 0.54, alpha: 1))
            ctx.fill(CGRect(x: 0, y: strip - 2, width: W * frac, height: 2))
        }
        CVPixelBufferUnlockBaseAddress(pb, [])

        if format == nil {
            CMVideoFormatDescriptionCreateForImageBuffer(allocator: nil, imageBuffer: pb, formatDescriptionOut: &format)
        }
        guard let format else { return }
        var timing = CMSampleTimingInfo(duration: CMTime(value: 1, timescale: 30),
                                        presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
                                        decodeTimeStamp: .invalid)
        var sbOut: CMSampleBuffer?
        CMSampleBufferCreateReadyWithImageBuffer(allocator: nil, imageBuffer: pb, formatDescription: format,
                                                 sampleTiming: &timing, sampleBufferOut: &sbOut)
        guard let sb = sbOut else { return }
        if let arr = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true), CFArrayGetCount(arr) > 0 {
            let dict = unsafeBitCast(CFArrayGetValueAtIndex(arr, 0), to: CFMutableDictionary.self)
            CFDictionarySetValue(dict,
                                 Unmanaged.passUnretained(kCMSampleAttachmentKey_DisplayImmediately).toOpaque(),
                                 Unmanaged.passUnretained(kCFBooleanTrue).toOpaque())
        }
        if layer.status == .failed { layer.flush() }
        layer.enqueue(sb)
    }

    static func fmt(_ ms: Double) -> String {
        let s = max(0, Int(ms / 1000))
        return "\(s / 60):" + String(format: "%02d", s % 60)
    }
}
