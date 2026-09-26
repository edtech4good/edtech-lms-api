import { randomInt } from 'crypto';

// No 0/O, 1/I/L - docs/api-errors.md's unambiguous alphabet, so a reference
// read aloud or handwritten from a screen can't be confused between letters
// and digits.
const REFERENCE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const REFERENCE_LENGTH = 6;

/**
 * `E-` plus 6 characters from REFERENCE_ALPHABET, drawn with crypto.randomInt
 * (cryptographically random - not Math.random, which is not safe to expose
 * to users as an identifier generator). Always present in every error
 * response, including production, per docs/api-errors.md.
 */
export function generateReference(): string {
  let suffix = '';
  for (let i = 0; i < REFERENCE_LENGTH; i++) {
    suffix += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  }
  return `E-${suffix}`;
}
