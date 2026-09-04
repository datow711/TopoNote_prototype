const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

const root = path.join(__dirname, '..');
const rootIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminIndex = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const adminMain = fs.readFileSync(path.join(root, 'admin', 'main.js'), 'utf8');

test('legacy root and admin portal keep separate login surfaces', async () => {
  expect(rootIndex).toContain('<input type="email" id="email" placeholder="Email">');
  expect(rootIndex).not.toContain('id="auth-password"');
  expect(adminIndex).toContain('\u5730\u540d\u8a9e\u97f3\u8abf\u67e5\u7cfb\u7d71\uff5c\u5be9\u807d\uff0f\u7ba1\u7406\u5165\u53e3');
  expect(adminIndex).toContain('id="auth-password"');
  expect(adminIndex).not.toContain('id="email-bootstrap-btn"');
  expect(adminIndex).not.toContain('取得密碼信');
  expect(adminIndex).toContain('id="login-btn"');
});

test('admin portal includes its own static assets and role gate', async () => {
  for (const file of [
    'index.html',
    'main.js',
    'style.css',
    'config.js',
    'review-workflow-core.js',
    'manifest.json',
    'sw.js',
    'icon-192.png',
    'icon-512.png'
  ]) {
    expect(fs.existsSync(path.join(root, 'admin', file))).toBeTruthy();
  }
  expect(adminIndex).toContain('src="main.js');
  expect(adminIndex).toContain('src="review-workflow-core.js');
  expect(adminMain).toContain('function isAdminPortalPath()');
  expect(adminMain).toContain("ADMIN_PORTAL_ROLES.includes(user?.role)");
  expect(adminMain).toContain("['admin', 'audio_assessor', 'proofreader']");
  expect(adminMain).toContain("expectedRole: 'admin_portal'");
  expect(adminMain).toContain('\u6b64\u5165\u53e3\u50c5\u4f9b\u7ba1\u7406\u54e1\u3001\u5be9\u807d\u54e1\u8207\u6821\u5c0d\u54e1\u4f7f\u7528');
});
