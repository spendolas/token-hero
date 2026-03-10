import type { PipelineConfig, PipelineType, TokenGroupName } from './protocol';
import type { PluginConfig, UIPreferences } from './config';

export const PLUGIN_VERSION = '0.1.0';

export const DEFAULT_BRIDGE_PORT = 7799;

export const DEFAULT_PIPELINE: PipelineConfig = {
  type: 'json-source' as PipelineType,
  sourceFile: '',
  generateCommand: '',
};

export const DEFAULT_CONFIG: PluginConfig = {
  schemaVersion: 1,
  pipeline: DEFAULT_PIPELINE,
  bridgePort: DEFAULT_BRIDGE_PORT,
  protocolVersion: 1,
};

export const DEFAULT_UI_PREFERENCES: UIPreferences = {
  panelTab: 'styles',
  showAnnotations: true,
  compactMode: false,
};

export const TOKEN_GROUP_NAMES: TokenGroupName[] = [
  'textStyles',
  'colors',
  'effects',
  'spacing',
  'radius',
  'sizes',
];
