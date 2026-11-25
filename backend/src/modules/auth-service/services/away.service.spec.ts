import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AwayService } from './away.service';

const hour = 3600_000;

function build(others: Array<{ awaySince: Date | null; awayUntil: Date | null }> = []) {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ awaySince: null, awayUntil: null }),
      update: jest.fn(({ data }: { data: { awaySince: Date | null; awayUntil: Date | null } }) =>
        Promise.resolve(data),
      ),
    },
    careAssignment: {
      findMany: jest.fn().mockResolvedValue([
        {
          elder: {
            name: 'Grace Wanjiru',
            assignmentsAsElder: others.map((responder) => ({ responder })),
          },
        },
      ]),
    },
  };
  return { prisma, service: new AwayService(prisma as never) };
}

describe('AwayService', () => {
  it('says somebody is not away until they say so', async () => {
    await expect(build().service.get('carer-1')).resolves.toEqual({
      away: false,
      since: null,
      until: null,
    });
  });

  it('marks somebody away until a time, and back again', async () => {
    const { service, prisma } = build([{ awaySince: null, awayUntil: null }]);
    const until = new Date(Date.now() + 4 * hour);

    const away = await service.set('carer-1', Role.CAREGIVER, until);
    expect(away).toMatchObject({ away: true, until: until.toISOString(), nobodyElseFor: [] });

    await expect(service.clear('carer-1')).resolves.toEqual({
      away: false,
      since: null,
      until: null,
    });
    expect(prisma.user.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: { awaySince: null, awayUntil: null } }),
    );
  });

  it('marks somebody away until they turn it off', async () => {
    const away = await build().service.set('carer-1', Role.FAMILY_MEMBER, null);
    expect(away).toMatchObject({ away: true, until: null });
  });

  it('names the elders whose whole circle is now away', async () => {
    const { service } = build([{ awaySince: new Date(Date.now() - hour), awayUntil: null }]);
    const away = await service.set('carer-1', Role.CAREGIVER, null);
    expect(away.nobodyElseFor).toEqual(['Grace Wanjiru']);
  });

  it('refuses a time already past, or more than thirty days off', async () => {
    const { service } = build();
    await expect(
      service.set('carer-1', Role.CAREGIVER, new Date(Date.now() - 1000)),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.set('carer-1', Role.CAREGIVER, new Date(Date.now() + 31 * 24 * hour)),
    ).rejects.toThrow('up to 30 days');
  });

  it('is only for caregivers and family', async () => {
    for (const role of [Role.ELDER, Role.EMERGENCY_RESPONDER, Role.ADMINISTRATOR]) {
      await expect(build().service.set('someone', role, null)).rejects.toThrow(ForbiddenException);
    }
  });
});
