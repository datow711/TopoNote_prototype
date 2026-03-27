// ⚠️ 請替換成你最新部署的 Google Apps Script 網址
let state = {
    userId: "", assignedPlaces: [], allPlaces: [], uploadedRecords: [], 
    currentTab: 'assigned', selectedPlace: null, selectedType: ""
    selectedStatus: "all" // 新增：預設顯示全部狀態
};

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let uploadedFileName = ""; // 用來記錄上傳檔案的真實檔名

async function login() {
    const acc = document.getElementById('account').value;
    const pwd = document.getElementById('password').value;
    const loginBtn = document.getElementById('login-btn');
    
    if (!acc || !pwd) return alert("請輸入帳號與密碼！");
    loginBtn.innerText = "驗證中..."; loginBtn.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST', body: JSON.stringify({ action: 'login', account: acc, password: pwd })
        });
        const result = await response.json();
        if (result.success) {
            state.userId = result.userId; state.assignedPlaces = result.assignedPlaces;
            state.allPlaces = result.allPlaces; state.uploadedRecords = result.uploadedRecords || []; 
            
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('app-section').classList.remove('hidden');
            initFilters(); switchTab('assigned');
        } else {
            document.getElementById('login-status').innerText = "❌ " + result.error;
            loginBtn.innerText = "登入系統"; loginBtn.disabled = false;
        }
    } catch (error) {
        document.getElementById('login-status').innerText = "❌ 連線錯誤";
        loginBtn.innerText = "登入系統"; loginBtn.disabled = false;
    }
}

// --- 以下為 UI 切換與篩選器邏輯 (保持原樣) ---
function switchTab(tab) {
    state.currentTab = tab;
    document.getElementById('tab-assigned').classList.toggle('active', tab === 'assigned');
    document.getElementById('tab-other').classList.toggle('active', tab === 'other');
    document.getElementById('search-box').value = ""; applyFilters();
}
function initFilters() {
    const counties = [...new Set(state.allPlaces.map(p => p.county).filter(Boolean))];
    const types = [...new Set(state.allPlaces.map(p => p.type || p.Type).filter(Boolean))];
    
    const countySelect = document.getElementById('county-filter');
    counties.forEach(c => countySelect.add(new Option(c, c)));
    
    const typeContainer = document.getElementById('type-container');
    typeContainer.innerHTML = `<div class="type-chip selected" onclick="selectType('', this)">全部類別</div>`;
    
    types.forEach(t => { 
        // 🚀 攔截超長名字，但保留原始參數 t，確保篩選時能對應到真實資料
        let displayText = t;
        if (t === "具有地標意義公共設施") {
            displayText = "公共設施";
        }
        typeContainer.innerHTML += `<div class="type-chip" onclick="selectType('${t}', this)">${displayText}</div>`; 
    });
}
function updateTowns() {
    const county = document.getElementById('county-filter').value;
    const townSelect = document.getElementById('town-filter');
    townSelect.innerHTML = '<option value="">所有鄉鎮</option>';
    if (county) {
        const towns = [...new Set(state.allPlaces.filter(p => p.county === county).map(p => p.town).filter(Boolean))];
        towns.forEach(t => townSelect.add(new Option(t, t)));
    }
}
function selectType(type, element) {
    state.selectedType = type;
    document.querySelectorAll('.type-chip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected'); applyFilters();
}

function selectStatus(status, element) {
    state.selectedStatus = status;
    document.querySelectorAll('.status-chip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected'); 
    applyFilters();
}

function applyFilters() {
    const keyword = document.getElementById('search-box').value.toLowerCase();
    const county = document.getElementById('county-filter').value;
    const town = document.getElementById('town-filter').value;
    const type = state.selectedType;
    const status = state.selectedStatus; // 'all', 'recorded', 'unrecorded'
    
    let data = state.currentTab === 'assigned' ? state.assignedPlaces : state.allPlaces;

    const filtered = data.filter(place => {
        const matchK = (place.placeName && place.placeName.toLowerCase().includes(keyword)) || (place.id && String(place.id).includes(keyword));
        const matchC = county ? place.county === county : true;
        const matchTw = town ? place.town === town : true;
        const pType = place.type || place.Type; 
        const matchTy = type ? pType === type : true;
        
        // 🚀 新增：判斷該地名是否已有錄音
        let matchStatus = true;
        if (status !== 'all') {
            const hasRecord = state.uploadedRecords.some(r => String(r.placeId) === String(place.id));
            if (status === 'recorded') matchStatus = hasRecord;
            if (status === 'unrecorded') matchStatus = !hasRecord;
        }

        return matchK && matchC && matchTw && matchTy && matchStatus;
    });
    renderPlaceList(filtered);
}

function renderPlaceList(places) {
    const container = document.getElementById('place-list-container');
    container.innerHTML = "";
    if (places.length === 0) return container.innerHTML = "<div style='padding:20px; text-align:center; color:#999;'>沒有符合條件的地名</div>";

    places.forEach(place => {
        const item = document.createElement('div');
        item.className = 'place-item';
        if (state.selectedPlace && state.selectedPlace.id === place.id) item.classList.add('active');
        
        const typeName = place.type || place.Type || '無類別';
        const count = state.uploadedRecords.filter(r => String(r.placeId) === String(place.id)).length;
        const badge = count > 0 ? `<span style="background:#2ecc71; color:white;">已錄音: ${count}</span>` : '';

        item.innerHTML = `
            <div class="place-info">
                <div class="place-title">${place.placeName}</div>
                <div class="place-meta"><span>ID: ${place.id}</span><span>${place.county} ${place.town}</span><span>${typeName}</span>${badge}</div>
            </div><div>👉</div>
        `;
        item.onclick = () => openRecordingUI(place, item);
        container.appendChild(item);
    });
}
function openRecordingUI(place, element) {
    state.selectedPlace = place;
    document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    const recSection = document.getElementById('recording-section');
    recSection.style.display = 'block';
    document.getElementById('selected-place-title').innerText = `📍 正在處理：${place.placeName}`;
    
    resetRecordingState(); renderHistoryList(place.id); 
    recSection.scrollIntoView({ behavior: 'smooth' });
}

// ==========================================
// 🚀 渲染歷史紀錄與 Base64 隨選播放 (終極 CORS 解法)
// ==========================================
function renderHistoryList(placeId) {
    const historyList = document.getElementById('history-list');
    const records = state.uploadedRecords.filter(r => String(r.placeId) === String(placeId));
    
    if (records.length === 0) return historyList.innerHTML = "<div style='color:#999; text-align:center;'>尚未有任何錄音。</div>";
    
    historyList.innerHTML = records.map(r => `
        <div class="history-item">
            <div class="history-meta"><span>🏷️ ${r.language}</span><span>👤 ${r.uploaderId}</span></div>
            <div style="margin-bottom: 5px;">✏️ 音標：${r.phonetic || '(未填寫)'}</div>
            
            <div id="player-${r.recordId}" style="margin-top: 10px;">
                <button class="play-btn" onclick="fetchAndPlayAudio('${r.url}', '${r.recordId}')">
                    ▶️ 點此從雲端載入音檔並播放
                </button>
                <span style="font-size:12px; margin-left:10px;"><a href="${r.url}" target="_blank">🔗 開新視窗</a></span>
            </div>
        </div>
    `).join('');
}

// 呼叫 GAS 將檔案轉成 Base64
async function fetchAndPlayAudio(driveUrl, recordId) {
    const container = document.getElementById(`player-${recordId}`);
    container.innerHTML = "<span style='color:#e67e22; font-weight:bold;'>⏳ 檔案載入與轉碼中，請稍候 (約需 2~5 秒)...</span>";
    
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getAudio', url: driveUrl })
        });
        const result = await response.json();
        
        if (result.success) {
            // 完美播放！不再被 Google 擋住！
            container.innerHTML = `<audio src="${result.dataUrl}" controls autoplay style="width: 100%; height: 35px;"></audio>`;
        } else {
            container.innerHTML = `<span style="color:red;">❌ 載入失敗：${result.error}</span>`;
        }
    } catch (error) {
        container.innerHTML = `<span style="color:red;">❌ 網路連線錯誤</span>`;
    }
}

// ==========================================
// 🚀 檔案上傳與錄音處理邏輯
// ==========================================
function resetRecordingState() {
    document.getElementById('phonetic-input').value = "";
    document.getElementById('audio-playback').style.display = 'none';
    document.getElementById('upload-btn').style.display = 'none';
    document.getElementById('status').innerText = "";
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('file-btn').style.display = 'block';
    document.getElementById('audio-file-input').value = ""; // 清空上傳器
    audioBlob = null;
    uploadedFileName = "";
}

// 處理選擇本地檔案 (支援 m4a, mp3, aac...)
function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    // 驗證是否為音檔 (部分通訊軟體的檔案格式不完整，這裡放寬限制)
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|m4a|wav|aac|ogg|mp4)$/i)) {
        alert("請上傳正確的音訊檔案 (支援 mp3, m4a 等格式)！");
        return;
    }

    audioBlob = file;
    uploadedFileName = file.name; // 紀錄真實檔名，例如 "Line_Audio.m4a"
    
    // 預覽播放
    document.getElementById('audio-playback').src = URL.createObjectURL(file);
    document.getElementById('audio-playback').style.display = 'block';
    
    // 切換按鈕狀態
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('file-btn').style.display = 'none';
    document.getElementById('upload-btn').style.display = 'block';
    
    document.getElementById('status').innerText = `✅ 已選取檔案：${file.name}`;
    document.getElementById('status').style.color = "green";
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
        mediaRecorder.onstop = () => {
            audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            uploadedFileName = ""; // 網頁錄音固定用 webm
            document.getElementById('audio-playback').src = URL.createObjectURL(audioBlob);
            document.getElementById('audio-playback').style.display = 'block';
            document.getElementById('upload-btn').style.display = 'block';
        };

        mediaRecorder.start();
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('file-btn').style.display = 'none';
        document.getElementById('stop-btn').style.display = 'block';
        document.getElementById('status').innerText = "🔴 現場錄音中...";
        document.getElementById('status').style.color = "red";
    } catch (err) { alert("無法存取麥克風！"); }
}

function stopRecording() {
    mediaRecorder.stop();
    document.getElementById('stop-btn').style.display = 'none';
    document.getElementById('status').innerText = "✅ 錄音完成，可填寫音標後上傳。";
    document.getElementById('status').style.color = "green";
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
}

function uploadAudio() {
    if (!audioBlob || !state.selectedPlace) return;

    const uploadBtn = document.getElementById('upload-btn');
    const statusDiv = document.getElementById('status');
    const lang = document.querySelector('input[name="lang"]:checked').value;
    const phonetic = document.getElementById('phonetic-input').value;

    uploadBtn.innerText = "⏳ 轉碼與上傳中..."; uploadBtn.disabled = true;

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async function() {
        // 如果是檔案上傳，保留原副檔名；如果是網頁錄音，副檔名給 .webm
        const extension = uploadedFileName ? uploadedFileName.split('.').pop() : "webm";
        const finalFileName = `Record_${state.userId}_${state.selectedPlace.id}_${new Date().getTime()}.${extension}`;

        const payload = {
            action: 'upload',
            userId: state.userId, placeId: String(state.selectedPlace.id), placeName: state.selectedPlace.placeName,
            filename: finalFileName, audioBase64: reader.result, language: lang, phonetic: phonetic
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.success) {
                statusDiv.innerText = `🎉 上傳成功！`; statusDiv.style.color = "blue";
                if(result.recordData) {
                    state.uploadedRecords.push(result.recordData);
                    renderHistoryList(state.selectedPlace.id); applyFilters(); 
                }
                resetRecordingState();
            } else throw new Error(result.error);
        } catch (error) {
            statusDiv.innerText = "❌ 上傳失敗：" + error.message; statusDiv.style.color = "red";
        } finally {
            uploadBtn.innerText = "⬆️ 上傳並準備下一筆"; uploadBtn.disabled = false;
        }
    };
}