import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  const build = (row: { shareWayThere: boolean } | null) => {
    const prisma = {
      userPreference: {
        findUnique: jest.fn().mockResolvedValue(row),
        upsert: jest
          .fn()
          .mockImplementation(({ create, update }) =>
            Promise.resolve(row ? { ...row, ...update } : create),
          ),
      },
    };
    return { prisma, service: new PreferencesService(prisma as never) };
  };

  it('starts with sharing off, without writing anything', async () => {
    const { prisma, service } = build(null);

    await expect(service.get('carer-1')).resolves.toEqual({ shareWayThere: false });
    expect(prisma.userPreference.upsert).not.toHaveBeenCalled();
  });

  it('creates the row the first time a choice is made', async () => {
    const { prisma, service } = build(null);

    await expect(service.update('carer-1', { shareWayThere: true })).resolves.toEqual({
      shareWayThere: true,
    });
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { userId: 'carer-1', shareWayThere: true } }),
    );
  });

  it('changes only what the request names', async () => {
    const { prisma, service } = build({ shareWayThere: true });

    await service.update('carer-1', {});
    expect(prisma.userPreference.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: {} }),
    );
  });
});
