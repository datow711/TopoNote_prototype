// 從系統環境變數取得 ID
var FOLDER_ID = PropertiesService.getScriptProperties().getProperty('FOLDER_ID');
var SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

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

    if (action === 'login') return handleLogin(requestData);
    if (action === 'upload') return handleUpload(requestData);
    if (action === 'getAudio') return handleGetAudio(requestData); // 🚀 新增讀取音檔 API

    throw new Error("未知的操作");
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}

// ==========================================
// 處理登入與撈取指派清單
// ==========================================
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

function doOptions(e) { return ContentService.createTextOutput("OK"); }