/**
 * A phone number in international format: a plus, a country code that does not start
 * with zero, and up to fifteen digits in all. The apps turn whatever a person typed
 * into this before sending it, so the API only ever sees one shape.
 */
export const E164 = /^\+[1-9]\d{7,14}$/;
export const E164_MESSAGE = 'phone must be in international format, for example +254712345678';
