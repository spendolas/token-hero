import SwiftUI

enum IconState: Sendable {
    case connected
    case idle
    case running
    case error

    var symbolName: String {
        switch self {
        case .connected, .running, .error: return "hexagon.fill"
        case .idle: return "hexagon"
        }
    }

    var tintColor: Color {
        switch self {
        case .connected, .running: return Color(red: 0.39, green: 0.40, blue: 0.95) // #6366f1
        case .idle: return Color(red: 0.39, green: 0.45, blue: 0.55) // #64748b
        case .error: return Color(red: 0.94, green: 0.27, blue: 0.27) // #ef4444
        }
    }

    var isPulsing: Bool {
        self == .running
    }

    var label: String {
        switch self {
        case .connected: return "Connected"
        case .idle: return "Idle"
        case .running: return "Running\u{2026}"
        case .error: return "Error"
        }
    }
}
