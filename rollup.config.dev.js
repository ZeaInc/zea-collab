import pkg from './package.json'

const plugins = []
const external = [...Object.keys(pkg.dependencies)]
const sourcemap = true

export default [
  // Browser-friendly UMD build.
  {
    input: 'src/index.js',
    external,
    output: {
      name: 'zeaCollab',
      file: pkg.browser,
      format: 'umd',
      sourcemap,
      globals: {
        '@zeainc/zea-engine': 'zeaEngine',
        '@zeainc/zea-Ux': 'zeaUx',
      },
    },
    plugins,
  },
  // CommonJS (for Node) and ES module (for bundlers) build.
  // (We could have three entries in the configuration array
  // instead of two, but it's quicker to generate multiple
  // builds from a single configuration where possible, using
  // an array for the `output` option, where we can specify
  // `file` and `format` for each target)
  {
    input: 'src/index.js',
    external,
    plugins,
    output: [
      { file: pkg.main, format: 'cjs', sourcemap },
      { file: pkg.module, format: 'es', sourcemap },
    ],
  },
]
