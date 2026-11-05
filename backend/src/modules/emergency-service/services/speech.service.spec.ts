import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AuditAction, EmergencyType, EventState } from '@prisma/client';
import type { PrismaService } from '../../../db/prisma.service';
import { NoopRealtimePublisher } from '../../realtime-service/services/realtime.publisher';
import type { EscalationService } from './escalation.service';
import { SpeechService, type SpokenAudio } from './speech.service';
import type { Heard, WhisperClient } from './whisper.client';

const audio: SpokenAudio = {
  buffer: Buffer.from('fake'),
  mimetype: 'audio/mp4',
  originalname: 'help.m4a',
  size: 4,
};

function build(
  options: {
    heard?: Heard | Error;
    reported?: EmergencyType | null;
    consented?: boolean;
    enabled?: boolean;
    state?: EventState;
  } = {},
) {
  const created: Array<Record<string, unknown>> = [];
  const audit: Array<Record<string, unknown>> = [];
  const prisma = {
    emergencyEvent: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'event-1',
        elderlyId: 'elder-1',
        state: options.state ?? EventState.NOTIFIED,
        reportedType: options.reported ?? null,
      }),
    },
    consentRecord: { count: jest.fn().mockResolvedValue(options.consented === false ? 0 : 1) },
    eventSpeech: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return Promise.resolve(data);
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    auditLog: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        audit.push(data);
        return Promise.resolve(data);
      }),
    },
    $transaction: jest.fn((work: Promise<unknown>[]) => Promise.all(work)),
  };
  const heard = options.heard ?? {
    text: 'Msaada! Moto jikoni',
    language: 'sw',
    english: 'Help! Fire in the kitchen',
  };
  const whisper = {
    enabled: options.enabled ?? true,
    hear: jest.fn(() => (heard instanceof Error ? Promise.reject(heard) : Promise.resolve(heard))),
  };
  const escalation = { reportType: jest.fn().mockResolvedValue({}) };
  const service = new SpeechService(
    prisma as unknown as PrismaService,
    whisper as unknown as WhisperClient,
    escalation as unknown as EscalationService,
    new NoopRealtimePublisher(),
  );
  return { service, escalation, created, audit, whisper };
}

describe('SpeechService', () => {
  it('reports the fire it heard in Swahili, as a tap would, and keeps the words', async () => {
    const { service, escalation, created, audit } = build();

    const heard = await service.report('event-1', 'elder-1', audio);

    expect(escalation.reportType).toHaveBeenCalledWith(
      'event-1',
      'elder-1',
      EmergencyType.FIRE,
      'voice',
    );
    expect(heard).toMatchObject({
      transcript: 'Msaada! Moto jikoni',
      english: 'Help! Fire in the kitchen',
      heardType: EmergencyType.FIRE,
      applied: true,
    });
    expect(created[0]).toMatchObject({
      language: 'sw',
      heardType: EmergencyType.FIRE,
      applied: true,
    });
    // The trail says what was heard, never the words.
    expect(audit[0]).toMatchObject({
      action: AuditAction.SPEECH_HEARD,
      detail: { language: 'sw', heardType: EmergencyType.FIRE, applied: true },
    });
    expect(JSON.stringify(audit[0])).not.toContain('jikoni');
  });

  it('reads the English when the words themselves say nothing it knows', async () => {
    const { service, escalation } = build({
      heard: { text: 'Nimejikwaa bafuni', language: 'sw', english: 'I tripped in the bathroom' },
    });
    await service.report('event-1', 'elder-1', audio);
    expect(escalation.reportType).toHaveBeenCalledWith(
      'event-1',
      'elder-1',
      EmergencyType.FALL,
      'voice',
    );
  });

  it('never replaces what was reported with something less urgent', async () => {
    const { service, escalation } = build({
      reported: EmergencyType.BREATHING,
      heard: { text: 'I fell', language: 'en', english: null },
    });

    const heard = await service.report('event-1', 'elder-1', audio);

    expect(escalation.reportType).not.toHaveBeenCalled();
    expect(heard).toMatchObject({ heardType: EmergencyType.FALL, applied: false });
  });

  it('raises it when what was said is more urgent', async () => {
    const { service, escalation } = build({ reported: EmergencyType.FALL });
    await service.report('event-1', 'elder-1', audio);
    expect(escalation.reportType).toHaveBeenCalledWith(
      'event-1',
      'elder-1',
      EmergencyType.FIRE,
      'voice',
    );
  });

  it('keeps words that say no type, and reports nothing', async () => {
    const { service, escalation, created } = build({
      heard: { text: 'Please come quickly', language: 'en', english: null },
    });
    const heard = await service.report('event-1', 'elder-1', audio);
    expect(heard.heardType).toBeNull();
    expect(escalation.reportType).not.toHaveBeenCalled();
    expect(created).toHaveLength(1);
  });

  it('keeps nothing when nothing was said', async () => {
    const { service, created } = build({ heard: { text: '', language: null, english: null } });
    await expect(service.report('event-1', 'elder-1', audio)).resolves.toMatchObject({
      transcript: '',
    });
    expect(created).toHaveLength(0);
  });

  it('says plainly when the speech server is down', async () => {
    const { service } = build({ heard: new Error('timeout') });
    await expect(service.report('event-1', 'elder-1', audio)).rejects.toThrow(
      "We couldn't hear that. Try again, or tap what's happening.",
    );
  });

  it('needs the consent, a speech server, an open alert and the elder themselves', async () => {
    await expect(
      build({ consented: false }).service.report('event-1', 'elder-1', audio),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      build({ enabled: false }).service.report('event-1', 'elder-1', audio),
    ).rejects.toThrow(ServiceUnavailableException);
    await expect(
      build({ state: EventState.RESOLVED }).service.report('event-1', 'elder-1', audio),
    ).rejects.toThrow(ConflictException);
    await expect(build().service.report('event-1', 'someone-else', audio)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('tells the elder whether to offer the microphone', async () => {
    await expect(build().service.status('elder-1', 'elder-1')).resolves.toEqual({
      available: true,
      consented: true,
    });
    await expect(build().service.status('elder-1', 'caregiver-1')).rejects.toThrow(
      ForbiddenException,
    );
  });
});
