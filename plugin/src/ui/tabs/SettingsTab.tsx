/**
 * SettingsTab — pipeline config + bridge port settings.
 */

import { useState, useEffect, useCallback } from 'react';
import { usePlugin } from '../state/PluginContext';
import { DEFAULT_CONFIG } from '@shared/constants';
import type { PluginConfig } from '@shared/config';
import type { PipelineType } from '@shared/protocol';

const PIPELINE_TYPES: { value: PipelineType; label: string }[] = [
  { value: 'json-source', label: 'JSON Source' },
  { value: 'style-dictionary', label: 'Style Dictionary' },
  { value: 'tokens-studio', label: 'Tokens Studio' },
  { value: 'custom', label: 'Custom' },
];

interface FormErrors {
  sourceFile?: string;
  generateCommand?: string;
  bridgePort?: string;
}

export function SettingsTab() {
  const { state, saveConfig, pickFolder } = usePlugin();
  const config = state.config ?? DEFAULT_CONFIG;

  // Local form state
  const [pipelineType, setPipelineType] = useState<PipelineType>(config.pipeline.type);
  const [sourceFile, setSourceFile] = useState(config.pipeline.sourceFile);
  const [generateCommand, setGenerateCommand] = useState(config.pipeline.generateCommand);
  const [auditCommand, setAuditCommand] = useState(config.pipeline.auditCommand ?? '');
  const [contactSheetUrl, setContactSheetUrl] = useState(config.pipeline.contactSheetUrl ?? '');
  const [bridgePort, setBridgePort] = useState(String(config.bridgePort));
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);

  // Sync form when config changes externally
  useEffect(() => {
    if (state.config) {
      setPipelineType(state.config.pipeline.type);
      setSourceFile(state.config.pipeline.sourceFile);
      setGenerateCommand(state.config.pipeline.generateCommand);
      setAuditCommand(state.config.pipeline.auditCommand ?? '');
      setContactSheetUrl(state.config.pipeline.contactSheetUrl ?? '');
      setBridgePort(String(state.config.bridgePort));
    }
  }, [state.config]);

  const validate = useCallback((): FormErrors => {
    const errs: FormErrors = {};
    if (!sourceFile.trim()) errs.sourceFile = 'Source file is required';
    if (!generateCommand.trim()) errs.generateCommand = 'Generate command is required';
    const port = Number(bridgePort);
    if (isNaN(port) || port < 1024 || port > 65535) {
      errs.bridgePort = 'Port must be 1024–65535';
    }
    return errs;
  }, [sourceFile, generateCommand, bridgePort]);

  const handleSave = useCallback(() => {
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const updated: PluginConfig = {
      schemaVersion: config.schemaVersion,
      protocolVersion: config.protocolVersion,
      bridgePort: Number(bridgePort),
      pipeline: {
        type: pipelineType,
        sourceFile: sourceFile.trim(),
        generateCommand: generateCommand.trim(),
        ...(auditCommand.trim() && { auditCommand: auditCommand.trim() }),
        ...(contactSheetUrl.trim() && { contactSheetUrl: contactSheetUrl.trim() }),
      },
    };

    saveConfig(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [
    validate, config, bridgePort, pipelineType, sourceFile,
    generateCommand, auditCommand, contactSheetUrl, saveConfig,
  ]);

  const hasErrors = Object.keys(errors).length > 0;

  return (
    <div className="settings-tab">
      <div className="settings-section">
        <div className="section-title">Pipeline</div>

        <div className="field">
          <label>Pipeline type</label>
          <select
            value={pipelineType}
            onChange={(e) => setPipelineType(e.target.value as PipelineType)}
          >
            {PIPELINE_TYPES.map((pt) => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Source file</label>
          <input
            type="text"
            placeholder="tokens/design-tokens.json"
            value={sourceFile}
            onChange={(e) => { setSourceFile(e.target.value); setErrors((p) => ({ ...p, sourceFile: undefined })); }}
          />
          {errors.sourceFile && <div className="field-error">{errors.sourceFile}</div>}
        </div>

        <div className="field">
          <label>Generate command</label>
          <input
            type="text"
            placeholder="npm run build:tokens"
            value={generateCommand}
            onChange={(e) => { setGenerateCommand(e.target.value); setErrors((p) => ({ ...p, generateCommand: undefined })); }}
          />
          {errors.generateCommand && <div className="field-error">{errors.generateCommand}</div>}
        </div>

        <div className="field">
          <label>Audit command (optional)</label>
          <input
            type="text"
            placeholder="npm run audit:tokens"
            value={auditCommand}
            onChange={(e) => setAuditCommand(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Contact sheet URL (optional)</label>
          <input
            type="text"
            placeholder="http://localhost:6006"
            value={contactSheetUrl}
            onChange={(e) => setContactSheetUrl(e.target.value)}
          />
        </div>
      </div>

      <div className="settings-section">
        <div className="section-title">Bridge</div>

        <div className="field">
          <label>Port</label>
          <input
            type="number"
            value={bridgePort}
            onChange={(e) => { setBridgePort(e.target.value); setErrors((p) => ({ ...p, bridgePort: undefined })); }}
          />
          {errors.bridgePort && <div className="field-error">{errors.bridgePort}</div>}
        </div>

        <div className="field">
          <label>Project folder</label>
          <div className="field-row">
            <input
              type="text"
              value={state.projectRoot ?? ''}
              placeholder="Not set"
              readOnly
            />
            <button
              className="btn-secondary"
              onClick={pickFolder}
              disabled={state.connectionStatus !== 'connected'}
            >
              {'Choose\u2026'}
            </button>
          </div>
        </div>
      </div>

      <div className="button-group">
        <button
          className="btn-primary"
          disabled={hasErrors}
          onClick={handleSave}
        >
          {saved ? 'Saved \u2713' : 'Save'}
        </button>
      </div>
    </div>
  );
}
