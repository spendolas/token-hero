import Foundation

enum AtomicWriter {
    /// Write data to a file atomically: write to .tmp, then rename.
    static func write(data: Data, to url: URL) throws {
        let dir = url.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)

        let tmpURL = url.appendingPathExtension("tmp")
        try data.write(to: tmpURL, options: .atomic)

        // If target exists, remove it first
        if FileManager.default.fileExists(atPath: url.path) {
            try FileManager.default.removeItem(at: url)
        }
        try FileManager.default.moveItem(at: tmpURL, to: url)
    }

    /// Write data atomically, validating it parses as JSON first.
    static func writeJSON(data: Data, to url: URL) throws {
        // Validate JSON is parseable
        _ = try JSONSerialization.jsonObject(with: data)
        try write(data: data, to: url)
    }
}
