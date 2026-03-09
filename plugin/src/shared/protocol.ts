/**
 * Token Hero Bridge Protocol — Canonical Type Definitions
 *
 * This file defines all message types exchanged between the Figma plugin
 * and the macOS bridge app over WebSocket.
 *
 * The Swift equivalent in macos/TokenHero/Bridge/MessageEnvelope.swift
 * must be kept in sync with this file.
 */

// --- Message envelope ---

export interface BridgeMessage {
  id: string;
  protocolVersion: number;
  type: MessageType;
  payload: unknown;
  timestamp: number;
}

export const PROTOCOL_VERSION = 1;

// --- Message types ---

export type MessageType =
  // Handshake
  | 'HELLO'
  | 'HELLO_ACK'
  | 'VERSION_MISMATCH'
  | 'BRIDGE_CLOSING'
  // Configuration
  | 'SAVE_CONFIG'
  | 'SAVE_CONFIG_RESULT'
  // Mapping
  | 'SAVE_MAPPING'
  | 'REGISTER_MAPPING'
  // Flow 1: Component property query
  | 'GET_COMPONENT_PROPERTIES'
  | 'COMPONENT_PROPERTIES_RESULT'
  // Flow 2: Source file patch
  | 'APPLY_PATCH'
  | 'PATCH_RESULT'
  // Flow 3: Audit result ingestion
  | 'AUDIT_RESULTS'
  // Flow 4: Scoped audit trigger
  | 'RUN_SCOPED_AUDIT'
  // Flow 5: Token snapshot
  | 'GET_TOKEN_SNAPSHOT'
  | 'TOKEN_SNAPSHOT_RESULT'
  // Contact sheet
  | 'OPEN_CONTACT_SHEET'
  // Errors
  | 'ERROR';

// --- Handshake payloads ---

export interface HelloPayload {
  pluginVersion: string;
  figmaFileKey: string;
  figmaFileName: string;
}

export interface HelloAckPayload {
  appVersion: string;
  projectName: string;
  projectRoot: string;
  sourceFile: string;
  componentMapCount: number;
  configWrittenAt: number;
  unresolvedPaths: string[];
}

export interface BridgeClosingPayload {
  reason: 'shutdown' | 'error' | 'project_switch';
}

// --- Configuration payloads ---

export interface SaveConfigPayload {
  pipeline: PipelineConfig;
  bridgePort: number;
}

export interface SaveConfigResultPayload {
  success: boolean;
}

// --- Mapping payloads ---

export interface SaveMappingPayload {
  figmaNodeId: string;
  jsonKey: string;
  sourcePath: string;
  variantPropMap?: Record<string, string>;
}

export interface RegisterMappingPayload {
  mappings: Array<{
    figmaNodeId: string;
    jsonKey: string;
    sourcePath: string;
    variantPropMap?: Record<string, string>;
  }>;
}

// --- Flow 1: Component properties ---

export interface GetComponentPropertiesPayload {
  figmaNodeId: string;
  timeoutMs?: number;
}

export interface ComponentPropertiesResultPayload {
  nodeId: string;
  componentName: string;
  figmaFileKey: string;
  isComponentSet: boolean;
  layers?: Layer[];
  variants?: Record<string, { variantNodeId: string; layers: Layer[] }>;
}

export interface Layer {
  layerId: string;
  layerName: string;
  properties: Record<string, LayerProperty>;
}

export interface LayerProperty {
  value: string | number;
  tokenId: string | null;
  tokenName: string | null;
  isBound: boolean;
  isOverridden: boolean;
}

// --- Flow 2: Patch ---

export interface ApplyPatchPayload {
  targetFile: string;
  patch: PatchOperation[];
  runAfter: string[];
}

export interface PatchOperation {
  op: 'replace' | 'add' | 'remove';
  path: string;
  value?: unknown;
}

export interface PatchResultPayload {
  success: boolean;
  projectRoot: string;
  projectName: string;
  patchedPaths: string[];
  commandResults: CommandResult[];
}

export interface CommandResult {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  durationMs: number;
}

// --- Flow 3: Audit results ---

export type DivergenceType =
  | 'CASCADE_LOSS'
  | 'WRONG_TOKEN'
  | 'TOKEN_MISSING'
  | 'NOT_APPLIED'
  | 'UNRECORDED_VARIANT_DELTA'
  | 'REMOVED_NESTED';

export interface AuditResultsPayload {
  source: 'visual' | 'binding';
  generatedAt: number;
  replaceExisting: boolean;
  findings: AuditFinding[];
}

export interface AuditFinding {
  figmaNodeId: string;
  layerId: string;
  layerName: string;
  componentName: string;
  divergenceType: DivergenceType;
  figmaValue: string | number;
  browserValue: string | number | null;
  expectedToken: string | null;
  actualToken: string | null;
  suggestedFix?: SuggestedFix;
}

export type SuggestedFix =
  | { op: 'rebind'; targetTokenName: string; targetTokenId: string; property: string }
  | { op: 'create_token'; suggestedName: string; suggestedValue: string | number; collection: string }
  | { op: 'patch_json'; patch: PatchOperation[] };

// --- Flow 4: Scoped audit ---

export interface RunScopedAuditPayload {
  jsonKey: string;
  figmaNodeId: string;
  timeoutMs?: number;
}

// --- Flow 5: Token snapshot ---

export interface GetTokenSnapshotPayload {
  groups?: TokenGroupName[];
}

export type TokenGroupName = 'textStyles' | 'colors' | 'effects' | 'spacing' | 'radius' | 'sizes';

export interface TokenSnapshotResultPayload {
  sourceFile: string;
  readAt: number;
  tokens: {
    textStyles?: Record<string, TextStyleToken>;
    colors?: Record<string, string>;
    effects?: Record<string, EffectToken>;
    spacing?: Record<string, number>;
    radius?: Record<string, number>;
    sizes?: Record<string, number>;
  };
}

export interface TextStyleToken {
  fontSize: number;
  lineHeight: string | number;
  fontWeight: number;
  letterSpacing?: string;
  textCase?: string;
  fontFamily?: string;
}

export interface EffectToken {
  type: string;
  color: string;
  opacity: number;
  x: number;
  y: number;
  blur: number;
  spread: number;
}

// --- Contact sheet ---

export interface OpenContactSheetPayload {
  jsonKey: string;
}

// --- Error ---

export type ErrorCode =
  | 'NODE_NOT_FOUND'
  | 'PLUGIN_NOT_AVAILABLE'
  | 'PATCH_FAILED'
  | 'PATCH_TARGET_INVALID'
  | 'AUDIT_FAILED'
  | 'SOURCE_FILE_NOT_FOUND'
  | 'SOURCE_FILE_PARSE_ERROR'
  | 'BRIDGE_TIMEOUT'
  | 'VERSION_MISMATCH'
  | 'UNKNOWN';

export interface ErrorPayload {
  correlationId: string;
  code: ErrorCode;
  message: string;
  detail?: unknown;
}

// --- Shared config types ---

export type PipelineType = 'json-source' | 'style-dictionary' | 'tokens-studio' | 'custom';

export interface PipelineConfig {
  type: PipelineType;
  sourceFile: string;
  generateCommand: string;
  auditCommand?: string;
  contactSheetUrl?: string;
  generated?: string[];
  groupMap?: Record<string, TokenGroupName>;
}
