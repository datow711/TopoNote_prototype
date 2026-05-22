/**編輯器
AuditLogger.gs
Dialog.html
SideBar.gs
Sidebar.html
程式碼.gs

 * ═══════════════════════════════════════════════════════════════
 * AuditLogger (Final Strict Version)
 * 1. 解決多格圈選 Del 誤觸發問題
 * 2. 修正迴圈 Bug 與效能優化
 * ═══════════════════════════════════════════════════════════════
 */

const GLOBAL_CFG = {
  sheetName: '第三期工作清單', 
  headerRow: 1,
  cacheExpiry: 21600
};

const AUDIT_CONFIGS = [
  {
    name: 'T_Series',
    monitoredCols: ['TaiHan1','Info', 'TL1', 'TL2', 'TL3', 'TaiNote', 'TaiClass', 'T_State', 'T_Annotator'],
    createdCol: 'T_CreatedAt',
    updatedCol: 'T_UpdatedAt'
  },
  {
    name: 'H_Series',
    monitoredCols: ['Honzii', 'HP1', 'HP2', 'HP3', 'HakNote','HakClass', 'H_State', 'H_Annotator'],
    createdCol: 'H_CreatedAt',
    updatedCol: 'H_UpdatedAt'
  }
];

// 歸一化比對：判斷值是否真的改變（處理 null/undefined/空字串）
function _isActuallyChanged(oldVal, newVal) {
  const normalize = (v) => (v === null || v === undefined) ? "" : String(v).trim();
  return normalize(oldVal) !== normalize(newVal);
}

function _sheet() {
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(GLOBAL_CFG.sheetName);
}

function _headerMap() {
  const cache = CacheService.getScriptCache();
  const KEY = 'hdr::' + GLOBAL_CFG.sheetName;
  const hit = cache.get(KEY);
  if (hit) return JSON.parse(hit);

  const sh = _sheet();
  const raw = sh.getRange(GLOBAL_CFG.headerRow, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  raw.forEach((h, i) => {
    if (String(h).trim() !== '') map[String(h).trim()] = i + 1;
  });

  cache.put(KEY, JSON.stringify(map), GLOBAL_CFG.cacheExpiry);
  return map;
}

function _clearHeaderCache() {
  CacheService.getScriptCache().remove('hdr::' + GLOBAL_CFG.sheetName);
}

function _record(uid) {
  const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return `${uid} | ${ts}`;
}

function _activeUid() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email ? email.split('@')[0] : 'user';
  } catch (_) {
    return 'user';
  }
}

// ╔═══════════════════════════════════════════════════════════════
// ║  1. onEdit Trigger (修復多格 Del 問題)
// ╚═══════════════════════════════════════════════════════════════
function onEdit(e) {
  if (!e) return;
  const range = e.range;
  const sh = range.getSheet();
  if (sh.getName() !== GLOBAL_CFG.sheetName) return;

  const startRow = range.getRow();
  if (startRow <= GLOBAL_CFG.headerRow) {
    _clearHeaderCache();
    return;
  }

  const numRows = range.getNumRows();
  const numCols = range.getNumColumns();
  const startCol = range.getColumn();
  const endCol = range.getLastColumn();
  const hdr = _headerMap();
  const uid = _activeUid();

  // --- A. 單格編輯：使用系統提供的 oldValue 進行嚴格比對 ---
  if (numRows === 1 && numCols === 1) {
    if (!_isActuallyChanged(e.oldValue, e.value)) return;
  }

  // --- B. 多格編輯：預先讀取變動範圍的資料，判斷是否真的需要蓋章 ---
  // 我們讀取整個受影響列的資料（包含時間戳欄位）
  const fullDataRange = sh.getRange(startRow, 1, numRows, sh.getLastColumn()).getValues();

  AUDIT_CONFIGS.forEach(config => {
    const monIndices = config.monitoredCols.map(c => hdr[c]).filter(Boolean);
    const monSet = new Set(monIndices);

    // 1. 先判斷欄位是否有交集
    let isColIntersected = false;
    for (let c = startCol; c <= endCol; c++) {
      if (monSet.has(c)) { isColIntersected = true; break; }
    }
    if (!isColIntersected) return;

    // 2. 逐列檢查變動
    const rowNumsToStamp = [];
    const cIdx = hdr[config.createdCol];
    const uIdx = hdr[config.updatedCol];

    for (let i = 0; i < numRows; i++) {
      const currentRow = fullDataRange[i];
      const absoluteRowNum = startRow + i;

      // 檢查該列受監測欄位現在是否全部為空
      const isCurrentlyEmpty = monIndices.every(idx => String(currentRow[idx - 1] || "").trim() === "");
      
      // 檢查該列是否已經有時間戳記
      const hasExistingTimestamp = (cIdx && currentRow[cIdx - 1]) || (uIdx && currentRow[uIdx - 1]);

      if (numRows === 1 && numCols === 1) {
        // 單格已在前面過濾，直接加入
        rowNumsToStamp.push(absoluteRowNum);
      } else {
        // 多格情況下：
        // 如果現在是空的，且本來就沒有時間戳 -> 這是空白列按 Del -> 忽略
        // 如果現在是空的，但本來有時間戳 -> 這是刪除資料 -> 記錄
        // 如果現在不是空的 -> 這是新增或修改資料 -> 記錄
        if (!isCurrentlyEmpty || hasExistingTimestamp) {
          rowNumsToStamp.push(absoluteRowNum);
        }
      }
    }

    if (rowNumsToStamp.length > 0) {
      _stampRowsWithConfig(sh, rowNumsToStamp, uid, hdr, config);
    }
  });
}

// ╔═══════════════════════════════════════════════════════════════
// ║  2. gasUpdateRows (維持高效 Batch 操作)
// ╚═══════════════════════════════════════════════════════════════
function gasUpdateRows(updates, uid) {
  if (!updates || !updates.length) return [];
  uid = uid || 'gas_script';
  const sh = _sheet();
  const hdr = _headerMap();
  const stamp = _record(uid);

  const rowNums = updates.map(u => u.row);
  const minRow = Math.min(...rowNums);
  const maxRow = Math.max(...rowNums);
  const lastCol = sh.getLastColumn();
  const range = sh.getRange(minRow, 1, maxRow - minRow + 1, lastCol);
  const values = range.getValues();

  updates.forEach(update => {
    const rowIndex = update.row - minRow;
    const rowData = values[rowIndex];
    
    AUDIT_CONFIGS.forEach(config => {
      let rowChanged = false;
      config.monitoredCols.forEach(colName => {
        if (update.data[colName] !== undefined) {
          const colIdx = hdr[colName];
          if (_isActuallyChanged(rowData[colIdx - 1], update.data[colName])) {
            rowData[colIdx - 1] = update.data[colName];
            rowChanged = true;
          }
        }
      });

      if (rowChanged) {
        const uIdx = hdr[config.updatedCol];
        const cIdx = hdr[config.createdCol];
        if (uIdx) rowData[uIdx - 1] = stamp;
        if (cIdx && !rowData[cIdx - 1]) rowData[cIdx - 1] = stamp;
      }
    });
  });

  range.setValues(values);
  return rowNums;
}

function _stampRowsWithConfig(sh, rowNums, uid, hdr, config) {
  const cIdx = hdr[config.createdCol];
  const uIdx = hdr[config.updatedCol];
  if (!cIdx || !uIdx) return;

  const stamp = _record(uid);
  const sortedRows = [...new Set(rowNums)].sort((a, b) => a - b);
  const minRow = sortedRows[0];
  const maxRow = sortedRows[sortedRows.length - 1];

  const createdRange = sh.getRange(minRow, cIdx, maxRow - minRow + 1, 1);
  const createdVals = createdRange.getValues();
  const updatedA1 = [];
  const createdA1 = [];

  sortedRows.forEach(row => {
    updatedA1.push(sh.getRange(row, uIdx).getA1Notation());
    if (!createdVals[row - minRow][0]) {
      createdA1.push(sh.getRange(row, cIdx).getA1Notation());
    }
  });

  if (updatedA1.length) sh.getRangeList(updatedA1).setValue(stamp);
  if (createdA1.length) sh.getRangeList(createdA1).setValue(stamp);
}

// ╔═══════════════════════════════╗
// ║     🛠 維護 / 工具函式        ║
// ╚═══════════════════════════════╝

/**
 * 安裝「可安裝的 onEdit 觸發器」
 * 可安裝觸發器比簡單觸發器更穩定地取得 Session.getActiveUser()。
 * 每個試算表只需執行一次。
 */
function installOnEditTrigger() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  // 避免重複安裝
  const existing = ScriptApp.getUserTriggers(ss);
  for (const t of existing) {
    if (t.getHandlerFunction() === 'onEdit') {
      Logger.log('[AuditLogger] onEdit 觸發器已存在，跳過安裝。');
      return;
    }
  }
  ScriptApp.newTrigger('onEdit')
    .forSpreadsheet(ss)
    .onEdit()
    .create();
  Logger.log('[AuditLogger] onEdit 觸發器安裝完成。');
}

/** 移除所有 onEdit 觸發器（除錯用） */
function removeOnEditTriggers() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.getUserTriggers(ss)
    .filter(t => t.getHandlerFunction() === 'onEdit')
    .forEach(t => {
      ScriptApp.deleteTrigger(t);
      Logger.log('[AuditLogger] 已移除觸發器：%s', t.getUniqueId());
    });
}

/** 強制重建 Header Cache（標題列異動後手動呼叫） */
function rebuildHeaderCache() {
  _clearHeaderCache();
  Logger.log('[AuditLogger] 新 Header Map: %s', JSON.stringify(_headerMap()));
}

/** 印出目前 Header Map（除錯用） */
function debugHeaderMap() {
  Logger.log(JSON.stringify(_headerMap(), null, 2));
}

/**
 * 範例：示範如何從另一支 GAS 呼叫 gasUpdateRows
 * （實際使用時請刪除或修改此函式）
 */
function _exampleUsage() {
  const changed = gasUpdateRows(
    [
      { row: 2, data: { TaiHan1: '漢字A', TL1: 'hello', TL2: 'world' } },
      { row: 3, data: { TaiHan1: '漢字B', TaiClass: 'N1' } },
    ],
    'import_bot'   // ← 填入來源識別碼，例如執行帳號的 @ 前 ID
  );
  Logger.log('Changed rows: %s', JSON.stringify(changed));
}