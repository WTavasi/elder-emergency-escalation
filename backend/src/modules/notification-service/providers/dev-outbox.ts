import { Injectable } from '@nestjs/common';

/** A text the logging provider would have sent. */
export interface OutboxText {
  phone: string;
  text: string;
  at: string;
}

const KEPT = 50;

/**
 * The last texts the logging provider printed, kept in memory so the Postman collection
 * can read a sign-up code the way a person reads it from the terminal.
 *
 * Only the logging provider writes here, and only in development, so nothing that was
 * really sent is ever kept. It holds the last fifty and forgets everything on restart.
 */
@Injectable()
export class DevOutbox {
  private readonly texts: OutboxText[] = [];

  record(phone: string, text: string): void {
    this.texts.push({ phone, text, at: new Date().toISOString() });
    if (this.texts.length > KEPT) this.texts.shift();
  }

  /** The texts to one number, newest first. */
  to(phone: string, limit = 10): OutboxText[] {
    return this.texts
      .filter((t) => t.phone === phone)
      .reverse()
      .slice(0, limit);
  }
}
