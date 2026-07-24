// ==========================================
// 1. 系統設定與 Supabase 驗證資訊
// ==========================================
var SUPABASE_URL_PROPERTY = 'SUPABASE_URL';
var SUPABASE_SERVICE_ROLE_KEY_PROPERTY = 'SUPABASE_SERVICE_ROLE_KEY';
var DEFAULT_SUPABASE_URL = 'https://sikconjhtomqdkicbjal.supabase.co';
var THIRD_PHASE_SHEET_NAME = '第三期工作清單';
var TEST_ENTRIES_SHEET_NAME = 'TestEntries';
var REVIEW_DONE_STATE = '已完成標注';
var DAILY_PREWORK_SYNC_HANDLER = 'runDailyPreworkSync';
var DAILY_PREWORK_SYNC_HOUR = 6;
var DAILY_PREWORK_SYNC_MINUTE = 30;
var CHECKPOINT_PREFIX = '__ckpt_';
var CHECKPOINT_DEFAULT_RETENTION = 5;
var RECORDS_SHEET_NAME = 'Records';
var RECORDS_SHEET_HEADERS = ['紀錄時間', '上傳者ID', '序號', '地名', '語言', '音讀', '錄音檔連結', '錄音ID'];
var WRITTEN_ANNOTATION_CLASS = '書面標注';
var SATELLITE_LOCKED_BACKGROUND = '#666666';
var SATELLITE_LOCKED_FONT_COLOR = '#eeeeee';
var SATELLITE_LOCKED_NOTE = '請勿填寫';
var TEST_ENTRY_HEADERS = [
  'UUID', 'Source', 'Type', 'BatchID', 'County', 'Town', 'Village', 'HakArea', '經度', '緯度',
  'PlaceName', 'Info',
  'TaiHan1', 'TL1', 'TL2', 'TL3', 'TaiNote', 'TaiClass', 'T_State', 'T_Annotator', 'T_CreatedAt', 'T_UpdatedAt',
  'Honzii', 'HP1', 'HP2', 'HP3', 'HDialect', 'HakNote', 'HakClass', 'H_State', 'H_Annotator', 'H_CreatedAt', 'H_UpdatedAt',
  '同步警告'
];

function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty(SUPABASE_URL_PROPERTY) || DEFAULT_SUPABASE_URL;
  var key = props.getProperty(SUPABASE_SERVICE_ROLE_KEY_PROPERTY);

  if (!key) {
    throw new Error('Missing script property: ' + SUPABASE_SERVICE_ROLE_KEY_PROPERTY);
  }

  return { url: url, key: key };
}

function getSupabaseHeaders_(supabase, extraHeaders) {
  var headers = {
    'apikey': supabase.key,
    'Authorization': 'Bearer ' + supabase.key,
    'User-Agent': 'TopoNote-Places-GAS/1.0',
    'X-Client-Info': 'toponote-places-gas'
  };

  if (extraHeaders) {
    for (var name in extraHeaders) {
      headers[name] = extraHeaders[name];
    }
  }

  return headers;
}

function fetchSupabaseRows_(path) {
  var supabase = getSupabaseConfig_();
  var rows = [];
  var pageSize = 1000;
  var baseUrl = supabase.url + '/rest/v1/' + path;

  for (var start = 0; ; start += pageSize) {
    var response = UrlFetchApp.fetch(baseUrl, {
      method: 'get',
      headers: getSupabaseHeaders_(supabase, {
        'Range-Unit': 'items',
        'Range': start + '-' + (start + pageSize - 1)
      }),
      muteHttpExceptions: true
    });
    var statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
    }

    var page = JSON.parse(response.getContentText() || '[]');
    rows = rows.concat(page);
    if (page.length < pageSize) break;
  }

  return rows;
}
function notify_(message, options) {
  Logger.log(message);
  if (options && options.silent) return message;

  try {
    SpreadsheetApp.getUi().alert(message);
  } catch (e) {
    Logger.log('UI notification skipped: ' + e.message);
  }

  return message;
}

function handleSyncError_(label, error, options) {
  var message = '❌ ' + label + '失敗: ' + error.message;
  notify_(message, options);
  if (options && options.throwErrors) throw error;
  return message;
}

function failSyncCondition_(message, options) {
  notify_(message, options);
  if (options && options.throwErrors) throw new Error(message);
  return message;
}

function getCheckpointRetention_() {
  var rawValue = PropertiesService.getScriptProperties().getProperty('CHECKPOINT_MAX_PER_SOURCE');
  var parsed = Number(rawValue || CHECKPOINT_DEFAULT_RETENTION);
  if (!isFinite(parsed) || parsed < 1) return CHECKPOINT_DEFAULT_RETENTION;
  return Math.floor(parsed);
}

function getCheckpointSourceKey_(sheetName) {
  if (sheetName === THIRD_PHASE_SHEET_NAME) return 'third_phase';
  if (sheetName === TEST_ENTRIES_SHEET_NAME) return 'test_entries';
  if (sheetName === 'Users') return 'users';
  return String(sheetName || 'sheet')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24) || 'sheet';
}

function buildCheckpointName_(sheetName, label, createdAt) {
  var timestamp = Utilities.formatDate(createdAt, Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  var labelKey = String(label || 'sync')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 18) || 'sync';
  return CHECKPOINT_PREFIX + getCheckpointSourceKey_(sheetName) + '_' + timestamp + '_' + labelKey;
}

function pruneSheetCheckpoints_(ss, sourceSheetName) {
  var sourceKey = getCheckpointSourceKey_(sourceSheetName);
  var checkpointPrefix = CHECKPOINT_PREFIX + sourceKey + '_';
  var retention = getCheckpointRetention_();
  var checkpoints = ss.getSheets()
    .filter(function(sheet) {
      return sheet.getName().indexOf(checkpointPrefix) === 0;
    })
    .sort(function(a, b) {
      return a.getName() < b.getName() ? -1 : 1;
    });

  while (checkpoints.length > retention) {
    ss.deleteSheet(checkpoints.shift());
  }
}

function createSheetCheckpoint_(sheet, label, options) {
  if (!sheet || (options && options.skipCheckpoint)) return '';

  var ss = sheet.getParent();
  var createdAt = new Date();
  var checkpointName = buildCheckpointName_(sheet.getName(), label, createdAt);
  var checkpoint = sheet.copyTo(ss);
  checkpoint.setName(checkpointName);
  checkpoint.hideSheet();
  checkpoint.getRange(1, 1).setNote(
    'Checkpoint before ' + label +
    '\nsource_sheet=' + sheet.getName() +
    '\ncreated_at=' + createdAt.toISOString()
  );
  pruneSheetCheckpoints_(ss, sheet.getName());
  Logger.log('[Checkpoint] created: ' + checkpointName);
  return checkpointName;
}

function ensureSheetCheckpoint_(sheet, label, options) {
  if (!sheet || (options && options.skipCheckpoint)) return '';
  if (!options) return createSheetCheckpoint_(sheet, label, options);

  if (!options._checkpointNames) options._checkpointNames = {};
  var key = String(sheet.getSheetId ? sheet.getSheetId() : sheet.getName());
  if (options._checkpointNames[key]) return options._checkpointNames[key];

  options._checkpointNames[key] = createSheetCheckpoint_(sheet, label, options);
  return options._checkpointNames[key];
}

function runSyncStep_(label, fn, options) {
  var startedAt = new Date();
  Logger.log('[DailyPreworkSync] start: ' + label);
  var result = fn(options || {});
  Logger.log('[DailyPreworkSync] done: ' + label);
  return {
    label: label,
    result: result || '',
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString()
  };
}

function runDailyPreworkSync() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    Logger.log('[DailyPreworkSync] skipped: another sync is running.');
    return 'skipped: another sync is running';
  }

  var props = PropertiesService.getScriptProperties();
  var startedAt = new Date();
  var steps = [];

  try {
    var options = { silent: true, throwErrors: true };
    steps.push(runSyncStep_('APP錄音人指派回寫至 Sheet', syncTaskAssignmentsToSheets, options));
    steps.push(runSyncStep_('第三期完整清冊同步至 Supabase', syncThirdPhasePlacesToSupabase, options));
    steps.push(runSyncStep_('第三期任務索引同步至 Supabase', syncFinalTasksToSupabase, options));
    steps.push(runSyncStep_('Users 同步至 Supabase', syncUsersToSupabase, options));

    var summary = {
      status: 'success',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      steps: steps
    };
    props.setProperty('LAST_DAILY_PREWORK_SYNC', JSON.stringify(summary));
    Logger.log('[DailyPreworkSync] success: ' + JSON.stringify(summary));
    return JSON.stringify(summary);
  } catch (e) {
    var failure = {
      status: 'failed',
      started_at: startedAt.toISOString(),
      finished_at: new Date().toISOString(),
      error: e.message,
      steps: steps
    };
    props.setProperty('LAST_DAILY_PREWORK_SYNC', JSON.stringify(failure));
    Logger.log('[DailyPreworkSync] failed: ' + JSON.stringify(failure));
    throw e;
  } finally {
    lock.releaseLock();
  }
}

function installDailyPreworkSyncTrigger() {
  removeDailyPreworkSyncTriggers();
  ScriptApp.newTrigger(DAILY_PREWORK_SYNC_HANDLER)
    .timeBased()
    .everyDays(1)
    .atHour(DAILY_PREWORK_SYNC_HOUR)
    .nearMinute(DAILY_PREWORK_SYNC_MINUTE)
    .create();

  return notify_('✅ 已建立每日上班前同步排程：Asia/Taipei 約 06:30 執行。');
}

function removeDailyPreworkSyncTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  var removed = 0;
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === DAILY_PREWORK_SYNC_HANDLER) {
      ScriptApp.deleteTrigger(trigger);
      removed++;
    }
  });
  Logger.log('[DailyPreworkSync] removed triggers: ' + removed);
  return removed;
}

function getDailyPreworkSyncStatus() {
  var triggers = ScriptApp.getProjectTriggers()
    .filter(function(trigger) {
      return trigger.getHandlerFunction() === DAILY_PREWORK_SYNC_HANDLER;
    })
    .map(function(trigger) {
      return {
        handler: trigger.getHandlerFunction(),
        source: String(trigger.getTriggerSource()),
        event_type: String(trigger.getEventType()),
        unique_id: trigger.getUniqueId()
      };
    });

  return JSON.stringify({
    handler: DAILY_PREWORK_SYNC_HANDLER,
    intended_time: 'Asia/Taipei about 06:30, before 07:30',
    trigger_count: triggers.length,
    triggers: triggers,
    last_run: PropertiesService.getScriptProperties().getProperty('LAST_DAILY_PREWORK_SYNC') || ''
  });
}

// ==========================================
// 2. 自訂選單 (整合新舊功能)
// ==========================================
function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🛠️ 地名計畫系統')
    .addItem('開啟批次修改面板', 'showStatusSidebar') // 新增這一行
    .addSeparator()
    .addItem('1. 匯出 L1 目前畫面至 L2', 'openExportDialog')
    .addSeparator()
    .addItem('2.將亮均的地名分類同步回來','syncClassification')
    .addSeparator()
    .addSubMenu(ui.createMenu('📂 L3 分發與回填')
      .addItem('分發任務到標注員表單 (Push)', 'pushTasksToSatelliteSheets')
      .addItem('從各表單回填結果 (Pull)', 'pullResultsFromSatelliteSheets'))
    .addSeparator()
    .addItem('3. 同步第三期完整清冊至 Supabase', 'syncThirdPhasePlacesToSupabase')
    .addItem('4. 將第三期任務索引同步至 Supabase', 'syncFinalTasksToSupabase')
    .addItem('5. 回寫 APP 錄音人指派至工作表', 'syncTaskAssignmentsToSheets')
    .addItem('6. 重建 Records 錄音索引', 'rebuildRecordsSheetFromSupabase')
    .addSeparator()
    .addItem('安裝每日 06:30 自動同步', 'installDailyPreworkSyncTrigger')
    .addItem('移除每日自動同步', 'removeDailyPreworkSyncTriggers')
    .addSeparator()
    .addSubMenu(ui.createMenu('🧪 TestEntries')
      .addItem('建立/修正 TestEntries 表頭', 'setupTestEntriesSheet'))
    .addSeparator()
    .addSubMenu(ui.createMenu('👥 Users')
      .addItem('建立/修正 Users 表頭', 'setupUsersSheetHeaders')
      .addItem('同步 Users 至 Supabase', 'syncUsersToSupabase'))
    .addToUi();
}

// ==========================================
// 3. L1 到 L2 的拋轉邏輯 (標題定位 + 自訂函數寫入版)
// ==========================================

function openExportDialog() {
  var html = HtmlService.createHtmlOutputFromFile('Dialog')
      .setWidth(400)
      .setHeight(350);
  SpreadsheetApp.getUi().showModalDialog(html, '匯出資料至：第三期工作清單');
}

function getExistingBatches() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName("梯次紀錄表");
  if (!logSheet) return [];
  var lastRow = logSheet.getLastRow();
  if (lastRow < 2) return [];
  var data = logSheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var batches = [...new Set(data.map(row => row[0]))]; 
  return batches.filter(String);
}

// ==========================================
// 3. L1 到 L2 的拋轉邏輯 (修正對應 + 自動校正版)
// ==========================================

function processExport(formObject) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getActiveSheet(); 
  var sourceName = sourceSheet.getName();
  
  if (sourceName === "第三期工作清單" || sourceName === "梯次紀錄表") {
    return "錯誤：請在 L1 (資料來源表) 執行此功能！";
  }

  var targetSheet = ss.getSheetByName("第三期工作清單");
  var logSheet = ss.getSheetByName("梯次紀錄表");
  var batchName = formObject.batchSelect === "NEW" ? formObject.newBatchName : formObject.batchSelect;
  var condition = formObject.conditionLog;

  // 1. 取得 L2 既有的 UUID 與標題
  var fullRangeData = targetSheet.getDataRange().getValues();
  var tHeaders = fullRangeData[0].map(h => String(h).trim());
  var existingUUIDs = new Set();
  for (var i = 1; i < fullRangeData.length; i++) {
    var u = String(fullRangeData[i][0]).trim();
    if (u) existingUUIDs.add(u); 
  }

  // 2. 建立 L1 表頭對照
  var sourceData = sourceSheet.getDataRange().getDisplayValues(); 
  var sHeaders = sourceData[0].map(h => String(h).trim());
  var sCol = {};
  sHeaders.forEach((h, i) => sCol[h] = i);
  
  function getSVal(rowData, key1, key2) {
    var idx = (sCol[key1] !== undefined) ? sCol[key1] : sCol[key2];
    return (idx !== undefined) ? rowData[idx].trim() : "";
  }

  // 3. 解析篩選器
  var filter = sourceSheet.getFilter();
  if (!filter) throw new Error("請先在 L1 建立篩選器！");
  var filterRange = filter.getRange();
  var criteriaMap = {};
  for (var col = filterRange.getColumn(); col <= filterRange.getLastColumn(); col++) {
    var criteria = filter.getColumnFilterCriteria(col);
    if (criteria) criteriaMap[col - 1] = criteria;
  }

  var rowsToAppend = []; // 準備存放 2D Array 資料
  var importCount = 0;
  var timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");

  // 4. 開始處理每一列
  for (var r = 1; r < sourceData.length; r++) {
    var rowData = sourceData[r];
    var isMatch = true;
    
    // 篩選條件判斷
    for (var colIdx in criteriaMap) {
      var hiddenValues = criteriaMap[colIdx].getHiddenValues();
      if (hiddenValues && hiddenValues.indexOf(String(rowData[colIdx]).trim()) !== -1) {
        isMatch = false; break; 
      }
    }

    if (isMatch) {
      var uuid = getSVal(rowData, "UUID", "序號");
      if (uuid && !existingUUIDs.has(uuid)) {
        
        // 依照 L2 的標題順序建立一列資料
        var newRow = tHeaders.map(header => {
          switch(header) {
            case "UUID":      return uuid;
            case "Source":    return sourceName;
            case "Type":      return getSVal(rowData, "Type");
            case "BatchID":   return batchName;
            case "County":    return getSVal(rowData, "County", "縣市");
            case "Town":      return getSVal(rowData, "Town", "鄉鎮");
            case "Village":   return getSVal(rowData, "Village", "村里");
            case "經度":      return getSVal(rowData, "Longitude", "經度");
            case "緯度":      return getSVal(rowData, "Latitude", "緯度");
            case "PlaceName": return getSVal(rowData, "地名", "PlaceName");
            case "TaiClass":  return "未分類";
            case "T_State":   return "待指派";
            case "HakClass":  return "未分類";
            case "H_State":   return "待指派";
            // 自動填入時間戳記 (模擬 gasUpdateRows 的監測效果)
            case "T_CreatedAt": return 'L1總表匯入|'+timestamp;
            case "T_UpdatedAt": return 'L1總表匯入|'+timestamp;
            case "H_CreatedAt": return 'L1總表匯入|'+timestamp;
            case "H_UpdatedAt": return 'L1總表匯入|'+timestamp;
            default: return ""; // 其他欄位留空
          }
        });

        rowsToAppend.push(newRow);
        existingUUIDs.add(uuid); 
        importCount++;
      }
    }
  }

  // 5. 執行批次寫入 (直接寫在最後一行之後)
  if (rowsToAppend.length > 0) {
    var lastRow = targetSheet.getLastRow();
    targetSheet.getRange(lastRow + 1, 1, rowsToAppend.length, tHeaders.length)
               .setValues(rowsToAppend);
  }

  // 6. 紀錄紀錄表
  logSheet.appendRow([batchName, sourceName, condition, importCount, timestamp]);

  return "成功！共匯入 " + importCount + " 筆新資料至「第三期工作清單」。";
}

// ==========================================
// 4. L2 到 Supabase 的同步邏輯 (更新版)
// ==========================================
function normalizeBoolean_(value) {
  if (value === true || value === false) return value;
  var text = String(value || '').trim().toUpperCase();
  if (text === 'TRUE' || text === '1' || text === 'YES') return true;
  if (text === 'FALSE' || text === '0' || text === 'NO') return false;
  return null;
}

function normalizeNumber_(value) {
  if (value === '' || value === null || value === undefined) return null;
  var number = Number(value);
  return isNaN(number) ? null : number;
}

function getCellValue_(row, colMap, header) {
  return colMap[header] === undefined ? '' : row[colMap[header]];
}

function postSupabaseBatches_(url, payload, preferValue) {
  if (payload.length === 0) return;

  var supabase = getSupabaseConfig_();
  var batchSize = 500;

  for (var start = 0; start < payload.length; start += batchSize) {
    var batch = payload.slice(start, start + batchSize);
    var options = {
      method: 'post',
      contentType: 'application/json',
      headers: getSupabaseHeaders_(supabase, {
        'Prefer': preferValue || 'resolution=merge-duplicates'
      }),
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    };

    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
    }
  }
}

var USER_SHEET_HEADERS = [
  'email',
  'name',
  'phone',
  'languages',
  'hakka_dialect',
  'life_area_1',
  'survey_area_1',
  'life_area_2',
  'survey_area_2',
  'life_area_3',
  'survey_area_3',
  'role',
  'active'
];
var USER_SHEET_REQUIRED_HEADERS = USER_SHEET_HEADERS.filter(function(header) {
  return header !== 'role';
});

function setupUsersSheetHeaders() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Users') || ss.insertSheet('Users');
  sheet.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setValues([USER_SHEET_HEADERS]);
  sheet.getRange(1, 1, 1, USER_SHEET_HEADERS.length).setFontWeight('bold');
  sheet.getRange(2, USER_SHEET_HEADERS.length, Math.max(sheet.getMaxRows() - 1, 1), 1).insertCheckboxes();
  sheet.autoResizeColumns(1, USER_SHEET_HEADERS.length);
  SpreadsheetApp.getUi().alert('✅ Users 表頭已設定完成。email 與 name 為必填，active 欄可勾選。');
}

function normalizeUserActive_(value) {
  if (value === true || value === false) return value;
  var text = String(value || '').trim().toLowerCase();
  if (text === '') return true;
  if (['true', '1', 'yes', 'y', 'on', '是', '啟用'].indexOf(text) !== -1) return true;
  if (['false', '0', 'no', 'n', 'off', '否', '停用'].indexOf(text) !== -1) return false;
  return true;
}

function syncUsersToSupabase(options) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Users');
  if (!sheet) return failSyncCondition_('❌ 找不到 Users 工作表。', options);

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return notify_('沒有 Users 資料可同步。', options);

  var headers = data[0].map(function(header) {
    return String(header).trim();
  });
  var colMap = {};
  headers.forEach(function(header, index) {
    colMap[header] = index;
  });

  var missingHeaders = USER_SHEET_REQUIRED_HEADERS.filter(function(header) {
    return colMap[header] === undefined;
  });
  if (missingHeaders.length > 0) {
    return failSyncCondition_('❌ Users 缺少欄位：' + missingHeaders.join(', '), options);
  }

  var payload = [];
  var skipped = 0;
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var email = String(row[colMap.email] || '').trim().toLowerCase();
    var name = String(row[colMap.name] || '').trim();
    var role = colMap.role === undefined ? 'user' : String(row[colMap.role] || 'user').trim().toLowerCase();
    if (!email || !name) {
      skipped++;
      continue;
    }
    if (role && role !== 'user') {
      skipped++;
      continue;
    }

    payload.push({
      email: email,
      name: name,
      role: 'user',
      phone: String(row[colMap.phone] || '').trim(),
      languages: String(row[colMap.languages] || '').trim(),
      hakka_dialect: String(row[colMap.hakka_dialect] || '').trim(),
      life_area_1: String(row[colMap.life_area_1] || '').trim(),
      survey_area_1: String(row[colMap.survey_area_1] || '').trim(),
      life_area_2: String(row[colMap.life_area_2] || '').trim(),
      survey_area_2: String(row[colMap.survey_area_2] || '').trim(),
      life_area_3: String(row[colMap.life_area_3] || '').trim(),
      survey_area_3: String(row[colMap.survey_area_3] || '').trim(),
      active: normalizeUserActive_(row[colMap.active])
    });
  }

  if (payload.length === 0) return notify_('沒有可同步的有效 Users 資料。', options);

  ensureSheetCheckpoint_(sheet, 'users_to_supabase', options);

  try {
    var supabase = getSupabaseConfig_();
    var url = supabase.url + '/rest/v1/rpc/sync_sheet_users';
    var requestOptions = {
      method: 'post',
      contentType: 'application/json',
      headers: getSupabaseHeaders_(supabase),
      payload: JSON.stringify({ p_users: payload }),
      muteHttpExceptions: true
    };
    var response = UrlFetchApp.fetch(url, requestOptions);
    var statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
    }

    return notify_('✅ 已同步 ' + payload.length + ' 位 Users 至 Supabase。略過 ' + skipped + ' 列缺少 email/name 的資料。', options);
  } catch (e) {
    return handleSyncError_('Users 同步', e, options);
  }
}

function syncThirdPhasePlacesToSupabase(options) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('第三期工作清單');
  if (!sheet) return failSyncCondition_('❌ 找不到「第三期工作清單」工作表！', options);

  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  for (var i = 0; i < headers.length; i++) {
    colMap[String(headers[i]).trim()] = i;
  }

  var payload = [];
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var uuid = String(getCellValue_(row, colMap, 'UUID') || '').trim();
    if (!uuid) continue;

    payload.push({
      uuid: uuid,
      source: String(getCellValue_(row, colMap, 'Source') || ''),
      type: String(getCellValue_(row, colMap, 'Type') || ''),
      county: String(getCellValue_(row, colMap, 'County') || ''),
      town: String(getCellValue_(row, colMap, 'Town') || ''),
      village: String(getCellValue_(row, colMap, 'Village') || ''),
      hak_area: normalizeBoolean_(getCellValue_(row, colMap, 'HakArea')),
      longitude: normalizeNumber_(getCellValue_(row, colMap, '經度')),
      latitude: normalizeNumber_(getCellValue_(row, colMap, '緯度')),
      place_name: String(getCellValue_(row, colMap, 'PlaceName') || ''),
      info: String(getCellValue_(row, colMap, 'Info') || ''),
      taihan: String(getCellValue_(row, colMap, 'TaiHan1') || ''),
      tl1: String(getCellValue_(row, colMap, 'TL1') || ''),
      tl2: String(getCellValue_(row, colMap, 'TL2') || ''),
      tl3: String(getCellValue_(row, colMap, 'TL3') || ''),
      tai_note: String(getCellValue_(row, colMap, 'TaiNote') || ''),
      tai_class: String(getCellValue_(row, colMap, 'TaiClass') || ''),
      hak_class: String(getCellValue_(row, colMap, 'HakClass') || ''),
      t_state: String(getCellValue_(row, colMap, 'T_State') || ''),
      t_annotator: String(getCellValue_(row, colMap, 'T_Annotator') || ''),
      t_created_at: String(getCellValue_(row, colMap, 'T_CreatedAt') || ''),
      t_updated_at: String(getCellValue_(row, colMap, 'T_UpdatedAt') || ''),
      honzii: String(getCellValue_(row, colMap, 'Honzii') || ''),
      hp1: String(getCellValue_(row, colMap, 'HP1') || ''),
      hp2: String(getCellValue_(row, colMap, 'HP2') || ''),
      hp3: String(getCellValue_(row, colMap, 'HP3') || ''),
      h_dialect: String(getCellValue_(row, colMap, 'HDialect') || ''),
      hak_note: String(getCellValue_(row, colMap, 'HakNote') || ''),
      h_state: String(getCellValue_(row, colMap, 'H_State') || ''),
      h_annotator: String(getCellValue_(row, colMap, 'H_Annotator') || ''),
      h_created_at: String(getCellValue_(row, colMap, 'H_CreatedAt') || ''),
      h_updated_at: String(getCellValue_(row, colMap, 'H_UpdatedAt') || ''),
      batch_id: String(getCellValue_(row, colMap, 'BatchID') || ''),
      sync_warning: String(getCellValue_(row, colMap, '同步警告') || ''),
      location: String(getCellValue_(row, colMap, 'location') || ''),
      name_history: String(getCellValue_(row, colMap, 'name_history') || ''),
      std_name_code: String(getCellValue_(row, colMap, 'std_name_code') || ''),
      synced_at: new Date().toISOString()
    });
  }

  if (payload.length === 0) return notify_('沒有第三期清冊資料可同步。', options);

  ensureSheetCheckpoint_(sheet, 'third_phase_to_supabase', options);

  try {
    var supabase = getSupabaseConfig_();
    var url = supabase.url + '/rest/v1/third_phase_places?on_conflict=uuid';
    postSupabaseBatches_(url, payload, 'resolution=merge-duplicates');
    return notify_('✅ 已同步 ' + payload.length + ' 筆第三期完整清冊至 Supabase。', options);
  } catch (e) {
    return handleSyncError_('第三期清冊同步', e, options);
  }
}

function syncFinalTasksToSupabase(options) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('第三期工作清單');
  if (!sheet) return failSyncCondition_('❌ 找不到「第三期工作清單」工作表！', options);
  
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  var colMap = {};
  for (var i = 0; i < headers.length; i++) {
    colMap[headers[i].toString().trim()] = i;
  }

  var payload = [];
  for (var i = 1; i < data.length; i++) {
    var uuid = data[i][colMap["UUID"]];
    if (uuid !== "") {
      payload.push({
        source_id: String(uuid),
        source_table: 'third_phase_places',
        assigned_to: null,
        priority: 0, // 預設優先級
        status: 'pending',
        is_active: true // 在 L2 內皆視為啟用
      });
    }
  }

  if (payload.length === 0) return notify_('沒有資料可同步。', options);

  ensureSheetCheckpoint_(sheet, 'final_tasks_to_supabase', options);

  try {
    var supabase = getSupabaseConfig_();
    var url = supabase.url + '/rest/v1/final_tasks?on_conflict=source_id,source_table';
    postSupabaseBatches_(url, payload, 'resolution=merge-duplicates');
    return notify_('🚀 成功將 ' + payload.length + ' 筆第三期任務索引同步至 Supabase！', options);
  } catch (e) {
    return handleSyncError_('第三期任務索引同步', e, options);
  }
}

function setupTestEntriesSheet() {
  var sheet = getOrCreateTestEntriesSheet_();
  SpreadsheetApp.getUi().alert('✅ TestEntries 表頭已建立/修正完成。APP 測試資料審查回寫會寫入這張表。');
}

function getOrCreateTestEntriesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(TEST_ENTRIES_SHEET_NAME) || ss.insertSheet(TEST_ENTRIES_SHEET_NAME);
  sheet.getRange(1, 1, 1, TEST_ENTRY_HEADERS.length).setValues([TEST_ENTRY_HEADERS]);
  sheet.getRange(1, 1, 1, TEST_ENTRY_HEADERS.length).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, TEST_ENTRY_HEADERS.length);
  return sheet;
}

function getSheetHeaderMap_(sheet) {
  var lastCol = sheet.getLastColumn();
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function(header, index) {
    var key = String(header || '').trim();
    if (key) map[key] = index + 1;
  });
  return map;
}

function findRowByUuid_(sheet, headerMap, uuid) {
  var uuidCol = headerMap.UUID;
  if (!uuidCol) throw new Error(sheet.getName() + ' 缺少 UUID 欄位。');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;

  var values = sheet.getRange(2, uuidCol, lastRow - 1, 1).getValues();
  var needle = String(uuid || '').trim();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === needle) return i + 2;
  }
  return null;
}

function buildUuidRowMap_(sheet, headerMap) {
  var uuidCol = headerMap.UUID;
  if (!uuidCol) throw new Error(sheet.getName() + ' 缺少 UUID 欄位。');

  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;

  var values = sheet.getRange(2, uuidCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var uuid = String(values[i][0] || '').trim();
    if (uuid) map[uuid] = i + 2;
  }
  return map;
}

function appendBaseReviewRow_(sheet, headerMap, review) {
  var row = new Array(sheet.getLastColumn()).fill('');
  var valuesByHeader = {
    UUID: review.source_id,
    Source: review.source_table,
    Type: review.type || '測試',
    BatchID: 'APP_TEST',
    County: review.county || '測試',
    Town: review.town || '測試',
    Village: review.village || '測試',
    PlaceName: review.place_name || '',
    Info: review.info || '',
    TaiClass: review.tai_class || '測試',
    T_State: review.t_state || '待指派',
    HakClass: review.hak_class || '測試',
    H_State: review.h_state || '待指派'
  };

  Object.keys(valuesByHeader).forEach(function(header) {
    if (headerMap[header]) row[headerMap[header] - 1] = valuesByHeader[header];
  });

  sheet.appendRow(row);
}

function parseAudioAnnotations_(note) {
  if (!note) return {};
  try {
    var parsed = JSON.parse(note);
    return parsed && parsed.annotations ? parsed.annotations : {};
  } catch (e) {
    return {};
  }
}

function parseFinalReviewFields_(fields) {
  if (!fields) return {};
  if (typeof fields === 'object') return fields;
  try {
    return JSON.parse(fields);
  } catch (e) {
    return {};
  }
}

function firstNonEmpty_() {
  for (var i = 0; i < arguments.length; i++) {
    var value = arguments[i];
    if (value !== null && value !== undefined && String(value).trim() !== '') return value;
  }
  return '';
}

function finalFieldValue_(finalFields, key, fallback) {
  if (Object.prototype.hasOwnProperty.call(finalFields, key)) return finalFields[key] || '';
  return fallback || '';
}

function getReviewUpdatedStamp_(review) {
  var reviewedAt = review.reviewed_at ? String(review.reviewed_at) : new Date().toISOString();
  var reviewer = review.reviewed_by ? String(review.reviewed_by) : 'APP';
  return 'APP審查通過|' + reviewer + '|' + reviewedAt;
}

function getReviewRevokedStamp_(review) {
  var reviewedAt = review.reviewed_at ? String(review.reviewed_at) : new Date().toISOString();
  var reviewer = review.reviewed_by ? String(review.reviewed_by) : 'APP';
  return 'APP審查撤回|' + reviewer + '|' + reviewedAt;
}

function buildReviewSheetUpdate_(review) {
  var annotations = parseAudioAnnotations_(review.audio_note);
  var finalFields = parseFinalReviewFields_(review.final_fields);
  var updateData = {};
  var stamp = getReviewUpdatedStamp_(review);

  if (review.app_state !== REVIEW_DONE_STATE) {
    var revokedStamp = getReviewRevokedStamp_(review);
    if (review.language === '台語') {
      updateData.T_State = '待審查';
      updateData.T_UpdatedAt = revokedStamp;
    } else if (review.language === '客語') {
      updateData.H_State = '待審查';
      updateData.H_UpdatedAt = revokedStamp;
    }
    return updateData;
  }

  if (review.language === '台語') {
    updateData.TaiHan1 = finalFieldValue_(finalFields, 'TaiHan1', firstNonEmpty_(annotations.taihan, review.taihan));
    updateData.TL1 = finalFieldValue_(finalFields, 'TL1', firstNonEmpty_(annotations.tl1, review.phonetic_reading, review.tl1));
    updateData.TL2 = finalFieldValue_(finalFields, 'TL2', firstNonEmpty_(annotations.tl2, review.tl2));
    updateData.TL3 = finalFieldValue_(finalFields, 'TL3', firstNonEmpty_(annotations.tl3, review.tl3));
    updateData.TaiNote = finalFieldValue_(finalFields, 'TaiNote', firstNonEmpty_(annotations.tainote, review.tai_note));
    updateData.T_State = REVIEW_DONE_STATE;
    updateData.T_Annotator = firstNonEmpty_(review.recorder_name, review.t_annotator, review.reviewed_by);
    updateData.T_UpdatedAt = stamp;
  } else if (review.language === '客語') {
    updateData.Honzii = finalFieldValue_(finalFields, 'Honzii', firstNonEmpty_(annotations.honzii, review.honzii));
    updateData.HP1 = finalFieldValue_(finalFields, 'HP1', firstNonEmpty_(annotations.hp1, review.phonetic_reading, review.hp1));
    updateData.HP2 = finalFieldValue_(finalFields, 'HP2', firstNonEmpty_(annotations.hp2, review.hp2));
    updateData.HP3 = finalFieldValue_(finalFields, 'HP3', firstNonEmpty_(annotations.hp3, review.hp3));
    updateData.HDialect = finalFieldValue_(finalFields, 'HDialect', firstNonEmpty_(annotations.hdialect, review.h_dialect));
    updateData.HakNote = finalFieldValue_(finalFields, 'HakNote', firstNonEmpty_(annotations.haknote, review.hak_note));
    updateData.H_State = REVIEW_DONE_STATE;
    updateData.H_Annotator = firstNonEmpty_(review.recorder_name, review.h_annotator, review.reviewed_by);
    updateData.H_UpdatedAt = stamp;
  }

  return updateData;
}

function applyReviewUpdateToSheet_(sheet, headerMap, rowNumber, updateData) {
  Object.keys(updateData).forEach(function(header) {
    if (!headerMap[header]) return;
    sheet.getRange(rowNumber, headerMap[header]).setValue(updateData[header]);
  });
}

function getReviewStampHeader_(language) {
  return language === '台語' ? 'T_UpdatedAt' : 'H_UpdatedAt';
}

function getReviewSourceStamp_(review) {
  return review.language === '台語'
    ? String(review.t_updated_at || '').trim()
    : String(review.h_updated_at || '').trim();
}

function getSheetStamp_(sheet, headerMap, rowNumber, language) {
  var header = getReviewStampHeader_(language);
  if (!headerMap[header]) return '';
  return String(sheet.getRange(rowNumber, headerMap[header]).getDisplayValue() || '').trim();
}

function buildReviewConflictWarning_(review, currentStamp, expectedStamp) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [
    'APP回寫衝突',
    review.language || '',
    review.reviewed_by || 'APP',
    stamp,
    'Sheet=' + (currentStamp || '空白'),
    'Supabase=' + (expectedStamp || '空白')
  ].join('|');
}

function writeReviewConflictWarning_(sheet, headerMap, rowNumber, warning) {
  if (!headerMap['同步警告']) return;
  sheet.getRange(rowNumber, headerMap['同步警告']).setValue(warning);
}

function getReviewClassHeader_(language) {
  return language === '台語' ? 'TaiClass' : 'HakClass';
}

function getSheetReviewClass_(sheet, headerMap, rowNumber, language) {
  var header = getReviewClassHeader_(language);
  if (!headerMap[header]) return '';
  return String(sheet.getRange(rowNumber, headerMap[header]).getDisplayValue() || '').trim();
}

function buildWrittenAnnotationReviewConflictWarning_(review, currentClass) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [
    'APP回寫分類衝突',
    review.language || '',
    review.reviewed_by || 'APP',
    stamp,
    'SheetClass=' + (currentClass || '空白'),
    'Reason=書面標注不走APP回寫'
  ].join('|');
}

function detectWrittenAnnotationReviewConflict_(sheet, headerMap, rowNumber, review) {
  var currentClass = getSheetReviewClass_(sheet, headerMap, rowNumber, review.language);
  if (currentClass !== WRITTEN_ANNOTATION_CLASS) return null;
  return {
    currentClass: currentClass,
    warning: buildWrittenAnnotationReviewConflictWarning_(review, currentClass)
  };
}

function rowHasWrittenAnnotationClass_(row, colMap) {
  return String(getCellValue_(row, colMap, 'TaiClass') || '').trim() === WRITTEN_ANNOTATION_CLASS ||
    String(getCellValue_(row, colMap, 'HakClass') || '').trim() === WRITTEN_ANNOTATION_CLASS;
}

function writeSatellitePushWarning_(sheet, colMap, rowNumber, warning) {
  if (colMap['同步警告'] === undefined) return;
  sheet.getRange(rowNumber, colMap['同步警告'] + 1).setValue(warning);
}

function buildSatellitePushClassWarning_(row, colMap) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return [
    '書面標注發送分類錯誤',
    String(getCellValue_(row, colMap, 'UUID') || '').trim(),
    stamp,
    'TaiClass=' + (String(getCellValue_(row, colMap, 'TaiClass') || '').trim() || '空白'),
    'HakClass=' + (String(getCellValue_(row, colMap, 'HakClass') || '').trim() || '空白')
  ].join('|');
}

function isLanguageWrittenAnnotationClass_(row, colMap, language) {
  var header = language === '台語' ? 'TaiClass' : 'HakClass';
  return String(getCellValue_(row, colMap, header) || '').trim() === WRITTEN_ANNOTATION_CLASS;
}

function buildSatellitePullClassWarning_(uuid, language, row, colMap) {
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var classHeader = language === '台語' ? 'TaiClass' : 'HakClass';
  return [
    '書面標注回填分類衝突',
    uuid || '',
    language || '',
    stamp,
    classHeader + '=' + (String(getCellValue_(row, colMap, classHeader) || '').trim() || '空白'),
    'Reason=衛星表回填只接受書面標注分級'
  ].join('|');
}

function applySatelliteTaskLanguageGuidance_(sheet, startRow, taskMetaList) {
  taskMetaList.forEach(function(meta, index) {
    var rowNumber = startRow + index;
    if (!meta.taiWritten) {
      sheet.getRange(rowNumber, 6, 1, 2)
        .setBackground(SATELLITE_LOCKED_BACKGROUND)
        .setFontColor(SATELLITE_LOCKED_FONT_COLOR)
        .setNote(SATELLITE_LOCKED_NOTE);
    }
    if (!meta.hakWritten) {
      sheet.getRange(rowNumber, 8, 1, 2)
        .setBackground(SATELLITE_LOCKED_BACKGROUND)
        .setFontColor(SATELLITE_LOCKED_FONT_COLOR)
        .setNote(SATELLITE_LOCKED_NOTE);
    }
  });
}

function detectReviewSheetConflict_(sheet, headerMap, rowNumber, review) {
  var expectedStamp = getReviewSourceStamp_(review);
  var currentStamp = getSheetStamp_(sheet, headerMap, rowNumber, review.language);

  if (!expectedStamp || !currentStamp || expectedStamp === currentStamp) {
    return null;
  }

  return {
    expectedStamp: expectedStamp,
    currentStamp: currentStamp,
    warning: buildReviewConflictWarning_(review, currentStamp, expectedStamp)
  };
}

function fetchTaskAssignmentSheetRows_() {
  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/app_language_assignment_sheet_view?select=source_id,source_table,t_review_id,h_review_id,t_state,t_annotator,h_state,h_annotator&order=source_table.asc,source_id.asc';
  var options = {
    method: 'get',
    headers: getSupabaseHeaders_(supabase),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function syncTaskAssignmentsToSheets(options) {
  try {
    var rows = fetchTaskAssignmentSheetRows_();
    if (!rows || rows.length === 0) {
      return notify_('沒有 APP 錄音人指派狀態可回寫。', options);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var contextCache = {};
    var updated = 0;
    var changedCells = 0;
    var skipped = [];
    var syncedReviewIds = [];
    var syncTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    function getContext(sheetName) {
      var context = contextCache[sheetName];
      if (context) return context;

      var sheet = sheetName === TEST_ENTRIES_SHEET_NAME
        ? getOrCreateTestEntriesSheet_()
        : ss.getSheetByName(sheetName);
      if (!sheet) return null;

      var headerMap = getSheetHeaderMap_(sheet);
      var requiredHeaders = ['UUID', 'T_State', 'T_Annotator', 'T_UpdatedAt', 'H_State', 'H_Annotator', 'H_UpdatedAt'];
      var missingHeaders = requiredHeaders.filter(function(header) {
        return !headerMap[header];
      });
      if (missingHeaders.length > 0) {
        skipped.push(sheetName + ' 缺少欄位 ' + missingHeaders.join(', '));
        return null;
      }

      var lastRow = sheet.getLastRow();
      var rowCount = Math.max(lastRow - 1, 0);
      context = {
        sheet: sheet,
        headerMap: headerMap,
        uuidRows: buildUuidRowMap_(sheet, headerMap),
        rowCount: rowCount,
        columns: {},
        dirtyColumns: {}
      };
      ['T_State', 'T_Annotator', 'T_UpdatedAt', 'H_State', 'H_Annotator', 'H_UpdatedAt'].forEach(function(header) {
        context.columns[header] = rowCount > 0
          ? sheet.getRange(2, headerMap[header], rowCount, 1).getValues()
          : [];
      });
      contextCache[sheetName] = context;
      return context;
    }

    function writeLanguageAssignment(context, rowIndex, stateValue, annotatorValue, stateHeader, annotatorHeader, updatedAtHeader, reviewId, sourceId, language) {
      if (!stateValue) return false;
      if (stateValue !== '已指派錄音人' && stateValue !== '未指派錄音人') {
        skipped.push(sourceId + '：' + language + ' 狀態不是錄音人指派狀態，已略過');
        return false;
      }
      if (stateValue === '已指派錄音人' && !annotatorValue) {
        skipped.push(sourceId + '：' + language + ' 已指派但 Annotator 空白，已略過');
        return false;
      }

      var changed = false;
      if (String(context.columns[stateHeader][rowIndex][0] || '') !== stateValue) {
        context.columns[stateHeader][rowIndex][0] = stateValue;
        context.dirtyColumns[stateHeader] = true;
        changed = true;
        changedCells++;
      }
      if (String(context.columns[annotatorHeader][rowIndex][0] || '') !== annotatorValue) {
        context.columns[annotatorHeader][rowIndex][0] = annotatorValue;
        context.dirtyColumns[annotatorHeader] = true;
        changed = true;
        changedCells++;
      }
      if (changed) {
        context.columns[updatedAtHeader][rowIndex][0] = 'APP錄音人指派|' + syncTime;
        context.dirtyColumns[updatedAtHeader] = true;
        changedCells++;
      }
      if (reviewId) syncedReviewIds.push(Number(reviewId));
      return true;
    }

    rows.forEach(function(row) {
      var tState = String(row.t_state || '').trim();
      var tAnnotator = String(row.t_annotator || '').trim();
      var hState = String(row.h_state || '').trim();
      var hAnnotator = String(row.h_annotator || '').trim();
      if (!tState && !hState) return;

      var sheetName = row.source_table === 'test_places' ? TEST_ENTRIES_SHEET_NAME : THIRD_PHASE_SHEET_NAME;
      var context = getContext(sheetName);
      if (!context) {
        skipped.push(row.source_id + '：找不到工作表 ' + sheetName);
        return;
      }

      var rowNumber = context.uuidRows[String(row.source_id || '').trim()];
      if (!rowNumber) {
        skipped.push(row.source_id + '：' + sheetName + ' 找不到 UUID');
        return;
      }
      var rowIndex = rowNumber - 2;
      var processed = false;

      processed = writeLanguageAssignment(context, rowIndex, tState, tAnnotator, 'T_State', 'T_Annotator', 'T_UpdatedAt', row.t_review_id, row.source_id, '台語') || processed;
      processed = writeLanguageAssignment(context, rowIndex, hState, hAnnotator, 'H_State', 'H_Annotator', 'H_UpdatedAt', row.h_review_id, row.source_id, '客語') || processed;
      if (processed) updated++;
    });

    if (updated === 0) {
      var noOpMessage = '沒有可回寫的 APP 錄音人指派狀態。';
      if (skipped.length > 0) noOpMessage += '\n略過：\n' + skipped.join('\n');
      return notify_(noOpMessage, options);
    }

    Object.keys(contextCache).forEach(function(sheetName) {
      var context = contextCache[sheetName];
      Object.keys(context.dirtyColumns).forEach(function(header) {
        context.sheet.getRange(2, context.headerMap[header], context.rowCount, 1).setValues(context.columns[header]);
      });
    });

    var uniqueReviewIds = {};
    syncedReviewIds.forEach(function(id) {
      if (id) uniqueReviewIds[String(id)] = Number(id);
    });
    var marked = markAssignmentsSheetSynced_(Object.keys(uniqueReviewIds).map(function(key) {
      return uniqueReviewIds[key];
    }));
    var message = '✅ 已回寫 APP 錄音人指派至工作表：檢查 ' + updated + ' 筆，更新儲存格 ' + changedCells + ' 格，標記已同步 ' + marked + ' 筆。';
    if (skipped.length > 0) message += '\n略過：\n' + skipped.join('\n');
    return notify_(message, options);
  } catch (e) {
    return handleSyncError_('APP 錄音人指派回寫', e, options);
  }
}
function fetchPendingReviewSheetSyncs_() {
  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/app_sheet_sync_queue?select=*&order=source_table.asc,source_id.asc,language.asc';
  var options = {
    method: 'get',
    headers: getSupabaseHeaders_(supabase),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText());
}

function markReviewsSheetSynced_(reviewIds) {
  if (reviewIds.length === 0) return 0;

  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/rpc/mark_reviews_sheet_synced';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: getSupabaseHeaders_(supabase),
    payload: JSON.stringify({ p_review_ids: reviewIds }),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
  }
  return Number(response.getContentText() || 0);
}


function markAssignmentsSheetSynced_(reviewIds) {
  if (reviewIds.length === 0) return 0;

  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/rpc/mark_assignments_sheet_synced';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: getSupabaseHeaders_(supabase),
    payload: JSON.stringify({ p_review_ids: reviewIds }),
    muteHttpExceptions: true
  };
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
  }
  return Number(response.getContentText() || 0);
}

function syncApprovedReviewsToSheets(options) {
  return notify_('APP 審查回寫功能已暫停。', options);
}

function normalizeRecordUrl_(value) {
  return String(value || '').trim();
}

function buildExistingRecordIdsByUrl_(sheet) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;

  var values = sheet.getRange(2, 1, lastRow - 1, RECORDS_SHEET_HEADERS.length).getValues();
  values.forEach(function(row) {
    var url = normalizeRecordUrl_(row[6]);
    var recordId = String(row[7] || '').trim();
    if (url && recordId && !map[url]) map[url] = recordId;
  });
  return map;
}

function formatSupabaseTimestampForRecords_(value) {
  if (!value) return '';
  var date = new Date(value);
  if (isNaN(date.getTime())) return String(value);
  return Utilities.formatDate(date, 'Asia/Taipei', 'yyyy-MM-dd HH:mm:ss');
}

function rebuildRecordsSheetFromSupabase(options) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(RECORDS_SHEET_NAME) || ss.insertSheet(RECORDS_SHEET_NAME);
    var existingRecordIdsByUrl = buildExistingRecordIdsByUrl_(sheet);

    var tasks = fetchSupabaseRows_('app_tasks_view?select=task_id,source_id,source_table,place_name&order=task_id.asc');
    var taskById = {};
    tasks.forEach(function(task) {
      taskById[String(task.task_id)] = task;
    });

    var records = fetchSupabaseRows_(
      'audio_records?select=id,task_id,recorder_name,audio_file_id,phonetic_reading,language,created_at,unlinked_at&order=created_at.asc,id.asc'
    );

    var output = [RECORDS_SHEET_HEADERS];
    var missingTaskMap = 0;
    var replacedRecordIds = 0;
    records.forEach(function(record) {
      var task = taskById[String(record.task_id)] || {};
      if (!task.source_id) missingTaskMap++;

      var url = normalizeRecordUrl_(record.audio_file_id);
      var recordId = existingRecordIdsByUrl[url] || String(record.id || '');
      if (existingRecordIdsByUrl[url]) replacedRecordIds++;

      output.push([
        formatSupabaseTimestampForRecords_(record.created_at),
        record.recorder_name || '',
        task.source_id || record.task_id || '',
        task.place_name || '',
        record.language || '',
        record.phonetic_reading || '',
        url,
        recordId
      ]);
    });

    var oldRowCount = Math.max(sheet.getLastRow(), 1);
    sheet.getRange(1, 1, oldRowCount, RECORDS_SHEET_HEADERS.length).clearContent();
    sheet.getRange(1, 1, output.length, RECORDS_SHEET_HEADERS.length).setValues(output);
    sheet.getRange(1, 1, 1, RECORDS_SHEET_HEADERS.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
    sheet.autoResizeColumns(1, RECORDS_SHEET_HEADERS.length);

    var message = '✅ Records 已從 Supabase 重建：寫入 ' + records.length + ' 筆錄音。序號欄使用 source_id UUID。保留舊錄音ID ' + replacedRecordIds + ' 筆。';
    if (missingTaskMap > 0) message += '\n⚠️ 有 ' + missingTaskMap + ' 筆找不到 task 對應，序號暫用 task_id。';
    return notify_(message, options);
  } catch (e) {
    return handleSyncError_('Records 重建', e, options);
  }
}
// ==========================================
// 5. 其他 Supabase 工具與匯出功能
// ==========================================
function keepSupabaseAwake() {
  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/final_tasks?select=id&limit=1';
  var options = {
    method: 'get',
    headers: getSupabaseHeaders_(supabase)
  };
  options.muteHttpExceptions = true;
  var response = UrlFetchApp.fetch(url, options);
  var statusCode = response.getResponseCode();
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
  }
  Logger.log('Supabase 已成功喚醒！');
}

function exportCleanCSVForSupabase() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Places');
  if (!sheet) return SpreadsheetApp.getUi().alert('找不到 Places 表單！');

  var data = sheet.getDataRange().getDisplayValues();
  var headers = data[0];

  var idxSid = headers.indexOf('序號');
  var idxCounty = headers.indexOf('County');
  var idxTown = headers.indexOf('Town');
  var idxPlaceName = headers.indexOf('PlaceName');
  var idxType = headers.indexOf('Type');

  if (idxSid === -1 || idxCounty === -1 || idxTown === -1 || idxPlaceName === -1 || idxType === -1) {
    return SpreadsheetApp.getUi().alert('❌ 找不到必要的欄位，請檢查標題名稱是否完全一致。');
  }

  var csvLines = ['sid,county,town,place_name,type,source_tag']; 
  function escapeCSV(val) {
    if (val === null || val === undefined) return '';
    var str = String(val).trim();
    if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
      str = '"' + str.replace(/"/g, '""') + '"'; 
    }
    return str;
  }

  ss.toast('正在產生 CSV，請稍候...', '處理中', 10);
  var sourceTag = 'moi_placename_raw';
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var sid = row[idxSid];
    if (!sid || sid === "") continue;

    var rowCsv = [
      escapeCSV(sid), escapeCSV(row[idxCounty]), escapeCSV(row[idxTown]),
      escapeCSV(row[idxPlaceName]), escapeCSV(row[idxType]), escapeCSV(sourceTag)
    ].join(',');
    csvLines.push(rowCsv);
  }

  var csvContent = "\uFEFF" + csvLines.join('\n');
  var fileName = 'Supabase_Import_' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + '.csv';
  var file = DriveApp.createFile(fileName, csvContent, MimeType.CSV);

  var htmlOutput = HtmlService
    .createHtmlOutput('<div style="font-family: sans-serif; padding: 10px;">' +
                      '<h3>✅ CSV 建立成功！</h3>' +
                      '<p>檔案已存入雲端硬碟根目錄：</p>' +
                      '<p><b>' + fileName + '</b></p>' +
                      '<a href="' + file.getUrl() + '" target="_blank" style="padding: 8px 15px; background: #3498db; color: white; text-decoration: none; border-radius: 4px;">點此開啟並下載</a>' +
                      '</div>')
    .setWidth(400)
    .setHeight(200);
  SpreadsheetApp.getUi().showModalDialog(htmlOutput, '匯出結果');
}

/**
 * 拉取亮均的分類結果
 */

/**
 * 將同事的工作表 (來源) 資料同步回 L2 (本地端)
 * 更新：
 * 1. 指定工作表名稱 "5000條初步標注"
 * 2. TaiClass / HakClass 若為空則預設填入 "未分類"
 */
function syncClassification() {
  const LOCAL_SS_ID = '19zL0Ph0cocqfg5teJu6WKUI8dh_T5y3kSp7MdBQPAcI';
  const SOURCE_SS_ID = '1XVtStLyIlzh-56cAo6pvadrSh2m9jurfV6oIaFVP-70';
  
  const localSS = SpreadsheetApp.openById(LOCAL_SS_ID);
  const localSheet = localSS.getSheetByName("第三期工作清單"); 
  const sourceSS = SpreadsheetApp.openById(SOURCE_SS_ID);
  // 1. 已依照您的修改指定分頁名稱
  const sourceSheet = sourceSS.getSheetByName("5000條地名分類"); 

  if (!sourceSheet) {
    return SpreadsheetApp.getUi().alert("❌ 錯誤：在來源檔案中找不到「5000條初步標注」分頁。");
  }

  const localData = localSheet.getDataRange().getValues();
  const localHeaders = localData[0];
  const sourceData = sourceSheet.getDataRange().getValues();
  const sourceHeaders = sourceData[0];

  // 建立表頭索引圖
  const lCol = {};
  localHeaders.forEach((h, i) => lCol[h.trim()] = i);
  const sCol = {};
  sourceHeaders.forEach((h, i) => sCol[h.trim()] = i);

  if (lCol["同步警告"] === undefined) {
    return SpreadsheetApp.getUi().alert("錯誤：L2 找不到「同步警告」欄位，請先手動新增此欄位。");
  }

  // 建立來源表索引 { "序號": rowData }
  const sourceMap = {};
  for (let i = 1; i < sourceData.length; i++) {
    const sn = String(sourceData[i][sCol["序號"]]).trim();
    if (sn) sourceMap[sn] = sourceData[i];
  }

  const updatePayload = [];

  for (let i = 1; i < localData.length; i++) {
    const uuid = String(localData[i][lCol["UUID"]]).trim();
    const localPlaceName = String(localData[i][lCol["PlaceName"]]).trim();
    
    if (!uuid || !sourceMap[uuid]) continue;

    const sRow = sourceMap[uuid];
    const sPlaceName = String(sRow[sCol["PlaceName"]]).trim();
    const rowUpdateData = {};
    let hasWarning = "";

    // 1. 檢查 PlaceName 一致性
    if (localPlaceName !== sPlaceName) {
      hasWarning = `⚠️ 地名不符 (來源: ${sPlaceName})`;
    }

    // 2. 依照對應表拉取資料與條件判定
    
    // --- 台文部分 ---
    // 2. 如果 TaiClass 沒有值，預設填入 "未分類"
    let sTaiClass = String(sRow[sCol["TaiClass"]]).trim();
    if (!sTaiClass) sTaiClass = "未分類";

    // 取得 TL1 的值用於判斷 (對應來源表的 TaiLo1)
    const sTL1 = String(sRow[sCol["TaiLo1"]] || "").trim();
    
    rowUpdateData["TaiClass"] = sTaiClass;
    rowUpdateData["TaiHan1"] = sRow[sCol["TaiHan"]];
    rowUpdateData["TL1"] = sRow[sCol["TaiLo1"]];
    rowUpdateData["TL2"] = sRow[sCol["TaiLo2"]];
    rowUpdateData["TaiNote"] = sRow[sCol["TaiNote"]];
    
    if (sTaiClass === "直接標注" && sTL1 !=="") {
      rowUpdateData["T_State"] = "待審查";
      rowUpdateData["T_Annotator"] = "陳亮均";
    } else if (sTaiClass === "直接標注"){
      rowUpdateData["T_State"] = "待指派";
    } else {
      rowUpdateData["T_State"] = "待指派";
    }

    // --- 客文部分 ---
    // 同理，HakClass 若空也預設為 "未分類"
    let sHakClass = String(sRow[sCol["HakClass"]]).trim();
    if (!sHakClass) sHakClass = "未分類";
    const sHP1 = String(sRow[sCol["HakPiang1"]] || "").trim();

    rowUpdateData["HakClass"] = sHakClass;
    rowUpdateData["Honzii"] = sRow[sCol["HakHan"]];
    rowUpdateData["HP1"] = sRow[sCol["HakPiang1"]];
    rowUpdateData["HP2"] = sRow[sCol["HakPiang2"]];
    rowUpdateData["HakNote"] = sRow[sCol["HakNote"]];
    
    if (sHakClass === "直接標注" && sHP1 !== "") {
      rowUpdateData["H_State"] = "待審查"; 
      rowUpdateData["H_Annotator"] = "陳亮均";
    } else {
      rowUpdateData["H_State"] = "待指派";
    }

    // --- 新增 Info 欄位 (強化版) ---
    // 1. 強制修剪標題索引的空白，並檢查是否存在
    const infoIdx = sCol["Info"];
    
    if (infoIdx !== undefined) {
      
      const infoValue = sRow[infoIdx];
      // 偵錯用：在編輯器的「執行紀錄」中查看 UUID 與抓到的值
      console.log(`UUID: ${uuid} | Info內容: ${infoValue}`);
      
      // 2. 確保寫入 rowUpdateData 的 Key 與 L2 的標題完全一致
      rowUpdateData["Info"] = infoValue !== undefined ? infoValue : "";
    } else {
      // 如果執行紀錄出現這一行，代表程式在 L1 標題列真的找不到 "Info"
      console.warn("系統在來源表標題中找不到 'Info' 欄位，請檢查是否有隱藏字元。");
    }

    rowUpdateData["同步警告"] = hasWarning;

    updatePayload.push({
      row: i + 1,
      data: rowUpdateData
    });
  }

  // 3. 執行自訂更新函數
  if (updatePayload.length > 0) {
    const userEmail = Session.getActiveUser().getEmail();
    const botId = '亮均分類表單同步'; 
    
    const changed = gasUpdateRows(updatePayload, botId);
    
    SpreadsheetApp.getUi().alert(`✅ 同步完成！共更新 ${updatePayload.length} 筆資料。\n空分類已自動填入「未分類」。`);
  } else {
    SpreadsheetApp.getUi().alert("ℹ️ 沒有找到可對應的 UUID 資料。");
  }
}




/**
 * 🛰️ 分發任務到各標注員的衛星表單 (自動初始化標題列 + 強化去重)
 */
function pushTasksToSatelliteSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var l2Sheet = ss.getSheetByName("第三期工作清單");
  // 使用您指定的新工作表名稱
  var userListSheet = ss.getSheetByName("書面標注員名單");
  
  if (!userListSheet) return SpreadsheetApp.getUi().alert("❌ 找不到『書面標注員名單』表！");

  // 1. 建立標注員與檔案 ID 的對照表
  var userData = userListSheet.getDataRange().getValues();
  var userMap = {}; 
  for (var i = 1; i < userData.length; i++) {
    if (userData[i][0] && userData[i][1]) {
      userMap[userData[i][0].toString().trim()] = userData[i][1].toString().trim();
    }
  }

  // 2. 抓取 L2 資料與表頭對照
  var l2Data = l2Sheet.getDataRange().getValues();
  var l2Headers = l2Data[0];
  var colMap = {};
  l2Headers.forEach((h, i) => colMap[h.trim()] = i);

  // 3. 按標注員進行任務分組
  var tasksByUser = {};
  var invalidClassCount = 0;
  for (var j = 1; j < l2Data.length; j++) {
    var row = l2Data[j];
    var person = row[colMap["標注員"]];
    var method = row[colMap["調查方式"]];
    
    // 條件：調查方式為「書面標注」且已有指派標注員
    if (method === "書面標注" && person && userMap[person]) {
      if (!rowHasWrittenAnnotationClass_(row, colMap)) {
        invalidClassCount++;
        writeSatellitePushWarning_(l2Sheet, colMap, j + 1, buildSatellitePushClassWarning_(row, colMap));
        continue;
      }

      if (!tasksByUser[person]) tasksByUser[person] = [];

      tasksByUser[person].push({
        values: [
          row[colMap["UUID"]],
          row[colMap["地名"]],
          row[colMap["縣市"]],
          row[colMap["鄉鎮"]],
          row[colMap["村里"]],
          row[colMap["台文漢字"]],
          row[colMap["台文羅馬字"]],
          row[colMap["客文漢字"]],
          row[colMap["客文羅馬字"]],
          row[colMap["任務狀態"]],
          row[colMap["備註"]]
        ],
        taiWritten: isLanguageWrittenAnnotationClass_(row, colMap, '台語'),
        hakWritten: isLanguageWrittenAnnotationClass_(row, colMap, '客語')
      });
    }
  }

  // 4. 開始推送到各個衛星檔案
  var totalPushed = 0;
  var satelliteHeaders = ["UUID", "地名", "縣市", "鄉鎮", "村里", "台文漢字", "台文羅馬字", "客文漢字", "客文羅馬字", "任務狀態", "備註"];

  for (var person in tasksByUser) {
    try {
      var targetSS = SpreadsheetApp.openById(userMap[person]);
      var targetSheet = targetSS.getSheets()[0]; 
      
      // --- 自動初始化標題列 ---
      if (targetSheet.getLastRow() === 0) {
        targetSheet.appendRow(satelliteHeaders);
        targetSheet.getRange("A1:K1").setBackground("#d9ead3").setFontWeight("bold").setFrozenRows(1);
      }
      
      // --- 強化去重機制 ---
      var existingData = targetSheet.getDataRange().getValues();
      var existingUUIDs = new Set();
      if (existingData.length > 1) {
        // 從第二列開始收集已有的 UUID
        for (var k = 1; k < existingData.length; k++) {
          existingUUIDs.add(String(existingData[k][0]).trim());
        }
      }
      
      // 只保留衛星表中尚未存在的任務
      var filteredTasks = tasksByUser[person].filter(task => !existingUUIDs.has(String(task.values[0]).trim()));
      
      if (filteredTasks.length > 0) {
        var startRow = targetSheet.getLastRow() + 1;
        targetSheet.getRange(startRow, 1, filteredTasks.length, satelliteHeaders.length).setValues(filteredTasks.map(function(task) {
          return task.values;
        }));
        applySatelliteTaskLanguageGuidance_(targetSheet, startRow, filteredTasks);
        totalPushed += filteredTasks.length;
      }
    } catch (e) {
      Logger.log("推送給 " + person + " 失敗: " + e.message);
    }
  }

  var message = "🛰️ 衛星同步完成！共推送 " + totalPushed + " 筆新任務。";
  if (invalidClassCount > 0) {
    message += "\n⚠️ 已略過 " + invalidClassCount + " 筆調查方式為書面標注、但 TaiClass/HakClass 未標為書面標注的任務，請查看同步警告欄。";
  }
  SpreadsheetApp.getUi().alert(message);
}


/**
 * 🛰️ 從所有衛星表單拉回標注結果 (強化版：自動標記待審查 + 備註欄位對接)
 */
function pullResultsFromSatelliteSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var l2Sheet = ss.getSheetByName("第三期工作清單");
  var userListSheet = ss.getSheetByName("書面標注員名單");
  
  if (!l2Sheet || !userListSheet) {
    return SpreadsheetApp.getUi().alert("❌ 錯誤：找不到「第三期工作清單」或「書面標注員名單」工作表。");
  }

  // 1. 取得標注員清單與 L2 表頭對照
  var userData = userListSheet.getDataRange().getValues();
  var l2Data = l2Sheet.getDataRange().getValues();
  var l2Headers = l2Data[0];
  var l2ColMap = {};
  l2Headers.forEach((h, i) => l2ColMap[h.trim()] = i);

  // 建立 L2 的 UUID 索引快速查找 { "UUID": 列號 }
  var l2IndexMap = {};
  for (var i = 1; i < l2Data.length; i++) {
    var uuidKey = String(l2Data[i][l2ColMap["UUID"]]).trim();
    if (uuidKey) l2IndexMap[uuidKey] = i + 1;
  }

  var totalUpdated = 0;
  var classConflictCount = 0;

  // 2. 遍歷每位標注員的衛星檔案
  for (var u = 1; u < userData.length; u++) {
    var person = userData[u][0];
    var sheetId = userData[u][1];
    if (!sheetId) continue;

    try {
      var sSS = SpreadsheetApp.openById(sheetId);
      var sSheet = sSS.getSheets()[0];
      var sData = sSheet.getDataRange().getValues();
      var sHeaders = sData[0];
      var sColMap = {};
      sHeaders.forEach((h, i) => sColMap[h.trim()] = i);

      for (var j = 1; j < sData.length; j++) {
        var sRow = sData[j];
        var uuid = String(sRow[sColMap["UUID"]]).trim();
        
        // 取得填寫內容
        var twHan = String(sRow[sColMap["台文漢字"]]).trim();
        var twRoman = String(sRow[sColMap["台文羅馬字"]]).trim();
        var hkHan = String(sRow[sColMap["客文漢字"]]).trim();
        var hkRoman = String(sRow[sColMap["客文羅馬字"]]).trim();
        var note = sRow[sColMap["備註"]];

        // --- 核心邏輯：分語種確認主表分類，只有書面標注分級才允許回填 ---
        if ((twHan !== "" || twRoman !== "" || hkHan !== "" || hkRoman !== "") && l2IndexMap[uuid]) {
          var rowNum = l2IndexMap[uuid];
          var l2Row = l2Data[rowNum - 1];
          var rowUpdated = false;
          var rowWarnings = [];

          if (twHan !== "" || twRoman !== "") {
            if (isLanguageWrittenAnnotationClass_(l2Row, l2ColMap, '台語')) {
              l2Sheet.getRange(rowNum, l2ColMap["台文漢字"] + 1).setValue(sRow[sColMap["台文漢字"]]);
              l2Sheet.getRange(rowNum, l2ColMap["台文羅馬字"] + 1).setValue(sRow[sColMap["台文羅馬字"]]);
              rowUpdated = true;
            } else {
              classConflictCount++;
              rowWarnings.push(buildSatellitePullClassWarning_(uuid, '台語', l2Row, l2ColMap));
            }
          }

          if (hkHan !== "" || hkRoman !== "") {
            if (isLanguageWrittenAnnotationClass_(l2Row, l2ColMap, '客語')) {
              l2Sheet.getRange(rowNum, l2ColMap["客文漢字"] + 1).setValue(sRow[sColMap["客文漢字"]]);
              l2Sheet.getRange(rowNum, l2ColMap["客文羅馬字"] + 1).setValue(sRow[sColMap["客文羅馬字"]]);
              rowUpdated = true;
            } else {
              classConflictCount++;
              rowWarnings.push(buildSatellitePullClassWarning_(uuid, '客語', l2Row, l2ColMap));
            }
          }

          if (rowWarnings.length > 0) {
            writeSatellitePushWarning_(l2Sheet, l2ColMap, rowNum, rowWarnings.join(' / '));
          }

          if (rowUpdated) {
            // 衛星表「備註」 -> L2「標注員備註」
            if (l2ColMap["標注員備註"] !== undefined) {
              l2Sheet.getRange(rowNum, l2ColMap["標注員備註"] + 1).setValue(note);
            }

            // 自動修改狀態為「待審查」
            l2Sheet.getRange(rowNum, l2ColMap["任務狀態"] + 1).setValue("待審查");

            // 更新標注時間
            var now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
            l2Sheet.getRange(rowNum, l2ColMap["標注時間"] + 1).setValue(now);

            totalUpdated++;
          }
        }
      }
    } catch (e) {
      Logger.log("從 " + person + " 回填失敗: " + e.message);
    }
  }

  // 3. 更新同步時間並回報結果
  var syncTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  userListSheet.getRange(2, 3, userData.length - 1, 1).setValue(syncTime);

  var message = "✅ 回填完成！\n共掃描並更新了 " + totalUpdated + " 筆已填寫的詞條。\n狀態已自動更新為「待審查」。";
  if (classConflictCount > 0) {
    message += "\n⚠️ 已略過 " + classConflictCount + " 筆語種回填，原因是主表 TaiClass/HakClass 不是書面標注，請查看同步警告欄。";
  }
  SpreadsheetApp.getUi().alert(message);
}
