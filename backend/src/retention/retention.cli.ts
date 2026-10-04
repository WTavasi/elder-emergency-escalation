import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from '../app.module';
import { RetentionService } from './retention.service';

/**
 * Runs one retention sweep and exits.
 *
 * A retention policy that can only be observed by waiting a day is a policy nobody
 * checks. This runs the same code the scheduled sweep runs, against the same
 * configuration, and prints what it deleted, so the policy can be demonstrated and
 * audited on demand.
 *
 *   npm run retention:sweep -w @mzazicare/api
 */
async function main(): Promise<void> {
  const logger = new Logger('RetentionSweep');

  // A context rather than a listening server: no port is opened and no request can
  // arrive while this runs.
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: false });

  try {
    const outcome = await app.get(RetentionService).sweep();

    logger.log(`Closed emergencies deleted: ${outcome.eventsDeleted}`);
    logger.log(`Audit log entries deleted:  ${outcome.auditLogsDeleted}`);
    logger.log(`Emergencies kept until:     ${outcome.eventCutoff}`);
    logger.log(`Audit entries kept until:   ${outcome.auditCutoff}`);
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
