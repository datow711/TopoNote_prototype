// 從系統環境變數取得 ID
var FOLDER_ID = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
var SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
var FEEDBACK_SPREADSHEET_ID_PROPERTY = 'FEEDBACK_SPREADSHEET_ID';
var FEEDBACK_CHAT_WEBHOOK_URL_PROPERTY = 'CHAT_WEBHOOK';
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

function handleLinkAudioRecords(data) {
  var records = Array.isArray(data.records) ? data.records : [];
  if (records.length === 0) {
    throw new Error('No linked audio records provided');
  }

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var recordSheet = ss.getSheetByName('Records');
  if (!recordSheet) {
    throw new Error('Records sheet not found');
  }

  records.forEach(function(record) {
    var recordPlaceId = record.sourceId || resolveSourceIdForTask_(record.placeId) || record.placeId || '';
    recordSheet.appendRow([
      new Date(),
      record.uploaderId || '',
      recordPlaceId,
      record.placeName || '',
      record.language || '',
      record.phonetic || '',
      record.url || '',
      record.recordId || ''
    ]);
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    count: records.length
  })).setMimeType(ContentService.MimeType.JSON);
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
  var requestData = {};
  try {
    requestData = JSON.parse(e.postData.contents);
    var action = requestData.action;
    if (action === 'login') throw new Error('legacy_login_disabled: current app login uses Supabase RPCs.');
    if (action === 'upload') return handleUpload(requestData);
    if (action === 'linkAudioRecords') return handleLinkAudioRecords(requestData);
    if (action === 'getAudio') return handleGetAudio(requestData);
    if (action === 'submitFeedback') return handleSubmitFeedback(requestData);
    if (action === 'setInvestigatorActive') return handleSetInvestigatorActive(requestData);
    if (action === 'deleteInvestigatorUser') return handleDeleteInvestigatorUser(requestData);
    if (action === 'changeAdminPassword') return handleChangeAdminPassword(requestData);
    if (action === 'updateUserProfile') return handleUpdateUserProfile(requestData);
    if (action === 'unlinkAudioRecord') return handleUnlinkAudioRecord(requestData);
    if (action === 'getAnnouncements') return handleGetAnnouncements(requestData);
    if (action === 'markAnnouncementRead') return handleMarkAnnouncementRead(requestData);
    if (action === 'createAnnouncement') return handleCreateAnnouncement(requestData);
    throw new Error('未知的操作');
  } catch (error) {
    var isUpload = requestData.action === 'upload';
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      stage: error.stage || (isUpload ? 'VALIDATION' : 'UNKNOWN'),
      code: error.code || (isUpload ? 'UPLOAD_FAILED' : 'UNKNOWN_ERROR'),
      retryable: error.retryable !== false,
      requestId: requestData.requestId || requestData.clientUploadId || '',
      message: error.message || String(error),
      error: error.message || String(error)
    })).setMimeType(ContentService.MimeType.JSON);
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

function resolveSourceIdForTask_(placeId) {
  if (!placeId) return '';
  try {
    var config = getSupabaseConfig_();
    var url = config.url + '/rest/v1/app_tasks_view?select=source_id&task_id=eq.' + encodeURIComponent(placeId) + '&limit=1';
    var response = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: {
        apikey: config.anonKey,
        Authorization: 'Bearer ' + config.anonKey
      },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 300) return '';
    var rows = JSON.parse(response.getContentText() || '[]');
    return rows && rows[0] && rows[0].source_id ? String(rows[0].source_id) : '';
  } catch (e) {
    Logger.log('resolveSourceIdForTask_ failed: ' + e.message);
    return '';
  }
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

function deleteInvestigatorUserInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('delete_investigator_user', {
    p_user_id: data.userId,
    p_actor_account: data.actorAccount
  }, config.serviceRoleKey);
}

function changeAdminPasswordInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('change_admin_password', {
    p_actor_account: data.actorAccount,
    p_new_password: data.newPassword
  }, config.serviceRoleKey);
}

function softUnlinkAudioRecordInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('soft_unlink_audio_record', {
    p_audio_record_id: Number(data.recordId),
    p_actor_account: data.actorAccount,
    p_reason: data.reason || ''
  }, config.serviceRoleKey);
}

function createAnnouncementInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('create_announcement', {
    p_actor_account: data.actorAccount,
    p_title: data.title,
    p_body: data.body,
    p_target_account: data.targetAccount || ''
  }, config.serviceRoleKey);
}

function getAnnouncementsFromSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  var isAdmin = data.role === 'admin';
  return callSupabaseRpc_(isAdmin ? 'get_admin_announcements' : 'get_visible_announcements', isAdmin ? {
    p_actor_account: data.account,
    p_limit: data.limit || 100
  } : {
    p_account: data.account,
    p_limit: data.limit || 50
  }, config.serviceRoleKey);
}

function markAnnouncementReadInSupabase_(data) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) {
    throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  }

  return callSupabaseRpc_('mark_announcement_read', {
    p_announcement_id: data.announcementId,
    p_reader_account: data.readerAccount
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

function handleDeleteInvestigatorUser(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');
  var userId = String(data.userId || '').trim();

  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }
  if (!userId) {
    throw new Error('User id is required');
  }

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = deleteInvestigatorUserInSupabase_({
    userId: userId,
    actorAccount: actorAccount
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    userId: userId,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleChangeAdminPassword(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var currentPassword = String(data.currentPassword || '');
  var newPassword = String(data.newPassword || '');

  if (!actorAccount || !currentPassword) {
    throw new Error('Admin account and current password are required');
  }
  if (newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }
  if (newPassword === currentPassword) {
    throw new Error('New password must be different from current password');
  }

  verifyAdminPassword_(actorAccount, currentPassword);
  var supabaseResult = changeAdminPasswordInSupabase_({
    actorAccount: actorAccount,
    newPassword: newPassword
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleUnlinkAudioRecord(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');
  var recordId = Number(data.recordId);
  var reason = String(data.reason || '');

  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }
  if (!recordId || recordId < 1) {
    throw new Error('Valid audio record id is required');
  }

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = softUnlinkAudioRecordInSupabase_({
    recordId: recordId,
    actorAccount: actorAccount,
    reason: reason
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    supabase: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleGetAnnouncements(data) {
  var account = normalizeEmail_(data.account);
  var role = String(data.role || '') === 'admin' ? 'admin' : 'user';

  if (!account) {
    throw new Error('Account is required');
  }

  var announcements = getAnnouncementsFromSupabase_({
    account: account,
    role: role,
    limit: role === 'admin' ? 100 : 50
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    announcements: announcements || []
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleMarkAnnouncementRead(data) {
  var readerAccount = normalizeEmail_(data.readerAccount);
  var announcementId = String(data.announcementId || '').trim();

  if (!readerAccount) {
    throw new Error('Reader account is required');
  }
  if (!announcementId) {
    throw new Error('Announcement id is required');
  }

  var readResult = markAnnouncementReadInSupabase_({
    announcementId: announcementId,
    readerAccount: readerAccount
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    read: readResult && readResult[0] ? readResult[0] : null
  })).setMimeType(ContentService.MimeType.JSON);
}

function handleCreateAnnouncement(data) {
  var actorAccount = normalizeEmail_(data.actorAccount);
  var adminPassword = String(data.adminPassword || '');
  var title = String(data.title || '').trim();
  var body = String(data.body || '').trim();
  var targetAccount = normalizeEmail_(data.targetAccount);

  if (!actorAccount || !adminPassword) {
    throw new Error('Admin account and password are required');
  }
  if (!title) {
    throw new Error('Announcement title is required');
  }
  if (!body) {
    throw new Error('Announcement body is required');
  }

  verifyAdminPassword_(actorAccount, adminPassword);
  var supabaseResult = createAnnouncementInSupabase_({
    actorAccount: actorAccount,
    title: title,
    body: body,
    targetAccount: targetAccount
  });

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    announcement: supabaseResult && supabaseResult[0] ? supabaseResult[0] : null
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
// ==========================================
// 音檔上傳 payload 與 MIME 驗證
// ==========================================
var AUDIO_EXTENSION_BY_MIME_ = {
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'audio/3gpp': '3gp',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
  'audio/x-caf': 'caf'
};

function normalizeAudioMimeType_(mimeType) {
  var value = String(mimeType || '').split(';')[0].trim().toLowerCase();
  var aliases = {
    'audio/x-aac': 'audio/aac',
    'audio/vnd.dlna.adts': 'audio/aac',
    'audio/x-m4a': 'audio/mp4',
    'audio/x-wav': 'audio/wav'
  };
  return aliases[value] || value;
}

function resolveAudioMimeType_(fileName, mimeType) {
  var normalizedMimeType = normalizeAudioMimeType_(mimeType);
  if (normalizedMimeType.indexOf('audio/') === 0) return normalizedMimeType;
  var extension = String(fileName || '').split('.').pop().toLowerCase();
  var mimeTypesByExtension = {
    aac: 'audio/aac',
    amr: 'audio/amr',
    caf: 'audio/x-caf',
    m4a: 'audio/mp4',
    mp3: 'audio/mpeg',
    mp4: 'audio/mp4',
    oga: 'audio/ogg',
    ogg: 'audio/ogg',
    opus: 'audio/ogg',
    '3gp': 'audio/3gpp',
    '3gpp': 'audio/3gpp',
    wav: 'audio/wav',
    webm: 'audio/webm'
  };
  return mimeTypesByExtension[extension] || normalizedMimeType || 'application/octet-stream';
}

function getAudioExtension_(mimeType, fileName) {
  var normalizedMimeType = resolveAudioMimeType_(fileName || '', mimeType);
  if (AUDIO_EXTENSION_BY_MIME_[normalizedMimeType]) return AUDIO_EXTENSION_BY_MIME_[normalizedMimeType];
  var extensionMatch = String(fileName || '').match(/\.([a-z0-9]+)$/i);
  return extensionMatch ? extensionMatch[1].toLowerCase() : 'webm';
}

function uploadError_(code, message, stage, retryable) {
  var error = new Error(message);
  error.code = code;
  error.stage = stage || 'VALIDATION';
  error.retryable = retryable !== false;
  return error;
}

function isUuid_(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

function parseUploadDataUrl_(value) {
  var match = String(value || '').match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\r\n]+)$/i);
  if (!match) throw uploadError_('INVALID_DATA_URL', '音檔資料格式不正確', 'VALIDATION', false);
  var mimeType = normalizeAudioMimeType_(match[1]);
  var bytes;
  try {
    bytes = Utilities.base64Decode(match[2].replace(/\s/g, ''));
  } catch (error) {
    throw uploadError_('INVALID_BASE64', '音檔資料無法解碼', 'VALIDATION', false);
  }
  if (!bytes || bytes.length === 0) throw uploadError_('EMPTY_AUDIO', '音檔內容不可為空', 'VALIDATION', false);
  return { mimeType: mimeType, bytes: bytes };
}

function validateUploadPayload_(data) {
  data = data || {};
  var clientUploadId = String(data.clientUploadId || data.requestId || '').trim();
  if (!isUuid_(clientUploadId)) throw uploadError_('INVALID_CLIENT_UPLOAD_ID', 'clientUploadId 必須是 UUID', 'VALIDATION', false);
  var taskId = String(data.taskId || data.placeId || '').trim();
  if (!taskId) throw uploadError_('INVALID_TASK_ID', '缺少 taskId', 'VALIDATION', false);
  var recorderAccount = String(data.recorderAccount || data.userId || '').trim();
  if (!recorderAccount) throw uploadError_('INVALID_RECORDER_ACCOUNT', '缺少 recorderAccount', 'VALIDATION', false);
  var language = String(data.language || '').trim();
  if (!language) throw uploadError_('INVALID_LANGUAGE', '缺少錄音語言', 'VALIDATION', false);

  var parsed = parseUploadDataUrl_(data.audioBase64);
  var declaredMimeType = normalizeAudioMimeType_(data.mimeType || '');
  if (declaredMimeType.indexOf('audio/') === 0 && parsed.mimeType.indexOf('audio/') === 0 && declaredMimeType !== parsed.mimeType) {
    throw uploadError_('MIME_MISMATCH', '音檔 MIME 與 Data URL 不一致', 'VALIDATION', false);
  }
  var mimeType = declaredMimeType.indexOf('audio/') === 0
    ? declaredMimeType
    : resolveAudioMimeType_(data.originalFileName || data.filename || '', parsed.mimeType);
  if (mimeType.indexOf('audio/') !== 0) throw uploadError_('INVALID_MIME', '無法確認音檔 MIME', 'VALIDATION', false);

  return {
    clientUploadId: clientUploadId,
    taskId: taskId,
    sourceId: String(data.sourceId || '').trim(),
    placeName: String(data.placeName || '').trim(),
    language: language,
    phonetic: String(data.phonetic || '').trim(),
    note: data.note == null ? '' : String(data.note),
    annotations: data.annotations || {},
    respondentKey: String(data.respondentKey || '').trim(),
    recorderAccount: recorderAccount,
    recorderName: String(data.recorderName || recorderAccount).trim(),
    uploadSource: String(data.uploadSource || 'file').trim(),
    originalFileName: String(data.originalFileName || data.filename || 'audio').trim(),
    mimeType: mimeType,
    fileSizeBytes: parsed.bytes.length,
    bytes: parsed.bytes
  };
}

function supabaseServiceFetch_(path, options) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) throw uploadError_('MISSING_SERVICE_ROLE', 'Root GAS 缺少 Supabase service role key', 'DB', false);
  var fetchOptions = options || {};
  fetchOptions.headers = Object.assign({}, fetchOptions.headers || {}, {
    apikey: config.serviceRoleKey,
    Authorization: 'Bearer ' + config.serviceRoleKey,
    'Content-Type': 'application/json'
  });
  var response = UrlFetchApp.fetch(config.url + path, fetchOptions);
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) throw uploadError_('SUPABASE_REQUEST_FAILED', 'Supabase request failed (' + status + ')', 'DB', true);
  return response;
}

function getUploadTask_(job) {
  var rows = JSON.parse(supabaseServiceFetch_(
    '/rest/v1/final_tasks?select=id,source_id&id=eq.' + encodeURIComponent(job.taskId) + '&limit=1',
    { method: 'get', muteHttpExceptions: true }
  ).getContentText() || '[]');
  if (!rows.length) throw uploadError_('TASK_NOT_FOUND', '找不到對應地名任務', 'VALIDATION', false);
  return rows[0];
}

function findAudioRecordByClientUploadId_(clientUploadId) {
  var rows = JSON.parse(supabaseServiceFetch_(
    '/rest/v1/audio_records?select=*&client_upload_id=eq.' + encodeURIComponent(clientUploadId) + '&limit=1',
    { method: 'get', muteHttpExceptions: true }
  ).getContentText() || '[]');
  return rows.length ? rows[0] : null;
}

function insertAudioRecord_(job, task, fileUrl) {
  var body = {
    task_id: Number(task.id) || task.id,
    recorder_name: job.recorderName,
    audio_file_id: fileUrl,
    phonetic_reading: job.phonetic,
    language: job.language,
    note: job.note,
    client_upload_id: job.clientUploadId,
    recorder_account: job.recorderAccount,
    original_file_name: job.originalFileName,
    audio_mime_type: job.mimeType,
    file_size_bytes: job.fileSizeBytes,
    upload_source: job.uploadSource
  };
  var response = supabaseServiceFetch_('/rest/v1/audio_records', {
    method: 'post',
    payload: JSON.stringify(body),
    muteHttpExceptions: true,
    headers: { Prefer: 'return=representation' }
  });
  var rows = JSON.parse(response.getContentText() || '[]');
  if (!rows.length) throw uploadError_('DB_INSERT_EMPTY', 'Supabase 未回傳正式 audio_records', 'DB', true);
  return rows[0];
}

function buildSafeDriveFileName_(taskId, clientUploadId, mimeType) {
  return 'Record_' + String(taskId).replace(/[^0-9A-Za-z_-]/g, '_') + '_' + clientUploadId + '.' + getAudioExtension_(mimeType);
}

function trashNewDriveFile_(file) {
  try {
    if (file && typeof file.setTrashed === 'function') file.setTrashed(true);
  } catch (error) {
    Logger.log('Drive compensation failed');
  }
}

function ensureLegacyRecordsRow_(job, task, dbRecord) {
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName('Records');
  if (!sheet) throw new Error('Records sheet not found');
  var values = sheet.getDataRange().getValues();
  var headers = values.length ? values[0].map(function(value) { return String(value).trim(); }) : [];
  var idIndex = headers.indexOf('錄音ID');
  if (idIndex >= 0) {
    for (var index = 1; index < values.length; index++) {
      var existingId = String(values[index][idIndex] || '');
      if (existingId === job.clientUploadId || existingId === String(dbRecord.id)) return false;
    }
  }
  var recordPlaceId = task.source_id || job.sourceId || job.taskId;
  sheet.appendRow([
    new Date(),
    job.recorderAccount,
    recordPlaceId,
    job.placeName,
    job.language,
    job.phonetic,
    dbRecord.audio_file_id || '',
    job.clientUploadId
  ]);
  return true;
}

function buildUploadRecordData_(job, task, dbRecord, deduplicated, legacyLogPending) {
  return {
    id: dbRecord.id,
    clientUploadId: dbRecord.client_upload_id || job.clientUploadId,
    taskId: Number(dbRecord.task_id || task.id),
    sourceId: task.source_id || job.sourceId || '',
    language: dbRecord.language || job.language,
    phonetic: dbRecord.phonetic_reading || job.phonetic,
    url: dbRecord.audio_file_id || '',
    audioFileId: dbRecord.audio_file_id || '',
    recorderAccount: dbRecord.recorder_account || job.recorderAccount,
    recorderName: dbRecord.recorder_name || job.recorderName,
    createdAt: dbRecord.created_at || new Date().toISOString(),
    deduplicated: deduplicated === true,
    legacyLogPending: legacyLogPending === true
  };
}

function handleUpload(data) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw uploadError_('LOCK_TIMEOUT', '上傳工作忙碌中，請稍後使用相同 request ID 重試', 'LOCK', true);
  try {
    var job = validateUploadPayload_(data);
    var existing = findAudioRecordByClientUploadId_(job.clientUploadId);
    var task = getUploadTask_(job);
    if (existing) {
      if (String(existing.task_id || '') !== String(job.taskId)) {
        throw uploadError_('CLIENT_UPLOAD_ID_CONFLICT', 'clientUploadId 已經綁定其他 task', 'VALIDATION', false);
      }
      var pending = false;
      try {
        ensureLegacyRecordsRow_(job, task, existing);
      } catch (error) {
        pending = true;
        Logger.log(JSON.stringify({ stage: 'RECORDS', code: 'LEGACY_LOG_FAILED', clientUploadId: job.clientUploadId }));
      }
      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        recordData: buildUploadRecordData_(job, task, existing, true, pending)
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var fileName = buildSafeDriveFileName_(job.taskId, job.clientUploadId, job.mimeType);
    var blob = Utilities.newBlob(job.bytes, job.mimeType, fileName);
    var file;
    try {
      file = DriveApp.getFolderById(FOLDER_ID).createFile(blob);
    } catch (error) {
      throw uploadError_('DRIVE_UPLOAD_FAILED', 'Drive 建檔失敗', 'DRIVE', true);
    }
    var dbRecord;
    try {
      dbRecord = insertAudioRecord_(job, task, file.getUrl());
    } catch (error) {
      trashNewDriveFile_(file);
      throw error;
    }

    var legacyLogPending = false;
    try {
      ensureLegacyRecordsRow_(job, task, dbRecord);
    } catch (error) {
      legacyLogPending = true;
      Logger.log(JSON.stringify({ stage: 'RECORDS', code: 'LEGACY_LOG_FAILED', clientUploadId: job.clientUploadId }));
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      recordData: buildUploadRecordData_(job, task, dbRecord, false, legacyLogPending)
    })).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
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
    var fileName = file.getName();
    mimeType = resolveAudioMimeType_(fileName, mimeType);
    var dataUrl = "data:" + mimeType + ";base64," + base64;
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      dataUrl: dataUrl,
      fileName: fileName,
      mimeType: mimeType
    }))
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
      investigatorEmail: investigatorEmail,
      subject: subject,
      message: message,
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
  var sender = feedback.investigatorName || feedback.investigatorEmail || '未填';
  if (feedback.investigatorName && feedback.investigatorEmail) {
    sender += ' <' + feedback.investigatorEmail + '>';
  }
  var messageText = feedback.message || '';
  if (feedback.subject) {
    messageText = '主旨：' + feedback.subject + '\n' + messageText;
  }
  var text = [
    '來信者：' + sender,
    '來信時間：' + submittedAtText,
    '訊息內容：' + messageText
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
var SUPABASE_AUTH_MIGRATION_PASSWORD_PROPERTY = 'SUPABASE_AUTH_MIGRATION_PASSWORD';
var SUPABASE_AUTH_MIGRATION_CONFIRM_PROPERTY = 'SUPABASE_AUTH_MIGRATION_CONFIRM';
var SUPABASE_AUTH_MIGRATION_EMAIL_MAP_PROPERTY = 'SUPABASE_AUTH_MIGRATION_EMAIL_MAP_JSON';
var SUPABASE_AUTH_MIGRATION_SELECTOR_PROPERTY = 'SUPABASE_AUTH_MIGRATION_SELECTOR';
var SUPABASE_AUTH_MIGRATION_PRIVILEGED_ROLES_ = ['admin', 'audio_assessor', 'proofreader'];
var SUPABASE_AUTH_MIGRATION_CONFIRM_VALUE = 'I_UNDERSTAND_SHARED_PASSWORD';
var SUPABASE_AUTH_ADMIN_PAGE_SIZE_ = 1000;

function previewAuthUserMigration() {
  return runAuthUserMigration_(true);
}

function migrateInvestigatorsToSupabaseAuth() {
  return runAuthUserMigration_(false);
}

function previewSingleAuthUserMigration(accountOrId) {
  var selector = String(accountOrId || '').trim() || getAuthMigrationSelector_();
  return runAuthUserMigration_(true, selector);
}

function migrateSingleInvestigatorToSupabaseAuth(accountOrId) {
  var selector = String(accountOrId || '').trim() || getAuthMigrationSelector_();
  return runAuthUserMigration_(false, selector);
}

function previewPrivilegedAuthUserMigration() {
  return runAuthUserMigration_(true, null, true);
}

function migratePrivilegedInvestigatorsToSupabaseAuth() {
  return runAuthUserMigration_(false, null, true);
}

function getAuthMigrationSelector_() {
  var selector = PropertiesService.getScriptProperties().getProperty(SUPABASE_AUTH_MIGRATION_SELECTOR_PROPERTY) || '';
  if (!selector.trim()) {
    throw new Error('Set SUPABASE_AUTH_MIGRATION_SELECTOR to an account or investigator id first.');
  }
  return selector.trim();
}

function runAuthUserMigration_(dryRun, selector, privilegedOnly) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(5000)) {
    throw new Error('Auth migration is already running.');
  }

  try {
    var props = PropertiesService.getScriptProperties();
    var password = props.getProperty(SUPABASE_AUTH_MIGRATION_PASSWORD_PROPERTY) || '';
    if (!dryRun) {
      if (password.length < 8 || password.length > 1024) {
        throw new Error('Set SUPABASE_AUTH_MIGRATION_PASSWORD (8-1024 characters) first.');
      }
      if (props.getProperty(SUPABASE_AUTH_MIGRATION_CONFIRM_PROPERTY) !== SUPABASE_AUTH_MIGRATION_CONFIRM_VALUE) {
        throw new Error('Set SUPABASE_AUTH_MIGRATION_CONFIRM to the exact confirmation value first.');
      }
    }

    var allRows = fetchActiveInvestigatorsForAuthMigration_();
    var rows = privilegedOnly
      ? selectPrivilegedAuthMigrationRows_(allRows)
      : selectAuthMigrationRows_(allRows, selector);
    var authUsers = fetchAllSupabaseAuthUsers_();
    var result = {
      dryRun: dryRun,
      total: rows.length,
      ready: 0,
      wouldCreate: 0,
      wouldReset: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      rows: []
    };
    var authById = {};
    var authByEmail = {};
    var dbAuthOwner = {};
    var emailOwner = {};
    var emailMap = getAuthMigrationEmailMap_();

    authUsers.forEach(function(user) {
      if (user && user.id) authById[String(user.id)] = user;
      var authEmail = normalizeEmail_(user && user.email);
      if (authEmail) authByEmail[authEmail] = user;
    });
    allRows.forEach(function(row) {
      var linkedId = String(row.auth_user_id || '').trim();
      if (linkedId && !dbAuthOwner[linkedId]) dbAuthOwner[linkedId] = String(row.id);
    });

    allRows.forEach(function(row) {
      var targetEmail = resolveAuthMigrationEmail_(row, emailMap);
      if (validAuthMigrationEmail_(targetEmail)) {
        if (!emailOwner[targetEmail]) emailOwner[targetEmail] = {};
        emailOwner[targetEmail][String(row.id)] = true;
      }
    });

    rows.forEach(function(row) {
      var account = String(row.account || '').trim();
      var targetEmail = resolveAuthMigrationEmail_(row, emailMap);
      var item = {
        id: String(row.id || ''),
        account: account,
        authEmail: targetEmail,
        status: 'pending'
      };

      if (!validAuthMigrationEmail_(targetEmail)) {
        item.status = 'skipped';
        item.reason = 'invalid_auth_email_needs_mapping';
        result.skipped++;
        result.rows.push(item);
        return;
      }
      var emailOwners = emailOwner[targetEmail] || {};
      var hasOtherEmailOwner = Object.keys(emailOwners).some(function(ownerId) {
        return ownerId !== String(row.id);
      });
      if (hasOtherEmailOwner) {
        item.status = 'failed';
        item.reason = 'duplicate_auth_email_mapping';
        result.failed++;
        result.rows.push(item);
        return;
      }
      var linkedId = String(row.auth_user_id || '').trim();
      if (linkedId && dbAuthOwner[linkedId] !== String(row.id)) {
        item.status = 'failed';
        item.reason = 'auth_user_id_already_linked';
        result.failed++;
        result.rows.push(item);
        return;
      }

      try {
        var authUser = linkedId ? authById[linkedId] : null;
        if (linkedId && !authUser) {
          item.status = 'failed';
          item.reason = 'linked_auth_user_not_found';
          result.failed++;
          result.rows.push(item);
          return;
        }
        if (!authUser) authUser = authByEmail[targetEmail] || null;
        if (authUser && normalizeEmail_(authUser.email) !== targetEmail) {
          item.status = 'failed';
          item.reason = 'auth_email_does_not_match_mapping';
          result.failed++;
          result.rows.push(item);
          return;
        }
        if (authUser && dbAuthOwner[String(authUser.id)] && dbAuthOwner[String(authUser.id)] !== String(row.id)) {
          item.status = 'failed';
          item.reason = 'auth_user_already_linked_to_another_investigator';
          result.failed++;
          result.rows.push(item);
          return;
        }

        result.ready++;
        if (authUser) {
          result.wouldReset++;
          item.action = dryRun ? 'would_reset_password_and_link' : 'reset_password_and_link';
        } else {
          result.wouldCreate++;
          item.action = dryRun ? 'would_create_and_link' : 'create_and_link';
        }

        if (!dryRun) {
          if (!authUser) {
            authUser = callSupabaseAuthAdmin_('post', '/auth/v1/admin/users', {
              email: targetEmail,
              password: password,
              email_confirm: true,
              user_metadata: {
                full_name: String(row.user_name || row.name || ''),
                account: account
              }
            });
            if (!authUser || !authUser.id) throw new Error('Auth user creation returned no id.');
            authById[String(authUser.id)] = authUser;
            authByEmail[targetEmail] = authUser;
            dbAuthOwner[String(authUser.id)] = String(row.id);
          } else {
            callSupabaseAuthAdmin_('put', '/auth/v1/admin/users/' + encodeURIComponent(String(authUser.id)), {
              password: password
            });
          }
          updateInvestigatorAuthLink_(row.id, authUser.id, targetEmail);
          result.completed++;
          item.status = 'completed';
          item.authUserId = String(authUser.id);
        } else {
          item.status = 'ready';
        }
      } catch (error) {
        item.status = 'failed';
        item.reason = String(error && error.message || 'migration_failed');
        result.failed++;
      }
      result.rows.push(item);
    });

    Logger.log(JSON.stringify(result));
    return result;
  } finally {
    lock.releaseLock();
  }
}

function getAuthMigrationEmailMap_() {
  var raw = PropertiesService.getScriptProperties().getProperty(SUPABASE_AUTH_MIGRATION_EMAIL_MAP_PROPERTY) || '';
  if (!raw.trim()) return {};
  var mapping;
  try {
    mapping = JSON.parse(raw);
  } catch (_error) {
    throw new Error('SUPABASE_AUTH_MIGRATION_EMAIL_MAP_JSON is not valid JSON.');
  }
  if (!mapping || Array.isArray(mapping) || typeof mapping !== 'object') {
    throw new Error('SUPABASE_AUTH_MIGRATION_EMAIL_MAP_JSON must be an object.');
  }
  return mapping;
}

function resolveAuthMigrationEmail_(row, mapping) {
  var rowId = String(row.id || '');
  var account = String(row.account || '');
  return normalizeEmail_(
    mapping[rowId] ||
    mapping[account] ||
    row.auth_login_email ||
    row.email
  );
}

function validAuthMigrationEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function selectAuthMigrationRows_(rows, selector) {
  if (selector === undefined || selector === null || String(selector).trim() === '') return rows;
  var needle = String(selector).trim();
  var matches = rows.filter(function(row) {
    return String(row.id || '').trim() === needle || String(row.account || '').trim() === needle;
  });
  if (matches.length === 0) {
    throw new Error('No active investigator matches account or id: ' + needle);
  }
  if (matches.length > 1) {
    throw new Error('Selector matches multiple active investigators: ' + needle);
  }
  return matches;
}

function selectPrivilegedAuthMigrationRows_(rows) {
  return rows.filter(function(row) {
    var role = String(row.role || '').trim().toLowerCase();
    return SUPABASE_AUTH_MIGRATION_PRIVILEGED_ROLES_.indexOf(role) >= 0;
  });
}

function fetchActiveInvestigatorsForAuthMigration_() {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  var url = config.url +
    '/rest/v1/investigators?select=id,account,user_name,name,role,email,auth_login_email,auth_user_id,is_active' +
    '&is_active=eq.true&order=id&limit=1000';
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey
    },
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Investigator roster read failed (' + status + ').');
  }
  return JSON.parse(response.getContentText() || '[]');
}

function fetchAllSupabaseAuthUsers_() {
  var users = [];
  var page = 1;
  var pageSize = SUPABASE_AUTH_ADMIN_PAGE_SIZE_;
  while (page <= 100) {
    var payload = callSupabaseAuthAdmin_(
      'get',
      '/auth/v1/admin/users?page=' + page + '&per_page=' + pageSize
    );
    var pageUsers = payload && Array.isArray(payload.users) ? payload.users : [];
    users = users.concat(pageUsers);
    if (pageUsers.length < pageSize) return users;
    page++;
  }
  throw new Error('Auth user pagination exceeded the safety limit.');
}

function callSupabaseAuthAdmin_(method, path, payload) {
  var config = getSupabaseConfig_();
  if (!config.serviceRoleKey) throw new Error('Missing script property: SUPABASE_SERVICE_ROLE_KEY');
  var options = {
    method: method,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey
    },
    muteHttpExceptions: true
  };
  if (payload !== undefined) {
    options.contentType = 'application/json';
    options.payload = JSON.stringify(payload);
  }
  var response = UrlFetchApp.fetch(config.url + path, options);
  var status = response.getResponseCode();
  var text = response.getContentText() || '';
  if (status < 200 || status >= 300) {
    throw new Error('Supabase Auth admin request failed (' + status + ').');
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch (_error) {
    return {};
  }
}

function updateInvestigatorAuthLink_(investigatorId, authUserId, authEmail) {
  var config = getSupabaseConfig_();
  var url = config.url + '/rest/v1/investigators?id=eq.' + encodeURIComponent(String(investigatorId));
  var response = UrlFetchApp.fetch(url, {
    method: 'patch',
    contentType: 'application/json',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: 'Bearer ' + config.serviceRoleKey,
      Prefer: 'return=minimal'
    },
    payload: JSON.stringify({
      auth_user_id: authUserId,
      auth_login_email: authEmail
    }),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error('Investigator Auth link update failed (' + status + ').');
  }
}
