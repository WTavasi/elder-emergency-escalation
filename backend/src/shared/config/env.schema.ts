import { Transform, Type, plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  Matches,
  IsInt,
  IsNotEmpty,
  IsOptional,
  ValidateIf,
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

  /**
   * How long an elder stays signed in without opening the app. Far longer than anybody
   * else, on purpose: an elder who has not needed the app for a month must not meet a
   * sign-in screen at the moment they do. Their session still rotates on every use and
   * still ends at once on sign-out, a password change or deactivation.
   */
  @Matches(/^\d+[smhd]$/, { message: 'JWT_REFRESH_TTL_ELDER must look like 3650d or 900' })
  JWT_REFRESH_TTL_ELDER = '3650d';

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
   * Whether the escalation reconciliation sweep runs.
   *
   * On in production, off in the integration suite. The suite exists to prove that
   * escalation is genuinely driven by Redis key expiry, and a sweep running underneath
   * it would promote anything the listener had missed, so the suite would pass whether
   * the event-driven path worked or not. A safety net that hides the failure it is
   * catching is worse than no safety net.
   */
  @Transform(({ value }) => (value === undefined ? true : value === 'true' || value === true))
  @IsBoolean()
  ESCALATION_SWEEP_ENABLED: boolean = true;

  /**
   * How often the sweep reconciles recorded deadlines against the clock, milliseconds.
   *
   * This is the worst-case escalation delay when Redis expiry events are unavailable,
   * so it is a latency budget rather than a housekeeping interval. Fifteen seconds is
   * short against the shortest acknowledgement window the system uses and cheap against
   * the query, which is indexed and touches only open events.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1000)
  ESCALATION_SWEEP_INTERVAL_MS: number = 15_000;

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

  /**
   * Address search, for setting an elder's home. OpenStreetMap's public Nominatim by
   * default, called only from this server, never from the app. Its usage policy
   * (https://operations.osmfoundation.org/policies/nominatim/) allows one request a
   * second across every user, asks for an identifying User-Agent with a contact, forbids
   * search-as-you-type, and asks for results to be cached; the address search service
   * does all four. A busier deployment should point this at its own instance.
   */
  @IsUrl({ require_tld: false })
  GEOCODER_URL = 'https://nominatim.openstreetmap.org';

  /**
   * How a responder's time to the elder is worked out while they share their way there.
   * "estimate" uses the straight-line distance, a detour factor and a city driving speed,
   * needs nothing from outside, and is the default so the test suites stay
   * deterministic. "osrm" asks an OSRM router for a driving route, falling back to the
   * estimate whenever it is slow, busy or unreachable. Switched on per run, like the
   * notification providers.
   */
  @IsIn(['estimate', 'osrm'], { message: 'ROUTING_PROVIDER must be "estimate" or "osrm"' })
  ROUTING_PROVIDER = 'estimate';

  /**
   * The OSRM router. The public demonstration server allows one request a second for
   * non-commercial use (https://github.com/Project-OSRM/osrm-backend/wiki/Demo-server),
   * which the routing service keeps to across every responder. A busier deployment runs
   * its own.
   */
  @IsUrl({ require_tld: false })
  ROUTING_URL = 'https://router.project-osrm.org';

  /**
   * How close a shared position has to come to the alert's location to count as
   * arriving. 100 metres covers a phone's usual accuracy in a city and the walk from
   * the gate to the door.
   */
  @Type(() => Number)
  @IsInt()
  @Min(20)
  @Max(1000)
  ARRIVAL_RADIUS_METRES: number = 100;

  /**
   * The OAuth client ID for Google sign-in on the console, from Google Cloud Console
   * (APIs & Services, Credentials, a Web application client). Not a secret: the console
   * shows it to every browser. Unset, the console offers no Google button.
   */
  // Checked only when given, so an empty `GOOGLE_CLIENT_ID=` line means "not set up".
  @ValidateIf((env: EnvSchema) => Boolean(env.GOOGLE_CLIENT_ID))
  @Matches(/^[\w-]+\.apps\.googleusercontent\.com$/, {
    message: 'GOOGLE_CLIENT_ID must end in .apps.googleusercontent.com',
  })
  GOOGLE_CLIENT_ID?: string;

  /** A contact for the geocoder's operators, sent in the User-Agent as its policy asks. */
  @IsOptional()
  @IsString()
  GEOCODER_CONTACT?: string;

  /** Comma-separated ISO country codes to search within, empty for anywhere. */
  @Matches(/^([a-z]{2}(,[a-z]{2})*)?$/, {
    message: 'GEOCODER_COUNTRY_CODES must look like "ke" or "ke,ug,tz", or be empty',
  })
  GEOCODER_COUNTRY_CODES = 'ke';

  /**
   * How long a sign-up verification code stays valid, in seconds. Ten minutes is long
   * enough for an SMS that arrives late and short enough that a code read off somebody
   * else's phone is soon worthless.
   */
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  VERIFICATION_CODE_TTL_SECONDS: number = 600;
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
        'Check backend/.env against .env.example.',
      ].join('\n'),
    );
  }

  return config;
}
