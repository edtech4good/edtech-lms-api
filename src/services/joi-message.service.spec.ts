import { ValidationErrorItem } from 'joi';
import { toPlainFieldError, UNKNOWN_FIELD_MESSAGE } from './joi-message.service';

const detail = (path: string[], type: string, message: string): ValidationErrorItem => ({
  path,
  type,
  message,
  context: { key: path[path.length - 1], label: path[path.length - 1] },
});

/** Ported from edtech-lms-rpi-api's src/utils/joi-message.spec.ts (parity). */
describe('toPlainFieldError', () => {
  it('strips a leading body/query/params segment from the field name', () => {
    expect(toPlainFieldError(detail(['body', 'studentfirstname'], 'any.required', '"studentfirstname" is required')).field).toBe(
      'studentfirstname',
    );
    expect(toPlainFieldError(detail(['query', 'schoolname'], 'any.required', 'x')).field).toBe('schoolname');
    expect(toPlainFieldError(detail(['body', 'student', 'dateofbirth'], 'date.base', 'x')).field).toBe('student.dateofbirth');
  });

  it('object.unknown never puts the client-controlled key into the field name - falls back to the request part', () => {
    const result = toPlainFieldError(detail(['body', 'evil<script>x'], 'object.unknown', '"evil<script>x" is not allowed'));
    expect(result.field).toBe('body');
    expect(JSON.stringify(result)).not.toMatch(/evil/);
  });

  it('object.unknown at query/params falls back to that part, not "body"', () => {
    expect(toPlainFieldError(detail(['query', 'evil<script>x'], 'object.unknown', 'x')).field).toBe('query');
    expect(toPlainFieldError(detail(['params', 'evil<script>x'], 'object.unknown', 'x')).field).toBe('params');
  });

  it('object.unknown message is the fixed sentence and never echoes the key (__proto__)', () => {
    const result = toPlainFieldError(detail(['body', '__proto__'], 'object.unknown', '"__proto__" is not allowed'));
    expect(result.message).toBe(UNKNOWN_FIELD_MESSAGE);
    expect(result.message).toBe("This request contains a field that isn't allowed.");
    expect(JSON.stringify(result)).not.toMatch(/__proto__/);
  });

  it('any.required uses the field label, not Joi\'s quoted-key wording', () => {
    expect(toPlainFieldError(detail(['body', 'email'], 'any.required', '"email" is required')).message).toBe(
      'Enter a value for email.',
    );
  });
});
