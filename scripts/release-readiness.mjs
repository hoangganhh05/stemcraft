import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../backend/src/config.mjs';
import { auditRelease } from './audit-release.mjs';

export function assessRelease({ audit, qa, doctor, clean, demo, profile }) {
  const checks = {
    audit: audit?.status ?? 'NOT_RUN',
    regression: qa?.status ?? 'NOT_RUN',
    doctor: doctor?.status ?? 'NOT_RUN',
    cleanNode: clean?.status ?? 'NOT_RUN',
    realBrowserDemo: demo?.status ?? 'NOT_RUN',
  };
  if (demo?.status === 'PASS' && demo.profileId !== profile?.id)
    checks.realBrowserDemo = 'STALE_PROFILE';
  const blockers = [
    'WEIGHTS_LICENSE_UNVERIFIED',
    'CPU_GPU_COMPARISON_NOT_AVAILABLE',
    'FULL_TRACK_CAPACITY_NOT_VERIFIED',
    'CLEAN_WINDOWS_SETUP_NOT_VERIFIED',
  ];
  if (checks.realBrowserDemo !== 'PASS')
    blockers.push('FRESH_BROWSER_TO_REAL_AI_DEMO_NOT_ACCEPTED');
  return {
    checks,
    localDecision: Object.values(checks).every((status) => status === 'PASS')
      ? 'GO_SHORT_CLIPS_CURRENT_HOST'
      : 'NOT_ACCEPTED',
    publicDecision: 'NO_GO',
    blockers,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const read = async (path) => {
    try {
      return JSON.parse(await readFile(resolve(ROOT, path), 'utf8'));
    } catch {
      return null;
    }
  };
  const audit = await auditRelease();
  await writeFile(
    resolve(ROOT, 'docs/reports/epic-06-audit.json'),
    `${JSON.stringify(audit, null, 2)}\n`,
  );
  const result = assessRelease({
    audit,
    qa: await read('docs/reports/epic-05-regression.json'),
    doctor: await read('docs/reports/epic-06-doctor.json'),
    clean: await read('docs/reports/epic-06-clean-node.json'),
    demo: await read('docs/reports/epic-06-real-demo.json'),
    profile: await read('config/ai-profile.json'),
  });
  const report = {
    generatedAt: new Date().toISOString(),
    candidate: 'local-development-candidate',
    ...result,
    localScope:
      'Short clips on current Windows host only; no clean-machine or full-track certification',
  };
  await writeFile(
    resolve(ROOT, 'docs/reports/epic-06-readiness.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(
    `Local: ${report.localDecision}; public: ${report.publicDecision}. See docs/reports/epic-06-readiness.json`,
  );
  if (report.localDecision === 'NOT_ACCEPTED') process.exitCode = 1;
}
