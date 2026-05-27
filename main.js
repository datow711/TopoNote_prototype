// 註冊 Service Worker (PWA 必備)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker 註冊成功! PWA 已就緒。'))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    });
}

let state = {
    userId: "", assignedPlaces: [], allPlaces: [], uploadedRecords: [], reviewQueue: [],
    userDbId: "",
    currentTab: 'assigned', 
    selectedPlace: null, 
    selectedType: "",
    selectedHakArea: "all",
    selectedStatus: "all", 
    userSpecialty: "",
    lastSelectedPlaceIndex: null,
    allUsers: [], // 🌟 新增這行：用來存放所有調查員名單
    allUserRecords: [],
};

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let uploadedFileName = ""; 

const SESSION_KEY = 'toponote_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const ANNOTATION_FIELDS = [
    'taihan', 'tl1', 'tainote',
    'honzii', 'hp1', 'haknote'
];
const REVIEW_FIELD_CONFIG = {
    tai: {
        language: '台語',
        fields: [
            { key: 'TaiHan1', label: 'TaiHan1', placeholder: '台語漢字', annotationKeys: ['taihan', 'taihan1'] },
            { key: 'TL1', label: 'TL1', placeholder: '主音讀羅馬字', annotationKeys: ['tl1'], fallbackRecordKey: 'phonetic' },
            { key: 'TL2', label: 'TL2', placeholder: '優勢腔副音讀', annotationKeys: ['tl2'] },
            { key: 'TL3', label: 'TL3', placeholder: '又念作', annotationKeys: ['tl3'] },
            { key: 'TaiNote', label: 'TaiNote', placeholder: '備註', annotationKeys: ['tainote', 'tai_note'], multiline: true }
        ]
    },
    hak: {
        language: '客語',
        fields: [
            { key: 'Honzii', label: 'Honzii', placeholder: '客語漢字', annotationKeys: ['honzii'] },
            { key: 'HP1', label: 'HP1', placeholder: '主音讀羅馬字', annotationKeys: ['hp1'], fallbackRecordKey: 'phonetic' },
            { key: 'HP2', label: 'HP2', placeholder: '優勢腔副音讀', annotationKeys: ['hp2'] },
            { key: 'HP3', label: 'HP3', placeholder: '又念作', annotationKeys: ['hp3'] },
            { key: 'HDialect', label: 'HDialect', placeholder: '主音讀腔調別', annotationKeys: ['h_dialect', 'hdialect'] },
            { key: 'HakNote', label: 'HakNote', placeholder: '備註', annotationKeys: ['haknote', 'hak_note'], multiline: true }
        ]
    }
};

function parseRecordNote(note) {
    if (!note) return {};
    try {
        const parsed = JSON.parse(note);
        return parsed && parsed.annotations ? parsed.annotations : {};
    } catch (err) {
        return { legacyNote: note };
    }
}

function getAnnotationInputId(field) {
    return `${field}-input`;
}

function collectAnnotationInputs() {
    return ANNOTATION_FIELDS.reduce((annotations, field) => {
        const input = document.getElementById(getAnnotationInputId(field));
        annotations[field] = input ? input.value.trim() : '';
        return annotations;
    }, {});
}

function resetAnnotationInputs() {
    ANNOTATION_FIELDS.forEach(field => {
        const input = document.getElementById(getAnnotationInputId(field));
        if (input) input.value = '';
    });
}

function switchAnnotationLanguage(language) {
    document.querySelectorAll('input[name="lang"]').forEach(input => {
        input.checked = input.value === language;
    });

    document.querySelectorAll('.language-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.lang === language);
    });

    document.querySelectorAll('.annotation-group').forEach(group => {
        group.classList.toggle('active', group.dataset.annotationLang === language);
    });
}

function getDefaultAnnotationLanguage() {
    return state.userSpecialty && state.userSpecialty.includes('客') ? '客語' : '台語';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function renderAnnotationSummary(annotations = {}) {
    const rows = [
        ['台語', [
            ['TaiHan', annotations.taihan || annotations.taihan1],
            ['TL1', annotations.tl1],
            ['TaiNote', annotations.tainote]
        ]],
        ['客語', [
            ['Honzii', annotations.honzii],
            ['HP1', annotations.hp1],
            ['HakNote', annotations.haknote]
        ]]
    ];

    const html = rows.map(([title, fields]) => {
        const filled = fields.filter(([, value]) => value);
        if (filled.length === 0) return '';
        return `
            <div>
                <strong>${title}：</strong>
                ${filled.map(([label, value]) => `${label}: ${escapeHtml(value)}`).join(' / ')}
            </div>
        `;
    }).join('');

    if (html) return `<div class="annotation-summary">${html}</div>`;
    if (annotations.legacyNote) return `<div class="annotation-summary"><div>${escapeHtml(annotations.legacyNote)}</div></div>`;
    return '';
}

function normalizeAssignedUsers(value, fallback) {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (typeof value === 'string' && value.trim()) {
        return value.split(',').map(item => item.trim()).filter(Boolean);
    }
    return fallback ? [fallback] : [];
}

function normalizeTask(t) {
    const assignedUsers = normalizeAssignedUsers(t.assigned_users, t.assigned_to);
    return {
        id: t.task_id,
        sourceId: t.source_id,
        sourceTable: t.source_table,
        placeName: t.place_name,
        county: t.county,
        town: t.town,
        village: t.village,
        type: t.type,
        assignedTo: t.assigned_to,
        assignedUsers: assignedUsers,
        hakArea: t.hak_area,
        recordingStatus: t.recording_status || '未錄音',
        taiAudioCount: Number(t.tai_audio_count || 0),
        hakAudioCount: Number(t.hak_audio_count || 0)
    };
}

function normalizeReviewTask(t) {
    return {
        ...normalizeTask(t),
        tReviewState: t.t_review_state || t.t_state || '尚未標注',
        hReviewState: t.h_review_state || t.h_state || '尚未標注',
        recordCount: Number(t.record_count || 0)
    };
}

function getRecordingStatus(taiCount, hakCount) {
    if (taiCount >= 2 && hakCount >= 2) return '全部完成';
    if (taiCount >= 2) return '台語完成';
    if (hakCount >= 2) return '客語完成';
    return '未錄音';
}

function refreshPlaceRecordingStatus(place, language) {
    if (!place) return;
    if (language.includes('客')) {
        place.hakAudioCount = Number(place.hakAudioCount || 0) + 1;
    } else {
        place.taiAudioCount = Number(place.taiAudioCount || 0) + 1;
    }
    place.recordingStatus = getRecordingStatus(place.taiAudioCount, place.hakAudioCount);
}

function saveSession(user) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
        user_id: user.user_id || user.id || '',
        account: user.account || user.user_name,
        user_name: user.user_name || user.account,
        role: user.role,
        email: user.email || getLoginEmail(),
        savedAt: Date.now()
    }));
}

function getSavedSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;

        const session = JSON.parse(raw);
        if (!(session.account || session.user_name) || !session.role || Date.now() - session.savedAt > SESSION_TTL_MS) {
            localStorage.removeItem(SESSION_KEY);
            return null;
        }

        return session;
    } catch (err) {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
}

async function restoreSession() {
    const session = getSavedSession();
    if (!session) return;

    const status = document.getElementById('login-status');
    status.innerText = '正在恢復登入狀態...';
    status.style.color = '#2c3e50';

    try {
        const account = session.account || session.user_name;
        const freshSession = await fetchSessionUser(account, session.role);
        await enterApp({ ...session, ...freshSession }, { persist: false });
    } catch (err) {
        console.error('恢復登入狀態失敗:', err);
        clearSession();
        status.innerText = '登入狀態已失效，請重新登入。';
        status.style.color = 'red';
    }
}

async function fetchSessionUser(account, role) {
    const params = new URLSearchParams({
        select: 'id,account,role,is_active',
        account: `eq.${account}`,
        role: `eq.${role}`,
        is_active: 'eq.true',
        limit: '1'
    });
    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_users_view?${params}`, {
        headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        }
    });

    if (!response.ok) throw new Error(await response.text());
    const users = await response.json();
    if (!users || users.length === 0) throw new Error('session user is inactive or missing');

    return {
        user_id: users[0].id,
        account: users[0].account,
        role: users[0].role
    };
}

function clearSession() {
    localStorage.removeItem(SESSION_KEY);
}

// ==========================================
// 🌟 核心修改 1：登入與 Supabase 資料極速載入
// ==========================================
function toggleAdminLogin() {
    document.getElementById('admin-login-fields').classList.toggle('hidden');
}

async function login() {
    await performLogin({
        rpcName: 'login_investigator',
        body: { p_email: getLoginEmail() },
        expectedRole: 'user',
        button: document.getElementById('login-btn'),
        loadingText: '載入任務中...',
        resetText: '進入我的任務',
        missingMessage: '請輸入 email',
        failedMessage: '找不到可登入的一般調查員帳號'
    });
}

async function loginAdmin() {
    const password = document.getElementById('password').value;
    if (!password) return alert('請輸入管理者密碼');

    await performLogin({
        rpcName: 'login_admin',
        body: { p_email: getLoginEmail(), p_password: password },
        expectedRole: 'admin',
        button: document.getElementById('admin-login-btn'),
        loadingText: '載入管理模式中...',
        resetText: '進入管理模式',
        missingMessage: '請輸入 email',
        failedMessage: '管理者 email 或密碼錯誤'
    });
}

function getLoginEmail() {
    return document.getElementById('email').value.trim();
}

async function performLogin({ rpcName, body, expectedRole, button, loadingText, resetText, missingMessage, failedMessage }) {
    const email = getLoginEmail();
    if (!email) return alert(missingMessage);

    const status = document.getElementById('login-status');
    status.innerText = '';
    clearSession();
    button.innerText = loadingText;
    button.disabled = true;

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${rpcName}`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(await response.text());
        const users = await response.json();

        if (users && users.length > 0) {
            const user = normalizeAuthenticatedUser(users[0], email);
            if (expectedRole && user.role !== expectedRole) {
                throw new Error(`role mismatch: expected ${expectedRole}, got ${user.role || 'empty'}`);
            }
            await enterApp(user);
        } else {
            status.innerText = `❌ ${failedMessage}`;
            button.innerText = resetText;
            button.disabled = false;
        }
    } catch (error) {
        console.error('登入發生錯誤:', error);
        status.innerText = '❌ 連線發生錯誤';
        button.innerText = resetText;
        button.disabled = false;
    }
}

function normalizeAuthenticatedUser(user, email) {
    return {
        user_id: user.user_id || user.id || '',
        account: user.account || user.user_name || email,
        user_name: user.user_name || user.account || email,
        role: user.role === 'admin' ? 'admin' : 'user',
        email: user.email || email
    };
}

async function enterApp(user, options = {}) {
    const persist = options.persist !== false;
    const normalizedUser = normalizeAuthenticatedUser(user, user.email || getLoginEmail());

    state.userDbId = normalizedUser.user_id;
    state.userId = normalizedUser.account;
    state.userRole = normalizedUser.role;
    state.userSpecialty = '';

    await loadDataFromSupabase(state.userId);
    if (persist) saveSession(normalizedUser);
    renderUserInfo();
    configureRoleUI();

    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    initFilters();
    switchTab('assigned');
}

function logout() {
    clearSession();
    state.userId = '';
    state.userDbId = '';
    state.userRole = '';
    state.userSpecialty = '';
    state.assignedPlaces = [];
    state.allPlaces = [];
    state.uploadedRecords = [];
    state.reviewQueue = [];
    state.selectedPlace = null;
    state.currentTab = 'assigned';
    state.selectedType = '';
    state.selectedHakArea = 'all';
    state.selectedStatus = 'all';
    state.lastSelectedPlaceIndex = null;
    state.allUsers = [];
    state.allUserRecords = [];

    const userInfoDiv = document.getElementById('user-info-badge');
    if (userInfoDiv) userInfoDiv.remove();

    const adminBar = document.getElementById('admin-assign-bar');
    if (adminBar) adminBar.remove();
    const userManager = document.getElementById('admin-user-manager');
    if (userManager) userManager.remove();

    document.getElementById('app-section').style.paddingBottom = '';
    configureRoleUI();
    document.getElementById('app-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('recording-section').style.display = 'none';
    document.getElementById('place-list-container').innerHTML = '';
    document.getElementById('login-status').innerText = '';
    document.getElementById('login-status').style.color = 'red';
    document.getElementById('login-btn').innerText = '進入我的任務';
    document.getElementById('login-btn').disabled = false;
    document.getElementById('admin-login-btn').innerText = '進入管理模式';
    document.getElementById('admin-login-btn').disabled = false;
    document.getElementById('password').value = '';
}

function renderUserInfo() {
    let userInfoDiv = document.getElementById('user-info-badge');
    
    // 如果畫面上還沒有這個標籤，就自動建立一個並塞入 app-section 的最上方
    if (!userInfoDiv) {
        userInfoDiv = document.createElement('div');
        userInfoDiv.id = 'user-info-badge';
        
        const appSection = document.getElementById('app-section');
        appSection.insertBefore(userInfoDiv, appSection.firstChild);
    }

    // 判斷角色並顯示對應的文字
    const roleText = state.userRole === 'admin' ? '👑 管理員' : '👤 調查員';
    userInfoDiv.innerHTML = `
        <div>
            <div>${roleText}：${state.userId}</div>
            <div class="user-mode">${state.userRole === 'admin' ? '管理員模式' : '調查任務模式'}</div>
        </div>
        <button class="btn-logout" onclick="logout()">登出</button>
    `;
}

function configureRoleUI() {
    const tabAssigned = document.getElementById('tab-assigned');
    const tabOther = document.getElementById('tab-other');
    const tabReview = document.getElementById('tab-review');
    const assigneeFilter = document.getElementById('assignee-filter');
    const adminBar = document.getElementById('admin-assign-bar');
    const userManager = document.getElementById('admin-user-manager');
    const appSection = document.getElementById('app-section');

    if (state.userRole === 'admin') {
        if (tabAssigned) tabAssigned.innerText = '全部地名清單';
        if (tabOther) {
            tabOther.style.display = 'none';
            tabOther.classList.remove('active');
        }
        if (tabReview) {
            tabReview.classList.remove('hidden');
            tabReview.style.display = '';
        }
        renderAdminUserManager();
        return;
    }

    if (tabAssigned) tabAssigned.innerText = '📝 任務清單';
    if (tabOther) {
        tabOther.innerText = '🌍 其他地名';
        tabOther.style.display = '';
    }
    if (tabReview) {
        tabReview.classList.add('hidden');
        tabReview.classList.remove('active');
    }
    if (assigneeFilter) assigneeFilter.remove();
    if (adminBar) adminBar.remove();
    if (userManager) userManager.remove();
    if (appSection) appSection.style.paddingBottom = '';
}

function renderAdminUserManager() {
    if (state.userRole !== 'admin') return;

    let panel = document.getElementById('admin-user-manager');
    if (!panel) {
        panel = document.createElement('section');
        panel.id = 'admin-user-manager';
        panel.className = 'card';
        const appSection = document.getElementById('app-section');
        const tabContainer = document.querySelector('.tab-container');
        appSection.insertBefore(panel, tabContainer);
    }

    const investigators = state.allUserRecords.filter(user => user.role !== 'admin');
    const body = investigators.length === 0
        ? '<div class="empty-state compact">目前沒有調查員帳號。請從 Places 的 Users 表同步。</div>'
        : investigators.map(user => `
            <label class="user-status-row">
                <span class="user-account">${escapeHtml(user.account)}</span>
                <span class="user-active-text">${user.is_active ? 'active' : 'inactive'}</span>
                <input type="checkbox" ${user.is_active ? 'checked' : ''} onchange="toggleInvestigatorActive('${user.id}', this.checked, this)">
            </label>
        `).join('');

    panel.innerHTML = `
        <div class="admin-user-manager-header">
            <h3>調查員帳號狀態</h3>
            <button class="btn-secondary refresh-users-btn" onclick="refreshAdminUsers()">重新整理</button>
        </div>
        <div class="user-status-list">${body}</div>
    `;
}

async function refreshAdminUsers() {
    await loadDataFromSupabase(state.userId);
    initFilters();
    renderAdminUserManager();
    applyFilters();
}

async function toggleInvestigatorActive(userId, isActive, checkbox) {
    checkbox.disabled = true;
    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/set_investigator_active`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_user_id: userId,
                p_is_active: isActive,
                p_actor_account: state.userId
            })
        });

        if (!response.ok) throw new Error(await response.text());
        await refreshAdminUsers();
    } catch (err) {
        console.error('更新調查員 active 狀態失敗:', err);
        checkbox.checked = !isActive;
        checkbox.disabled = false;
        alert(`更新 active 狀態失敗：${err.message}`);
    }
}

function syncAdminToolsForTab() {
    if (state.userRole !== 'admin') return;

    const adminBar = document.getElementById('admin-assign-bar');
    const appSection = document.getElementById('app-section');

    if (state.currentTab === 'review') {
        if (adminBar) adminBar.style.display = 'none';
        if (appSection) appSection.style.paddingBottom = '';
        return;
    }

    renderAdminBatchAssignUI();
}


// 🌟 更新版：載入資料庫，管理員額外抓取全體名單
async function loadDataFromSupabase(userName) {
    try {
        const headers = {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`
        };

        const [tasksRes, recordsRes] = await Promise.all([
            fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_tasks_view?select=*`, { headers }),
            fetch(`${CONFIG.SUPABASE_URL}/rest/v1/audio_records?select=*`, { headers })
        ]);

        const tasksData = await tasksRes.json();
        const recordsData = await recordsRes.json();
        const places = tasksData.map(normalizeTask);

        if (state.userRole === 'admin') {
            // 🛑 核心新增：管理員額外抓取全體調查員名單
            const usersRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_users_view?select=id,account,role,is_active&order=account.asc`, { headers });
            const usersData = await usersRes.json();
            // 將抓回來的名字存入 state
            state.allUserRecords = usersData;
            state.allUsers = usersData
                .filter(u => u.role !== 'admin' && u.is_active)
                .map(u => u.account);
            const reviewsRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_review_queue_view?select=*`, { headers });
            const reviewsData = await reviewsRes.json();
            state.reviewQueue = reviewsData.map(normalizeReviewTask);

            state.assignedPlaces = places;
            state.allPlaces = []; 
        } else {
            state.allUsers = [];
            state.allUserRecords = [];
            state.reviewQueue = [];
            state.assignedPlaces = places
                .filter(place => place.assignedUsers.includes(userName));
                
            state.allPlaces = places
                .filter(place => !place.assignedUsers.includes(userName) && place.sourceTable !== 'test_places');
        }

        state.uploadedRecords = recordsData.map(r => ({
            recordId: r.id, placeId: r.task_id, language: r.language,
            uploaderId: r.recorder_name, phonetic: r.phonetic_reading, url: r.audio_file_id,
            annotations: parseRecordNote(r.note)
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
    document.getElementById('tab-review')?.classList.toggle('active', tab === 'review');
    syncAdminToolsForTab();
    document.getElementById('search-box').value = ""; applyFilters();
}
// 🌟 更新版：初始化篩選器
function initFilters() {
    const counties = [...new Set(state.assignedPlaces.concat(state.allPlaces).map(p => p.county).filter(Boolean))];
    const types = [...new Set(state.assignedPlaces.concat(state.allPlaces).map(p => p.type || p.Type).filter(Boolean))];
    
    const countySelect = document.getElementById('county-filter');
    countySelect.innerHTML = '<option value="">所有縣市</option>'; 
    counties.forEach(c => countySelect.add(new Option(c, c)));
    
    const typeContainer = document.getElementById('type-container');
    typeContainer.innerHTML = `<div class="type-chip selected" onclick="selectType('', this)">全部類別</div>`;
    types.forEach(t => { 
        let displayText = t === "具有地標意義公共設施" ? "公共設施" : t;
        typeContainer.innerHTML += `<div class="type-chip" onclick="selectType('${t}', this)">${displayText}</div>`; 
    });

    if (state.userRole === 'admin') {
        let assigneeSelect = document.getElementById('assignee-filter');
        if (!assigneeSelect) {
            assigneeSelect = document.createElement('select');
            assigneeSelect.id = 'assignee-filter';
            assigneeSelect.onchange = applyFilters; 
            
            const searchBox = document.getElementById('search-box');
            searchBox.parentNode.insertBefore(assigneeSelect, searchBox);
        }
        
        // 🛑 核心修改：改用 state.allUsers 來產生下拉選單
        assigneeSelect.innerHTML = '<option value="">👥 所有調查員 (包含未指派)</option>' + 
                                   '<option value="UNASSIGNED">⚠️ 只看未指派</option>' + 
                                   state.allUsers.map(u => `<option value="${u}">👤 ${u}</option>`).join('');
                                   
        renderAdminBatchAssignUI(); 
    }
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
function selectHakArea(hakArea, element) {
    state.selectedHakArea = hakArea;
    document.querySelectorAll('.hak-area-chip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected'); applyFilters();
}
function selectStatus(status, element) {
    state.selectedStatus = status;
    document.querySelectorAll('.status-chip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected'); applyFilters();
}

// 🌟 升級：執行篩選 (加入調查員條件)
function applyFilters() {
    const keyword = document.getElementById('search-box').value.toLowerCase();
    const county = document.getElementById('county-filter').value;
    const town = document.getElementById('town-filter').value;
    const type = state.selectedType;
    const hakArea = state.selectedHakArea;
    const status = state.selectedStatus; 
    
    // 獲取調查員篩選器的值 (如果有的話)
    const assigneeInput = document.getElementById('assignee-filter');
    const assigneeFilter = assigneeInput ? assigneeInput.value : "";
    
    let data = state.currentTab === 'review'
        ? state.reviewQueue
        : (state.currentTab === 'assigned' ? state.assignedPlaces : state.allPlaces);

    const filtered = data.filter(place => {
        const uuidText = place.sourceId ? String(place.sourceId).toLowerCase() : '';
        const taskIdText = place.id ? String(place.id) : '';
        const matchK = (place.placeName && place.placeName.toLowerCase().includes(keyword))
            || uuidText.includes(keyword)
            || taskIdText.includes(keyword);
        const matchC = county ? place.county === county : true;
        const matchTw = town ? place.town === town : true;
        const matchTy = type ? (place.type || place.Type) === type : true;
        const isHakArea = place.hakArea === true || String(place.hakArea).toUpperCase() === 'TRUE';
        const matchHakArea = hakArea === 'all' || (hakArea === 'hak' ? isHakArea : !isHakArea);
        
        // 🛑 新增：調查員篩選邏輯
        let matchAssignee = true;
        if (state.userRole === 'admin' && assigneeFilter !== "") {
            if (assigneeFilter === "UNASSIGNED") {
                matchAssignee = place.assignedUsers.length === 0;
            } else {
                matchAssignee = place.assignedUsers.includes(assigneeFilter);
            }
        }
        
        // 錄音狀態篩選
        const matchStatus = status === 'all' || place.recordingStatus === status;
        
        return matchK && matchC && matchTw && matchTy && matchHakArea && matchStatus && matchAssignee;
    });
    if (state.currentTab === 'review') {
        return renderReviewQueue(filtered);
    }
    renderPlaceList(filtered);
}

function getTaskRecords(taskId, language = '') {
    return state.uploadedRecords.filter(record => {
        const sameTask = String(record.placeId) === String(taskId);
        return sameTask && (!language || record.language === language);
    });
}

function getLanguageReviewState(place, language) {
    return language === '客語' ? place.hReviewState : place.tReviewState;
}

function getReviewLanguageKey(language) {
    return language === '客語' ? 'hak' : 'tai';
}

function getReviewInputId(taskId, languageKey, fieldKey) {
    return `review-final-${taskId}-${languageKey}-${fieldKey}`;
}

function getRecordFieldValue(record, field) {
    const annotations = record.annotations || {};
    for (const key of field.annotationKeys || []) {
        if (annotations[key]) return annotations[key];
    }
    return field.fallbackRecordKey ? (record[field.fallbackRecordKey] || '') : '';
}

function renderRecordFieldCell(taskId, languageKey, record, field) {
    const value = getRecordFieldValue(record, field);
    const copyButton = value
        ? `<button class="copy-field-btn" data-value="${escapeHtml(value)}" onclick="copyReviewFieldToFinal(${taskId}, '${languageKey}', '${field.key}', this.dataset.value)">填入</button>`
        : '';

    return `
        <div class="review-record-field ${value ? 'has-value' : ''}">
            <span>${field.label}</span>
            <strong>${value ? escapeHtml(value) : '未填'}</strong>
            ${copyButton}
        </div>
    `;
}

function renderReviewRecordGrid(taskId, languageKey, records, fields) {
    return `
        <div class="review-record-grid">
            ${records.map((record, index) => `
                <article class="review-record-card">
                    <div class="review-record-topline">
                        <span>#${index + 1}</span>
                        <span>${escapeHtml(record.uploaderId)}</span>
                        <button class="play-btn compact" onclick="fetchAndPlayAudio('${record.url}', '${record.recordId}')">播放</button>
                    </div>
                    <div class="review-record-fields">
                        ${fields.map(field => renderRecordFieldCell(taskId, languageKey, record, field)).join('')}
                    </div>
                    <div id="player-${record.recordId}" class="review-player"></div>
                </article>
            `).join('')}
        </div>
    `;
}

function renderFinalReviewFields(taskId, languageKey, fields, isDone) {
    return `
        <div class="review-final-panel">
            <div class="review-final-grid">
                ${fields.map(field => {
                    const id = getReviewInputId(taskId, languageKey, field.key);
                    const input = field.multiline
                        ? `<textarea id="${id}" rows="2" placeholder="${field.placeholder}" ${isDone ? 'disabled' : ''}></textarea>`
                        : `<input id="${id}" type="text" placeholder="${field.placeholder}" ${isDone ? 'disabled' : ''}>`;
                    return `
                        <label class="review-final-field">
                            <span>${field.label}</span>
                            ${input}
                        </label>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

function collectFinalReviewFields(taskId, languageKey) {
    const config = REVIEW_FIELD_CONFIG[languageKey];
    return config.fields.reduce((values, field) => {
        const input = document.getElementById(getReviewInputId(taskId, languageKey, field.key));
        values[field.key] = input ? input.value.trim() : '';
        return values;
    }, {});
}

function copyReviewFieldToFinal(taskId, languageKey, fieldKey, value) {
    const input = document.getElementById(getReviewInputId(taskId, languageKey, fieldKey));
    if (!input) return;
    input.value = value || '';
    input.focus();
}

function renderReviewQueue(places) {
    const container = document.getElementById('place-list-container');
    container.innerHTML = "";
    state.lastSelectedPlaceIndex = null;

    const reviewablePlaces = places.filter(place => {
        return getTaskRecords(place.id, '台語').length > 0 || getTaskRecords(place.id, '客語').length > 0;
    });

    if (reviewablePlaces.length === 0) {
        container.innerHTML = '<div class="empty-state">目前沒有可審查的錄音</div>';
        return;
    }

    reviewablePlaces.forEach(place => {
        const item = document.createElement('div');
        item.className = 'review-item';
        const taiRecords = getTaskRecords(place.id, '台語');
        const hakRecords = getTaskRecords(place.id, '客語');
        const displayUuid = place.sourceId || place.id;

        item.innerHTML = `
            <div class="review-heading">
                <div>
                    <div class="place-title">${escapeHtml(place.placeName)}</div>
                    <div class="place-meta">
                        <span class="meta-badge">UUID: ${escapeHtml(displayUuid)}</span>
                        <span class="meta-badge">${escapeHtml(place.county)} ${escapeHtml(place.town)}</span>
                    </div>
                </div>
                <div class="review-status-group">
                    ${renderReviewStatusBadge('台語', getLanguageReviewState(place, '台語'), taiRecords.length)}
                    ${renderReviewStatusBadge('客語', getLanguageReviewState(place, '客語'), hakRecords.length)}
                </div>
            </div>
            ${renderReviewLanguageBlock(place, '台語', taiRecords)}
            ${renderReviewLanguageBlock(place, '客語', hakRecords)}
        `;
        container.appendChild(item);
    });
}

function renderReviewStatusBadge(language, reviewState, count) {
    const stateClass = reviewState === '已完成標注' ? 'review-done' : 'review-pending';
    return `<span class="review-state ${stateClass}">${language} ${count} 筆｜${escapeHtml(reviewState)}</span>`;
}

function renderReviewLanguageBlock(place, language, records) {
    if (records.length === 0) return '';
    const languageKey = getReviewLanguageKey(language);
    const fields = REVIEW_FIELD_CONFIG[languageKey].fields;
    const reviewState = getLanguageReviewState(place, language);
    const isDone = reviewState === '已完成標注';
    return `
        <section class="review-language">
            <div class="review-language-header">
                <h4>${language}錄音</h4>
                <button class="review-approve-btn" ${isDone ? 'disabled' : ''} onclick="approveReviewLanguage(${place.id}, '${language}', this)">
                    ${isDone ? '已通過' : '審查通過'}
                </button>
            </div>
            ${renderReviewRecordGrid(place.id, languageKey, records, fields)}
            ${renderFinalReviewFields(place.id, languageKey, fields, isDone)}
        </section>
    `;
}

async function approveReviewLanguage(taskId, language, button) {
    const languageKey = getReviewLanguageKey(language);
    const finalFields = collectFinalReviewFields(taskId, languageKey);
    if (!confirm(`確定通過這筆地名的${language}標注嗎？`)) return;

    const originalText = button.innerText;
    button.innerText = '寫入中...';
    button.disabled = true;

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/approve_task_language`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_task_id: Number(taskId),
                p_language: language,
                p_reviewed_by: state.userId,
                p_fields: finalFields
            })
        });

        if (!response.ok) throw new Error(await response.text());

        alert(`${language}標注已通過。`);
        await loadDataFromSupabase(state.userId);
        applyFilters();
    } catch (err) {
        console.error('審查寫入失敗:', err);
        alert(`審查寫入失敗：${err.message}`);
        button.innerText = originalText;
        button.disabled = false;
    }
}

// 🌟 升級：渲染清單 (插入 Checkbox)
function renderPlaceList(places) {
    const container = document.getElementById('place-list-container');
    container.innerHTML = "";
    state.lastSelectedPlaceIndex = null;
    if (places.length === 0) return container.innerHTML = '<div class="empty-state">沒有符合條件的地名</div>';

    places.forEach((place, index) => {
        const item = document.createElement('div');
        item.className = 'place-item';
        if (state.selectedPlace && state.selectedPlace.id === place.id) item.classList.add('active');
        
        let typeName = place.type || place.Type || '無類別';
        if (typeName === "具有地標意義公共設施") typeName = "公共設施";
        
        const recordBadge = `<span class="meta-badge record-badge">${place.recordingStatus}｜台 ${place.taiAudioCount} / 客 ${place.hakAudioCount}</span>`;

        // 🛑 新增：Checkbox 與指派標籤
        let checkboxHTML = '';
        let adminAssignBadge = '';
        
        if (state.userRole === 'admin') {
            // Checkbox：加上 onclick="event.stopPropagation()" 防止點擊時展開錄音介面
            checkboxHTML = `<input type="checkbox" class="assign-checkbox" value="${place.id}" data-list-index="${index}" onclick="toggleAdminPlaceSelection(event, ${index})" title="勾選；Shift + 左鍵可連續選取多筆">`;
            
            if (place.assignedUsers.length > 0) {
                adminAssignBadge = `<span class="meta-badge assign-badge">👤 ${place.assignedUsers.join('、')}</span>`;
            } else {
                adminAssignBadge = `<span class="meta-badge unassigned-badge">⚠️ 未指派</span>`;
            }
        }
        const displayUuid = place.sourceId || place.id;

        item.innerHTML = `
            <div class="place-row">
                ${checkboxHTML}
                <div class="place-info">
                    <div class="place-title">${place.placeName}</div>
                    <div class="place-meta">
                        <span class="meta-badge">UUID: ${displayUuid}</span>
                        <span class="meta-badge">${place.county} ${place.town}</span>
                        <span class="meta-badge">${typeName}</span>
                        <div class="meta-badge-row">${recordBadge} ${adminAssignBadge}</div>
                    </div>
                </div>
                <div class="expand-icon">▶</div>
            </div>
        `;
        item.onclick = () => openRecordingUI(place, item);
        container.appendChild(item);
    });
    updateSelectedAssignCount();
}

function toggleAdminPlaceSelection(event, index) {
    event.stopPropagation();
    const checkbox = event.currentTarget;
    const checkboxes = Array.from(document.querySelectorAll('.assign-checkbox'));

    if (event.shiftKey && state.lastSelectedPlaceIndex !== null) {
        const start = Math.min(state.lastSelectedPlaceIndex, index);
        const end = Math.max(state.lastSelectedPlaceIndex, index);
        checkboxes.forEach(box => {
            const boxIndex = Number(box.dataset.listIndex);
            if (boxIndex >= start && boxIndex <= end) {
                box.checked = checkbox.checked;
                box.closest('.place-item')?.classList.toggle('selected-for-assign', checkbox.checked);
            }
        });
    } else {
        checkbox.closest('.place-item')?.classList.toggle('selected-for-assign', checkbox.checked);
    }

    state.lastSelectedPlaceIndex = index;
    updateSelectedAssignCount();
}

function updateSelectedAssignCount() {
    const countEl = document.getElementById('assign-count');
    if (!countEl) return;
    const count = document.querySelectorAll('.assign-checkbox:checked').length;
    countEl.innerText = `${count} 筆已選`;
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
            ${renderAnnotationSummary(r.annotations)}
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
    resetAnnotationInputs();
    switchAnnotationLanguage(getDefaultAnnotationLanguage());
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
    document.getElementById('status').innerText = "✅ 錄音完成，可填寫補充欄位後上傳。";
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
    const annotations = collectAnnotationInputs();
    const phonetic = lang === '台語' ? annotations.tl1 : annotations.hp1;

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
                    language: lang,
                    note: JSON.stringify({ annotations: annotations })
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
                    url: driveFileIdOrUrl,
                    annotations: annotations
                });
                refreshPlaceRecordingStatus(state.selectedPlace, lang);
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

// 🌟 更新版：繪製底部批次指派工具列
function renderAdminBatchAssignUI() {
    if (state.userRole !== 'admin') return;
    
    let bar = document.getElementById('admin-assign-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'admin-assign-bar';
        document.body.appendChild(bar);
    }
    bar.style.display = 'flex';
    document.getElementById('app-section').style.paddingBottom = "80px";

    // 🛑 核心修改：改用 state.allUsers 來產生建議選單
    let options = state.allUsers.map(u => `<option value="${u}">`).join('');

    bar.innerHTML = `
        <span class="assign-label">批次指派</span>
        <span id="assign-count" class="assign-count">0 筆已選</span>
        <input list="investigators-list" id="assignee-input" placeholder="選擇或輸入調查員">
        <datalist id="investigators-list">${options}</datalist>
        <button class="assign-submit" onclick="batchAssignTasks()">確認送出</button>
        <span class="assign-hint">Shift + 左鍵可連續選取</span>
    `;
    updateSelectedAssignCount();
}

// 🌟 新增：執行批次指派 (寫入 Supabase)
async function batchAssignTasks() {
    // 找出所有被打勾的 checkbox
    const checkboxes = document.querySelectorAll('.assign-checkbox:checked');
    const taskIds = Array.from(checkboxes).map(cb => cb.value);
    const targetUser = document.getElementById('assignee-input').value.trim();

    if (taskIds.length === 0) return alert("請先在清單中勾選要指派的地名！");
    if (!targetUser) return alert("請輸入或選擇要指派的調查員名稱！");
    if (!confirm(`確定要將勾選的 ${taskIds.length} 筆地名，指派給「${targetUser}」嗎？`)) return;

    document.querySelector('#admin-assign-bar button').innerText = "處理中...";

    try {
        const url = `${CONFIG.SUPABASE_URL}/rest/v1/rpc/assign_tasks_to_user`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_task_ids: taskIds.map(id => Number(id)),
                p_user_name: targetUser,
                p_assigned_by: state.userId
            })
        });

        if (!response.ok) throw new Error('資料庫更新失敗');

        alert('🎉 指派成功！');
        
        // 重新載入最新資料並刷新畫面
        await loadDataFromSupabase(state.userId);
        initFilters();
        applyFilters();

    } catch (err) {
        console.error("指派失敗:", err);
        alert("指派發生錯誤，請稍後再試。");
    } finally {
        renderAdminBatchAssignUI(); // 恢復按鈕文字
    }
}

window.addEventListener('DOMContentLoaded', restoreSession);
