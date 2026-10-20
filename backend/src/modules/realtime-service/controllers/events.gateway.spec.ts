import { Role, Severity, EventState } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { ADMIN_ROOM, elderRoom, EventsGateway, userRoom } from './events.gateway';
import type { AccessRevocationService } from '../../auth-service/services/access-revocation.service';
import type { PrismaService } from '../../../db/prisma.service';
import type { TokenService } from '../../auth-service/services/token.service';

const buildSocket = (handshake: Record<string, unknown>) =>
  ({
    id: 'socket-1',
    handshake,
    data: {} as Record<string, unknown>,
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as Socket & { join: jest.Mock; emit: jest.Mock; disconnect: jest.Mock };

const buildGateway = (
  verify: jest.Mock,
  assignments: Array<{ elderlyId: string }> = [],
  revoked = false,
  askedOutsideTheChain: Array<{ recipientId: string }> = [],
): EventsGateway & { server: Server } => {
  const tokens = { verifyAccess: verify } as unknown as TokenService;
  const prisma = {
    careAssignment: { findMany: jest.fn().mockResolvedValue(assignments) },
    notification: { findMany: jest.fn().mockResolvedValue(askedOutsideTheChain) },
  } as unknown as PrismaService;

  const revocations = {
    isRevoked: jest.fn().mockResolvedValue(revoked),
  } as unknown as AccessRevocationService;

  return new EventsGateway(tokens, prisma, revocations) as EventsGateway & { server: Server };
};

const event = (overrides: Record<string, unknown> = {}) =>
  ({
    id: 'event-1',
    elderlyId: 'elder-1',
    state: EventState.NOTIFIED,
    severity: Severity.ELEVATED,
    currentTier: 1,
    alertLatitude: -1.2833,
    alertLongitude: 36.7833,
    alertAddressLabel: 'Kileleshwa, Nairobi',
    acknowledgedBy: null,
    currentTierDeadlineAt: new Date('2026-09-14T10:02:00Z'),
    triggeredAt: new Date('2026-09-14T10:00:00Z'),
    ...overrides,
  }) as never;

describe('EventsGateway', () => {
  describe('token extraction', () => {
    it('accepts the handshake auth object and the query string', () => {
      expect(EventsGateway.tokenFrom(buildSocket({ auth: { token: 'abc' } }))).toBe('abc');
      expect(EventsGateway.tokenFrom(buildSocket({ auth: {}, query: { token: 'xyz' } }))).toBe(
        'xyz',
      );
    });

    it('returns null when there is nothing usable', () => {
      expect(EventsGateway.tokenFrom(buildSocket({ auth: {}, query: {} }))).toBeNull();
      expect(EventsGateway.tokenFrom(buildSocket({ auth: { token: '' }, query: {} }))).toBeNull();
      expect(EventsGateway.tokenFrom(buildSocket({ auth: { token: 42 }, query: {} }))).toBeNull();
    });
  });

  describe('connection', () => {
    it('puts a caregiver in a room for each elder they cover, and no others', async () => {
      const verify = jest.fn().mockResolvedValue({ sub: 'caregiver-1', role: Role.CAREGIVER });
      const gateway = buildGateway(verify, [{ elderlyId: 'elder-1' }, { elderlyId: 'elder-2' }]);
      const client = buildSocket({ auth: { token: 'good' } });

      await gateway.handleConnection(client);

      expect(client.join).toHaveBeenCalledWith([
        elderRoom('elder-1'),
        elderRoom('elder-2'),
        userRoom('caregiver-1'),
      ]);
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('puts an elder in their own room only', async () => {
      const verify = jest.fn().mockResolvedValue({ sub: 'elder-1', role: Role.ELDER });
      const client = buildSocket({ auth: { token: 'good' } });

      await buildGateway(verify).handleConnection(client);
      expect(client.join).toHaveBeenCalledWith([elderRoom('elder-1'), userRoom('elder-1')]);
    });

    it('puts an administrator in the administrators room', async () => {
      const verify = jest.fn().mockResolvedValue({ sub: 'admin-1', role: Role.ADMINISTRATOR });
      const client = buildSocket({ auth: { token: 'good' } });

      await buildGateway(verify).handleConnection(client);
      expect(client.join).toHaveBeenCalledWith([ADMIN_ROOM, userRoom('admin-1')]);
    });

    it('refuses a deactivated account, even with a token that is still in date', async () => {
      const verify = jest.fn().mockResolvedValue({ sub: 'carer-9', role: Role.CAREGIVER });
      const client = buildSocket({ auth: { token: 'good' } });

      await buildGateway(verify, [{ elderlyId: 'elder-1' }], true).handleConnection(client);

      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects a socket with no token rather than leaving it attached', async () => {
      const verify = jest.fn();
      const client = buildSocket({ auth: {}, query: {} });

      await buildGateway(verify).handleConnection(client);

      expect(verify).not.toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects on a bad token without saying why', async () => {
      const verify = jest.fn().mockRejectedValue(new Error('Invalid or expired token'));
      const client = buildSocket({ auth: { token: 'tampered' } });

      await buildGateway(verify).handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      const [, payload] = client.emit.mock.calls[0] as [string, { message: string }];
      expect(payload.message).not.toMatch(/expired|invalid token/i);
    });
  });

  describe('deactivation', () => {
    it('closes every connection the accounts hold, telling them first', () => {
      const gateway = buildGateway(jest.fn());
      const emit = jest.fn();
      const disconnectSockets = jest.fn();
      gateway.server = {
        to: jest.fn().mockReturnValue({ emit }),
        in: jest.fn().mockReturnValue({ disconnectSockets }),
      } as unknown as Server;

      gateway.disconnectUsers(['u1', 'u2']);

      expect((gateway.server.to as jest.Mock).mock.calls[0][0]).toEqual([
        userRoom('u1'),
        userRoom('u2'),
      ]);
      expect(emit).toHaveBeenCalledWith('unauthorized', expect.anything());
      expect(disconnectSockets).toHaveBeenCalledWith(true);
    });
  });

  describe('publishing', () => {
    it('emits a compact snapshot to the elder room and the administrators', () => {
      const gateway = buildGateway(jest.fn());
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as unknown as Server;

      gateway.emergencyUpdated(event());

      expect((gateway.server.to as jest.Mock).mock.calls[0][0]).toEqual([
        elderRoom('elder-1'),
        ADMIN_ROOM,
      ]);

      const [channel, snapshot] = emit.mock.calls[0] as [string, Record<string, unknown>];
      expect(channel).toBe('emergency.updated');
      expect(snapshot).toEqual({
        eventId: 'event-1',
        elderlyId: 'elder-1',
        state: EventState.NOTIFIED,
        severity: Severity.ELEVATED,
        currentTier: 1,
        acknowledgedBy: null,
        triggeredAt: '2026-09-14T10:00:00.000Z',
        deadlineAt: '2026-09-14T10:02:00.000Z',
      });
    });

    it('never carries where the emergency is: screens reload that, under consent rules', () => {
      const gateway = buildGateway(jest.fn());
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as unknown as Server;

      gateway.emergencyUpdated(event());

      const [, snapshot] = emit.mock.calls[0] as [string, Record<string, unknown>];
      expect(snapshot).not.toHaveProperty('latitude');
      expect(snapshot).not.toHaveProperty('addressLabel');
    });

    it('also reaches a responder asked by area, who is in no elder room', async () => {
      const gateway = buildGateway(jest.fn(), [], false, [{ recipientId: 'responder-9' }]);
      const emit = jest.fn();
      const to = jest.fn().mockReturnValue({ emit });
      gateway.server = { to } as unknown as Server;

      gateway.emergencyUpdated(event());
      // The lookup is deliberately not awaited by the escalation path; let it settle.
      await new Promise((resolve) => setImmediate(resolve));

      expect(to).toHaveBeenLastCalledWith([userRoom('responder-9')]);
      expect(emit).toHaveBeenCalledTimes(2);
    });

    it('stays silent before the server exists rather than throwing into the escalation path', () => {
      const gateway = buildGateway(jest.fn());
      expect(() => gateway.emergencyUpdated(event())).not.toThrow();
    });

    it('sends no deadline when the tier has none', () => {
      const gateway = buildGateway(jest.fn());
      const emit = jest.fn();
      gateway.server = { to: jest.fn().mockReturnValue({ emit }) } as unknown as Server;

      gateway.emergencyUpdated(event({ currentTierDeadlineAt: null }));
      const [, snapshot] = emit.mock.calls[0] as [string, { deadlineAt: string | null }];
      expect(snapshot.deadlineAt).toBeNull();
    });
  });
});
