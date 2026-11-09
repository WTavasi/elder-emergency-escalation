// Writes a coverage table for the run's summary page from Istanbul's json-summary.
//
//   node scripts/coverage-summary.mjs "API" backend/coverage/coverage-summary.json
//
// Appends to $GITHUB_STEP_SUMMARY in CI, and prints to the terminal otherwise.

import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [title, file] = process.argv.slice(2);
if (!title || !file) {
  console.error('Usage: node scripts/coverage-summary.mjs <title> <coverage-summary.json>');
  process.exit(2);
}

let table;
if (existsSync(file)) {
  const { total } = JSON.parse(readFileSync(file, 'utf8'));
  const row = (name, key) => {
    const { covered, total: all, pct } = total[key];
    return `| ${name} | ${pct.toFixed(1)}% | ${covered} of ${all} |`;
  };
  table = [
    `### ${title} test coverage`,
    '',
    '| Measure | Covered | Count |',
    '| --- | --- | --- |',
    row('Lines', 'lines'),
    row('Statements', 'statements'),
    row('Functions', 'functions'),
    row('Branches', 'branches'),
    '',
  ].join('\n');
} else {
  table = `### ${title} test coverage\n\nNo coverage summary was produced (${file}).\n`;
}

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
else console.warn(table);
