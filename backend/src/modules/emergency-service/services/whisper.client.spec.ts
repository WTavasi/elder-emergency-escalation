import type { ConfigService } from '@nestjs/config';
import { WhisperClient } from './whisper.client';

const config = (url?: string) =>
  ({
    get: (key: string, fallback?: unknown) => (key === 'WHISPER_URL' ? url : fallback),
  }) as unknown as ConfigService;

const reply = (body: unknown, status = 200) =>
  ({ ok: status < 300, status, json: () => Promise.resolve(body) }) as Response;

describe('WhisperClient', () => {
  afterEach(() => jest.restoreAllMocks());

  it('is off with no server set', () => {
    expect(new WhisperClient(config()).enabled).toBe(false);
  });

  it('writes Swahili down as said, then in English', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ text: ' Nimeanguka jikoni ', language: 'sw' }))
      .mockResolvedValueOnce(reply({ text: ' I fell in the kitchen ', language: 'en' }));

    const heard = await new WhisperClient(config('http://whisper:9000/')).hear(
      Buffer.from('x'),
      'audio/mp4',
      'help.m4a',
    );

    expect(heard).toEqual({
      text: 'Nimeanguka jikoni',
      language: 'sw',
      english: 'I fell in the kitchen',
    });
    expect(String(fetch.mock.calls[0][0])).toBe(
      'http://whisper:9000/asr?task=transcribe&output=json&encode=true&vad_filter=true',
    );
    expect(String(fetch.mock.calls[1][0])).toContain('task=translate');
  });

  it('asks once for English', async () => {
    const fetch = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(reply({ text: 'I fell', language: 'en' }));
    const heard = await new WhisperClient(config('http://whisper:9000')).hear(
      Buffer.from('x'),
      'audio/mp4',
      'help.m4a',
    );
    expect(heard.english).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('fails when the server refuses', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce(reply({}, 500));
    await expect(
      new WhisperClient(config('http://whisper:9000')).hear(Buffer.from('x'), 'audio/mp4', 'a.m4a'),
    ).rejects.toThrow('500');
  });
});
