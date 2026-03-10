import Foundation

/// Mirrors the BridgeMessage envelope from plugin/src/shared/protocol.ts
struct BridgeMessage: Codable, Sendable {
    let id: String
    let protocolVersion: Int
    let type: String
    let payload: JSONValue
    let timestamp: Double

    init(id: String = UUID().uuidString, type: String, payload: JSONValue, protocolVersion: Int = 1) {
        self.id = id
        self.protocolVersion = protocolVersion
        self.type = type
        self.payload = payload
        self.timestamp = Date().timeIntervalSince1970 * 1000
    }
}

/// Type-erased JSON value for handling polymorphic payloads.
enum JSONValue: Codable, Sendable {
    case null
    case bool(Bool)
    case int(Int)
    case double(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()

        if container.decodeNil() {
            self = .null
            return
        }
        if let b = try? container.decode(Bool.self) {
            self = .bool(b)
            return
        }
        if let i = try? container.decode(Int.self) {
            self = .int(i)
            return
        }
        if let d = try? container.decode(Double.self) {
            self = .double(d)
            return
        }
        if let s = try? container.decode(String.self) {
            self = .string(s)
            return
        }
        if let a = try? container.decode([JSONValue].self) {
            self = .array(a)
            return
        }
        if let o = try? container.decode([String: JSONValue].self) {
            self = .object(o)
            return
        }
        throw DecodingError.dataCorruptedError(in: container, debugDescription: "Cannot decode JSONValue")
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let b): try container.encode(b)
        case .int(let i): try container.encode(i)
        case .double(let d): try container.encode(d)
        case .string(let s): try container.encode(s)
        case .array(let a): try container.encode(a)
        case .object(let o): try container.encode(o)
        }
    }

    // Convenience accessors
    var stringValue: String? {
        if case .string(let s) = self { return s }
        return nil
    }

    var intValue: Int? {
        if case .int(let i) = self { return i }
        return nil
    }

    var doubleValue: Double? {
        if case .double(let d) = self { return d }
        if case .int(let i) = self { return Double(i) }
        return nil
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let o) = self { return o }
        return nil
    }

    var arrayValue: [JSONValue]? {
        if case .array(let a) = self { return a }
        return nil
    }

    subscript(key: String) -> JSONValue? {
        objectValue?[key]
    }
}

// MARK: - Protocol constants

let PROTOCOL_VERSION = 1
let APP_VERSION = "0.1.0"

// MARK: - Message types (matching protocol.ts MessageType)

enum MessageType {
    static let hello = "HELLO"
    static let helloAck = "HELLO_ACK"
    static let versionMismatch = "VERSION_MISMATCH"
    static let bridgeClosing = "BRIDGE_CLOSING"
    static let saveConfig = "SAVE_CONFIG"
    static let saveConfigResult = "SAVE_CONFIG_RESULT"
    static let saveMapping = "SAVE_MAPPING"
    static let registerMapping = "REGISTER_MAPPING"
    static let getComponentProperties = "GET_COMPONENT_PROPERTIES"
    static let componentPropertiesResult = "COMPONENT_PROPERTIES_RESULT"
    static let applyPatch = "APPLY_PATCH"
    static let patchResult = "PATCH_RESULT"
    static let auditResults = "AUDIT_RESULTS"
    static let runScopedAudit = "RUN_SCOPED_AUDIT"
    static let getTokenSnapshot = "GET_TOKEN_SNAPSHOT"
    static let tokenSnapshotResult = "TOKEN_SNAPSHOT_RESULT"
    static let openContactSheet = "OPEN_CONTACT_SHEET"
    static let pickFolder = "PICK_FOLDER"
    static let pickFolderResult = "PICK_FOLDER_RESULT"
    static let error = "ERROR"
}
