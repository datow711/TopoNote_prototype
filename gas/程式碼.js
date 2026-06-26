// 從系統環境變數取得 ID
var FOLDER_ID = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
var SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
var FEEDBACK_SPREADSHEET_ID_PROPERTY = 'FEEDBACK_SPREADSHEET_ID';
var FEEDBACK_CHAT_WEBHOOK_URL_PROPERTY = 'FEEDBACK_CHAT_WEBHOOK_URL';
var FEEDBACK_SPREADSHEET_NAME = 'TopoNote_問題回報';
var FEEDBACK_SHEET_NAME = '問題回報';
var FEEDBACK_HEADERS = ['意見ID', '調查員姓名', 'Email', '寄件時間', '意見主旨', '意見內容', '是否已回復'];
var USER_SHEET_NAME = 'Users';
var USER_PROFILE_HEADERS = [
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
  'survey_area_3'
];
var SUPABASE_URL_DEFAULT = 'https://sikconjhtomqdkicbjal.supabase.co';
var SUPABASE_ANON_KEY_DEFAULT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNpa2NvbmpodG9tcWRraWNiamFsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ1ODk4NzAsImV4cCI6MjA5MDE2NTg3MH0.CR4zasAgXSogTsoSvLonTRwYlBkBPAyAj6jh-TKqViM';

// ==========================================
// 🚀 進階快取系統
// ==========================================
function putLargeCache(key, dataString, expirationInSeconds) {
  var cache = CacheService.getScriptCache();
  var chunkSize = 90000;
  var chunks = Math.ceil(dataString.length / chunkSize);
  cache.put(key + '_chunks', chunks.toString(), expirationInSeconds);
  for (var i = 0; i < chunks; i++) {
    cache.put(key + '_' + i, dataString.substring(i * chunkSize, (i + 1) * chunkSize), expirationInSeconds);
  }
}

function getLargeCache(key) {
  var cache = CacheService.getScriptCache();
  var chunks = cache.get(key + '_chunks');
  if (!chunks) return null;
  var dataString = '';
  for (var i = 0; i < parseInt(chunks); i++) {
    var chunk = cache.get(key + '_' + i);
    if (!chunk) return null;
    dataString += chunk;
  }
  return dataString;
}

function getAllPlacesData() {
  // 🚀 將快取金鑰改名，強制系統立刻去讀取最新資料，拋棄舊快取！
  var cacheKey = 'PLACES_DATA_V2'; 
  var cachedData = getLargeCache(cacheKey);
  if (cachedData) return JSON.parse(cachedData); 
  
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Places');
  var data = sheet.getDataRange().getValues();
  
  // 🚀 防呆機制：將所有標題欄位轉成小寫，並去除前後空白，避免找不到
  var headers = data[0].map(function(h) { return String(h).trim().toLowerCase(); });
  
  var idxId = headers.indexOf('序號');
  var idxCounty = headers.indexOf('county');
  var idxTown = headers.indexOf('town');
  var idxName = headers.indexOf('placename');
  var idxType = headers.indexOf('type'); // 統一用小寫比對
  
  var places = [];
  for (var i = 1; i < data.length; i++) {
    places.push({
      id: data[i][idxId] ? data[i][idxId].toString() : "",
      county: idxCounty !== -1 ? data[i][idxCounty] : "",
      town: idxTown !== -1 ? data[i][idxTown] : "",
      placeName: idxName !== -1 ? data[i][idxName] : "",
      // 如果有找到 type 欄位，就塞入資料，否則給空字串
      type: idxType !== -1 ? data[i][idxType] : "" 
    });
  }
  
  putLargeCache(cacheKey, JSON.stringify(places), 21600);
  return places;
}

// ==========================================
// 🟢 API 路由：GET
// ==========================================
function doGet(e) {
  if (e.parameter.action === 'clearCache') {
    var cache = CacheService.getScriptCache();
    var chunks = cache.get('PLACES_DATA_chunks');
    if (chunks) {
      cache.remove('PLACES_DATA_chunks');
      for (var i = 0; i < parseInt(chunks); i++) {
        cache.remove('PLACES_DATA_' + i);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "快取已清除" })).setMimeType(ContentService.MimeType.JSON);
  }
  return ContentService.createTextOutput("這是後端 API");
}

// ==========================================
// 🟠 API 路由：POST (加上 getAudio 路由)
// ==========================================
function doPost(e) {
  try {
    var requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;

    if (action === 'login') {
      throw new Error('legacy_login_disabled: current app login uses Supabase RPCs.');
    }
    if (action === 'upload') return handleUpload(requestData);
    if (action === 'getAudio') return handleGetAudio(requestData); // 🚀 新增讀取音檔 API
    if (action === 'submitFeedback') return handleSubmitFeedback(requestData);
    if (action === 'setInvestigatorActive') return handleSetInvestigatorActive(requestData);
    if (action === 'updateUserProfile') return handleUpdateUserProfile(requestData);

    throw new Error("未知的操作");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 處理登入與撈取指派清單
// ==========================================
function normalizeEmail_(value) {
  return String(value || '').trim().toLowerCase();
}

function getHeaderMap_(headers) {
  var map = {};
  headers.forEach(function(header, index) {
    map[String(header).trim()] = index;
  });
  return map;
}

function getSupabaseConfig_() {
  var props = PropertiesService.getScriptProperties();
  return {
    url: props.getProperty('SUPABASE_URL') || SUPABASE_URL_DEFAULT,
    anonKey: props.getProperty('SUPABASE_ANON_KEY') || SUPABASE_ANON_KEY_DEFAULT,
    serviceRoleKey: props.getProperty('SUPABASE_SERVICE_ROLE_KEY')
  };
}

function callSupabaseRpc_(rpcName, body, bearerKey) {
  var config = getSupabaseConfig_();
  if (!bearerKey) throw new Error('Missing Supabase API key for RPC: ' + rpcName);

  var response = UrlFetchApp.fetch(config.url + '/rest/v1/rpc/' + rpcName, {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: bearerKey,
      Authorization: 'Bearer ' + bearerKey
    },
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true
  });

  var status = response.getResponseCode();
  var text = response.getContentText();
  if (status < 200 || status >= 300) {
    throw new Error('Supabase RPC ' + rpcName + ' failed (' + status + '): ' + text);
  }
  return text ? JSON.parse(text) : null;
}

function authorizeRootGasScopes() {
  UrlFetchApp.fetch('https://www.google.com/generate_204', {
    muteHttpExceptions: true
  });
  return true;
}

function verifyAdminPassword_(actorAccount, adminPassword) {
  var config = getSupabaseConfig_();
  var users = callSupabaseRpc_('login_admin', {
    p_email: actorAccount,
    p_password: adminPassword
  }, config.anonKey);

  if (!users || users.length < 1) {
    throw new Error('Admin password verification failed');
  }
  return users[0];
}

function updateInvestigatorProfileInSupabase_(data, profile) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('update_investigator_profile', {
    p_user_id: data.userId,
    p_actor_account: data.actorAccount,
    p_email: profile.email,
    p_name: profile.name,
    p_phone: profile.phone || '',
    p_languages: profile.languages || '',
    p_hakka_dialect: profile.hakka_dialect || '',
    p_life_area_1: profile.life_area_1 || '',
    p_survey_area_1: profile.survey_area_1 || '',
    p_life_area_2: profile.life_area_2 || '',
    p_survey_area_2: profile.survey_area_2 || '',
    p_life_area_3: profile.life_area_3 || '',
    p_survey_area_3: profile.survey_area_3 || ''
  }, config.serviceRoleKey);
}

function setInvestigatorActiveInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('set_investigator_active', {
    p_user_id: data.userId,
    p_is_active: data.isActive === true,
    p_actor_account: data.actorAccount
  }, config.serviceRoleKey);
}

function updateUserProfileInSheet_(data, profile) {
  if (!SHEET_ID) throw new Error('Missing script property: SHEET_ID');

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!sheet) throw new Error('Users sheet not found');

  var values = sheet.getDataRange().getValues();
  if (values.length < 1) throw new Error('Users sheet has no header row');

  var headers = values[0].map(function(header) {
    return String(header).trim();
  });
  var colMap = getHeaderMap_(headers);
  var missingHeaders = USER_PROFILE_HEADERS.filter(function(header) {
    return colMap[header] === undefined;
  });
  if (missingHeaders.length > 0) {
    throw new Error('Users sheet missing columns: ' + missingHeaders.join(', '));
  }

  var previousEmails = [
    data.previousEmail,
    data.previousAccount,
    profile.email
  ].map(normalizeEmail_).filter(Boolean);

  var rowIndex = -1;
  for (var r = 1; r < values.length; r++) {
    var rowEmail = normalizeEmail_(values[r][colMap.email]);
    if (previousEmails.indexOf(rowEmail) !== -1) {
      rowIndex = r;
      break;
    }
  }

  if (rowIndex === -1) {
    throw new Error('User not found in Users sheet: ' + previousEmails.join(' / '));
  }

  USER_PROFILE_HEADERS.forEach(function(header) {
    var value = profile[header] == null ? '' : String(profile[header]).trim();
    sheet.getRange(rowIndex + 1, colMap[header] + 1).setValue(value);
  });

  return rowIndex + 1;
}

function handleSetInvestigatorActive(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');
  var userId = String(data.userId || '').trim();
  var isActive = data.isActive === true;

  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }
  if (!userId) {
    throw new Error('User id is required');
  }

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = setInvestigatorActiveInSupabase_({
    userId: userId,
    isActive: isActive,
    actorAccount: actorAccount
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    userId: userId,
    isActive: isActive,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleUpdateUserProfile(data) {
  var profile = data.profile || {};
  var email = normalizeEmail_(profile.email);
  var name = String(profile.name || '').trim();
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Valid email is required');
  }
  if (!name) {
    throw new Error('Name is required');
  }
  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }

  var normalizedProfile = Object.assign({}, profile, {
    email: email,
    name: name
  });

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = updateInvestigatorProfileInSupabase_(data, normalizedProfile);
  var rowNumber = updateUserProfileInSheet_(data, normalizedProfile);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    row: rowNumber,
    email: email,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleLogin(data) {
  var account = data.account;
  var password = data.password;
  var ss = SpreadsheetApp.openById(SHEET_ID);
  
  var usersSheet = ss.getSheetByName('Users');
  var usersData = usersSheet.getDataRange().getValues();
  var userId = null;
  for (var i = 1; i < usersData.length; i++) {
    if (usersData[i][1] == account && usersData[i][2] == password) {
      userId = usersData[i][0];
      break;
    }
  }
  if (!userId) return ContentService.createTextOutput(JSON.stringify({ success: false, error: "帳號或密碼錯誤" })).setMimeType(ContentService.MimeType.JSON);
  
  var assignSheet = ss.getSheetByName('Assignments');
  var assignData = assignSheet.getDataRange().getValues();
  var assignedPlaceIds = [];
  for (var i = 1; i < assignData.length; i++) {
    if (assignData[i][0] == userId) assignedPlaceIds.push(assignData[i][1].toString());
  }
  
  var allPlaces = getAllPlacesData();
  var myPlaces = allPlaces.filter(function(place) { return assignedPlaceIds.indexOf(place.id) !== -1; });

  var recordsSheet = ss.getSheetByName('Records');
  var recordsData = recordsSheet.getDataRange().getValues();
  var recordsHeaders = recordsData[0];
  
  var idxRecPlaceId = recordsHeaders.indexOf('序號');
  var idxRecLang = recordsHeaders.indexOf('語言');
  var idxRecPhonetic = recordsHeaders.indexOf('音讀');
  var idxRecUrl = recordsHeaders.indexOf('錄音檔連結');
  var idxRecId = recordsHeaders.indexOf('錄音ID');
  var idxRecUploader = recordsHeaders.indexOf('上傳者ID');

  var uploadedRecords = [];
  if (idxRecPlaceId !== -1) {
    for (var i = 1; i < recordsData.length; i++) {
      uploadedRecords.push({
        placeId: recordsData[i][idxRecPlaceId].toString(),
        language: idxRecLang !== -1 ? recordsData[i][idxRecLang] : "",
        phonetic: idxRecPhonetic !== -1 ? recordsData[i][idxRecPhonetic] : "",
        url: idxRecUrl !== -1 ? recordsData[i][idxRecUrl] : "",
        recordId: idxRecId !== -1 ? recordsData[i][idxRecId] : "",
        uploaderId: idxRecUploader !== -1 ? recordsData[i][idxRecUploader] : ""
      });
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify({
    success: true, userId: userId, assignedPlaces: myPlaces, allPlaces: allPlaces, uploadedRecords: uploadedRecords
  })).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 🚀 處理錄音檔上傳 (支援任意格式)
// ==========================================
function handleUpload(data) {
  var base64Data = data.audioBase64;
  var filename = data.filename;
  var placeId = data.placeId;     
  var placeName = data.placeName;
  var uploaderId = data.userId || "未登入";
  var language = data.language || ""; 
  var phonetic = data.phonetic || ""; 
  
  var folder = DriveApp.getFolderById(FOLDER_ID);
  
  // 完美解析前端傳來的 Data URL (包含 mimeType)
  var splitBase = base64Data.split(',');
  var mimeType = splitBase[0].split(';')[0].replace('data:', ''); // 例如 "audio/mp3"
  var byteCharacters = Utilities.base64Decode(splitBase[1]);
  
  var blob = Utilities.newBlob(byteCharacters, mimeType, filename);
  var file = folder.createFile(blob);
  var fileUrl = file.getUrl();
  var recordId = Utilities.getUuid(); 
  
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var recordSheet = ss.getSheetByName('Records');
  recordSheet.appendRow([new Date(), uploaderId, placeId, placeName, language, phonetic, fileUrl, recordId]);
  
  return ContentService.createTextOutput(JSON.stringify({ 
    success: true, 
    fileUrl: fileUrl,
    recordData: { placeId: placeId, language: language, phonetic: phonetic, url: fileUrl, recordId: recordId, uploaderId: uploaderId }
  })).setMimeType(ContentService.MimeType.JSON);
}

// ==========================================
// 🚀 繞過 CORS：去 Drive 抓音檔並轉成 Base64 回傳
// ==========================================
function handleGetAudio(data) {
  try {
    var fileUrl = data.url;
    var fileIdMatch = fileUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!fileIdMatch) throw new Error("找不到檔案ID");
    
    var fileId = fileIdMatch[1];
    var file = DriveApp.getFileById(fileId);
    
    // 將檔案轉為 Base64 並保留真實的 MIME Type
    var blob = file.getBlob();
    var base64 = Utilities.base64Encode(blob.getBytes());
    var mimeType = file.getMimeType();
    
    // 組合成可直接放進 <audio src> 的 Data URL
    var dataUrl = "data:" + mimeType + ";base64," + base64;
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, dataUrl: dataUrl }))
                         .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

function handleSubmitFeedback(data) {
  var subject = data.subject == null ? '' : String(data.subject);
  var message = data.message == null ? '' : String(data.message);
  if (!subject.trim()) throw new Error('請填寫問題主旨');
  if (!message.trim()) throw new Error('請填寫問題內容');

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getFeedbackSheet_();
    var feedbackId = getNextFeedbackId_(sheet);
    var submittedAt = new Date();
    var investigatorName = data.investigatorName == null ? '' : String(data.investigatorName);
    var investigatorEmail = data.investigatorEmail == null ? '' : String(data.investigatorEmail);

    sheet.appendRow([feedbackId, investigatorName, investigatorEmail, submittedAt, subject, message, false]);
    var rowIndex = sheet.getLastRow();
    sheet.getRange(rowIndex, FEEDBACK_HEADERS.length).insertCheckboxes();
    sheet.getRange(rowIndex, FEEDBACK_HEADERS.length).setValue(false);

    notifyFeedbackChat_({
      id: feedbackId,
      investigatorName: investigatorName,
      subject: subject,
      submittedAt: submittedAt,
      spreadsheetUrl: sheet.getParent().getUrl()
    });

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      feedbackId: feedbackId,
      spreadsheetUrl: sheet.getParent().getUrl()
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function getFeedbackSheet_() {
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(FEEDBACK_SPREADSHEET_ID_PROPERTY);
  var spreadsheet = spreadsheetId
    ? SpreadsheetApp.openById(spreadsheetId)
    : SpreadsheetApp.create(FEEDBACK_SPREADSHEET_NAME);

  if (!spreadsheetId) {
    props.setProperty(FEEDBACK_SPREADSHEET_ID_PROPERTY, spreadsheet.getId());
  }

  var sheet = spreadsheet.getSheetByName(FEEDBACK_SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.getSheets()[0];
    sheet.setName(FEEDBACK_SHEET_NAME);
  }

  ensureFeedbackSheetHeaders_(sheet);
  return sheet;
}

function ensureFeedbackSheetHeaders_(sheet) {
  var currentHeaders = sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).getValues()[0];
  var emptyHeaders = currentHeaders.every(function(value) { return value === ''; });
  var headersMismatch = FEEDBACK_HEADERS.some(function(header, index) {
    return String(currentHeaders[index] || '') !== header;
  });

  if (emptyHeaders || headersMismatch) {
    sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setValues([FEEDBACK_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, FEEDBACK_HEADERS.length).setFontWeight('bold');
  }

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, FEEDBACK_HEADERS.length, sheet.getLastRow() - 1, 1).insertCheckboxes();
  }
}

function getNextFeedbackId_(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '001';

  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var maxId = 0;
  ids.forEach(function(row) {
    var parsed = parseInt(String(row[0] || '').replace(/\D/g, ''), 10);
    if (!isNaN(parsed) && parsed > maxId) maxId = parsed;
  });
  return ('000' + (maxId + 1)).slice(-3);
}

function notifyFeedbackChat_(feedback) {
  var webhookUrl = PropertiesService.getScriptProperties().getProperty(FEEDBACK_CHAT_WEBHOOK_URL_PROPERTY);
  if (!webhookUrl) return;

  var submittedAtText = Utilities.formatDate(feedback.submittedAt, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  var text = [
    'TopoNote 有新的問題回報',
    'ID：' + feedback.id,
    '調查員：' + (feedback.investigatorName || '未填'),
    '主旨：' + feedback.subject,
    '時間：' + submittedAtText,
    '請至問題回報 Sheet 查看完整內容：' + feedback.spreadsheetUrl
  ].join('\n');

  try {
    UrlFetchApp.fetch(webhookUrl, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
  } catch (err) {
    Logger.log('Feedback Chat notification failed: ' + err.message);
  }
}

function doOptions(e) { return ContentService.createTextOutput("OK"); }
