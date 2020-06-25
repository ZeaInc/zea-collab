import pkg from './package.json'

import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import nodePolyfills from 'rollup-plugin-node-polyfills';

import { terser } from 'rollup-plugin-terser'



// Transforms imports for raw imports.
// We use this for unit testing, so we can use the libraries
// without needing a bundling tool like WebPack.
// Raw imports require relative paths that can be resolved
// from the location of the current module right to the esm module.
// So we assume zea-cad is installed
// node_modules\@zeainc\zea-cad\dist
// And to get to zea-engine, we need to go up 2 folders and down into
// the folder for zea-engine and find the esm.js file.
// Normally WebPack uses the package.json file to resolve the file
// at compile time, but we want to load modules dynamically
const rawImportPathsPlugin = {
  name: 'transform-imports',
  renderChunk(code, chunk, options) {
    const repl = {
      '@zeainc/zea-engine': '../../zea-engine/dist/index.esm.js',
      '@zeainc/zea-ux': '../../zea-ux/dist/index.rawimport.js'
    }
    let result = code;
    for (let key in repl) result = result.replace(key, repl[key])
    return result;
  }
}


export default [
  // CommonJS (for Node) and ES module (for bundlers) build.
  // (We could have three entries in the configuration array
  // instead of two, but it's quicker to generate multiple
  // builds from a single configuration where possible, using
  // an array for the `output` option, where we can specify
  // `file` and `format` for each target)
  {
    input: 'src/index.js',
    external: [...Object.keys(pkg.dependencies)],
    plugins: [terser()],
    output: [
      { file: pkg.main, format: 'cjs' },
      { file: pkg.module, format: 'es' }
    ],
  },
  {
    input: 'src/index.js',
    external: ['@zeainc/zea-engine', '@zeainc/zea-ux', 'debug'],
    plugins: [nodePolyfills(), resolve(), commonjs(), terser()],
    output: [
      { file: pkg.rawimport, format: 'es', plugins: [rawImportPathsPlugin] },
    ],
  }
]
