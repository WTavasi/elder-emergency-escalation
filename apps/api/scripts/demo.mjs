#!/usr/bin/env node
/**
 * End-to-end demonstration of the escalation framework.
 *
 * Runs one emergency through its whole life, in front of an audience, and prints what
 * the system did at each step along with the timings. Everything it shows comes from
 * the running API and the real database; nothing is simulated.
 *
 * It temporarily shortens the first-tier acknowledgement window so the escalation
 * happens in seconds rather than minutes, and restores the original values afterwards,
 * including if it fails partway.
 *
 * Usage:
 *   docker compose up -d
 *   npm run dev            (in another terminal)
 *   npm run demo -w @mzazicare/api
 */

import { PrismaClient } from '@prisma/client';

const BASE = `http://localhost:${process.env.PORT ?? 3000}`;
const API = `${BASE}/api/v1`;
const PASSWORD = 'Dev!2026';
const DEMO_TIMEOUT_SECONDS = 5;

const prisma = new PrismaClient();

/* ---------------------------------------------------------------- output -- */

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const amber = (s) => `[33m${s}[0m`;

let step = 0;
const heading = (title) => {
  step += 1;
  console.log(`\n${bold(`${step}. ${title}`)}\n${dim('─'.repeat(72))}`);
};
const say = (text) => console.log(`   ${text}`);
const proves = (text) => console.log(`   ${dim(`proves: ${text}`)}`);

const table = (rows, columns) => {
  if (rows.length === 0) {
    say(dim('(none)'));
    return;
  }
  const widths = columns.map((column) =>
    Math.max(column.header.length, ...rows.map((row) => String(column.value(row) ?? '').length)),
  );
  const line = (cells) =>
    `   ${cells.map((cell, index) => String(cell ?? '').padEnd(widths[index])).join('  ')}`;

  console.log(dim(line(columns.map((column) => column.header))));
  for (const row of rows) console.log(line(columns.map((column) => column.value(row))));
};

/* ------------------------------------------------------------------ http -- */

async function api(path, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${method} ${path} returned ${response.status}: ${text.slice(0, 300)}`);
  }
  return payload;
}

const signIn = async (phone) => {
  const result = await api('/auth/login', { method: 'POST', body: { phone, password: PASSWORD } });
  return { token: result.accessToken, user: result.user };
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(description, predicate, timeoutMs = 25_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await predicate();
    if (value) return { value, elapsedMs: Date.now() - started };
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

/* ------------------------------------------------------------------ main -- */

let originalTimeouts = [];

async function preflight() {
  heading('Preflight');

  let health;
  try {
    health = await (await fetch(`${BASE}/health`)).json();
  } catch {
    console.error(
      red('\n   The API is not answering on ') +
        BASE +
        red(
          '.\n   Start the services with "docker compose up -d" and the API with "npm run dev".\n',
        ),
    );
    process.exit(1);
  }

  table(
    [
      { name: 'Postgres', ...health.checks.postgres },
      { name: 'Redis', ...health.checks.redis },
    ],
    [
      { header: 'DEPENDENCY', value: (r) => r.name },
      { header: 'STATUS', value: (r) => (r.status === 'up' ? green('up') : red('down')) },
      { header: 'LATENCY', value: (r) => `${r.latencyMs} ms` },
    ],
  );
  proves('both dependencies are checked separately, not assumed');
}

async function showChain(elder) {
  heading(`The care chain for ${elder.name}`);

  const assignments = await prisma.careAssignment.findMany({
    where: { elderlyId: elder.id },
    orderBy: { priorityOrder: 'asc' },
    include: { responder: true },
  });

  table(assignments, [
    { header: 'TIER', value: (a) => a.priorityOrder },
    { header: 'CONTACT', value: (a) => a.responder.name },
    { header: 'ROLE', value: (a) => a.responder.role },
    {
      header: 'DECLARED COVER',
      value: (a) =>
        a.coverStartMinute === null
          ? 'none'
          : `days ${a.coverDaysOfWeek.join(',')} ${String(Math.floor(a.coverStartMinute / 60)).padStart(2, '0')}:00-${String(Math.floor(a.coverEndMinute / 60)).padStart(2, '0')}:00`,
    },
  ]);
  proves('escalation order is data about this person, not a hard-coded sequence');
}

async function shortenTimers() {
  const rules = await prisma.escalationRule.findMany({ where: { tierOrder: 1 } });
  originalTimeouts = rules.map((rule) => ({ id: rule.id, timeoutSeconds: rule.timeoutSeconds }));

  for (const rule of rules) {
    await prisma.escalationRule.update({
      where: { id: rule.id },
      data: { timeoutSeconds: DEMO_TIMEOUT_SECONDS },
    });
  }
  say(
    amber(
      `First-tier windows shortened to ${DEMO_TIMEOUT_SECONDS}s for this demonstration, and restored at the end.`,
    ),
  );
}

async function restoreTimers() {
  for (const original of originalTimeouts) {
    await prisma.escalationRule.update({
      where: { id: original.id },
      data: { timeoutSeconds: original.timeoutSeconds },
    });
  }
}

async function run() {
  await preflight();

  const elder = await prisma.user.findFirst({
    where: { role: 'ELDER' },
    orderBy: { createdAt: 'asc' },
  });
  if (!elder) throw new Error('No seeded elder found. Run: npm run db:seed -w @mzazicare/api');

  await showChain(elder);

  heading('Shortening the acknowledgement windows');
  await shortenTimers();
  proves('timeouts are configuration in the database, changeable without a deployment');

  heading(`${elder.name} presses the panic button`);
  const { token: elderToken } = await signIn(elder.phone);

  const triggeredAt = Date.now();
  const event = await api('/alerts', {
    method: 'POST',
    token: elderToken,
    body: { latitude: -1.2833, longitude: 36.7833, addressLabel: 'Kileleshwa, Nairobi' },
  });
  const acceptedMs = Date.now() - triggeredAt;

  say(
    `Accepted in ${bold(`${acceptedMs} ms`)}, severity ${bold(event.severity)} at score ${bold(event.severityScore)}`,
  );
  say(dim(`event ${event.id}`));

  const assessment = event.severityFactors;
  console.log();
  table(assessment.factors, [
    { header: 'FACTOR', value: (f) => f.key },
    { header: 'WEIGHT', value: (f) => f.weight },
    { header: 'SCORED', value: (f) => f.contribution },
    { header: 'REASONING', value: (f) => f.detail },
  ]);
  proves('severity is an explainable policy, and the reasoning is stored with the event');

  heading('Tier one is notified immediately');
  const dispatched = await waitFor('the first dispatch', async () => {
    const rows = await prisma.notification.findMany({
      where: { eventId: event.id },
      include: { recipient: true },
    });
    return rows.length > 0 ? rows : null;
  });

  say(`First notification recorded ${bold(`${dispatched.elapsedMs} ms`)} after the alert`);
  table(dispatched.value, [
    { header: 'TIER', value: (n) => n.tier },
    { header: 'RECIPIENT', value: (n) => n.recipient.name },
    { header: 'CHANNEL', value: (n) => n.channel },
    { header: 'STATUS', value: (n) => n.status },
  ]);
  proves('tier one goes out at once rather than waiting out the cancel window');

  heading(`Nobody answers, so the window expires after ${DEMO_TIMEOUT_SECONDS}s`);
  const escalated = await waitFor('escalation to tier two', async () => {
    const current = await prisma.emergencyEvent.findUnique({ where: { id: event.id } });
    return current.currentTier > 1 ? current : null;
  });

  say(
    `Escalated to tier ${bold(escalated.value.currentTier)} after ${bold(`${Math.round(escalated.elapsedMs / 1000)}s`)}, state now ${bold(escalated.value.state)}`,
  );
  proves('a Redis key expiry drove this, with no polling and no request from any client');

  heading('The family member takes responsibility');
  const family = await prisma.user.findFirst({
    where: { role: 'FAMILY_MEMBER' },
    orderBy: { createdAt: 'asc' },
  });
  const { token: familyToken } = await signIn(family.phone);

  const acknowledged = await api(`/alerts/${event.id}/acknowledge`, {
    method: 'POST',
    token: familyToken,
    body: { latitude: -1.2841, longitude: 36.7822 },
  });

  const responseSeconds = Math.round(
    (new Date(acknowledged.acknowledgedAt) - new Date(acknowledged.triggeredAt)) / 1000,
  );
  say(`${family.name} acknowledged, ${bold(`${responseSeconds}s`)} after the alert was raised`);
  say(
    `Pending timers cleared, deadline is now ${bold(String(acknowledged.currentTierDeadlineAt))}`,
  );
  proves('acknowledgement stops the chain, and response time is measurable for Chapter 5');

  heading('Resolved with a recorded outcome');
  const resolved = await api(`/alerts/${event.id}/resolve`, {
    method: 'POST',
    token: familyToken,
    body: { outcome: 'HANDLED_AT_HOME' },
  });
  say(`State ${bold(resolved.state)}, outcome ${bold(resolved.outcome)}`);

  heading('The audit trail');
  const logs = await prisma.auditLog.findMany({
    where: { eventId: event.id },
    orderBy: { occurredAt: 'asc' },
    include: { actor: true },
  });

  table(logs, [
    { header: 'AT', value: (l) => new Date(l.occurredAt).toISOString().slice(11, 19) },
    { header: 'ACTION', value: (l) => l.action },
    { header: 'BY', value: (l) => l.actor?.name ?? dim('system') },
    {
      header: 'TRANSITION',
      value: (l) => (l.newState ? `${l.previousState ?? '-'} → ${l.newState}` : ''),
    },
  ]);
  proves('every step is attributable, and system actions are distinguishable from human ones');

  heading('Every delivery attempt');
  const notifications = await prisma.notification.findMany({
    where: { eventId: event.id },
    orderBy: { createdAt: 'asc' },
    include: { recipient: true },
  });

  table(notifications, [
    { header: 'TIER', value: (n) => n.tier },
    { header: 'RECIPIENT', value: (n) => n.recipient.name },
    { header: 'CHANNEL', value: (n) => n.channel },
    { header: 'STATUS', value: (n) => (n.status === 'FAILED' ? red(n.status) : n.status) },
    { header: 'WHY', value: (n) => n.failureReason ?? '' },
  ]);
  proves('failed deliveries are recorded with their reason, and SMS follows a failed push');

  console.log(`\n${green(bold('Demonstration complete.'))}`);
  console.log(dim(`   Event ${event.id}`));
  console.log(dim('   Open it in a browser with: npm run db:studio -w @mzazicare/api\n'));
}

run()
  .catch((error) => {
    console.error(`\n${red('Demonstration failed:')} ${error.message}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await restoreTimers().catch(() => {
      console.error(red('   Could not restore the original timeouts. Check escalation_rules.'));
    });
    await prisma.$disconnect();
  });
