#!/usr/bin/env node
/**
 * MzaziCare token build.
 *
 * Reads tokens.json and generates the Dart, CSS and TypeScript consumers, then
 * recomputes every declared contrast pair to WCAG 2.1 and exits non-zero if any
 * pair falls below its documented minimum. No dependencies, so CI needs nothing
 * but Node.
 *
 * Usage:
 *   node src/build.mjs           build outputs and run the contrast gate
 *   node src/build.mjs --check   run the contrast gate only, write nothing
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, '..');
const distDir = join(pkgRoot, 'dist');

// Flutter resolves a path dependency through lib/, not dist/, so the Dart output goes
// there instead. That makes packages/tokens a real Dart package as well as an npm one,
// and the app depends on it rather than reaching into a build directory, which is the
// same relationship the dashboard has with the CSS.
const dartLibDir = join(pkgRoot, 'lib', 'src');
const checkOnly = process.argv.includes('--check');

const tokens = JSON.parse(readFileSync(join(pkgRoot, 'tokens.json'), 'utf8'));

/* ---------- reference resolution ---------- */

function resolve(value, path) {
  if (typeof value !== 'string' || !value.startsWith('$')) return value;
  const key = value.slice(1);
  const hex = tokens.primitives[key];
  if (!hex) throw new Error(`Unknown primitive "${key}" referenced at ${path}`);
  return hex;
}

const themes = {};
for (const [themeName, roles] of Object.entries(tokens.themes)) {
  themes[themeName] = Object.fromEntries(
    Object.entries(roles).map(([role, value]) => [
      role,
      resolve(value, `themes.${themeName}.${role}`),
    ]),
  );
}

/* ---------- WCAG 2.1 contrast ---------- */

function channel(v) {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function luminance(hex) {
  const h = hex.replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const results = tokens.contrastTargets.map((t) => {
  const theme = themes[t.theme];
  if (!theme) throw new Error(`Unknown theme "${t.theme}" in contrastTargets`);
  const fg = theme[t.fg];
  const bg = theme[t.bg];
  if (!fg) throw new Error(`Unknown role "${t.fg}" in theme "${t.theme}"`);
  if (!bg) throw new Error(`Unknown role "${t.bg}" in theme "${t.theme}"`);
  const ratio = Math.round(contrast(fg, bg) * 100) / 100;
  return { ...t, fgHex: fg, bgHex: bg, ratio, pass: ratio >= t.min };
});

const failures = results.filter((r) => !r.pass);

/* ---------- generators ---------- */

const banner = (comment) =>
  [
    `${comment} GENERATED FILE. Do not edit.`,
    `${comment} Source: packages/tokens/tokens.json`,
    `${comment} Regenerate: npm run tokens:build`,
    `${comment} ${tokens.meta.name} v${tokens.meta.version}`,
    '',
  ].join('\n');

const cssBanner = () =>
  [
    '/*',
    ' * GENERATED FILE. Do not edit.',
    ' * Source: packages/tokens/tokens.json',
    ' * Regenerate: npm run tokens:build',
    ` * ${tokens.meta.name} v${tokens.meta.version}`,
    ' */',
    '',
  ].join('\n');

const kebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();

function cssBlock(theme, indent = '  ') {
  return Object.entries(theme)
    .map(([role, hex]) => `${indent}--${kebab(role)}: ${hex};`)
    .join('\n');
}

function buildCss() {
  const { space, radius, motion, type } = tokens;
  const scale = [
    ...space.map((v) => `  --space-${v}: ${v}px;`),
    ...Object.entries(radius).map(
      ([k, v]) => `  --radius-${kebab(k)}: ${v === 999 ? '999px' : v + 'px'};`,
    ),
    ...Object.entries(motion).map(([k, v]) => `  --motion-${kebab(k)}: ${v}ms;`),
    ...Object.entries(type.standard).map(([k, v]) => `  --font-size-${kebab(k)}: ${v}px;`),
    `  --font-sans: "${type.family.sans}", system-ui, -apple-system, "Segoe UI", sans-serif;`,
    `  --font-display: "${type.family.display}", system-ui, sans-serif;`,
    `  --font-mono: "${type.family.mono}", ui-monospace, monospace;`,
    `  --min-touch-target: ${type.minTouchTarget.standard}px;`,
  ].join('\n');

  return [
    cssBanner(),
    ':root {',
    cssBlock(themes.light),
    scale,
    '}',
    '',
    '/* System dark, guarded so an explicit light choice still wins. */',
    '@media (prefers-color-scheme: dark) {',
    '  :root:not([data-theme="light"]) {',
    cssBlock(themes.dark, '    '),
    '  }',
    '}',
    '',
    '/* Explicit dark choice. */',
    ':root[data-theme="dark"] {',
    cssBlock(themes.dark),
    '}',
    '',
  ].join('\n');
}

function dartColorClass(name, theme) {
  const fields = Object.entries(theme)
    .map(
      ([role, hex]) =>
        `  static const Color ${role} = Color(0xFF${hex.replace('#', '').toUpperCase()});`,
    )
    .join('\n');
  return [`class ${name} {`, `  ${name}._();`, '', fields, '}'].join('\n');
}

function buildDart() {
  const { type, space, radius, elevation, motion } = tokens;
  const doubles = (obj, prefix = '') =>
    Object.entries(obj)
      .map(([k, v]) => `  static const double ${prefix}${k} = ${Number(v).toFixed(1)};`)
      .join('\n');

  return [
    banner('//'),
    "import 'package:flutter/painting.dart';",
    '',
    dartColorClass('MzaziColorsLight', themes.light),
    '',
    dartColorClass('MzaziColorsDark', themes.dark),
    '',
    'class MzaziFont {',
    '  MzaziFont._();',
    '',
    `  static const String sans = '${type.family.sans}';`,
    `  static const String display = '${type.family.display}';`,
    `  static const String mono = '${type.family.mono}';`,
    '}',
    '',
    '/// Elder-facing scale. Body text never drops below [MzaziA11y.elderMinBodySize].',
    'class MzaziTypeElder {',
    '  MzaziTypeElder._();',
    '',
    doubles(type.elder),
    '}',
    '',
    '/// Caregiver, responder and administrator scale.',
    'class MzaziTypeStandard {',
    '  MzaziTypeStandard._();',
    '',
    doubles(type.standard),
    '}',
    '',
    'class MzaziSpace {',
    '  MzaziSpace._();',
    '',
    space.map((v) => `  static const double s${v} = ${v.toFixed(1)};`).join('\n'),
    '',
    `  static const List<double> scale = <double>[${space.map((v) => v.toFixed(1)).join(', ')}];`,
    '}',
    '',
    'class MzaziRadius {',
    '  MzaziRadius._();',
    '',
    doubles(radius),
    '}',
    '',
    'class MzaziElevation {',
    '  MzaziElevation._();',
    '',
    doubles(elevation),
    '}',
    '',
    'class MzaziMotion {',
    '  MzaziMotion._();',
    '',
    Object.entries(motion)
      .map(([k, v]) => `  static const Duration ${k} = Duration(milliseconds: ${v});`)
      .join('\n'),
    '}',
    '',
    '/// Accessibility floors. These are asserted in widget tests, not just documented.',
    'class MzaziA11y {',
    '  MzaziA11y._();',
    '',
    `  static const double elderMinBodySize = ${type.minBodySize.elder.toFixed(1)};`,
    `  static const double standardMinBodySize = ${type.minBodySize.standard.toFixed(1)};`,
    `  static const double elderMinTouchTarget = ${type.minTouchTarget.elder.toFixed(1)};`,
    `  static const double standardMinTouchTarget = ${type.minTouchTarget.standard.toFixed(1)};`,
    '}',
    '',
  ].join('\n');
}

function buildTs() {
  const payload = {
    meta: tokens.meta,
    primitives: tokens.primitives,
    themes,
    type: tokens.type,
    space: tokens.space,
    radius: tokens.radius,
    elevation: tokens.elevation,
    motion: tokens.motion,
  };
  return [
    banner('//'),
    `export const tokens = ${JSON.stringify(payload, null, 2)} as const;`,
    '',
    'export type ThemeName = keyof typeof tokens.themes;',
    'export type ColorRole = keyof typeof tokens.themes.light;',
    '',
    'export function color(theme: ThemeName, role: ColorRole): string {',
    '  return tokens.themes[theme][role];',
    '}',
    '',
    'export default tokens;',
    '',
  ].join('\n');
}

/* ---------- report ---------- */

const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${tokens.meta.name} v${tokens.meta.version}`);
console.log(`Contrast gate: ${results.length} declared pairs\n`);
console.log(`  ${pad('theme', 6)} ${pad('pair', 44)} ${pad('ratio', 7)} ${pad('min', 5)} result`);
for (const r of results) {
  const pair = `${r.fg} on ${r.bg}`;
  console.log(
    `  ${pad(r.theme, 6)} ${pad(pair, 44)} ${pad(r.ratio.toFixed(2) + ':1', 7)} ${pad(r.min, 5)} ${r.pass ? 'pass' : 'FAIL'}`,
  );
}

if (failures.length > 0) {
  console.error(`\n${failures.length} contrast target(s) below minimum:`);
  for (const f of failures) {
    console.error(
      `  ${f.theme}: ${f.fg} (${f.fgHex}) on ${f.bg} (${f.bgHex}) is ${f.ratio}:1, needs ${f.min}:1 for ${f.why}`,
    );
  }
  console.error('\nFix the values in tokens.json, or change the documented minimum and say why.');
  process.exit(1);
}

if (checkOnly) {
  console.log('\nAll contrast targets met. No files written (--check).\n');
  process.exit(0);
}

mkdirSync(distDir, { recursive: true });
mkdirSync(dartLibDir, { recursive: true });
writeFileSync(join(distDir, 'tokens.css'), buildCss());
writeFileSync(join(dartLibDir, 'tokens.dart'), buildDart());
writeFileSync(join(distDir, 'tokens.ts'), buildTs());
writeFileSync(
  join(distDir, 'contrast-report.json'),
  JSON.stringify({ generatedFrom: 'tokens.json', version: tokens.meta.version, results }, null, 2) +
    '\n',
);

console.log('\nAll contrast targets met. Wrote:');
for (const f of ['tokens.css', 'tokens.ts', 'contrast-report.json']) {
  console.log(`  packages/tokens/dist/${f}`);
}
console.log('  packages/tokens/lib/src/tokens.dart');
console.log('');
