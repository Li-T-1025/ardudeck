import { build } from 'esbuild';

/**
 * Host externals for a cargo bundle.
 *
 * This mirrors `packages/module-sdk/src/esbuild.ts`. It is inlined rather than
 * imported because the SDK's `exports` map points at TypeScript sources: that
 * import only resolves once esbuild bundles it, and this file runs under plain
 * Node. React must come from the host, or a module's hooks run on a second
 * React instance and never see the app's state.
 */
const HOST_GLOBAL_MAP = {
  react: 'window.__ardudeckHost.react',
  'react-dom': 'window.__ardudeckHost.reactDom',
  'react-dom/client': 'window.__ardudeckHost.reactDom',
};

function ardudeckModulePlugin() {
  return {
    name: 'ardudeck-module-host-externals',
    setup(b) {
      const filter = new RegExp(
        `^(${Object.keys(HOST_GLOBAL_MAP)
          .map((s) => s.replace(/\//g, '\\/'))
          .join('|')})$`,
      );
      b.onResolve({ filter }, (args) => ({ path: args.path, namespace: 'ardudeck-host-ext' }));
      b.onLoad({ filter: /.*/, namespace: 'ardudeck-host-ext' }, (args) => ({
        contents: `module.exports = ${HOST_GLOBAL_MAP[args.path] ?? 'undefined'};`,
        loader: 'js',
      }));
    },
  };
}

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  jsx: 'automatic',
  plugins: [ardudeckModulePlugin()],
  logLevel: 'info',
};

await Promise.all([
  build({
    ...common,
    // The main entry runs in the extension host, not a browser.
    platform: 'node',
    entryPoints: ['src/main/index.ts'],
    outfile: 'dist/main.js',
    external: ['electron'],
  }),
  build({
    ...common,
    platform: 'browser',
    entryPoints: ['src/renderer/index.tsx'],
    outfile: 'dist/renderer.js',
  }),
]);

console.log('built dist/main.js and dist/renderer.js');
