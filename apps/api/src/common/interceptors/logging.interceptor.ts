import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

/**
 * Request logging, metadata only.
 *
 * No request body, no query values, no headers. This system's request bodies contain
 * coordinates, phone numbers and credentials, and the retention promise in the privacy
 * notice is easiest to keep if none of that is ever written down in the first place.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method: string; route?: { path?: string }; url: string }>();
    const started = Date.now();

    // The route pattern, not the concrete URL, so an id in a path never lands in a log.
    const route = request.route?.path ?? 'unmatched';

    return next.handle().pipe(
      tap({
        next: () => {
          const status = http.getResponse<{ statusCode: number }>().statusCode;
          this.logger.log(`${request.method} ${route} ${status} ${Date.now() - started}ms`);
        },
        error: () => {
          this.logger.warn(`${request.method} ${route} failed in ${Date.now() - started}ms`);
        },
      }),
    );
  }
}
