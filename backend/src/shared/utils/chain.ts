import { Role, Severity, type Prisma } from '@prisma/client';

/** The parts of a Prisma client the chain helpers use, so a transaction can be passed. */
export type ChainClient = Pick<
  Prisma.TransactionClient,
  'escalationRule' | 'careAssignment' | 'chainInvitation'
>;

/** Used when the escalation rules have not been seeded, which only a fresh test database is. */
const DEFAULT_TIER: Partial<Record<Role, number>> = {
  [Role.CAREGIVER]: 1,
  [Role.FAMILY_MEMBER]: 2,
  [Role.EMERGENCY_RESPONDER]: 3,
};

/**
 * The rank in an elder's chain that a role belongs at.
 *
 * Read from the escalation rules rather than fixed in code, because the rules are what
 * dispatch reads: tier two is whoever the rules say tier two is. The standard severity's
 * rules are used because every severity orders the roles the same way; only their
 * timeouts differ.
 */
export async function tierForRole(client: ChainClient, role: Role): Promise<number> {
  const rule = await client.escalationRule.findFirst({
    where: { severity: Severity.STANDARD, responderRole: role },
    orderBy: { tierOrder: 'asc' },
    select: { tierOrder: true },
  });
  return rule?.tierOrder ?? DEFAULT_TIER[role] ?? 2;
}

/**
 * Turns any places held for this phone number into care assignments.
 *
 * Called inside the sign-up transaction, so an account and its chain places appear
 * together or not at all. A place whose rank was filled by somebody else while the
 * invitation waited is skipped rather than failing the sign-up: the account matters
 * more than the invitation, and the caregiver can see the chain and add them again.
 */
export async function claimInvitations(
  client: ChainClient,
  user: { id: string; phone: string },
): Promise<number> {
  const invitations = await client.chainInvitation.findMany({ where: { phone: user.phone } });
  if (invitations.length === 0) return 0;

  const created = await client.careAssignment.createMany({
    data: invitations.map((invitation) => ({
      elderlyId: invitation.elderlyId,
      responderId: user.id,
      priorityOrder: invitation.priorityOrder,
    })),
    skipDuplicates: true,
  });

  await client.chainInvitation.deleteMany({ where: { phone: user.phone } });
  return created.count;
}
