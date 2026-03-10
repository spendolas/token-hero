import Foundation

@Observable
final class ProjectStore: @unchecked Sendable {
    private(set) var file: ProjectsFile
    private let fileURL: URL

    static let appSupportDir: URL = {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return base.appendingPathComponent("TokenHero", isDirectory: true)
    }()

    init() {
        let dir = Self.appSupportDir
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        self.fileURL = dir.appendingPathComponent("projects.json")

        if let data = try? Data(contentsOf: fileURL),
           let decoded = try? JSONDecoder().decode(ProjectsFile.self, from: data) {
            self.file = decoded
        } else {
            self.file = ProjectsFile(activeProject: "", projects: [])
        }
    }

    var activeProject: Project? {
        file.projects.first { $0.id == file.activeProject }
    }

    var projects: [Project] {
        file.projects
    }

    func addProject(root: String) -> Project {
        let url = URL(fileURLWithPath: root)
        let folderName = url.lastPathComponent
        let slug = folderName
            .lowercased()
            .replacingOccurrences(of: " ", with: "-")
            .replacingOccurrences(of: "[^a-z0-9\\-]", with: "", options: .regularExpression)

        var id = slug
        var counter = 2
        while file.projects.contains(where: { $0.id == id }) {
            id = "\(slug)-\(counter)"
            counter += 1
        }

        let project = Project(id: id, name: folderName, root: root)
        file.projects.append(project)

        if file.activeProject.isEmpty {
            file.activeProject = id
        }

        save()
        return project
    }

    func removeProject(id: String) {
        file.projects.removeAll { $0.id == id }
        if file.activeProject == id {
            file.activeProject = file.projects.first?.id ?? ""
        }
        save()
    }

    func switchProject(id: String) {
        guard file.projects.contains(where: { $0.id == id }) else { return }
        file.activeProject = id
        save()
    }

    func updateProject(_ project: Project) {
        guard let idx = file.projects.firstIndex(where: { $0.id == project.id }) else { return }
        file.projects[idx] = project
        save()
    }

    private func save() {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        guard let data = try? encoder.encode(file) else { return }
        try? AtomicWriter.write(data: data, to: fileURL)
    }
}
