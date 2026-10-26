import type { CareLevel, Severity } from '@prisma/client';
import type { Coordinates } from '../../../shared/utils/geo';

/** Everything the policy needs, gathered before scoring so the scoring itself is pure. */
export interface SeverityContext {
  careLevel: CareLevel | null;
  alertLocation: Coordinates;
  homeLocation: Coordinates | null;
  timezone: string;
  at: Date;
  /** Prior alerts in the recent window, or still open. */
  recentEventCount: number;
  /** True once the cancel window has passed without the elder cancelling. */
  cancelWindowElapsed: boolean;
  /**
   * Why the alert never had a cancel window, when it had none: it was texted, or raised
   * for a missed check-in. Not cancelling still counts nothing; this only says why.
   */
  withoutWindow?: WithoutWindow;
}

export type WithoutWindow = 'texted' | 'missed check-in';

export interface FactorOutcome {
  key: string;
  label: string;
  weight: number;
  /** 0 to 1. The proportion of this factor's weight that applies. */
  value: number;
  contribution: number;
  detail: string;
}

export interface SeverityAssessment {
  score: number;
  band: Severity;
  factors: FactorOutcome[];
}
