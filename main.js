// 註冊 Service Worker (PWA 必備)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker 註冊成功! PWA 已就緒。'))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    });
}

let state = {
    userId: "", assignedPlaces: [], allPlaces: [], uploadedRecords: [], 
    currentTab: 'assigned', 
    selectedPlace: null, 
    selectedType: "",
    selectedStatus: "all" 
};

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let uploadedFileName = ""; 

// ==========================================
// 🌟 核心修改 1：登入與 Supabase 資料極速載入
// ==========================================
async function login() {
    const acc = document.getElementById('account').value;
    const pwd = document.getElementById('password').value;
    const loginBtn = document.getElementById('login-btn');
    
    if (!acc || !pwd) return alert("請輸入帳號與密碼！");
    loginBtn.innerText = "驗證密碼中..."; loginBtn.disabled = true;

    try {
        // 1. 依然透過 GAS 驗證密碼
        const response = await fetch(API_URL, {
            method: 'POST', body: JSON.stringify({ action: 'login', account: acc, password: pwd })
        });
        const result = await response.json();
        
        if (result.success) {
            state.userId = result.userId; 
            loginBtn.innerText = "載入資料庫中...";

            // 2. 密碼正確後，直接從 Supabase 抓資料 (取代原本 GAS 吐出來的資料)
            await loadDataFromSupabase(state.userId);
            
            // 3. 切換畫面
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('app-section').classList.remove('hidden');
            initFilters(); 
            switchTab('assigned');
        } else {
            document.getElementById('login-status').innerText = "❌ " + result.error;
            loginBtn.innerText = "登入系統"; loginBtn.disabled = false;
        }
    } catch (error) {
        document.getElementById('login-status').innerText = "❌ 連線錯誤";
        loginBtn.innerText = "登入系統"; loginBtn.disabled = false;
    }
}

// 🌟 新增函數：專門負責向 Supabase 要資料並轉換格式
async function loadDataFromSupabase(userName) {
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        };

        // 併發請求：同時抓取「任務清單」與「歷史錄音」
        const [tasksRes, recordsRes] = await Promise.all([
            fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_tasks_view?select=*`, { headers }),
            fetch(`${CONFIG.SUPABASE_URL}/rest/v1/audio_records?select=*`, { headers })
        ]);

        const tasksData = await tasksRes.json();
        const recordsData = await recordsRes.json();

        // 將 Supabase 格式 (snake_case) 轉換為你原本 App 適用的格式 (camelCase)
        state.assignedPlaces = tasksData
            .filter(t => t.assigned_to === userName)
            .map(t => ({ id: t.task_id, placeName: t.place_name, county: t.county, town: t.town, type: t.type }));
            
        state.allPlaces = tasksData
            .filter(t => t.assigned_to !== userName)
            .map(t => ({ id: t.task_id, placeName: t.place_name, county: t.county, town: t.town, type: t.type }));

        state.uploadedRecords = recordsData.map(r => ({
            recordId: r.id,
            placeId: r.task_id,
            language: r.language,
            uploaderId: r.recorder_name,
            phonetic: r.phonetic_reading,
            url: r.audio_file_id 
        }));
    } catch (err) {
        console.error("Supabase 載入失敗", err);
        alert("資料庫連線異常，請重新整理網頁。");
    }
}

// ==========================================
// 以下為 UI 切換與篩選器邏輯 (完全保持原樣，因為資料格式已對接)
// ==========================================
function switchTab(tab) {
    state.currentTab = tab;
    document.getElementById('tab-assigned').classList.toggle('active', tab === 'assigned');
    document.getElementById('tab-other').classList.toggle('active', tab === 'other');
    document.getElementById('search-box').value = ""; applyFilters();
}
function initFilters() {
    const counties = [...new Set(state.allPlaces.concat(state.assignedPlaces).map(p => p.county).filter(Boolean))];
    const types = [...new Set(state.allPlaces.concat(state.assignedPlaces).map(p => p.type || p.Type).filter(Boolean))];
    
    const countySelect = document.getElementById('county-filter');
    counties.forEach(c => countySelect.add(new Option(c, c)));
    
    const typeContainer = document.getElementById('type-container');
    typeContainer.innerHTML = `<div class="type-chip selected" onclick="selectType('', this)">全部類別</div>`;
    
    types.forEach(t => { 
        let displayText = t;
        if (t === "具有地標意義公共設施") displayText = "公共設施";
        typeContainer.innerHTML += `<div class="type-chip" onclick="selectType('${t}', this)">${displayText}</div>`; 
    });
}
function updateTowns() {
    const county = document.getElementById('county-filter').value;
    const townSelect = document.getElementById('town-filter');
    townSelect.innerHTML = '<option value="">所有鄉鎮</option>';
    if (county) {
        const towns = [...new Set(state.allPlaces.concat(state.assignedPlaces).filter(p => p.county === county).map(p => p.town).filter(Boolean))];
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
    element.classList.add('selected'); applyFilters();
}

function applyFilters() {
    const keyword = document.getElementById('search-box').value.toLowerCase();
    const county = document.getElementById('county-filter').value;
    const town = document.getElementById('town-filter').value;
    const type = state.selectedType;
    const status = state.selectedStatus; 
    
    let data = state.currentTab === 'assigned' ? state.assignedPlaces : state.allPlaces;

    const filtered = data.filter(place => {
        const matchK = (place.placeName && place.placeName.toLowerCase().includes(keyword)) || (place.id && String(place.id).includes(keyword));
        const matchC = county ? place.county === county : true;
        const matchTw = town ? place.town === town : true;
        const pType = place.type || place.Type; 
        const matchTy = type ? pType === type : true;
        
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
        
        let typeName = place.type || place.Type || '無類別';
        if (typeName === "具有地標意義公共設施") typeName = "公共設施";
        
        const count = state.uploadedRecords.filter(r => String(r.placeId) === String(place.id)).length;
        const badge = count > 0 ? `<span style="background:#2ecc71; color:white;">已錄音: ${count}</span>` : '';

        item.innerHTML = `
            <div class="place-info">
                <div class="place-title">${place.placeName}</div>
                <div class="place-meta"><span>ID: ${place.id}</span><span>${place.county} ${place.town}</span><span>${typeName}</span>${badge}</div>
            </div>
            <div class="expand-icon">▶</div>
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

function renderHistoryList(placeId) {
    const historyList = document.getElementById('history-list');
    const records = state.uploadedRecords.filter(r => String(r.placeId) === String(placeId));
    
    if (records.length === 0) return historyList.innerHTML = "<div style='color:#999; text-align:center;'>尚未有任何錄音。</div>";
    
    historyList.innerHTML = records.map(r => `
        <div class="history-item">
            <div class="history-meta"><span>🏷️ ${r.language}</span><span>👤 ${r.uploaderId}</span></div>
            <div style="margin-bottom: 5px;">✏️ 音標：${r.phonetic || '(未填寫)'}</div>
            <div id="player-${r.recordId}" style="margin-top: 10px;">
                <button class="play-btn" onclick="fetchAndPlayAudio('${r.url}', '${r.recordId}')">▶️ 點此從雲端載入音檔並播放</button>
            </div>
        </div>
    `).join('');
}

async function fetchAndPlayAudio(driveUrl, recordId) {
    const container = document.getElementById(`player-${recordId}`);
    container.innerHTML = "<span style='color:#e67e22; font-weight:bold;'>⏳ 檔案載入與轉碼中，請稍候...</span>";
    try {
        const response = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getAudio', url: driveUrl })
        });
        const result = await response.json();
        if (result.success) {
            container.innerHTML = `<audio src="${result.dataUrl}" controls autoplay style="width: 100%; height: 35px;"></audio>`;
        } else {
            container.innerHTML = `<span style="color:red;">❌ 載入失敗：${result.error}</span>`;
        }
    } catch (error) {
        container.innerHTML = `<span style="color:red;">❌ 網路連線錯誤</span>`;
    }
}

// ==========================================
// 錄音介面狀態控制 (保持原樣)
// ==========================================
function resetRecordingState() {
    document.getElementById('phonetic-input').value = "";
    document.getElementById('audio-playback').style.display = 'none';
    document.getElementById('upload-btn').style.display = 'none';
    document.getElementById('status').innerText = "";
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('file-btn').style.display = 'block';
    document.getElementById('audio-file-input').value = ""; 
    audioBlob = null;
    uploadedFileName = "";
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|m4a|wav|aac|ogg|mp4)$/i)) {
        return alert("請上傳正確的音訊檔案！");
    }
    audioBlob = file; uploadedFileName = file.name; 
    document.getElementById('audio-playback').src = URL.createObjectURL(file);
    document.getElementById('audio-playback').style.display = 'block';
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
            uploadedFileName = ""; 
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

// ==========================================
// 🌟 核心修改 2：上傳音檔至 GAS + 紀錄寫入 Supabase
// ==========================================
function uploadAudio() {
    if (!audioBlob || !state.selectedPlace) return;

    const uploadBtn = document.getElementById('upload-btn');
    const statusDiv = document.getElementById('status');
    const lang = document.querySelector('input[name="lang"]:checked').value;
    const phonetic = document.getElementById('phonetic-input').value;

    uploadBtn.innerText = "⏳ 轉碼與上傳 Drive 中..."; uploadBtn.disabled = true;

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async function() {
        const extension = uploadedFileName ? uploadedFileName.split('.').pop() : "webm";
        const finalFileName = `Record_${state.userId}_${state.selectedPlace.id}_${new Date().getTime()}.${extension}`;

        const payload = {
            action: 'upload',
            userId: state.userId, placeId: String(state.selectedPlace.id), placeName: state.selectedPlace.placeName,
            filename: finalFileName, audioBase64: reader.result, language: lang, phonetic: phonetic
        };

        try {
            // 階段一：傳送給 GAS 存入 Google Drive
            const response = await fetch(API_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();
            
            if (result.success) {
                // GAS 成功後，取得回傳的 Drive URL 或檔案 ID
                const driveFileIdOrUrl = result.recordData ? result.recordData.url : "";
                
                statusDiv.innerText = "⏳ Drive 上傳成功，正在寫入資料庫...";
                
                // 階段二：🌟 將紀錄寫入 Supabase (安全防護：前端只能寫入，不能刪改)
                const supaUrl = `${CONFIG.SUPABASE_URL}/rest/v1/audio_records`;
                const supaPayload = {
                    task_id: state.selectedPlace.id,
                    recorder_name: state.userId,
                    audio_file_id: driveFileIdOrUrl,
                    phonetic_reading: phonetic,
                    language: lang
                };

                await fetch(supaUrl, {
                    method: 'POST',
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify(supaPayload)
                });

                statusDiv.innerText = `🎉 錄音與資料庫存檔完成！`; 
                statusDiv.style.color = "blue";
                
                // 更新畫面狀態
                state.uploadedRecords.push({
                    recordId: new Date().getTime(), // 暫時給個隨機ID讓畫面好顯示
                    placeId: state.selectedPlace.id,
                    language: lang,
                    uploaderId: state.userId,
                    phonetic: phonetic,
                    url: driveFileIdOrUrl
                });
                renderHistoryList(state.selectedPlace.id); 
                applyFilters(); 
                resetRecordingState();
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            statusDiv.innerText = "❌ 上傳失敗：" + error.message; statusDiv.style.color = "red";
        } finally {
            uploadBtn.innerText = "⬆️ 上傳並準備下一筆"; uploadBtn.disabled = false;
        }
    };
}