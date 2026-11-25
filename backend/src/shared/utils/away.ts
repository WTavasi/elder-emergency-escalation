/** What makes somebody away: the two columns on their account. */
export interface AwayFields {
  awaySince: Date | null;
  awayUntil: Date | null;
}

/**
 * Whether a person is away now. Away from awaySince until awayUntil, or until they turn
 * it off when there is no end. Past the end they are back without anything clearing it,
 * so a forgotten switch can never leave somebody out of an emergency for longer than
 * they asked.
 */
export function isAway(person: AwayFields, now: Date = new Date()): boolean {
  if (!person.awaySince) return false;
  return person.awayUntil === null || person.awayUntil.getTime() > now.getTime();
}

/** Whether a person is away, for a screen: and until when, when they said. */
export function awayOf(person: AwayFields): { away: boolean; awayUntil: string | null } {
  const away = isAway(person);
  return { away, awayUntil: away && person.awayUntil ? person.awayUntil.toISOString() : null };
}

/** Prisma's filter for people away now, the same rule as [isAway]. */
export function awayNow(now: Date = new Date()) {
  return {
    awaySince: { not: null },
    OR: [{ awayUntil: null }, { awayUntil: { gt: now } }],
  };
}
