import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { RedisService } from '../../../shared/redis/redis.service';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';
import { EscalationService } from './escalation.service';

/** What a phone needs to join an emergency's voice room. */
export interface VoiceAccess {
  url: string;
  token: string;
  room: string;
  expiresInSeconds: number;
}

/** Whether talking is possible, and who started it, as every screen sees it. */
export interface VoiceView {
  /** The server has a voice service set up. Without it, no screen offers to talk. */
  available: boolean;
  /** First name of whoever first joined to talk to the elder. Null until somebody has. */
  startedBy: string | null;
  startedAt: string | null;
}

interface StoredVoice {
  byId: string;
  byName: string;
  at: string;
}

export const voiceKey = (eventId: string): string => `voice:${eventId}`;
export const voiceRoom = (eventId: string): string => `emergency-${eventId}`;

/** How long "Mary started talking" is remembered. Longer than any emergency should run. */
export const VOICE_MEMORY_SECONDS = 2 * 60 * 60;

/** How long a join token lasts. Joining needs it; staying in the room does not. */
export const VOICE_TOKEN_SECONDS = 60 * 60;

const firstName = (name: string): string => name.trim().split(/\s+/)[0] || name;

/**
 * Talking to the elder through the app, during an emergency.
 *
 * A responder presses "Talk to Grace" and joins a LiveKit room named for the emergency.
 * That is remembered for a while, and the elder's screen, told to re-read, sees who
 * started it, sounds a tone, says "Mary is joining" and joins on the speaker by itself.
 * An elder who has fallen should not have to reach the phone and answer it.
 *
 * Only the people who could press the emergency's buttons may join, under the same
 * rule; an administrator may not. Only while it is open. Every join is audited, with
 * who and when. Nothing said is recorded or passes through this server: the audio goes
 * between the phones and LiveKit.
 *
 * The token is a LiveKit access token signed here with the project's secret: the API
 * key as issuer, the account id as identity (opaque, as LiveKit asks), the first name
 * to show, and a grant for this one room that allows the microphone and nothing else.
 */
@Injectable()
export class VoiceService {
  private readonly logger = new Logger(VoiceService.name);
  private readonly jwt = new JwtService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly escalation: EscalationService,
    private readonly config: ConfigService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  get available(): boolean {
    return Boolean(
      this.config.get<string>('LIVEKIT_URL') &&
      this.config.get<string>('LIVEKIT_API_KEY') &&
      this.config.get<string>('LIVEKIT_API_SECRET'),
    );
  }

  async join(eventId: string, userId: string): Promise<VoiceAccess> {
    if (!this.available) {
      throw new ServiceUnavailableException('Talking in the app is not set up on this server');
    }

    const event = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException('Emergency not found');
    if (!OPEN_STATES.includes(event.state)) {
      throw new ConflictException('This emergency is already closed');
    }

    const person = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, role: true },
    });
    if (!person) throw new NotFoundException('Account not found');
    // The console watches; it does not take part. Same rule as the buttons.
    if (person.role === Role.ADMINISTRATOR) {
      throw new ForbiddenException('The console cannot join an emergency');
    }

    const isElder = event.elderlyId === userId;
    if (!isElder) await this.escalation.requireParticipant(event, userId);

    const now = new Date();
    if (!isElder) {
      // The first person to join is the one the elder's screen names. Set once.
      const stored: StoredVoice = {
        byId: userId,
        byName: firstName(person.name),
        at: now.toISOString(),
      };
      await this.redis.client.set(
        voiceKey(eventId),
        JSON.stringify(stored),
        'EX',
        VOICE_MEMORY_SECONDS,
        'NX',
      );
    }

    await this.prisma.auditLog.create({
      data: {
        eventId,
        actorId: userId,
        action: AuditAction.VOICE_JOINED,
        detail: {
          as: isElder ? 'elder' : 'responder',
          secondsFromTrigger: Math.round((now.getTime() - event.triggeredAt.getTime()) / 1000),
        } as unknown as Prisma.InputJsonValue,
        occurredAt: now,
      },
    });

    // The elder's screen re-reads and finds somebody waiting to talk.
    if (!isElder) this.realtime.emergencyUpdated(event);
    this.logger.log(`Voice join for ${eventId} (${isElder ? 'elder' : 'responder'})`);

    return {
      url: this.config.getOrThrow<string>('LIVEKIT_URL'),
      token: this.token(eventId, userId, firstName(person.name)),
      room: voiceRoom(eventId),
      expiresInSeconds: VOICE_TOKEN_SECONDS,
    };
  }

  /** Whether talking is possible on this emergency, and who started it. */
  async current(eventId: string, open: boolean): Promise<VoiceView> {
    const available = this.available;
    if (!available || !open)
      return { available: available && open, startedBy: null, startedAt: null };

    try {
      const raw = await this.redis.client.get(voiceKey(eventId));
      if (!raw) return { available, startedBy: null, startedAt: null };
      const stored = JSON.parse(raw) as StoredVoice;
      return { available, startedBy: stored.byName, startedAt: stored.at };
    } catch {
      // Redis away: the button still works, the elder's screen just will not join by itself.
      return { available, startedBy: null, startedAt: null };
    }
  }

  private token(eventId: string, userId: string, name: string): string {
    return this.jwt.sign(
      {
        name,
        video: {
          room: voiceRoom(eventId),
          roomJoin: true,
          canPublish: true,
          canSubscribe: true,
          canPublishData: false,
          canPublishSources: ['microphone'],
        },
      },
      {
        secret: this.config.getOrThrow<string>('LIVEKIT_API_SECRET'),
        issuer: this.config.getOrThrow<string>('LIVEKIT_API_KEY'),
        subject: userId,
        algorithm: 'HS256',
        expiresIn: VOICE_TOKEN_SECONDS,
        notBefore: 0,
      },
    );
  }
}
