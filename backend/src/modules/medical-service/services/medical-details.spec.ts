import { EmergencyType, ResponderService } from '@prisma/client';
import { ageOn, changedFields, readFor, type MedicalDetails } from './medical-details';

const details = (overrides: Partial<MedicalDetails> = {}): MedicalDetails => ({
  dateOfBirth: null,
  bloodType: null,
  flags: [],
  conditions: null,
  medications: null,
  allergies: null,
  languages: null,
  doctorName: null,
  doctorPhone: null,
  hospital: null,
  notes: null,
  ...overrides,
});

describe('medical details', () => {
  it('reads a fall on blood thinners as serious, and asks for an ambulance', () => {
    const reading = readFor(['HARD_OF_HEARING', 'BLOOD_THINNERS', 'DEMENTIA'], EmergencyType.FALL);

    expect(reading.serious).toBe(true);
    expect(reading.askFor).toBe(ResponderService.AMBULANCE);
    expect(reading.highlights.map((item) => item.flag)).toEqual([
      'BLOOD_THINNERS',
      'DEMENTIA',
      'HARD_OF_HEARING',
    ]);
    expect(reading.highlights[2].why).toBeNull();
  });

  it('reads home oxygen in a fire as one for the fire service', () => {
    const reading = readFor(['HOME_OXYGEN'], EmergencyType.FIRE);

    expect(reading.askFor).toBe(ResponderService.FIRE);
    expect(reading.highlights[0].why).toMatch(/fire service/);
  });

  it('lists everything with no advice before anybody says what is happening', () => {
    const reading = readFor(['HEART', 'INSULIN'], null);

    expect(reading).toEqual({
      serious: false,
      askFor: null,
      highlights: [
        expect.objectContaining({ flag: 'HEART', why: null, serious: false }),
        expect.objectContaining({ flag: 'INSULIN', why: null, serious: false }),
      ],
    });
  });

  it('is not serious when nothing ticked bears on the emergency', () => {
    expect(readFor(['POOR_SIGHT'], EmergencyType.BREATHING)).toMatchObject({
      serious: false,
      askFor: null,
    });
  });

  it('names the parts that changed, ignoring the order of ticks', () => {
    const before = details({ flags: ['HEART', 'DIABETES'], allergies: 'Penicillin' });
    const after = details({
      flags: ['DIABETES', 'HEART'],
      allergies: null,
      notes: 'Key with Wanjiru',
    });

    expect(changedFields(before, after)).toEqual(['allergies', 'notes']);
    expect(changedFields(null, details({ bloodType: 'O+' }))).toEqual(['bloodType']);
  });

  it('works out an age, a day before and on the birthday', () => {
    expect(ageOn('1948-03-15', new Date('2026-03-14T12:00:00Z'))).toBe(77);
    expect(ageOn('1948-03-15', new Date('2026-03-15T12:00:00Z'))).toBe(78);
    expect(ageOn(null, new Date())).toBeNull();
  });
});
