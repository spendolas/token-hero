import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');

/** Shared esbuild options */
const shared = {
  bundle: true,
  minify: !isWatch,
  sourcemap: false,
  alias: { '@shared': resolve(__dirname, 'src/shared') },
};

/** Read the HTML template and inject bundled JS at the <!-- SCRIPT --> marker. */
function injectHTML(jsCode) {
  const template = readFileSync(resolve(__dirname, 'src/ui/ui.html'), 'utf8');
  return template.replace('<!-- SCRIPT -->', function() { return '<script>' + jsCode + '</script>'; });
}

/** Write dist/ui.html with injected JS bundle. */
function writeUI(jsCode) {
  mkdirSync(resolve(__dirname, 'dist'), { recursive: true });
  writeFileSync(resolve(__dirname, 'dist/ui.html'), injectHTML(jsCode));
}

// ── Build 1: Main thread (code.js) ──────────────────────────

const pluginOptions = {
  ...shared,
  entryPoints: [resolve(__dirname, 'src/plugin/main.ts')],
  outfile: resolve(__dirname, 'dist/code.js'),
  format: 'iife',
  target: 'es2015',
  tsconfig: resolve(__dirname, 'tsconfig.plugin.json'),
};

// ── Build 2: UI thread (ui.html with inline JS) ─────────────

const uiOptions = {
  ...shared,
  entryPoints: [resolve(__dirname, 'src/ui/index.tsx')],
  format: 'iife',
  target: 'es2015',
  write: false, // we handle output ourselves
  tsconfig: resolve(__dirname, 'tsconfig.ui.json'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': isWatch ? '"development"' : '"production"' },
};

/** esbuild plugin that injects the UI bundle into the HTML template after each build. */
const htmlInjectionPlugin = {
  name: 'html-injection',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      const jsCode = result.outputFiles?.[0]?.text;
      if (jsCode) {
        writeUI(jsCode);
        console.log('[ui] dist/ui.html written');
      }
    });
  },
};

// ── Run ──────────────────────────────────────────────────────

async function run() {
  if (isWatch) {
    const pluginCtx = await esbuild.context(pluginOptions);
    const uiCtx = await esbuild.context({
      ...uiOptions,
      plugins: [htmlInjectionPlugin],
    });
    await Promise.all([pluginCtx.watch(), uiCtx.watch()]);
    console.log('[watch] watching for changes…');
  } else {
    // One-shot build
    await esbuild.build(pluginOptions);
    console.log('[plugin] dist/code.js written');
    const uiResult = await esbuild.build(uiOptions);
    const jsCode = uiResult.outputFiles?.[0]?.text;
    if (jsCode) writeUI(jsCode);
    console.log('[ui] dist/ui.html written');
    console.log('[done] build complete');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
