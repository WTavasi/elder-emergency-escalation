import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  Matches,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Every environment variable the API reads, validated once at startup.
 *
 * The point is to fail loudly on boot rather than at the moment an emergency alert
 * needs a secret that was never set.
 */
export class EnvSchema {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  // 32 characters is the floor for a signing secret worth having. `openssl rand
  // -base64 48` comfortably clears it.
  @IsString()
  @MinLength(32, {
    message:
      'JWT_ACCESS_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48',
  })
  JWT_ACCESS_SECRET: string;

  @IsString()
  @MinLength(32, {
    message:
      'JWT_REFRESH_SECRET must be at least 32 characters. Generate one with: openssl rand -base64 48',
  })
  JWT_REFRESH_SECRET: string;

  @Matches(/^\d+[smhd]$/, { message: 'JWT_ACCESS_TTL must look like 15m, 2h or 900' })
  JWT_ACCESS_TTL = '15m';

  @Matches(/^\d+[smhd]$/, { message: 'JWT_REFRESH_TTL must look like 30d, 12h or 900' })
  JWT_REFRESH_TTL = '30d';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ESCALATION_TIER1_TIMEOUT: number = 120;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  ESCALATION_TIER2_TIMEOUT: number = 180;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  CANCEL_GRACE_WINDOW: number = 10;

  // Severity policy inputs. Weights live in the severity_factors table; these are the
  // thresholds and measurement boundaries the factors are scored against.
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  NIGHT_START_HOUR: number = 22;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(23)
  NIGHT_END_HOUR: number = 6;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  AWAY_FROM_HOME_METRES: number = 250;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RECENT_ACTIVITY_HOURS: number = 6;

  /**
   * The acknowledgement time the system is evaluated against, in seconds.
   *
   * Configuration rather than a constant because it is a claim about what counts as
   * an acceptable response, and that belongs to the deployment rather than to the
   * code. The dashboard reports the percentage of emergencies answered within it.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  RESPONSE_TARGET_SECONDS: number = 300;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  SEVERITY_ELEVATED_FROM: number = 35;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  SEVERITY_CRITICAL_FROM: number = 60;

  @Type(() => Number)
  @IsInt()
  @Min(1024)
  SCRYPT_N: number = 16384;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SCRYPT_R: number = 8;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  SCRYPT_P: number = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RETENTION_AUDIT_LOG_DAYS: number = 365;

  /**
   * Lets a deployment turn the sweep off without removing the windows themselves.
   *
   * Needed because the integration suite and the seed both create data with deliberate
   * ages, and a sweep running underneath them would be a test that fails occasionally
   * for a reason nobody can reproduce.
   */
  @Transform(({ value }) => (value === undefined ? true : value === 'true' || value === true))
  @IsBoolean()
  RETENTION_ENABLED: boolean = true;

  /**
   * How long to wait for a notification provider before giving up, milliseconds.
   *
   * Node's fetch has no default timeout at all, so without this a stalled connection
   * holds a queued job until its lock expires. Ten seconds is long enough for a slow
   * mobile gateway and short enough that three attempts still finish inside the first
   * escalation window.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1_000)
  @Max(60_000)
  PROVIDER_TIMEOUT_MS: number = 10_000;

  /**
   * Lets a deployment turn rate limiting off, which the integration suite needs: it
   * signs in repeatedly from one address within seconds, and a limit would make it
   * fail for a reason that has nothing to do with escalation.
   */
  @Transform(({ value }) => (value === undefined ? true : value === 'true' || value === true))
  @IsBoolean()
  RATE_LIMIT_ENABLED: boolean = true;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RETENTION_INTERVAL_HOURS: number = 24;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  RETENTION_RESOLVED_EVENT_DAYS: number = 365;

  // Origin allowed to call the API from a browser, which is the admin dashboard.
  @IsUrl({ require_tld: false })
  ADMIN_ORIGIN = 'http://localhost:5173';

  // Notification providers. "logging" writes what would have been sent and reports
  // success, which is what lets the whole escalation chain run without credentials.
  // Starting in production with it is refused.
  @IsIn(['logging', 'fcm'], { message: 'PUSH_PROVIDER must be "logging" or "fcm"' })
  PUSH_PROVIDER = 'logging';

  @IsIn(['logging', 'africastalking'], {
    message: 'SMS_PROVIDER must be "logging" or "africastalking"',
  })
  SMS_PROVIDER = 'logging';

  // Provider credentials. Optional until the notification stage, so the API runs
  // without them, but an empty value must be an explicit absence rather than a
  // silently broken integration.
  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_PATH?: string;

  @IsOptional()
  @IsString()
  AT_USERNAME?: string;

  @IsOptional()
  @IsString()
  AT_API_KEY?: string;

  @IsOptional()
  @IsString()
  AT_SENDER_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_MAPS_API_KEY?: string;
}

/** Keys whose values must never reach a log line or an error message. */
const SECRET_KEYS = new Set([
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'AT_API_KEY',
  'GOOGLE_MAPS_API_KEY',
]);

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  // Empty strings in a .env file mean "not set", not "set to nothing".
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (value !== '') cleaned[key] = value;
  }

  const config = plainToInstance(EnvSchema, cleaned, {
    enableImplicitConversion: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const lines = errors.map((error) => {
      const messages = Object.values(error.constraints ?? {}).join('; ');
      const shown = SECRET_KEYS.has(error.property)
        ? '[redacted]'
        : String(error.value ?? '(unset)');
      return `  ${error.property}: ${messages} (received: ${shown})`;
    });
    throw new Error(
      [
        'Invalid environment configuration. The API will not start.',
        ...lines,
        '',
        'Check apps/api/.env against .env.example.',
      ].join('\n'),
    );
  }

  return config;
}
