#!/usr/bin/env node
/**
 * Summarizes a Playwright JSON report (`e2e-results/results.json`) as a pass
 * rate over the critical user flows and enforces a minimum.
 *
 *   node scripts/e2e-pass-rate.mjs [path/to/results.json]
 *
 * Prints `passed/total (xx.x%)`, appends a markdown table to
 * `$GITHUB_STEP_SUMMARY` when that file is set (GitHub Actions), and exits 1
 * when the rate is below `E2E_MIN_PASS_RATE` (percent, default 95).
 *
 * A test counts as passed when its final attempt passed (retries are allowed);
 * skipped tests are reported but excluded from the denominator, so a flow that
 * declines to run for a documented precondition (e.g. no testnet USDC) does not
 * masquerade as a failure or as a pass.
 */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

const reportPath = resolve(process.argv[2] ?? 'e2e-results/results.json');
const minRate = Number(process.env.E2E_MIN_PASS_RATE ?? 95);

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  console.error(`Could not read the Playwright JSON report at ${reportPath}: ${error.message}`);
  process.exit(1);
}

const rows = [];
const walk = (suite, trail) => {
  const here = suite.title ? [...trail, suite.title] : trail;
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests ?? []) {
      // `expectedStatus` is what the spec declared (skipped/fixme tests expect 'skipped').
      const outcome = test.status; // 'expected' | 'unexpected' | 'flaky' | 'skipped'
      const last = test.results?.[test.results.length - 1];
      rows.push({
        file: suite.file ?? here[0] ?? '',
        title: [...here.slice(1), spec.title].join(' › '),
        outcome,
        attempts: test.results?.length ?? 0,
        durationMs: (test.results ?? []).reduce((sum, r) => sum + (r.duration ?? 0), 0),
        skipReason: outcome === 'skipped' ? (last?.annotations ?? test.annotations ?? []).find((a) => a.type === 'skip')?.description ?? '' : '',
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, here);
};
for (const suite of report.suites ?? []) walk(suite, []);

const passed = rows.filter((r) => r.outcome === 'expected' || r.outcome === 'flaky').length;
const failed = rows.filter((r) => r.outcome === 'unexpected').length;
const skipped = rows.filter((r) => r.outcome === 'skipped').length;
const total = passed + failed;
const rate = total === 0 ? 0 : (passed / total) * 100;
const rateLabel = `${rate.toFixed(1)}%`;

console.log(`${passed}/${total} (${rateLabel}) passed, ${failed} failed, ${skipped} skipped`);

const icon = { expected: 'pass', flaky: 'pass (retried)', unexpected: 'FAIL', skipped: 'skipped' };
const table = [
  '| Spec | Test | Result | Attempts | Duration |',
  '|---|---|---|---|---|',
  ...rows.map(
    (r) =>
      `| ${r.file} | ${r.title.replace(/\|/g, '\\|')} | ${icon[r.outcome] ?? r.outcome}${r.skipReason ? ` — ${r.skipReason}` : ''} | ${r.attempts} | ${(r.durationMs / 1000).toFixed(1)}s |`,
  ),
].join('\n');

const summary = [
  '## End-to-end pass rate',
  '',
  `**${passed}/${total} critical-flow tests passed (${rateLabel})** — threshold ${minRate}%${skipped ? `, ${skipped} skipped` : ''}`,
  '',
  table,
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
} else {
  console.log(`\n${table}`);
}

if (total === 0) {
  console.error('No tests ran — refusing to report a pass rate.');
  process.exit(1);
}
if (rate < minRate) {
  console.error(`Pass rate ${rateLabel} is below the required ${minRate}%.`);
  process.exit(1);
}
