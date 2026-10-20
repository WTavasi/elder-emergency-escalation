import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../db/prisma.service';

/** The choices a person has made about how they help. */
export interface Preferences {
  /** Share my position with the elder's care circle while I am on my way. */
  shareWayThere: boolean;
}

/** What everybody starts with. Every choice that shares something starts off. */
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({ shareWayThere: false });

/**
 * One row per person, written the first time they change something. Reading never
 * creates a row, so asking what somebody chose leaves no trace for the ones who never
 * opened the setting.
 */
@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Preferences> {
    const row = await this.prisma.userPreference.findUnique({ where: { userId } });
    return row ? { shareWayThere: row.shareWayThere } : { ...DEFAULT_PREFERENCES };
  }

  async update(userId: string, changes: Partial<Preferences>): Promise<Preferences> {
    const row = await this.prisma.userPreference.upsert({
      where: { userId },
      create: { userId, ...DEFAULT_PREFERENCES, ...changes },
      update: changes,
    });
    return { shareWayThere: row.shareWayThere };
  }
}
