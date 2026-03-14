import Foundation

struct ShellResult: Sendable {
    let exitCode: Int32
    let stdout: String
    let stderr: String
    let durationMs: Int
}

enum ShellRunner {
    private static let maxOutputBytes = 256 * 1024 // 256KB cap — audit output for 29 components

    static func run(command: String, workingDirectory: String) async throws -> ShellResult {
        try await withCheckedThrowingContinuation { continuation in
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/sh")
            process.arguments = ["-c", command]
            process.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

            // Augment PATH
            var env = ProcessInfo.processInfo.environment
            let extraPaths = "/usr/local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node/bin"
            if let existing = env["PATH"] {
                env["PATH"] = "\(extraPaths):\(existing)"
            } else {
                env["PATH"] = extraPaths
            }
            process.environment = env

            let stdoutPipe = Pipe()
            let stderrPipe = Pipe()
            process.standardOutput = stdoutPipe
            process.standardError = stderrPipe

            let start = DispatchTime.now()

            do {
                try process.run()
            } catch {
                continuation.resume(throwing: error)
                return
            }

            process.waitUntilExit()

            let elapsed = DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds
            let durationMs = Int(elapsed / 1_000_000)

            let stdoutData = stdoutPipe.fileHandleForReading.readDataToEndOfFile()
            let stderrData = stderrPipe.fileHandleForReading.readDataToEndOfFile()

            let stdout = String(
                data: stdoutData.prefix(maxOutputBytes),
                encoding: .utf8
            ) ?? ""
            let stderr = String(
                data: stderrData.prefix(maxOutputBytes),
                encoding: .utf8
            ) ?? ""

            continuation.resume(returning: ShellResult(
                exitCode: process.terminationStatus,
                stdout: stdout,
                stderr: stderr,
                durationMs: durationMs
            ))
        }
    }
}
