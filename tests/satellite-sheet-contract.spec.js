const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');

const gasPath = path.join(__dirname, '..', 'places-gas', 'gas', '程式碼.js');
const gasSource = fs.readFileSync(gasPath, 'utf8');
const gasContext = {
  console,
  Logger: { log() {} },
  SpreadsheetApp: {},
  DriveApp: {},
  PropertiesService: {},
  UrlFetchApp: {},
  Utilities: {},
  Session: {},
  ScriptApp: {},
  ContentService: {},
  FormApp: {},
  Browser: {},
  LockService: {}
};
vm.createContext(gasContext);
vm.runInContext(gasSource, gasContext, { filename: gasPath });

test.describe('satellite sheet field contract', () => {
  test('builds the complete Taiwanese and Hakka satellite layout', () => {
    expect([...gasContext.SATELLITE_HEADERS]).toEqual([
      'UUID', '地名', '縣市', '鄉鎮', '村里',
      'TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote',
      'Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote',
      '任務狀態'
    ]);
    expect([...gasContext.SATELLITE_ANSWER_COLUMNS]).toEqual([
      6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
    ]);

    const headers = [
      'UUID', 'PlaceName', 'County', 'Town', 'Village',
      'TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote',
      'T_State', 'Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote', 'H_State'
    ];
    const colMap = Object.fromEntries(headers.map((header, index) => [header, index]));
    const row = [
      'uuid-1', '測試地名', '臺中市', '東勢區', '新伯公',
      '臺漢', 'tai1', 'tai2', 'tai3', '台語備註',
      '待標注', '客漢', 'hak1', 'hak2', 'hak3', '四縣', '客語備註', '校對中'
    ];

    expect([...gasContext.buildSatelliteTaskRow_(row, colMap, true, true)]).toEqual([
      'uuid-1', '測試地名', '臺中市', '東勢區', '新伯公',
      '臺漢', 'tai1', 'tai2', 'tai3', '台語備註',
      '客漢', 'hak1', 'hak2', 'hak3', '四縣', '客語備註',
      '台語:待標注 | 客語:校對中'
    ]);
  });

  test('collects every new answer field for satellite pull', () => {
    const headers = [
      'UUID', 'TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote',
      'Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote'
    ];
    const row = [
      'uuid-2', '台漢', 'tai1', 'tai2', 'tai3', '台語備註',
      '客漢', 'hak1', 'hak2', 'hak3', '海陸', '客語備註'
    ];
    const fields = gasContext.collectSatelliteAnnotationFields_(row, gasContext.getSatelliteHeaderMap_(headers));

    expect(fields.taiFields).toEqual({
      TaiHan1: '台漢',
      TL1: 'tai1',
      TL2: 'tai2',
      TL3: 'tai3',
      TaiNote: '台語備註'
    });
    expect(fields.hakFields).toEqual({
      Honzii: '客漢',
      HP1: 'hak1',
      HP2: 'hak2',
      HP3: 'hak3',
      HDialect: '海陸',
      HakNote: '客語備註'
    });
    expect(fields.hasTaiFields).toBe(true);
    expect(fields.hasHakFields).toBe(true);
  });

  test('migrates legacy satellite rows by header name without shifting answers', () => {
    let values = [
      ['UUID', '地名', '縣市', '鄉鎮', '村里', '台文漢字', '台文羅馬字', '客文漢字', '客文羅馬字', '任務狀態', '備註'],
      ['uuid-old', '舊地名', '臺南市', '安南區', '舊村', '舊台漢', 'old-tai1', '舊客漢', 'old-hak1', '台語:待標注 | 客語:待標注', '舊共用備註']
    ];
    const writes = [];
    const fakeSheet = {
      getDataRange: () => ({ getValues: () => values }),
      getRange: (row, column, rowCount, columnCount) => ({
        setValues(next) {
          writes.push({ row, column, rowCount, columnCount, values: next });
          values = next;
          return this;
        },
        setBackground() { return this; },
        setFontWeight() { return this; }
      }),
      setFrozenRows() {}
    };

    const normalized = gasContext.normalizeSatelliteSheetData_(fakeSheet);

    expect([...normalized[0]]).toEqual([...gasContext.SATELLITE_HEADERS]);
    expect([...normalized[1]]).toEqual([
      'uuid-old', '舊地名', '臺南市', '安南區', '舊村',
      '舊台漢', 'old-tai1', '', '', '舊共用備註',
      '舊客漢', 'old-hak1', '', '', '', '舊共用備註',
      '台語:待標注 | 客語:待標注'
    ]);
    expect(writes[0].columnCount).toBe(17);
  });

  test('keeps a legacy shared note with the language that has core answers', () => {
    const headers = ['UUID', '台文漢字', '台文羅馬字', '客文漢字', '客文羅馬字', '備註'];
    const row = ['uuid-old-2', '台漢', 'tai1', '客漢', 'hak1', '舊備註'];
    const fields = gasContext.collectSatelliteAnnotationFields_(row, gasContext.getSatelliteHeaderMap_(headers));

    expect(fields.taiFields.TaiNote).toBe('舊備註');
    expect(fields.hakFields.HakNote).toBe('舊備註');
  });
  test('locks all fields of an unassigned language', () => {
    const calls = [];
    const chain = {
      setBackground() { return this; },
      setFontColor() { return this; },
      setNote() { return this; }
    };
    const sheet = {
      getRange(...args) {
        calls.push(args);
        return chain;
      }
    };

    gasContext.applySatelliteTaskLanguageGuidance_(sheet, 4, [
      { taiWritten: false, hakWritten: false }
    ]);

    expect(calls).toEqual([
      [4, 6, 1, 5],
      [4, 11, 1, 6]
    ]);
  });
});