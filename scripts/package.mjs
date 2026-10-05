// Builds dist/rotty-lite-<version>.zip from extension/, ready to load in Chrome or attach to a release.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const { version } = JSON.parse(readFileSync(join(root, 'extension/manifest.json'), 'utf8'));
const out = join(root, 'dist', `rotty-lite-${version}.zip`);
mkdirSync(join(root, 'dist'), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-rqX', out, '.', '-x', '.*'], { cwd: join(root, 'extension'), stdio: 'inherit' });
console.log(`Built ${out.replace(root, '')}`);
