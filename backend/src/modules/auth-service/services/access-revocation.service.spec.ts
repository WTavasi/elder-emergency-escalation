import type { ConfigService } from '@nestjs/config';
import type { RedisService } from '../../../shared/redis/redis.service';
import { AccessRevocationService } from './access-revocation.service';

function build(exists: jest.Mock = jest.fn().mockResolvedValue(0)) {
  const set = jest.fn();
  const exec = jest.fn().mockResolvedValue([]);
  const pipeline = { set, exec };
  set.mockReturnValue(pipeline);
  const client = { multi: jest.fn(() => pipeline), del: jest.fn().mockResolvedValue(1), exists };
  const service = new AccessRevocationService(
    { client } as unknown as RedisService,
    { getOrThrow: () => '15m' } as unknown as ConfigService,
  );
  return { service, client, set, exec };
}

describe('AccessRevocationService', () => {
  it('marks each account for one access lifetime and a minute, then lets it lapse', async () => {
    const { service, set, exec } = build();
    await service.revoke(['u1', 'u2']);

    expect(set).toHaveBeenCalledWith('revoked:access:u1', '1', 'EX', 15 * 60 + 60);
    expect(set).toHaveBeenCalledWith('revoked:access:u2', '1', 'EX', 15 * 60 + 60);
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('lifts the marks when accounts are brought back', async () => {
    const { service, client } = build();
    await service.restore(['u1', 'u2']);
    expect(client.del).toHaveBeenCalledWith('revoked:access:u1', 'revoked:access:u2');
  });

  it('says whether an account is marked', async () => {
    await expect(build(jest.fn().mockResolvedValue(1)).service.isRevoked('u1')).resolves.toBe(true);
    await expect(build(jest.fn().mockResolvedValue(0)).service.isRevoked('u1')).resolves.toBe(
      false,
    );
  });

  it('lets the request through when Redis cannot be reached, rather than locking everyone out', async () => {
    const { service } = build(jest.fn().mockRejectedValue(new Error('connection refused')));
    await expect(service.isRevoked('u1')).resolves.toBe(false);
  });

  it('does nothing for an empty list', async () => {
    const { service, client } = build();
    await service.revoke([]);
    await service.restore([]);
    expect(client.multi).not.toHaveBeenCalled();
    expect(client.del).not.toHaveBeenCalled();
  });
});
