import { Role } from '@prisma/client';
import { claimInvitations, tierForRole, type ChainClient } from './chain';

function client(rule: { tierOrder: number } | null = null, invitations: unknown[] = []) {
  return {
    escalationRule: { findFirst: jest.fn().mockResolvedValue(rule) },
    chainInvitation: {
      findMany: jest.fn().mockResolvedValue(invitations),
      deleteMany: jest.fn().mockResolvedValue({ count: invitations.length }),
    },
    careAssignment: { createMany: jest.fn().mockResolvedValue({ count: invitations.length }) },
  };
}

describe('tierForRole', () => {
  it('takes the rank from the escalation rules, which are what dispatch reads', async () => {
    const c = client({ tierOrder: 4 });
    await expect(tierForRole(c as unknown as ChainClient, Role.FAMILY_MEMBER)).resolves.toBe(4);
  });

  it('falls back to the usual order when no rules exist', async () => {
    const c = client(null) as unknown as ChainClient;
    await expect(tierForRole(c, Role.CAREGIVER)).resolves.toBe(1);
    await expect(tierForRole(c, Role.FAMILY_MEMBER)).resolves.toBe(2);
  });
});

describe('claimInvitations', () => {
  it('does nothing for a number nobody invited', async () => {
    const c = client();
    await expect(
      claimInvitations(c as unknown as ChainClient, { id: 'u1', phone: '+254700000001' }),
    ).resolves.toBe(0);
    expect(c.careAssignment.createMany).not.toHaveBeenCalled();
  });

  it('turns every held place into an assignment and clears the invitations', async () => {
    const c = client(null, [
      { elderlyId: 'e1', phone: '+254700000001', priorityOrder: 2 },
      { elderlyId: 'e2', phone: '+254700000001', priorityOrder: 2 },
    ]);
    await claimInvitations(c as unknown as ChainClient, { id: 'u1', phone: '+254700000001' });

    expect(c.careAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { elderlyId: 'e1', responderId: 'u1', priorityOrder: 2 },
        { elderlyId: 'e2', responderId: 'u1', priorityOrder: 2 },
      ],
      skipDuplicates: true,
    });
    expect(c.chainInvitation.deleteMany).toHaveBeenCalledWith({
      where: { phone: '+254700000001' },
    });
  });
});
