import commonjs from '@rollup/plugin-commonjs';
import { nodeResolve } from '@rollup/plugin-node-resolve';

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
  ]
};