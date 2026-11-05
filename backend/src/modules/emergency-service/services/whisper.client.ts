import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** What the speech server made of one recording. */
export interface Heard {
  /** As said, in the language it was said in. */
  text: string;
  /** The language heard, such as "sw" or "en". Null when the server did not say. */
  language: string | null;
  /** In English, when it was said in another language. */
  english: string | null;
}

/**
 * Our own speech-to-text server: the Whisper ASR webservice (infra/whisper), on a
 * machine we run. Nothing said is sent to a service outside it.
 *
 * Two passes when needed: as said, so the family reads the elder's own words, and in
 * English when it was not English, for a responder who does not speak the language and
 * for the word rules, which read both.
 */
@Injectable()
export class WhisperClient {
  private readonly logger = new Logger(WhisperClient.name);
  private readonly url: string | null;
  private readonly timeoutMs: number;

  constructor(config: ConfigService) {
    const url = config.get<string>('WHISPER_URL');
    this.url = url ? url.replace(/\/+$/, '') : null;
    this.timeoutMs = config.get<number>('WHISPER_TIMEOUT_SECONDS', 45) * 1000;
  }

  get enabled(): boolean {
    return this.url !== null;
  }

  async hear(audio: Buffer, mimetype: string, filename: string): Promise<Heard> {
    const said = await this.ask(audio, mimetype, filename, 'transcribe');
    const language = typeof said.language === 'string' ? said.language : null;
    const english =
      language && language !== 'en'
        ? (await this.ask(audio, mimetype, filename, 'translate')).text
        : null;
    return {
      text: said.text.trim(),
      language,
      english: english?.trim() || null,
    };
  }

  private async ask(
    audio: Buffer,
    mimetype: string,
    filename: string,
    task: 'transcribe' | 'translate',
  ): Promise<{ text: string; language?: unknown }> {
    if (!this.url) throw new Error('No speech server is set up');
    const form = new FormData();
    form.append('audio_file', new Blob([new Uint8Array(audio)], { type: mimetype }), filename);
    const started = Date.now();
    const response = await fetch(
      `${this.url}/asr?task=${task}&output=json&encode=true&vad_filter=true`,
      { method: 'POST', body: form, signal: AbortSignal.timeout(this.timeoutMs) },
    );
    if (!response.ok) {
      throw new Error(`The speech server answered ${response.status}`);
    }
    const body = (await response.json()) as { text?: unknown; language?: unknown };
    this.logger.log(`Speech ${task} took ${Date.now() - started} ms`);
    return { text: typeof body.text === 'string' ? body.text : '', language: body.language };
  }
}
