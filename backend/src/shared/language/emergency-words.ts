import { EmergencyType } from '@prisma/client';

/**
 * Reading what is happening from what somebody wrote or said, in English, Swahili and
 * Sheng, by rules on our own server. No model and nothing sent anywhere: a list anyone
 * can read, test and correct, which is what a safety decision needs.
 *
 * Used for a HELP text ("msaada moto"), for speech after the help button ("nimeanguka
 * jikoni"), and for "Hey Siri, MzaziCare help fire".
 */

/**
 * Words and phrases for each type, most urgent first: something that says both "fell"
 * and "fire" is about the fire. A phrase matches as whole words in order, anywhere.
 */
export const TYPE_KEYWORDS: ReadonlyArray<readonly [EmergencyType, readonly string[]]> = [
  [
    EmergencyType.FIRE,
    [
      'fire',
      'burning',
      'smoke',
      'flames',
      'gas leak',
      'moto',
      'moshi',
      'inaungua',
      'imeungua',
      'kuungua',
      'inachomeka',
    ],
  ],
  [
    EmergencyType.UNSAFE,
    [
      'police',
      'polisi',
      'thief',
      'thieves',
      'robbery',
      'robbers',
      'robbed',
      'burglar',
      'burglars',
      'intruder',
      'intruders',
      'attacked',
      'attacking',
      'gun',
      'knife',
      'mwizi',
      'wezi',
      'wizi',
      'jambazi',
      'majambazi',
      'wamevamia',
      'wavamizi',
      'uvamizi',
      'nimeibiwa',
      'wanaiba',
      // Sheng for the police.
      'karao',
      'makarao',
    ],
  ],
  [
    EmergencyType.BREATHING,
    [
      'chest',
      'breathing',
      'breathe',
      'breath',
      'breathless',
      'choking',
      'heart attack',
      'kifua',
      'kupumua',
      'pumua',
      'pumzi',
      'moyo unauma',
      'siwezi kupumua',
    ],
  ],
  [
    EmergencyType.FALL,
    [
      'fall',
      'fell',
      'fallen',
      'falling',
      'slipped',
      'tripped',
      'anguka',
      'nimeanguka',
      'ameanguka',
      'kuanguka',
      'nimeteleza',
      'ameteleza',
      // Sheng, an English verb on a Swahili prefix.
      'nimefall',
      'nimeslip',
    ],
  ],
  [
    EmergencyType.UNWELL,
    [
      'unwell',
      'sick',
      'ill',
      'dizzy',
      'fainted',
      'vomiting',
      'stroke',
      'mgonjwa',
      'naumwa',
      'kizunguzungu',
      'nimezimia',
      'kutapika',
      'homa',
      'sijisikii vizuri',
      // Sheng: "I don't feel good".
      'sijiskii poa',
      'sijiskii fiti',
    ],
  ],
];

/** Lower case, accents and punctuation gone, so "Moto!" and "moto" read the same. */
export function wordsOf(text: string): string[] {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

function contains(words: readonly string[], phrase: string): boolean {
  const parts = phrase.split(' ');
  if (parts.length === 1) return words.includes(phrase);
  for (let start = 0; start + parts.length <= words.length; start += 1) {
    if (parts.every((part, offset) => words[start + offset] === part)) return true;
  }
  return false;
}

/** What a text or a sentence says is happening, the most urgent if several; null if none. */
export function typeFromText(text: string): EmergencyType | null {
  const words = wordsOf(text);
  for (const [type, keywords] of TYPE_KEYWORDS) {
    if (keywords.some((keyword) => contains(words, keyword))) return type;
  }
  return null;
}

/**
 * The single words that ask for help on their own as the first word of a text: "MOTO",
 * "Fell". Not the words for feeling unwell, which start ordinary sentences ("ill be
 * fine") too often to raise an emergency by themselves; after HELP they still count.
 */
export const TYPE_WORDS: ReadonlySet<string> = new Set(
  TYPE_KEYWORDS.filter(([type]) => type !== EmergencyType.UNWELL)
    .flatMap(([, words]) => words)
    .filter((word) => !word.includes(' ')),
);
