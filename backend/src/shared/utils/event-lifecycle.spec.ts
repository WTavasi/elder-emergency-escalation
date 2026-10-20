import { ConflictException } from '@nestjs/common';
import { EventState, Prisma } from '@prisma/client';
import {
  AWAITING_STATES,
  CLOSED_STATES,
  INITIAL_STATE,
  OPEN_STATES,
  StaleTransitionError,
  TRANSITIONS,
  assertTransition,
  canTransition,
  sourcesOf,
  transitionEvent,
} from './event-lifecycle';

const ALL = Object.values(EventState);

const notFound = (): Prisma.PrismaClientKnownRequestError =>
  new Prisma.PrismaClientKnownRequestError('No record was found for an update.', {
    code: 'P2025',
    clientVersion: 'test',
  });

describe('the emergency lifecycle table', () => {
  it('names every state, so a new one cannot be added without deciding its moves', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual([...ALL].sort());
  });

  it('splits every state into open or closed, never both', () => {
    expect([...OPEN_STATES, ...CLOSED_STATES].sort()).toEqual([...ALL].sort());
    expect(OPEN_STATES.filter((state) => CLOSED_STATES.includes(state))).toEqual([]);
  });

  it('treats only the unowned open states as waiting on an acknowledgement window', () => {
    const owned: EventState[] = [EventState.ACKNOWLEDGED, EventState.ON_SCENE];
    expect([...AWAITING_STATES].sort()).toEqual(
      OPEN_STATES.filter((state) => !owned.includes(state)).sort(),
    );
  });

  it('lets every open emergency be closed with an outcome', () => {
    for (const state of OPEN_STATES) expect(canTransition(state, EventState.RESOLVED)).toBe(true);
  });

  it('lets anybody take on an emergency nobody owns yet, and only then', () => {
    expect(sourcesOf(EventState.ACKNOWLEDGED).sort()).toEqual([...AWAITING_STATES].sort());
  });

  it('never cancels an emergency somebody has taken on', () => {
    expect(canTransition(EventState.ACKNOWLEDGED, EventState.CANCELLED)).toBe(false);
    expect(canTransition(EventState.ON_SCENE, EventState.CANCELLED)).toBe(false);
  });

  it('reaches the elder only from an emergency somebody could own', () => {
    expect(sourcesOf(EventState.ON_SCENE).sort()).toEqual(
      [EventState.ACKNOWLEDGED, EventState.ESCALATED].sort(),
    );
  });

  it('lets somebody with the elder still call in a responder', () => {
    expect(canTransition(EventState.ON_SCENE, EventState.ESCALATED)).toBe(true);
  });

  it('never sends an owned or escalated emergency back to merely notified', () => {
    expect(canTransition(EventState.ACKNOWLEDGED, EventState.NOTIFIED)).toBe(false);
    expect(canTransition(EventState.ESCALATED, EventState.NOTIFIED)).toBe(false);
    expect(canTransition(EventState.ON_SCENE, EventState.NOTIFIED)).toBe(false);
    expect(canTransition(EventState.ON_SCENE, EventState.ACKNOWLEDGED)).toBe(false);
  });

  it('lets a resolved emergency go nowhere', () => {
    expect(TRANSITIONS[EventState.RESOLVED]).toEqual([]);
  });

  it('lets a cancelled alert only be reopened, and only reopening returns to the start', () => {
    expect(TRANSITIONS[EventState.CANCELLED]).toEqual([INITIAL_STATE]);
    expect(sourcesOf(INITIAL_STATE)).toEqual([EventState.CANCELLED]);
  });
});

describe('assertTransition', () => {
  it('allows a move the table lists', () => {
    expect(() => assertTransition(EventState.NOTIFIED, EventState.ACKNOWLEDGED)).not.toThrow();
  });

  it('refuses a closed emergency in words a person can act on', () => {
    expect(() => assertTransition(EventState.RESOLVED, EventState.ACKNOWLEDGED)).toThrow(
      'This emergency is already closed',
    );
    expect(() => assertTransition(EventState.CANCELLED, EventState.RESOLVED)).toThrow(
      'This alert was cancelled',
    );
  });

  it('names both states for any other refused move', () => {
    expect(() => assertTransition(EventState.ACKNOWLEDGED, EventState.CANCELLED)).toThrow(
      'An emergency that is acknowledged cannot become cancelled',
    );
  });
});

describe('transitionEvent', () => {
  const event = { id: 'event-1', state: EventState.NOTIFIED };
  const client = (update: jest.Mock) =>
    ({ emergencyEvent: { update } }) as unknown as Parameters<typeof transitionEvent>[0];

  it('writes only if the row is still in a state the move can come from', async () => {
    const update = jest.fn().mockResolvedValue({ ...event, state: EventState.ACKNOWLEDGED });
    await transitionEvent(
      client(update),
      event,
      EventState.ACKNOWLEDGED,
      { acknowledgedBy: 'caregiver-1' },
      { acknowledgedBy: null },
    );

    expect(update).toHaveBeenCalledWith({
      where: {
        id: 'event-1',
        acknowledgedBy: null,
        state: { in: sourcesOf(EventState.ACKNOWLEDGED) },
      },
      data: { acknowledgedBy: 'caregiver-1', state: EventState.ACKNOWLEDGED },
    });
  });

  it('refuses an illegal move without touching the database', async () => {
    const update = jest.fn();
    await expect(
      transitionEvent(client(update), event, EventState.TRIGGERED),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('reports a row that moved underneath it as stale, not as missing', async () => {
    const update = jest.fn().mockRejectedValue(notFound());
    await expect(
      transitionEvent(client(update), event, EventState.RESOLVED),
    ).rejects.toBeInstanceOf(StaleTransitionError);
  });

  it('passes any other database failure through untouched', async () => {
    const failure = new Error('connection reset');
    const update = jest.fn().mockRejectedValue(failure);
    await expect(transitionEvent(client(update), event, EventState.RESOLVED)).rejects.toBe(failure);
  });
});
