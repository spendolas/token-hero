import Foundation

struct TokenHeroConfig: Codable, Sendable {
    var pipeline: PipelineSettings
    var bridgePort: Int?
}

struct PipelineSettings: Codable, Sendable {
    var type: String
    var sourceFile: String
    var generateCommand: String
    var auditCommand: String?
    var contactSheetUrl: String?
    var generated: [String]?
    var groupMap: [String: String]?

    init(
        type: String = "json-source",
        sourceFile: String = "",
        generateCommand: String = "",
        auditCommand: String? = nil,
        contactSheetUrl: String? = nil,
        generated: [String]? = nil,
        groupMap: [String: String]? = nil
    ) {
        self.type = type
        self.sourceFile = sourceFile
        self.generateCommand = generateCommand
        self.auditCommand = auditCommand
        self.contactSheetUrl = contactSheetUrl
        self.generated = generated
        self.groupMap = groupMap
    }
}

extension TokenHeroConfig {
    /// Read config from a project root directory.
    static func load(from projectRoot: String) -> TokenHeroConfig? {
        let url = URL(fileURLWithPath: projectRoot)
            .appendingPathComponent("token-hero.config.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try? decoder.decode(TokenHeroConfig.self, from: data)
    }

    /// Write config to a project root directory using atomic write.
    func save(to projectRoot: String) throws {
        let url = URL(fileURLWithPath: projectRoot)
            .appendingPathComponent("token-hero.config.json")
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(self)
        try AtomicWriter.write(data: data, to: url)
    }
}
