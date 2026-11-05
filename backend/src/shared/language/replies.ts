import { wordsOf } from './emergency-words';

/**
 * Reading a text reply for what it means, in English, Swahili and Sheng, by rules on our
 * own server: yes, no, or not sure, and how soon the person will be there when they say.
 *
 * "1" and "2" are what the alert asks for and always win. Beyond them, people write what
 * they would say: "nakuja dakika kumi", "niko njiani", "siwezi, niko kazini", "on my way,
 * 15 mins". When a reply says both yes and no ("siwezi sasa, nitakuja baadaye"), or
 * neither, it is not guessed: the person is asked again.
 */

export type ReplyIntent = 'accept' | 'decline' | 'unclear';

export interface ReadReply {
  intent: ReplyIntent;
  /** How soon they said they would be there, when they said. */
  etaMinutes: number | null;
}

/** Yes, coming, on my way, I am fine. Phrases match as whole words in order. */
const ACCEPT = [
  'yes',
  'y',
  'ok',
  'okay',
  'sure',
  'fine',
  'going',
  'coming',
  'on my way',
  'omw',
  'on the way',
  'will go',
  'ill go',
  'im going',
  'im coming',
  'be there',
  'no problem',
  // Swahili
  'ndio',
  'ndiyo',
  'sawa',
  'salama',
  'nakuja',
  'ninakuja',
  'nitakuja',
  'naenda',
  'ninaenda',
  'nitaenda',
  'niko njiani',
  'nitafika',
  'hakuna shida',
  'niko sawa',
  // Sheng
  'poa',
  'fiti',
  'nakam',
  'nitakam',
  'niko on the way',
  'hakuna noma',
] as const;

/** No, cannot, far away, busy. */
const DECLINE = [
  'no',
  'n',
  'cannot',
  'cant',
  'can not',
  'unable',
  'not able',
  'busy',
  'sorry',
  'far away',
  // Swahili
  'hapana',
  'siwezi',
  'sitaweza',
  'sitakuja',
  'sitafika',
  'niko mbali',
  'niko kazini',
  'nimeshikwa',
  // Sheng
  'siezi',
  'sitakam',
  'niko mbali sana',
] as const;

/**
 * Phrases that carry a "no" but mean yes. Read first, and taken out, so "no problem" is not
 * read as "no".
 */
const YES_DESPITE_NO = ['no problem', 'hakuna shida', 'hakuna noma'];

function find(words: string[], phrase: string): number {
  const parts = phrase.split(' ');
  for (let start = 0; start + parts.length <= words.length; start += 1) {
    if (parts.every((part, offset) => words[start + offset] === part)) return start;
  }
  return -1;
}

function has(words: string[], phrases: readonly string[]): boolean {
  return phrases.some((phrase) => find(words, phrase) >= 0);
}

/** Swahili and English numbers as words, up to an hour's worth of minutes. */
const NUMBER_WORDS: Record<string, number> = {
  moja: 1,
  mbili: 2,
  tatu: 3,
  nne: 4,
  tano: 5,
  sita: 6,
  saba: 7,
  nane: 8,
  tisa: 9,
  kumi: 10,
  ishirini: 20,
  thelathini: 30,
  arobaini: 40,
  hamsini: 50,
  sitini: 60,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
};

/** A number at [index], as digits, a word, or "kumi na tano", with how many words it took. */
function numberAt(words: string[], index: number): { value: number; length: number } | null {
  const word = words[index];
  if (word === undefined) return null;
  if (/^\d{1,3}$/.test(word)) return { value: Number(word), length: 1 };
  const first = NUMBER_WORDS[word];
  if (first === undefined) return null;
  // "kumi na tano", "ishirini na tano": tens and units joined by "na".
  const unit = words[index + 1] === 'na' ? NUMBER_WORDS[words[index + 2] ?? ''] : undefined;
  if (unit !== undefined && first >= 10 && unit < 10) return { value: first + unit, length: 3 };
  return { value: first, length: 1 };
}

const MINUTE_UNITS = new Set([
  'min',
  'mins',
  'minute',
  'minutes',
  'm',
  'dakika',
  'dk',
  'dak',
  'dkk',
]);
const HOUR_UNITS = new Set(['hr', 'hrs', 'hour', 'hours', 'h']);

/**
 * How soon they will be there, in minutes, when the reply says: "dakika kumi", "10 mins",
 * "10min", "nusu saa", "half an hour", "an hour", "baada ya saa moja", "in 5". Null when it
 * does not say. A bare "saa mbili" is left alone: in Swahili it is also eight o'clock.
 */
export function etaFromText(text: string): number | null {
  // "10min", "15mins", "2hrs" written as one word.
  const words = wordsOf(text).flatMap((word) => {
    const joined = /^(\d{1,3})(min|mins|m|hr|hrs|h|dk)$/.exec(word);
    return joined ? [joined[1], joined[2]] : [word];
  });
  const sane = (minutes: number): number | null => (minutes > 0 && minutes <= 600 ? minutes : null);

  if (
    find(words, 'nusu saa') >= 0 ||
    find(words, 'half an hour') >= 0 ||
    find(words, 'half hour') >= 0
  ) {
    return 30;
  }
  if (find(words, 'robo saa') >= 0 || find(words, 'quarter of an hour') >= 0) return 15;

  for (let i = 0; i < words.length; i += 1) {
    // "dakika kumi", "dk 10": the unit before the number, as Swahili says it.
    if (MINUTE_UNITS.has(words[i]) && words[i] !== 'm') {
      const after = numberAt(words, i + 1);
      if (after) return sane(after.value);
    }
    // "10 minutes", "ten mins", "2 hours".
    const number = numberAt(words, i);
    if (number) {
      const unit = words[i + number.length];
      if (unit && MINUTE_UNITS.has(unit)) return sane(number.value);
      if (unit && HOUR_UNITS.has(unit)) return sane(number.value * 60);
    }
    // "baada ya saa moja", "ndani ya saa mbili", "kama saa moja": hours, said as a duration.
    if (words[i] === 'saa' && ['ya', 'kama'].includes(words[i - 1] ?? '')) {
      const hours = numberAt(words, i + 1);
      if (hours && hours.value <= 10) return sane(hours.value * 60);
    }
  }

  if (find(words, 'an hour') >= 0 || find(words, 'one hour') >= 0) return 60;

  // "in 5", "in 10": minutes, as people text it.
  const inAt = words.indexOf('in');
  if (inAt >= 0) {
    const number = numberAt(words, inAt + 1);
    if (number && number.value <= 120) return number.value;
  }
  return null;
}

/** What a reply means, and how soon, if it says. */
export function readReply(text: string): ReadReply {
  const all = wordsOf(text);
  const etaMinutes = etaFromText(text);
  const first = all[0];
  if (first === '1') return { intent: 'accept', etaMinutes };
  if (first === '2') return { intent: 'decline', etaMinutes: null };

  // "no problem" means yes: count it, then read the rest without it.
  let words = all;
  let accept = false;
  for (const phrase of YES_DESPITE_NO) {
    const at = find(words, phrase);
    if (at >= 0) {
      accept = true;
      words = [...words.slice(0, at), ...words.slice(at + phrase.split(' ').length)];
    }
  }
  accept = accept || has(words, ACCEPT);
  const decline = has(words, DECLINE);

  if (accept && decline) return { intent: 'unclear', etaMinutes: null };
  if (decline) return { intent: 'decline', etaMinutes: null };
  if (accept || etaMinutes !== null) return { intent: 'accept', etaMinutes };
  return { intent: 'unclear', etaMinutes: null };
}
