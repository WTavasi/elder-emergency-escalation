// TC-05, repeated: three people in Esther's circle press "I'm on my way" at the same
// instant, TRIALS times. Each trial must accept exactly one, refuse the others with 409,
// write one ACKNOWLEDGED entry and name the accepted person on the emergency.
//
// Same environment variables as run-system-tests.mjs, plus TRIALS (default 20).

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';

const API = process.env.API_URL ?? 'http://localhost:3100/api/v1';
const OUT = process.env.EVIDENCE_DIR ?? 'docs/evidence/system-tests';
const TRIALS = Number(process.env.TRIALS ?? 20);
const PASSWORD = process.env.SEED_PASSWORD ?? 'Dev!2026';
const prisma = new PrismaClient();

const people = {
  esther: '+254700000014',
  mary: '+254700000020',
  lucy: '+254700000035',
  kevin: '+254700000034',
};

async function post(path, token, body) {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

const tokens = {};
const ids = {};
for (const [who, phone] of Object.entries(people)) {
  tokens[who] = (await post('/auth/login', null, { phone, password: PASSWORD })).body.accessToken;
  ids[who] = (await prisma.user.findUnique({ where: { phone } })).id;
}

const trials = [];
for (let n = 1; n <= TRIALS; n += 1) {
  const raised = await post('/alerts', tokens.esther, {});
  const eventId = raised.body.id;
  const pressers = ['mary', 'lucy', 'kevin'];
  const attempts = await Promise.all(
    pressers.map((who) => post(`/alerts/${eventId}/acknowledge`, tokens[who], {})),
  );
  const accepted = pressers.filter((_, i) => attempts[i].status === 200);
  const event = await prisma.emergencyEvent.findUnique({ where: { id: eventId } });
  const acks = await prisma.auditLog.count({ where: { eventId, action: 'ACKNOWLEDGED' } });
  const ok =
    accepted.length === 1 &&
    attempts.filter((a) => a.status === 409).length === 2 &&
    acks === 1 &&
    event.state === 'ACKNOWLEDGED' &&
    event.acknowledgedBy === ids[accepted[0]];
  trials.push({
    trial: n,
    eventId,
    statuses: Object.fromEntries(pressers.map((who, i) => [who, attempts[i].status])),
    accepted: accepted[0] ?? null,
    acknowledgedEntries: acks,
    state: event.state,
    consistent: ok,
  });
  await post(`/alerts/${eventId}/resolve`, tokens[accepted[0] ?? 'mary'], {
    outcome: 'FALSE_ALARM',
    note: 'System test TC-05 series.',
  });
}

const summary = {
  test: 'TC-05 series',
  at: new Date().toISOString(),
  trials: TRIALS,
  consistent: trials.filter((t) => t.consistent).length,
  acceptedBy: trials.reduce((m, t) => ({ ...m, [t.accepted]: (m[t.accepted] ?? 0) + 1 }), {}),
  verdict: trials.every((t) => t.consistent) ? 'Pass' : 'Fail',
  trialsDetail: trials,
};
writeFileSync(join(OUT, 'TC-05-series.json'), `${JSON.stringify(summary, null, 2)}\n`);
// eslint-disable-next-line no-console -- the runner reports its summary on the terminal
console.log(
  `${summary.consistent}/${TRIALS} consistent; accepted by ${JSON.stringify(summary.acceptedBy)}; ${summary.verdict}`,
);
await prisma.$disconnect();
