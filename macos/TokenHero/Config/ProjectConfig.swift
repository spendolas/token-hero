import Foundation

struct ProjectsFile: Codable, Sendable {
    var activeProject: String
    var projects: [Project]
}

struct Project: Codable, Identifiable, Sendable {
    let id: String
    var name: String
    var root: String
    var figmaFileKey: String
    var port: Int

    init(id: String, name: String, root: String, figmaFileKey: String = "", port: Int = 7799) {
        self.id = id
        self.name = name
        self.root = root
        self.figmaFileKey = figmaFileKey
        self.port = port
    }
}
