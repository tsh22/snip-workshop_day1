import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(root, 'bundle');
const frontend = path.join(root, 'frontend');
const frontendOutput = path.join(
  frontend,
  'dist',
  'snip-frontend',
  'browser',
);
const push = process.argv.slice(2).includes('--push');
const unexpectedArgs = process.argv.slice(2).filter((arg) => arg !== '--push');

if (unexpectedArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unexpectedArgs.join(' ')}`);
}

function command(commandName, args, cwd = root, capture = false) {
  const result = spawnSync(commandName, args, {
    cwd,
    encoding: 'utf8',
    shell: process.platform === 'win32' && commandName !== 'git',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${commandName} ${args.join(' ')} failed with exit code ${result.status}`,
    );
  }

  return capture ? result.stdout.trim() : '';
}

function hasStagedChanges(cwd) {
  const result = spawnSync('git', ['diff', '--cached', '--quiet'], {
    cwd,
    shell: false,
    windowsHide: true,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(`git diff --cached failed in ${cwd}`);
  }
  return result.status === 1;
}

function assertNoStagedChanges(cwd, label) {
  if (hasStagedChanges(cwd)) {
    throw new Error(
      `${label} has staged changes; commit or unstage them before building`,
    );
  }
}

function assertCleanSubmodule(cwd, label) {
  const status = command('git', ['status', '--porcelain'], cwd, true);
  if (status) {
    throw new Error(
      `${label} has local changes; commit or restore them before building:\n${status}`,
    );
  }
}

assertNoStagedChanges(root, 'Superproject');
command('git', [
  'submodule',
  'update',
  '--init',
  '--remote',
  'backend',
  'frontend',
  'cli',
]);
command('git', ['submodule', 'update', '--init', 'bundle']);

for (const name of ['backend', 'frontend', 'cli', 'bundle']) {
  assertCleanSubmodule(path.join(root, name), `${name} submodule`);
}

command('npm', ['ci'], frontend);
command('npx', ['ng', 'build'], frontend);

if (!existsSync(path.join(frontendOutput, 'index.html'))) {
  throw new Error(`Angular build output is missing: ${frontendOutput}\\index.html`);
}

cpSync(path.join(root, 'backend', 'server.js'), path.join(bundle, 'server.js'));
cpSync(path.join(root, 'cli', 'cli.js'), path.join(bundle, 'cli.js'));
rmSync(path.join(bundle, 'public'), { recursive: true, force: true });
mkdirSync(path.join(bundle, 'public'), { recursive: true });
cpSync(frontendOutput, path.join(bundle, 'public'), { recursive: true });
writeFileSync(
  path.join(bundle, '.env'),
  'PUBLIC_DIR=./public\n',
  'utf8',
);
writeFileSync(
  path.join(bundle, 'package.json'),
  `${JSON.stringify({ name: 'snip-bundle', scripts: { start: 'bun server.js' } }, null, 2)}\n`,
  'utf8',
);
writeFileSync(
  path.join(bundle, 'Dockerfile'),
  [
    'FROM oven/bun:1-alpine',
    'WORKDIR /app',
    'COPY . .',
    'ENV PORT=3000',
    'EXPOSE 3000',
    'CMD ["bun", "server.js"]',
    '',
  ].join('\n'),
  'utf8',
);
writeFileSync(
  path.join(bundle, '.dockerignore'),
  ['.git', '.gitmodules', 'node_modules', '*.log', 'npm-debug.log*', ''].join('\n'),
  'utf8',
);
writeFileSync(
  path.join(bundle, 'railway.json'),
  `${JSON.stringify(
    {
      '$schema': 'https://railway.app/railway.schema.json',
      build: { builder: 'DOCKERFILE' },
    },
    null,
    2,
  )}\n`,
  'utf8',
);

const bundleGit = (args, capture = false) =>
  command('git', args, bundle, capture);

assertNoStagedChanges(bundle, 'Bundle submodule');
bundleGit([
  'add',
  '--',
  '.dockerignore',
  '.env',
  'Dockerfile',
  'cli.js',
  'package.json',
  'public',
  'railway.json',
  'server.js',
]);

const bundleChanged = hasStagedChanges(bundle);
if (bundleChanged) {
  bundleGit([
    'commit', '-m', 'Build generated bundle',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\nCo-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
  ]);
  console.log('Committed generated bundle.');
} else {
  console.log('Bundle unchanged; nothing to commit.');
}

command('git', ['add', '--', 'backend', 'frontend', 'cli', 'bundle']);
if (hasStagedChanges(root)) {
  command('git', [
    'commit', '-m', 'Update generated bundle and source pointers',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>\nCo-authored-by: OpenBot <335604065+openbotgit[bot]@users.noreply.github.com>',
  ]);
  console.log('Committed updated superproject pointers.');
} else {
  console.log('Superproject pointers unchanged; nothing to commit.');
}

if (push) {
  command('git', ['push', 'origin', 'HEAD:bundle'], bundle);
  command('git', ['push', 'origin', 'main']);
  console.log('Pushed bundle and main.');
} else {
  console.log('Not pushed; pass --push to publish bundle and main.');
}
