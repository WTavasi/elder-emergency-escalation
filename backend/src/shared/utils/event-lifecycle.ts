import { ConflictException } from '@nestjs/common';
import { EventState, Prisma, type EmergencyEvent } from '@prisma/client';

/**
 * The emergency lifecycle, in one place (NFR-05).
 *
 * Every state an emergency can move to from every state it can be in. An operation
 * still checks its own preconditions (who may act, whether the cancel window is still
 * open, whether somebody already owns the emergency), but no operation decides on its
 * own which state changes exist. This table does, and the state diagram in Chapter 4
 * is drawn from it.
 *
 * A state listed under itself is a real move, not a no-op: NOTIFIED to NOTIFIED is a
 * second tier dispatched in parallel, ESCALATED to ESCALATED is a further rung.
 */
export const TRANSITIONS: Readonly<Record<EventState, readonly EventState[]>> = {
  // Raised. Tier one is dispatched at once; an empty tier one escalates straight away.
  [EventState.TRIGGERED]: [
    EventState.NOTIFIED,
    EventState.ESCALATED,
    EventState.ACKNOWLEDGED,
    EventState.RESOLVED,
    EventState.CANCELLED,
  ],
  [EventState.NOTIFIED]: [
    EventState.NOTIFIED,
    EventState.ESCALATED,
    EventState.ACKNOWLEDGED,
    EventState.RESOLVED,
    EventState.CANCELLED,
  ],
  // Cancelling is still possible here: an empty tier one escalates inside the cancel
  // window, and an elder who pressed by mistake must not lose the right to withdraw it
  // because the first person in their chain was missing.
  [EventState.ESCALATED]: [
    EventState.ESCALATED,
    EventState.ACKNOWLEDGED,
    EventState.RESOLVED,
    EventState.CANCELLED,
  ],
  // The owner calling in an emergency responder is the one way out other than closing.
  [EventState.ACKNOWLEDGED]: [EventState.ESCALATED, EventState.RESOLVED],
  [EventState.RESOLVED]: [],
  // A cancelled alert that could not be confirmed as a false alarm can be put back.
  [EventState.CANCELLED]: [EventState.TRIGGERED],
};

/** The state every emergency starts in. */
export const INITIAL_STATE = EventState.TRIGGERED;

/*
 * The groups every module filters by. Plain arrays because Prisma's `in` filter will not
 * take a read-only one; nothing assigns to them.
 */

/** Still live: something may yet happen to it. */
export const OPEN_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ACKNOWLEDGED,
  EventState.ESCALATED,
];

/** Finished. Only these are ever deleted by retention. */
export const CLOSED_STATES: EventState[] = [EventState.RESOLVED, EventState.CANCELLED];

/** Open and waiting for somebody to take ownership, so an acknowledgement window means something. */
export const AWAITING_STATES: EventState[] = [
  EventState.TRIGGERED,
  EventState.NOTIFIED,
  EventState.ESCALATED,
];

export function canTransition(from: EventState, to: EventState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Every state from which `to` can be reached. What a guarded write may find the row in. */
export function sourcesOf(to: EventState): EventState[] {
  return (Object.keys(TRANSITIONS) as EventState[]).filter((from) => canTransition(from, to));
}

const named = (state: EventState): string => state.toLowerCase();

/** Refuses a move the table does not allow, in words a person can act on. */
export function assertTransition(from: EventState, to: EventState): void {
  if (canTransition(from, to)) return;

  if (from === EventState.CANCELLED) throw new ConflictException('This alert was cancelled');
  if (from === EventState.RESOLVED) throw new ConflictException('This emergency is already closed');
  throw new ConflictException(`An emergency that is ${named(from)} cannot become ${named(to)}`);
}

/**
 * Raised when the row changed between being read and being written, so the move that
 * was checked against the old state no longer applies. Callers acting for a person
 * let it reach them as a conflict; the escalation engine treats it as "somebody got
 * there first" and stands down.
 */
export class StaleTransitionError extends ConflictException {
  constructor() {
    super('This emergency changed while you were acting on it. Check it and try again.');
  }
}

/** The part of a Prisma client a transition writes through, so a transaction can be passed. */
export type TransitionClient = Pick<Prisma.TransactionClient, 'emergencyEvent'>;

/**
 * Moves one emergency to a new state. The only way any service changes `state`.
 *
 * Two checks, for two different failures. The table check refuses a move that is
 * never legal, against the state as it was read. The write itself then repeats the
 * question in its WHERE clause, so the database applies the check and the change as
 * one statement: if somebody else moved the emergency in between (an acknowledgement
 * landing in the same instant as a timer, two caregivers reopening at once), this
 * write matches no row and nothing is overwritten. `where` narrows it further for an
 * operation that needs more than a legal state, such as nobody owning it yet.
 */
export async function transitionEvent(
  client: TransitionClient,
  event: Pick<EmergencyEvent, 'id' | 'state'>,
  to: EventState,
  data: Omit<Prisma.EmergencyEventUncheckedUpdateInput, 'state'> = {},
  where: Prisma.EmergencyEventWhereInput = {},
): Promise<EmergencyEvent> {
  assertTransition(event.state, to);

  try {
    return await client.emergencyEvent.update({
      where: { ...where, id: event.id, state: { in: sourcesOf(to) } },
      data: { ...data, state: to },
    });
  } catch (error) {
    // P2025: the WHERE matched nothing, which here means the state moved underneath us.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new StaleTransitionError();
    }
    throw error;
  }
}
