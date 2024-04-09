import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['./src/cli.ts'],
    bundle: true,
    platform: 'node',
    format: ['cjs'],
    outDir: 'dist',
    noExternal: [/.*/],
});
