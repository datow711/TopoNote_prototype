const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const migration = fs.readFileSync(
  path.join(__dirname, '..', 'db', '20260902_auth_login_identifier.sql'),
  'utf8'
);
const edgeFunction = fs.readFileSync(
  path.join(__dirname, '..', 'supabase', 'functions', 'auth-login', 'index.ts'),
  'utf8'
);
const gasSource = fs.readFileSync(
  path.join(__dirname, '..', 'gas', '程式碼.js'),
  'utf8'
);

test('username login schema has an explicit Auth email mapping', async () => {
  expect(migration).toContain('add column if not exists auth_login_email text');
  expect(migration).toContain('investigators_auth_login_email_uidx');
  expect(migration).toContain('lower(btrim(auth_login_email))');
  expect(migration).toContain('where auth_login_email is not null');
});

test('username login Edge Function authenticates before returning a session', async () => {
  expect(edgeFunction).toContain('body?.identifier');
  expect(edgeFunction).toContain('account.ilike.');
  expect(edgeFunction).toContain('email.ilike.');
  expect(edgeFunction).toContain('auth_login_email.ilike.');
  expect(edgeFunction).toContain('/auth/v1/token?grant_type=password');
  expect(edgeFunction).toContain('investigator.auth_user_id');
  expect(edgeFunction).toContain('return unauthorized()');
  const authRequestSource = edgeFunction.slice(
    edgeFunction.indexOf('async function signInWithEmail'),
    edgeFunction.indexOf('Deno.serve')
  );
  expect(authRequestSource).not.toContain('serviceKey');
  expect(authRequestSource).toContain('publicKey');
});

test('Auth roster migration is manual, confirmed, and never public', async () => {
  expect(gasSource).toContain('function previewAuthUserMigration()');
  expect(gasSource).toContain('function migrateInvestigatorsToSupabaseAuth()');
  expect(gasSource).toContain('function previewSingleAuthUserMigration(accountOrId)');
  expect(gasSource).toContain('function migrateSingleInvestigatorToSupabaseAuth(accountOrId)');
  expect(gasSource).toContain('function previewPrivilegedAuthUserMigration()');
  expect(gasSource).toContain('function migratePrivilegedInvestigatorsToSupabaseAuth()');
  expect(gasSource).toContain("['admin', 'audio_assessor', 'proofreader']");
  expect(gasSource).toContain('function selectAuthMigrationRows_(rows, selector)');
  expect(gasSource).toContain('function selectPrivilegedAuthMigrationRows_(rows)');
  expect(gasSource).toContain('SUPABASE_AUTH_MIGRATION_PASSWORD');
  expect(gasSource).toContain('SUPABASE_AUTH_MIGRATION_EMAIL_MAP_JSON');
  expect(gasSource).toContain('I_UNDERSTAND_SHARED_PASSWORD');
  expect(gasSource).toContain('LockService.getScriptLock()');
  expect(gasSource).toContain('/auth/v1/admin/users');
  expect(gasSource).toContain('email_confirm: true');
  expect(gasSource).not.toMatch(/Logger\.log\([^\n]*password/i);
  expect(gasSource).not.toMatch(/user_metadata:\s*\{[\s\S]{0,220}\brole\s*:/i);

  const doPostSource = gasSource.slice(
    gasSource.indexOf('function doPost(e)'),
    gasSource.indexOf('function normalizeEmail_')
  );
  expect(doPostSource).not.toContain('migrateInvestigatorsToSupabaseAuth');
  expect(doPostSource).not.toContain('previewAuthUserMigration');
});
