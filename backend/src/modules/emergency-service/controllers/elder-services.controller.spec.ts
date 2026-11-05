import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { StationDispatchService } from '../services/station-dispatch.service';
import { ElderServicesController } from './elder-services.controller';

function build(elder: Record<string, unknown> | null, inCircle = true) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(elder) },
    careAssignment: {
      findFirst: jest.fn().mockResolvedValue(inCircle ? { elderlyId: 'elder-1' } : null),
    },
  };
  const stations = {
    nearestEach: jest.fn().mockResolvedValue([{ name: 'Kileleshwa Response Unit' }]),
  };
  const controller = new ElderServicesController(
    prisma as unknown as PrismaService,
    stations as unknown as StationDispatchService,
  );
  return { controller, stations };
}

const grace = {
  role: Role.ELDER,
  homeLatitude: new Prisma.Decimal(-1.2833),
  homeLongitude: new Prisma.Decimal(36.7833),
};
const ID = '00000000-0000-4000-8000-000000000010';

describe('ElderServicesController', () => {
  it('shows the elder, and their circle, the services near home', async () => {
    const { controller, stations } = build(grace);

    await expect(
      controller.services(ID, { userId: 'carer-1', role: Role.CAREGIVER } as never),
    ).resolves.toEqual({ hasHome: true, services: [{ name: 'Kileleshwa Response Unit' }] });
    expect(stations.nearestEach).toHaveBeenCalledWith({ latitude: -1.2833, longitude: 36.7833 });
  });

  it('says there is nothing to measure without a home', async () => {
    const { controller } = build({ ...grace, homeLatitude: null, homeLongitude: null });

    await expect(
      controller.services(ID, { userId: ID, role: Role.ELDER } as never),
    ).resolves.toEqual({ hasHome: false, services: [] });
  });

  it('refuses somebody outside the circle, and anybody who is not an elder', async () => {
    await expect(
      build(grace, false).controller.services(ID, {
        userId: 'stranger',
        role: Role.FAMILY_MEMBER,
      } as never),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      build({ ...grace, role: Role.CAREGIVER }).controller.services(ID, {
        userId: ID,
        role: Role.CAREGIVER,
      } as never),
    ).rejects.toThrow(NotFoundException);
  });
});
