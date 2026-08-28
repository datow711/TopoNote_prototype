const { test, expect } = require('@playwright/test');
const { normalizeUserRole } = require('../places-gas/gas/UserRolePolicy.js');

test.describe('Users role sync policy', () => {
  test('accepts review roles and defaults a blank role to user', () => {
    expect(normalizeUserRole('')).toBe('user');
    expect(normalizeUserRole('PROOFREADER')).toBe('proofreader');
    expect(normalizeUserRole('audio_assessor')).toBe('audio_assessor');
  });

  test('rejects admin and unknown roles from the Users sync path', () => {
    expect(normalizeUserRole('admin')).toBe('');
    expect(normalizeUserRole('reviewer')).toBe('');
  });
});
