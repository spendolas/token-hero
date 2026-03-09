/**
 * Plugin configuration types.
 *
 * These mirror the config stored in figma.root.setPluginData("config")
 * and token-hero.config.json on disk.
 */

import type { PipelineConfig, TokenGroupName } from './protocol';

export interface PluginConfig {
  schemaVersion: number;
  pipeline: PipelineConfig;
  bridgePort: number;
  protocolVersion: number;
}

export interface ComponentMapping {
  jsonKey: string;
  sourcePath: string;
  variantPropMap?: Record<string, string>;
  lastAuditAt: number | null;
  lastAuditStatus: 'clean' | 'dirty' | 'unknown';
}

export interface UIPreferences {
  panelTab: 'styles' | 'inspector' | 'audit' | 'settings';
  showAnnotations: boolean;
  compactMode: boolean;
}

export interface ConfigFile {
  port: number;
  pipeline: PipelineConfig;
  timeouts?: {
    componentQuery?: number;
    scopedAudit?: number;
  };
  componentMap?: Record<string, {
    jsonKey: string;
    sourcePath: string;
    figmaNodeId: string;
    variantPropMap?: Record<string, string>;
  }>;
}
