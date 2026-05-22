// ==========================================
// 1. 系統設定與 Supabase 驗證資訊
// ==========================================
var SUPABASE_URL_PROPERTY = 'SUPABASE_URL';
var SUPABASE_SERVICE_ROLE_KEY_PROPERTY = 'SUPABASE_SERVICE_ROLE_KEY';
var DEFAULT_SUPABASE_URL = 'https://sikconjhtomqdkicbjal.supabase.co';

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
    'User-Agent': 'TopoNote-Places-GAS/1.0',
    'X-Client-Info': 'toponote-places-gas'
  };

  // Supabase sb_secret_* keys are API keys, not JWT bearer tokens.
  if (supabase.key.indexOf('sb_secret_') !== 0) {
    headers.Authorization = 'Bearer ' + supabase.key;
  }

  if (extraHeaders) {
    for (var name in extraHeaders) {
      headers[name] = extraHeaders[name];
    }
  }

  return headers;
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
    .addItem('2. 將 L2 任務同步至 Supabase', 'syncFinalTasksToSupabase')
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
function syncFinalTasksToSupabase() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('第三期工作清單');
  if (!sheet) return SpreadsheetApp.getUi().alert('❌ 找不到「第三期工作清單」工作表！');
  
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
        source_table: String(data[i][colMap["資料來源"]] || 'moi_placename_raw'),
        assigned_to: String(data[i][colMap["標注員"]] || '') || null,
        priority: 0, // 預設優先級
        status: String(data[i][colMap["任務狀態"]] || 'pending'),
        is_active: true // 在 L2 內皆視為啟用
      });
    }
  }

  if (payload.length === 0) return SpreadsheetApp.getUi().alert('沒有資料可同步。');

  var supabase = getSupabaseConfig_();
  var url = supabase.url + '/rest/v1/final_tasks?on_conflict=source_id,source_table';
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: getSupabaseHeaders_(supabase, {
      'Prefer': 'resolution=merge-duplicates'
    }),
    payload: JSON.stringify(payload)
  };

  try {
    options.muteHttpExceptions = true;
    var response = UrlFetchApp.fetch(url, options);
    var statusCode = response.getResponseCode();
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error('Supabase HTTP ' + statusCode + ': ' + response.getContentText());
    }
    SpreadsheetApp.getUi().alert('🚀 成功將 ' + payload.length + ' 筆任務與狀態同步至 Supabase！');
  } catch (e) {
    SpreadsheetApp.getUi().alert('❌ 同步失敗: ' + e.message);
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
  for (var j = 1; j < l2Data.length; j++) {
    var row = l2Data[j];
    var person = row[colMap["標注員"]];
    var method = row[colMap["調查方式"]];
    
    // 條件：調查方式為「書面標注」且已有指派標注員
    if (method === "書面標注" && person && userMap[person]) {
      if (!tasksByUser[person]) tasksByUser[person] = [];
      
      tasksByUser[person].push([
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
      ]);
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
      var filteredTasks = tasksByUser[person].filter(task => !existingUUIDs.has(String(task[0]).trim()));
      
      if (filteredTasks.length > 0) {
        targetSheet.getRange(targetSheet.getLastRow() + 1, 1, filteredTasks.length, satelliteHeaders.length).setValues(filteredTasks);
        totalPushed += filteredTasks.length;
      }
    } catch (e) {
      Logger.log("推送給 " + person + " 失敗: " + e.message);
    }
  }

  SpreadsheetApp.getUi().alert("🛰️ 衛星同步完成！共推送 " + totalPushed + " 筆新任務。");
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
        var hkHan = String(sRow[sColMap["客文漢字"]]).trim();
        var note = sRow[sColMap["備註"]];

        // --- 核心邏輯：只要台文或客文有填寫內容，就進行回填 ---
        if ((twHan !== "" || hkHan !== "") && l2IndexMap[uuid]) {
          var rowNum = l2IndexMap[uuid];
          
          // 回填內容
          l2Sheet.getRange(rowNum, l2ColMap["台文漢字"] + 1).setValue(sRow[sColMap["台文漢字"]]);
          l2Sheet.getRange(rowNum, l2ColMap["台文羅馬字"] + 1).setValue(sRow[sColMap["台文羅馬字"]]);
          l2Sheet.getRange(rowNum, l2ColMap["客文漢字"] + 1).setValue(sRow[sColMap["客文漢字"]]);
          l2Sheet.getRange(rowNum, l2ColMap["客文羅馬字"] + 1).setValue(sRow[sColMap["客文羅馬字"]]);
          
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
    } catch (e) {
      Logger.log("從 " + person + " 回填失敗: " + e.message);
    }
  }

  // 3. 更新同步時間並回報結果
  var syncTime = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm");
  userListSheet.getRange(2, 3, userData.length - 1, 1).setValue(syncTime);

  SpreadsheetApp.getUi().alert("✅ 回填完成！\n共掃描並更新了 " + totalUpdated + " 筆已填寫的詞條。\n狀態已自動更新為「待審查」。");
}
