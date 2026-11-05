import {
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ConflictException,
} from '@nestjs/common';
import { AuditAction, ConsentType, type EmergencyType } from '@prisma/client';
import { PrismaService } from '../../../db/prisma.service';
import { TYPE_KEYWORDS, typeFromText } from '../../../shared/language/emergency-words';
import { OPEN_STATES } from '../../../shared/utils/event-lifecycle';
import {
  REALTIME_PUBLISHER,
  type RealtimePublisher,
} from '../../realtime-service/services/realtime.publisher';
import { EscalationService } from './escalation.service';
import { WhisperClient } from './whisper.client';

/** Whether the microphone is offered to this elder. */
export interface SpeechStatus {
  /** This server has a speech-to-text server to send to. */
  available: boolean;
  /** The VOICE_REPORTS consent stands. */
  consented: boolean;
}

/** What was heard, as the elder's screen and the alert show it. */
export interface SpeechHeard {
  at: string;
  transcript: string;
  english: string | null;
  language: string | null;
  heardType: EmergencyType | null;
  /** Reported on the emergency, so the service for it follows. */
  applied: boolean;
}

/** The recording as it arrived. */
export interface SpokenAudio {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

/** Most urgent first, by the order of the word lists: fire before a fall. */
const URGENCY: EmergencyType[] = TYPE_KEYWORDS.map(([type]) => type);

/**
 * What an elder says after pressing help: written down by our own speech server, read
 * by the same word rules as a HELP text, and reported as if tapped when it says what is
 * happening, so "Moto! Jikoni kuna moto" asks the fire service after the usual short
 * wait, and the elder can still change it.
 *
 * Never lowers anything: a type is reported only when none was, or when what was said is
 * more urgent than what was. The recording is not kept; the words are, for
 * SPEECH_RETENTION_DAYS, for the people helping to read.
 */
@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whisper: WhisperClient,
    private readonly escalation: EscalationService,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async status(elderId: string, actorId: string): Promise<SpeechStatus> {
    if (elderId !== actorId) throw new ForbiddenException('Only they can see this.');
    return { available: this.whisper.enabled, consented: await this.consented(elderId) };
  }

  async report(eventId: string, elderId: string, audio: SpokenAudio): Promise<SpeechHeard> {
    const event = await this.prisma.emergencyEvent.findUnique({
      where: { id: eventId },
      select: { id: true, elderlyId: true, state: true, reportedType: true },
    });
    if (!event || event.elderlyId !== elderId) {
      throw new NotFoundException("We couldn't find this emergency.");
    }
    if (!OPEN_STATES.includes(event.state)) {
      throw new ConflictException('This emergency is already closed.');
    }
    if (!this.whisper.enabled) {
      throw new ServiceUnavailableException("Speaking isn't available right now.");
    }
    if (!(await this.consented(elderId))) {
      throw new ForbiddenException('Agree to speaking to report first, under Me.');
    }

    let heard;
    try {
      heard = await this.whisper.hear(audio.buffer, audio.mimetype, audio.originalname);
    } catch (error) {
      this.logger.warn(
        `Speech for ${eventId} could not be written down: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw new ServiceUnavailableException(
        "We couldn't hear that. Try again, or tap what's happening.",
      );
    }
    const at = new Date();
    if (!heard.text) {
      return {
        at: at.toISOString(),
        transcript: '',
        english: null,
        language: heard.language,
        heardType: null,
        applied: false,
      };
    }

    const heardType =
      typeFromText(heard.text) ?? (heard.english ? typeFromText(heard.english) : null);
    const current = event.reportedType;
    const moreUrgent =
      heardType !== null &&
      (current === null || URGENCY.indexOf(heardType) < URGENCY.indexOf(current));

    let applied = false;
    if (moreUrgent && heardType) {
      try {
        await this.escalation.reportType(eventId, elderId, heardType, 'voice');
        applied = true;
      } catch (error) {
        this.logger.error(
          `Could not report ${heardType} heard for ${eventId}: ${error instanceof Error ? error.message : 'unknown'}`,
        );
      }
    }

    const transcript = heard.text.slice(0, 2000);
    const english = heard.english?.slice(0, 2000) ?? null;
    await this.prisma.$transaction([
      this.prisma.eventSpeech.create({
        data: {
          eventId,
          transcript,
          english,
          language: heard.language,
          heardType,
          applied,
          createdAt: at,
        },
      }),
      this.prisma.auditLog.create({
        data: {
          eventId,
          actorId: elderId,
          action: AuditAction.SPEECH_HEARD,
          detail: { language: heard.language, heardType, applied },
          occurredAt: at,
        },
      }),
    ]);

    // The circle's screens show the words; a type reported above already told them.
    if (!applied) {
      const updated = await this.prisma.emergencyEvent.findUnique({ where: { id: eventId } });
      if (updated) this.realtime.emergencyUpdated(updated);
    }
    this.logger.log(
      `Speech for ${eventId}: ${heard.language ?? 'unknown language'}, heard ${heardType ?? 'nothing'}${applied ? ', reported' : ''}`,
    );

    return {
      at: at.toISOString(),
      transcript,
      english,
      language: heard.language,
      heardType,
      applied,
    };
  }

  /** Everything said on an alert, oldest first. */
  async onAlert(eventId: string): Promise<SpeechHeard[]> {
    const rows = await this.prisma.eventSpeech.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      at: row.createdAt.toISOString(),
      transcript: row.transcript,
      english: row.english,
      language: row.language,
      heardType: row.heardType,
      applied: row.applied,
    }));
  }

  private async consented(elderId: string): Promise<boolean> {
    const count = await this.prisma.consentRecord.count({
      where: { subjectId: elderId, type: ConsentType.VOICE_REPORTS, withdrawnAt: null },
    });
    return count > 0;
  }
}
