// Post-build packaging pass, run after rollup (`npm run build`):
//
// 1. Dual-format declarations — every `dist/**/<entry>.d.ts` is copied to
//    a `.d.mts` and a `.d.cts` twin. The package's exports map points the
//    `import` condition at the `.d.mts` (ESM-declared types) and the
//    `require` condition at the `.d.cts` (CJS-declared types), so a TS
//    consumer under node16 resolution never sees a CJS-interpreted d.ts
//    next to an ESM runtime file (arethetypeswrong's FalseCJS).
//    The content is identical — rollup-plugin-dts emits format-agnostic
//    declarations — only the extension (and with it the interpreted
//    format) differs.
//
// 2. node10 redirect stubs — TypeScript's legacy `moduleResolution: node`
//    ignores the `exports` map entirely and resolves subpaths as sibling
//    files under the package root, so every public subpath gets a tiny
//    root-level `<subpath>.js` (CJS require redirect) and `<subpath>.d.ts`
//    (re-export) pair. Modern resolvers never touch them — `exports` wins
//    — they exist solely so node10 consumers (and arethetypeswrong's
//    node10 row) resolve, the same sibling-file pattern zod ships.
import {copyFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// [d.ts source, ESM/CJS runtime it serves, root stub names]
const entries = [
  {
    dts: 'dist/index.d.ts',
    cjs: './dist/index.cjs.js',
    stubs: []
  },
  {
    dts: 'dist/resolvers/standard-schema.d.ts',
    cjs: '../dist/resolvers/standard-schema.cjs.js',
    stubs: ['resolvers/standard-schema']
  },
  {
    dts: 'dist/resolvers/zod.d.ts',
    cjs: '../dist/resolvers/zod.cjs.js',
    stubs: ['resolvers/zod']
  },
  {
    dts: 'dist/resolvers/yup.d.ts',
    cjs: '../dist/resolvers/yup.cjs.js',
    stubs: ['resolvers/yup']
  },
  {
    dts: 'dist/devtools/index.d.ts',
    cjs: './dist/devtools/index.cjs.js',
    stubs: ['devtools']
  },
  {
    dts: 'dist/server/index.d.ts',
    cjs: './dist/server/index.cjs.js',
    stubs: ['server']
  },
  {
    dts: 'dist/persist.d.ts',
    cjs: './dist/persist.cjs.js',
    stubs: ['persist']
  }
];

for (const {dts, cjs, stubs} of entries) {
  // Dual-format declaration twins.
  const dtsPath = join(root, dts);
  const dtsName = dts.slice(dts.lastIndexOf('/') + 1).replace(/\.d\.ts$/, '');
  const dir = join(root, dirname(dts));
  copyFileSync(dtsPath, join(dir, `${dtsName}.d.mts`));
  copyFileSync(dtsPath, join(dir, `${dtsName}.d.cts`));

  // node10 sibling stubs at the package root.
  for (const stub of stubs) {
    const stubDir = join(root, dirname(stub));
    mkdirSync(stubDir, {recursive: true});
    // .js stays CJS: the package has no "type": "module", so a bare
    // require() of the stub resolves through the same map the legacy
    // resolver itself would have used.
    writeFileSync(
      join(root, `${stub}.js`),
      `module.exports = require('${cjs}');\n`
    );
    // The d.ts stub re-exports the bundled declaration, resolved relative
    // to the stub's own directory (resolvers/* sit one level deep).
    const rel = relative(stubDir, dts.replace(/\.d\.ts$/, ''));
    writeFileSync(
      join(root, `${stub}.d.ts`),
      `export * from '${rel.startsWith('.') ? rel : `./${rel}`}';\n`
    );
  }
}
