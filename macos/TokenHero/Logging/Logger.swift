import Foundation

enum LogLevel: String, Sendable {
    case info = "INFO"
    case run = "RUN"
    case ok = "OK"
    case warn = "WARN"
    case error = "ERROR"
}

actor TokenHeroLogger {
    static let shared = TokenHeroLogger()

    private var logFileURL: URL?
    private let maxSize: UInt64 = 5 * 1024 * 1024 // 5MB
    private let dateFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime]
        return f
    }()

    private init() {}

    func setProjectRoot(_ root: String) {
        logFileURL = URL(fileURLWithPath: root).appendingPathComponent("token-hero.log")
    }

    func log(_ level: LogLevel, _ message: String) {
        guard let url = logFileURL else { return }

        let timestamp = dateFormatter.string(from: Date())
        let paddedLevel = level.rawValue.padding(toLength: 5, withPad: " ", startingAt: 0)
        let line = "[\(timestamp)] [\(paddedLevel)] \(message)\n"

        do {
            if !FileManager.default.fileExists(atPath: url.path) {
                try "".write(to: url, atomically: true, encoding: .utf8)
            }

            // Rotate if over max size
            let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
            if let size = attrs[.size] as? UInt64, size > maxSize {
                let backupURL = url.appendingPathExtension("old")
                try? FileManager.default.removeItem(at: backupURL)
                try FileManager.default.moveItem(at: url, to: backupURL)
                try "".write(to: url, atomically: true, encoding: .utf8)
            }

            let handle = try FileHandle(forWritingTo: url)
            handle.seekToEndOfFile()
            if let data = line.data(using: .utf8) {
                handle.write(data)
            }
            handle.closeFile()
        } catch {
            // Silent failure — logging should never crash the app
        }
    }

    func readLastLines(_ count: Int = 200) -> String {
        guard let url = logFileURL,
              let content = try? String(contentsOf: url, encoding: .utf8) else {
            return ""
        }
        let lines = content.components(separatedBy: "\n")
        let lastLines = lines.suffix(count)
        return lastLines.joined(separator: "\n")
    }
}
