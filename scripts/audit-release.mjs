import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, writeFile, lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../backend/src/config.mjs';

export function inspectReleaseFile(path, content = '') {
  const findings = [];
  const name = path.replaceAll('\\', '/');
  if (
    /(^|\/)(?:node_modules|\.venv|\.tools|\.cache|dist)(\/|$)/.test(name) ||
    (/(^|\/)\.env(?:\..*)?$/.test(name) && !name.endsWith('.env.example')) ||
    (/^(?:storage|samples|results|models)\//.test(name) &&
      !name.endsWith('/.gitkeep')) ||
    /\.(?:wav|mp3|flac|ckpt|pth|pt|onnx|pem|key)$/i.test(name)
  )
    findings.push('PRIVATE_ARTIFACT');
  if (/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/.test(content))
    findings.push('PRIVATE_KEY');
  if (
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b|\bAKIA[0-9A-Z]{16}\b/.test(
      content,
    )
  )
    findings.push('ACCESS_KEY');
  const urls = content.match(/mysql:\/\/[^\s"'`<>]+/g) ?? [];
  for (const value of urls) {
    try {
      const url = new URL(value);
      if (url.password && !['CHANGE_ME', 'test'].includes(url.password))
        findings.push('DATABASE_CREDENTIAL');
    } catch {
      /* Template fragments are not complete credentials. */
    }
  }
  return [...new Set(findings)];
}

export async function auditRelease() {
  const { stdout } = await promisify(execFile)(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd: ROOT, maxBuffer: 4 * 1024 ** 2, windowsHide: true },
  );
  const paths = [...new Set(stdout.split('\0').filter(Boolean))];
  const findings = [];
  for (const path of paths) {
    const metadata = await lstat(resolve(ROOT, path));
    let codes = inspectReleaseFile(path);
    if (metadata.isSymbolicLink()) codes.push('SYMLINK_REQUIRES_REVIEW');
    else if (metadata.size > 16 * 1024 ** 2)
      codes.push('LARGE_FILE_REQUIRES_REVIEW');
    else if (!codes.length) {
      const content = await readFile(resolve(ROOT, path));
      codes = inspectReleaseFile(path, content.toString('utf8'));
    }
    if (codes.length) findings.push({ path, codes });
  }
  return {
    status: findings.length ? 'FAIL' : 'PASS',
    scope:
      'Tracked and non-ignored working files; heuristic scan, not proof of absence of all secrets',
    filesScanned: paths.length,
    findings,
    generatedAt: new Date().toISOString(),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const report = await auditRelease();
  await writeFile(
    resolve(ROOT, 'docs/reports/epic-06-audit.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Release audit: ${report.status}; ${report.filesScanned} files; ${report.findings.length} findings. Values are never printed.`,
  );
  if (report.status !== 'PASS') process.exitCode = 1;
}
