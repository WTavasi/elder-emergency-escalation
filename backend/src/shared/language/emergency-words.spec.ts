import { EmergencyType } from '@prisma/client';
import { TYPE_WORDS, typeFromText, wordsOf } from './emergency-words';

describe('emergency words', () => {
  it.each<[string, EmergencyType]>([
    ['MzaziCare help fire', EmergencyType.FIRE],
    ['Msaada! Moto jikoni', EmergencyType.FIRE],
    ['there is smoke everywhere', EmergencyType.FIRE],
    ['Nyumba inaungua', EmergencyType.FIRE],
    ['wezi wameingia', EmergencyType.UNSAFE],
    ['Majambazi wamevamia', EmergencyType.UNSAFE],
    ['call the karao', EmergencyType.UNSAFE],
    ["I can't breathe", EmergencyType.BREATHING],
    ['Siwezi kupumua', EmergencyType.BREATHING],
    ['moyo unauma sana', EmergencyType.BREATHING],
    ['I think I am having a heart attack', EmergencyType.BREATHING],
    ['help I fell in the bathroom', EmergencyType.FALL],
    ['Nimeanguka jikoni', EmergencyType.FALL],
    ['nimefall bafuni', EmergencyType.FALL],
    ['I feel dizzy', EmergencyType.UNWELL],
    ['Sijisikii vizuri', EmergencyType.UNWELL],
    ['sijiskii poa leo', EmergencyType.UNWELL],
  ])('reads "%s" as %s', (text, type) => {
    expect(typeFromText(text)).toBe(type);
  });

  it('takes the most urgent when it hears several', () => {
    expect(typeFromText('I fell and there is fire')).toBe(EmergencyType.FIRE);
    expect(typeFromText('nimeanguka, siwezi kupumua')).toBe(EmergencyType.BREATHING);
  });

  it('reads a phrase only as whole words in order', () => {
    expect(typeFromText('the heart of the matter, an attack of nerves')).toBeNull();
    expect(typeFromText('moyo wangu unauma')).toBeNull();
  });

  it('hears nothing in an ordinary sentence', () => {
    expect(typeFromText('MzaziCare help')).toBeNull();
    expect(typeFromText('Habari, niko sawa')).toBeNull();
    expect(typeFromText('')).toBeNull();
  });

  it('reads past accents, capitals and punctuation', () => {
    expect(wordsOf('MOTO!!  Fire…')).toEqual(['moto', 'fire']);
    expect(wordsOf('I’m okay')).toEqual(['im', 'okay']);
  });

  it('lets a first word raise an alert, but not one for feeling unwell', () => {
    expect(TYPE_WORDS.has('moto')).toBe(true);
    expect(TYPE_WORDS.has('fell')).toBe(true);
    expect(TYPE_WORDS.has('ill')).toBe(false);
    expect(TYPE_WORDS.has('heart attack')).toBe(false);
  });
});
