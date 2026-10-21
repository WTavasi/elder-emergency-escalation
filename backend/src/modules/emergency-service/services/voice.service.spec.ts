import { ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, EventState, Role } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import type { RedisService } from '../../../shared/redis/redis.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import type { EscalationService } from './escalation.service';
import { VOICE_TOKEN_SECONDS, VoiceService, voiceKey, voiceRoom } from './voice.service';

const SETTINGS: Record<string, string> = {
  LIVEKIT_URL: 'wss://mzazicare-test.livekit.cloud',
  LIVEKIT_API_KEY: 'APItestkey',
  LIVEKIT_API_SECRET: 'a-test-secret-that-is-long-enough-for-hs256',
};

const EVENT = {
  id: '6f1c2b8e-1a0b-4c7d-9e3f-111111111111',
  elderlyId: 'elder-1',
  state: EventState.ACKNOWLEDGED,
  triggeredAt: new Date(Date.now() - 90_000),
};

function build(
  options: {
    settings?: Record<string, string>;
    event?: Record<string, unknown> | null;
    person?: { name: string; role: Role } | null;
    participant?: boolean;
  } = {},
) {
  const settings = options.settings ?? SETTINGS;
  const config = {
    get: (key: string) => settings[key],
    getOrThrow: (key: string) => {
      if (!settings[key]) throw new Error(`${key} missing`);
      return settings[key];
    },
  } as unknown as ConfigService;
  const store = new Map<string, string>();
  const redis = {
    client: {
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      set: jest.fn((key: string, value: string, ...flags: unknown[]) => {
        if (flags.includes('NX') && store.has(key)) return Promise.resolve(null);
        store.set(key, value);
        return Promise.resolve('OK');
      }),
    },
  };
  const prisma = {
    emergencyEvent: {
      findUnique: jest.fn().mockResolvedValue(options.event === undefined ? EVENT : options.event),
    },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue(
          options.person === undefined
            ? { name: 'Mary Otieno', role: Role.CAREGIVER }
            : options.person,
        ),
    },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const escalation = {
    requireParticipant: jest.fn(() =>
      options.participant === false
        ? Promise.reject(new ForbiddenException('You are not part of this emergency'))
        : Promise.resolve(),
    ),
  };
  const realtime = new NoopRealtimePublisher();
  jest.spyOn(realtime, 'emergencyUpdated');

  const service = new VoiceService(
    prisma as unknown as PrismaService,
    redis as unknown as RedisService,
    escalation as unknown as EscalationService,
    config,
    realtime,
  );
  return { service, prisma, redis, store, escalation, realtime };
}

describe('VoiceService', () => {
  it('gives a responder a token for this emergency room only, for the microphone only', async () => {
    const t = build();

    const access = await t.service.join(EVENT.id, 'carer-1');

    expect(access.url).toBe(SETTINGS.LIVEKIT_URL);
    expect(access.room).toBe(voiceRoom(EVENT.id));
    expect(access.expiresInSeconds).toBe(VOICE_TOKEN_SECONDS);

    // The token verifies against the project secret, as LiveKit will check it.
    const claims = new JwtService().verify<Record<string, unknown>>(access.token, {
      secret: SETTINGS.LIVEKIT_API_SECRET,
      algorithms: ['HS256'],
    });
    expect(claims.iss).toBe('APItestkey');
    expect(claims.sub).toBe('carer-1');
    // First name only: identity and names appear in LiveKit's logs.
    expect(claims.name).toBe('Mary');
    expect(claims.video).toEqual(
      expect.objectContaining({
        room: voiceRoom(EVENT.id),
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: false,
        canPublishSources: ['microphone'],
      }),
    );
  });

  it('remembers the first responder to join, so the elder screen can name them', async () => {
    const t = build();

    await t.service.join(EVENT.id, 'carer-1');
    const view = await t.service.current(EVENT.id, true);

    expect(view.available).toBe(true);
    expect(view.startedBy).toBe('Mary');
    expect(view.startedAt).not.toBeNull();
    expect(t.realtime.emergencyUpdated).toHaveBeenCalledTimes(1);
  });

  it('keeps the first name when a second responder joins', async () => {
    const t = build();
    await t.service.join(EVENT.id, 'carer-1');
    t.prisma.user.findUnique.mockResolvedValue({ name: 'Aisha Otieno', role: Role.FAMILY_MEMBER });

    await t.service.join(EVENT.id, 'family-1');

    expect((await t.service.current(EVENT.id, true)).startedBy).toBe('Mary');
  });

  it('lets the elder join without changing who started it, or asking anyone to re-read', async () => {
    const t = build({ person: { name: 'Grace Wanjiru', role: Role.ELDER } });

    await t.service.join(EVENT.id, 'elder-1');

    expect(t.escalation.requireParticipant).not.toHaveBeenCalled();
    expect(t.store.has(voiceKey(EVENT.id))).toBe(false);
    expect(t.realtime.emergencyUpdated).not.toHaveBeenCalled();
  });

  it('audits every join, with who and when, and nothing else', async () => {
    const t = build();

    await t.service.join(EVENT.id, 'carer-1');

    const data = t.prisma.auditLog.create.mock.calls[0][0].data as {
      action: AuditAction;
      actorId: string;
      detail: { as: string; secondsFromTrigger: number };
    };
    expect(data.action).toBe(AuditAction.VOICE_JOINED);
    expect(data.actorId).toBe('carer-1');
    expect(data.detail.as).toBe('responder');
    expect(data.detail.secondsFromTrigger).toBeGreaterThanOrEqual(89);
  });

  it('applies the same participant rule as the buttons', async () => {
    const t = build({ participant: false });

    await expect(t.service.join(EVENT.id, 'stranger-1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(t.prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('refuses the console', async () => {
    const t = build({ person: { name: 'Admin', role: Role.ADMINISTRATOR } });

    await expect(t.service.join(EVENT.id, 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a closed emergency', async () => {
    const t = build({ event: { ...EVENT, state: EventState.RESOLVED } });

    await expect(t.service.join(EVENT.id, 'carer-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('says plainly when no voice service is set up', async () => {
    const t = build({ settings: {} });

    await expect(t.service.join(EVENT.id, 'carer-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(await t.service.current(EVENT.id, true)).toEqual({
      available: false,
      startedBy: null,
      startedAt: null,
    });
  });

  it('offers nothing on a closed emergency', async () => {
    const t = build();
    await t.service.join(EVENT.id, 'carer-1');

    expect(await t.service.current(EVENT.id, false)).toEqual({
      available: false,
      startedBy: null,
      startedAt: null,
    });
  });
});
