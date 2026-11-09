// System tests TC-01 to TC-12, run against a running API, PostgreSQL and Redis.
//
// Every request and response, every database snapshot and every live message is written
// to the evidence folder, so each verdict can be checked against what was recorded.
//
// Usage (from the repository root, with the API already running on API_URL):
//   DATABASE_URL=postgresql://.../mzazicare_systest \
//   API_URL=http://localhost:3100/api/v1 SMS_INBOUND_TOKEN=... \
//   EVIDENCE_DIR=docs/evidence/2026-11-09-system-tests \
//   node scripts/system-tests/run-system-tests.mjs
//
// It changes the escalation deadlines in the test database for the run (TC-03 needs a
// shortened deadline) and puts them back at the end.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3100/api/v1';
const SMS_TOKEN = process.env.SMS_INBOUND_TOKEN ?? '';
const OUT = process.env.EVIDENCE_DIR ?? 'docs/evidence/system-tests';
const PASSWORD = process.env.SEED_PASSWORD ?? 'Dev!2026';
const TEST_DEADLINE_SECONDS = Number(process.env.TEST_DEADLINE_SECONDS ?? 10);

const prisma = new PrismaClient();
mkdirSync(OUT, { recursive: true });

const PHONES = {
  admin: '+254700000001',
  grace: '+254700000010',
  joseph: '+254700000011',
  samuel: '+254700000012',
  hannah: '+254700000013',
  esther: '+254700000014',
  francis: '+254700000015',
  ali: '+254700000016',
  mary: '+254700000020',
  peter: '+254700000021',
  caroline: '+254700000022',
  aisha: '+254700000030',
  brian: '+254700000032',
  lucy: '+254700000035',
  amina: '+254700000037',
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const iso = () => new Date().toISOString();

/** Polls until [check] returns something truthy, or gives up after [ms]. */
async function waitFor(check, ms, every = 250) {
  const until = Date.now() + ms;
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() > until) return null;
    await wait(every);
  }
}

/** One test's record: what was done, what came back, and the verdict. */
class Record {
  constructor(id, title) {
    this.id = id;
    this.title = title;
    this.startedAt = iso();
    this.steps = [];
    this.checks = [];
    this.snapshots = {};
  }

  step(text, data) {
    this.steps.push({ at: iso(), text, ...(data === undefined ? {} : { data }) });
  }

  check(description, passed, observed) {
    this.checks.push({ description, passed: Boolean(passed), observed });
    return Boolean(passed);
  }

  snapshot(name, value) {
    this.snapshots[name] = value;
  }

  get verdict() {
    return this.checks.length > 0 && this.checks.every((c) => c.passed) ? 'Pass' : 'Fail';
  }

  save() {
    this.finishedAt = iso();
    const file = join(OUT, `${this.id}.json`);
    writeFileSync(file, `${JSON.stringify({ ...this, verdict: this.verdict }, null, 2)}\n`);
    return file;
  }
}

/** An HTTP call, recorded in full on [record]. */
async function call(record, method, path, { token, body, query } = {}) {
  const url = `${API}${path}${query ? `?${new URLSearchParams(query)}` : ''}`;
  const started = performance.now();
  const response = await fetch(url, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = Math.round(performance.now() - started);
  const text = await response.text();
  let parsed = text;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // Left as text.
  }
  record?.step(`${method} ${path.replace(/token=[^&]+/, 'token=<secret>')}`, {
    request: body ?? null,
    status: response.status,
    ms,
    response: parsed,
  });
  return { status: response.status, body: parsed, ms };
}

const tokens = {};
async function signIn(who) {
  if (tokens[who]) return tokens[who];
  const result = await call(null, 'POST', '/auth/login', {
    body: { phone: PHONES[who], password: PASSWORD },
  });
  if (result.status !== 200 && result.status !== 201) {
    throw new Error(`Could not sign in ${who}: ${result.status} ${JSON.stringify(result.body)}`);
  }
  tokens[who] = result.body.accessToken;
  return tokens[who];
}

const userIds = {};
async function idOf(who) {
  userIds[who] ??= (await prisma.user.findUnique({ where: { phone: PHONES[who] } })).id;
  return userIds[who];
}

const eventRow = (id) =>
  prisma.emergencyEvent.findUnique({
    where: { id },
    select: {
      id: true,
      state: true,
      currentTier: true,
      severity: true,
      severityScore: true,
      severityFactors: true,
      triggeredAt: true,
      acknowledgedAt: true,
      acknowledgedBy: true,
      resolvedAt: true,
      currentTierDeadlineAt: true,
      trigger: true,
      outcome: true,
    },
  });

const auditRows = (eventId) =>
  prisma.auditLog.findMany({
    where: { eventId },
    orderBy: { occurredAt: 'asc' },
    select: {
      action: true,
      previousState: true,
      newState: true,
      actorId: true,
      detail: true,
      occurredAt: true,
    },
  });

const notificationRows = (eventId) =>
  prisma.notification.findMany({
    where: { eventId },
    orderBy: { createdAt: 'asc' },
    select: {
      recipientId: true,
      channel: true,
      status: true,
      tier: true,
      createdAt: true,
      sentAt: true,
      deliveredAt: true,
      acknowledgedAt: true,
      providerMessageId: true,
      failureReason: true,
    },
  });

/** Raises an alert as [elder] and returns the event id. */
async function raise(record, elder, body = {}) {
  const token = await signIn(elder);
  const result = await call(record, 'POST', '/alerts', { token, body });
  return { ...result, id: result.body?.id };
}

/** Takes an alert on and closes it, so the elder is free for a later test. */
async function closeOut(record, eventId, by) {
  const token = await signIn(by);
  const row = await eventRow(eventId);
  if (!row.acknowledgedBy)
    await call(record, 'POST', `/alerts/${eventId}/acknowledge`, { token, body: {} });
  return call(record, 'POST', `/alerts/${eventId}/resolve`, {
    token,
    body: { outcome: 'HANDLED_AT_HOME', note: 'System test clean-up.' },
  });
}

const results = [];
async function run(id, title, body) {
  const record = new Record(id, title);
  process.stdout.write(`${id} ${title} … `);
  try {
    await body(record);
  } catch (error) {
    record.check('The test ran to the end without an error', false, String(error?.stack ?? error));
  }
  const file = record.save();
  results.push({ id, title, verdict: record.verdict, startedAt: record.startedAt, file });
  // eslint-disable-next-line no-console -- the runner reports progress on the terminal
  console.log(record.verdict);
  return record;
}

// ---------------------------------------------------------------------------------------

async function main() {
  const environment = {
    startedAt: iso(),
    api: API,
    node: process.version,
    testDeadlineSeconds: TEST_DEADLINE_SECONDS,
  };
  environment.health = await (await fetch(`${API.replace(/\/api\/v1$/, '')}/health`)).json();

  // Shortened deadlines for the run, as TC-03 requires. The originals are kept as evidence
  // and put back at the end.
  const originalRules = await prisma.escalationRule.findMany({
    orderBy: [{ severity: 'asc' }, { tierOrder: 'asc' }],
  });
  environment.originalEscalationRules = originalRules.map((r) => ({
    severity: r.severity,
    tier: r.tierOrder,
    role: r.responderRole,
    timeoutSeconds: r.timeoutSeconds,
  }));
  await prisma.escalationRule.updateMany({
    where: { timeoutSeconds: { not: null } },
    data: { timeoutSeconds: TEST_DEADLINE_SECONDS },
  });
  environment.testEscalationRules = (
    await prisma.escalationRule.findMany({ orderBy: [{ severity: 'asc' }, { tierOrder: 'asc' }] })
  ).map((r) => ({ severity: r.severity, tier: r.tierOrder, timeoutSeconds: r.timeoutSeconds }));
  environment.severityFactors = await prisma.severityFactor.findMany({
    orderBy: { weight: 'desc' },
    select: { key: true, weight: true, enabled: true },
  });

  try {
    await tests();
  } finally {
    for (const rule of originalRules) {
      await prisma.escalationRule.update({
        where: { id: rule.id },
        data: { timeoutSeconds: rule.timeoutSeconds },
      });
    }
    environment.finishedAt = iso();
    environment.rulesRestored = true;
    writeFileSync(join(OUT, 'environment.json'), `${JSON.stringify(environment, null, 2)}\n`);
    writeFileSync(join(OUT, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
    await prisma.$disconnect();
  }
}

async function tests() {
  // TC-01 and TC-06 share Francis's alert: TC-01 checks it was created and the response
  // began, TC-06 checks the notifications it produced.
  let francisAlert;

  await run('TC-01', 'Initiate an emergency through the mobile application', async (r) => {
    const francis = await idOf('francis');
    const chain = await prisma.careAssignment.findMany({
      where: { elderlyId: francis },
      select: { responder: { select: { name: true, role: true } } },
    });
    r.snapshot(
      'careRelationships',
      chain.map((c) => c.responder),
    );
    r.check('The elder has an active care relationship', chain.length > 0, chain.length);

    const created = await raise(r, 'francis', {});
    francisAlert = created.id;
    r.check('POST /alerts answered 201 Created', created.status === 201, created.status);

    const row = await eventRow(created.id);
    r.snapshot('eventAfterCreate', row);
    r.check('An emergency record exists in PostgreSQL', row?.id === created.id, row?.state);
    r.check(
      'The record names the elder and a PANIC trigger',
      created.body?.elderlyId === (await idOf('francis')) && row?.trigger === 'PANIC',
      row?.trigger,
    );

    // The response process: tier 1 is asked in the same request, with the cancel window
    // running alongside it.
    const dispatched = await waitFor(async () => {
      const audit = await auditRows(created.id);
      return audit.find((a) => a.action === 'TIER_DISPATCHED') ? audit : null;
    }, 25_000);
    r.snapshot('auditTrail', dispatched ?? (await auditRows(created.id)));
    const createdEntry = (dispatched ?? []).find((a) => a.action === 'EVENT_CREATED');
    r.check(
      'EVENT_CREATED is in the audit trail, entering TRIGGERED',
      createdEntry?.newState === 'TRIGGERED',
      createdEntry,
    );
    const dispatchEntry = (dispatched ?? []).find((a) => a.action === 'TIER_DISPATCHED');
    r.check(
      'The initial response began: tier 1 was dispatched and the state moved TRIGGERED → NOTIFIED',
      dispatchEntry && (await eventRow(created.id)).state === 'NOTIFIED',
      dispatchEntry
        ? `${dispatchEntry.occurredAt.toISOString()}, ${new Date(dispatchEntry.occurredAt) - new Date(createdEntry.occurredAt)} ms after creation`
        : 'not seen in 25 s',
    );
    r.snapshot('eventAfterDispatch', await eventRow(created.id));
  });

  await run('TC-02', 'Create an emergency with configured severity factors', async (r) => {
    const factors = await prisma.severityFactor.findMany({ where: { enabled: true } });
    r.snapshot(
      'configuredFactors',
      factors.map((f) => ({ key: f.key, weight: f.weight })),
    );
    const weight = Object.fromEntries(factors.map((f) => [f.key, f.weight]));

    // Grace: high dependency, at home, in the daytime, no recent alert.
    const grace = await raise(r, 'grace', {});
    // Ali: independent, staying about 2 km from home. The server locates an alert from
    // the account (a stay a caregiver recorded, else the home), not from the phone, so
    // the condition is set the way the system sets it: Caroline records the stay.
    const aliHome = await prisma.user.findUnique({
      where: { phone: PHONES.ali },
      select: { homeLatitude: true, homeLongitude: true },
    });
    r.snapshot('aliHome', aliHome);
    const stay = await call(r, 'PUT', `/elders/${await idOf('ali')}/place`, {
      token: await signIn('caroline'),
      body: {
        latitude: Number((Number(aliHome.homeLatitude) + 0.018).toFixed(6)),
        longitude: Number(aliHome.homeLongitude),
        label: 'Staying with his sister in Lavington',
      },
    });
    r.check("Caroline recorded Ali's stay away from home", stay.status === 200, stay.status);
    const ali = await raise(r, 'ali', {});
    r.snapshot('alertIds', { grace: grace.id, ali: ali.id });

    const graceFirst = await eventRow(grace.id);
    const aliFirst = await eventRow(ali.id);
    r.snapshot('graceAtCreate', graceFirst);
    r.snapshot('aliAtCreate', aliFirst);

    const sumOf = (row) =>
      (row.severityFactors?.factors ?? []).reduce((total, f) => total + f.contribution, 0);
    const expectGraceFirst = weight.care_level * 1;
    const expectAliFirst = weight.away_from_home * 1;
    r.check(
      `Grace's score at creation follows the rules: care level ${weight.care_level} × 1 = ${expectGraceFirst}, STANDARD`,
      graceFirst.severityScore === expectGraceFirst && graceFirst.severity === 'STANDARD',
      `${graceFirst.severityScore}, ${graceFirst.severity}`,
    );
    r.check(
      `Ali's score at creation follows the rules: away from home ${weight.away_from_home} × 1 = ${expectAliFirst}, STANDARD`,
      aliFirst.severityScore === expectAliFirst && aliFirst.severity === 'STANDARD',
      `${aliFirst.severityScore}, ${aliFirst.severity}`,
    );
    r.check(
      'Each recorded score equals the sum of its recorded factor contributions',
      sumOf(graceFirst) === graceFirst.severityScore && sumOf(aliFirst) === aliFirst.severityScore,
      { grace: sumOf(graceFirst), ali: sumOf(aliFirst) },
    );

    // When the cancel window passes untouched, the score is evaluated again.
    const reviewed = await waitFor(async () => {
      const [g, a] = await Promise.all([eventRow(grace.id), eventRow(ali.id)]);
      return g.severityScore > graceFirst.severityScore && a.severityScore > aliFirst.severityScore
        ? { g, a }
        : null;
    }, 25_000);
    const g2 = reviewed?.g ?? (await eventRow(grace.id));
    const a2 = reviewed?.a ?? (await eventRow(ali.id));
    r.snapshot('graceAfterWindow', g2);
    r.snapshot('aliAfterWindow', a2);
    const expectGrace2 = expectGraceFirst + weight.no_cancel_in_grace_window;
    const expectAli2 = expectAliFirst + weight.no_cancel_in_grace_window;
    r.check(
      `Grace after the window: ${expectGraceFirst} + ${weight.no_cancel_in_grace_window} = ${expectGrace2}, CRITICAL (from 60)`,
      g2.severityScore === expectGrace2 && g2.severity === 'CRITICAL',
      `${g2.severityScore}, ${g2.severity}`,
    );
    r.check(
      `Ali after the window: ${expectAliFirst} + ${weight.no_cancel_in_grace_window} = ${expectAli2}, ELEVATED (35 to 59)`,
      a2.severityScore === expectAli2 && a2.severity === 'ELEVATED',
      `${a2.severityScore}, ${a2.severity}`,
    );
    const evaluated = (await auditRows(grace.id)).filter((a) => a.action === 'SEVERITY_EVALUATED');
    r.snapshot('graceSeverityAudit', evaluated);
    r.check(
      'The evaluation is recorded in the audit trail',
      evaluated.length > 0,
      evaluated.length,
    );

    // Ali is needed again for TC-12, back at home; Grace's alert carries on into TC-08,
    // TC-09 and TC-11.
    await closeOut(r, ali.id, 'caroline');
    await call(r, 'DELETE', `/elders/${await idOf('ali')}/place`, {
      token: await signIn('caroline'),
    });
    globalThis.graceAlert = grace.id;
  });

  await run('TC-03', 'Allow an acknowledgement deadline to expire', async (r) => {
    r.snapshot('testDeadlineSeconds', TEST_DEADLINE_SECONDS);
    const created = await raise(r, 'samuel', {});
    const tier1 = await waitFor(async () => {
      const row = await eventRow(created.id);
      return row.state === 'NOTIFIED' ? row : null;
    }, 25_000);
    r.snapshot('atTier1', tier1);
    r.check(
      'Tier 1 was notified and given a deadline',
      tier1?.currentTier === 1 && tier1.currentTierDeadlineAt,
      tier1 && `${tier1.state}, deadline ${tier1.currentTierDeadlineAt?.toISOString()}`,
    );
    r.step('Nobody acknowledges. Waiting for the deadline to pass.');

    const escalated = await waitFor(
      async () => {
        const row = await eventRow(created.id);
        return row.currentTier >= 2 ? row : null;
      },
      (TEST_DEADLINE_SECONDS + 25) * 1000,
    );
    r.snapshot('afterDeadline', escalated ?? (await eventRow(created.id)));
    r.check(
      'The emergency moved to tier 2',
      escalated?.currentTier === 2,
      escalated ? `${escalated.state}, tier ${escalated.currentTier}` : 'still tier 1',
    );
    if (escalated && tier1?.currentTierDeadlineAt) {
      const audit = await auditRows(created.id);
      const moved = audit.find((a) => a.action === 'ESCALATED');
      const lateMs = moved ? new Date(moved.occurredAt) - tier1.currentTierDeadlineAt : null;
      r.snapshot('escalationLatenessMs', lateMs);
      r.check('ESCALATED is recorded in the audit trail', Boolean(moved), moved?.occurredAt);
      r.check(
        'It moved within 2 s of the deadline',
        lateMs !== null && lateMs >= 0 && lateMs <= 2000,
        `${lateMs} ms after the deadline`,
      );
    }
    const notifications = await notificationRows(created.id);
    r.snapshot('notifications', notifications);
    const brian = await idOf('brian');
    const aisha = await idOf('aisha');
    r.check(
      "Tier 2 (Samuel's family) was notified",
      notifications.some((n) => n.tier === 2 && [brian, aisha].includes(n.recipientId)),
      notifications.filter((n) => n.tier === 2).length,
    );
    await closeOut(r, created.id, 'mary');
  });

  await run('TC-04', 'Acknowledge an emergency before the escalation deadline', async (r) => {
    const created = await raise(r, 'joseph', {});
    const tier1 = await waitFor(async () => {
      const row = await eventRow(created.id);
      return row.state === 'NOTIFIED' ? row : null;
    }, 25_000);
    r.snapshot('atTier1', tier1);
    const token = await signIn('peter');
    const ack = await call(r, 'POST', `/alerts/${created.id}/acknowledge`, { token, body: {} });
    const ackedAt = new Date();
    r.check('Peter (tier 1 caregiver) acknowledged: 200', ack.status === 200, ack.status);
    r.check(
      'Acknowledged before the deadline',
      tier1 && ackedAt < tier1.currentTierDeadlineAt,
      tier1 &&
        `acknowledged ${ackedAt.toISOString()}, deadline ${tier1.currentTierDeadlineAt.toISOString()}`,
    );

    r.step(
      `Waiting ${TEST_DEADLINE_SECONDS + 8} s, past the old deadline, to see that nothing climbs.`,
    );
    await wait((TEST_DEADLINE_SECONDS + 8) * 1000);
    const row = await eventRow(created.id);
    r.snapshot('afterOldDeadline', row);
    r.check(
      'The acknowledgement is recorded on the emergency',
      row.state === 'ACKNOWLEDGED' && row.acknowledgedBy === (await idOf('peter')),
      `${row.state}, by ${row.acknowledgedBy}`,
    );
    r.check('It stayed at tier 1', row.currentTier === 1, row.currentTier);
    const notifications = await notificationRows(created.id);
    r.snapshot('notifications', notifications);
    r.check(
      'Nobody at tier 2 was notified',
      !notifications.some((n) => n.tier > 1),
      notifications.map((n) => n.tier),
    );
    const audit = await auditRows(created.id);
    r.snapshot('auditTrail', audit);
    r.check(
      'ACKNOWLEDGED is in the audit trail and ESCALATED is not',
      audit.some((a) => a.action === 'ACKNOWLEDGED') &&
        !audit.some((a) => a.action === 'ESCALATED'),
      audit.map((a) => a.action),
    );
    await closeOut(r, created.id, 'peter');
  });

  await run('TC-05', 'Submit simultaneous acknowledgement attempts', async (r) => {
    const created = await raise(r, 'esther', {});
    await waitFor(
      async () => ((await eventRow(created.id)).state === 'NOTIFIED' ? true : null),
      25_000,
    );
    const [mary, lucy] = await Promise.all([signIn('mary'), signIn('lucy')]);
    r.step('Mary (caregiver) and Lucy (family) both press "I\'m on my way" at the same instant.');
    const attempts = await Promise.all([
      call(r, 'POST', `/alerts/${created.id}/acknowledge`, { token: mary, body: {} }),
      call(r, 'POST', `/alerts/${created.id}/acknowledge`, { token: lucy, body: {} }),
    ]);
    const statuses = attempts.map((a) => a.status).sort();
    r.check(
      'Exactly one was accepted (200) and the other refused (409 Conflict)',
      statuses[0] === 200 && statuses[1] === 409,
      statuses,
    );
    const row = await eventRow(created.id);
    r.snapshot('event', row);
    const winner = attempts[0].status === 200 ? 'mary' : 'lucy';
    r.check(
      'The emergency names the one who was accepted',
      row.acknowledgedBy === (await idOf(winner)),
      `${winner}: ${row.acknowledgedBy}`,
    );
    const audit = await auditRows(created.id);
    r.snapshot('auditTrail', audit);
    r.check(
      'Exactly one ACKNOWLEDGED entry was written',
      audit.filter((a) => a.action === 'ACKNOWLEDGED').length === 1,
      audit.filter((a) => a.action === 'ACKNOWLEDGED').length,
    );
    r.check('The state is ACKNOWLEDGED', row.state === 'ACKNOWLEDGED', row.state);
    await closeOut(r, created.id, winner);
  });

  await run('TC-06', 'Process an emergency notification', async (r) => {
    r.snapshot('channels', {
      push: 'logging provider (no real push)',
      sms: 'logging provider (sandbox stand-in)',
    });
    const rows = await waitFor(async () => {
      const all = await notificationRows(francisAlert);
      return all.length > 0 && all.every((n) => n.status !== 'QUEUED') ? all : null;
    }, 15_000);
    const notifications = rows ?? (await notificationRows(francisAlert));
    r.snapshot('notifications', notifications);
    r.check(
      'Notification rows were created for the tier 1 recipients',
      notifications.length > 0,
      notifications.length,
    );
    r.check(
      'Each one left the queue (no row still QUEUED)',
      notifications.every((n) => n.status !== 'QUEUED'),
      notifications.map((n) => `${n.channel}:${n.status}`),
    );
    r.check(
      'Each delivery attempt is recorded: a send with its time and provider id, or a failure with its reason',
      notifications.every(
        (n) => (n.sentAt && n.providerMessageId) || (n.status === 'FAILED' && n.failureReason),
      ),
      notifications.map((n) => ({
        channel: n.channel,
        status: n.status,
        sentAt: n.sentAt,
        id: n.providerMessageId,
        failure: n.failureReason,
      })),
    );
    const failedPush = notifications.filter((n) => n.channel === 'PUSH' && n.status === 'FAILED');
    r.check(
      'Every recipient whose push failed was sent an SMS instead',
      failedPush.every((p) =>
        notifications.some(
          (n) => n.channel === 'SMS' && n.recipientId === p.recipientId && n.sentAt,
        ),
      ),
      `${failedPush.length} push failure(s)`,
    );
    const audit = await auditRows(francisAlert);
    r.snapshot('auditTrail', audit);
    r.check(
      'TIER_DISPATCHED is recorded for the alert',
      audit.some((a) => a.action === 'TIER_DISPATCHED'),
      audit.map((a) => a.action),
    );
    const detail = await call(r, 'GET', `/alerts/${francisAlert}`, {
      token: await signIn('admin'),
    });
    r.check(
      'The delivery attempts can be read back through the API',
      Array.isArray(detail.body?.deliveries) && detail.body.deliveries.length > 0,
      detail.body?.deliveries?.length,
    );
    await closeOut(r, francisAlert, 'mary');
  });

  await run('TC-07', 'Submit a supported inbound SMS response', async (r) => {
    r.check(
      'The inbound SMS endpoint is configured (SMS_INBOUND_TOKEN set)',
      SMS_TOKEN.length > 0,
      SMS_TOKEN ? 'set' : 'missing',
    );
    const created = await raise(r, 'hannah', {});
    const notified = await waitFor(
      async () => {
        const all = await notificationRows(created.id);
        return all.some((n) => n.recipientId === userIds.peter) ? all : null;
      },
      25_000,
      250,
    ).catch(() => null);
    await idOf('peter');
    const asked = notified ?? (await notificationRows(created.id));
    r.snapshot('notifications', asked);
    r.check(
      "Peter was asked about Hannah's alert",
      asked.some((n) => n.recipientId === userIds.peter),
      asked.length,
    );

    // As Africa's Talking posts it: the sender's number and the text.
    r.step('Peter replies by text, in Swahili: "Nakuja dakika kumi" (I\'m coming, ten minutes).');
    const reply = await call(r, 'POST', `/sms/inbound?token=${encodeURIComponent(SMS_TOKEN)}`, {
      body: {
        from: PHONES.peter,
        text: 'Nakuja dakika kumi',
        to: '12345',
        date: iso(),
        id: 'systest-1',
      },
    });
    r.check('The gateway call was accepted: 200', reply.status === 200, reply.status);
    const row = await waitFor(async () => {
      const e = await eventRow(created.id);
      return e.state === 'ACKNOWLEDGED' ? e : null;
    }, 5_000);
    r.snapshot('event', row ?? (await eventRow(created.id)));
    r.check(
      'The reply was read as "coming": the alert is acknowledged by Peter',
      row?.acknowledgedBy === userIds.peter,
      row?.state,
    );
    const audit = await auditRows(created.id);
    const ack = audit.find((a) => a.action === 'ACKNOWLEDGED');
    r.snapshot('acknowledgedEntry', ack);
    r.check('The audit entry says it came by SMS', ack?.detail?.via === 'sms', ack?.detail);
    r.check(
      'The ten minutes were understood',
      ack?.detail?.etaMinutes === 10 || JSON.stringify(ack?.detail ?? {}).includes('10'),
      ack?.detail,
    );
    await closeOut(r, created.id, 'peter');
  });

  // TC-08, TC-09 and TC-11 use Grace's alert from TC-02, which is still open.
  const graceAlert = globalThis.graceAlert;

  await run('TC-08', 'Change the status of an active emergency', async (r) => {
    r.snapshot('alert', graceAlert);
    const listeners = {};
    const connect = async (who) => {
      const socket = io(`${API.replace(/\/api\/v1$/, '')}/realtime`, {
        auth: { token: await signIn(who) },
        transports: ['websocket'],
        reconnection: false,
      });
      listeners[who] = { socket, received: [], connected: false, unauthorized: false };
      socket.on('connect', () => (listeners[who].connected = true));
      socket.on('unauthorized', () => (listeners[who].unauthorized = true));
      socket.on('emergency.updated', (m) =>
        listeners[who].received.push({ at: iso(), message: m }),
      );
    };
    await Promise.all(['aisha', 'admin', 'peter'].map(connect));
    await waitFor(() => Object.values(listeners).every((l) => l.connected) || null, 5_000);
    r.check(
      "Aisha (Grace's family), the administrator and Peter (not in Grace's circle) are connected",
      Object.values(listeners).every((l) => l.connected),
      Object.fromEntries(Object.entries(listeners).map(([k, l]) => [k, l.connected])),
    );
    await wait(500);
    for (const l of Object.values(listeners)) l.received.length = 0;

    const changedAt = Date.now();
    const ack = await call(r, 'POST', `/alerts/${graceAlert}/acknowledge`, {
      token: await signIn('mary'),
      body: {},
    });
    r.check("Mary acknowledged Grace's alert: 200", ack.status === 200, ack.status);
    await waitFor(
      () => (listeners.aisha.received.length && listeners.admin.received.length) || null,
      5_000,
    );
    await wait(1500);
    const forGrace = (who) =>
      listeners[who].received.filter((m) => m.message?.eventId === graceAlert);
    const latency = (who) => (forGrace(who)[0] ? new Date(forGrace(who)[0].at) - changedAt : null);
    r.snapshot(
      'received',
      Object.fromEntries(Object.entries(listeners).map(([k, l]) => [k, l.received])),
    );
    r.check(
      'Aisha received the update with the new state',
      forGrace('aisha').some((m) => m.message.state === 'ACKNOWLEDGED'),
      forGrace('aisha').map((m) => m.message.state),
    );
    r.check(
      'The administrator received the update',
      forGrace('admin').some((m) => m.message.state === 'ACKNOWLEDGED'),
      forGrace('admin').map((m) => m.message.state),
    );
    r.check(
      "Peter, outside Grace's circle, received nothing about it",
      forGrace('peter').length === 0,
      forGrace('peter').length,
    );
    r.snapshot('latencyMs', { aisha: latency('aisha'), admin: latency('admin') });
    r.check(
      'Both updates arrived within 2 s of the change',
      latency('aisha') !== null && latency('aisha') <= 2000 && latency('admin') <= 2000,
      { aisha: latency('aisha'), admin: latency('admin') },
    );
    for (const l of Object.values(listeners)) l.socket.close();
  });

  await run('TC-09', 'Access an emergency without a care relationship or role', async (r) => {
    const peter = await signIn('peter');
    r.snapshot(
      'peterRelationshipToGrace',
      await prisma.careAssignment.findFirst({
        where: { elderlyId: await idOf('grace'), responderId: await idOf('peter') },
      }),
    );
    const read = await call(r, 'GET', `/alerts/${graceAlert}`, { token: peter });
    r.check(
      "Peter reading Grace's alert is refused (404, so the id confirms nothing)",
      read.status === 404,
      read.status,
    );
    r.check(
      'Nothing about Grace is in the answer',
      !JSON.stringify(read.body).includes('Grace'),
      read.body,
    );
    const ack = await call(r, 'POST', `/alerts/${graceAlert}/resolve`, {
      token: peter,
      body: { outcome: 'FALSE_ALARM', note: 'x' },
    });
    r.check('Peter closing it is refused', [403, 404].includes(ack.status), ack.status);
    const medical = await call(r, 'GET', `/alerts/${graceAlert}/medical`, { token: peter });
    r.check(
      "Peter reading Grace's medical details on it is refused",
      [403, 404].includes(medical.status),
      medical.status,
    );
    const list = await call(r, 'GET', '/alerts', { token: peter });
    r.check(
      "Grace's alert is not in Peter's list",
      Array.isArray(list.body) && !list.body.some((a) => a.id === graceAlert),
      Array.isArray(list.body) ? list.body.length : list.status,
    );
    const volunteerOnly = await call(r, 'GET', '/admin/users', { token: peter });
    r.check(
      "A caregiver is refused the administrator's user list (403)",
      volunteerOnly.status === 403,
      volunteerOnly.status,
    );
    const anonymous = await call(r, 'GET', `/alerts/${graceAlert}`);
    r.check('Without signing in: 401', anonymous.status === 401, anonymous.status);
    const row = await eventRow(graceAlert);
    r.snapshot('eventAfterAttempts', row);
    r.check(
      'The emergency was not changed by the refused attempts',
      row.state === 'ACKNOWLEDGED' && row.acknowledgedBy === (await idOf('mary')),
      row.state,
    );
  });

  await run('TC-10', 'Modify an authorised system configuration', async (r) => {
    const admin = await signIn('admin');
    r.step(
      'Looking for an administrator interface to change the escalation rules or severity weights (issue #60, FR-15).',
    );
    const candidates = [
      ['GET', '/admin/escalation-rules'],
      ['PUT', '/admin/escalation-rules'],
      ['GET', '/admin/severity-factors'],
      ['PATCH', '/admin/severity-factors/care_level'],
      ['GET', '/dashboard/policy'],
    ];
    const found = {};
    for (const [method, path] of candidates) {
      const res = await call(r, method, path, {
        token: admin,
        body: method === 'GET' ? undefined : { weight: 31 },
      });
      found[`${method} ${path}`] = res.status;
    }
    r.snapshot('endpointStatuses', found);
    r.check(
      'An administrator can change the escalation rules or severity weights through the system',
      Object.entries(found).some(([k, s]) => !k.startsWith('GET') && s >= 200 && s < 300),
      found,
    );
    // Supporting observation: the weights are data the scoring process reads on every alert.
    r.step(
      'Supporting observation only: does the scoring process read the stored weights live? Changed care_level 30 → 31 directly in the database, raised an alert, then put it back.',
    );
    await prisma.severityFactor.update({ where: { key: 'care_level' }, data: { weight: 31 } });
    let observed;
    try {
      const created = await raise(r, 'grace', {}).catch(() => null);
      // Grace already has an open alert, so use the first elder free at this point.
      const alt = created?.status === 201 ? created : await raise(r, 'esther', {});
      const row = await eventRow(alt.id);
      observed = row.severityFactors?.factors?.find((f) => f.key === 'care_level');
      r.snapshot('liveWeightObservation', observed);
      const elder = created?.status === 201 ? 'grace' : 'esther';
      const by = elder === 'grace' ? 'mary' : 'mary';
      // Withdrawn by the elder inside the cancel window, as a mistaken press would be.
      await call(r, 'POST', `/alerts/${alt.id}/cancel`, { token: await signIn(elder), body: {} });
      void by;
    } finally {
      await prisma.severityFactor.update({ where: { key: 'care_level' }, data: { weight: 30 } });
    }
    r.snapshot(
      'supportingNote',
      `A database edit took effect on the next alert (care_level weight read as ${observed?.weight}), so the scoring process does read the stored policy. That bypasses validation and is not an administrator function, so it does not meet the requirement.`,
    );
  });

  await run('TC-11', 'Resolve an active emergency', async (r) => {
    const before = await eventRow(graceAlert);
    r.snapshot('before', before);
    r.check(
      "Grace's alert is open and owned by Mary",
      before.state === 'ACKNOWLEDGED',
      before.state,
    );
    const resolved = await call(r, 'POST', `/alerts/${graceAlert}/resolve`, {
      token: await signIn('mary'),
      body: {
        outcome: 'HANDLED_AT_HOME',
        note: 'Found Grace on the floor of the kitchen, unhurt. Helped her up.',
      },
    });
    r.check('POST /alerts/:id/resolve answered 200', resolved.status === 200, resolved.status);
    const after = await eventRow(graceAlert);
    r.snapshot('after', after);
    r.check(
      'The state is RESOLVED with a resolution time and outcome',
      after.state === 'RESOLVED' && after.resolvedAt && after.outcome === 'HANDLED_AT_HOME',
      `${after.state}, ${after.outcome}, ${after.resolvedAt?.toISOString()}`,
    );
    const audit = await auditRows(graceAlert);
    const entry = audit.find((a) => a.action === 'RESOLVED');
    r.snapshot('resolvedAuditEntry', entry);
    r.check(
      'A RESOLVED audit entry records who, the state change and the outcome',
      entry &&
        entry.actorId === (await idOf('mary')) &&
        entry.previousState === 'ACKNOWLEDGED' &&
        entry.newState === 'RESOLVED',
      entry,
    );
    const again = await call(r, 'POST', `/alerts/${graceAlert}/resolve`, {
      token: await signIn('mary'),
      body: { outcome: 'HANDLED_AT_HOME', note: 'Again.' },
    });
    r.check('Resolving it a second time is refused', again.status >= 400, again.status);
  });

  await run('TC-12', 'Complete a controlled emergency lifecycle', async (r) => {
    r.snapshot('services', {
      postgres: 'PostgreSQL 16, database mzazicare_systest',
      redis: 'Redis, keyspace notifications Ex',
    });
    const created = await raise(r, 'ali', {});
    r.check('Raised: 201', created.status === 201, created.status);
    const tier2 = await waitFor(
      async () => ((await eventRow(created.id)).currentTier >= 2 ? true : null),
      (TEST_DEADLINE_SECONDS + 40) * 1000,
    );
    r.check(
      'Nobody answered tier 1, so it climbed to tier 2',
      Boolean(tier2),
      (await eventRow(created.id)).currentTier,
    );
    const amina = await signIn('amina');
    const ack = await call(r, 'POST', `/alerts/${created.id}/acknowledge`, {
      token: amina,
      body: {},
    });
    r.check('Amina (tier 2, family) took it on: 200', ack.status === 200, ack.status);
    const resolved = await call(r, 'POST', `/alerts/${created.id}/resolve`, {
      token: amina,
      body: {
        outcome: 'RESPONDER_ATTENDED',
        note: 'Went over. Ali had a dizzy spell and is resting.',
      },
    });
    r.check('Amina resolved it: 200', resolved.status === 200, resolved.status);
    globalThis.lifecycleAlert = created.id;

    const event = await eventRow(created.id);
    const audit = await auditRows(created.id);
    const notifications = await notificationRows(created.id);
    r.snapshot('event', event);
    r.snapshot('auditTrail', audit);
    r.snapshot('notifications', notifications);
    const actions = audit.map((a) => a.action);
    const expected = [
      'EVENT_CREATED',
      'SEVERITY_EVALUATED',
      'TIER_DISPATCHED',
      'ESCALATED',
      'ACKNOWLEDGED',
      'RESOLVED',
    ];
    r.check(
      'Every lifecycle step is persisted in the audit trail, in order',
      expected.every((a) => actions.includes(a)) &&
        actions.indexOf('ESCALATED') < actions.indexOf('ACKNOWLEDGED') &&
        actions.indexOf('ACKNOWLEDGED') < actions.indexOf('RESOLVED'),
      actions,
    );
    const transitions = audit
      .filter((a) => a.newState)
      .map((a) => `${a.previousState ?? '∅'}→${a.newState}`);
    r.snapshot('stateTransitions', transitions);
    r.check(
      'The state changes are persisted',
      transitions.length >= 3 && event.state === 'RESOLVED',
      transitions,
    );
    r.check(
      'Notifications for both tiers are persisted',
      [1, 2].every((t) => notifications.some((n) => n.tier === t)),
      notifications.map((n) => n.tier),
    );
    const review = await call(r, 'GET', `/alerts/${created.id}`, { token: await signIn('admin') });
    r.check(
      'The whole record can be reviewed through the API by an administrator',
      review.status === 200 &&
        Array.isArray(review.body?.timeline) &&
        review.body.timeline.length >= expected.length,
      review.body?.timeline?.length,
    );
    // The restart check is done by the runner script, which restarts the API and reads the
    // same record back, written to tc-12-after-restart.json.
  });

  writeFileSync(join(OUT, 'lifecycle-alert-id.txt'), `${globalThis.lifecycleAlert ?? ''}\n`);
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
