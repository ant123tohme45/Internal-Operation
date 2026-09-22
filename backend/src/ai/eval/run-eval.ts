import { EVAL_CASES, runCase } from './cases';

/**
 * The "one repeatable command" the Week 4 brief asks for
 * (docs/week4-production-ai.md has the full write-up). Run with:
 *
 *   npm run eval:ai        (from backend/)
 *
 * Needs no API key and makes no network call — every case here runs
 * against the same default, deterministic HeuristicIntakeAiProvider the
 * app ships with (or a deliberately broken test-double provider, for the
 * provider-failure / invalid-output cases — see cases.ts). Exits non-zero
 * if any case fails, so it can be wired into CI later without changes.
 */
async function main(): Promise<void> {
  console.log(`Running ${EVAL_CASES.length} AI intake eval cases...\n`);

  let passed = 0;
  const rows: { id: string; category: string; outcome: string; detail: string }[] = [];

  for (const evalCase of EVAL_CASES) {
    const { result, failure } = await runCase(evalCase);
    const ok = failure === null;
    if (ok) passed += 1;

    rows.push({
      id: evalCase.id,
      category: evalCase.category,
      outcome: ok ? 'PASS' : 'FAIL',
      detail: ok
        ? result.matched
          ? `matched ${result.serviceId} (confidence ${result.confidence.toFixed(2)})`
          : `unmatched: ${result.reason}`
        : failure!,
    });
  }

  const idWidth = Math.max(...rows.map((r) => r.id.length), 'CASE'.length);
  const catWidth = Math.max(...rows.map((r) => r.category.length), 'CATEGORY'.length);

  const line = (id: string, cat: string, outcome: string, detail: string) =>
    `${id.padEnd(idWidth)}  ${cat.padEnd(catWidth)}  ${outcome.padEnd(4)}  ${detail}`;

  console.log(line('CASE', 'CATEGORY', 'OK', 'DETAIL'));
  console.log('-'.repeat(idWidth + catWidth + 60));
  for (const row of rows) {
    console.log(line(row.id, row.category, row.outcome, row.detail));
  }

  console.log(`\n${passed}/${EVAL_CASES.length} eval cases passed.`);

  if (passed !== EVAL_CASES.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Eval run crashed:', err);
  process.exitCode = 1;
});
