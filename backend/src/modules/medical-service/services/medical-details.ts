import { EmergencyType, ResponderService } from '@prisma/client';

/**
 * The things a responder most needs to know at a glance, ticked rather than typed, so
 * they read the same on every alert and can be matched to the emergency.
 *
 * Kept short on purpose. The Data Protection Act asks for no more health data than the
 * purpose needs, and the purpose is an emergency: what changes what a helper does in
 * the next ten minutes. Everything else belongs with the elder's doctor.
 */
export const MEDICAL_FLAGS = [
  'HEART',
  'HIGH_BLOOD_PRESSURE',
  'DIABETES',
  'LUNG',
  'EPILEPSY',
  'STROKE',
  'DEMENTIA',
  'KIDNEY',
  'BLOOD_THINNERS',
  'INSULIN',
  'PACEMAKER',
  'HOME_OXYGEN',
  'WALKING_AID',
  'CANNOT_WALK',
  'HARD_OF_HEARING',
  'POOR_SIGHT',
] as const;

export type MedicalFlag = (typeof MEDICAL_FLAGS)[number];

export const FLAG_LABEL: Record<MedicalFlag, string> = {
  HEART: 'Heart condition',
  HIGH_BLOOD_PRESSURE: 'High blood pressure',
  DIABETES: 'Diabetes',
  LUNG: 'Asthma or a lung condition',
  EPILEPSY: 'Epilepsy or seizures',
  STROKE: 'Has had a stroke',
  DEMENTIA: 'Dementia or memory loss',
  KIDNEY: 'Kidney condition',
  BLOOD_THINNERS: 'Takes blood thinners',
  INSULIN: 'Takes insulin',
  PACEMAKER: 'Has a pacemaker',
  HOME_OXYGEN: 'Uses oxygen at home',
  WALKING_AID: 'Uses a walking aid',
  CANNOT_WALK: "Can't walk without help",
  HARD_OF_HEARING: 'Hard of hearing',
  POOR_SIGHT: 'Poor sight',
};

export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export type BloodType = (typeof BLOOD_TYPES)[number];

/** What is kept, sealed, as one value. Every part may be empty. */
export interface MedicalDetails {
  /** YYYY-MM-DD. Shown as an age. */
  dateOfBirth: string | null;
  bloodType: BloodType | null;
  flags: MedicalFlag[];
  /** Other conditions, or more about the ticked ones. */
  conditions: string | null;
  medications: string | null;
  /** Allergies and what happens. */
  allergies: string | null;
  /** The languages they are most at ease in. */
  languages: string | null;
  doctorName: string | null;
  doctorPhone: string | null;
  /** The hospital they usually go to. */
  hospital: string | null;
  /** Anything else a helper should know, such as where the spare key is. */
  notes: string | null;
}

export const DETAIL_FIELDS: readonly (keyof MedicalDetails)[] = [
  'dateOfBirth',
  'bloodType',
  'flags',
  'conditions',
  'medications',
  'allergies',
  'languages',
  'doctorName',
  'doctorPhone',
  'hospital',
  'notes',
];

/** The parts that differ, by name, for the record of changes. Order of flags ignored. */
export function changedFields(before: MedicalDetails | null, after: MedicalDetails): string[] {
  return DETAIL_FIELDS.filter((field) => {
    const was = before?.[field] ?? null;
    const now = after[field];
    if (field === 'flags') {
      const a = [...((was as string[] | null) ?? [])].sort().join(',');
      const b = [...(now as string[])].sort().join(',');
      return a !== b;
    }
    return was !== now;
  });
}

/** Whole years between a date of birth and a moment, or null if there is no date. */
export function ageOn(dateOfBirth: string | null, at: Date): number | null {
  if (!dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  let age = at.getUTCFullYear() - year;
  const before =
    at.getUTCMonth() + 1 < month || (at.getUTCMonth() + 1 === month && at.getUTCDate() < day);
  if (before) age -= 1;
  return age >= 0 ? age : null;
}

/** One ticked item, said with what it means for this emergency, when it means something. */
export interface MedicalHighlight {
  flag: MedicalFlag;
  label: string;
  /** Why it matters for this emergency. Null when it does not, or there is no type yet. */
  why: string | null;
  /** It makes this emergency more serious than it looks. */
  serious: boolean;
}

interface Relevance {
  why: string;
  serious: boolean;
}

/**
 * What a ticked item means for each kind of emergency, in plain words a family member can
 * act on. Not a diagnosis: a prompt to get a professional sooner when the history says
 * the emergency may be worse than it looks.
 */
const RELEVANCE: Record<EmergencyType, Partial<Record<MedicalFlag, Relevance>>> = {
  [EmergencyType.FALL]: {
    BLOOD_THINNERS: { why: 'A fall can bleed inside. A doctor should see them.', serious: true },
    INSULIN: { why: 'Low blood sugar can cause a fall.', serious: true },
    HEART: { why: 'A heart problem can cause a fall.', serious: true },
    STROKE: { why: 'A new stroke can cause a fall.', serious: true },
    EPILEPSY: { why: 'A seizure can cause a fall.', serious: false },
    DIABETES: { why: 'Low blood sugar can cause a fall.', serious: false },
    DEMENTIA: { why: 'They may not be able to say where it hurts.', serious: false },
    CANNOT_WALK: { why: "They won't be able to get up alone.", serious: false },
    WALKING_AID: { why: 'They may need help to get up.', serious: false },
  },
  [EmergencyType.BREATHING]: {
    HEART: { why: 'Trouble breathing can be a heart problem.', serious: true },
    LUNG: { why: 'Their inhaler or medicine may help. Ask where it is.', serious: true },
    HOME_OXYGEN: { why: 'Check their oxygen is on and flowing.', serious: true },
    PACEMAKER: { why: 'Tell the ambulance they have a pacemaker.', serious: true },
    HIGH_BLOOD_PRESSURE: { why: 'Tell the ambulance about their blood pressure.', serious: false },
  },
  [EmergencyType.UNWELL]: {
    INSULIN: { why: 'Low or high blood sugar can look like this.', serious: true },
    HEART: { why: 'Feeling unwell can be a heart problem.', serious: true },
    STROKE: { why: 'Look for a drooping face, a weak arm or slurred speech.', serious: true },
    DIABETES: { why: 'Low or high blood sugar can look like this.', serious: false },
    EPILEPSY: { why: 'They may be having, or getting over, a seizure.', serious: false },
    KIDNEY: { why: 'Tell the ambulance about their kidney condition.', serious: false },
    BLOOD_THINNERS: { why: 'Bleeding may not stop easily.', serious: false },
    DEMENTIA: { why: 'They may not be able to say what is wrong.', serious: false },
  },
  [EmergencyType.FIRE]: {
    HOME_OXYGEN: { why: 'Oxygen makes a fire spread. Tell the fire service.', serious: true },
    CANNOT_WALK: { why: "They can't get out alone. Tell the fire service.", serious: true },
    LUNG: { why: 'Smoke will hurt their breathing more.', serious: true },
    WALKING_AID: { why: 'They will be slow to get out.', serious: false },
    HARD_OF_HEARING: { why: 'They may not hear a smoke alarm or shouting.', serious: false },
    POOR_SIGHT: { why: 'They may not find the way out in smoke.', serious: false },
  },
  [EmergencyType.UNSAFE]: {
    CANNOT_WALK: { why: "They can't get away alone.", serious: true },
    DEMENTIA: { why: 'They may not understand what is happening.', serious: false },
    HARD_OF_HEARING: { why: 'They may not hear you. Knock loudly or call.', serious: false },
  },
};

/** Who to ask when the history makes an emergency more serious than it looks. */
const ASK_FOR: Record<EmergencyType, ResponderService> = {
  [EmergencyType.FALL]: ResponderService.AMBULANCE,
  [EmergencyType.BREATHING]: ResponderService.AMBULANCE,
  [EmergencyType.UNWELL]: ResponderService.AMBULANCE,
  [EmergencyType.FIRE]: ResponderService.FIRE,
  [EmergencyType.UNSAFE]: ResponderService.POLICE,
};

export interface MedicalReading {
  /** Every ticked item: those that matter for this emergency first, the serious ones top. */
  highlights: MedicalHighlight[];
  /** The history makes this emergency more serious than it looks. */
  serious: boolean;
  /** The service to ask now because of it. Null when nothing is serious. */
  askFor: ResponderService | null;
}

/** The ticked items read against what is happening, if anybody has said. */
export function readFor(flags: MedicalFlag[], type: EmergencyType | null): MedicalReading {
  const relevance = type ? RELEVANCE[type] : {};
  const highlights = MEDICAL_FLAGS.filter((flag) => flags.includes(flag)).map((flag) => ({
    flag,
    label: FLAG_LABEL[flag],
    why: relevance[flag]?.why ?? null,
    serious: relevance[flag]?.serious ?? false,
  }));
  const rank = (item: MedicalHighlight) => (item.serious ? 0 : item.why ? 1 : 2);
  // A stable sort, so items keep the list's order within each group.
  highlights.sort((a, b) => rank(a) - rank(b));

  const serious = highlights.some((item) => item.serious);
  return { highlights, serious, askFor: serious && type ? ASK_FOR[type] : null };
}
