import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import { resolveCredentialsPath } from './credentials-path';
import type { FcmMessaging } from './fcm-push.provider';

/**
 * Builds the Firebase messaging client from the service account file.
 *
 * The import is deferred so that a deployment running on the logging provider never
 * loads the Firebase SDK at all, and so a missing or malformed credentials file fails
 * here, at startup, with a sentence explaining what to do about it.
 */
export function createFcmMessaging(config: ConfigService): FcmMessaging {
  const path = config.get<string>('FCM_SERVICE_ACCOUNT_PATH');

  if (!path) {
    throw new Error(
      'PUSH_PROVIDER is "fcm" but FCM_SERVICE_ACCOUNT_PATH is not set. Point it at the service account JSON downloaded from Firebase, for example ./credentials/fcm-service-account.json',
    );
  }

  const absolute = resolveCredentialsPath(path);
  let credentials: { project_id?: string; client_email?: string; private_key?: string };

  try {
    credentials = JSON.parse(readFileSync(absolute, 'utf8')) as typeof credentials;
  } catch (error) {
    throw new Error(
      `Could not read the Firebase service account at ${absolute}: ${
        error instanceof Error ? error.message : 'unknown error'
      }. Download it from Firebase console, Project settings, Service accounts, Generate new private key.`,
      { cause: error },
    );
  }

  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error(
      `${absolute} does not look like a Firebase service account key: project_id, client_email and private_key are all required.`,
    );
  }

  // Required lazily rather than imported: a deployment on the logging provider never
  // loads the Firebase SDK, which is several megabytes it would otherwise carry.
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { cert, getApps, initializeApp } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');

  // Initialising twice throws, and a reload in watch mode would do exactly that.
  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({ credential: cert(credentials) }, 'mzazicare');

  new Logger('Notifications').log(`Firebase messaging ready for project ${credentials.project_id}`);
  return getMessaging(app) as FcmMessaging;
  /* eslint-enable */
}
