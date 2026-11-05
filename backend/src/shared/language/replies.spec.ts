import { etaFromText, readReply } from './replies';

describe('reading a reply', () => {
  it.each<[string, string]>([
    ['1', 'accept'],
    ['Yes!', 'accept'],
    ['ok coming', 'accept'],
    ['On my way', 'accept'],
    ['Nakuja', 'accept'],
    ['niko njiani', 'accept'],
    ['sawa nitafika', 'accept'],
    ['poa, nakam saa hii', 'accept'],
    ['No problem', 'accept'],
    ['Hakuna shida', 'accept'],
    ['niko sawa', 'accept'],
    ['2', 'decline'],
    ['No', 'decline'],
    ["Sorry I can't", 'decline'],
    ['Siwezi, niko kazini', 'decline'],
    ['niko mbali sana', 'decline'],
    ['siezi bro', 'decline'],
    ['Siwezi sasa, nitakuja baadaye', 'unclear'],
    ['Who is this?', 'unclear'],
    ['', 'unclear'],
  ])('reads "%s" as %s', (text, intent) => {
    expect(readReply(text).intent).toBe(intent);
  });

  it('takes "1" and "2" at their word, whatever follows', () => {
    expect(readReply('1 but I am far').intent).toBe('accept');
    expect(readReply('2 sorry').intent).toBe('decline');
  });

  it('reads a time alone as coming', () => {
    expect(readReply('dakika kumi')).toEqual({ intent: 'accept', etaMinutes: 10 });
  });

  it('keeps no time from a no', () => {
    expect(readReply("can't, 2 hours away")).toEqual({ intent: 'decline', etaMinutes: null });
  });
});

describe('reading how soon', () => {
  it.each<[string, number | null]>([
    ['nakuja dakika kumi', 10],
    ['Nakuja dakika kumi na tano', 15],
    ['dakika 20', 20],
    ['dk 5', 5],
    ['coming in 10 mins', 10],
    ['10min', 10],
    ['on my way, 15 minutes', 15],
    ['ten minutes', 10],
    ['2 hours', 120],
    ['nusu saa', 30],
    ['robo saa', 15],
    ['half an hour', 30],
    ['in an hour', 60],
    ['nitafika baada ya saa moja', 60],
    ['nakam in 5', 5],
    // Eight o'clock as well as two hours, so not read.
    ['nitafika saa mbili', null],
    ['yes', null],
    ['999 minutes', null],
  ])('reads "%s" as %s', (text, minutes) => {
    expect(etaFromText(text)).toBe(minutes);
  });
});
