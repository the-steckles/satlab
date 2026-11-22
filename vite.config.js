const EMPTY = '\0satellite-wasm-stub';

export default {
  build: { rollupOptions: { input: ['index.html', 'peaker/index.html', 'mixers/index.html'] } },
  optimizeDeps: { exclude: ['satellite.js'] },
  plugins: [{
    // satellite.js re-exports a Node-flavored WASM build that this app never calls.
    name: 'drop-satellite-wasm',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source === './wasm/index.js' && importer?.replace(/\\/g, '/').includes('/satellite.js/dist/index.js')) return EMPTY;
    },
    load(id) {
      if (id === EMPTY) return 'export {}';
    },
  }],
};
