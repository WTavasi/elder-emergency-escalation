import type { Prisma } from '@prisma/client';

/**
 * What to select on a user to reach every phone they are signed in on: each device's push
 * address, and the single one kept on the account by sessions from before devices existed.
 */
export const PUSH_TARGETS_SELECT = {
  pushToken: true,
  devices: { where: { pushToken: { not: null } }, select: { pushToken: true } },
} satisfies Prisma.UserSelect;

/** Every push address a person can be reached at, once each. */
export function pushTokensOf(person: {
  pushToken?: string | null;
  devices?: { pushToken: string | null }[];
}): string[] {
  const tokens = [
    ...(person.devices ?? []).map((device) => device.pushToken),
    person.pushToken ?? null,
  ].filter((token): token is string => Boolean(token));
  return [...new Set(tokens)];
}
