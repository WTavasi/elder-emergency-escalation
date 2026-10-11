/** A country a phone number can belong to. See countries.ts for where the data comes from. */
export interface Country {
  /** ISO 3166 code, for example KE. */
  iso: string;
  name: string;
  /** Calling code without the plus, for example 254. */
  dial: string;
  /** What people type before a local number: the 0 in 0712 345 678. Empty where none. */
  trunk: string;
  /** Shortest and longest national number, without the trunk prefix. */
  min: number;
  max: number;
}

/** The flag, from the ISO code's two regional-indicator letters. No images needed. */
export function flagOf(iso: string): string {
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
