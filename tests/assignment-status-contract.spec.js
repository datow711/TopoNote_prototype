const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');

const gasPath = path.join(__dirname, '..', 'places-gas', 'gas', '程式碼.js');
const migrationPath = path.join(__dirname, '..', 'db', '20260805_assignment_status_separation.sql');

function loadGasContext() {
  const source = fs.readFileSync(gasPath, 'utf8');
  const context = {};
  vm.runInNewContext(source, context, { filename: gasPath });
  return context;
}

test.describe('AssignmentStatus contract', () => {
  test('normalizes unassigned rows to blank main fields', () => {
    const result = loadGasContext().normalizeLanguageAssignmentSync_('待指派', 'old-user', '未指派');
    expect(result).toEqual({
      valid: true,
      assignmentStatus: '未指派',
      state: '',
      annotator: ''
    });
  });

  test('accepts assigned written and audio states only with an annotator', () => {
    const context = loadGasContext();
    expect(context.normalizeLanguageAssignmentSync_('書面標注中', 'user@example.com', '已指派')).toEqual({
      valid: true,
      assignmentStatus: '已指派',
      state: '書面標注中',
      annotator: 'user@example.com'
    });
    expect(context.normalizeLanguageAssignmentSync_('錄音中', 'user@example.com', '已指派').valid).toBe(true);
    expect(context.normalizeLanguageAssignmentSync_('待指派', 'user@example.com', '已指派').valid).toBe(false);
    expect(context.normalizeLanguageAssignmentSync_('錄音中', '', '已指派').valid).toBe(false);
  });

  test('keeps the SQL view contract explicit', () => {
    const sql = fs.readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('as t_assignment_status');
    expect(sql).toContain('as h_assignment_status');
    expect(sql).toContain("then U&'\\672a\\6307\\6d3e'");
    expect(sql).toContain("else U&'\\5df2\\6307\\6d3e'");
  });
});
