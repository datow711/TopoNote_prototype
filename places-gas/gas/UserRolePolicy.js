/**
 * Roles that the spreadsheet-bound Users sync may create or update.
 * Keep admin accounts outside this general-purpose sync path.
 */
var USER_SHEET_ALLOWED_ROLES = ['user', 'proofreader', 'audio_assessor'];

function normalizeUserRole_(value) {
  var role = String(value || '').trim().toLowerCase();
  if (!role) return 'user';
  return USER_SHEET_ALLOWED_ROLES.indexOf(role) >= 0 ? role : '';
}

// Export only for the local contract test; Apps Script ignores this branch.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    USER_SHEET_ALLOWED_ROLES: USER_SHEET_ALLOWED_ROLES,
    normalizeUserRole: normalizeUserRole_
  };
}
