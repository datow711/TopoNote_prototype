const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');

const gasSource = fs.readFileSync(
  path.join(__dirname, '..', 'gas', '程式碼.js'),
  'utf8'
);

function loadRootGas() {
  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: value => ({
        value,
        setMimeType() {
          return this;
        }
      })
    },
    Logger: { log() {} },
    Utilities: {
      base64Decode: value => Array.from(Buffer.from(value, 'base64'))
    },
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(gasSource, sandbox);
  return sandbox;
}

test('Root GAS 以實際 MIME 優先並正確映射安全副檔名', () => {
  const gas = loadRootGas();

  expect(gas.resolveAudioMimeType_('voice.m4a', 'audio/webm')).toBe('audio/webm');
  expect(gas.resolveAudioMimeType_('voice.m4a', 'application/octet-stream')).toBe('audio/mp4');
  expect(gas.getAudioExtension_('audio/mp4', 'voice.webm')).toBe('m4a');
  expect(gas.getAudioExtension_('audio/aac', 'voice.m4a')).toBe('aac');
});

test('Root GAS 驗證合法 UUID、Data URL、必要 metadata 並保留實際 byte size', () => {
  const gas = loadRootGas();
  const job = gas.validateUploadPayload_({
    clientUploadId: '550e8400-e29b-41d4-a716-446655440000',
    taskId: '101',
    language: '台語',
    recorderAccount: '王 小明 +@example.com',
    recorderName: '王 小明 +@顯示名',
    uploadSource: 'file',
    originalFileName: 'voice.m4a',
    mimeType: 'audio/mp4',
    fileSizeBytes: 999,
    audioBase64: 'data:audio/mp4;base64,AAEC',
    note: '{"annotations":{"tl1":"tsu"}}'
  });

  expect(job.mimeType).toBe('audio/mp4');
  expect(job.fileSizeBytes).toBe(3);
  expect(job.bytes).toHaveLength(3);
  expect(job.originalFileName).toBe('voice.m4a');
});

test('Root GAS 對 UUID 與 MIME 衝突回傳不可盲目重試的 validation error', () => {
  const gas = loadRootGas();

  expect(() => gas.validateUploadPayload_({
    clientUploadId: 'not-a-uuid',
    taskId: '101',
    language: '台語',
    recorderAccount: 'user@example.com',
    uploadSource: 'file',
    mimeType: 'audio/mp4',
    audioBase64: 'data:audio/mp4;base64,AAEC'
  })).toThrow();

  try {
    gas.validateUploadPayload_({
      clientUploadId: '550e8400-e29b-41d4-a716-446655440000',
      taskId: '101',
      language: '台語',
      recorderAccount: 'user@example.com',
      uploadSource: 'file',
      mimeType: 'audio/webm',
      audioBase64: 'data:audio/mp4;base64,AAEC'
    });
  } catch (error) {
    expect(error.code).toBe('MIME_MISMATCH');
    expect(error.retryable).toBe(false);
  }
});

test('Root GAS 成功資料映射使用正式 audio_records id 與 created_at', () => {
  const gas = loadRootGas();
  const result = gas.buildUploadRecordData_(
    {
      clientUploadId: '550e8400-e29b-41d4-a716-446655440000',
      taskId: '101',
      sourceId: 'SRC-101',
      language: '台語',
      recorderAccount: 'user@example.com',
      recorderName: '測試調查員'
    },
    { source_id: 'SRC-101' },
    {
      id: 9123,
      client_upload_id: '550e8400-e29b-41d4-a716-446655440000',
      task_id: 101,
      language: '台語',
      audio_file_id: 'drive-url',
      recorder_account: 'user@example.com',
      recorder_name: '測試調查員',
      created_at: '2026-08-20T00:00:00.000Z'
    },
    false,
    false
  );

  expect(result.id).toBe(9123);
  expect(result.clientUploadId).toBe('550e8400-e29b-41d4-a716-446655440000');
  expect(result.taskId).toBe(101);
  expect(result.createdAt).toBe('2026-08-20T00:00:00.000Z');
  expect(result.legacyLogPending).toBe(false);
});

function loadCoordinatorGas() {
  let dbRecord = null;
  let dbInsertCount = 0;
  let driveCreateCount = 0;
  let sheetAppendCount = 0;
  const sheetRows = [];
  const runtime = {
    failNextSheetAppend: false,
    getStats: () => ({
      dbInsertCount,
      driveCreateCount,
      sheetAppendCount,
      sheetRows: sheetRows.slice()
    })
  };

  const response = (status, body) => ({
    getResponseCode: () => status,
    getContentText: () => body
  });
  const sheet = {
    getDataRange: () => ({
      getValues: () => [
        ['時間', '上傳者', '地名ID', '地名', '語言', '音標', 'URL', '錄音ID'],
        ...sheetRows
      ]
    }),
    appendRow: row => {
      if (runtime.failNextSheetAppend) {
        runtime.failNextSheetAppend = false;
        throw new Error('Records append failed');
      }
      sheetAppendCount += 1;
      sheetRows.push(row);
    }
  };
  const driveFolder = {
    createFile: blob => {
      driveCreateCount += 1;
      const file = {
        blob,
        trashed: false,
        getUrl: () => 'drive-url-' + driveCreateCount,
        setTrashed(value) {
          this.trashed = value;
        }
      };
      return file;
    }
  };

  const sandbox = {
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: key => key === 'SUPABASE_SERVICE_ROLE_KEY'
          ? 'service-role-test'
          : null
      })
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: value => ({
        value,
        setMimeType() {
          return this;
        }
      })
    },
    Logger: { log() {} },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock() {}
      })
    },
    Utilities: {
      base64Decode: value => Array.from(Buffer.from(value, 'base64')),
      newBlob: (bytes, mimeType, name) => ({ bytes, mimeType, name })
    },
    DriveApp: {
      getFolderById: () => driveFolder
    },
    SpreadsheetApp: {
      openById: () => ({ getSheetByName: () => sheet })
    },
    UrlFetchApp: {
      fetch: (url, options) => {
        if (url.includes('/final_tasks?')) {
          return response(200, JSON.stringify([{ id: 101, source_id: 'SRC-101' }]));
        }
        if (url.includes('/audio_records?')) {
          return response(200, JSON.stringify(dbRecord ? [dbRecord] : []));
        }
        if (url.endsWith('/audio_records')) {
          dbInsertCount += 1;
          const inserted = JSON.parse(options.payload);
          dbRecord = {
            id: 991,
            client_upload_id: inserted.client_upload_id,
            task_id: inserted.task_id,
            language: inserted.language,
            audio_file_id: inserted.audio_file_id,
            recorder_account: inserted.recorder_account,
            recorder_name: inserted.recorder_name,
            created_at: '2026-08-20T00:00:00.000Z'
          };
          return response(201, JSON.stringify([dbRecord]));
        }
        throw new Error('Unexpected URL: ' + url);
      }
    },
    console
  };

  vm.createContext(sandbox);
  vm.runInContext(gasSource, sandbox);
  runtime.gas = sandbox;
  return runtime;
}

test('Root GAS coordinator 對同一 clientUploadId 只建立一份資源並可補齊 Records', () => {
  const runtime = loadCoordinatorGas();
  const payload = {
    clientUploadId: '550e8400-e29b-41d4-a716-446655440000',
    requestId: '550e8400-e29b-41d4-a716-446655440000',
    taskId: '101',
    sourceId: 'SRC-101',
    placeName: '甲地',
    language: '台語',
    recorderAccount: 'user@example.com',
    recorderName: '測試調查員',
    uploadSource: 'file',
    originalFileName: 'voice.m4a',
    mimeType: 'audio/mp4',
    audioBase64: 'data:audio/mp4;base64,AAEC',
    fileSizeBytes: 3,
    note: '{}',
    phonetic: 'tsu'
  };
  runtime.failNextSheetAppend = true;

  const first = JSON.parse(runtime.gas.handleUpload(payload).value);
  expect(first.success).toBe(true);
  expect(first.recordData.id).toBe(991);
  expect(first.recordData.legacyLogPending).toBe(true);

  const second = JSON.parse(runtime.gas.handleUpload(payload).value);
  const stats = runtime.getStats();
  expect(second.success).toBe(true);
  expect(second.recordData.id).toBe(991);
  expect(second.recordData.deduplicated).toBe(true);
  expect(second.recordData.legacyLogPending).toBe(false);
  expect(stats.driveCreateCount).toBe(1);
  expect(stats.dbInsertCount).toBe(1);
  expect(stats.sheetAppendCount).toBe(1);
  expect(stats.sheetRows).toHaveLength(1);
  expect(stats.sheetRows[0][7]).toBe(payload.clientUploadId);
});
