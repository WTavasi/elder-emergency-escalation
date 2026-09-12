/**
 * Development seed.
 *
 * Everything here is synthetic. The names, phone numbers, addresses and cover
 * windows are invented for development and demonstration, and no row describes a
 * real person or a real emergency.
 *
 * Run with:  npm run db:seed  -w @mzazicare/api
 * Safe to re-run: every write is an upsert keyed on a natural unique column.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ *
 * Password hashing. scrypt from node:crypto, so there is no native
 * dependency to build on Render. Parameters are stored with each hash,
 * which means they can be raised later without invalidating old hashes.
 * ------------------------------------------------------------------ */

const SCRYPT = {
  N: Number(process.env.SCRYPT_N ?? 16384),
  r: Number(process.env.SCRYPT_r ?? process.env.SCRYPT_R ?? 8),
  p: Number(process.env.SCRYPT_P ?? 1),
  keylen: 64,
};

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const key = scryptSync(plain, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ['scrypt', SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export function verifyPassword(plain, stored) {
  const [scheme, N, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt') return false;
  const key = Buffer.from(keyB64, 'base64');
  const candidate = scryptSync(plain, Buffer.from(saltB64, 'base64'), key.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return key.length === candidate.length && timingSafeEqual(key, candidate);
}

/** Development password for every seeded account. Never used outside development. */
const DEV_PASSWORD = 'Dev!2026';

/* ------------------------------------------------------------------ *
 * People
 * ------------------------------------------------------------------ */

const people = [
  {
    phone: '+254700000001', name: 'Asha Njeri', role: 'ADMINISTRATOR',
    email: 'admin@mzazicare.example',
  },

  // Elders
  {
    phone: '+254700000010', name: 'Grace Wanjiru', role: 'ELDER',
    careLevel: 'HIGH_DEPENDENCY',
    homeLatitude: -1.283300, homeLongitude: 36.783300,
    homeAddressLabel: 'Kileleshwa, Nairobi',
  },
  {
    phone: '+254700000011', name: 'Joseph Kimani', role: 'ELDER',
    careLevel: 'ASSISTED',
    homeLatitude: -1.268000, homeLongitude: 36.811000,
    homeAddressLabel: 'Westlands, Nairobi',
  },

  // Caregivers
  { phone: '+254700000020', name: 'Mary Otieno', role: 'CAREGIVER', email: 'mary@example.com' },
  { phone: '+254700000021', name: 'Peter Mwangi', role: 'CAREGIVER', email: 'peter@example.com' },

  // Family members
  { phone: '+254700000030', name: 'Aisha Wanjiru', role: 'FAMILY_MEMBER', email: 'aisha@example.com' },
  { phone: '+254700000031', name: 'David Kimani', role: 'FAMILY_MEMBER', email: 'david@example.com' },

  // Emergency responders, registered with the areas they cover
  {
    phone: '+254700000040', name: 'Kileleshwa Response Unit', role: 'EMERGENCY_RESPONDER',
    coverageAreaName: 'Kileleshwa and Lavington',
    coverageLatitude: -1.286000, coverageLongitude: 36.780000, coverageRadiusKm: 5.0,
  },
  {
    phone: '+254700000041', name: 'Westlands Response Unit', role: 'EMERGENCY_RESPONDER',
    coverageAreaName: 'Westlands and Parklands',
    coverageLatitude: -1.265000, coverageLongitude: 36.805000, coverageRadiusKm: 6.0,
  },
];

/* ------------------------------------------------------------------ *
 * Escalation policy, one rule set per severity band.
 *
 * Escalating never un-notifies an earlier tier: a caregiver who was told at
 * tier 1 stays told. PARALLEL means the tier is dispatched together with the
 * tier before it rather than after its timeout.
 * ------------------------------------------------------------------ */

const escalationRules = [
  // Standard: fully sequential, the timeouts agreed for the build.
  { severity: 'STANDARD', tierOrder: 1, responderRole: 'CAREGIVER',           timeoutSeconds: 120,  dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
  { severity: 'STANDARD', tierOrder: 2, responderRole: 'FAMILY_MEMBER',       timeoutSeconds: 180,  dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
  { severity: 'STANDARD', tierOrder: 3, responderRole: 'EMERGENCY_RESPONDER', timeoutSeconds: null, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },

  // Elevated: halved first timeout, responder reached sooner.
  { severity: 'ELEVATED', tierOrder: 1, responderRole: 'CAREGIVER',           timeoutSeconds: 60,   dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
  { severity: 'ELEVATED', tierOrder: 2, responderRole: 'FAMILY_MEMBER',       timeoutSeconds: 120,  dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
  { severity: 'ELEVATED', tierOrder: 3, responderRole: 'EMERGENCY_RESPONDER', timeoutSeconds: null, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },

  // Critical: caregiver and family together at once, responder after 60s,
  // SMS sent on first dispatch rather than after a push failure.
  { severity: 'CRITICAL', tierOrder: 1, responderRole: 'CAREGIVER',           timeoutSeconds: 60,   dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: true },
  { severity: 'CRITICAL', tierOrder: 2, responderRole: 'FAMILY_MEMBER',       timeoutSeconds: 60,   dispatchMode: 'PARALLEL',   smsFallbackImmediate: true },
  { severity: 'CRITICAL', tierOrder: 3, responderRole: 'EMERGENCY_RESPONDER', timeoutSeconds: null, dispatchMode: 'SEQUENTIAL', smsFallbackImmediate: false },
];

/* ------------------------------------------------------------------ *
 * Severity policy. Weights sum to 100. Bands come from the environment:
 * ELEVATED at 35 and above, CRITICAL at 60 and above.
 * ------------------------------------------------------------------ */

const severityFactors = [
  {
    key: 'care_level', weight: 30,
    label: 'Declared care level of the elder',
    description: 'INDEPENDENT scores 0, ASSISTED scores half, HIGH_DEPENDENCY scores full. The strongest single predictor of whether an unattended incident becomes serious.',
  },
  {
    key: 'no_cancel_in_grace_window', weight: 30,
    label: 'Grace window elapsed without a cancel',
    description: 'Scores full when the 10 second cancel window passes untouched, which suggests the person cannot reach their phone. Evaluated at grace-window expiry, not at trigger.',
  },
  {
    key: 'time_of_day', weight: 15,
    label: 'Alert raised at night',
    description: 'Scores full between 22:00 and 06:00 in the elder timezone, when nobody is likely to be nearby.',
  },
  {
    key: 'caregiver_outside_cover', weight: 10,
    label: 'No caregiver inside a declared cover window',
    description: 'Scores full when no care assignment declares cover at the moment of the alert. Declared availability, not verified presence.',
  },
  {
    key: 'away_from_home', weight: 10,
    label: 'Alert raised away from the registered home',
    description: 'Scores full beyond 250 metres from the registered home address, where there is no key holder and the surroundings are unknown.',
  },
  {
    key: 'recent_activity', weight: 5,
    label: 'Recent or unresolved prior alert',
    description: 'Scores full when another alert was raised in the last 6 hours or a prior event is still open.',
  },
];

/* ------------------------------------------------------------------ */

async function main() {
  console.log('Seeding development data. All records are synthetic.\n');

  const passwordHash = hashPassword(DEV_PASSWORD);

  const byPhone = {};
  for (const person of people) {
    const user = await prisma.user.upsert({
      where: { phone: person.phone },
      update: { ...person, passwordHash },
      create: { ...person, passwordHash },
    });
    byPhone[person.phone] = user;
    console.log(`  user      ${user.role.padEnd(20)} ${user.name}`);
  }

  // Escalation chains. Priority order is the rank inside one elder's chain.
  const chains = [
    { elder: '+254700000010', contacts: [
      { phone: '+254700000020', priorityOrder: 1, coverDaysOfWeek: [1, 2, 3, 4, 5], coverStartMinute: 8 * 60, coverEndMinute: 17 * 60 },
      { phone: '+254700000030', priorityOrder: 2 },
      { phone: '+254700000040', priorityOrder: 3 },
    ] },
    { elder: '+254700000011', contacts: [
      { phone: '+254700000021', priorityOrder: 1, coverDaysOfWeek: [1, 2, 3, 4, 5, 6], coverStartMinute: 7 * 60, coverEndMinute: 19 * 60 },
      { phone: '+254700000031', priorityOrder: 2 },
      { phone: '+254700000041', priorityOrder: 3 },
    ] },
  ];

  for (const chain of chains) {
    const elder = byPhone[chain.elder];
    for (const contact of chain.contacts) {
      const responder = byPhone[contact.phone];
      const data = {
        elderlyId: elder.id,
        responderId: responder.id,
        priorityOrder: contact.priorityOrder,
        coverDaysOfWeek: contact.coverDaysOfWeek ?? [],
        coverStartMinute: contact.coverStartMinute ?? null,
        coverEndMinute: contact.coverEndMinute ?? null,
      };
      await prisma.careAssignment.upsert({
        where: { no_duplicate_contact: { elderlyId: elder.id, responderId: responder.id } },
        update: data,
        create: data,
      });
      console.log(`  chain     ${elder.name} tier ${contact.priorityOrder} -> ${responder.name}`);
    }
  }

  for (const rule of escalationRules) {
    await prisma.escalationRule.upsert({
      where: { one_rule_per_tier_per_severity: { severity: rule.severity, tierOrder: rule.tierOrder } },
      update: rule,
      create: rule,
    });
  }
  console.log(`  rules     ${escalationRules.length} escalation rules across 3 severity bands`);

  for (const factor of severityFactors) {
    await prisma.severityFactor.upsert({ where: { key: factor.key }, update: factor, create: factor });
  }
  const totalWeight = severityFactors.reduce((sum, f) => sum + f.weight, 0);
  console.log(`  severity  ${severityFactors.length} factors, weights summing to ${totalWeight}`);

  // Consent, recorded as data. Each elder's consent is granted by their primary
  // caregiver on their behalf, which is the realistic case and the one the Act
  // cares about.
  const consents = [
    { subject: '+254700000010', grantor: '+254700000020', relationship: 'primary caregiver' },
    { subject: '+254700000011', grantor: '+254700000021', relationship: 'primary caregiver' },
  ];
  for (const c of consents) {
    for (const type of ['DATA_PROCESSING', 'LOCATION_SHARING', 'CONTACT_SHARING']) {
      const subject = byPhone[c.subject];
      const grantor = byPhone[c.grantor];
      const existing = await prisma.consentRecord.findFirst({
        where: { subjectId: subject.id, type, withdrawnAt: null },
      });
      if (!existing) {
        await prisma.consentRecord.create({
          data: {
            subjectId: subject.id,
            grantedById: grantor.id,
            type,
            policyVersion: '2026-09-1',
            grantorRelationship: c.relationship,
          },
        });
      }
    }
    console.log(`  consent   3 consents recorded for ${byPhone[c.subject].name}`);
  }

  console.log(`\nDone. Every seeded account signs in with the password: ${DEV_PASSWORD}`);
  console.log('Change or remove these accounts before any deployment that is not local.\n');
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
