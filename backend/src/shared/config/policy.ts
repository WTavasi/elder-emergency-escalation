/**
 * The privacy notice version a consent record refers to. Changing the notice means
 * changing this, so every consent says which wording the person agreed to.
 *
 * 2026-10-1: the notice became a screen in the app, and says that a withdrawn consent
 * does not hide an elder from those answering an open emergency (vital interests).
 *
 * 2026-11-1: medical details, a caregiver deciding about them for an elder who cannot,
 * saying what is happening after pressing help, the kind of emergency, emergencies
 * ordered by distance, reading text replies, and the weekly note on check-in answers.
 */
export const PRIVACY_POLICY_VERSION = '2026-11-1';

/** The terms of use version, shown with the terms. Nothing is agreed to by version. */
export const TERMS_VERSION = '2026-10-1';
