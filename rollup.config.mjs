import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import { base64 } from 'rollup-plugin-base64';

export default {
  input: 'src/index.js',
  output: [
    {
      file: 'bundle.js',
      format: 'cjs'
    }
  ],
  plugins: [
    commonjs(),
    nodeResolve(),
    base64({ include: "**/*.wasm" }),
  ]
};