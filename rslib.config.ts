import { defineConfig } from '@rslib/core';
import { builtinModules } from 'node:module';

export default defineConfig({
  lib: [
    {
      format: 'esm',
      syntax: 'es2022',
      dts: { bundle: true },
    },
    {
      format: 'cjs',
      syntax: 'es2022',
    },
  ],
  output: {
    externals: Object.fromEntries(builtinModules.map((module) => [module, `node:${module}`])),
  },
});
