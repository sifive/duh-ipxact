'use strict';

require('esbuild').build({
  entryPoints: ['bin/duh-ipxact.js'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  outfile: 'dist/duh-ipxact.js'
}).catch(() => process.exit(1));

/* eslint no-console: 0 */
