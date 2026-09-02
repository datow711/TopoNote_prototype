// 註冊 Service Worker (PWA 必備)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker 註冊成功! PWA 已就緒。'))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    });
}

const STATUS_FILTER_VALUES = ['未錄音', '台語已有錄音', '客語已有錄音', '台語完成', '客語完成', '全部完成'];
const LEAFLET_VERSION = '1.9.4';
const LEAFLET_CSS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS_URL = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS_INTEGRITY = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
const LEAFLET_JS_INTEGRITY = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const PLACE_MAP_MARKER_LIMIT = 500;
const PLACE_MAP_DEFAULT_CENTER = [23.7, 121.0];
const PLACE_MAP_DEFAULT_ZOOM = 7;
const LOW_ACCURACY_THRESHOLD_METERS = 100;

let state = {
    userId: "", assignedPlaces: [], allPlaces: [], uploadedRecords: [], uploadReportRecords: [], uploadReportGroupMode: 'date', reviewQueue: [], reviewWorkflowQueue: [], reviewWorkflowAvailable: false, reviewWorkflowDraftFilter: 'draft', reviewWorkbenchMode: 'proofing',
    reviewWorkflowAudioStatusFilter: 'all', reviewWorkflowAudioFlagFilter: 'all', reviewWorkflowAudioClaimFilter: 'all', reviewWorkflowAudioKeyword: '',
    reviewWorkflowAudioCountyFilter: '', reviewWorkflowAudioSelectedTowns: null, reviewWorkflowAudioTownDropdownOpen: false, reviewWorkflowAudioLanguageFilter: 'all',
    userDbId: "",
    userName: "",
    userEmail: "",
    userPhone: "",
    currentTab: 'assigned', 
    selectedPlace: null, 
    selectedTowns: [],
    availableTowns: [],
    townDropdownOpen: false,
    selectedTypes: [],
    typeFiltersInitialized: false,
    selectedTaiClasses: [],
    selectedHakClasses: [],
    classFiltersInitialized: false,
    availableTypes: [],
    availableTaiClasses: [],
    availableHakClasses: [],
    selectedHakArea: "all",
    selectedStatus: "all",
    selectedStatuses: [...STATUS_FILTER_VALUES],
    userSpecialty: "",
    lastSelectedPlaceIndex: null,
    filteredPlaces: [],
    renderedPlaceCount: 0,
    placeRenderBatchSize: 100,
    placeMap: {
        isOpen: false,
        leafletPromise: null,
        map: null,
        layer: null,
        markers: new Map(),
        userMarker: null,
        userAccuracyCircle: null,
        userPosition: null,
        activePlaceId: null
    },
    selectedAssignTaskIds: new Set(),
    allUsers: [], // 🌟 新增這行：用來存放所有調查員名單
    allUserRecords: [],
    adminUserSort: { key: '', direction: 'asc' },
    announcements: [],
    adminAnnouncements: [],
    unreadAnnouncementCount: 0,
    announcementLoadFailed: false,
};

let mobileFilterReturnFocus = null;

document.addEventListener('click', event => {
    const userMoreMenu = document.querySelector('.user-action-group');
    if (userMoreMenu && !userMoreMenu.contains(event.target)) closeUserMoreMenu();

    if (state.townDropdownOpen) {
        state.townDropdownOpen = false;
        renderTownMultiSelect();
    }
    if (state.reviewWorkflowAudioTownDropdownOpen) {
        const filter = document.getElementById('review-workflow-audio-town-filter');
        if (!filter?.contains(event.target)) {
            state.reviewWorkflowAudioTownDropdownOpen = false;
            renderReviewWorkflowQueue();
        }
    }
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('filter-panel')?.classList.contains('is-open')) {
        closeMobileFilterPanel();
        return;
    }
    if (state.reviewWorkflowAudioTownDropdownOpen) {
        state.reviewWorkflowAudioTownDropdownOpen = false;
        renderReviewWorkflowQueue();
        return;
    }
    closeUserMoreMenu();
    document.getElementById('admin-assign-bar')?.classList.remove('is-open');
    document.getElementById('admin-assign-toggle')?.setAttribute('aria-expanded', 'false');
});

window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 640px)').matches) closeMobileFilterPanel({ restoreFocus: false });
});

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let uploadedFileName = "";
let recordingStream = null;
let pendingUploadJob = null;
let uploadInProgress = false;
let tutorialState = null;

const SESSION_KEY = 'toponote_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const SUPABASE_AUTH_SESSION_KEY = 'toponote_supabase_auth_session';
const SUPABASE_AUTH_REFRESH_SKEW_MS = 60 * 1000;
const USER_LABEL_SELECT = 'id,account,role,is_active,name,email,phone';
const USER_PROFILE_SELECT = [
    USER_LABEL_SELECT,
    'languages',
    'hakka_dialect',
    'life_area_1',
    'survey_area_1',
    'life_area_2',
    'survey_area_2',
    'life_area_3',
    'survey_area_3'
].join(',');
const SUPABASE_PAGE_SIZE = 1000;
const USER_EDIT_FIELDS = [
    { key: 'email', label: 'Email', type: 'email', required: true },
    { key: 'name', label: '姓名', required: true },
    { key: 'phone', label: '手機' },
    { key: 'languages', label: '語言' },
    { key: 'hakka_dialect', label: '客語腔調' },
    { key: 'life_area_1', label: '生活區域 1' },
    { key: 'survey_area_1', label: '調查區域 1' },
    { key: 'life_area_2', label: '生活區域 2' },
    { key: 'survey_area_2', label: '調查區域 2' },
    { key: 'life_area_3', label: '生活區域 3' },
    { key: 'survey_area_3', label: '調查區域 3' }
];

const ANNOTATION_FIELDS = [
    'taihan', 'tl1', 'tainote',
    'honzii', 'hp1', 'haknote'
];
const REVIEW_FIELD_CONFIG = {
    tai: {
        language: '台語',
        compareFields: ['TaiHan1', 'TL1', 'TaiNote'],
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
        compareFields: ['Honzii', 'HP1', 'HakNote'],
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

const TASK_EXPORT_BASE_COLUMNS = [
    { key: 'county', label: '縣市' },
    { key: 'town', label: '鄉鎮' },
    { key: 'type', label: '分類' },
    { key: 'placeName', label: '地名' }
];

const TASK_EXPORT_FIELD_COLUMNS = [
    { key: 'taihan', label: '台語漢字' },
    { key: 'tl1', label: '台語羅馬字' },
    { key: 'tainote', label: '台語備註' },
    { key: 'honzii', label: '客語漢字' },
    { key: 'hp1', label: '客語羅馬字' },
    { key: 'haknote', label: '客語備註' }
];

const TASK_EXPORT_COLUMNS = TASK_EXPORT_BASE_COLUMNS.concat(TASK_EXPORT_FIELD_COLUMNS);

function parseRecordNotePayload(note) {
    if (!note) return {};
    try {
        const parsed = JSON.parse(note);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
        return { annotations: { legacyNote: note } };
    }
}

function parseRecordNote(note) {
    const payload = parseRecordNotePayload(note);
    return payload && payload.annotations ? payload.annotations : {};
}

function parseRecordLinkMeta(note) {
    const payload = parseRecordNotePayload(note);
    return payload.linkedAudio || payload.linked_audio || null;
}

function buildRecordNotePayload(annotations = {}, linkMeta = null, respondentKey = '') {
    const payload = { annotations };
    if (linkMeta) payload.linkedAudio = linkMeta;
    if (respondentKey) payload.respondentKey = respondentKey;
    return payload;
}

async function fetchSupabaseRows(pathAndQuery, headers, pageSize = SUPABASE_PAGE_SIZE) {
    const rows = [];
    for (let offset = 0; ; offset += pageSize) {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
            headers: {
                ...headers,
                Range: `${offset}-${offset + pageSize - 1}`
            }
        });
        if (!response.ok) {
            throw new Error(`Supabase request failed (${response.status}) for ${pathAndQuery}`);
        }
        const pageRows = await response.json();
        if (!Array.isArray(pageRows)) {
            throw new Error(`Supabase request did not return an array for ${pathAndQuery}`);
        }
        rows.push(...pageRows);
        if (pageRows.length < pageSize) break;
    }
    return rows;
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

function getPrimaryAnnotationKey(field) {
    return (field.annotationKeys && field.annotationKeys[0]) || String(field.key || '').toLowerCase();
}

function getRecordLanguageKey(recordOrLanguage) {
    const language = typeof recordOrLanguage === 'string'
        ? recordOrLanguage
        : (recordOrLanguage && recordOrLanguage.language);
    return language === '客語' ? 'hak' : 'tai';
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

function getCurrentUserIdentifiers() {
    return [state.userId, state.userName, state.userEmail].filter(Boolean);
}

function isCurrentUserIdentifier(identifier) {
    return getCurrentUserIdentifiers().some(current => isSameUserIdentifier(identifier, current));
}

function getAssignedLanguagesForCurrentUser(place) {
    if (!place || state.userRole === 'admin') return [];
    const languages = [];
    if (isCurrentUserIdentifier(place.tAssignee)) languages.push('台語');
    if (isCurrentUserIdentifier(place.hAssignee)) languages.push('客語');
    return languages;
}

function isPlaceInCurrentTaskList(place) {
    if (!place || state.userRole === 'admin') return true;
    const samePlace = candidate => String(candidate.id) === String(place.id);
    if (state.assignedPlaces.some(samePlace)) return true;
    return getCurrentUserIdentifiers().some(identifier => assignedUsersInclude(place.assignedUsers, identifier));
}

function getDefaultAnnotationLanguage(place = state.selectedPlace) {
    const assignedLanguages = getAssignedLanguagesForCurrentUser(place);
    if (assignedLanguages.includes('台語')) return '台語';
    if (assignedLanguages.includes('客語')) return '客語';
    return state.userSpecialty && state.userSpecialty.includes('客') ? '客語' : '台語';
}

function getUploadScopeWarning(place, language) {
    if (state.userRole === 'admin' || !place) return '';

    const assignedLanguages = getAssignedLanguagesForCurrentUser(place);
    if (assignedLanguages.length > 0 && !assignedLanguages.includes(language)) {
        return [
            '提醒：這筆上傳結果不在你受委託的語種範圍內。',
            `原因：語種不符合。你受委託的是「${assignedLanguages.join('、')}」，目前選擇的是「${language}」。`
        ].join('\n');
    }

    if (!isPlaceInCurrentTaskList(place)) {
        return [
            '提醒：這筆上傳結果不在你受委託的範圍內。',
            '原因：這個地名不在你的任務清單中。'
        ].join('\n');
    }

    return '';
}

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escapeJsString(value) {
    return String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, ' ');
}

function filterSelectOptions(selectId, query) {
    const select = document.getElementById(selectId);
    if (!select) return;
    const normalizedQuery = String(query || '').trim().toLowerCase();
    Array.from(select.options).forEach(option => {
        const haystack = [
            option.textContent,
            option.value,
            option.title
        ].filter(Boolean).join(' ').toLowerCase();
        option.hidden = !!normalizedQuery && !haystack.includes(normalizedQuery);
    });
}

function formatAnnouncementDate(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function normalizeAnnouncement(row = {}) {
    return {
        id: row.id,
        title: row.title || '',
        body: row.body || '',
        targetAccount: row.target_account || '',
        createdBy: row.created_by || '',
        createdAt: row.created_at || '',
        readAt: row.read_at || '',
        isRead: row.is_read === true || !!row.read_at,
        readCount: Number(row.read_count || 0)
    };
}

async function loadAnnouncementsForCurrentUser() {
    if (!state.userId) return;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'getAnnouncements',
                account: state.userId,
                role: state.userRole === 'admin' ? 'admin' : 'user'
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to load announcements');
        const rows = result.announcements || [];
        state.announcements = (rows || []).map(normalizeAnnouncement);
        state.unreadAnnouncementCount = state.announcements.filter(item => !item.isRead).length;
        state.announcementLoadFailed = false;
    } catch (err) {
        console.warn('公告載入失敗，登入流程不中斷。', err);
        state.announcements = [];
        state.unreadAnnouncementCount = 0;
        state.announcementLoadFailed = true;
    }
}

async function loadAdminAnnouncements() {
    if (state.userRole !== 'admin') return;
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'getAnnouncements',
            account: state.userEmail || state.userId,
            role: 'admin'
        })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Failed to load admin announcements');
    const rows = result.announcements || [];
    state.adminAnnouncements = (rows || []).map(normalizeAnnouncement);
    state.announcementLoadFailed = false;
}

function normalizeUserRecord(user = {}) {
    const account = user.account || user.user_name || user.email || '';
    return {
        ...user,
        account,
        name: user.name || account,
        email: user.email || account,
        phone: user.phone || '',
        languages: user.languages || '',
        hakka_dialect: user.hakka_dialect || '',
        life_area_1: user.life_area_1 || '',
        survey_area_1: user.survey_area_1 || '',
        life_area_2: user.life_area_2 || '',
        survey_area_2: user.survey_area_2 || '',
        life_area_3: user.life_area_3 || '',
        survey_area_3: user.survey_area_3 || ''
    };
}

function getUserDetailElementId(userKey) {
    return `user-detail-${String(userKey || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function renderUserDetailField(label, value) {
    return `
        <div class="user-detail-field">
            <span class="user-detail-label">${escapeHtml(label)}</span>
            <span class="user-detail-value">${escapeHtml(value || '未填')}</span>
        </div>
    `;
}

function renderUserDetailFields(user) {
    const detailRows = [
        ['語言', user.languages],
        ['客語腔調', user.hakka_dialect],
        ['生活區域 1', user.life_area_1],
        ['調查區域 1', user.survey_area_1],
        ['生活區域 2', user.life_area_2],
        ['調查區域 2', user.survey_area_2],
        ['生活區域 3', user.life_area_3],
        ['調查區域 3', user.survey_area_3]
    ];

    return detailRows.map(([label, value]) => renderUserDetailField(label, value)).join('');
}

function doesUserMatchIdentifier(user, identifier) {
    return getUserIdentifierAliases(user).some(alias => isSameUserIdentifier(alias, identifier));
}

function isPlaceAssignedToUser(place, user) {
    return [
        ...(place.assignedUsers || []),
        place.assignedTo,
        place.tAssignee,
        place.hAssignee
    ].filter(Boolean).some(identifier => doesUserMatchIdentifier(user, identifier));
}

function getInvestigatorWorkStats(user) {
    const assignedTaskIds = new Set(
        state.assignedPlaces
            .filter(place => isPlaceAssignedToUser(place, user))
            .map(place => String(place.id))
    );
    const recordingCount = state.uploadedRecords.filter(record =>
        doesUserMatchIdentifier(user, record.uploaderId)
    ).length;

    return {
        assignedCount: assignedTaskIds.size,
        recordingCount
    };
}

function renderInvestigatorStatChip(label, count) {
    return `<span class="user-stat-chip">${escapeHtml(label)} ${count} 筆</span>`;
}

function getAdminUserSortableValue(row, key) {
    const { user, stats } = row;
    const values = {
        name: user.name || user.account || '',
        email: user.email || user.account || '',
        phone: user.phone || '',
        assigned: stats.assignedCount,
        recordings: stats.recordingCount,
        active: user.is_active ? 1 : 0
    };
    return values[key] ?? '';
}

function sortAdminUserRows(rows) {
    const { key, direction } = state.adminUserSort || {};
    if (!key) return rows;

    const sign = direction === 'desc' ? -1 : 1;
    return [...rows].sort((left, right) => {
        const leftValue = getAdminUserSortableValue(left, key);
        const rightValue = getAdminUserSortableValue(right, key);
        if (typeof leftValue === 'number' || typeof rightValue === 'number') {
            return ((Number(leftValue) || 0) - (Number(rightValue) || 0)) * sign;
        }
        return String(leftValue).localeCompare(String(rightValue), 'zh-Hant', { numeric: true }) * sign;
    });
}

function toggleAdminUserSort(key) {
    const current = state.adminUserSort || { key: '', direction: 'desc' };
    state.adminUserSort = {
        key,
        direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
    };
    renderAdminUserManager();
}

function renderAdminUserSortHeader(label, key) {
    const current = state.adminUserSort || {};
    const active = current.key === key;
    const direction = active ? current.direction : 'desc';
    const arrow = active ? (direction === 'asc' ? '▲' : '▼') : '';
    return `
        <button
            class="user-sort-header ${active ? 'active' : ''}"
            type="button"
            onclick="toggleAdminUserSort('${escapeJsString(key)}')"
            aria-label="${escapeHtml(label)}排序${active ? (direction === 'asc' ? '，目前升冪' : '，目前降冪') : ''}"
        >
            <span>${escapeHtml(label)}</span>
            <span class="user-sort-arrow">${arrow}</span>
        </button>
    `;
}

function getUserEditInputId(fieldKey) {
    return `user-edit-${fieldKey}`;
}

function openInvestigatorEditDialog(userId) {
    const user = state.allUserRecords.find(record => record.id === userId);
    if (!user) {
        alert('找不到這位調查員資料。');
        return;
    }

    closeInvestigatorEditDialog();
    const dialog = document.createElement('div');
    dialog.id = 'user-edit-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = `
        <div class="dialog-panel user-edit-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="user-edit-title">
            <h3 id="user-edit-title">編輯調查員資料</h3>
            <p>${escapeHtml(user.name || user.account)} 的資料會同步更新 Supabase 與 Places Users 表。</p>
            <div class="user-edit-grid">
                ${USER_EDIT_FIELDS.map(field => `
                    <label class="user-edit-field">
                        <span>${escapeHtml(field.label)}${field.required ? ' *' : ''}</span>
                        <input
                            id="${escapeHtml(getUserEditInputId(field.key))}"
                            type="${field.type || 'text'}"
                            value="${escapeHtml(user[field.key] || '')}"
                            ${field.required ? 'required' : ''}
                        >
                    </label>
                `).join('')}
                <label class="user-edit-field user-edit-password-field">
                    <span>管理員密碼 *</span>
                    <input id="user-edit-admin-password" type="password" autocomplete="current-password" required>
                </label>
            </div>
            <div id="user-edit-status" class="user-edit-status" aria-live="polite"></div>
            <div class="dialog-actions">
                <button class="btn-secondary" type="button" onclick="closeInvestigatorEditDialog()">取消</button>
                <button class="btn-primary" id="user-edit-submit-btn" type="button" onclick="saveInvestigatorProfile('${escapeJsString(user.id)}')">儲存</button>
            </div>
        </div>
    `;
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeInvestigatorEditDialog();
    });
    document.body.appendChild(dialog);
    document.getElementById(getUserEditInputId('email'))?.focus();
}

function closeInvestigatorEditDialog() {
    document.getElementById('user-edit-dialog')?.remove();
}

function collectInvestigatorProfileForm() {
    return USER_EDIT_FIELDS.reduce((profile, field) => {
        const input = document.getElementById(getUserEditInputId(field.key));
        profile[field.key] = input ? input.value.trim() : '';
        return profile;
    }, {});
}

function validateInvestigatorProfile(profile, status) {
    if (!profile.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)) {
        if (status) status.textContent = '請填寫正確的 Email。';
        document.getElementById(getUserEditInputId('email'))?.focus();
        return false;
    }
    if (!profile.name) {
        if (status) status.textContent = '請填寫姓名。';
        document.getElementById(getUserEditInputId('name'))?.focus();
        return false;
    }
    const adminPasswordInput = document.getElementById('user-edit-admin-password');
    if (!adminPasswordInput || !adminPasswordInput.value) {
        if (status) status.textContent = '請輸入管理員密碼。';
        adminPasswordInput?.focus();
        return false;
    }
    return true;
}

async function writeInvestigatorProfileToPlacesSheet(user, profile, adminPassword) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'updateUserProfile',
            actorAccount: state.userId,
            adminPassword,
            userId: user.id,
            previousEmail: user.email || user.account,
            previousAccount: user.account,
            profile
        })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Places Users 表更新失敗');
    return result;
}

async function saveInvestigatorProfile(userId) {
    const user = state.allUserRecords.find(record => record.id === userId);
    const status = document.getElementById('user-edit-status');
    const submitButton = document.getElementById('user-edit-submit-btn');
    if (!user) {
        if (status) status.textContent = '找不到這位調查員資料。';
        return;
    }

    const profile = collectInvestigatorProfileForm();
    if (!validateInvestigatorProfile(profile, status)) return;
    const adminPassword = document.getElementById('user-edit-admin-password')?.value || '';

    if (status) status.textContent = '正在更新資料...';
    if (submitButton) submitButton.disabled = true;

    try {
        await writeInvestigatorProfileToPlacesSheet(user, profile, adminPassword);
        closeInvestigatorEditDialog();
        alert('調查員資料已更新，並已回寫 Places Users 表。');
        await refreshAdminUsers();
    } catch (err) {
        console.error('更新調查員資料失敗:', err);
        if (status) status.textContent = `更新失敗：${err.message}`;
        if (submitButton) submitButton.disabled = false;
    }
}

function toggleUserDetails(userKey, button) {
    const detail = document.getElementById(getUserDetailElementId(userKey));
    if (!detail) return;

    const shouldExpand = detail.hidden;
    detail.hidden = !shouldExpand;
    if (button) {
        button.setAttribute('aria-expanded', String(shouldExpand));
        button.textContent = shouldExpand ? '收合' : '展開';
    }
}

function normalizeIdentifier(value) {
    return String(value || '').trim().toLowerCase();
}

function getUserIdentifierAliases(user = {}) {
    return [
        user.account,
        user.email,
        user.name,
        user.user_name
    ].filter(Boolean);
}

function getUserRecordByAccount(account) {
    const target = normalizeIdentifier(account);
    if (!target) return null;
    return state.allUserRecords.find(user =>
        getUserIdentifierAliases(user).some(alias => normalizeIdentifier(alias) === target)
    ) || null;
}

function isSameUserIdentifier(left, right) {
    const leftNorm = normalizeIdentifier(left);
    const rightNorm = normalizeIdentifier(right);
    if (!leftNorm || !rightNorm) return false;
    if (leftNorm === rightNorm) return true;

    const leftUser = getUserRecordByAccount(left);
    const rightUser = getUserRecordByAccount(right);
    if (leftUser && rightUser) {
        return getUserIdentifierAliases(leftUser).some(leftAlias =>
            getUserIdentifierAliases(rightUser).some(rightAlias =>
                normalizeIdentifier(leftAlias) === normalizeIdentifier(rightAlias)
            )
        );
    }
    const user = leftUser || rightUser;
    const other = leftUser ? right : left;
    return !!user && getUserIdentifierAliases(user).some(alias =>
        normalizeIdentifier(alias) === normalizeIdentifier(other)
    );
}

function assignedUsersInclude(assignedUsers, identifier) {
    return normalizeAssignedUsers(assignedUsers).some(assignee => isSameUserIdentifier(assignee, identifier));
}

function getUserAnnotatorName(userOrAccount) {
    const user = typeof userOrAccount === 'object'
        ? normalizeUserRecord(userOrAccount)
        : getUserRecordByAccount(userOrAccount);
    return (user && user.name) || userOrAccount || '';
}

function getUserDisplayName(account) {
    const user = getUserRecordByAccount(account);
    return (user && user.name) || account || '';
}

function getUserEmail(account) {
    const user = getUserRecordByAccount(account);
    return (user && user.email) || account || '';
}

function getUserPhone(account) {
    const user = getUserRecordByAccount(account);
    return (user && user.phone) || '';
}

function getUserHoverTitle(userOrAccount) {
    const user = typeof userOrAccount === 'object'
        ? normalizeUserRecord(userOrAccount)
        : normalizeUserRecord(getUserRecordByAccount(userOrAccount) || { account: userOrAccount });
    const rows = [
        `姓名: ${user.name || ''}`,
        `Email: ${user.email || user.account || ''}`,
        `手機: ${user.phone || '未填'}`
    ];
    return rows.join('\n');
}

function buildPostgrestInFilter(values) {
    const quotedValues = [...new Set(values.filter(Boolean))]
        .map(value => `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    return `in.(${quotedValues.join(',')})`;
}

function mergeUserRecords(records) {
    const merged = [];
    records.map(normalizeUserRecord).forEach(user => {
        if (!user.account) return;
        const existingIndex = merged.findIndex(item => item.account === user.account || item.email === user.account);
        if (existingIndex >= 0) {
            merged[existingIndex] = { ...merged[existingIndex], ...user };
        } else {
            merged.push(user);
        }
    });
    return merged;
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
        info: t.info || '',
        nameHistory: t.name_history || '',
        location: t.location || '',
        longitude: t.longitude ?? '',
        latitude: t.latitude ?? '',
        county: t.county,
        town: t.town,
        village: t.village,
        type: t.type,
        taiClass: t.tai_class || '',
        hakClass: t.hak_class || '',
        assignedTo: t.assigned_to,
        assignedUsers: assignedUsers,
        tAssignee: t.t_assignee || '',
        hAssignee: t.h_assignee || '',
        hakArea: t.hak_area,
        recordingStatus: t.recording_status || '未錄音',
        taiAudioCount: Number(t.tai_audio_count || 0),
        hakAudioCount: Number(t.hak_audio_count || 0)
    };
}

// 「直接標注」是舊名稱，工作清單尚未整批改為「書面標注」，兩者都要認。
const WRITTEN_ANNOTATION_CLASSES = ['書面標注', '直接標注'];

function isWrittenAnnotationClass(value) {
    return WRITTEN_ANNOTATION_CLASSES.indexOf(String(value || '').trim()) >= 0;
}

function isWrittenAnnotationPlace(place) {
    if (!place) return false;
    return [place.taiClass, place.hakClass].every(isWrittenAnnotationClass);
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

function refreshPlaceRecordingStatus(place, language, delta = 1) {
    if (!place) return;
    if (language.includes('客')) {
        place.hakAudioCount = Math.max(0, Number(place.hakAudioCount || 0) + delta);
    } else {
        place.taiAudioCount = Math.max(0, Number(place.taiAudioCount || 0) + delta);
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
        name: user.name || user.account || user.user_name || '',
        phone: user.phone || '',
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
    const authSession = getSavedSupabaseAuthSession();
    const session = getSavedSession();
    if (!authSession && !session) return;

    const status = document.getElementById('login-status');
    status.innerText = '正在恢復登入狀態...';
    status.style.color = '#2c3e50';

    try {
        if (!authSession) {
            clearSession();
            throw new Error('請使用 Supabase Auth 重新登入');
        }
        const accessToken = await getSupabaseAuthAccessToken();
        if (!accessToken) throw new Error('Supabase Auth session is missing');
        const freshSession = await fetchAuthenticatedInvestigator();
        await enterApp(freshSession, { persist: false });
    } catch (err) {
        console.error('恢復登入狀態失敗:', err);
        clearSession();
        clearSupabaseAuthSession();
        status.innerText = '登入狀態已失效，請重新登入。';
        status.style.color = 'red';
    }
}

async function fetchSessionUser(account, role) {
    const params = new URLSearchParams({
        select: 'id,account,role,is_active,name,email,phone',
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
        role: users[0].role,
        name: users[0].name,
        email: users[0].email,
        phone: users[0].phone
    };
}

function getSavedSupabaseAuthSession() {
    try {
        const raw = localStorage.getItem(SUPABASE_AUTH_SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        if (!session || !session.access_token || !session.refresh_token) {
            clearSupabaseAuthSession();
            return null;
        }
        return session;
    } catch (error) {
        clearSupabaseAuthSession();
        return null;
    }
}
function saveSupabaseAuthSession(session) {
    const expiresAt = Number(session.expires_at)
        || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
    const savedSession = {
        ...session,
        expires_at: expiresAt
    };
    localStorage.setItem(SUPABASE_AUTH_SESSION_KEY, JSON.stringify(savedSession));
    return savedSession;
}
function clearSupabaseAuthSession() {
    localStorage.removeItem(SUPABASE_AUTH_SESSION_KEY);
}
async function supabaseAuthRequest(path, body, accessToken = '') {
    const headers = {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
    };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const response = await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body || {})
    });
    const responseText = await response.text();
    let payload = {};
    try {
        payload = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
        payload = { message: responseText };
    }
    if (!response.ok) {
        throw new Error(payload.error_description || payload.msg || payload.message
            || `Supabase Auth request failed (${response.status})`);
    }
    return payload;
}
async function supabaseIdentifierLoginRequest(identifier, password) {
    const response = await fetch(CONFIG.SUPABASE_AUTH_IDENTIFIER_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ identifier, password })
    });
    const responseText = await response.text();
    let payload = {};
    try {
        payload = responseText ? JSON.parse(responseText) : {};
    } catch (error) {
        payload = { message: responseText };
    }
    if (!response.ok) {
        throw new Error(payload.error_description || payload.msg || payload.message
            || 'Identifier Auth request failed (' + response.status + ')');
    }
    return payload;
}
async function signInWithSupabaseAuth(identifier, password) {
    const session = await supabaseIdentifierLoginRequest(identifier, password);
    if (!session.access_token || !session.refresh_token) {
        throw new Error('Supabase Auth did not return a session');
    }
    return saveSupabaseAuthSession(session);
}
let authRefreshPromise = null;
async function refreshSupabaseAuthSession() {
    if (authRefreshPromise) return authRefreshPromise;
    const current = getSavedSupabaseAuthSession();
    if (!current?.refresh_token) return null;
    authRefreshPromise = supabaseAuthRequest('token?grant_type=refresh_token', {
        refresh_token: current.refresh_token
    }).then(refreshed => saveSupabaseAuthSession({
        ...current,
        ...refreshed,
        refresh_token: refreshed.refresh_token || current.refresh_token
    })).catch(error => {
        clearSupabaseAuthSession();
        throw error;
    }).finally(() => {
        authRefreshPromise = null;
    });
    return authRefreshPromise;
}
async function getSupabaseAuthAccessToken() {
    const session = getSavedSupabaseAuthSession();
    if (!session) return null;
    const expiresAt = Number(session.expires_at || 0) * 1000;
    if (expiresAt && Date.now() + SUPABASE_AUTH_REFRESH_SKEW_MS < expiresAt) {
        return session.access_token;
    }
    const refreshed = await refreshSupabaseAuthSession();
    return refreshed?.access_token || null;
}
async function fetchAuthenticatedInvestigator() {
    const users = await reviewWorkflowRpc('get_authenticated_investigator', {});
    if (!Array.isArray(users) || users.length === 0) {
        throw new Error('Auth account is not linked to an active investigator');
    }
    return users[0];
}
async function signOutSupabaseAuth(sessionOverride = null) {
    const session = sessionOverride || getSavedSupabaseAuthSession();
    clearSupabaseAuthSession();
    if (!session?.access_token) return;
    try {
        await supabaseAuthRequest('logout', {}, session.access_token);
    } catch (error) {
        console.warn('Supabase Auth 登出請求失敗，已清除本機工作階段:', error);
    }
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
    await performSupabaseAuthLogin({
        passwordElementId: 'auth-password',
        expectedRole: 'nonadmin',
        button: document.getElementById('login-btn'),
        loadingText: '驗證登入中...',
        resetText: '進入我的任務',
        missingMessage: '請輸入 Email 或使用者名稱',
        passwordMessage: '請輸入 Supabase Auth 登入密碼',
        failedMessage: '一般調查員登入資訊錯誤'
    });
}
async function loginAdmin() {
    await performSupabaseAuthLogin({
        passwordElementId: 'password',
        expectedRole: 'admin',
        button: document.getElementById('admin-login-btn'),
        loadingText: '驗證管理登入中...',
        resetText: '進入管理模式',
        missingMessage: '請輸入 Email 或使用者名稱',
        passwordMessage: '請輸入管理者 Supabase Auth 登入密碼',
        failedMessage: '管理者登入資訊錯誤'
    });
}

function getLoginIdentifier() {
    return document.getElementById('email').value.trim();
}
function getLoginEmail() {
    return getLoginIdentifier();
}

async function performSupabaseAuthLogin({ passwordElementId, expectedRole, button,
    loadingText, resetText, missingMessage, passwordMessage, failedMessage }) {
    const identifier = getLoginIdentifier();
    const password = document.getElementById(passwordElementId)?.value || '';
    if (!identifier) return alert(missingMessage);
    if (!password) return alert(passwordMessage);
    const status = document.getElementById('login-status');
    status.innerText = '';
    clearSession();
    clearSupabaseAuthSession();
    button.innerText = loadingText;
    button.disabled = true;
    try {
        await signInWithSupabaseAuth(identifier, password);
        const user = normalizeAuthenticatedUser(await fetchAuthenticatedInvestigator(), identifier);
        const roleMatches = expectedRole === 'nonadmin'
            ? user.role !== 'admin'
            : user.role === expectedRole;
        if (expectedRole && !roleMatches) {
            throw new Error(`role mismatch: expected ${expectedRole}, got ${user.role || 'empty'}`);
        }
        await enterApp(user);
    } catch (error) {
        console.error('Supabase Auth 登入發生錯誤:', error);
        clearSession();
        clearSupabaseAuthSession();
        const message = error.message === 'Auth account is not linked to an active investigator'
            ? '此 Auth 帳號尚未連結啟用中的調查員帳號'
            : failedMessage;
        status.innerText = `❌ ${message}`;
        button.innerText = resetText;
        button.disabled = false;
    }
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
            const roleMatches = expectedRole === 'nonadmin' ? user.role !== 'admin' : user.role === expectedRole;
            if (expectedRole && !roleMatches) {
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
    const normalized = normalizeUserRecord({
        ...user,
        account: user.account || user.user_name || email,
        email: user.email || email
    });
    return {
        user_id: user.user_id || user.id || '',
        account: normalized.account,
        user_name: user.user_name || normalized.account,
        role: String(user.role || 'user').trim().toLowerCase() || 'user',
        email: normalized.email,
        name: normalized.name,
        phone: normalized.phone
    };
}

async function enterApp(user, options = {}) {
    const persist = options.persist !== false;
    const normalizedUser = normalizeAuthenticatedUser(user, user.email || getLoginEmail());

    state.userDbId = normalizedUser.user_id;
    state.userId = normalizedUser.account;
    state.userName = normalizedUser.name || normalizedUser.account;
    state.userEmail = normalizedUser.email || normalizedUser.account;
    state.userPhone = normalizedUser.phone || '';
    state.userRole = normalizedUser.role;
    state.userSpecialty = '';

    await loadDataFromSupabase(state.userId);
    await loadAnnouncementsForCurrentUser();
    if (persist) saveSession(normalizedUser);
    renderUserInfo();
    configureRoleUI();

    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('app-section').classList.remove('hidden');
    initFilters();
    switchTab(isProofreaderRole() ? 'review' : 'assigned');
}

function logout() {
    closePlaceMapView();
    hideSelectedMapCard();
    const authSession = getSavedSupabaseAuthSession();
    void signOutSupabaseAuth(authSession);
    clearSession();
    state.userId = '';
    state.userDbId = '';
    state.userName = '';
    state.userEmail = '';
    state.userPhone = '';
    state.userRole = '';
    state.userSpecialty = '';
    state.assignedPlaces = [];
    state.allPlaces = [];
    state.uploadedRecords = [];
    state.uploadReportRecords = [];
    state.uploadReportGroupMode = 'date';
    state.reviewQueue = [];
    state.reviewWorkflowQueue = [];
    state.reviewWorkflowDraftFilter = 'draft';
    state.reviewWorkflowAudioStatusFilter = 'all';
    state.reviewWorkflowAudioFlagFilter = 'all';
    state.reviewWorkflowAudioClaimFilter = 'all';
    state.reviewWorkflowAudioKeyword = '';
    state.reviewWorkflowAudioCountyFilter = '';
    state.reviewWorkflowAudioSelectedTowns = null;
    state.reviewWorkflowAudioTownDropdownOpen = false;
    state.reviewWorkflowAudioLanguageFilter = 'all';
    state.reviewWorkbenchMode = 'proofing';
    state.reviewWorkflowAvailable = false;
    state.selectedPlace = null;
    state.currentTab = 'assigned';
    state.selectedTowns = [];
    state.availableTowns = [];
    state.townDropdownOpen = false;
    state.selectedTypes = [];
    state.typeFiltersInitialized = false;
    state.selectedTaiClasses = [];
    state.selectedHakClasses = [];
    state.classFiltersInitialized = false;
    state.availableTypes = [];
    state.availableTaiClasses = [];
    state.availableHakClasses = [];
    state.selectedHakArea = 'all';
    state.selectedStatus = 'all';
    state.selectedStatuses = [...STATUS_FILTER_VALUES];
    state.lastSelectedPlaceIndex = null;
    state.filteredPlaces = [];
    state.selectedAssignTaskIds = new Set();
    state.renderedPlaceCount = 0;
    state.allUsers = [];
    state.allUserRecords = [];
    state.announcements = [];
    state.adminAnnouncements = [];
    state.unreadAnnouncementCount = 0;
    state.announcementLoadFailed = false;

    const userInfoDiv = document.getElementById('user-info-badge');
    if (userInfoDiv) userInfoDiv.remove();

    const adminBar = document.getElementById('admin-assign-bar');
    if (adminBar) adminBar.remove();
    const userManager = document.getElementById('admin-user-manager');
    if (userManager) userManager.remove();
    const classFilterRow = document.getElementById('class-filter-row');
    if (classFilterRow) classFilterRow.remove();
    closeAnnouncementDialog();

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
    const roleText = state.userRole === 'admin'
        ? '👑 管理員'
        : (isProofreaderRole() ? '🛡️ 校對員' : (isAudioAssessorRole() ? '🎧 音檔檢驗員' : '👤 調查員'));
    const displayName = state.userName || state.userId;
    const hoverTitle = state.userEmail || state.userId;
    const taskDownloadButton = state.userRole === 'admin' || isProofreaderRole() || isAudioAssessorRole()
        ? ''
        : '<button class="btn-download-tasks" type="button" onclick="openTaskDownloadDialog()">下載任務清單</button>';
    const feedbackButton = state.userRole === 'admin' || isProofreaderRole() || isAudioAssessorRole()
        ? ''
        : '<button class="btn-feedback" type="button" onclick="openFeedbackDialog()">問題回報</button>';
    const adminPasswordButton = state.userRole === 'admin'
        ? '<button class="btn-change-password" type="button" onclick="openAdminPasswordDialog()">變更密碼</button>'
        : '';
    const announcementLabel = state.userRole === 'admin' ? '公告管理' : '公告';
    const unreadBadge = state.unreadAnnouncementCount > 0
        ? `<span class="announcement-unread-badge" aria-label="${state.unreadAnnouncementCount} 則未讀公告">${state.unreadAnnouncementCount}</span>`
        : '';
    const announcementButton = `
        <button class="btn-announcements ${state.unreadAnnouncementCount > 0 ? 'has-unread' : ''}" type="button" onclick="openAnnouncementDialog()">
            <span>${announcementLabel}</span>${unreadBadge}
        </button>`;
    const tutorialButton = '<button class="btn-tutorial" type="button" onclick="startTutorial()">使用教學</button>';
    userInfoDiv.innerHTML = `
        <div>
            <div>${roleText}：${state.userId}</div>
            <div class="user-mode">${state.userRole === 'admin' ? '管理員模式' : (isReviewWorkflowRole() ? '審查工作模式' : '調查任務模式')}</div>
        </div>
        <div class="user-action-group">
            <div class="user-primary-actions">
                ${announcementButton}
                <button class="btn-user-more" type="button" aria-expanded="false" aria-controls="user-secondary-actions" onclick="toggleUserMoreMenu(event)">更多</button>
            </div>
            <div id="user-secondary-actions" class="user-secondary-actions">
                ${tutorialButton}
                ${taskDownloadButton}
                ${feedbackButton}
                ${adminPasswordButton}
                <button class="btn-logout" onclick="logout()">登出</button>
            </div>
        </div>
    `;
    const identityLine = userInfoDiv.querySelector('div > div');
    if (identityLine) {
        identityLine.textContent = `${roleText}: ${displayName}`;
        identityLine.title = hoverTitle;
    }
}

function closeUserMoreMenu() {
    const menu = document.getElementById('user-secondary-actions');
    const button = document.querySelector('.btn-user-more');
    if (!menu || !button) return;
    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
}

function toggleUserMoreMenu(event) {
    event?.stopPropagation();
    const menu = document.getElementById('user-secondary-actions');
    const button = document.querySelector('.btn-user-more');
    if (!menu || !button) return;
    const shouldOpen = !menu.classList.contains('is-open');
    menu.classList.toggle('is-open', shouldOpen);
    button.setAttribute('aria-expanded', String(shouldOpen));
}

function closeAnnouncementDialog() {
    document.getElementById('announcement-dialog')?.remove();
}

const TUTORIAL_DEMO_PLACE = {
    id: 'tutorial-demo-place',
    sourceId: 'TUTORIAL-0001',
    placeName: '教學示範地名',
    county: '示範縣',
    town: '示範鄉',
    type: '聚落',
    tAssignee: '教學調查員',
    hAssignee: '',
    assignedUsers: ['教學調查員'],
    taiAudioCount: 0,
    hakAudioCount: 0,
    recordingStatus: '未錄音',
    sourceTable: 'tutorial'
};

const TUTORIAL_AUDIO_DATA_URL = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

function cloneTutorialStateValue(value) {
    if (value instanceof Set) return new Set(value);
    if (Array.isArray(value)) return [...value];
    if (value && typeof value === 'object') return { ...value };
    return value;
}

function captureTutorialSnapshot() {
    const keys = [
        'assignedPlaces',
        'allPlaces',
        'filteredPlaces',
        'selectedPlace',
        'selectedTowns',
        'availableTowns',
        'selectedTypes',
        'typeFiltersInitialized',
        'availableTypes',
        'selectedHakArea',
        'selectedStatus',
        'selectedStatuses',
        'lastSelectedPlaceIndex',
        'renderedPlaceCount',
        'selectedAssignTaskIds',
        'currentTab'
    ];
    const stateSnapshot = {};
    keys.forEach(key => {
        stateSnapshot[key] = cloneTutorialStateValue(state[key]);
    });
    return {
        state: stateSnapshot,
        inputs: {
            county: document.getElementById('county-filter')?.value || '',
            search: document.getElementById('search-box')?.value || '',
            taihan: document.getElementById('taihan-input')?.value || '',
            tl1: document.getElementById('tl1-input')?.value || '',
            tainote: document.getElementById('tainote-input')?.value || '',
            audioSrc: document.getElementById('audio-playback')?.getAttribute('src') || ''
        },
        audioBlob,
        uploadedFileName
    };
}

function restoreTutorialSnapshot() {
    if (!tutorialState?.snapshot) return;
    Object.entries(tutorialState.snapshot.state).forEach(([key, value]) => {
        state[key] = cloneTutorialStateValue(value);
    });
    audioBlob = tutorialState.snapshot.audioBlob;
    uploadedFileName = tutorialState.snapshot.uploadedFileName;
    initFilters();
    const county = document.getElementById('county-filter');
    const search = document.getElementById('search-box');
    if (county) county.value = tutorialState.snapshot.inputs.county || '';
    updateTowns(state.selectedTowns || []);
    if (search) search.value = tutorialState.snapshot.inputs.search || '';
    applyFilters();
    if (state.selectedPlace) {
        const selectedItem = Array.from(document.querySelectorAll('.place-item')).find(item =>
            item.textContent.includes(state.selectedPlace.placeName || '')
        );
        openRecordingUI(state.selectedPlace, selectedItem || null);
    } else {
        closeRecordingUI();
    }
    const playback = document.getElementById('audio-playback');
    if (playback) {
        if (tutorialState.snapshot.inputs.audioSrc) playback.src = tutorialState.snapshot.inputs.audioSrc;
        else playback.removeAttribute('src');
    }
}

function getTutorialSteps() {
    return [
        {
            selector: '#tab-assigned',
            title: '1. 任務清單',
            body: '這裡是調查員被指派的地名。教學會用一筆示範地名，不會寫入正式資料。',
            before: setupTutorialDemoList
        },
        {
            selector: '.filter-section',
            title: '2. 篩選地名',
            body: '先用縣市、鄉鎮、類型和關鍵字縮小清單。示範會填入「教學」。',
            before: setupTutorialFilters
        },
        {
            selector: '.place-item',
            title: '3. 選擇地名',
            body: '點一筆地名後，下方會開啟登錄區。這一步會打開示範地名。',
            before: setupTutorialSelectedPlace
        },
        {
            selector: '.annotation-panel',
            title: '4. 輸入文字',
            body: '先輸入漢字、音標和備註。這些示範文字只是暫時顯示，不會儲存。',
            before: setupTutorialTextInputs
        },
        {
            selector: '#start-btn',
            title: '5. 新增錄音',
            body: '實際操作時按下開始錄音，錄完後按停止。教學不會要求麥克風權限。',
            before: setupTutorialRecordingStart
        },
        {
            selector: '#audio-confirm-panel',
            title: '6. 確認並重播錄音',
            body: '錄音後會出現音檔確認區，可以先重播檢查，再決定是否上傳。',
            before: setupTutorialRecordedAudio
        },
        {
            selector: '#file-btn',
            title: '7. 新增上傳錄音檔',
            body: '如果錄音在 LINE 或手機裡，也可以改用上傳音檔。教學只標示入口，不會開檔案選擇器。',
            before: setupTutorialFileUpload
        },
        {
            selector: '#upload-btn',
            title: '8. 確認上傳',
            body: '確認文字和音檔都正確後才按上傳。教學不會真的送出資料。',
            before: setupTutorialUploadReady
        },
        {
            selector: '#user-info-badge',
            title: '教學結束',
            body: '你可以開始登錄；之後也能再按「使用教學」重看一次。',
            before: setupTutorialEnd
        }
    ];
}

function startTutorial() {
    if (tutorialState) endTutorial({ restore: true });
    closeAnnouncementDialog();
    tutorialState = {
        index: -1,
        snapshot: captureTutorialSnapshot()
    };
    const overlay = document.createElement('div');
    overlay.id = 'tutorial-overlay';
    overlay.innerHTML = `
        <div class="tutorial-highlight" aria-hidden="true"></div>
        <div class="tutorial-arrow" aria-hidden="true"></div>
        <div class="tutorial-popover" role="dialog" aria-live="polite">
            <div class="tutorial-step-count"></div>
            <h3></h3>
            <p></p>
            <div class="tutorial-actions">
                <button class="tutorial-skip" type="button">略過</button>
                <button class="tutorial-next" type="button">下一步</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', handleTutorialOverlayClick);
    overlay.querySelector('.tutorial-skip')?.addEventListener('click', event => {
        event.stopPropagation();
        endTutorial({ restore: true });
    });
    overlay.querySelector('.tutorial-next')?.addEventListener('click', event => {
        event.stopPropagation();
        advanceTutorial();
    });
    window.addEventListener('resize', positionTutorialStep);
    advanceTutorial();
}

function handleTutorialOverlayClick(event) {
    if (event.target.closest('.tutorial-popover')) return;
    advanceTutorial();
}

function advanceTutorial() {
    if (!tutorialState) return;
    tutorialState.index += 1;
    const steps = getTutorialSteps();
    if (tutorialState.index >= steps.length) {
        endTutorial({ restore: true });
        return;
    }
    document.querySelectorAll('.tutorial-pulse').forEach(el => el.classList.remove('tutorial-pulse'));
    const step = steps[tutorialState.index];
    if (typeof step.before === 'function') step.before();
    renderTutorialStep(step, tutorialState.index, steps.length);
}

function renderTutorialStep(step, index, total) {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay) return;
    const popover = overlay.querySelector('.tutorial-popover');
    overlay.querySelector('.tutorial-step-count').textContent = `${index + 1} / ${total}`;
    overlay.querySelector('h3').textContent = step.title;
    overlay.querySelector('p').textContent = step.body;
    overlay.querySelector('.tutorial-next').textContent = index === total - 1 ? '完成' : '下一步';
    positionTutorialStep();
    popover?.focus?.();
}

function positionTutorialStep() {
    if (!tutorialState) return;
    const steps = getTutorialSteps();
    const step = steps[tutorialState.index];
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay || !step) return;
    const target = document.querySelector(step.selector);
    const highlight = overlay.querySelector('.tutorial-highlight');
    const popover = overlay.querySelector('.tutorial-popover');
    const arrow = overlay.querySelector('.tutorial-arrow');
    if (!target || !highlight || !popover || !arrow) return;

    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    window.setTimeout(() => {
        const rect = target.getBoundingClientRect();
        const padding = 8;
        const top = Math.max(8, rect.top - padding);
        const left = Math.max(8, rect.left - padding);
        const width = Math.min(window.innerWidth - left - 8, rect.width + padding * 2);
        const height = Math.min(window.innerHeight - top - 8, rect.height + padding * 2);
        highlight.style.top = `${top}px`;
        highlight.style.left = `${left}px`;
        highlight.style.width = `${width}px`;
        highlight.style.height = `${height}px`;

        const popoverWidth = Math.min(360, window.innerWidth - 24);
        popover.style.width = `${popoverWidth}px`;
        let popoverTop = top + height + 18;
        if (popoverTop + 210 > window.innerHeight) popoverTop = Math.max(12, top - 220);
        let popoverLeft = Math.min(window.innerWidth - popoverWidth - 12, Math.max(12, left));
        popover.style.top = `${popoverTop}px`;
        popover.style.left = `${popoverLeft}px`;

        arrow.style.top = `${Math.max(12, Math.min(window.innerHeight - 24, top + height + 2))}px`;
        arrow.style.left = `${Math.max(24, Math.min(window.innerWidth - 24, left + Math.min(width / 2, 140)))}px`;
    }, 120);
}

function setupTutorialDemoList() {
    document.getElementById('app-section')?.classList.remove('hidden');
    state.currentTab = 'assigned';
    document.getElementById('tab-assigned')?.classList.add('active');
    document.getElementById('tab-other')?.classList.remove('active');
    document.getElementById('tab-review')?.classList.remove('active');
    document.getElementById('tab-users')?.classList.remove('active');
    state.assignedPlaces = [TUTORIAL_DEMO_PLACE, ...state.assignedPlaces.filter(place => place.id !== TUTORIAL_DEMO_PLACE.id)];
    state.allPlaces = state.allPlaces.filter(place => place.id !== TUTORIAL_DEMO_PLACE.id);
    state.selectedPlace = null;
    state.selectedStatuses = [...STATUS_FILTER_VALUES];
    initFilters();
    state.selectedTypes = [...state.availableTypes];
    renderMultiFilterChips('type-container', 'types', '?券憿', state.availableTypes, state.selectedTypes, getTypeDisplayText);
    syncStatusFilterChips();
    document.getElementById('county-filter').value = '';
    document.getElementById('search-box').value = '';
    applyFilters();
}

function setupTutorialFilters() {
    setupTutorialDemoList();
    const county = document.getElementById('county-filter');
    const search = document.getElementById('search-box');
    if (county) {
        county.value = TUTORIAL_DEMO_PLACE.county;
        updateTowns([TUTORIAL_DEMO_PLACE.town]);
    }
    if (search) search.value = '教學';
    applyFilters();
}

function setupTutorialSelectedPlace() {
    setupTutorialFilters();
    const item = document.querySelector('.place-item');
    openRecordingUI(TUTORIAL_DEMO_PLACE, item);
}

function setupTutorialTextInputs() {
    setupTutorialSelectedPlace();
    switchAnnotationLanguage('?啗?');
    const taihan = document.getElementById('taihan-input');
    const tl1 = document.getElementById('tl1-input');
    const tainote = document.getElementById('tainote-input');
    if (taihan) taihan.value = '教學示範地名';
    if (tl1) tl1.value = 'kau3-hak8 si7-huan7';
    if (tainote) tainote.value = '這裡填寫調查備註。';
}

function setupTutorialRecordingStart() {
    setupTutorialTextInputs();
    document.querySelector('.audio-source-panel')?.classList.remove('hidden');
    document.getElementById('audio-confirm-panel')?.classList.add('hidden');
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('file-btn').style.display = 'block';
    document.getElementById('stop-btn').style.display = 'none';
    const status = document.getElementById('status');
    if (status) {
        status.textContent = '教學示範：這一步不會啟用麥克風。';
        status.style.color = '#2c3e50';
    }
}

function setupTutorialRecordedAudio() {
    setupTutorialTextInputs();
    audioBlob = new Blob(['tutorial-audio'], { type: 'audio/wav' });
    uploadedFileName = '';
    const playback = document.getElementById('audio-playback');
    if (playback) playback.src = TUTORIAL_AUDIO_DATA_URL;
    showAudioConfirmation('教學示範錄音', null);
    const status = document.getElementById('status');
    if (status) {
        status.textContent = '教學示範：可以在這裡重播檢查音檔。';
        status.style.color = 'green';
    }
}

function setupTutorialFileUpload() {
    setupTutorialRecordingStart();
    document.getElementById('file-btn')?.classList.add('tutorial-pulse');
}

function setupTutorialUploadReady() {
    setupTutorialRecordedAudio();
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
        uploadBtn.style.display = 'block';
        uploadBtn.classList.add('tutorial-pulse');
    }
}

function setupTutorialEnd() {
    restoreTutorialSnapshot();
}

function endTutorial(options = {}) {
    window.removeEventListener('resize', positionTutorialStep);
    document.getElementById('tutorial-overlay')?.remove();
    document.querySelectorAll('.tutorial-pulse').forEach(el => el.classList.remove('tutorial-pulse'));
    const shouldRestore = options.restore !== false;
    if (shouldRestore && tutorialState?.snapshot) restoreTutorialSnapshot();
    tutorialState = null;
}

async function openAnnouncementDialog() {
    closeAnnouncementDialog();

    if (state.userRole === 'admin') {
        await loadAdminAnnouncements().catch(err => {
            console.error('載入公告管理資料失敗', err);
            state.adminAnnouncements = [];
            state.announcementLoadFailed = true;
        });
    } else {
        await loadAnnouncementsForCurrentUser();
        renderUserInfo();
    }

    const dialog = document.createElement('div');
    dialog.id = 'announcement-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = state.userRole === 'admin'
        ? renderAdminAnnouncementDialog()
        : renderUserAnnouncementDialog();
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeAnnouncementDialog();
    });
    document.body.appendChild(dialog);
}

function renderUserAnnouncementDialog() {
    if (state.announcementLoadFailed) {
        return `
            <div class="dialog-panel announcement-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
                <div class="announcement-dialog-header">
                    <div>
                        <h3 id="announcement-title">公告須知</h3>
                        <p>公告服務暫時無法載入，請稍後再試。你仍可正常使用登錄功能。</p>
                    </div>
                    <button class="dialog-close-icon" type="button" onclick="closeAnnouncementDialog()" aria-label="關閉">×</button>
                </div>
            </div>
        `;
    }
    const unreadCount = state.announcements.filter(item => !item.isRead).length;
    const items = state.announcements.length === 0
        ? '<div class="empty-state compact">目前沒有公告。</div>'
        : state.announcements.map(renderUserAnnouncementItem).join('');
    return `
        <div class="dialog-panel announcement-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
            <div class="announcement-dialog-header">
                <div>
                    <h3 id="announcement-title">公告須知</h3>
                    <p>${unreadCount > 0 ? `尚有 ${unreadCount} 則公告需要按下已讀。` : '所有公告都已讀。'}</p>
                </div>
                <button class="dialog-close-icon" type="button" onclick="closeAnnouncementDialog()" aria-label="關閉">×</button>
            </div>
            <div class="announcement-list">${items}</div>
        </div>
    `;
}

function renderUserAnnouncementItem(item) {
    const targetText = item.targetAccount ? '專屬消息' : '全體公告';
    const readAction = item.isRead
        ? `<span class="announcement-read-state">已讀 ${escapeHtml(formatAnnouncementDate(item.readAt))}</span>`
        : `<button class="btn-primary announcement-read-btn" type="button" onclick="markAnnouncementRead('${escapeJsString(item.id)}', this)">已讀</button>`;
    return `
        <article class="announcement-item ${item.isRead ? 'is-read' : 'is-unread'}">
            <div class="announcement-item-meta">
                <span>${escapeHtml(targetText)}</span>
                <time>${escapeHtml(formatAnnouncementDate(item.createdAt))}</time>
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>
            <div class="announcement-item-actions">${readAction}</div>
        </article>
    `;
}

function renderAdminAnnouncementDialog() {
    if (state.announcementLoadFailed) {
        return `
            <div class="dialog-panel announcement-dialog-panel admin-announcement-panel" role="dialog" aria-modal="true" aria-labelledby="admin-announcement-title">
                <div class="announcement-dialog-header">
                    <div>
                        <h3 id="admin-announcement-title">公告管理</h3>
                        <p>公告管理服務暫時無法載入。若剛部署前端，請確認 root GAS 已推送並部署。</p>
                    </div>
                    <button class="dialog-close-icon" type="button" onclick="closeAnnouncementDialog()" aria-label="關閉">×</button>
                </div>
            </div>
        `;
    }
    const targetOptions = state.allUserRecords
        .filter(user => user.role !== 'admin')
        .map(user => {
            const account = user.account || user.email || '';
            const label = `${user.name || account} (${user.email || account})`;
            return `<option value="${escapeHtml(account)}">${escapeHtml(label)}</option>`;
        }).join('');
    const items = state.adminAnnouncements.length === 0
        ? '<div class="empty-state compact">目前尚未張貼公告。</div>'
        : state.adminAnnouncements.map(renderAdminAnnouncementItem).join('');

    return `
        <div class="dialog-panel announcement-dialog-panel admin-announcement-panel" role="dialog" aria-modal="true" aria-labelledby="admin-announcement-title">
            <div class="announcement-dialog-header">
                <div>
                    <h3 id="admin-announcement-title">公告管理</h3>
                    <p>可張貼全體公告，或指定單一調查員的專屬消息。</p>
                </div>
                <button class="dialog-close-icon" type="button" onclick="closeAnnouncementDialog()" aria-label="關閉">×</button>
            </div>
            <div class="announcement-compose">
                <label class="announcement-field">
                    <span>發布對象</span>
                    <select id="announcement-target">
                        <option value="">全體調查員</option>
                        ${targetOptions}
                    </select>
                </label>
                <label class="announcement-field">
                    <span>標題</span>
                    <input id="announcement-title-input" type="text" maxlength="120">
                </label>
                <label class="announcement-field">
                    <span>內容</span>
                    <textarea id="announcement-body-input" rows="5"></textarea>
                </label>
                <label class="announcement-field">
                    <span>管理員密碼</span>
                    <input id="announcement-admin-password" type="password" autocomplete="current-password">
                </label>
                <div id="announcement-compose-status" class="feedback-status" aria-live="polite"></div>
                <button class="btn-primary announcement-submit-btn" id="announcement-submit-btn" type="button" onclick="submitAnnouncement()">發布公告</button>
            </div>
            <div class="announcement-admin-history">
                <h4>已發布公告</h4>
                <div class="announcement-list">${items}</div>
            </div>
        </div>
    `;
}

function renderAdminAnnouncementItem(item) {
    const targetText = item.targetAccount ? `專屬：${item.targetAccount}` : '全體調查員';
    return `
        <article class="announcement-item is-read">
            <div class="announcement-item-meta">
                <span>${escapeHtml(targetText)}</span>
                <time>${escapeHtml(formatAnnouncementDate(item.createdAt))}</time>
            </div>
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>
            <div class="announcement-read-state">已讀人數 ${item.readCount}</div>
        </article>
    `;
}

async function markAnnouncementRead(announcementId, button) {
    if (!announcementId || !state.userId) return;
    const originalText = button?.textContent || '已讀';
    if (button) {
        button.disabled = true;
        button.textContent = '處理中...';
    }
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'markAnnouncementRead',
                announcementId,
                readerAccount: state.userId
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to mark announcement read');
        await loadAnnouncementsForCurrentUser();
        renderUserInfo();
        const dialog = document.getElementById('announcement-dialog');
        if (dialog) dialog.innerHTML = renderUserAnnouncementDialog();
    } catch (err) {
        console.error('公告已讀失敗', err);
        alert('標記已讀失敗，請稍後再試。');
        if (button) {
            button.disabled = false;
            button.textContent = originalText;
        }
    }
}

async function submitAnnouncement() {
    if (state.userRole !== 'admin') return;
    const targetInput = document.getElementById('announcement-target');
    const titleInput = document.getElementById('announcement-title-input');
    const bodyInput = document.getElementById('announcement-body-input');
    const passwordInput = document.getElementById('announcement-admin-password');
    const status = document.getElementById('announcement-compose-status');
    const button = document.getElementById('announcement-submit-btn');

    const title = titleInput?.value.trim() || '';
    const body = bodyInput?.value.trim() || '';
    const adminPassword = passwordInput?.value || '';
    if (!title) {
        if (status) status.textContent = '請輸入公告標題。';
        titleInput?.focus();
        return;
    }
    if (!body) {
        if (status) status.textContent = '請輸入公告內容。';
        bodyInput?.focus();
        return;
    }
    if (!adminPassword) {
        if (status) status.textContent = '請輸入管理員密碼。';
        passwordInput?.focus();
        return;
    }

    const originalText = button?.textContent || '發布公告';
    if (status) status.textContent = '';
    if (button) {
        button.disabled = true;
        button.textContent = '發布中...';
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'createAnnouncement',
                actorAccount: state.userEmail || state.userId,
                adminPassword,
                title,
                body,
                targetAccount: targetInput?.value || ''
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to create announcement');

        await loadAdminAnnouncements();
        const dialog = document.getElementById('announcement-dialog');
        if (dialog) dialog.innerHTML = renderAdminAnnouncementDialog();
    } catch (err) {
        console.error('發布公告失敗', err);
        if (status) status.textContent = `發布失敗：${err.message}`;
    } finally {
        const currentButton = document.getElementById('announcement-submit-btn');
        if (currentButton) {
            currentButton.disabled = false;
            currentButton.textContent = originalText;
        }
    }
}

function openAdminPasswordDialog() {
    if (state.userRole !== 'admin') return;
    closeAdminPasswordDialog();

    const dialog = document.createElement('div');
    dialog.id = 'admin-password-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = `
        <div class="dialog-panel admin-password-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="admin-password-title">
            <h3 id="admin-password-title">變更管理員密碼</h3>
            <label class="user-edit-field">
                <span>目前密碼</span>
                <input id="admin-current-password" type="password" autocomplete="current-password" required>
            </label>
            <label class="user-edit-field">
                <span>新密碼</span>
                <input id="admin-new-password" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <label class="user-edit-field">
                <span>確認新密碼</span>
                <input id="admin-confirm-password" type="password" autocomplete="new-password" minlength="8" required>
            </label>
            <div id="admin-password-status" class="user-edit-status" aria-live="polite"></div>
            <div class="dialog-actions">
                <button class="btn-secondary" type="button" onclick="closeAdminPasswordDialog()">取消</button>
                <button class="btn-primary" id="admin-password-submit-btn" type="button" onclick="submitAdminPasswordChange()">儲存</button>
            </div>
        </div>
    `;
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeAdminPasswordDialog();
    });
    document.body.appendChild(dialog);
    document.getElementById('admin-current-password')?.focus();
}

function closeAdminPasswordDialog() {
    document.getElementById('admin-password-dialog')?.remove();
}

async function submitAdminPasswordChange() {
    const currentPasswordInput = document.getElementById('admin-current-password');
    const newPasswordInput = document.getElementById('admin-new-password');
    const confirmPasswordInput = document.getElementById('admin-confirm-password');
    const submitButton = document.getElementById('admin-password-submit-btn');
    const status = document.getElementById('admin-password-status');

    const currentPassword = currentPasswordInput?.value || '';
    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    if (!currentPassword) {
        if (status) status.textContent = '請輸入目前密碼。';
        currentPasswordInput?.focus();
        return;
    }
    if (newPassword.length < 8) {
        if (status) status.textContent = '新密碼至少需要 8 個字元。';
        newPasswordInput?.focus();
        return;
    }
    if (newPassword !== confirmPassword) {
        if (status) status.textContent = '兩次輸入的新密碼不一致。';
        confirmPasswordInput?.focus();
        return;
    }
    if (newPassword === currentPassword) {
        if (status) status.textContent = '新密碼不能與目前密碼相同。';
        newPasswordInput?.focus();
        return;
    }

    const originalText = submitButton?.textContent || '儲存';
    if (status) status.textContent = '';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '儲存中...';
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'changeAdminPassword',
                actorAccount: state.userEmail || state.userId,
                currentPassword,
                newPassword
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to change password');

        closeAdminPasswordDialog();
        alert('管理員密碼已更新。下次登入請使用新密碼。');
    } catch (err) {
        console.error('變更管理員密碼失敗:', err);
        if (status) status.textContent = `變更失敗：${err.message}`;
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
        }
    }
}

function comparePlaceText(leftValue, rightValue) {
    return String(leftValue || '').localeCompare(String(rightValue || ''), 'zh-Hant', { numeric: true });
}

function comparePlacesByLocation(left, right, includeUuid = false) {
    const fields = ['county', 'town', 'village', 'placeName'];
    for (const field of fields) {
        const comparison = comparePlaceText(left[field], right[field]);
        if (comparison !== 0) return comparison;
    }
    if (!includeUuid) return 0;
    return comparePlaceText(left.sourceId || left.id, right.sourceId || right.id);
}

function getAssignedTaskExportRows() {
    return [...state.assignedPlaces].sort((left, right) => comparePlacesByLocation(left, right));
}

function getTaskExportCell(place, column) {
    if (TASK_EXPORT_FIELD_COLUMNS.some(field => field.key === column.key)) return '';
    if (column.key === 'type') return place.type || place.Type || '';
    return place[column.key] || '';
}

function getTaskExportFileBaseName() {
    const userPart = (state.userName || state.userId || 'investigator')
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-');
    const datePart = new Date().toISOString().slice(0, 10);
    return `task-list-${userPart}-${datePart}`;
}

function openTaskDownloadDialog() {
    const rows = getAssignedTaskExportRows();
    if (rows.length === 0) {
        alert('目前沒有可下載的指派任務。');
        return;
    }

    closeTaskDownloadDialog();
    const dialog = document.createElement('div');
    dialog.id = 'task-download-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = `
        <div class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="task-download-title">
            <h3 id="task-download-title">下載任務清單</h3>
            <p>將 ${rows.length} 筆已指派任務依縣市排序匯出。</p>
            <div class="dialog-actions">
                <button class="btn-secondary" type="button" onclick="downloadAssignedTaskList('pdf')">下載 PDF</button>
                <button class="btn-primary" type="button" onclick="downloadAssignedTaskList('xlsx')">下載 XLSX</button>
            </div>
            <button class="dialog-close" type="button" onclick="closeTaskDownloadDialog()" aria-label="關閉">關閉</button>
        </div>
    `;
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeTaskDownloadDialog();
    });
    document.body.appendChild(dialog);
}

function closeTaskDownloadDialog() {
    document.getElementById('task-download-dialog')?.remove();
}

function openFeedbackDialog() {
    closeFeedbackDialog();
    const dialog = document.createElement('div');
    dialog.id = 'feedback-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = `
        <div class="dialog-panel feedback-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="feedback-dialog-title">
            <h3 id="feedback-dialog-title">問題回報</h3>
            <div class="feedback-admin-card">
                <span>管理者</span>
                <strong>專案助理 - 藍君偉 Nâ Kun-uí</strong>
                <a href="mailto:kunui711@mail.naer.edu.tw">kunui711@mail.naer.edu.tw</a>
            </div>
            <label class="feedback-field">
                <span>主旨</span>
                <input id="feedback-subject" type="text" maxlength="120" autocomplete="off">
            </label>
            <label class="feedback-field">
                <span>意見內容</span>
                <textarea id="feedback-message" rows="7"></textarea>
            </label>
            <div id="feedback-status" class="feedback-status" aria-live="polite"></div>
            <div class="dialog-actions">
                <button class="btn-secondary" type="button" onclick="closeFeedbackDialog()">取消</button>
                <button class="btn-primary" id="feedback-submit-btn" type="button" onclick="submitFeedback()">送出回報</button>
            </div>
        </div>
    `;
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeFeedbackDialog();
    });
    document.body.appendChild(dialog);
    document.getElementById('feedback-subject')?.focus();
}

function closeFeedbackDialog() {
    document.getElementById('feedback-dialog')?.remove();
}

async function submitFeedback() {
    const subjectInput = document.getElementById('feedback-subject');
    const messageInput = document.getElementById('feedback-message');
    const submitButton = document.getElementById('feedback-submit-btn');
    const status = document.getElementById('feedback-status');
    const subject = subjectInput ? subjectInput.value : '';
    const message = messageInput ? messageInput.value : '';

    if (!subject.trim()) {
        if (status) status.textContent = '請填寫問題主旨。';
        subjectInput?.focus();
        return;
    }
    if (!message.trim()) {
        if (status) status.textContent = '請填寫意見內容。';
        messageInput?.focus();
        return;
    }

    const originalText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '送出中...';
    }
    if (status) status.textContent = '';

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'submitFeedback',
                investigatorName: state.userName || state.userId,
                investigatorEmail: state.userEmail || state.userId,
                subject: subject,
                message: message
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || '送出失敗');

        alert(`問題回報已送出，編號：${result.feedbackId}`);
        closeFeedbackDialog();
    } catch (error) {
        if (status) status.textContent = `送出失敗：${error.message}`;
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText || '送出回報';
        }
    }
}

async function downloadAssignedTaskList(format) {
    const rows = getAssignedTaskExportRows();
    if (rows.length === 0) {
        alert('目前沒有可下載的指派任務。');
        closeTaskDownloadDialog();
        return;
    }

    if (format === 'xlsx') {
        downloadTaskListXlsx(rows);
    } else {
        await downloadTaskListPdf(rows);
    }
    closeTaskDownloadDialog();
}

function downloadTaskListXlsx(rows) {
    const sheetRows = [
        TASK_EXPORT_COLUMNS.map(column => column.label),
        ...rows.map(place => TASK_EXPORT_COLUMNS.map(column => getTaskExportCell(place, column)))
    ];
    const xlsxBlob = createXlsxBlob(sheetRows);
    downloadBlob(
        xlsxBlob,
        `${getTaskExportFileBaseName()}.xlsx`
    );
}

function createXlsxBlob(rows) {
    const files = [
        {
            name: '[Content_Types].xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`
        },
        {
            name: '_rels/.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`
        },
        {
            name: 'xl/workbook.xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="任務清單" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`
        },
        {
            name: 'xl/_rels/workbook.xml.rels',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`
        },
        {
            name: 'xl/styles.xml',
            data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`
        },
        {
            name: 'xl/worksheets/sheet1.xml',
            data: buildWorksheetXml(rows)
        }
    ];
    return createZipBlob(files, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

function buildWorksheetXml(rows) {
    const columnWidths = [14, 14, 16, 20, 16, 18, 22, 16, 18, 22];
    const colsXml = columnWidths
        .map((width, index) => `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`)
        .join('');
    const sheetData = rows.map((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const cells = row.map((value, columnIndex) => {
            const cellRef = `${getXlsxColumnName(columnIndex + 1)}${rowNumber}`;
            const style = rowIndex === 0 ? ' s="1"' : '';
            const text = String(value ?? '');
            if (!text) return `<c r="${cellRef}"${style}/>`;
            return `<c r="${cellRef}" t="inlineStr"${style}><is><t>${escapeXml(text)}</t></is></c>`;
        }).join('');
        return `<row r="${rowNumber}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${colsXml}</cols>
  <sheetData>${sheetData}</sheetData>
</worksheet>`;
}

function getXlsxColumnName(index) {
    let name = '';
    let current = index;
    while (current > 0) {
        const remainder = (current - 1) % 26;
        name = String.fromCharCode(65 + remainder) + name;
        current = Math.floor((current - 1) / 26);
    }
    return name;
}

function escapeXml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function createZipBlob(files, type) {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;
    const now = new Date();
    const dosTime = ((now.getHours() & 0x1f) << 11) | ((now.getMinutes() & 0x3f) << 5) | ((Math.floor(now.getSeconds() / 2)) & 0x1f);
    const dosDate = (((now.getFullYear() - 1980) & 0x7f) << 9) | (((now.getMonth() + 1) & 0x0f) << 5) | (now.getDate() & 0x1f);

    files.forEach(file => {
        const nameBytes = encoder.encode(file.name);
        const dataBytes = encoder.encode(file.data);
        const crc = getCrc32(dataBytes);
        const localHeader = createZipHeader(30);
        writeUint32(localHeader, 0, 0x04034b50);
        writeUint16(localHeader, 4, 20);
        writeUint16(localHeader, 6, 0);
        writeUint16(localHeader, 8, 0);
        writeUint16(localHeader, 10, dosTime);
        writeUint16(localHeader, 12, dosDate);
        writeUint32(localHeader, 14, crc);
        writeUint32(localHeader, 18, dataBytes.length);
        writeUint32(localHeader, 22, dataBytes.length);
        writeUint16(localHeader, 26, nameBytes.length);
        writeUint16(localHeader, 28, 0);
        localParts.push(localHeader, nameBytes, dataBytes);

        const centralHeader = createZipHeader(46);
        writeUint32(centralHeader, 0, 0x02014b50);
        writeUint16(centralHeader, 4, 20);
        writeUint16(centralHeader, 6, 20);
        writeUint16(centralHeader, 8, 0);
        writeUint16(centralHeader, 10, 0);
        writeUint16(centralHeader, 12, dosTime);
        writeUint16(centralHeader, 14, dosDate);
        writeUint32(centralHeader, 16, crc);
        writeUint32(centralHeader, 20, dataBytes.length);
        writeUint32(centralHeader, 24, dataBytes.length);
        writeUint16(centralHeader, 28, nameBytes.length);
        writeUint16(centralHeader, 30, 0);
        writeUint16(centralHeader, 32, 0);
        writeUint16(centralHeader, 34, 0);
        writeUint16(centralHeader, 36, 0);
        writeUint32(centralHeader, 38, 0);
        writeUint32(centralHeader, 42, offset);
        centralParts.push(centralHeader, nameBytes);

        offset += localHeader.length + nameBytes.length + dataBytes.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const endHeader = createZipHeader(22);
    writeUint32(endHeader, 0, 0x06054b50);
    writeUint16(endHeader, 4, 0);
    writeUint16(endHeader, 6, 0);
    writeUint16(endHeader, 8, files.length);
    writeUint16(endHeader, 10, files.length);
    writeUint32(endHeader, 12, centralSize);
    writeUint32(endHeader, 16, centralOffset);
    writeUint16(endHeader, 20, 0);

    return new Blob([...localParts, ...centralParts, endHeader], { type });
}

function createZipHeader(length) {
    return new Uint8Array(length);
}

function writeUint16(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32(bytes, offset, value) {
    bytes[offset] = value & 0xff;
    bytes[offset + 1] = (value >>> 8) & 0xff;
    bytes[offset + 2] = (value >>> 16) & 0xff;
    bytes[offset + 3] = (value >>> 24) & 0xff;
}

function getCrc32(bytes) {
    const table = getCrc32.table || (getCrc32.table = buildCrc32Table());
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function buildCrc32Table() {
    const table = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
        let value = index;
        for (let bit = 0; bit < 8; bit += 1) {
            value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
        }
        table[index] = value >>> 0;
    }
    return table;
}

async function downloadTaskListPdf(rows) {
    const pageImages = renderTaskExportPdfPages(rows);
    const pdfBlob = createPdfFromJpegPages(pageImages);
    downloadBlob(pdfBlob, `${getTaskExportFileBaseName()}.pdf`);
}

function renderTaskExportPdfPages(rows) {
    const canvas = document.createElement('canvas');
    canvas.width = 1754;
    canvas.height = 1240;
    const ctx = canvas.getContext('2d');
    const margin = 44;
    const tableTop = 132;
    const headerHeight = 44;
    const rowHeight = 48;
    const footerHeight = 42;
    const rowsPerPage = Math.floor((canvas.height - tableTop - headerHeight - footerHeight - margin) / rowHeight);
    const widths = [118, 132, 150, 198, 150, 170, 190, 150, 170, 190];
    const pages = [];
    const pageCount = Math.max(1, Math.ceil(rows.length / rowsPerPage));

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#001e2b';
        ctx.font = '700 34px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText('任務清單', margin, 62);
        ctx.font = '24px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText(`${state.userName || state.userId || ''}｜${rows.length} 筆`, margin, 100);

        drawTaskExportTableHeader(ctx, margin, tableTop, widths, headerHeight);
        const start = pageIndex * rowsPerPage;
        const pageRows = rows.slice(start, start + rowsPerPage);
        pageRows.forEach((place, rowIndex) => {
            drawTaskExportTableRow(ctx, place, margin, tableTop + headerHeight + rowIndex * rowHeight, widths, rowHeight, rowIndex);
        });

        ctx.fillStyle = '#56616b';
        ctx.font = '20px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
        ctx.fillText(`第 ${pageIndex + 1} / ${pageCount} 頁`, canvas.width - margin - 120, canvas.height - 24);
        pages.push({ dataUrl: canvas.toDataURL('image/jpeg', 0.92), width: canvas.width, height: canvas.height });
    }

    return pages;
}

function drawTaskExportTableHeader(ctx, x, y, widths, height) {
    ctx.fillStyle = '#e7f6ef';
    ctx.fillRect(x, y, widths.reduce((sum, width) => sum + width, 0), height);
    ctx.strokeStyle = '#6b777f';
    ctx.lineWidth = 1;
    ctx.font = '700 18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#001e2b';
    let currentX = x;
    TASK_EXPORT_COLUMNS.forEach((column, index) => {
        ctx.strokeRect(currentX, y, widths[index], height);
        drawFittedText(ctx, column.label, currentX + 7, y + 28, widths[index] - 14);
        currentX += widths[index];
    });
}

function drawTaskExportTableRow(ctx, place, x, y, widths, height, rowIndex) {
    ctx.fillStyle = rowIndex % 2 === 0 ? '#ffffff' : '#f8fbfa';
    ctx.fillRect(x, y, widths.reduce((sum, width) => sum + width, 0), height);
    ctx.strokeStyle = '#a9b2b8';
    ctx.lineWidth = 1;
    ctx.font = '18px "Noto Sans TC", "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#001e2b';
    let currentX = x;
    TASK_EXPORT_COLUMNS.forEach((column, index) => {
        ctx.strokeRect(currentX, y, widths[index], height);
        drawFittedText(ctx, getTaskExportCell(place, column), currentX + 7, y + 30, widths[index] - 14);
        currentX += widths[index];
    });
}

function drawFittedText(ctx, value, x, y, maxWidth) {
    const text = String(value || '');
    if (!text) return;
    if (ctx.measureText(text).width <= maxWidth) {
        ctx.fillText(text, x, y);
        return;
    }

    let clipped = text;
    while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }
    ctx.fillText(`${clipped}…`, x, y);
}

function createPdfFromJpegPages(pages) {
    const encoder = new TextEncoder();
    const chunks = [];
    const offsets = [0];
    let length = 0;
    const pageWidth = 841.89;
    const pageHeight = 595.28;

    function pushString(value) {
        const bytes = encoder.encode(value);
        chunks.push(bytes);
        length += bytes.length;
    }

    function pushBytes(bytes) {
        chunks.push(bytes);
        length += bytes.length;
    }

    function addObject(id, bodyParts) {
        offsets[id] = length;
        pushString(`${id} 0 obj\n`);
        bodyParts.forEach(part => {
            if (typeof part === 'string') pushString(part);
            else pushBytes(part);
        });
        pushString('\nendobj\n');
    }

    pushString('%PDF-1.4\n');
    const kids = pages.map((_, index) => `${5 + index * 3} 0 R`).join(' ');
    addObject(1, [`<< /Type /Catalog /Pages 2 0 R >>`]);
    addObject(2, [`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`]);

    pages.forEach((page, index) => {
        const imageId = 3 + index * 3;
        const contentId = 4 + index * 3;
        const pageId = 5 + index * 3;
        const imageBytes = dataUrlToBytes(page.dataUrl);
        const content = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${index + 1} Do\nQ`;

        addObject(imageId, [
            `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${imageBytes.length} >>\nstream\n`,
            imageBytes,
            `\nendstream`
        ]);
        addObject(contentId, [
            `<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`
        ]);
        addObject(pageId, [
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im${index + 1} ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`
        ]);
    });

    const xrefOffset = length;
    pushString(`xref\n0 ${offsets.length}\n`);
    pushString('0000000000 65535 f \n');
    for (let id = 1; id < offsets.length; id += 1) {
        pushString(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    }
    pushString(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

    const pdfBytes = new Uint8Array(length);
    let offset = 0;
    chunks.forEach(chunk => {
        pdfBytes.set(chunk, offset);
        offset += chunk.length;
    });
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

function dataUrlToBytes(dataUrl) {
    const binary = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function isProofreaderRole() {
    return state.userRole === 'proofreader';
}

function isAudioAssessorRole() {
    return state.userRole === 'audio_assessor';
}

function isAudioReviewRole() {
    return state.userRole === 'admin' || isAudioAssessorRole();
}

function isReviewWorkflowRole() {
    return state.userRole === 'admin' || isProofreaderRole() || isAudioAssessorRole();
}

function configureRoleUI() {
    const tabAssigned = document.getElementById('tab-assigned');
    const tabOther = document.getElementById('tab-other');
    const tabReview = document.getElementById('tab-review');
    const tabUploads = document.getElementById('tab-uploads');
    const tabUsers = document.getElementById('tab-users');
    const tabContainer = document.querySelector('.tab-container');
    const assigneeFilter = document.getElementById('assignee-filter');
    const assigneeFilterSearch = document.getElementById('assignee-filter-search');
    const classFilterRow = document.getElementById('class-filter-row');
    const adminBar = document.getElementById('admin-assign-bar');
    const appSection = document.getElementById('app-section');
    const filterSection = document.querySelector('.filter-section');

    if (state.userRole === 'admin') {
        if (tabContainer) tabContainer.classList.add('admin-tabs');
        if (tabAssigned) tabAssigned.innerText = '全部地名清單';
        if (tabOther) {
            tabOther.style.display = 'none';
            tabOther.classList.remove('active');
        }
        if (tabReview) {
            tabReview.classList.remove('hidden');
            tabReview.style.display = '';
            tabReview.innerText = '審查工作台';
        }
        if (tabUploads) {
            tabUploads.classList.remove('hidden');
            tabUploads.style.display = '';
        }
        if (tabUsers) {
            tabUsers.classList.remove('hidden');
            tabUsers.style.display = '';
        }
        return;
    }

    if (isProofreaderRole() || isAudioAssessorRole()) {
        if (tabContainer) tabContainer.classList.add('admin-tabs');
        if (tabAssigned) { tabAssigned.innerText = '審查工作台'; tabAssigned.style.display = 'none'; }
        if (tabOther) tabOther.style.display = 'none';
        if (tabReview) { tabReview.classList.remove('hidden'); tabReview.style.display = ''; tabReview.innerText = '審查工作台'; }
        if (tabUploads) { tabUploads.classList.add('hidden'); tabUploads.style.display = 'none'; }
        if (tabUsers) { tabUsers.classList.add('hidden'); tabUsers.style.display = 'none'; }
        if (filterSection) filterSection.classList.add('hidden');
        return;
    }

    if (tabContainer) tabContainer.classList.remove('admin-tabs');
    if (tabAssigned) tabAssigned.innerText = '📝 任務清單';
    if (tabOther) {
        tabOther.innerText = '🌍 其他地名';
        tabOther.style.display = '';
    }
    if (tabReview) {
        tabReview.classList.add('hidden');
        tabReview.classList.remove('active');
    }
    if (tabUploads) {
        tabUploads.classList.add('hidden');
        tabUploads.classList.remove('active');
    }
    if (tabUsers) {
        tabUsers.classList.add('hidden');
        tabUsers.classList.remove('active');
    }
    if (assigneeFilterSearch) assigneeFilterSearch.remove();
    if (assigneeFilter) assigneeFilter.remove();
    if (classFilterRow) classFilterRow.remove();
    if (adminBar) adminBar.remove();
    if (appSection) appSection.style.paddingBottom = '';
    if (filterSection) filterSection.classList.remove('hidden');
}

function getUploadReportDateParts(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Taipei',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return {
        key: `${values.year}-${values.month}-${values.day}`,
        label: date.toLocaleDateString('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'short'
        })
    };
}

function formatUploadReportTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '未記錄';
    return date.toLocaleTimeString('zh-TW', {
        timeZone: 'Asia/Taipei',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
}

function getUploadReportUploader(record) {
    const rawId = String(record?.uploaderId || '').trim() || '未標示 ID';
    const user = getUserRecordByAccount(rawId);
    const displayId = (user && (user.email || user.account)) || rawId;
    return {
        key: (user && (user.id || normalizeIdentifier(displayId))) || normalizeIdentifier(rawId),
        id: displayId,
        name: user && user.name && normalizeIdentifier(user.name) !== normalizeIdentifier(displayId)
            ? user.name
            : ''
    };
}

function getUploadReportPlace(record) {
    const place = getPlaceByTaskId(record.placeId);
    return {
        name: place?.placeName || record.placeName || `任務 #${record.placeId || '未知'}`,
        county: place?.county || '',
        town: place?.town || '',
        sourceId: place?.sourceId || ''
    };
}

function sortUploadReportRecords(records = []) {
    return [...records].sort((left, right) => {
        const rightTime = new Date(right.createdAt || 0).getTime() || 0;
        const leftTime = new Date(left.createdAt || 0).getTime() || 0;
        return rightTime - leftTime;
    });
}

function buildUploadReportGroups(records = state.uploadReportRecords) {
    const sortedRecords = sortUploadReportRecords(records);
    const dateGroups = new Map();

    sortedRecords.forEach(record => {
        const dateParts = getUploadReportDateParts(record.createdAt);
        const dateKey = dateParts?.key || 'unknown';
        if (!dateGroups.has(dateKey)) {
            dateGroups.set(dateKey, {
                key: dateKey,
                label: dateParts?.label || '未記錄日期',
                records: [],
                uploaders: new Map()
            });
        }

        const dateGroup = dateGroups.get(dateKey);
        const uploader = getUploadReportUploader(record);
        dateGroup.records.push(record);
        if (!dateGroup.uploaders.has(uploader.key)) {
            dateGroup.uploaders.set(uploader.key, { ...uploader, records: [] });
        }
        dateGroup.uploaders.get(uploader.key).records.push(record);
    });

    return [...dateGroups.values()].map(group => ({
        ...group,
        uploaders: [...group.uploaders.values()]
    }));
}

function buildUploadReportUploaderGroups(records = state.uploadReportRecords) {
    const uploaders = new Map();
    sortUploadReportRecords(records).forEach(record => {
        const uploader = getUploadReportUploader(record);
        if (!uploaders.has(uploader.key)) {
            uploaders.set(uploader.key, { ...uploader, records: [] });
        }
        uploaders.get(uploader.key).records.push(record);
    });
    return [...uploaders.values()];
}

function renderUploadReportUploaderLabel(uploader) {
    const primary = uploader.name || uploader.id;
    const secondary = uploader.name ? uploader.id : '';
    return `
        <span class="upload-report-user-copy">
            <strong>${escapeHtml(primary)}</strong>
            ${secondary ? `<small>${escapeHtml(secondary)}</small>` : ''}
        </span>
    `;
}

function renderUploadReportRows(records) {
    return records.map(record => {
        const place = getUploadReportPlace(record);
        const location = [place.county, place.town].filter(Boolean).join(' ');
        const detailMeta = [location, record.unlinkedAt ? '已解除連結' : ''].filter(Boolean).join('・');
        const taskLabel = place.sourceId || record.placeId || '';
        return `
            <tr>
                <td>${escapeHtml(formatUploadReportTime(record.createdAt))}</td>
                <td>
                    <strong>${escapeHtml(place.name)}</strong>
                    ${detailMeta ? `<small>${escapeHtml(detailMeta)}</small>` : ''}
                </td>
                <td>${escapeHtml(record.language || '未標示')}</td>
                <td>${escapeHtml(taskLabel)}</td>
            </tr>
        `;
    }).join('');
}

function renderUploadReportTable(records) {
    return `
        <div class="upload-report-detail-wrap">
            <table class="upload-report-detail-table">
                <thead>
                    <tr><th>時間</th><th>地名</th><th>語種</th><th>任務 ID</th></tr>
                </thead>
                <tbody>${renderUploadReportRows(records)}</tbody>
            </table>
        </div>
    `;
}

function renderUploadReportByDate(groups) {
    return groups.map(group => `
        <section class="upload-report-day" data-upload-date="${escapeHtml(group.key)}">
            <div class="upload-report-day-heading">
                <h3>${escapeHtml(group.label)}</h3>
                <span>${group.uploaders.length} 個上傳者・${group.records.length} 筆錄音</span>
            </div>
            <div class="upload-report-user-list">
                ${group.uploaders.map(uploader => `
                    <details class="upload-report-user" data-uploader-id="${escapeHtml(uploader.id)}">
                        <summary>
                            ${renderUploadReportUploaderLabel(uploader)}
                            <span class="upload-report-count">${uploader.records.length} 筆</span>
                        </summary>
                        ${renderUploadReportTable(uploader.records)}
                    </details>
                `).join('')}
            </div>
        </section>
    `).join('');
}

function renderUploadReportByUploader(uploaders) {
    return `
        <div class="upload-report-uploader-list">
            ${uploaders.map(uploader => `
                <details class="upload-report-uploader-group" data-uploader-id="${escapeHtml(uploader.id)}">
                    <summary>
                        ${renderUploadReportUploaderLabel(uploader)}
                        <span class="upload-report-count">${uploader.records.length} 筆</span>
                    </summary>
                    <div class="upload-report-uploader-dates">
                        ${buildUploadReportGroups(uploader.records).map(group => `
                            <section class="upload-report-uploader-date" data-upload-date="${escapeHtml(group.key)}">
                                <div class="upload-report-uploader-date-heading">
                                    <h4>${escapeHtml(group.label)}</h4>
                                    <span>${group.records.length} 筆</span>
                                </div>
                                ${renderUploadReportTable(group.records)}
                            </section>
                        `).join('')}
                    </div>
                </details>
            `).join('')}
        </div>
    `;
}

function setUploadReportGroupMode(mode) {
    if (state.userRole !== 'admin' || !['date', 'uploader'].includes(mode)) return;
    state.uploadReportGroupMode = mode;
    renderUploadReport();
}

function renderUploadReport() {
    if (state.userRole !== 'admin') return;
    const container = document.getElementById('place-list-container');
    const groups = buildUploadReportGroups();
    const uploaderGroups = buildUploadReportUploaderGroups();
    const total = state.uploadReportRecords.length;
    const mode = state.uploadReportGroupMode === 'uploader' ? 'uploader' : 'date';

    const body = groups.length === 0
        ? '<div class="empty-state compact">目前沒有錄音上傳紀錄。</div>'
        : (mode === 'uploader' ? renderUploadReportByUploader(uploaderGroups) : renderUploadReportByDate(groups));

    container.innerHTML = `
        <section id="admin-upload-report" class="card">
            <div class="upload-report-header">
                <div>
                    <h2>錄音上傳報告</h2>
                    <p>以台北時間按日彙整；不重複計算共用音檔連結，最新紀錄在最上方。</p>
                </div>
                <span class="upload-report-total">共 ${total} 筆</span>
            </div>
            <div class="upload-report-mode-switch" role="group" aria-label="報告分類方式">
                <button type="button" class="upload-report-mode-btn ${mode === 'date' ? 'active' : ''}" aria-pressed="${mode === 'date'}" onclick="setUploadReportGroupMode('date')">依日期</button>
                <button type="button" class="upload-report-mode-btn ${mode === 'uploader' ? 'active' : ''}" aria-pressed="${mode === 'uploader'}" onclick="setUploadReportGroupMode('uploader')">依上傳者</button>
            </div>
            ${body}
        </section>
    `;
}

function renderAdminUserManager() {
    if (state.userRole !== 'admin') return;
    const container = document.getElementById('place-list-container');

    const investigators = state.allUserRecords.filter(user => user.role !== 'admin');
    const userRows = sortAdminUserRows(investigators.map(user => ({
        user,
        stats: getInvestigatorWorkStats(user)
    })));
    const body = userRows.length === 0
        ? '<div class="empty-state compact">目前沒有調查員帳號。請從 Places 的 Users 表同步。</div>'
        : userRows.map(({ user, stats: workStats }) => {
            const hoverTitle = getUserHoverTitle(user);
            const userKey = user.id || user.account || user.email;
            const detailId = getUserDetailElementId(userKey);
            return `
            <div class="user-status-row">
                <button class="user-detail-toggle" type="button" onclick="toggleUserDetails('${escapeHtml(userKey)}', this)" aria-expanded="false" aria-controls="${escapeHtml(detailId)}">展開</button>
                <span class="user-name" title="${escapeHtml(hoverTitle)}">${escapeHtml(user.name || user.account)}</span>
                <span class="user-email" title="${escapeHtml(user.email || user.account)}">${escapeHtml(user.email || user.account)}</span>
                <span class="user-phone">${escapeHtml(user.phone || '未填手機')}</span>
                <span class="user-work-stat">${renderInvestigatorStatChip('指派', workStats.assignedCount)}</span>
                <span class="user-work-stat">${renderInvestigatorStatChip('錄音', workStats.recordingCount)}</span>
                <span class="user-active-text">${user.is_active ? 'active' : 'inactive'}</span>
                <input type="checkbox" ${user.is_active ? 'checked' : ''} onchange="toggleInvestigatorActive('${user.id}', this.checked, this)">
                <button class="edit-user-btn" type="button" onclick="openInvestigatorEditDialog('${escapeJsString(user.id)}')">編輯</button>
                <button class="delete-user-btn" type="button" onclick="deleteInvestigatorUser('${user.id}', this)">刪除</button>
                <div class="user-detail-panel" id="${escapeHtml(detailId)}" hidden>
                    ${renderUserDetailFields(user)}
                </div>
            </div>
        `;
        }).join('');

    container.innerHTML = `
        <section id="admin-user-manager" class="card">
            <div class="admin-user-manager-header">
                <h3>調查員帳號狀態</h3>
                <button class="btn-secondary refresh-users-btn" onclick="refreshAdminUsers()">重新整理</button>
            </div>
            <div class="user-status-list">
                <div class="user-status-header">
                    <span></span>
                    <span>${renderAdminUserSortHeader('姓名', 'name')}</span>
                    <span>${renderAdminUserSortHeader('登入 ID', 'email')}</span>
                    <span>${renderAdminUserSortHeader('手機', 'phone')}</span>
                    <span>${renderAdminUserSortHeader('指派', 'assigned')}</span>
                    <span>${renderAdminUserSortHeader('錄音', 'recordings')}</span>
                    <span>${renderAdminUserSortHeader('active', 'active')}</span>
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
                ${body}
            </div>
        </section>
    `;
}

async function refreshAdminUsers() {
    await loadDataFromSupabase(state.userId);
    initFilters();
    renderAdminUserManager();
    applyFilters();
}

async function toggleInvestigatorActive(userId, isActive, checkbox) {
    const adminPassword = prompt('請輸入管理員密碼以變更調查員啟用狀態');
    if (!adminPassword) {
        checkbox.checked = !isActive;
        return;
    }

    checkbox.disabled = true;
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'setInvestigatorActive',
                actorAccount: state.userId,
                adminPassword,
                userId,
                isActive
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to update active state');
        await refreshAdminUsers();
    } catch (err) {
        console.error('更新調查員 active 狀態失敗:', err);
        checkbox.checked = !isActive;
        checkbox.disabled = false;
        alert(`更新 active 狀態失敗：${err.message}`);
    }
}

async function deleteInvestigatorUser(userId, button) {
    const user = state.allUserRecords.find(record => record.id === userId);
    const displayName = user ? (user.name || user.account) : '這位調查員';
    const account = user ? (user.email || user.account) : userId;
    const confirmText = 'delete user confirm';
    const input = prompt(`確定要刪除「${displayName}」嗎？\n\n這會移除調查員帳號，並停用他目前的任務指派。\n如果 Places 的 Users 表仍保留這位使用者，下次同步可能會重新建立。\n若要繼續，請輸入：${confirmText}\n\n帳號：${account}`);

    if (input !== confirmText) {
        if (input !== null) alert('指令不一致，已取消刪除。');
        return;
    }

    const adminPassword = prompt('請輸入管理員密碼以刪除調查員');
    if (!adminPassword) return;

    const originalText = button.innerText;
    button.innerText = '刪除中...';
    button.disabled = true;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'deleteInvestigatorUser',
                actorAccount: state.userId,
                adminPassword,
                userId
            })
        });

        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'Failed to delete investigator user');
        alert(`已刪除「${displayName}」。`);
        await refreshAdminUsers();
    } catch (err) {
        console.error('刪除調查員失敗:', err);
        alert(`刪除調查員失敗：${err.message}`);
        button.innerText = originalText;
        button.disabled = false;
    }
}

function syncAdminToolsForTab() {
    if (state.userRole !== 'admin') return;

    const adminBar = document.getElementById('admin-assign-bar');
    const appSection = document.getElementById('app-section');
    const filterSection = document.querySelector('.filter-section');

    const isStandaloneAdminTab = state.currentTab === 'review' || state.currentTab === 'users' || state.currentTab === 'uploads';
    if (filterSection) filterSection.classList.toggle('hidden', state.currentTab === 'users' || state.currentTab === 'uploads');

    if (isStandaloneAdminTab) {
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

        const recordsQuery = state.userRole === 'admin'
            ? 'select=*'
            : 'select=*&unlinked_at=is.null';
        const [tasksData, recordsData] = await Promise.all([
            fetchSupabaseRows('app_tasks_view?select=*', headers),
            fetchSupabaseRows(`audio_records?${recordsQuery}`, headers)
        ]);
        const places = tasksData.map(normalizeTask);

        if (state.userRole === 'admin') {
            // 🛑 核心新增：管理員額外抓取全體調查員名單
            const usersData = await fetchSupabaseRows(`app_users_view?select=${USER_PROFILE_SELECT}&order=name.asc`, headers);
            // 將抓回來的名字存入 state
            state.allUserRecords = usersData.map(normalizeUserRecord);
            state.allUsers = state.allUserRecords
                .filter(u => u.role !== 'admin' && u.is_active)
                .map(u => normalizeUserRecord(u));
            state.reviewQueue = [];
            state.reviewWorkflowQueue = [];

            state.assignedPlaces = places;
            state.allPlaces = []; 
        } else if (isProofreaderRole()) {
            state.reviewQueue = [];
            state.assignedPlaces = places;
            state.allPlaces = [];
        } else {
            const labelAccounts = [
                state.userId,
                ...recordsData.map(record => record.recorder_name)
            ].filter(Boolean);
            let labelUserRecords = [];
            if (labelAccounts.length > 0) {
                const userFilter = encodeURIComponent(buildPostgrestInFilter(labelAccounts));
                const labelUsersRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_users_view?select=${USER_LABEL_SELECT}&account=${userFilter}`, { headers });
                if (labelUsersRes.ok) {
                    labelUserRecords = await labelUsersRes.json();
                } else {
                    console.warn('使用者顯示名稱讀取失敗，將以帳號顯示');
                }
            }
            state.allUsers = [];
            state.allUserRecords = mergeUserRecords([
                { account: state.userId, role: state.userRole, is_active: true, name: state.userName, email: state.userEmail },
                ...labelUserRecords
            ]);
            state.reviewQueue = [];
            state.reviewWorkflowQueue = [];
            const userVisiblePlaces = places.filter(place => !isWrittenAnnotationPlace(place));
            state.assignedPlaces = userVisiblePlaces
                .filter(place => assignedUsersInclude(place.assignedUsers, state.userId) || assignedUsersInclude(place.assignedUsers, state.userName));
                
            state.allPlaces = userVisiblePlaces
                .filter(place => !assignedUsersInclude(place.assignedUsers, state.userId) && !assignedUsersInclude(place.assignedUsers, state.userName) && place.sourceTable !== 'test_places');
        }

        const normalizedRecords = recordsData.map(r => ({
            recordId: r.id, placeId: r.task_id, language: r.language,
            uploaderId: r.recorder_name, phonetic: r.phonetic_reading, url: r.audio_file_id,
            createdAt: r.created_at || '',
            annotations: parseRecordNote(r.note),
            respondentKey: r.respondent_key || parseRecordNotePayload(r.note).respondentKey || '',
            linkMeta: parseRecordLinkMeta(r.note),
            unlinkedAt: r.unlinked_at || null
        }));
        state.uploadedRecords = normalizedRecords.filter(record => !record.unlinkedAt);
        state.uploadReportRecords = state.userRole === 'admin'
            ? normalizedRecords.filter(record => !record.linkMeta)
            : [];

        if (isReviewWorkflowRole()) await loadReviewWorkflowQueue({ silent: true });

    } catch (err) {
        console.error("Supabase 載入失敗", err);
        alert("資料庫連線異常，請重新整理網頁。");
    }
}

// ==========================================
// 以下為 UI 切換與篩選器邏輯 (完全保持原樣，因為資料格式已對接)
// ==========================================
function switchTab(tab) {
    if (tab === 'review' && !isReviewWorkflowRole()) {
        alert('目前帳號沒有校對權限。');
        tab = 'assigned';
    }
    if (state.currentTab !== tab) closeRecordingUI();
    state.currentTab = tab;
    document.getElementById('tab-assigned').classList.toggle('active', tab === 'assigned');
    document.getElementById('tab-other').classList.toggle('active', tab === 'other');
    document.getElementById('tab-review')?.classList.toggle('active', tab === 'review');
    document.getElementById('tab-uploads')?.classList.toggle('active', tab === 'uploads');
    document.getElementById('tab-users')?.classList.toggle('active', tab === 'users');
    syncAdminToolsForTab();
    document.getElementById('search-box').value = "";
    if (tab === 'uploads') {
        renderUploadReport();
        return;
    }
    if (tab === 'users') {
        renderAdminUserManager();
        return;
    }
    if (tab === 'review') {
        renderReviewWorkflowQueue();
        if (!state.reviewWorkflowAvailable) loadReviewWorkflowQueue({ silent: false });
        return;
    }
    applyFilters();
}
// 🌟 更新版：初始化篩選器
function initFilters() {
    const counties = [...new Set(state.assignedPlaces.concat(state.allPlaces).map(p => p.county).filter(Boolean))];
    const types = [...new Set(state.assignedPlaces.concat(state.allPlaces).map(p => p.type || p.Type).filter(Boolean))].sort();
    
    const countySelect = document.getElementById('county-filter');
    const previousCounty = countySelect.value;
    const previousTowns = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    countySelect.innerHTML = '<option value="">所有縣市</option>'; 
    counties.forEach(c => countySelect.add(new Option(c, c)));
    if (previousCounty && counties.includes(previousCounty)) {
        countySelect.value = previousCounty;
    }
    updateTowns(previousTowns);
    
    state.availableTypes = types;
    if (!state.typeFiltersInitialized) {
        state.selectedTypes = [...state.availableTypes];
        state.typeFiltersInitialized = true;
    } else {
        state.selectedTypes = reconcileMultiFilterSelection(state.selectedTypes, state.availableTypes, { emptySelectsAll: false });
    }
    renderMultiFilterChips('type-container', 'types', '全部類別', state.availableTypes, state.selectedTypes, getTypeDisplayText);
    syncStatusFilterChips();
    syncHakAreaFilterChips();

    if (state.userRole === 'admin') {
        let assigneeSelect = document.getElementById('assignee-filter');
        const previousAssignee = assigneeSelect ? assigneeSelect.value : '';
        if (!assigneeSelect) {
            assigneeSelect = document.createElement('select');
            assigneeSelect.id = 'assignee-filter';
            assigneeSelect.onchange = handleFilterChange;
        }
        let assigneeSearch = document.getElementById('assignee-filter-search');
        if (!assigneeSearch) {
            assigneeSearch = document.createElement('input');
            assigneeSearch.id = 'assignee-filter-search';
            assigneeSearch.type = 'text';
            assigneeSearch.placeholder = '搜尋調查員姓名、email、手機...';
            assigneeSearch.oninput = () => filterSelectOptions('assignee-filter', assigneeSearch.value);
        }
        const adminFilterControls = document.getElementById('admin-filter-controls') || document.querySelector('.filter-section');
        adminFilterControls.append(assigneeSearch, assigneeSelect);
        
        // 🛑 核心修改：改用 state.allUsers 來產生下拉選單
        assigneeSelect.innerHTML = '<option value="">👥 所有調查員 (包含未指派)</option>' + 
                                   '<option value="UNASSIGNED">⚠️ 只看未指派</option>' + 
                                   '<option value="ASSIGNED">✅ 只看有指派</option>' +
                                   '<option value="TAI_UNASSIGNED">台語未指派</option>' +
                                   '<option value="HAK_UNASSIGNED">客語未指派</option>' +
                                   state.allUsers.map(u => `<option value="${escapeHtml(getUserAnnotatorName(u))}" title="${escapeHtml(getUserHoverTitle(u))}">👤 ${escapeHtml(u.name || u.account)}</option>`).join('');
        if (previousAssignee && Array.from(assigneeSelect.options).some(option => option.value === previousAssignee)) {
            assigneeSelect.value = previousAssignee;
        }
        filterSelectOptions('assignee-filter', assigneeSearch.value);

        initClassFilters();
                                   
        if (state.currentTab !== 'review' && state.currentTab !== 'users') {
            renderAdminBatchAssignUI();
        }
    }
}

function initClassFilters() {
    const typeContainer = document.getElementById('type-container');
    const data = state.allPlaces.concat(state.assignedPlaces, state.reviewQueue);
    const taiClasses = [...new Set(data.map(place => place.taiClass).filter(Boolean))].sort();
    const hakClasses = [...new Set(data.map(place => place.hakClass).filter(Boolean))].sort();
    let classRow = document.getElementById('class-filter-row');

    state.availableTaiClasses = taiClasses;
    state.availableHakClasses = hakClasses;
    if (!state.classFiltersInitialized) {
        state.selectedTaiClasses = [...state.availableTaiClasses];
        state.selectedHakClasses = [...state.availableHakClasses];
        state.classFiltersInitialized = true;
    } else {
        state.selectedTaiClasses = reconcileMultiFilterSelection(state.selectedTaiClasses, state.availableTaiClasses, { emptySelectsAll: false });
        state.selectedHakClasses = reconcileMultiFilterSelection(state.selectedHakClasses, state.availableHakClasses, { emptySelectsAll: false });
    }

    if (!classRow) {
        classRow = document.createElement('div');
        classRow.id = 'class-filter-row';
        classRow.className = 'admin-class-filter-row';
        classRow.innerHTML = `
            <div class="class-chip-group tai-filter-group">
                <div class="filter-chip-label">台語分級</div>
                <div class="class-chips" id="tai-class-container"></div>
            </div>
            <div class="class-chip-group hak-filter-group">
                <div class="filter-chip-label">客語分級</div>
                <div class="class-chips" id="hak-class-container"></div>
            </div>
        `;
        const classFilterSlot = document.getElementById('admin-class-filter-slot') || typeContainer.parentNode;
        classFilterSlot.appendChild(classRow);
    }

    renderMultiFilterChips('tai-class-container', 'taiClasses', '全部台語分級', state.availableTaiClasses, state.selectedTaiClasses);
    renderMultiFilterChips('hak-class-container', 'hakClasses', '全部客語分級', state.availableHakClasses, state.selectedHakClasses);
}

function normalizeTownSelection(selectedTowns) {
    if (Array.isArray(selectedTowns)) return selectedTowns.filter(Boolean);
    return selectedTowns ? [selectedTowns] : [];
}

function updateTowns(selectedTowns = state.selectedTowns) {
    const county = document.getElementById('county-filter').value;
    const selection = normalizeTownSelection(selectedTowns);
    let towns = [];
    if (county) {
        towns = [...new Set(state.allPlaces.concat(state.assignedPlaces, state.reviewQueue)
            .filter(p => p.county === county)
            .map(p => p.town)
            .filter(Boolean))]
            .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    }
    state.availableTowns = towns;
    const validSelection = reconcileMultiFilterSelection(selection, towns, { emptySelectsAll: false });
    state.selectedTowns = validSelection.length > 0 ? validSelection : [...towns];
    renderTownMultiSelect();
}

function resetTownFilters() {
    updateTowns([]);
}

function getTownFilterSummary() {
    const towns = state.availableTowns || [];
    const selected = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    if (towns.length === 0 || selected.length === towns.length) return '所有鄉鎮';
    if (selected.length === 0) return '未選鄉鎮';
    if (selected.length === 1) return selected[0];
    return `已選 ${selected.length} 個鄉鎮`;
}

function getActiveMobileFilterLabels() {
    const labels = [];
    const county = document.getElementById('county-filter')?.value || '';
    const availableTowns = state.availableTowns || [];
    const selectedTowns = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    const availableTypes = state.availableTypes || [];
    const selectedTypes = Array.isArray(state.selectedTypes) ? state.selectedTypes : [];
    const selectedStatuses = Array.isArray(state.selectedStatuses) ? state.selectedStatuses : STATUS_FILTER_VALUES;

    if (county) labels.push(county);
    if (availableTowns.length > 0 && selectedTowns.length !== availableTowns.length) {
        labels.push(selectedTowns.length === 1 ? selectedTowns[0] : `鄉鎮 ${selectedTowns.length} 項`);
    }
    if (availableTypes.length > 0 && selectedTypes.length !== availableTypes.length) {
        labels.push(selectedTypes.length === 1 ? getTypeDisplayText(selectedTypes[0]) : `地名類別 ${selectedTypes.length} 項`);
    }
    if (state.selectedHakArea !== 'all') {
        labels.push(state.selectedHakArea === 'hak' ? '客語區' : '非客語區');
    }
    if (selectedStatuses.length !== STATUS_FILTER_VALUES.length) {
        labels.push(selectedStatuses.length === 1 ? selectedStatuses[0] : `錄音狀態 ${selectedStatuses.length} 項`);
    }

    if (state.userRole === 'admin') {
        const selectedTaiClasses = Array.isArray(state.selectedTaiClasses) ? state.selectedTaiClasses : [];
        const selectedHakClasses = Array.isArray(state.selectedHakClasses) ? state.selectedHakClasses : [];
        if ((state.availableTaiClasses || []).length > 0 && selectedTaiClasses.length !== state.availableTaiClasses.length) {
            labels.push(`台語分級 ${selectedTaiClasses.length} 項`);
        }
        if ((state.availableHakClasses || []).length > 0 && selectedHakClasses.length !== state.availableHakClasses.length) {
            labels.push(`客語分級 ${selectedHakClasses.length} 項`);
        }
        const assignee = document.getElementById('assignee-filter');
        if (assignee?.value) labels.push(assignee.options[assignee.selectedIndex]?.textContent.trim() || '調查員');
    }

    return labels;
}

function updateMobileFilterSummary(resultCount = (state.filteredPlaces || []).length) {
    const labels = getActiveMobileFilterLabels();
    const count = document.getElementById('mobile-filter-count');
    const summary = document.getElementById('mobile-filter-summary');
    const results = document.getElementById('mobile-filter-results');
    if (count) {
        count.textContent = String(labels.length);
        count.classList.toggle('hidden', labels.length === 0);
    }
    if (summary) {
        const visibleLabels = labels.slice(0, 2);
        const remaining = labels.length - visibleLabels.length;
        summary.textContent = labels.length === 0
            ? '目前使用全部條件'
            : `${visibleLabels.join('・')}${remaining > 0 ? `・另 ${remaining} 項` : ''}`;
    }
    if (results) results.textContent = `查看 ${resultCount} 筆結果`;
}

function openMobileFilterPanel() {
    if (!window.matchMedia('(max-width: 640px)').matches) return;
    const panel = document.getElementById('filter-panel');
    const backdrop = document.getElementById('mobile-filter-backdrop');
    const toggle = document.getElementById('mobile-filter-toggle');
    if (!panel || !backdrop || !toggle) return;

    mobileFilterReturnFocus = document.activeElement;
    panel.classList.add('is-open');
    backdrop.classList.add('is-open');
    document.body.classList.add('mobile-filter-open');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'mobile-filter-title');
    toggle.setAttribute('aria-expanded', 'true');
    panel.querySelector('.mobile-filter-close')?.focus();
}

function closeMobileFilterPanel(options = {}) {
    const panel = document.getElementById('filter-panel');
    const backdrop = document.getElementById('mobile-filter-backdrop');
    const toggle = document.getElementById('mobile-filter-toggle');
    if (!panel || !backdrop || !toggle) return;

    const wasOpen = panel.classList.contains('is-open');
    panel.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    document.body.classList.remove('mobile-filter-open');
    panel.removeAttribute('role');
    panel.removeAttribute('aria-modal');
    panel.removeAttribute('aria-labelledby');
    toggle.setAttribute('aria-expanded', 'false');
    state.townDropdownOpen = false;
    renderTownMultiSelect();

    if (wasOpen && options.restoreFocus !== false) {
        (mobileFilterReturnFocus || toggle).focus();
    }
    mobileFilterReturnFocus = null;
}

function clearMobileFilters() {
    const county = document.getElementById('county-filter');
    if (county) county.value = '';
    updateTowns([]);
    state.selectedTypes = [...(state.availableTypes || [])];
    state.selectedTaiClasses = [...(state.availableTaiClasses || [])];
    state.selectedHakClasses = [...(state.availableHakClasses || [])];
    state.selectedHakArea = 'all';
    state.selectedStatus = 'all';
    state.selectedStatuses = [...STATUS_FILTER_VALUES];
    state.townDropdownOpen = false;
    const assignee = document.getElementById('assignee-filter');
    const assigneeSearch = document.getElementById('assignee-filter-search');
    if (assignee) assignee.value = '';
    if (assigneeSearch) {
        assigneeSearch.value = '';
        filterSelectOptions('assignee-filter', '');
    }
    renderTownMultiSelect();
    renderAllMultiFilterChips();
    syncHakAreaFilterChips();
    syncStatusFilterChips();
    handleFilterChange();
}

function renderTownMultiSelect() {
    const button = document.getElementById('town-filter-button');
    const summary = document.getElementById('town-filter-summary');
    const menu = document.getElementById('town-filter-menu');
    if (!button || !summary || !menu) return;

    const towns = state.availableTowns || [];
    const selected = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    const selectedSet = new Set(selected);
    const allChecked = towns.length === 0 || selectedSet.size === towns.length;
    summary.innerText = getTownFilterSummary();
    button.disabled = towns.length === 0;
    button.setAttribute('aria-expanded', state.townDropdownOpen ? 'true' : 'false');
    menu.classList.toggle('hidden', !state.townDropdownOpen);

    const allRow = `
        <label class="town-filter-option">
            <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="selectAllTownFilters()">
            <span>所有鄉鎮</span>
        </label>
    `;
    const townRows = towns.map(town => `
        <label class="town-filter-option">
            <input type="checkbox" ${selectedSet.has(town) ? 'checked' : ''} onchange="toggleTownFilterValue('${escapeJsString(town)}')">
            <span>${escapeHtml(town)}</span>
        </label>
    `).join('');
    menu.innerHTML = allRow + townRows;
}

function toggleTownDropdown(event) {
    if (event) event.stopPropagation();
    if ((state.availableTowns || []).length === 0) return;
    state.townDropdownOpen = !state.townDropdownOpen;
    renderTownMultiSelect();
}

function selectAllTownFilters() {
    const towns = state.availableTowns || [];
    const selected = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    const isAllSelected = towns.length > 0 && selected.length === towns.length && towns.every(town => selected.includes(town));
    state.selectedTowns = isAllSelected ? [] : [...towns];
    renderTownMultiSelect();
    handleFilterChange();
}

function toggleTownFilterValue(town) {
    const towns = state.availableTowns || [];
    const current = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    const isAllSelected = towns.length > 0 && current.length === towns.length && towns.every(item => current.includes(item));
    let next;
    if (isAllSelected) {
        next = [town];
    } else {
        next = current.includes(town)
            ? current.filter(item => item !== town)
            : current.concat(town);
    }

    next = next.filter(item => towns.includes(item));
    state.selectedTowns = next;
    renderTownMultiSelect();
    handleFilterChange();
}

function getTypeDisplayText(value) {
    return value === "具有地標意義公共設施" ? "公共設施" : value;
}

function getMultiFilterStateKey(filterKey) {
    return {
        types: 'selectedTypes',
        taiClasses: 'selectedTaiClasses',
        hakClasses: 'selectedHakClasses'
    }[filterKey];
}

function reconcileMultiFilterSelection(selectedValues, availableValues, options = {}) {
    const emptySelectsAll = options.emptySelectsAll !== false;
    const selected = Array.isArray(selectedValues) ? selectedValues : [];
    if (availableValues.length === 0) return [];
    if (selected.length === 0) return emptySelectsAll ? [...availableValues] : [];
    const availableSet = new Set(availableValues);
    const validSelected = selected.filter(value => availableSet.has(value));
    if (validSelected.length > 0) return validSelected;
    return emptySelectsAll ? [...availableValues] : [];
}

function renderMultiFilterChips(containerId, filterKey, allLabel, values, selectedValues, displayFormatter = value => value) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const selectedSet = new Set(selectedValues);
    const isAllSelected = values.length === 0 || selectedSet.size === values.length;
    const allChip = `<button type="button" class="filter-chip ${isAllSelected ? 'selected' : ''}" aria-pressed="${isAllSelected}" onclick="selectAllMultiFilter('${filterKey}')">${escapeHtml(allLabel)}</button>`;
    const chips = values.map(value => {
        const selected = selectedSet.has(value);
        return `<button type="button" class="filter-chip ${selected ? 'selected' : ''}" aria-pressed="${selected}" onclick="toggleMultiFilterValue('${filterKey}', '${escapeJsString(value)}')">${escapeHtml(displayFormatter(value))}</button>`;
    }).join('');

    container.innerHTML = allChip + chips;
}

function selectAllMultiFilter(filterKey) {
    const stateKey = getMultiFilterStateKey(filterKey);
    if (!stateKey) return;
    const values = getAvailableMultiFilterValues(filterKey);
    const current = Array.isArray(state[stateKey]) ? state[stateKey] : [];
    const isAllSelected = current.length === values.length && values.every(value => current.includes(value));
    state[stateKey] = isAllSelected ? [] : [...values];
    renderAllMultiFilterChips();
    handleFilterChange();
}

function toggleMultiFilterValue(filterKey, value) {
    const stateKey = getMultiFilterStateKey(filterKey);
    if (!stateKey) return;

    const current = Array.isArray(state[stateKey]) ? state[stateKey] : [];
    state[stateKey] = current.includes(value)
        ? current.filter(item => item !== value)
        : current.concat(value);

    renderAllMultiFilterChips();
    handleFilterChange();
}

function getAvailableMultiFilterValues(filterKey) {
    if (filterKey === 'types') {
        return state.availableTypes || [];
    }
    if (filterKey === 'taiClasses') {
        return state.availableTaiClasses || [];
    }
    if (filterKey === 'hakClasses') {
        return state.availableHakClasses || [];
    }
    return [];
}

function renderAllMultiFilterChips() {
    const types = state.availableTypes || [];
    const taiClasses = state.availableTaiClasses || [];
    const hakClasses = state.availableHakClasses || [];

    state.selectedTypes = reconcileMultiFilterSelection(state.selectedTypes, types, { emptySelectsAll: false });
    state.selectedTaiClasses = reconcileMultiFilterSelection(state.selectedTaiClasses, taiClasses, { emptySelectsAll: false });
    state.selectedHakClasses = reconcileMultiFilterSelection(state.selectedHakClasses, hakClasses, { emptySelectsAll: false });

    renderMultiFilterChips('type-container', 'types', '全部類別', types, state.selectedTypes, getTypeDisplayText);
    renderMultiFilterChips('tai-class-container', 'taiClasses', '全部台語分級', taiClasses, state.selectedTaiClasses);
    renderMultiFilterChips('hak-class-container', 'hakClasses', '全部客語分級', hakClasses, state.selectedHakClasses);
}
function selectHakArea(hakArea, element) {
    state.selectedHakArea = hakArea;
    syncHakAreaFilterChips();
    handleFilterChange();
}

function syncHakAreaFilterChips() {
    document.querySelectorAll('.hak-area-chip').forEach(chip => {
        const selected = chip.dataset.hakAreaFilter === state.selectedHakArea;
        chip.classList.toggle('selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
    });
}

function syncStatusFilterChips() {
    const selectedSet = new Set(Array.isArray(state.selectedStatuses) ? state.selectedStatuses : STATUS_FILTER_VALUES);
    const allSelected = STATUS_FILTER_VALUES.every(status => selectedSet.has(status));

    document.querySelectorAll('.status-chip').forEach(chip => {
        const status = chip.dataset.statusFilter;
        const selected = status === 'all' ? allSelected : selectedSet.has(status);
        chip.classList.toggle('selected', selected);
        chip.setAttribute('aria-pressed', String(selected));
    });
}

function selectAllStatusFilters() {
    state.selectedStatuses = [...STATUS_FILTER_VALUES];
    state.selectedStatus = 'all';
    syncStatusFilterChips();
    handleFilterChange();
}

function toggleStatusFilter(status) {
    if (!STATUS_FILTER_VALUES.includes(status)) return;

    const selected = Array.isArray(state.selectedStatuses) ? state.selectedStatuses : [...STATUS_FILTER_VALUES];
    const selectedSet = new Set(selected);
    if (selectedSet.has(status)) {
        selectedSet.delete(status);
    } else {
        selectedSet.add(status);
    }
    state.selectedStatuses = [...STATUS_FILTER_VALUES].filter(value => selectedSet.has(value));
    state.selectedStatus = state.selectedStatuses.length === STATUS_FILTER_VALUES.length ? 'all' : '';
    syncStatusFilterChips();
    handleFilterChange();
}

function handleFilterChange() {
    closeRecordingUI();
    applyFilters();
}

function placeMatchesAssigneeFilter(place, assigneeFilter) {
    if (!assigneeFilter) return true;

    const assignedUsers = normalizeAssignedUsers(place.assignedUsers, place.assignedTo);
    const hasAnyAssignee = assignedUsers.length > 0 || Boolean(place.tAssignee || place.hAssignee);

    if (assigneeFilter === "UNASSIGNED") return !hasAnyAssignee;
    if (assigneeFilter === "ASSIGNED") return hasAnyAssignee;
    if (assigneeFilter === "TAI_UNASSIGNED") return !place.tAssignee;
    if (assigneeFilter === "HAK_UNASSIGNED") return !place.hAssignee;
    return assignedUsersInclude(assignedUsers, assigneeFilter) ||
        isSameUserIdentifier(place.tAssignee, assigneeFilter) ||
        isSameUserIdentifier(place.hAssignee, assigneeFilter);
}

function placeMatchesStatusFilter(place, status) {
    if (status === '台語已有錄音') return Number(place.taiAudioCount || 0) > 0;
    if (status === '客語已有錄音') return Number(place.hakAudioCount || 0) > 0;
    return place.recordingStatus === status;
}

// 🌟 升級：執行篩選 (加入調查員條件)
function applyFilters() {
    if (state.currentTab === 'review') {
        renderReviewWorkflowQueue();
        return;
    }
    if (state.currentTab === 'uploads') {
        renderUploadReport();
        return;
    }
    if (state.currentTab === 'users') {
        renderAdminUserManager();
        return;
    }

    const keyword = document.getElementById('search-box').value.toLowerCase();
    const county = document.getElementById('county-filter').value;
    const selectedTowns = Array.isArray(state.selectedTowns) ? state.selectedTowns : [];
    const selectedTypes = Array.isArray(state.selectedTypes) ? state.selectedTypes : [];
    const selectedTaiClasses = Array.isArray(state.selectedTaiClasses) ? state.selectedTaiClasses : [];
    const selectedHakClasses = Array.isArray(state.selectedHakClasses) ? state.selectedHakClasses : [];
    const townSet = new Set(selectedTowns);
    const typeSet = new Set(selectedTypes);
    const taiClassSet = new Set(selectedTaiClasses);
    const hakClassSet = new Set(selectedHakClasses);
    const hasTypeOptions = (state.availableTypes || []).length > 0;
    const hasTaiClassFilter = selectedTaiClasses.length > 0 && selectedTaiClasses.length < (state.availableTaiClasses || []).length;
    const hasHakClassFilter = selectedHakClasses.length > 0 && selectedHakClasses.length < (state.availableHakClasses || []).length;
    const hakArea = state.selectedHakArea;
    const selectedStatuses = Array.isArray(state.selectedStatuses) ? state.selectedStatuses : [...STATUS_FILTER_VALUES];
    const statusFilterSet = new Set(selectedStatuses);
    const hasStatusFilter = selectedStatuses.length > 0 && selectedStatuses.length < STATUS_FILTER_VALUES.length;
    const hasTownFilter = county && (state.availableTowns || []).length > 0;
    
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
        const matchTw = hasTownFilter ? townSet.has(place.town) : true;
        const matchTy = hasTypeOptions && selectedTypes.length > 0 ? typeSet.has(place.type || place.Type) : true;
        const matchTaiClass = hasTaiClassFilter ? taiClassSet.has(place.taiClass) : true;
        const matchHakClass = hasHakClassFilter ? hakClassSet.has(place.hakClass) : true;
        const isHakArea = place.hakArea === true || String(place.hakArea).toUpperCase() === 'TRUE';
        const matchHakArea = hakArea === 'all' || (hakArea === 'hak' ? isHakArea : !isHakArea);
        
        // 🛑 新增：調查員篩選邏輯
        let matchAssignee = true;
        if (state.userRole === 'admin' && assigneeFilter !== "") {
            matchAssignee = placeMatchesAssigneeFilter(place, assigneeFilter);
        }
        
        // 錄音狀態篩選
        const matchStatus = hasStatusFilter
            ? STATUS_FILTER_VALUES.some(status => statusFilterSet.has(status) && placeMatchesStatusFilter(place, status))
            : true;
        
        return matchK && matchC && matchTw && matchTy && matchTaiClass && matchHakClass && matchHakArea && matchStatus && matchAssignee;
    });
    const sorted = [...filtered].sort((left, right) => comparePlacesByLocation(left, right, true));
    updateMobileFilterSummary(sorted.length);
    if (state.currentTab === 'review') {
        return renderReviewQueue(sorted);
    }
    renderPlaceList(sorted);
}

const AUTHENTICATED_REVIEW_RPC_NAMES = Object.freeze({
    get_review_workflow_queue: 'get_review_workflow_queue_authenticated',
    get_audio_review_claims: 'get_audio_review_claims_authenticated',
    get_audio_assessment_history: 'get_audio_assessment_history_authenticated',
    claim_review_case: 'claim_review_case_authenticated',
    release_review_case: 'release_review_case_authenticated',
    assign_review_case: 'assign_review_case_authenticated',
    save_annotation_version: 'save_annotation_version_authenticated',
    save_proofing_draft: 'save_proofing_draft_authenticated',
    claim_audio_review_case: 'claim_audio_review_case_authenticated',
    release_audio_review_case: 'release_audio_review_case_authenticated',
    submit_audio_assessment: 'submit_audio_assessment_authenticated',
    return_review_case: 'return_review_case_authenticated',
    approve_review_case: 'approve_review_case_authenticated'
});

function getReviewWorkflowRpcRequest(rpcName, body) {
    const authenticatedRpcName = AUTHENTICATED_REVIEW_RPC_NAMES[rpcName];
    if (!authenticatedRpcName) return { rpcName, body: body || {} };
    const sanitizedBody = { ...(body || {}) };
    delete sanitizedBody.p_actor_account;
    delete sanitizedBody.p_assessor_account;
    return { rpcName: authenticatedRpcName, body: sanitizedBody };
}

async function reviewWorkflowRpc(rpcName, body) {
    const request = getReviewWorkflowRpcRequest(rpcName, body);
    const accessToken = await getSupabaseAuthAccessToken();
    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${request.rpcName}`, {
        method: 'POST',
        headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${accessToken || CONFIG.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(request.body || {})
    });
    if (!response.ok) throw new Error(await response.text());
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

async function loadReviewWorkflowQueue({ silent = false } = {}) {
    if (!isReviewWorkflowRole()) return [];
    try {
        const rows = await reviewWorkflowRpc('get_review_workflow_queue', {
            p_actor_account: state.userId
        });
        state.reviewWorkflowQueue = Array.isArray(rows) ? rows : [];
        if (isAudioReviewRole()) {
            try {
                const claims = await reviewWorkflowRpc('get_audio_review_claims', {
                    p_actor_account: state.userId
                });
                const claimsByCase = new Map((Array.isArray(claims) ? claims : [])
                    .map(claim => [Number(claim.case_id), claim]));
                state.reviewWorkflowQueue = state.reviewWorkflowQueue.map(row => ({
                    ...row,
                    ...(claimsByCase.get(Number(row.case_id)) || {})
                }));
            } catch (claimError) {
                console.warn('音檔檢驗 claim 狀態尚未部署:', claimError);
            }
        }
        state.reviewWorkflowAvailable = true;
        if (state.currentTab === 'review') renderReviewWorkflowQueue();
        return state.reviewWorkflowQueue;
    } catch (error) {
        state.reviewWorkflowQueue = [];
        state.reviewWorkflowAvailable = false;
        console.warn('審查 workflow 尚未可用:', error);
        if (!silent) alert(`審查 workflow 尚未部署：${error.message}`);
        if (state.currentTab === 'review') renderReviewWorkflowQueue();
        return [];
    }
}

function hasReviewWorkflowDraft(row) {
    const fields = getReviewWorkflowFields(row);
    return row?.version_kind === 'draft'
        && Object.values(fields).some(value => String(value || '').trim());
}

function getReviewWorkflowDraftFilter() {
    if (state.userRole !== 'admin') return 'all';
    return ['all', 'draft', 'no-draft'].includes(state.reviewWorkflowDraftFilter)
        ? state.reviewWorkflowDraftFilter
        : 'all';
}

function getReviewWorkflowVisibleRows() {
    if (getReviewWorkbenchMode() === 'audio') return state.reviewWorkflowQueue;
    const filter = getReviewWorkflowDraftFilter();
    if (filter === 'draft') return state.reviewWorkflowQueue.filter(hasReviewWorkflowDraft);
    if (filter === 'no-draft') return state.reviewWorkflowQueue.filter(row => !hasReviewWorkflowDraft(row));
    return state.reviewWorkflowQueue;
}

function getReviewWorkflowAudioFilterState(rows = state.reviewWorkflowQueue) {
    const sourceRows = rows.filter(row => getReviewWorkflowAudioProgress(row).total > 0);
    const counties = [...new Set(sourceRows.map(row => row?.county).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    const requestedCounty = String(state.reviewWorkflowAudioCountyFilter || '').trim();
    const county = counties.includes(requestedCounty) ? requestedCounty : '';
    const towns = [...new Set(sourceRows
        .filter(row => !county || row?.county === county)
        .map(row => row?.town)
        .filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    const selectedTowns = Array.isArray(state.reviewWorkflowAudioSelectedTowns)
        ? state.reviewWorkflowAudioSelectedTowns.filter(town => towns.includes(town))
        : [...towns];
    const languages = [...new Set(sourceRows.map(row => row?.language).filter(Boolean))]
        .sort((a, b) => String(a).localeCompare(String(b), 'zh-Hant'));
    const validStatuses = ['all', 'unreviewed', 'completed'];
    const validFlags = ['all', 'followup', 'unusable'];
    const validClaims = ['all', 'mine', 'available', 'other'];
    const validLanguage = state.reviewWorkflowAudioLanguageFilter === 'all'
        || languages.includes(state.reviewWorkflowAudioLanguageFilter);
    return {
        status: validStatuses.includes(state.reviewWorkflowAudioStatusFilter)
            ? state.reviewWorkflowAudioStatusFilter
            : 'all',
        flag: validFlags.includes(state.reviewWorkflowAudioFlagFilter)
            ? state.reviewWorkflowAudioFlagFilter
            : 'all',
        claim: validClaims.includes(state.reviewWorkflowAudioClaimFilter)
            ? state.reviewWorkflowAudioClaimFilter
            : 'all',
        keyword: String(state.reviewWorkflowAudioKeyword || '').trim().toLocaleLowerCase(),
        county,
        counties,
        towns,
        selectedTowns,
        languages,
        language: validLanguage ? state.reviewWorkflowAudioLanguageFilter : 'all'
    };
}

function getReviewWorkflowAudioTownSummary(filters) {
    if (!filters.county) return '請先選擇縣市';
    if (!filters.towns.length) return '無可選鄉鎮';
    if (filters.selectedTowns.length === filters.towns.length) return '所有鄉鎮';
    if (!filters.selectedTowns.length) return '未選鄉鎮';
    if (filters.selectedTowns.length === 1) return filters.selectedTowns[0];
    return '已選 ' + filters.selectedTowns.length + ' 個鄉鎮';
}

function getReviewWorkflowAudioProgress(row) {
    const evidence = getReviewWorkflowAudioEvidence(row);
    const total = Math.max(Number(row?.audio_record_count || 0), evidence.length);
    const assessed = Math.max(
        Number(row?.assessed_audio_count || 0),
        evidence.filter(item => item.assessment_decision && item.assessment_decision !== '未審聽').length
    );
    const followup = Math.max(
        Number(row?.follow_up_audio_count || 0),
        evidence.filter(item => item.needs_followup || item.assessment_decision === '待追問').length
    );
    const unusable = Math.max(
        Number(row?.unusable_audio_count || 0),
        evidence.filter(item => item.assessment_decision === '不可用').length
    );
    return { total, assessed, followup, unusable };
}

function getReviewWorkflowAudioClaimState(row) {
    const claimUntil = new Date(row?.audio_claim_until || 0).getTime();
    const active = Boolean(row?.audio_claim_by)
        && Number.isFinite(claimUntil)
        && claimUntil > Date.now();
    if (!active) return 'available';
    return row.audio_claim_by === state.userId ? 'mine' : 'other';
}

function getReviewWorkflowAudioKeywordText(row) {
    const evidence = getReviewWorkflowAudioEvidence(row);
    return [
        row?.place_name, row?.source_id, row?.source_table, row?.county, row?.town,
        row?.village, row?.language, row?.class_name, row?.case_id, row?.task_id,
        ...evidence.flatMap(item => [
            item.audio_record_id, item.audio_file_id, item.recorder_name,
            item.respondent_key, item.assessment_decision, item.assessment_reason,
            item.unusable_reason_code, item.unusable_reason_text,
            item.followup_reason_text
        ])
    ].filter(value => value !== null && value !== undefined)
        .join(' ')
        .toLocaleLowerCase();
}

function getReviewWorkflowAudioVisibleRows(rows = state.reviewWorkflowQueue) {
    const filters = getReviewWorkflowAudioFilterState(rows);
    return rows.filter(row => {
        const progress = getReviewWorkflowAudioProgress(row);
        if (progress.total <= 0) return false;
        const hasUnreviewed = progress.total > progress.assessed;
        const hasFollowup = progress.followup > 0;
        const hasUnusable = progress.unusable > 0;
        const countyMatches = !filters.county || row?.county === filters.county;
        const townMatches = !filters.county || filters.selectedTowns.includes(row?.town);
        const languageMatches = filters.language === 'all' || row?.language === filters.language;
        const progressMatches = filters.status === 'all'
            || (filters.status === 'unreviewed' && hasUnreviewed)
            || (filters.status === 'completed' && !hasUnreviewed);
        const flagMatches = filters.flag === 'all'
            || (filters.flag === 'followup' && hasFollowup)
            || (filters.flag === 'unusable' && hasUnusable);
        const claimMatches = filters.claim === 'all'
            || getReviewWorkflowAudioClaimState(row) === filters.claim;
        const keywordMatches = !filters.keyword
            || getReviewWorkflowAudioKeywordText(row).includes(filters.keyword);
        return countyMatches && townMatches && languageMatches && progressMatches && flagMatches && claimMatches && keywordMatches;
    });
}

function setReviewWorkflowAudioCountyFilter(value) {
    const filters = getReviewWorkflowAudioFilterState();
    state.reviewWorkflowAudioCountyFilter = filters.counties.includes(value) ? value : '';
    state.reviewWorkflowAudioSelectedTowns = null;
    state.reviewWorkflowAudioTownDropdownOpen = false;
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function toggleReviewWorkflowAudioTownDropdown(event) {
    if (event) event.stopPropagation();
    const filters = getReviewWorkflowAudioFilterState();
    if (!filters.county || !filters.towns.length) return;
    state.reviewWorkflowAudioTownDropdownOpen = !state.reviewWorkflowAudioTownDropdownOpen;
    renderReviewWorkflowQueue();
}

function selectAllReviewWorkflowAudioTowns(event) {
    if (event) event.stopPropagation();
    const filters = getReviewWorkflowAudioFilterState();
    if (!filters.county) return;
    const allSelected = filters.towns.length > 0
        && filters.selectedTowns.length === filters.towns.length
        && filters.towns.every(town => filters.selectedTowns.includes(town));
    state.reviewWorkflowAudioSelectedTowns = allSelected ? [] : [...filters.towns];
    state.reviewWorkflowAudioTownDropdownOpen = true;
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function toggleReviewWorkflowAudioTownValue(town, event) {
    if (event) event.stopPropagation();
    const filters = getReviewWorkflowAudioFilterState();
    if (!filters.county || !filters.towns.includes(town)) return;
    const selected = new Set(filters.selectedTowns);
    if (selected.has(town)) selected.delete(town);
    else selected.add(town);
    state.reviewWorkflowAudioSelectedTowns = filters.towns.filter(item => selected.has(item));
    state.reviewWorkflowAudioTownDropdownOpen = true;
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function setReviewWorkflowAudioLanguageFilter(value) {
    const filters = getReviewWorkflowAudioFilterState();
    state.reviewWorkflowAudioLanguageFilter = value === 'all' || filters.languages.includes(value) ? value : 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}
function setReviewWorkflowAudioStatusFilter(value, form) {
    const keywordInput = form?.querySelector('[data-role="audio-keyword"]');
    if (keywordInput) state.reviewWorkflowAudioKeyword = keywordInput.value.trim();
    state.reviewWorkflowAudioStatusFilter = ['all', 'unreviewed', 'completed'].includes(value)
        ? value
        : 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function setReviewWorkflowAudioFlagFilter(value, form) {
    const keywordInput = form?.querySelector('[data-role="audio-keyword"]');
    if (keywordInput) state.reviewWorkflowAudioKeyword = keywordInput.value.trim();
    state.reviewWorkflowAudioFlagFilter = ['all', 'followup', 'unusable'].includes(value)
        ? value
        : 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function setReviewWorkflowAudioClaimFilter(value, form) {
    const keywordInput = form?.querySelector('[data-role="audio-keyword"]');
    if (keywordInput) state.reviewWorkflowAudioKeyword = keywordInput.value.trim();
    state.reviewWorkflowAudioClaimFilter = ['all', 'mine', 'available', 'other'].includes(value)
        ? value
        : 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function applyReviewWorkflowAudioKeywordFilter(form) {
    state.reviewWorkflowAudioKeyword = String(form?.querySelector('[data-role="audio-keyword"]')?.value || '').trim();
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function clearReviewWorkflowAudioFilters() {
    state.reviewWorkflowAudioStatusFilter = 'all';
    state.reviewWorkflowAudioFlagFilter = 'all';
    state.reviewWorkflowAudioClaimFilter = 'all';
    state.reviewWorkflowAudioKeyword = '';
    state.reviewWorkflowAudioCountyFilter = '';
    state.reviewWorkflowAudioSelectedTowns = null;
    state.reviewWorkflowAudioTownDropdownOpen = false;
    state.reviewWorkflowAudioLanguageFilter = 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function setReviewWorkflowDraftFilter(value) {
    state.reviewWorkflowDraftFilter = ['all', 'draft', 'no-draft'].includes(value) ? value : 'all';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function getReviewWorkflowSourceType(row) {
    return String(row?.annotation_source_type || row?.source_type || '').trim().toLowerCase();
}

function isReviewWorkflowSatelliteRow(row) {
    return getReviewWorkflowSourceType(row) === 'satellite';
}

function isReviewWorkflowWrittenRow(row) {
    return isReviewWorkflowSatelliteRow(row) || isWrittenAnnotationClass(row?.class_name);
}

function getReviewWorkbenchMode() {
    if (isAudioAssessorRole()) return 'audio';
    if (state.userRole !== 'admin') return 'proofing';
    return state.reviewWorkbenchMode === 'audio' ? 'audio' : 'proofing';
}

function setReviewWorkbenchMode(mode) {
    if (state.userRole !== 'admin') return;
    state.reviewWorkbenchMode = mode === 'audio' ? 'audio' : 'proofing';
    if (state.currentTab === 'review') renderReviewWorkflowQueue();
}

function renderReviewWorkbenchSwitcher() {
    const mode = getReviewWorkbenchMode();
    const proofingButton = state.userRole === 'admin' || isProofreaderRole()
        ? "<button type='button' class='review-workbench-mode-btn " + (mode === 'proofing' ? 'is-active' : '') + "' data-mode='proofing' aria-pressed='" + (mode === 'proofing') + "' onclick='setReviewWorkbenchMode(\"proofing\")'>校對審查</button>"
        : '';
    const audioButton = state.userRole === 'admin'
        ? "<button type='button' class='review-workbench-mode-btn " + (mode === 'audio' ? 'is-active' : '') + "' data-mode='audio' aria-pressed='" + (mode === 'audio') + "' onclick='setReviewWorkbenchMode(\"audio\")'>音檔檢驗</button>"
        : (isAudioAssessorRole() ? "<span class='review-workbench-mode-btn is-active' aria-label='目前工作台：音檔檢驗'>音檔檢驗</span>" : '');
    return "<div class='review-workbench-switcher' role='group' aria-label='審查工作台'>" +
        "<strong>工作台</strong>" +
        "<div class='review-workbench-mode-buttons'>" +
        proofingButton +
        audioButton +
        "</div></div>";
}
function renderReviewWorkflowAdminFilter(visibleRows) {
    const activeFilter = getReviewWorkflowDraftFilter();
    return `
        <div class="review-workflow-filter-bar">
            <label for="review-workflow-draft-filter">\u8349\u7a3f\u72c0\u614b
                <select id="review-workflow-draft-filter" onchange="setReviewWorkflowDraftFilter(this.value)">
                    <option value="all" ${activeFilter === 'all' ? 'selected' : ''}>\u5168\u90e8\u6848\u4ef6</option>
                    <option value="draft" ${activeFilter === 'draft' ? 'selected' : ''}>\u6709\u6821\u5c0d\u8349\u7a3f</option>
                    <option value="no-draft" ${activeFilter === 'no-draft' ? 'selected' : ''}>\u7121\u6821\u5c0d\u8349\u7a3f</option>
                </select>
            </label>
            <span class="review-workflow-filter-count">\u986f\u793a ${visibleRows.length} / ${state.reviewWorkflowQueue.length} \u7b46</span>
        </div>
    `;
}
function renderReviewWorkflowAudioTownFilter(filters) {
    const selectedSet = new Set(filters.selectedTowns);
    const allChecked = filters.towns.length > 0
        && filters.selectedTowns.length === filters.towns.length
        && filters.towns.every(town => selectedSet.has(town));
    const disabled = !filters.county || !filters.towns.length;
    const allRow = '<label class="town-filter-option">' +
        '<input type="checkbox" ' + (allChecked ? 'checked' : '') +
        ' onchange="event.stopPropagation(); selectAllReviewWorkflowAudioTowns(event)">' +
        '<span>所有鄉鎮</span>' +
        '</label>';
    const townRows = filters.towns.map(town =>
        '<label class="town-filter-option">' +
            '<input type="checkbox" ' + (selectedSet.has(town) ? 'checked' : '') +
            ' onchange="event.stopPropagation(); toggleReviewWorkflowAudioTownValue(\'' + escapeJsString(town) + '\', event)">' +
            '<span>' + escapeHtml(town) + '</span>' +
        '</label>'
    ).join('');
    const menu = disabled
        ? '<div class="review-workflow-audio-town-empty">請先選擇縣市</div>'
        : allRow + townRows;
    return '<div class="town-multi-filter review-workflow-audio-town-multi-filter" id="review-workflow-audio-town-filter">' +
        '<button type="button" class="town-filter-button review-workflow-audio-town-button" aria-haspopup="true" aria-expanded="' +
            (state.reviewWorkflowAudioTownDropdownOpen ? 'true' : 'false') +
            '" onclick="toggleReviewWorkflowAudioTownDropdown(event)"' + (disabled ? ' disabled' : '') + '>' +
            '<span>' + escapeHtml(getReviewWorkflowAudioTownSummary(filters)) + '</span>' +
        '</button>' +
        '<div class="town-filter-menu review-workflow-audio-town-menu ' +
            (state.reviewWorkflowAudioTownDropdownOpen ? '' : 'hidden') +
            '" onclick="event.stopPropagation()">' + menu + '</div>' +
        '</div>';
}
function renderReviewWorkflowAudioFilter(totalRows, visibleRows) {
    const filters = getReviewWorkflowAudioFilterState(totalRows);
    const statusOptions = [
        ['all', '不限音檔進度'],
        ['unreviewed', '尚有未審聽'],
        ['completed', '所有音檔均已判定']
    ].map(([value, label]) =>
        '<option value="' + value + '"' + (filters.status === value ? ' selected' : '') + '>' + label + '</option>'
    ).join('');
    const flagOptions = [
        ['all', '不限特殊標記'],
        ['followup', '需後續處理'],
        ['unusable', '含不可用音檔']
    ].map(([value, label]) =>
        '<option value="' + value + '"' + (filters.flag === value ? ' selected' : '') + '>' + label + '</option>'
    ).join('');
    const claimOptions = [
        ['all', '全部領取狀態'],
        ['mine', '我已領取'],
        ['available', '可領取'],
        ['other', '他人檢驗中']
    ].map(([value, label]) =>
        '<option value="' + value + '"' + (filters.claim === value ? ' selected' : '') + '>' + label + '</option>'
    ).join('');
    const countyOptions = filters.counties.map(county =>
        '<option value="' + escapeHtml(county) + '"' + (filters.county === county ? ' selected' : '') + '>' +
        escapeHtml(county) + '</option>'
    ).join('');
    const languageOptions = filters.languages.map(language =>
        '<option value="' + escapeHtml(language) + '"' + (filters.language === language ? ' selected' : '') + '>' +
        escapeHtml(language) + '</option>'
    ).join('');
    return `
        <form class="review-workflow-audio-filter-bar" onsubmit="event.preventDefault(); applyReviewWorkflowAudioKeywordFilter(this)">
            <div class="review-workflow-audio-primary">
                <div class="review-workflow-audio-primary-heading">
                    <strong>主要篩選</strong>
                    <span>先選行政區與語種，再開始審聽</span>
                    <button type="button" class="review-workflow-audio-primary-clear" onclick="clearReviewWorkflowAudioFilters()">清除全部條件</button>
                </div>
                <section class="review-workflow-audio-filter-group">
                    <h3>行政區</h3>
                    <div class="review-workflow-audio-filter-row">
                        <label>
                            <span>縣市</span>
                            <select id="review-workflow-audio-county-filter" aria-label="縣市" onchange="setReviewWorkflowAudioCountyFilter(this.value)">
                                <option value=""${filters.county === '' ? ' selected' : ''}>全部縣市</option>
                                ${countyOptions}
                            </select>
                        </label>
                        <div class="review-workflow-audio-town-label">
                            <span>鄉鎮</span>
                            ${renderReviewWorkflowAudioTownFilter(filters)}
                        </div>
                    </div>
                </section>
                <section class="review-workflow-audio-filter-group">
                    <h3>語種</h3>
                    <div id="review-workflow-audio-language-filter" class="review-workflow-audio-language-chips" role="radiogroup" aria-label="語種">
                        <button type="button" class="review-workflow-audio-language-option ${filters.language === 'all' ? 'is-selected' : ''}" data-language="all" aria-pressed="${filters.language === 'all'}" onclick="setReviewWorkflowAudioLanguageFilter('all')">全部語種</button>
                        ${filters.languages.map(language =>
                            '<button type="button" class="review-workflow-audio-language-option ' + (filters.language === language ? 'is-selected' : '') +
                            '" data-language="' + escapeHtml(language) + '" aria-pressed="' + (filters.language === language) +
                            '" onclick="setReviewWorkflowAudioLanguageFilter(\'' + escapeJsString(language) + '\')">' +
                            escapeHtml(language) + '</button>'
                        ).join('')}
                    </div>
                </section>
            </div>
            <details class="review-workflow-audio-secondary">
                <summary>
                    <span>其他篩選</span>
                    <small>進度、特殊標記、領取狀態、關鍵字</small>
                </summary>
                <div class="review-workflow-audio-secondary-body">
                    <label class="review-workflow-audio-keyword">
                        <span>關鍵字</span>
                        <input id="review-workflow-audio-keyword" type="search" data-role="audio-keyword" value="${escapeHtml(state.reviewWorkflowAudioKeyword || '')}" placeholder="地名／來源 ID／音檔 ID／錄音人" autocomplete="off">
                    </label>
                    <div class="review-workflow-audio-secondary-options">
                        <label>
                            <span>音檔進度</span>
                            <select id="review-workflow-audio-status-filter" onchange="setReviewWorkflowAudioStatusFilter(this.value, this.form)">
                                ${statusOptions}
                            </select>
                        </label>
                        <label>
                            <span>特殊標記</span>
                            <select id="review-workflow-audio-flag-filter" onchange="setReviewWorkflowAudioFlagFilter(this.value, this.form)">
                                ${flagOptions}
                            </select>
                        </label>
                        <label>
                            <span>領取狀態</span>
                            <select id="review-workflow-audio-claim-filter" onchange="setReviewWorkflowAudioClaimFilter(this.value, this.form)">
                                ${claimOptions}
                            </select>
                        </label>
                    </div>
                    <p class="review-workflow-audio-filter-hint">音檔進度只看每筆音檔是否已判定；特殊標記則看是否需後續處理或含不可用音檔，兩者可以同時套用。</p>
                    <div class="review-workflow-audio-secondary-actions">
                        <button type="submit" class="review-workflow-audio-filter-apply">套用其他篩選</button>
                        <button type="button" class="review-workflow-audio-filter-clear" onclick="clearReviewWorkflowAudioFilters()">清除全部條件</button>
                    </div>
                </div>
            </details>
            <div class="review-workflow-audio-filter-count">顯示 ${visibleRows.length} / ${totalRows.length} 筆音檔案件</div>
        </form>
    `;
}

function getReviewWorkflowFields(row) {
    const fields = row?.annotation_fields || {};
    if (typeof fields === 'string') {
        try { return JSON.parse(fields) || {}; } catch (error) { return {}; }
    }
    return fields;
}

function renderLegacyReviewWorkflowFields(row) {
    const fields = getReviewWorkflowFields(row);
    const entries = Object.entries(fields).filter(([, value]) => String(value || '').trim());
    if (entries.length === 0) return '<div class="review-workflow-empty">尚無標注版本（legacy 資料不會自動視為已審查）。</div>';
    return `<div class="review-workflow-fields">${entries.map(([key, value]) => `
        <div class="review-workflow-field"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>
    `).join('')}</div>`;
}

function renderReviewWorkflowFields(row, canEdit = false) {
    const fields = getReviewWorkflowFields(row);
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    if (!canEdit && Object.keys(fields).length === 0) {
        return '<div class="review-workflow-empty">\u5c1a\u7121\u6a19\u6ce8\u7248\u672c\uff08legacy \u8cc7\u6599\u4e0d\u6703\u81ea\u52d5\u8996\u70ba\u5df2\u5be9\u67e5\uff09\u3002</div>';
    }
    if (!canEdit) {
        const entries = Object.entries(fields).filter(([, value]) => String(value || '').trim());
        return `<div class="review-workflow-fields">${entries.map(([key, value]) => `
            <div class="review-workflow-field"><span>${escapeHtml(key)}</span><strong>${escapeHtml(value)}</strong></div>
        `).join('')}</div>`;
    }
    return `
        <div class="review-workflow-draft-toolbar">
            <small>\u5148\u9818\u53d6\u6848\u4ef6\uff0c\u518d\u5f9e\u8abf\u67e5\u54e1\u97f3\u6a94\u5e36\u5165\u5167\u5bb9\uff1b\u5e36\u5165\u5f8c\u4ecd\u53ef\u9010\u6b04\u4fee\u6539\u3002</small>
            <div class="review-workflow-draft-tools">
                <button class="review-workflow-fill-existing-btn" type="button" onclick="fillReviewWorkflowDraftFromExisting(${row.case_id})">\u5e36\u5165\u76ee\u524d\u6a19\u6ce8</button>
                <button class="review-workflow-clear-btn" type="button" onclick="clearReviewWorkflowDraft(${row.case_id})">\u6e05\u7a7a\u8349\u7a3f</button>
            </div>
        </div>
        <div class="review-workflow-fields">
            ${config.fields.map(field => {
                const value = fields[field.key] || '';
                const inputId = getReviewWorkflowInputId(row.case_id, languageKey, field.key);
                const control = field.multiline
                    ? `<textarea id="${inputId}" rows="3" placeholder="${escapeHtml(field.placeholder || field.label)}">${escapeHtml(value)}</textarea>`
                    : `<input id="${inputId}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || field.label)}">`;
                return `
                    <label class="review-workflow-field ${field.multiline ? 'is-multiline' : ''}" for="${inputId}">
                        <span>${escapeHtml(field.label)}</span>
                        ${control}
                    </label>
                `;
            }).join('')}
        </div>
    `;
}

function getReviewWorkflowInputId(caseId, languageKey, fieldKey) {
    return `review-workflow-${caseId}-${languageKey}-${fieldKey}`;
}

function getReviewWorkflowRow(caseId) {
    return state.reviewWorkflowQueue.find(row => Number(row.case_id) === Number(caseId)) || null;
}

function collectReviewWorkflowDraftFields(caseId) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return {};
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    return config.fields.reduce((fields, field) => {
        const input = document.getElementById(getReviewWorkflowInputId(caseId, languageKey, field.key));
        fields[field.key] = input ? input.value.trim() : '';
        return fields;
    }, {});
}

function hasReviewWorkflowDraftValues(fields) {
    return Object.values(fields || {}).some(value => String(value || '').trim());
}

function setReviewWorkflowDraftFields(caseId, fields) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return;
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    config.fields.forEach(field => {
        const input = document.getElementById(getReviewWorkflowInputId(caseId, languageKey, field.key));
        if (input) input.value = fields?.[field.key] || '';
    });
}

function fillReviewWorkflowDraftFromExisting(caseId) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return;
    setReviewWorkflowDraftFields(caseId, getReviewWorkflowFields(row));
}

function clearReviewWorkflowDraft(caseId) {
    setReviewWorkflowDraftFields(caseId, {});
}

function getReviewWorkflowSourceFieldValue(source, field) {
    let annotations = source?.annotations || {};
    if (typeof annotations === 'string') {
        try { annotations = JSON.parse(annotations) || {}; } catch (error) { annotations = {}; }
    }
    for (const key of field.annotationKeys || []) {
        if (annotations[key]) return annotations[key];
    }
    return field.fallbackRecordKey ? (source?.[field.fallbackRecordKey] || source?.phonetic_reading || '') : '';
}

function getReviewWorkflowAudioDraftInputId(caseId, languageKey, fieldKey) {
    return 'review-audio-draft-' + caseId + '-' + languageKey + '-' + fieldKey;
}

function collectReviewWorkflowAudioDraftFields(caseId) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return {};
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    return config.fields.reduce((fields, field) => {
        const input = document.getElementById(getReviewWorkflowAudioDraftInputId(caseId, languageKey, field.key));
        fields[field.key] = input ? input.value.trim() : '';
        return fields;
    }, {});
}

function hasReviewWorkflowAudioDraftValues(fields) {
    return Object.values(fields || {}).some(value => String(value || '').trim());
}

function getReviewWorkflowAudioDraftSourceId(panel) {
    const value = panel?.querySelector('[data-role="audio-draft-source"]')?.value || '';
    const sourceId = Number(value);
    return Number.isInteger(sourceId) && sourceId > 0 ? sourceId : null;
}

function getReviewWorkflowAudioEvidenceItem(row, audioRecordId) {
    return getReviewWorkflowAudioEvidence(row)
        .find(item => Number(item.audio_record_id) === Number(audioRecordId)) || null;
}

function isReviewWorkflowAudioEvidenceUsable(item) {
    const needsFollowup = item?.needs_followup === true
        || String(item?.needs_followup || '').toLowerCase() === 'true';
    return item?.assessment_decision === '可用' && !needsFollowup;
}

function getReviewWorkflowUsableAudioEvidence(row) {
    return getReviewWorkflowAudioEvidence(row).filter(isReviewWorkflowAudioEvidenceUsable);
}

function hasActiveReviewWorkflowProofingClaim(row) {
    const claimUntil = new Date(row?.claim_until || 0).getTime();
    return Boolean(row?.claim_by)
        && Number.isFinite(claimUntil)
        && claimUntil > Date.now();
}

function createReviewWorkflowClientRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto?.getRandomValues?.(bytes);
    if (!bytes.some(Boolean)) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
}
async function fillReviewWorkflowDraftFromAudio(caseId, audioRecordId, button) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return;
    const originalText = button?.innerText || '';
    if (button) { button.disabled = true; button.innerText = '\u5e36\u5165\u4e2d...'; }
    try {
        const sources = await reviewWorkflowRpc('get_review_workflow_audio_sources', {
            p_case_id: Number(caseId)
        });
        const source = (Array.isArray(sources) ? sources : [])
            .find(item => Number(item.audio_record_id) === Number(audioRecordId));
        if (!source) throw new Error('Unable to find investigator content for this audio.');
        const languageKey = getReviewLanguageKey(row.language);
        const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
        const fields = config.fields.reduce((values, field) => {
            values[field.key] = getReviewWorkflowSourceFieldValue(source, field);
            return values;
        }, {});
        setReviewWorkflowDraftFields(caseId, fields);
        alert('\u5df2\u5e36\u5165\u9019\u7b46\u8abf\u67e5\u54e1\u5167\u5bb9\uff0c\u8acb\u78ba\u8a8d\u5f8c\u4fdd\u5b58\u6821\u5c0d\u8349\u7a3f\u3002');
    } catch (error) {
        alert(`\u5e36\u5165\u8abf\u67e5\u54e1\u5167\u5bb9\u5931\u6557\uff1a${error.message}`);
    } finally {
        if (button) { button.disabled = false; button.innerText = originalText; }
    }
}

function getReviewWorkflowAudioEvidence(row) {
    const evidence = row?.audio_evidence || [];
    if (Array.isArray(evidence)) return evidence;
    if (typeof evidence === 'string') {
        try { return JSON.parse(evidence) || []; } catch (error) { return []; }
    }
    return [];
}

function formatReviewWorkflowAudioAssessmentTime(value) {
    if (!value) return '時間未知';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
        return new Intl.DateTimeFormat('zh-TW', {
            timeZone: 'Asia/Taipei',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        }).format(date);
    } catch (error) {
        return date.toLocaleString('zh-TW');
    }
}

function getReviewWorkflowAudioAssessorLabel(account) {
    const normalizedAccount = String(account || '').trim();
    if (!normalizedAccount) return '未提供';
    if (isCurrentUserIdentifier(normalizedAccount) && state.userName) return state.userName;
    return getUserDisplayName(normalizedAccount) || normalizedAccount;
}

function getReviewWorkflowAudioAssessorTitle(account) {
    const normalizedAccount = String(account || '').trim();
    if (!normalizedAccount) return '';
    const email = getUserEmail(normalizedAccount);
    return email ? '帳號：' + email : '';
}

function renderReviewWorkflowAudioAssessmentMeta(item) {
    const decision = item?.assessment_decision || '';
    if (decision === '未審聽' || (!item?.assessor_account && !item?.assessed_at)) return '';
    const assessorAccount = item.assessor_account || '';
    const assessorLabel = getReviewWorkflowAudioAssessorLabel(assessorAccount);
    const assessorTitle = getReviewWorkflowAudioAssessorTitle(assessorAccount);
    return '<div class="review-workflow-assessment-meta">' +
        '<span><strong>最後判定人</strong>：<span title="' + escapeHtml(assessorTitle) + '">' + escapeHtml(assessorLabel) + '</span></span>' +
        '<span><strong>最後判定時間</strong>：' + escapeHtml(formatReviewWorkflowAudioAssessmentTime(item.assessed_at)) + '</span>' +
        '</div>';
}

function canAssessReviewWorkflowAudio(row) {
    if (!isAudioReviewRole() || getReviewWorkbenchMode() !== 'audio') return false;
    if (state.userRole === 'admin') return true;
    if (row?.audio_claim_by !== state.userId) return false;
    const claimUntil = new Date(row.audio_claim_until || 0).getTime();
    return Number.isFinite(claimUntil) && claimUntil > Date.now();
}

function canAnnotateReviewWorkflowAudio(row) {
    if (!canAssessReviewWorkflowAudio(row)) return false;
    if (row?.state === '已完成' || hasActiveReviewWorkflowProofingClaim(row)) return false;
    return getReviewWorkflowUsableAudioEvidence(row).length > 0;
}

function renderLegacyReviewWorkflowAudioEvidence(row, canEdit = false) {
    const evidence = getReviewWorkflowAudioEvidence(row);
    if (evidence.length === 0) return '<div class="review-workflow-empty">沒有可顯示的音檔 evidence。</div>';
    const canAssess = canAssessReviewWorkflowAudio(row);
    return `<div class="review-workflow-audio-list">${evidence.map(item => `
        <div class="review-workflow-audio-row">
            <span>音檔 #${escapeHtml(item.audio_record_id)}｜${escapeHtml(item.recorder_name || '未知錄音人')}｜${escapeHtml(item.assessment_decision || '未審聽')}</span>
            ${item.audio_file_id ? `<button class="play-btn compact" type="button" onclick="fetchAndPlayAudio('${escapeJsString(item.audio_file_id)}', 'review-audio-${escapeJsString(String(item.audio_record_id))}')">播放</button>` : ''}
            ${canAssess ? `<button class="review-workflow-assess-btn" type="button" onclick="submitReviewWorkflowAudioAssessment(${row.task_id}, '${escapeJsString(row.language)}', ${item.audio_record_id}, this)">判定</button>` : ''}
            ${canEdit ? `<button class="review-workflow-fill-audio-btn" type="button" onclick="fillReviewWorkflowDraftFromAudio(${row.case_id}, ${item.audio_record_id}, this)">\u586b\u5165\u9019\u7b46\u5167\u5bb9</button>` : ''}
            <div id="review-audio-${escapeHtml(String(item.audio_record_id))}" class="review-player"></div>
        </div>
    `).join('')}</div>`;
}

function getReviewWorkflowAudioSources(row) {
    const sources = row?.audio_sources || [];
    if (Array.isArray(sources)) return sources;
    if (typeof sources === 'string') {
        try { return JSON.parse(sources) || []; } catch (error) { return []; }
    }
    return [];
}

function getReviewWorkflowAudioSource(row, audioRecordId) {
    return getReviewWorkflowAudioSources(row)
        .find(source => Number(source.audio_record_id) === Number(audioRecordId)) || null;
}

function renderReviewWorkflowSourceCell(row, audioRecordId, field, source, canEdit, canAnnotate = false) {
    const value = source ? getReviewWorkflowSourceFieldValue(source, field) : '';
    const isLoading = row.audio_sources_loaded !== true && !Array.isArray(row.audio_sources);
    const displayValue = isLoading ? '\u8b80\u53d6\u4e2d\u2026' : (value || '\u672a\u586b');
    const annotationCopyButton = canAnnotate && value
        ? `<button class="copy-field-btn review-workflow-audio-draft-fill-field-btn" type="button" onclick="fillReviewWorkflowAudioDraftFieldFromSource(${row.case_id}, ${audioRecordId}, '${escapeJsString(field.key)}', this)">\u5e36\u5165</button>`
        : '';
    const fillButton = canEdit && value
        ? `<button class="copy-field-btn review-workflow-fill-field-btn" type="button" onclick="fillReviewWorkflowDraftFieldFromAudio(${row.case_id}, ${audioRecordId}, '${escapeJsString(field.key)}', this)">\u586b\u5165</button>`
        : annotationCopyButton;
    return `
        <div class="review-workflow-source-field ${value ? 'has-value' : ''}">
            <div class="review-workflow-source-field-label">${escapeHtml(field.label)}</div>
            <div class="compare-value">${escapeHtml(displayValue)}</div>
            ${fillButton}
        </div>
    `;
}

function renderLegacyReviewWorkflowAudioSourceTable(row, canEdit = false) {
    const evidence = getReviewWorkflowAudioEvidence(row);
    if (evidence.length === 0) {
        return '<div class="review-workflow-empty">\u6c92\u6709\u53ef\u986f\u793a\u7684\u97f3\u6a94\u3002</div>';
    }
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    const compareFields = config.compareFields
        .map(fieldKey => config.fields.find(field => field.key === fieldKey))
        .filter(Boolean);
    const sourceById = new Map(getReviewWorkflowAudioSources(row)
        .map(source => [Number(source.audio_record_id), source]));
    const canAssess = canAssessReviewWorkflowAudio(row);
    return `
        <div class="review-record-table-wrap review-workflow-source-table-wrap" data-review-source-table="${row.case_id}">
            <table class="review-record-table review-workflow-source-table">
                <thead>
                    <tr>
                        <th>\u9304\u97f3</th>
                        ${compareFields.map(field => `<th>${escapeHtml(field.label)}</th>`).join('')}
                        <th>\u64ad\u653e</th>
                    </tr>
                </thead>
                <tbody>
                    ${evidence.map((item, index) => {
                        const source = sourceById.get(Number(item.audio_record_id)) || null;
                        const respondent = item.respondent_key || '\u5c1a\u672a\u6307\u5b9a';
                        return `
                            <tr>
                                <td class="review-record-label review-workflow-source-label">
                                    <strong>\u9304\u97f3 ${index + 1}</strong>
                                    <span>#${escapeHtml(item.audio_record_id)}\uFF5C${escapeHtml(item.recorder_name || '\u672a\u77e5\u9304\u97f3\u4eba')}</span>
                                    <span>\u53D7\u8A2A\u8005\uFF1A${escapeHtml(respondent)}</span>
                                    <span>\u5224\u5B9A\uFF1A${escapeHtml(item.assessment_decision || '\u672a\u5be9\u807d')}</span>
                                    ${canAssess ? `<button class="review-workflow-assess-btn" type="button" onclick="submitReviewWorkflowAudioAssessment(${row.task_id}, '${escapeJsString(row.language)}', ${item.audio_record_id}, this)">\u5224\u5b9a</button>` : ''}
                                </td>
                                ${compareFields.map(field => renderReviewWorkflowSourceCell(row, item.audio_record_id, field, source, canEdit)).join('')}
                                <td class="review-play-cell">
                                    ${item.audio_file_id ? `<button class="play-btn compact" type="button" onclick="fetchAndPlayAudio('${escapeJsString(item.audio_file_id)}', 'review-audio-${escapeJsString(String(item.audio_record_id))}')">\u64ad\u653e</button>` : ''}
                                    <div id="review-audio-${escapeHtml(String(item.audio_record_id))}" class="review-player"></div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

function renderReviewWorkflowAudioSourceTable(row, canEdit = false, canAnnotate = false) {
    const evidence = getReviewWorkflowAudioEvidence(row);
    if (evidence.length === 0) {
        return '<div class="review-workflow-empty">\u6c92\u6709\u53ef\u986f\u793a\u7684\u97f3\u6a94\u3002</div>';
    }
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    const compareFields = config.compareFields
        .map(fieldKey => config.fields.find(field => field.key === fieldKey))
        .filter(Boolean);
    const displayFields = canAnnotate ? config.fields : compareFields;
    const sourceById = new Map(getReviewWorkflowAudioSources(row)
        .map(source => [Number(source.audio_record_id), source]));
    const canAssess = canAssessReviewWorkflowAudio(row);
    return `
        <div class="review-workflow-source-list" data-review-source-table="${row.case_id}">
            ${evidence.map((item, index) => {
                const source = sourceById.get(Number(item.audio_record_id)) || null;
                const sourceCanAnnotate = canAnnotate && isReviewWorkflowAudioEvidenceUsable(item);
                const recorder = item.recorder_name || '\u672a\u77e5\u9304\u97f3\u4eba';
                const respondent = item.respondent_key || '\u5c1a\u672a\u6307\u5b9a';
                const decision = item.assessment_decision || '\u672a\u5be9\u807d';
                return `
                    <article class="review-workflow-source-card">
                        <div class="review-workflow-source-heading">
                            <div class="review-workflow-source-summary">
                                <strong>\u9304\u97f3 ${index + 1}</strong>
                                <span class="review-workflow-source-id">#${escapeHtml(item.audio_record_id)}</span>
                                <span class="review-workflow-source-separator">\uFF5C</span>
                                <span>${escapeHtml(recorder)}</span>
                                <span>\u53D7\u8A2A\u8005\uFF1A${escapeHtml(respondent)}</span>
                                <span>\u5224\u5B9A\uFF1A${escapeHtml(decision)}</span>
                                ${renderReviewWorkflowAudioAssessmentMeta(item)}
                            </div>
                            <div class="review-workflow-source-actions">
                                ${sourceCanAnnotate ? `<button class="review-workflow-audio-source-fill-btn" type="button" onclick="fillReviewWorkflowAudioDraftFromSource(${row.case_id}, ${item.audio_record_id}, this)">帶入非空欄位</button>` : ''}
                                ${decision !== '\u672a\u5be9\u807d' ? `<button class="review-workflow-history-btn" type="button" data-history-toggle onclick="toggleReviewWorkflowAudioAssessmentHistory(${row.case_id}, ${item.audio_record_id}, this)" aria-expanded="false" aria-controls="review-workflow-assessment-history-${row.case_id}-${item.audio_record_id}">檢視判定紀錄</button>` : ''}
                                ${item.audio_file_id ? `<button class="play-btn compact" type="button" onclick="fetchAndPlayAudio('${escapeJsString(item.audio_file_id)}', 'review-audio-${escapeJsString(String(item.audio_record_id))}')">\u64AD\u653e</button>` : ''}
                                ${canAssess ? `<button class="review-workflow-assess-btn" type="button" onclick="openReviewWorkflowAudioAssessment(${row.task_id}, '${escapeJsString(row.language)}', ${item.audio_record_id}, this)" aria-expanded="false" aria-controls="review-workflow-assessment-${row.case_id}-${item.audio_record_id}">${decision !== '\u672a\u5be9\u807d' ? '重新判定' : '開始判定'}</button>` : ''}
                            </div>
                        </div>
                        <div class="review-workflow-source-grid">
                            ${displayFields.map(field => renderReviewWorkflowSourceCell(row, item.audio_record_id, field, source, canEdit, sourceCanAnnotate)).join('')}
                        </div>
                        ${canAssess ? renderReviewWorkflowAudioAssessmentPanel(row, item) : ''}
                        ${renderReviewWorkflowAudioAssessmentHistoryPanel(row, item)}
                        <div id="review-audio-${escapeHtml(String(item.audio_record_id))}" class="review-player"></div>
                    </article>
                `;
            }).join('')}
        </div>
    `;
}

function getReviewWorkflowAudioDraftSourceMeta(row, audioRecordId) {
    const item = getReviewWorkflowAudioEvidenceItem(row, audioRecordId);
    if (!item) return '尚未指定採用音檔。';
    const source = getReviewWorkflowAudioSource(row, audioRecordId);
    const sourceVersion = source?.version_no || source?.annotation_version_no
        ? 'v' + (source.version_no || source.annotation_version_no)
        : '錄音人目前標注 snapshot';
    const assessedAt = item.assessed_at
        ? formatReviewWorkflowAudioAssessmentTime(item.assessed_at)
        : '時間未知';
    return '音檔 #' + item.audio_record_id
        + '｜錄音人：' + (item.recorder_name || '未知')
        + '｜判定：' + (item.assessment_decision || '未審聽')
        + '｜判定時間：' + assessedAt
        + '｜來源版本：' + sourceVersion;
}

function getReviewWorkflowDraftVersionKindLabel(versionKind) {
    const key = String(versionKind || '').trim().toLowerCase();
    if (key === 'draft') return '草稿';
    if (key === 'legacy') return '既有資料';
    if (key === 'final') return '定稿';
    return key ? key : '未標示';
}

function getReviewWorkflowDraftSourceTypeLabel(sourceType) {
    const key = String(sourceType || '').trim().toLowerCase();
    if (key === 'audio_assessor') return '審聽員音讀草稿';
    if (key === 'satellite') return '衛星書面草稿';
    if (key === 'app') return '原標注草稿';
    if (key === 'admin') return '管理員建立';
    return key ? key : '未標示來源';
}

function getReviewWorkflowDraftCreatorLabel(account) {
    const normalizedAccount = String(account || '').trim();
    if (!normalizedAccount) return '尚無資料';
    return getUserDisplayName(normalizedAccount) || normalizedAccount;
}

function renderReviewWorkflowAudioDraftCurrentMeta(row) {
    const creatorAccount = row?.annotation_created_by || row?.annotation_source_actor || '';
    const creatorLabel = getReviewWorkflowDraftCreatorLabel(creatorAccount);
    const creatorTitle = creatorAccount ? '帳號：' + creatorAccount : '';
    const createdAt = formatReviewWorkflowAudioAssessmentTime(row?.annotation_created_at);
    const sourceType = getReviewWorkflowDraftSourceTypeLabel(row?.annotation_source_type);
    return `
        <div class="review-workflow-audio-draft-meta" data-role="audio-draft-current-meta">
            <span><strong>建立者</strong>：<span title="${escapeHtml(creatorTitle)}">${escapeHtml(creatorLabel)}</span>${creatorAccount ? `（${escapeHtml(creatorAccount)}）` : ''}</span>
            <span><strong>建立時間</strong>：${escapeHtml(createdAt)}</span>
            <span><strong>來源</strong>：${escapeHtml(sourceType)}</span>
        </div>
    `;
}

function renderReviewWorkflowAudioDraftSnapshot(fields, config, className = '') {
    const normalizedFields = getReviewWorkflowFields({ annotation_fields: fields });
    const snapshotClass = ['review-workflow-audio-draft-snapshot', className].filter(Boolean).join(' ');
    return `
        <div class="${snapshotClass}">
            ${config.fields.map(field => {
                const value = String(normalizedFields[field.key] || '').trim();
                return `
                    <div class="review-workflow-audio-draft-snapshot-field ${value ? 'has-value' : ''}">
                        <span>${escapeHtml(field.label)}</span>
                        <strong>${value ? escapeHtml(value) : '尚未填寫'}</strong>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function getReviewWorkflowDraftChangedFields(value) {
    if (Array.isArray(value)) return value.filter(Boolean).map(item => String(item));
    if (typeof value === 'string' && value.trim()) {
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.filter(Boolean).map(item => String(item));
        } catch (error) {
            return value.split(',').map(item => item.trim()).filter(Boolean);
        }
    }
    return [];
}

function isReviewWorkflowCurrentVersion(entry, row) {
    return entry?.is_current === true
        || String(entry?.is_current || '').toLowerCase() === 'true'
        || (Number(entry?.version_no) === Number(row?.current_version_no)
            && Number(row?.current_version_no || 0) > 0);
}

function isReviewWorkflowOwnVersion(entry) {
    return isCurrentUserIdentifier(entry?.created_by)
        || isCurrentUserIdentifier(entry?.source_actor);
}

function renderReviewWorkflowAudioDraftHistoryRows(row, rows, canApply = false) {
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    if (!rows.length) {
        return '<li class="review-workflow-audio-draft-history-empty">目前尚無可顯示的標注版本。</li>';
    }
    return rows.map(entry => {
        const creatorAccount = entry.created_by || entry.source_actor || '';
        const creatorLabel = getReviewWorkflowDraftCreatorLabel(creatorAccount);
        const creatorTitle = creatorAccount ? '帳號：' + creatorAccount : '';
        const current = isReviewWorkflowCurrentVersion(entry, row);
        const own = isReviewWorkflowOwnVersion(entry);
        const changedFields = getReviewWorkflowDraftChangedFields(entry.changed_fields);
        const sourceAudioId = Number(entry.source_audio_record_id);
        const sourceAudioLabel = Number.isInteger(sourceAudioId) && sourceAudioId > 0
            ? '音檔 #' + sourceAudioId
            : '非音檔來源';
        const versionNumber = Number(entry.version_no);
        const tags = [
            current ? '<span class="review-workflow-audio-draft-history-tag is-current">目前版本</span>' : '',
            own ? '<span class="review-workflow-audio-draft-history-tag is-own">我的版本</span>' : ''
        ].filter(Boolean).join('');
        return `
            <li class="review-workflow-audio-draft-history-entry ${current ? 'is-current' : ''} ${own ? 'is-own' : ''}">
                <div class="review-workflow-audio-draft-history-entry-header">
                    <strong>v${escapeHtml(entry.version_no || '')}｜${escapeHtml(getReviewWorkflowDraftVersionKindLabel(entry.version_kind))}</strong>
                    <div class="review-workflow-audio-draft-history-tags">${tags}</div>
                </div>
                <dl class="review-workflow-audio-draft-history-meta">
                    <div><dt>建立者</dt><dd title="${escapeHtml(creatorTitle)}">${escapeHtml(creatorLabel)}${creatorAccount ? `（${escapeHtml(creatorAccount)}）` : ''}</dd></div>
                    <div><dt>建立時間</dt><dd>${escapeHtml(formatReviewWorkflowAudioAssessmentTime(entry.created_at))}</dd></div>
                    <div><dt>來源</dt><dd>${escapeHtml(getReviewWorkflowDraftSourceTypeLabel(entry.source_type))}｜${escapeHtml(sourceAudioLabel)}</dd></div>
                    <div><dt>本次變更</dt><dd>${changedFields.length ? escapeHtml(changedFields.join('、')) : '未記錄'}</dd></div>
                </dl>
                ${renderReviewWorkflowAudioDraftSnapshot(entry.fields, config, 'is-history')}
                ${canApply && Number.isInteger(versionNumber) && versionNumber > 0 ? `
                    <div class="review-workflow-audio-draft-history-entry-actions">
                        <button type="button" class="review-workflow-history-apply-btn"
                            onclick="applyReviewWorkflowAnnotationVersion(${row.case_id}, ${versionNumber}, this)">載入此版本到校對欄位</button>
                    </div>
                ` : ''}
            </li>
        `;
    }).join('');
}

function renderReviewWorkflowAudioDraftHistoryPanel(row) {
    const caseId = escapeHtml(String(row.case_id));
    return `
        <div class="review-workflow-audio-draft-history-toolbar">
            <button type="button" class="review-workflow-history-btn" data-role="audio-draft-history-toggle"
                onclick="toggleReviewWorkflowAudioDraftHistory(${row.case_id}, this)"
                aria-expanded="false" aria-controls="review-workflow-audio-draft-history-${caseId}">檢視標注版本歷史</button>
            <span>可辨認每一版建立者、時間與來源音檔。</span>
        </div>
        <section class="review-workflow-audio-draft-history hidden" id="review-workflow-audio-draft-history-${caseId}"
            data-role="audio-draft-history" aria-label="標注版本歷史">
            <div class="review-workflow-audio-draft-history-header">
                <strong>標注版本歷史</strong>
                <span>歷史版本僅供查看，不會直接覆蓋目前草稿。</span>
            </div>
            <div class="review-workflow-audio-draft-history-message" data-role="audio-draft-history-message" aria-live="polite">展開後載入版本歷史。</div>
            <ol class="review-workflow-audio-draft-history-list" data-role="audio-draft-history-list"></ol>
        </section>
    `;
}

async function loadReviewWorkflowAudioDraftHistory(caseId, panel, button) {
    const row = getReviewWorkflowRow(caseId);
    const message = panel?.querySelector('[data-role="audio-draft-history-message"]');
    const list = panel?.querySelector('[data-role="audio-draft-history-list"]');
    if (!row || !panel || !message || !list || panel.dataset.historyLoading === 'true') return;
    if (Array.isArray(row.audio_annotation_history)) {
        list.innerHTML = renderReviewWorkflowAudioDraftHistoryRows(row, row.audio_annotation_history);
        message.textContent = `共 ${row.audio_annotation_history.length} 個版本。`;
        message.classList.remove('is-error');
        panel.dataset.historyLoaded = 'true';
        return;
    }
    panel.dataset.historyLoading = 'true';
    if (button) {
        button.disabled = true;
        button.textContent = '載入中...';
    }
    message.textContent = '正在讀取標注版本歷史...';
    message.classList.remove('is-error');
    list.innerHTML = '';
    try {
        const result = await reviewWorkflowRpc('get_audio_annotation_draft_history', {
            p_case_id: Number(caseId),
        });
        const history = Array.isArray(result)
            ? result
            : Array.isArray(result?.data) ? result.data : [];
        row.audio_annotation_history = history;
        list.innerHTML = renderReviewWorkflowAudioDraftHistoryRows(row, history);
        message.textContent = `共 ${history.length} 個版本。`;
        panel.dataset.historyLoaded = 'true';
    } catch (error) {
        message.textContent = '標注版本歷史讀取失敗：' + error.message;
        message.classList.add('is-error');
    } finally {
        delete panel.dataset.historyLoading;
        if (button) {
            button.disabled = false;
            button.textContent = panel.classList.contains('hidden') ? '檢視標注版本歷史' : '收合版本歷史';
        }
    }
}

async function toggleReviewWorkflowAudioDraftHistory(caseId, button) {
    if (!isReviewWorkflowRole()) return;
    const panel = button?.closest('[data-review-audio-draft-panel], .review-workflow-audio-draft-panel');
    const historyPanel = panel?.querySelector('[data-role="audio-draft-history"]');
    if (!historyPanel) return;
    const isOpen = !historyPanel.classList.contains('hidden');
    if (isOpen) {
        historyPanel.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = '檢視標注版本歷史';
        return;
    }
    historyPanel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    button.textContent = '收合版本歷史';
    await loadReviewWorkflowAudioDraftHistory(caseId, historyPanel, button);
}

function renderReviewWorkflowAnnotationHistoryPanel(row, canApply = false) {
    const caseId = escapeHtml(String(row.case_id));
    return `
        <div class="review-workflow-audio-draft-history-toolbar review-workflow-annotation-history-toolbar">
            <button type="button" class="review-workflow-history-btn" data-role="annotation-history-toggle"
                onclick="toggleReviewWorkflowAnnotationHistory(${row.case_id}, this)"
                aria-expanded="false" aria-controls="review-workflow-annotation-history-${caseId}">檢視全部草稿版本</button>
            <span>可比較每一版建立者、時間、來源與內容；歷史版本不會被覆蓋。</span>
        </div>
        <section class="review-workflow-audio-draft-history hidden" id="review-workflow-annotation-history-${caseId}"
            data-role="annotation-version-history" data-can-apply="${canApply ? 'true' : 'false'}" aria-label="全部草稿版本">
            <div class="review-workflow-audio-draft-history-header">
                <strong>全部草稿版本</strong>
                <span>核准時使用目前版本；若要採用舊版，請先載入後保存成新的校對草稿。</span>
            </div>
            <div class="review-workflow-audio-draft-history-message" data-role="annotation-history-message" aria-live="polite">展開後載入版本歷史。</div>
            <ol class="review-workflow-audio-draft-history-list" data-role="annotation-history-list"></ol>
        </section>
    `;
}

function setReviewWorkflowAnnotationHistoryMessage(panel, message, isError = false) {
    const messageElement = panel?.querySelector('[data-role="annotation-history-message"]');
    if (!messageElement) return;
    messageElement.textContent = message || '';
    messageElement.classList.toggle('is-error', Boolean(isError));
}

async function loadReviewWorkflowAnnotationVersionHistory(caseId, panel, button) {
    const row = getReviewWorkflowRow(caseId);
    const message = panel?.querySelector('[data-role="annotation-history-message"]');
    const list = panel?.querySelector('[data-role="annotation-history-list"]');
    if (!row || !panel || !message || !list || panel.dataset.historyLoading === 'true') return;
    if (Array.isArray(row.annotation_version_history)) {
        list.innerHTML = renderReviewWorkflowAudioDraftHistoryRows(
            row,
            row.annotation_version_history,
            panel.dataset.canApply === 'true'
        );
        message.textContent = `共 ${row.annotation_version_history.length} 個版本。`;
        message.classList.remove('is-error');
        panel.dataset.historyLoaded = 'true';
        return;
    }
    panel.dataset.historyLoading = 'true';
    if (button) {
        button.disabled = true;
        button.textContent = '載入中...';
    }
    message.textContent = '正在讀取全部草稿版本...';
    message.classList.remove('is-error');
    list.innerHTML = '';
    try {
        const result = await reviewWorkflowRpc('get_audio_annotation_draft_history', {
            p_case_id: Number(caseId)
        });
        const history = Array.isArray(result)
            ? result
            : Array.isArray(result?.data) ? result.data : [];
        row.annotation_version_history = history;
        list.innerHTML = renderReviewWorkflowAudioDraftHistoryRows(
            row,
            history,
            panel.dataset.canApply === 'true'
        );
        message.textContent = `共 ${history.length} 個版本。`;
        panel.dataset.historyLoaded = 'true';
    } catch (error) {
        message.textContent = '草稿版本歷史讀取失敗：' + error.message;
        message.classList.add('is-error');
    } finally {
        delete panel.dataset.historyLoading;
        if (button) {
            button.disabled = false;
            button.textContent = panel.classList.contains('hidden') ? '檢視全部草稿版本' : '收合全部草稿版本';
        }
    }
}

async function toggleReviewWorkflowAnnotationHistory(caseId, button) {
    if (!isReviewWorkflowRole()) return;
    const workbenchItem = button?.closest('.review-workflow-item');
    const historyPanel = workbenchItem?.querySelector('[data-role="annotation-version-history"]');
    if (!historyPanel) return;
    const isOpen = !historyPanel.classList.contains('hidden');
    if (isOpen) {
        historyPanel.classList.add('hidden');
        button.setAttribute('aria-expanded', 'false');
        button.textContent = '檢視全部草稿版本';
        return;
    }
    historyPanel.classList.remove('hidden');
    button.setAttribute('aria-expanded', 'true');
    button.textContent = '收合全部草稿版本';
    await loadReviewWorkflowAnnotationVersionHistory(caseId, historyPanel, button);
}

function applyReviewWorkflowAnnotationVersion(caseId, versionNo, button) {
    const row = getReviewWorkflowRow(caseId);
    const history = Array.isArray(row?.annotation_version_history)
        ? row.annotation_version_history
        : [];
    const entry = history.find(candidate => Number(candidate.version_no) === Number(versionNo));
    if (!row || !entry) {
        setReviewWorkflowAnnotationHistoryMessage(
            button?.closest('[data-role="annotation-version-history"]'),
            '找不到要載入的草稿版本。',
            true
        );
        return;
    }
    const canEdit = state.userRole === 'admin'
        || (row.claim_by && isCurrentUserIdentifier(row.claim_by));
    if (!canEdit) {
        setReviewWorkflowAnnotationHistoryMessage(
            button?.closest('[data-role="annotation-version-history"]'),
            '請先領取案件，才能把歷史版本載入校對欄位。',
            true
        );
        return;
    }
    setReviewWorkflowDraftFields(caseId, getReviewWorkflowFields({ annotation_fields: entry.fields }));
    setReviewWorkflowAnnotationHistoryMessage(
        button?.closest('[data-role="annotation-version-history"]'),
        `已載入 v${versionNo}；請檢查後按「存校對草稿」，才會建立新的目前版本。`
    );
}

function renderReviewWorkflowAudioAnnotationDraft(row, canAnnotate = false) {
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    const usableEvidence = getReviewWorkflowUsableAudioEvidence(row);
    const currentFields = getReviewWorkflowFields(row);
    const hasCurrentFields = hasReviewWorkflowAudioDraftValues(currentFields);
    const currentSnapshot = renderReviewWorkflowAudioDraftSnapshot(currentFields, config, 'is-current');
    const currentMeta = renderReviewWorkflowAudioDraftCurrentMeta(row);
    const historyPanel = renderReviewWorkflowAudioDraftHistoryPanel(row);
    if (!canAnnotate) {
        const reason = row?.state === '已完成'
            ? '案件已完成，不能再建立音讀標注草稿。'
            : hasActiveReviewWorkflowProofingClaim(row)
                ? '目前已有校對員鎖定此案件，音讀標注暫停編輯。'
                : !canAssessReviewWorkflowAudio(row)
                    ? '請先領取音檔案件，領取後才能建立音讀標注草稿。'
                    : '目前沒有判定為「可用」且無待追問的音檔，暫不能建立音讀標注草稿。';
        return `
            <section class="review-workflow-audio-draft-panel is-readonly">
                <div class="review-workflow-audio-draft-header">
                    <div>
                        <h4>音讀標注草稿</h4>
                        <span>案件層草稿，不為每個音檔建立獨立版本。</span>
                    </div>
                    <span class="review-workflow-audio-draft-version">目前版本：v${escapeHtml(row.current_version_no || 0)}</span>
                </div>
                ${currentMeta}
                <div class="review-workflow-audio-draft-current">
                    <strong>目前草稿內容</strong>
                    ${hasCurrentFields ? currentSnapshot : '<div class="review-workflow-empty">目前尚無標注草稿內容。</div>'}
                </div>
                ${historyPanel}
                <p class="review-workflow-audio-draft-note">${escapeHtml(reason)}</p>
            </section>
        `;
    }
    const selectedAudioId = usableEvidence[0]?.audio_record_id || '';
    const sourceOptions = usableEvidence.map(item => `
        <option value="${escapeHtml(String(item.audio_record_id))}">
            音檔 #${escapeHtml(item.audio_record_id)}｜${escapeHtml(item.recorder_name || '未知錄音人')}｜判定：可用
        </option>
    `).join('');
    const fieldInputs = config.fields.map(field => {
        const value = String(currentFields[field.key] || '');
        const control = field.multiline
            ? `<textarea id="${getReviewWorkflowAudioDraftInputId(row.case_id, languageKey, field.key)}" data-role="audio-draft-field" data-field-key="${escapeHtml(field.key)}" rows="3" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value)}</textarea>`
            : `<input id="${getReviewWorkflowAudioDraftInputId(row.case_id, languageKey, field.key)}" data-role="audio-draft-field" data-field-key="${escapeHtml(field.key)}" type="text" value="${escapeHtml(value)}" placeholder="${escapeHtml(field.placeholder || '')}">`;
        return `
            <label class="review-workflow-audio-draft-field ${field.multiline ? 'is-multiline' : ''}">
                <span>${escapeHtml(field.label)}</span>
                ${control}
            </label>
        `;
    }).join('');

    return `
        <section class="review-workflow-audio-draft-panel" data-review-audio-draft-panel="${escapeHtml(String(row.case_id))}" data-case-id="${escapeHtml(String(row.case_id))}">
            <div class="review-workflow-audio-draft-header">
                <div>
                    <h4>音讀標注草稿</h4>
                    <span>先選定本次採用音檔，再填寫簡單、無疑義的音讀。</span>
                </div>
                <span class="review-workflow-audio-draft-version" data-role="audio-draft-current-version">目前版本：v${escapeHtml(row.current_version_no || 0)}</span>
            </div>
            <div class="review-workflow-audio-draft-source">
                <label for="review-audio-draft-source-${escapeHtml(String(row.case_id))}">本次採用音檔</label>
                <select id="review-audio-draft-source-${escapeHtml(String(row.case_id))}" data-role="audio-draft-source">
                    ${sourceOptions}
                </select>
                <div class="review-workflow-audio-draft-source-meta" data-role="audio-draft-source-meta">${escapeHtml(getReviewWorkflowAudioDraftSourceMeta(row, selectedAudioId))}</div>
            </div>
            <div class="review-workflow-audio-draft-fields">
                ${fieldInputs}
            </div>
            <label class="review-workflow-audio-draft-confirm">
                <input type="checkbox" data-role="audio-draft-confirm">
                <span>我已聽過採用音檔，確認音檔清楚、音讀無疑義。</span>
            </label>
            <p class="review-workflow-audio-draft-note">可只填部分欄位；保存時只送出非空欄位，不會清掉目前草稿的其他內容。完整性由校對員核准前檢查。</p>
            <div class="review-workflow-audio-draft-message" data-role="audio-draft-message" aria-live="polite"></div>
            <div class="review-workflow-audio-draft-actions">
                <button type="button" class="review-workflow-audio-draft-save" data-action="save-audio-draft" disabled>保存標注草稿</button>
            </div>
        </section>
    `;
}

function setReviewWorkflowAudioDraftMessage(panel, message, isError = false, isSuccess = false) {
    const messageElement = panel?.querySelector('[data-role="audio-draft-message"]');
    if (!messageElement) return;
    messageElement.textContent = message || '';
    messageElement.classList.toggle('is-error', Boolean(isError));
    messageElement.classList.toggle('is-success', Boolean(isSuccess));
}

function updateReviewWorkflowAudioDraftSourceMeta(panel) {
    const caseId = panel?.dataset.caseId;
    const row = getReviewWorkflowRow(caseId);
    const sourceId = getReviewWorkflowAudioDraftSourceId(panel);
    const meta = panel?.querySelector('[data-role="audio-draft-source-meta"]');
    if (meta && row) meta.textContent = getReviewWorkflowAudioDraftSourceMeta(row, sourceId);
}

function getReviewWorkflowAudioDraftValidation(panel) {
    const caseId = panel?.dataset.caseId;
    const row = getReviewWorkflowRow(caseId);
    if (!row || !canAnnotateReviewWorkflowAudio(row)) return '目前不能編輯音讀標注草稿。';
    if (!getReviewWorkflowAudioDraftSourceId(panel)) return '請先選擇本次採用音檔。';
    if (!hasReviewWorkflowAudioDraftValues(collectReviewWorkflowAudioDraftFields(caseId))) {
        return '請至少填寫一個音讀欄位。';
    }
    if (!panel.querySelector('[data-role="audio-draft-confirm"]')?.checked) {
        return '請先確認音檔清楚、音讀無疑義。';
    }
    return '';
}

function refreshReviewWorkflowAudioAnnotationDraft(panel) {
    if (!panel || panel.dataset.submitting === 'true') return;
    updateReviewWorkflowAudioDraftSourceMeta(panel);
    const validationMessage = getReviewWorkflowAudioDraftValidation(panel);
    const saveButton = panel.querySelector('[data-action="save-audio-draft"]');
    if (saveButton) saveButton.disabled = Boolean(validationMessage);
    if (panel.dataset.messageLock !== 'true') {
        setReviewWorkflowAudioDraftMessage(
            panel,
            validationMessage || '確認內容後按「保存標注草稿」。',
            Boolean(validationMessage)
        );
    }
}

function bindReviewWorkflowAudioAnnotationDraftPanel(panel, caseId) {
    if (!panel || panel.dataset.bound === 'true') return;
    panel.dataset.bound = 'true';
    panel.querySelectorAll('input, select, textarea').forEach(field => {
        const refresh = () => {
            delete panel.dataset.messageLock;
            refreshReviewWorkflowAudioAnnotationDraft(panel);
        };
        field.addEventListener('input', refresh);
        field.addEventListener('change', refresh);
    });
    panel.querySelector('[data-action="save-audio-draft"]')?.addEventListener('click', event => {
        saveReviewWorkflowAudioAnnotationDraft(caseId, event.currentTarget);
    });
    refreshReviewWorkflowAudioAnnotationDraft(panel);
}

async function fillReviewWorkflowAudioDraftFromSource(caseId, audioRecordId, button) {
    const row = getReviewWorkflowRow(caseId);
    if (!row || !canAnnotateReviewWorkflowAudio(row)) return;
    const panel = document.querySelector('[data-review-audio-draft-panel="' + caseId + '"]');
    if (!panel) return;
    const item = getReviewWorkflowAudioEvidenceItem(row, audioRecordId);
    if (!item || !isReviewWorkflowAudioEvidenceUsable(item)) {
        setReviewWorkflowAudioDraftMessage(panel, '只能從可用且無待追問的音檔帶入。', true);
        return;
    }
    let source = getReviewWorkflowAudioSource(row, audioRecordId);
    if (!source && !row.audio_sources_loaded) {
        await loadReviewWorkflowAudioSourcesForRow(row, button?.closest('.review-workflow-item'), false, true);
        source = getReviewWorkflowAudioSource(row, audioRecordId);
    }
    if (!source) {
        setReviewWorkflowAudioDraftMessage(panel, '讀不到這筆音檔的錄音人標注。', true);
        return;
    }
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    config.fields.forEach(field => {
        const value = getReviewWorkflowSourceFieldValue(source, field);
        const input = document.getElementById(getReviewWorkflowAudioDraftInputId(caseId, languageKey, field.key));
        if (input && value) input.value = value;
    });
    const sourceSelect = panel.querySelector('[data-role="audio-draft-source"]');
    if (sourceSelect) sourceSelect.value = String(audioRecordId);
    delete panel.dataset.messageLock;
    refreshReviewWorkflowAudioAnnotationDraft(panel);
    setReviewWorkflowAudioDraftMessage(panel, '已帶入這筆音檔的非空欄位，其他草稿內容未清除。', false, true);
    panel.dataset.messageLock = 'true';
}

async function fillReviewWorkflowAudioDraftFieldFromSource(caseId, audioRecordId, fieldKey, button) {
    const row = getReviewWorkflowRow(caseId);
    if (!row || !canAnnotateReviewWorkflowAudio(row)) return;
    const panel = document.querySelector('[data-review-audio-draft-panel="' + caseId + '"]');
    if (!panel) return;
    const item = getReviewWorkflowAudioEvidenceItem(row, audioRecordId);
    if (!item || !isReviewWorkflowAudioEvidenceUsable(item)) return;
    let source = getReviewWorkflowAudioSource(row, audioRecordId);
    if (!source && !row.audio_sources_loaded) {
        await loadReviewWorkflowAudioSourcesForRow(row, button?.closest('.review-workflow-item'), false, true);
        source = getReviewWorkflowAudioSource(row, audioRecordId);
    }
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    const field = config.fields.find(candidate => candidate.key === fieldKey);
    const value = field && source ? getReviewWorkflowSourceFieldValue(source, field) : '';
    const input = field
        ? document.getElementById(getReviewWorkflowAudioDraftInputId(caseId, languageKey, field.key))
        : null;
    if (!value || !input) return;
    input.value = value;
    const sourceSelect = panel.querySelector('[data-role="audio-draft-source"]');
    if (sourceSelect) sourceSelect.value = String(audioRecordId);
    delete panel.dataset.messageLock;
    refreshReviewWorkflowAudioAnnotationDraft(panel);
    setReviewWorkflowAudioDraftMessage(panel, '已帶入『' + field.label + '』；其他欄位未變更。', false, true);
    panel.dataset.messageLock = 'true';
}

async function saveReviewWorkflowAudioAnnotationDraft(caseId, button) {
    const row = getReviewWorkflowRow(caseId);
    const panel = button?.closest('[data-review-audio-draft-panel]')
        || document.querySelector('[data-review-audio-draft-panel="' + caseId + '"]');
    if (!row || !panel || !canAnnotateReviewWorkflowAudio(row)) return;
    const fields = collectReviewWorkflowAudioDraftFields(caseId);
    const confirmed = Boolean(panel.querySelector('[data-role="audio-draft-confirm"]')?.checked);
    const validationMessage = getReviewWorkflowAudioDraftValidation(panel);
    if (validationMessage) {
        setReviewWorkflowAudioDraftMessage(panel, validationMessage, true);
        return;
    }
    const controls = Array.from(panel.querySelectorAll('input, select, textarea, button'));
    const saveButton = panel.querySelector('[data-action="save-audio-draft"]');
    panel.dataset.submitting = 'true';
    controls.forEach(control => { control.disabled = true; });
    if (saveButton) saveButton.innerText = '保存中...';
    setReviewWorkflowAudioDraftMessage(panel, '正在保存音讀標注草稿...');
    try {
        const result = await reviewWorkflowRpc('save_audio_annotation_draft', {
            p_case_id: Number(caseId),
            p_fields: fields,
            p_source_audio_record_id: getReviewWorkflowAudioDraftSourceId(panel),
            p_audio_claim_token: row.audio_claim_token || null,
            p_confirmed_unambiguous: confirmed,
            p_base_version_no: Number(row.current_version_no || 0),
            p_client_request_id: createReviewWorkflowClientRequestId()
        });
        const saved = Array.isArray(result) ? result[0] : result;
        const savedFields = saved?.fields || saved?.annotation_fields || fields;
        row.annotation_fields = savedFields;
        row.current_version_no = saved?.version_no ?? (Number(row.current_version_no || 0) + 1);
        row.version_kind = saved?.version_kind || 'draft';
        row.annotation_source_type = saved?.source_type || 'audio_assessor';
        row.annotation_source_actor = saved?.source_actor || state.userId;
        row.annotation_created_by = saved?.source_actor || saved?.created_by || state.userId;
        row.annotation_created_at = saved?.created_at || row.annotation_created_at || '';
        row.annotation_source_stamp = saved?.source_stamp || row.annotation_source_stamp || '';
        const languageKey = getReviewLanguageKey(row.language);
        const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
        config.fields.forEach(field => {
            const input = document.getElementById(getReviewWorkflowAudioDraftInputId(caseId, languageKey, field.key));
            if (input) input.value = String(savedFields[field.key] || '');
        });
        const versionElement = panel.querySelector('[data-role="audio-draft-current-version"]');
        if (versionElement) versionElement.textContent = '目前版本：v' + row.current_version_no;
        const metaElement = panel.querySelector('[data-role="audio-draft-current-meta"]');
        if (metaElement) metaElement.outerHTML = renderReviewWorkflowAudioDraftCurrentMeta(row);
        delete row.audio_annotation_history;
        const historyPanel = panel.querySelector('[data-role="audio-draft-history"]');
        if (historyPanel) {
            delete historyPanel.dataset.historyLoaded;
            const historyMessage = historyPanel.querySelector('[data-role="audio-draft-history-message"]');
            const historyList = historyPanel.querySelector('[data-role="audio-draft-history-list"]');
            if (historyMessage) historyMessage.textContent = '草稿已更新，正在重新整理版本歷史...';
            if (historyMessage) historyMessage.classList.remove('is-error');
            if (historyList) historyList.innerHTML = '';
            if (!historyPanel.classList.contains('hidden')) {
                await loadReviewWorkflowAudioDraftHistory(
                    caseId,
                    historyPanel,
                    panel.querySelector('[data-role="audio-draft-history-toggle"]')
                );
            }
        }
        setReviewWorkflowAudioDraftMessage(panel, '已保存為校對草稿，尚未回寫正式資料。', false, true);
        panel.dataset.messageLock = 'true';
    } catch (error) {
        delete panel.dataset.messageLock;
        setReviewWorkflowAudioDraftMessage(panel, '音讀標注草稿保存失敗：' + error.message, true);
    } finally {
        delete panel.dataset.submitting;
        if (panel.isConnected) {
            controls.forEach(control => { control.disabled = false; });
            if (saveButton) saveButton.innerText = '保存標注草稿';
            if (!panel.dataset.messageLock) refreshReviewWorkflowAudioAnnotationDraft(panel);
        }
    }
}

function renderReviewWorkflowAudioEvidence(row, canEdit = false, canAnnotate = false) {
    return renderReviewWorkflowAudioSourceTable(row, canEdit, canAnnotate);
}

function renderReviewWorkflowAudioAssessmentPanel(row, item) {
    const currentDecision = item.assessment_decision || '';
    const respondentKey = item.respondent_key || '';
    const assessmentKey = String(row.case_id) + '-' + String(item.audio_record_id);
    const isReassessment = Boolean(currentDecision && currentDecision !== '\u672a\u5be9\u807d');
    return `
        <section class="review-workflow-assessment-panel hidden"
            id="review-workflow-assessment-${escapeHtml(assessmentKey)}"
            data-review-assessment-panel="${escapeHtml(assessmentKey)}"
            data-task-id="${escapeHtml(row.task_id)}"
            data-language="${escapeHtml(row.language)}"
            data-audio-record-id="${escapeHtml(item.audio_record_id)}"
            data-initial-decision="${escapeHtml(currentDecision)}"
            data-initial-respondent="${escapeHtml(respondentKey)}">
            <div class="review-workflow-assessment-header">
                <div>
                    <strong>音檔判定</strong>
                    <span>請先播放音檔，再選擇判定結果。</span>
                </div>
                <span class="review-workflow-assessment-current">目前：${escapeHtml(currentDecision || '未審聽')}</span>
            </div>
            <div class="review-workflow-assessment-append-note ${isReassessment ? 'is-reassessment' : ''}">
                <strong>${isReassessment ? '重新判定' : '新增審查事件'}</strong>
                <span>${isReassessment ? '這次儲存後會新增一筆審查事件，舊紀錄不會被覆蓋。' : '儲存後會新增一筆審查事件。'}</span>
            </div>
            <fieldset class="review-workflow-assessment-fieldset">
                <legend>判定結果</legend>
                <div class="review-workflow-assessment-options" role="radiogroup" aria-label="音檔判定結果">
                    <button type="button" class="review-workflow-decision-btn ${currentDecision === '可用' ? 'is-selected' : ''}" data-decision="可用" aria-pressed="${currentDecision === '可用'}">可用</button>
                    <button type="button" class="review-workflow-decision-btn is-danger ${currentDecision === '不可用' ? 'is-selected' : ''}" data-decision="不可用" aria-pressed="${currentDecision === '不可用'}">不可用</button>
                    <button type="button" class="review-workflow-decision-btn is-followup ${currentDecision === '待追問' ? 'is-selected' : ''}" data-decision="待追問" aria-pressed="${currentDecision === '待追問'}">待追問</button>
                </div>
            </fieldset>
            <div class="review-workflow-assessment-grid">
                <label class="review-workflow-assessment-field">
                    <span>受訪者代號（可留空）</span>
                    <input type="text" data-role="respondent-key" value="${escapeHtml(respondentKey)}" placeholder="若有需要，再填寫代號">
                </label>
                <label class="review-workflow-assessment-field review-workflow-assessment-field-wide">
                    <span>判定補充說明（可留空）</span>
                    <textarea data-role="reason" rows="2" placeholder="記錄音質、內容或其他判斷依據"></textarea>
                </label>
                <label class="review-workflow-assessment-field hidden" data-field="unusable-reason">
                    <span>不可用原因 <em>必填</em></span>
                    <select data-role="unusable-reason-code">
                        <option value="">請選擇原因</option>
                        <option value="無聲">無聲</option>
                        <option value="聽不清楚">聽不清楚</option>
                        <option value="其他">其他</option>
                    </select>
                </label>
                <label class="review-workflow-assessment-field hidden review-workflow-assessment-field-wide" data-field="unusable-other">
                    <span>其他不可用原因 <em>必填</em></span>
                    <textarea data-role="unusable-reason-text" rows="2" placeholder="請說明音檔為何不可用"></textarea>
                </label>
                <label class="review-workflow-assessment-field review-workflow-followup-toggle">
                    <span>需要後續處理</span>
                    <span class="review-workflow-checkbox-label">
                        <input type="checkbox" data-role="needs-followup">
                        <span>需要</span>
                    </span>
                </label>
                <label class="review-workflow-assessment-field hidden review-workflow-assessment-field-wide" data-field="followup-reason">
                    <span>後續處理原因 <em>必填</em></span>
                    <textarea data-role="followup-reason" rows="2" placeholder="請說明要追問或後續處理的內容"></textarea>
                </label>
            </div>
            <div class="review-workflow-assessment-message" data-role="assessment-message" aria-live="polite"></div>
            <div class="review-workflow-assessment-actions">
                <button type="button" class="review-workflow-assessment-cancel" data-action="cancel">取消</button>
                <button type="button" class="review-workflow-assessment-save" data-action="save" disabled>儲存判定</button>
            </div>
        </section>
    `;
}

function renderReviewWorkflowAudioAssessmentHistoryPanel(row, item) {
    const historyKey = String(row.case_id) + '-' + String(item.audio_record_id);
    return `
        <section class="review-workflow-assessment-history hidden"
            id="review-workflow-assessment-history-${escapeHtml(historyKey)}"
            data-review-assessment-history-panel="${escapeHtml(historyKey)}"
            aria-labelledby="review-workflow-assessment-history-title-${escapeHtml(historyKey)}">
            <div class="review-workflow-assessment-history-header">
                <div>
                    <strong id="review-workflow-assessment-history-title-${escapeHtml(historyKey)}">判定紀錄</strong>
                    <span>每次儲存都會新增一筆事件，舊紀錄會保留。</span>
                </div>
            </div>
            <div class="review-workflow-assessment-history-message" data-role="assessment-history-message" aria-live="polite">尚未載入判定紀錄。</div>
            <ol class="review-workflow-assessment-history-list" data-role="assessment-history-list"></ol>
            <div class="review-workflow-assessment-history-actions">
                <button type="button" class="review-workflow-history-btn" data-history-toggle onclick="toggleReviewWorkflowAudioAssessmentHistory(${row.case_id}, ${item.audio_record_id}, this)" aria-expanded="true" aria-controls="review-workflow-assessment-history-${escapeHtml(historyKey)}">收合判定紀錄</button>
            </div>
        </section>
    `;
}

function renderReviewWorkflowAudioAssessmentHistoryRows(rows) {
    return rows.map((entry, index) => {
        const assessorAccount = entry.assessor_account || '';
        const assessorLabel = getReviewWorkflowAudioAssessorLabel(assessorAccount);
        const assessorTitle = getReviewWorkflowAudioAssessorTitle(assessorAccount);
        const decision = entry.decision || '未審聽';
        const reason = entry.reason || '';
        const unusableReason = [entry.unusable_reason_code, entry.unusable_reason_text]
            .filter(Boolean).join('：');
        const followupReason = entry.followup_reason_text || '';
        return `
            <li class="review-workflow-assessment-history-entry ${index === 0 ? 'is-latest' : ''}">
                <div class="review-workflow-assessment-history-entry-header">
                    <strong>第 ${rows.length - index} 筆判定事件</strong>
                    ${index === 0 ? '<span class="review-workflow-assessment-history-latest">目前摘要</span>' : ''}
                </div>
                <dl class="review-workflow-assessment-history-fields">
                    <div><dt>判定</dt><dd>${escapeHtml(decision)}</dd></div>
                    <div><dt>判定人</dt><dd title="${escapeHtml(assessorTitle)}">${escapeHtml(assessorLabel)}</dd></div>
                    <div><dt>判定時間</dt><dd>${escapeHtml(formatReviewWorkflowAudioAssessmentTime(entry.created_at))}</dd></div>
                    <div><dt>受訪者代號</dt><dd>${escapeHtml(entry.respondent_key || '未指定')}</dd></div>
                    ${reason ? `<div><dt>補充說明</dt><dd>${escapeHtml(reason)}</dd></div>` : ''}
                    ${unusableReason ? `<div><dt>不可用原因</dt><dd>${escapeHtml(unusableReason)}</dd></div>` : ''}
                    ${entry.needs_followup ? `<div><dt>後續處理</dt><dd>${escapeHtml(followupReason || '需要後續處理')}</dd></div>` : ''}
                </dl>
            </li>
        `;
    }).join('');
}

async function toggleReviewWorkflowAudioAssessmentHistory(caseId, audioRecordId, button) {
    if (!isReviewWorkflowRole()) return;
    const card = button?.closest('.review-workflow-source-card');
    const panel = card?.querySelector('[data-review-assessment-history-panel]');
    if (!panel) return;
    const isOpen = !panel.classList.contains('hidden');
    const toggles = card.querySelectorAll('[data-history-toggle]');
    if (isOpen) {
        panel.classList.add('hidden');
        toggles.forEach(toggle => {
            toggle.setAttribute('aria-expanded', 'false');
            toggle.textContent = '檢視判定紀錄';
        });
        return;
    }

    panel.classList.remove('hidden');
    toggles.forEach(toggle => {
        toggle.setAttribute('aria-expanded', 'true');
        toggle.textContent = '收合判定紀錄';
    });
    const message = panel.querySelector('[data-role="assessment-history-message"]');
    const list = panel.querySelector('[data-role="assessment-history-list"]');
    if (message) {
        message.textContent = '正在讀取判定紀錄...';
        message.classList.remove('is-error');
    }
    if (list) list.innerHTML = '';
    if (button) button.disabled = true;
    try {
        const rows = await reviewWorkflowRpc('get_audio_assessment_history', {
            p_case_id: Number(caseId),
            p_audio_record_id: Number(audioRecordId),
            p_actor_account: state.userId
        });
        const historyRows = Array.isArray(rows) ? rows : [];
        if (message) {
            message.textContent = historyRows.length > 0
                ? '共 ' + historyRows.length + ' 筆審查事件；最新一筆就是目前摘要。'
                : '目前沒有判定紀錄。';
        }
        if (list) list.innerHTML = renderReviewWorkflowAudioAssessmentHistoryRows(historyRows);
    } catch (error) {
        if (message) {
            message.textContent = '判定紀錄讀取失敗：' + error.message;
            message.classList.add('is-error');
        }
    } finally {
        if (button) button.disabled = false;
    }
}
function setReviewWorkflowAudioAssessmentMessage(panel, message, isError = false, isSuccess = false) {
    const messageElement = panel?.querySelector('[data-role="assessment-message"]');
    if (!messageElement) return;
    messageElement.textContent = message || '';
    messageElement.classList.toggle('is-error', Boolean(isError));
    messageElement.classList.toggle('is-success', Boolean(isSuccess));
}

function getReviewWorkflowAudioAssessmentValues(panel) {
    const decision = panel?.dataset.decision || '';
    const unusableReasonCode = panel?.querySelector('[data-role="unusable-reason-code"]')?.value || '';
    const unusableReasonText = panel?.querySelector('[data-role="unusable-reason-text"]')?.value.trim() || '';
    const needsFollowup = decision === '待追問'
        || Boolean(panel?.querySelector('[data-role="needs-followup"]')?.checked);
    return {
        respondentKey: panel?.querySelector('[data-role="respondent-key"]')?.value.trim() || '',
        decision,
        reason: panel?.querySelector('[data-role="reason"]')?.value || '',
        unusableReasonCode,
        unusableReasonText,
        needsFollowup,
        followupReasonText: panel?.querySelector('[data-role="followup-reason"]')?.value.trim() || ''
    };
}

function getReviewWorkflowAudioAssessmentValidation(values) {
    if (!['可用', '不可用', '待追問'].includes(values.decision)) {
        return '請先選擇判定結果。';
    }
    if (values.decision === '不可用' && !['無聲', '聽不清楚', '其他'].includes(values.unusableReasonCode)) {
        return '請選擇不可用原因。';
    }
    if (values.decision === '不可用' && values.unusableReasonCode === '其他' && !values.unusableReasonText) {
        return '請補充其他不可用原因。';
    }
    if (values.needsFollowup && !values.followupReasonText) {
        return '需要後續處理時，請填寫原因。';
    }
    return '';
}

function refreshReviewWorkflowAudioAssessmentPanel(panel) {
    if (!panel) return;
    const values = getReviewWorkflowAudioAssessmentValues(panel);
    const isUnusable = values.decision === '不可用';
    const isFollowupRequired = values.decision === '待追問' || values.needsFollowup;
    panel.querySelector('[data-field="unusable-reason"]')?.classList.toggle('hidden', !isUnusable);
    panel.querySelector('[data-field="unusable-other"]')?.classList.toggle(
        'hidden',
        !isUnusable || values.unusableReasonCode !== '其他'
    );
    panel.querySelector('[data-field="followup-reason"]')?.classList.toggle('hidden', !isFollowupRequired);
    const followupCheckbox = panel.querySelector('[data-role="needs-followup"]');
    if (followupCheckbox) {
        followupCheckbox.disabled = values.decision === '待追問';
        if (values.decision === '待追問') followupCheckbox.checked = true;
    }
    const validationMessage = getReviewWorkflowAudioAssessmentValidation(values);
    const saveButton = panel.querySelector('[data-action="save"]');
    if (saveButton) saveButton.disabled = Boolean(validationMessage);
    if (!panel.dataset.submitting) {
        setReviewWorkflowAudioAssessmentMessage(
            panel,
            validationMessage || '內容確認無誤後，按「儲存判定」。',
            Boolean(validationMessage)
        );
    }
}

function resetReviewWorkflowAudioAssessmentPanel(panel) {
    if (!panel) return;
    panel.dataset.decision = panel.dataset.initialDecision || '';
    const respondentInput = panel.querySelector('[data-role="respondent-key"]');
    if (respondentInput) respondentInput.value = panel.dataset.initialRespondent || '';
    const reasonInput = panel.querySelector('[data-role="reason"]');
    if (reasonInput) reasonInput.value = '';
    const unusableReasonCode = panel.querySelector('[data-role="unusable-reason-code"]');
    if (unusableReasonCode) unusableReasonCode.value = '';
    const unusableReasonText = panel.querySelector('[data-role="unusable-reason-text"]');
    if (unusableReasonText) unusableReasonText.value = '';
    const followupCheckbox = panel.querySelector('[data-role="needs-followup"]');
    if (followupCheckbox) followupCheckbox.checked = panel.dataset.initialDecision === '待追問';
    const followupReason = panel.querySelector('[data-role="followup-reason"]');
    if (followupReason) followupReason.value = '';
    panel.querySelectorAll('[data-decision]').forEach(decisionButton => {
        const selected = decisionButton.dataset.decision === panel.dataset.decision;
        decisionButton.classList.toggle('is-selected', selected);
        decisionButton.setAttribute('aria-pressed', String(selected));
    });
    refreshReviewWorkflowAudioAssessmentPanel(panel);
}

function closeReviewWorkflowAudioAssessment(panel) {
    resetReviewWorkflowAudioAssessmentPanel(panel);
    panel?.classList.add('hidden');
    const trigger = panel?.closest('.review-workflow-source-card')?.querySelector('.review-workflow-assess-btn');
    trigger?.setAttribute('aria-expanded', 'false');
}

function bindReviewWorkflowAudioAssessmentPanel(panel, taskId, language, audioRecordId, trigger) {
    if (!panel || panel.dataset.bound === 'true') return;
    panel.dataset.bound = 'true';
    panel.querySelectorAll('[data-decision]').forEach(decisionButton => {
        decisionButton.addEventListener('click', () => {
            panel.dataset.decision = decisionButton.dataset.decision || '';
            panel.querySelectorAll('[data-decision]').forEach(candidate => {
                const selected = candidate === decisionButton;
                candidate.classList.toggle('is-selected', selected);
                candidate.setAttribute('aria-pressed', String(selected));
            });
            refreshReviewWorkflowAudioAssessmentPanel(panel);
        });
    });
    panel.querySelectorAll('input, select, textarea').forEach(field => {
        field.addEventListener('input', () => refreshReviewWorkflowAudioAssessmentPanel(panel));
        field.addEventListener('change', () => refreshReviewWorkflowAudioAssessmentPanel(panel));
    });
    panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
        closeReviewWorkflowAudioAssessment(panel);
    });
    panel.querySelector('[data-action="save"]')?.addEventListener('click', () => {
        saveReviewWorkflowAudioAssessment(taskId, language, audioRecordId, panel, trigger);
    });
}

function openReviewWorkflowAudioAssessment(taskId, language, audioRecordId, button) {
    if (!isAudioReviewRole() || getReviewWorkbenchMode() !== 'audio') return;
    const row = state.reviewWorkflowQueue.find(candidate =>
        Number(candidate.task_id) === Number(taskId) && candidate.language === language
    );
    if (!row) return;
    const panel = button?.closest('.review-workflow-source-card')?.querySelector('[data-review-assessment-panel]')
        || document.querySelector('[data-review-assessment-panel="' + row.case_id + '-' + audioRecordId + '"]');
    if (!panel) return;
    if (isAudioAssessorRole() && !canAssessReviewWorkflowAudio(row)) {
        setReviewWorkflowAudioAssessmentMessage(panel, '請先領取這筆音檔案件，再提交判定。', true);
        panel.classList.remove('hidden');
        return;
    }
    if (!panel.dataset.bound) bindReviewWorkflowAudioAssessmentPanel(panel, taskId, language, audioRecordId, button);
    if (!panel.classList.contains('hidden')) {
        closeReviewWorkflowAudioAssessment(panel);
        return;
    }
    panel.dataset.decision = panel.dataset.initialDecision || '';
    panel.classList.remove('hidden');
    refreshReviewWorkflowAudioAssessmentPanel(panel);
    button?.setAttribute('aria-expanded', 'true');
    panel.querySelector('[data-role="respondent-key"]')?.focus();
}

async function loadReviewWorkflowAudioSourcesForRow(row, item, canEdit, canAnnotate = false) {
    if (row.audio_sources_loaded) return getReviewWorkflowAudioSources(row);
    if (row.audio_sources_loading) return getReviewWorkflowAudioSources(row);
    row.audio_sources_loading = true;
    try {
        const sources = await reviewWorkflowRpc('get_review_workflow_audio_sources', {
            p_case_id: Number(row.case_id)
        });
        row.audio_sources = Array.isArray(sources) ? sources : [];
    } catch (error) {
        row.audio_sources = [];
        row.audio_sources_error = error.message;
    } finally {
        row.audio_sources_loaded = true;
        row.audio_sources_loading = false;
        const table = item?.querySelector('[data-review-source-table="' + row.case_id + '"]');
        if (table) table.outerHTML = renderReviewWorkflowAudioSourceTable(row, canEdit, canAnnotate);
    }
    return getReviewWorkflowAudioSources(row);
}

async function fillReviewWorkflowDraftFieldFromAudio(caseId, audioRecordId, fieldKey, button) {
    const row = getReviewWorkflowRow(caseId);
    if (!row) return;
    const item = button?.closest('.review-workflow-item');
    let source = getReviewWorkflowAudioSource(row, audioRecordId);
    if (!source && !row.audio_sources_loaded) {
        await loadReviewWorkflowAudioSourcesForRow(row, item, true);
        source = getReviewWorkflowAudioSource(row, audioRecordId);
    }
    if (!source) return;
    const languageKey = getReviewLanguageKey(row.language);
    const config = REVIEW_FIELD_CONFIG[languageKey] || REVIEW_FIELD_CONFIG.tai;
    const field = config.fields.find(candidate => candidate.key === fieldKey);
    if (!field) return;
    const value = getReviewWorkflowSourceFieldValue(source, field);
    if (!value) return;
    const input = document.getElementById(getReviewWorkflowInputId(caseId, languageKey, field.key));
    if (!input) return;
    input.value = value;
    input.focus();
    button?.classList.add('is-selected');
}

async function saveReviewWorkflowAudioAssessment(taskId, language, audioRecordId, panel) {
    if (!isAudioReviewRole() || getReviewWorkbenchMode() !== 'audio') return;
    const row = state.reviewWorkflowQueue.find(candidate =>
        Number(candidate.task_id) === Number(taskId) && candidate.language === language
    );
    if (!row || (isAudioAssessorRole() && !canAssessReviewWorkflowAudio(row))) {
        setReviewWorkflowAudioAssessmentMessage(panel, '請先領取這筆音檔案件，再提交判定。', true);
        return;
    }
    const values = getReviewWorkflowAudioAssessmentValues(panel);
    const validationMessage = getReviewWorkflowAudioAssessmentValidation(values);
    if (validationMessage) {
        setReviewWorkflowAudioAssessmentMessage(panel, validationMessage, true);
        return;
    }
    const controls = panel.querySelectorAll('button, input, select, textarea');
    const saveButton = panel.querySelector('[data-action="save"]');
    controls.forEach(control => { control.disabled = true; });
    if (saveButton) saveButton.innerText = '儲存中...';
    panel.dataset.submitting = 'true';
    setReviewWorkflowAudioAssessmentMessage(panel, '正在保存判定...', false);
    let preserveMessage = false;
    try {
        await reviewWorkflowRpc('submit_audio_assessment', {
            p_task_id: Number(taskId), p_language: language, p_audio_record_id: Number(audioRecordId),
            p_assessor_account: state.userId, p_respondent_key: values.respondentKey,
            p_decision: values.decision,
            p_metadata: {
                reason: values.reason,
                unusable_reason_code: values.unusableReasonCode,
                unusable_reason_text: values.unusableReasonText,
                needs_followup: values.needsFollowup,
                followup_reason_text: values.followupReasonText
            },
            p_claim_token: row.audio_claim_token || null
        });
        preserveMessage = true;
        setReviewWorkflowAudioAssessmentMessage(panel, '判定已新增一筆審查事件，舊紀錄保留；正在更新工作清單。', false, true);
        try {
            await loadReviewWorkflowQueue({ silent: true });
        } catch (reloadError) {
            setReviewWorkflowAudioAssessmentMessage(
                panel,
                '判定已保存，但工作清單更新失敗：' + reloadError.message,
                true
            );
        }
    } catch (error) {
        preserveMessage = true;
        setReviewWorkflowAudioAssessmentMessage(panel, '音檔判定保存失敗：' + error.message, true);
    } finally {
        delete panel.dataset.submitting;
        if (panel.isConnected) {
            controls.forEach(control => { control.disabled = false; });
            if (saveButton) saveButton.innerText = '儲存判定';
            if (!preserveMessage) refreshReviewWorkflowAudioAssessmentPanel(panel);
        }
    }
}

function submitReviewWorkflowAudioAssessment(taskId, language, audioRecordId, button) {
    openReviewWorkflowAudioAssessment(taskId, language, audioRecordId, button);
}

function renderReviewWorkflowQueue() {
    const container = document.getElementById('place-list-container');
    if (!container) return;
    const workbenchMode = getReviewWorkbenchMode();
    container.innerHTML = renderReviewWorkbenchSwitcher();
    if (!isReviewWorkflowRole()) {
        container.innerHTML = '<div class="empty-state">目前帳號沒有校對權限。</div>';
        return;
    }
    if (!state.reviewWorkflowAvailable) {
        container.innerHTML = '<div class="empty-state">新審查 workflow 尚未部署；既有資料仍保留在原流程。</div>';
        return;
    }
    const queueRows = getReviewWorkflowVisibleRows();
    const isAudioMode = workbenchMode === 'audio';
    const audioRows = isAudioMode
        ? queueRows.filter(row => getReviewWorkflowAudioProgress(row).total > 0)
        : [];
    const visibleRows = isAudioMode
        ? getReviewWorkflowAudioVisibleRows(audioRows)
        : queueRows;
    if (state.userRole === 'admin' && !isAudioMode) {
        container.insertAdjacentHTML('beforeend', renderReviewWorkflowAdminFilter(visibleRows));
    }
    if (isAudioMode) {
        container.insertAdjacentHTML('beforeend', renderReviewWorkflowAudioFilter(audioRows, visibleRows));
    }
    if (!state.reviewWorkflowQueue.length) {
        container.insertAdjacentHTML('beforeend', '<div class="empty-state">目前沒有分派給此帳號的審查案件。</div>');
        return;
    }

    if (!visibleRows.length) {
        container.insertAdjacentHTML(
            'beforeend',
            isAudioMode
                ? '<div class="empty-state">目前沒有符合音檔篩選條件的案件。</div>'
                : '<div class="empty-state">\u76ee\u524d\u6c92\u6709\u7b26\u5408\u8349\u7a3f\u72c0\u614b\u7684\u5be9\u67e5\u6848\u4ef6\u3002</div>'
        );
        return;
    }
    visibleRows.forEach(row => {
        const isWritten = isReviewWorkflowWrittenRow(row);
        const canEdit = !isAudioMode && (state.userRole === 'admin' || (row.claim_by && row.claim_by === state.userId));
        const isClaimOwner = row.claim_by && row.claim_by === state.userId;
        const isAdmin = state.userRole === 'admin';
        const isAudioCase = isAudioReviewRole() && isAudioMode && !isWritten;
        const canAnnotate = isAudioCase && canAnnotateReviewWorkflowAudio(row);
        const audioClaimActive = row.audio_claim_by
            && row.audio_claim_until
            && new Date(row.audio_claim_until).getTime() > Date.now();
        const audioClaimAction = isAdmin
            ? '<span class="review-workflow-claim-note">管理員可直接判定</span>'
            : canAssessReviewWorkflowAudio(row)
                ? '<button class="review-workflow-release-btn" type="button" onclick="releaseReviewWorkflowCase(' + row.case_id + ', this)">釋放音檔案件</button>'
                : audioClaimActive
                    ? '<span class="review-workflow-claim-note">其他審聽者檢驗中</span>'
                    : '<button class="review-workflow-claim-btn" type="button" onclick="claimReviewWorkflowCase(' + row.case_id + ', this)">領取音檔 30 分鐘</button>';
        const claimAction = isAudioCase
            ? audioClaimAction
            : isClaimOwner
                ? '<button class="review-workflow-release-btn" type="button" onclick="releaseReviewWorkflowCase(' + row.case_id + ', this)">釋放</button>'
                : '<button class="review-workflow-claim-btn" type="button" onclick="claimReviewWorkflowCase(' + row.case_id + ', this)">領取 30 分鐘</button>';
        const hasDraft = hasReviewWorkflowDraft(row);
        const approveDisabled = row.version_kind === 'legacy' || !hasDraft || (!isAdmin && !isClaimOwner);
        const approveReason = row.version_kind === 'legacy'
            ? '\u76ee\u524d\u662f\u820a\u7248\u8cc7\u6599\uff0c\u4e0d\u80fd\u76f4\u63a5\u5be9\u6838'
            : !hasDraft
                ? '\u8acb\u5148\u5efa\u7acb\u6821\u5c0d\u8349\u7a3f'
                : (!isAdmin && !isClaimOwner ? '\u8acb\u5148\u9818\u53d6\u6848\u4ef6' : '');
        const sourceBadge = isReviewWorkflowSatelliteRow(row)
            ? '<span class="review-workflow-source-badge">衛星草稿</span>'
            : '';
        const assignButton = isAdmin
            ? `<button class="review-workflow-assign-btn" type="button" onclick="assignReviewWorkflowCase(${row.case_id})">ADMIN 改派</button>`
            : '';
        const item = document.createElement('article');
        item.className = 'review-item review-workflow-item';
        item.innerHTML = `
            <div class="review-heading">
                <div class="review-place-summary">
                    <div class="place-title">${escapeHtml(row.place_name || '')}</div>
                    <div class="place-meta">
                        <span class="meta-badge">${escapeHtml(row.language || '')}</span>
                        <span class="meta-badge">${escapeHtml(row.class_name || '未分類')}</span>
                        ${sourceBadge}
                        <span class="meta-badge">${escapeHtml(row.county || '')} ${escapeHtml(row.town || '')}</span>
                        <span class="review-state review-pending">${escapeHtml(row.state || '待指派')}</span>
                    </div>
                </div>
                <div class="review-action-group">${claimAction}${assignButton}</div>
            </div>
            <div class="review-workflow-grid">
                <section class="review-workflow-panel">
                    <h4>標注版本（校對員唯讀）</h4>
                    ${renderReviewWorkflowFields(row, canEdit)}
                    ${renderReviewWorkflowAudioDraftCurrentMeta(row)}
                    ${renderReviewWorkflowAnnotationHistoryPanel(row, canEdit)}
                </section>
                <section class="review-workflow-panel">
                    <h4>音檔判定（唯讀）</h4>
                    <p>${escapeHtml(row.audio_review_state || '未審聽')}｜音檔 ${Number(row.audio_record_count || 0)} 筆｜已判定 ${Number(row.assessed_audio_count || 0)} 筆</p>
                    <p>可用 ${Number(row.usable_audio_count || 0)} 筆</p>
                    ${renderReviewWorkflowAudioEvidence(row, canEdit, canAnnotate)}
                    ${isAudioCase ? renderReviewWorkflowAudioAnnotationDraft(row, canAnnotate) : ''}
                </section>
            </div>
            <div class="review-workflow-actions">
                ${isClaimOwner || isAdmin ? `<button class="review-workflow-draft-btn" type="button" onclick="saveReviewWorkflowDraft(${row.case_id}, this)">存校對草稿</button>` : ''}
                ${!isAudioMode && (isClaimOwner || isAdmin) ? '<button class="review-workflow-return-btn" type="button" onclick="returnReviewWorkflowCase(' + row.case_id + ', this)">退回標注／音檔</button>' : ''}
                <button class="review-workflow-approve-btn" type="button" ${approveDisabled ? 'disabled' : ''} onclick="approveReviewWorkflowCase(${row.case_id}, this)">審核通過並建立回寫工作</button>
                ${approveReason ? `<small class="review-workflow-approve-hint">${escapeHtml(approveReason)}</small>` : ''}
            </div>
        `;
        if (isAudioMode) {
            const grid = item.querySelector('.review-workflow-grid');
            const draftPanel = grid?.querySelector('.review-workflow-panel:first-child');
            const audioPanel = grid?.querySelector('.review-workflow-panel:last-child');
            draftPanel?.remove();
            grid?.classList.add('review-workflow-audio-only');
            if (audioPanel) {
                if (isWritten) {
                    audioPanel.innerHTML = '<h4>音檔檢驗工作台</h4><p class="review-workflow-source-note">此案件是衛星書面草稿，不需要音檔判定。</p>';
                } else {
                    const heading = audioPanel.querySelector('h4');
                    if (heading) heading.textContent = '音檔檢驗工作台';
                }
            }
            item.querySelector('.review-workflow-actions')?.remove();
        } else {
            const draftPanel = item.querySelector('.review-workflow-grid .review-workflow-panel:first-child');
            const draftHeading = draftPanel?.querySelector('h4');
            if (draftHeading) draftHeading.textContent = '校對草稿';
            const audioPanel = item.querySelector('.review-workflow-grid .review-workflow-panel:last-child');
            if (audioPanel && isWritten) {
                audioPanel.innerHTML = '<h4>來源摘要</h4><p class="review-workflow-source-note">衛星表單內容已送入共用校對草稿層，請直接校對；這筆案件不需要音檔判定。</p>';
            } else if (audioPanel) {
                const heading = audioPanel.querySelector('h4');
                if (heading) heading.textContent = '調查員內容（僅供校對帶入）';
            }
            const draftToolbar = item.querySelector('.review-workflow-draft-toolbar');
            if (draftToolbar) {
                if (isReviewWorkflowSatelliteRow(row)) {
                    draftToolbar.querySelector('small').textContent = '衛星表單內容已送入共用校對草稿層，請確認後保存。';
                    draftToolbar.querySelector('.review-workflow-fill-existing-btn').textContent = '載入目前草稿';
                } else {
                    draftToolbar.querySelector('small').textContent = '先領取案件，再從調查員音檔帶入內容；帶入後仍可逐欄修改。';
                    draftToolbar.querySelector('.review-workflow-fill-existing-btn').textContent = '帶入目前標注';
                }
                draftToolbar.querySelector('.review-workflow-clear-btn').textContent = '清空草稿';
            }
            item.querySelectorAll('.review-workflow-fill-audio-btn').forEach(button => {
                button.textContent = '填入這筆內容';
            });
        }
        container.appendChild(item);
        const audioDraftPanel = item.querySelector('[data-review-audio-draft-panel]');
        if (audioDraftPanel) bindReviewWorkflowAudioAnnotationDraftPanel(audioDraftPanel, row.case_id);
        if (!isWritten && !row.audio_sources_loaded && !Array.isArray(row.audio_sources)
            && (canEdit || canAssessReviewWorkflowAudio(row))) {
            loadReviewWorkflowAudioSourcesForRow(row, item, canEdit, canAnnotate);
        }
    });
}


async function performReviewWorkflowAction(rpcName, body, button, successMessage) {
    const originalText = button?.innerText || '';
    if (button) { button.disabled = true; button.innerText = '處理中...'; }
    try {
        await reviewWorkflowRpc(rpcName, body);
        await loadReviewWorkflowQueue({ silent: true });
        if (successMessage) alert(successMessage);
    } catch (error) {
        alert(`審查 workflow 操作失敗：${error.message}`);
        if (button) { button.disabled = false; button.innerText = originalText; }
    }
}

async function claimReviewWorkflowCase(caseId, button) {
    const row = getReviewWorkflowRow(caseId);
    const isAudioClaim = isAudioReviewRole()
        && getReviewWorkbenchMode() === 'audio'
        && !isReviewWorkflowWrittenRow(row);
    if (!confirm(isAudioClaim ? '確定領取這筆音檔案件嗎？會暫時鎖定 30 分鐘。' : '確定領取這筆案件嗎？會暫時鎖定 30 分鐘。')) return;
    const rpcName = isAudioClaim ? 'claim_audio_review_case' : 'claim_review_case';
    await performReviewWorkflowAction(rpcName, {
        p_case_id: Number(caseId), p_actor_account: state.userId
    }, button, isAudioClaim ? '音檔案件已領取，暫時鎖定 30 分鐘。' : '案件已領取，暫時鎖定 30 分鐘。');
}

async function releaseReviewWorkflowCase(caseId, button) {
    if (!confirm('確定釋放這筆案件嗎？')) return;
    const row = getReviewWorkflowRow(caseId);
    const isAudioClaim = isAudioReviewRole()
        && getReviewWorkbenchMode() === 'audio'
        && !isReviewWorkflowWrittenRow(row);
    const rpcName = isAudioClaim ? 'release_audio_review_case' : 'release_review_case';
    await performReviewWorkflowAction(rpcName, {
        p_case_id: Number(caseId), p_actor_account: state.userId,
        p_claim_token: isAudioClaim ? (row?.audio_claim_token || null) : (row?.claim_token || null)
    }, button, isAudioClaim ? '音檔案件已釋放。' : '案件已釋放。');
}

async function assignReviewWorkflowCase(caseId) {
    if (state.userRole !== 'admin') return;
    const assignee = prompt('請輸入校對員帳號或 email：');
    if (!assignee) return;
    try {
        await reviewWorkflowRpc('assign_review_case', {
            p_case_id: Number(caseId), p_assignee: assignee.trim(), p_actor_account: state.userId
        });
        await loadReviewWorkflowQueue({ silent: true });
        alert('案件已改派。');
    } catch (error) {
        alert(`案件改派失敗：${error.message}`);
    }
}

async function saveLegacyProofingDraft(caseId, button) {
    const fields = collectReviewWorkflowDraftFields(caseId);
    if (!hasReviewWorkflowDraftValues(fields)) {
        alert('\u8acb\u5148\u586b\u5beb\u81f3\u5c11\u4e00\u500b\u6821\u5c0d\u6b04\u4f4d\u3002');
        return;
    }
    await performReviewWorkflowAction('save_annotation_version', {
        p_case_id: Number(caseId), p_actor_account: state.userId, p_fields: fields
    }, button, '\u6821\u5c0d\u8349\u7a3f\u5df2\u4fdd\u5b58\u3002');
    return;
    const note = prompt('請輸入校對草稿備註（可留空）：', '');
    if (note === null) return;
    await performReviewWorkflowAction('save_proofing_draft', {
        p_case_id: Number(caseId), p_actor_account: state.userId,
        p_payload: { note }
    }, button, '校對草稿已保存。');
}

async function saveReviewWorkflowDraft(caseId, button) {
    const fields = collectReviewWorkflowDraftFields(caseId);
    if (!hasReviewWorkflowDraftValues(fields)) {
        alert('\u8acb\u5148\u586b\u5beb\u81f3\u5c11\u4e00\u500b\u6821\u5c0d\u6b04\u4f4d\u3002');
        return;
    }
    const row = getReviewWorkflowRow(caseId);
    await performReviewWorkflowAction('save_annotation_version', {
        p_case_id: Number(caseId), p_actor_account: state.userId, p_fields: fields,
        p_claim_token: row?.claim_token || null
    }, button, '\u6821\u5c0d\u8349\u7a3f\u5df2\u4fdd\u5b58\u3002');
}
async function approveReviewWorkflowCase(caseId, button) {
    if (!confirm('確定通過？系統只會建立 versioned Sheet writeback job，不會直接覆寫工作表。')) return;
    const row = getReviewWorkflowRow(caseId);
    await performReviewWorkflowAction('approve_review_case', {
        p_case_id: Number(caseId), p_actor_account: state.userId,
        p_claim_token: row?.claim_token || null
    }, button, '審核完成，已建立可重試的回寫工作。');
}

async function returnReviewWorkflowCase(caseId, button) {
    const row = getReviewWorkflowRow(caseId);
    const target = prompt('要退回哪一部分？請輸入：標注／音檔／兩者', '標注');
    if (target === null) return;
    const normalizedTarget = String(target || '').trim();
    const returnAnnotation = ['標注', '標音', '書面', '兩者', '二者'].includes(normalizedTarget);
    const returnAudio = ['音檔', '音頻', '兩者', '二者'].includes(normalizedTarget);
    if (!returnAnnotation && !returnAudio) {
        alert('退回目標只能是：標注、音檔或兩者。');
        return;
    }

    let annotationReason = '';
    let audioReason = '';
    if (returnAnnotation) {
        annotationReason = (prompt('請填寫標注退回原因：', '') || '').trim();
        if (!annotationReason) {
            alert('標注退回原因必填。');
            return;
        }
    }
    if (returnAudio) {
        audioReason = (prompt('請填寫音檔退回原因：', '') || '').trim();
        if (!audioReason) {
            alert('音檔退回原因必填。');
            return;
        }
    }
    if (!confirm('確定退回這筆案件嗎？原有草稿與歷程會保留。')) return;

    await performReviewWorkflowAction('return_review_case', {
        p_case_id: Number(caseId),
        p_actor_account: state.userId,
        p_claim_token: row?.claim_token || null,
        p_return_annotation: returnAnnotation,
        p_return_audio: returnAudio,
        p_annotation_reason: annotationReason,
        p_audio_reason: audioReason
    }, button, '案件已退回，原有草稿與歷程已保留。');
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

function renderClassBadges(place) {
    const badges = [];
    if (place.taiClass) badges.push(`<span class="meta-badge class-badge">台 ${escapeHtml(place.taiClass)}</span>`);
    if (place.hakClass) badges.push(`<span class="meta-badge class-badge">客 ${escapeHtml(place.hakClass)}</span>`);
    return badges.join('');
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

function renderRecordCompareCell(taskId, languageKey, record, field) {
    const value = getRecordFieldValue(record, field);
    const copyButton = value
        ? `<button class="copy-field-btn" data-value="${escapeHtml(value)}" onclick="copyReviewFieldToFinal(${taskId}, '${languageKey}', '${field.key}', this.dataset.value)">填入</button>`
        : '';

    return `
        <td class="review-compare-cell ${value ? 'has-value' : ''}">
            <div class="compare-value">${value ? escapeHtml(value) : '未填'}</div>
            ${copyButton}
        </td>
    `;
}

function renderReviewRecordTable(taskId, languageKey, records, fields) {
    const config = REVIEW_FIELD_CONFIG[languageKey];
    const compareFields = config.compareFields
        .map(fieldKey => fields.find(field => field.key === fieldKey))
        .filter(Boolean);
    return `
        <div class="review-record-table-wrap">
            <table class="review-record-table">
                <thead>
                    <tr>
                        <th>錄音</th>
                        ${compareFields.map(field => `<th>${field.label}</th>`).join('')}
                        <th>播放</th>
                    </tr>
                </thead>
                <tbody>
            ${records.map((record, index) => `
                <tr>
                    <td class="review-record-label">
                        <strong>錄音${index + 1}</strong>
                        <span title="${escapeHtml(getUserEmail(record.uploaderId))}">${escapeHtml(getUserDisplayName(record.uploaderId))}</span>
                    </td>
                    ${compareFields.map(field => renderRecordCompareCell(taskId, languageKey, record, field)).join('')}
                    <td class="review-play-cell">
                        <button class="play-btn compact" onclick="fetchAndPlayAudio('${record.url}', '${record.recordId}')">播放</button>
                        <div id="player-${record.recordId}" class="review-player"></div>
                    </td>
                </tr>
            `).join('')}
                </tbody>
            </table>
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

function renderReviewPlaceSummary(place) {
    const typeName = place.type || '無類別';
    const displayUuid = place.sourceId || place.id;
    const classBadges = renderClassBadges(place);
    return `
        <div class="review-place-summary">
            <div class="place-title">${escapeHtml(place.placeName)}</div>
            <div class="place-meta">
                <span class="meta-badge">UUID: ${escapeHtml(displayUuid)}</span>
                <span class="meta-badge">${escapeHtml(typeName)}</span>
                <span class="meta-badge">${escapeHtml(place.county)} ${escapeHtml(place.town)} ${escapeHtml(place.village || '')}</span>
                <span class="meta-badge record-badge">${escapeHtml(place.recordingStatus)}</span>
                ${classBadges}
            </div>
        </div>
    `;
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

        item.innerHTML = `
            <div class="review-heading">
                ${renderReviewPlaceSummary(place)}
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
                <div class="review-action-group">
                    ${isDone
                        ? `<span class="review-passed-label">已通過</span><button class="review-revoke-btn" onclick="revokeReviewLanguage(${place.id}, '${language}', this)">撤回審查</button>`
                        : `<button class="review-approve-btn" onclick="approveReviewLanguage(${place.id}, '${language}', this)">審查通過</button>`
                    }
                </div>
            </div>
            ${renderReviewRecordTable(place.id, languageKey, records, fields)}
            ${renderFinalReviewFields(place.id, languageKey, fields, isDone)}
        </section>
    `;
}

async function approveReviewLanguage(taskId, language, button) {
    alert('APP 審查功能已暫停，未寫入資料。');
    return;
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

async function revokeReviewLanguage(taskId, language, button) {
    alert('APP 審查功能已暫停，未寫入資料。');
    return;
    if (!confirm(`確定撤回這筆地名的${language}審查通過狀態嗎？`)) return;

    const originalText = button.innerText;
    button.innerText = '撤回中...';
    button.disabled = true;

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/revoke_task_language_review`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                p_task_id: Number(taskId),
                p_language: language,
                p_reviewed_by: state.userId
            })
        });

        if (!response.ok) throw new Error(await response.text());

        alert(`${language}審查已撤回。`);
        await loadDataFromSupabase(state.userId);
        applyFilters();
    } catch (err) {
        console.error('撤回審查失敗:', err);
        alert(`撤回審查失敗：${err.message}`);
        button.innerText = originalText;
        button.disabled = false;
    }
}

function getPlaceByTaskId(taskId) {
    const id = String(taskId);
    return getAllKnownPlacesForAudioLinking()
        .concat(state.filteredPlaces || [])
        .find(place => String(place.id) === id) || null;
}

function getLanguageAssignee(place, language) {
    return language === '台語' ? (place.tAssignee || '') : (place.hAssignee || '');
}

function getLanguageAssigneeLabel(place, language) {
    const account = getLanguageAssignee(place, language);
    return account ? getUserDisplayName(account) : '未指派';
}

function getLanguageAssignmentSelectId(placeId, language) {
    return `language-assignee-${placeId}-${language === '台語' ? 'tai' : 'hak'}`;
}

function renderLanguageAssigneeOptions(currentAccount) {
    return '<option value="">未指派</option>' + state.allUsers.map(user => {
        const annotatorName = getUserAnnotatorName(user);
        const selected = isSameUserIdentifier(annotatorName, currentAccount) ? 'selected' : '';
        return `<option value="${escapeHtml(annotatorName)}" ${selected} title="${escapeHtml(getUserHoverTitle(user))}">${escapeHtml(user.name || user.account)}</option>`;
    }).join('');
}

function renderLanguageAssignmentControls(place) {
    const rows = [
        { language: '台語', label: '台語', assignee: place.tAssignee || '' },
        { language: '客語', label: '客語', assignee: place.hAssignee || '' }
    ];

    return `
        <div class="language-assignment-panel" onclick="event.stopPropagation()">
            ${rows.map(row => {
                const selectId = getLanguageAssignmentSelectId(place.id, row.language);
                const displayName = row.assignee ? getUserDisplayName(row.assignee) : '未指派';
                return `
                    <div class="language-assignment-row">
                        <span class="language-assignment-label">${row.label}</span>
                        <span class="language-assignment-current" title="${escapeHtml(row.assignee || '')}">${escapeHtml(displayName)}</span>
                        <input type="text" class="language-assignee-search" placeholder="搜尋調查員" oninput="filterSelectOptions('${escapeJsString(selectId)}', this.value)">
                        <select id="${escapeHtml(selectId)}" class="language-assignee-select">
                            ${renderLanguageAssigneeOptions(row.assignee)}
                        </select>
                        <button class="language-assign-btn" type="button" onclick="assignTaskLanguageFromCard(event, ${Number(place.id)}, '${row.language}')">設定</button>
                        <button class="language-unassign-btn" type="button" onclick="unassignTaskLanguageFromCard(event, ${Number(place.id)}, '${row.language}')" ${row.assignee ? '' : 'disabled'}>撤回</button>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

async function callAssignTaskLanguageRpc(taskIds, language, targetUser) {
    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/assign_task_language`, {
        method: 'POST',
        headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            p_task_ids: taskIds.map(id => Number(id)),
            p_language: language,
            p_user_name: targetUser,
            p_assigned_by: state.userId
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '語種指派失敗');
    }

    const resultText = await response.text();
    return Number(resultText || 0);
}

async function callUnassignTaskLanguageRpc(taskIds, language) {
    const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/unassign_task_language`, {
        method: 'POST',
        headers: {
            'apikey': CONFIG.SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            p_task_ids: taskIds.map(id => Number(id)),
            p_language: language,
            p_unassigned_by: state.userId
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || '資料庫撤回失敗');
    }

    const resultText = await response.text();
    return Number(resultText || 0);
}

async function refreshAfterAssignmentChange() {
    await loadDataFromSupabase(state.userId);
    initFilters();
    applyFilters();
}

async function assignTaskLanguageFromCard(event, taskId, language) {
    if (event) event.stopPropagation();
    const select = document.getElementById(getLanguageAssignmentSelectId(taskId, language));
    const targetUser = select ? select.value.trim() : '';
    if (!targetUser) return alert(`請先選擇${language}調查員。`);

    const place = getPlaceByTaskId(taskId);
    const placeName = place ? place.placeName : `任務 ${taskId}`;
    const targetUserName = getUserDisplayName(targetUser);
    if (!confirm(`確定要將「${placeName}」的${language}指派給「${targetUserName}」嗎？`)) return;

    try {
        await callAssignTaskLanguageRpc([taskId], language, targetUser);
        alert(`${language}指派已更新。`);
        await refreshAfterAssignmentChange();
    } catch (err) {
        console.error('語種指派失敗:', err);
        alert(`語種指派失敗：${err.message}`);
    }
}

async function unassignTaskLanguageFromCard(event, taskId, language) {
    if (event) event.stopPropagation();

    const place = getPlaceByTaskId(taskId);
    const placeName = place ? place.placeName : `任務 ${taskId}`;
    const assigneeName = place ? getLanguageAssigneeLabel(place, language) : '目前調查員';
    if (!confirm(`確定要撤回「${placeName}」的${language}指派嗎？\n\n目前指派：${assigneeName}`)) return;

    try {
        const changed = await callUnassignTaskLanguageRpc([taskId], language);
        if (changed === 0) {
            alert('這筆語種指派已經是未指派狀態，畫面將重新整理。');
        } else {
            alert(`${language}指派已撤回。`);
        }
        await refreshAfterAssignmentChange();
    } catch (err) {
        console.error('撤回語種指派失敗:', err);
        alert(`撤回語種指派失敗：${err.message}`);
    }
}

// 🌟 升級：渲染清單 (插入 Checkbox)
function renderPlaceList(places) {
    const container = document.getElementById('place-list-container');
    container.innerHTML = "";
    state.filteredPlaces = Array.isArray(places) ? places : [];
    state.renderedPlaceCount = 0;
    state.lastSelectedPlaceIndex = null;
    state.selectedAssignTaskIds = new Set();
    updatePlaceMapToolbar();
    if (state.placeMap.isOpen) renderPlaceMapMarkers({ preserveView: true });
    if (state.filteredPlaces.length === 0) {
        container.innerHTML = '<div class="empty-state">沒有符合條件的地名</div>';
        updateSelectedAssignCount();
        return;
    }

    renderAdminPlaceSelectionHeader(container);
    appendPlaceListBatch();
}

function renderAdminPlaceSelectionHeader(container) {
    if (state.userRole !== 'admin') return;

    const header = document.createElement('label');
    header.className = 'place-select-all-row';
    header.onclick = event => event.stopPropagation();
    header.innerHTML = `
        <input id="select-filtered-places" type="checkbox" onchange="toggleAllFilteredPlaceSelection(event)">
        <span>全選目前篩選結果</span>
    `;
    container.appendChild(header);
}

function appendPlaceListBatch() {
    const container = document.getElementById('place-list-container');
    if (!container) return;

    const places = state.filteredPlaces || [];
    const start = state.renderedPlaceCount || 0;
    const batchSize = state.placeRenderBatchSize || 100;
    const end = Math.min(start + batchSize, places.length);
    const oldLoadMore = document.getElementById('place-list-load-more');
    if (oldLoadMore) oldLoadMore.remove();

    const fragment = document.createDocumentFragment();
    places.slice(start, end).forEach((place, offset) => {
        const index = start + offset;
        const item = document.createElement('div');
        item.className = 'place-item';
        item.dataset.taskId = String(place.id);
        if (canShowPlaceMapButton(place)) item.classList.add('has-map');
        if (state.selectedPlace && state.selectedPlace.id === place.id) item.classList.add('active');
        
        let typeName = place.type || place.Type || '無類別';
        if (typeName === "具有地標意義公共設施") typeName = "公共設施";
        
        const recordBadge = `<span class="meta-badge record-badge">${place.recordingStatus}｜台 ${place.taiAudioCount} / 客 ${place.hakAudioCount}</span>`;
        const classBadges = state.userRole === 'admin' ? renderClassBadges(place) : '';

        // 🛑 新增：Checkbox 與指派標籤
        let checkboxHTML = '';
        let adminAssignBadge = '';
        let languageAssignmentControls = '';
        
        if (state.userRole === 'admin') {
            // Checkbox：加上 onclick="event.stopPropagation()" 防止點擊時展開錄音介面
            const isChecked = state.selectedAssignTaskIds?.has(String(place.id)) ? 'checked' : '';
            checkboxHTML = `<label class="assign-checkbox-hitbox" onclick="event.stopPropagation()">
                <input type="checkbox" class="assign-checkbox" value="${place.id}" data-task-id="${place.id}" data-list-index="${index}" onclick="toggleAdminPlaceSelection(event, ${index})" aria-label="選取 ${escapeHtml(place.placeName)}" title="勾選；Shift + 左鍵可連續選取多筆" ${isChecked}>
            </label>`;
            languageAssignmentControls = renderLanguageAssignmentControls(place);
            
            if (place.tAssignee || place.hAssignee) {
                adminAssignBadge = `<span class="meta-badge assign-badge">👤 台：${escapeHtml(getLanguageAssigneeLabel(place, '台語'))}｜客：${escapeHtml(getLanguageAssigneeLabel(place, '客語'))}</span>`;
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
                        <span class="meta-badge">${[place.county, place.town, place.village].filter(Boolean).join(' ')}</span>
                        <span class="meta-badge">${typeName}</span>
                        ${classBadges}
                        <div class="meta-badge-row">${recordBadge} ${adminAssignBadge}</div>
                    </div>
                    ${languageAssignmentControls}
                </div>
                <div class="expand-icon">▶</div>
            </div>
        `;
        item.onclick = () => openRecordingUI(place, item);
        fragment.appendChild(item);
    });

    container.appendChild(fragment);
    state.renderedPlaceCount = end;
    renderPlaceListLoadMore();
    syncRenderedAdminSelection();
    updateSelectedAssignCount();
}

function renderPlaceListLoadMore() {
    const container = document.getElementById('place-list-container');
    if (!container) return;

    const total = (state.filteredPlaces || []).length;
    const shown = state.renderedPlaceCount || 0;
    if (shown >= total) return;

    const button = document.createElement('button');
    button.id = 'place-list-load-more';
    button.type = 'button';
    button.className = 'place-list-load-more';
    button.textContent = `載入更多（已顯示 ${shown} / ${total} 筆）`;
    button.onclick = event => {
        event.stopPropagation();
        appendPlaceListBatch();
    };
    container.appendChild(button);
}

function toggleAdminPlaceSelection(event, index) {
    event.stopPropagation();
    const checkbox = event.currentTarget;
    const checkboxes = Array.from(document.querySelectorAll('.assign-checkbox'));
    const shouldSelect = checkbox.checked;

    if (event.shiftKey && state.lastSelectedPlaceIndex !== null) {
        const start = Math.min(state.lastSelectedPlaceIndex, index);
        const end = Math.max(state.lastSelectedPlaceIndex, index);
        checkboxes.forEach(box => {
            const boxIndex = Number(box.dataset.listIndex);
            if (boxIndex >= start && boxIndex <= end) {
                box.checked = shouldSelect;
                setAdminTaskSelection(box.value, shouldSelect);
                box.closest('.place-item')?.classList.toggle('selected-for-assign', shouldSelect);
            }
        });
    } else {
        setAdminTaskSelection(checkbox.value, shouldSelect);
        checkbox.closest('.place-item')?.classList.toggle('selected-for-assign', shouldSelect);
    }

    state.lastSelectedPlaceIndex = index;
    updateSelectedAssignCount();
}

function setAdminTaskSelection(taskId, selected) {
    if (!state.selectedAssignTaskIds || !(state.selectedAssignTaskIds instanceof Set)) {
        state.selectedAssignTaskIds = new Set();
    }
    const normalizedId = String(taskId);
    if (selected) {
        state.selectedAssignTaskIds.add(normalizedId);
    } else {
        state.selectedAssignTaskIds.delete(normalizedId);
    }
}

function getFilteredAdminTaskIds() {
    return (state.filteredPlaces || []).map(place => String(place.id));
}

function getSelectedAdminTaskIds() {
    const filteredIds = getFilteredAdminTaskIds();
    const selectedIds = state.selectedAssignTaskIds || new Set();
    return filteredIds.filter(taskId => selectedIds.has(taskId));
}

function syncRenderedAdminSelection() {
    document.querySelectorAll('.assign-checkbox').forEach(box => {
        const selected = state.selectedAssignTaskIds?.has(String(box.value)) || false;
        box.checked = selected;
        box.closest('.place-item')?.classList.toggle('selected-for-assign', selected);
    });
}

function toggleAllFilteredPlaceSelection(event) {
    event.stopPropagation();
    const checked = event.currentTarget.checked;
    getFilteredAdminTaskIds().forEach(taskId => setAdminTaskSelection(taskId, checked));
    syncRenderedAdminSelection();
    updateSelectedAssignCount();
}

function updateAdminSelectAllControl(selectedCount, filteredCount) {
    const selectAll = document.getElementById('select-filtered-places');
    if (!selectAll) return;
    selectAll.checked = filteredCount > 0 && selectedCount === filteredCount;
    selectAll.indeterminate = selectedCount > 0 && selectedCount < filteredCount;
}

function updateSelectedAssignCount() {
    const countEl = document.getElementById('assign-count');
    const mobileCountEl = document.getElementById('admin-assign-toggle-count');
    const bar = document.getElementById('admin-assign-bar');
    const filteredCount = (state.filteredPlaces || []).length;
    const selectedCount = getSelectedAdminTaskIds().length;
    updateAdminSelectAllControl(selectedCount, filteredCount);
    const countText = `篩選結果${filteredCount}筆，${selectedCount}筆已選`;
    if (countEl) countEl.innerText = countText;
    if (mobileCountEl) mobileCountEl.innerText = `${selectedCount} 筆已選`;
    if (bar) {
        bar.classList.toggle('has-selection', selectedCount > 0);
        if (selectedCount === 0) {
            bar.classList.remove('is-open');
            document.getElementById('admin-assign-toggle')?.setAttribute('aria-expanded', 'false');
        }
    }
}

function getPlaceCoordinates(place) {
    const rawLat = place?.latitude;
    const rawLng = place?.longitude;
    if (rawLat === null || rawLat === undefined || rawLng === null || rawLng === undefined) return null;
    if (String(rawLat).trim() === '' || String(rawLng).trim() === '') return null;
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    if (lat === 0 && lng === 0) return null;
    return { lat, lng };
}

function hasVillageLocation(place) {
    return Boolean(String(place?.village || '').trim());
}

function canShowPlaceMapButton(place) {
    return Boolean(getPlaceCoordinates(place) || hasVillageLocation(place));
}

function getPlaceAdminText(place) {
    return [place?.county, place?.town, place?.village].filter(Boolean).join(' ');
}

function getMapEligiblePlaces() {
    return (state.filteredPlaces || []).filter(canShowPlaceMapButton);
}

function getMappablePlaces() {
    return (state.filteredPlaces || []).filter(place => getPlaceCoordinates(place));
}

function updatePlaceMapToolbar() {
    const button = document.getElementById('place-map-toggle');
    const summary = document.getElementById('place-map-summary');
    if (!button || !summary) return;

    const eligibleCount = getMapEligiblePlaces().length;
    const coordinateCount = getMappablePlaces().length;
    button.classList.toggle('hidden', eligibleCount === 0);
    summary.textContent = eligibleCount > 0
        ? `目前篩選結果 ${coordinateCount} 筆可精準定位${eligibleCount > coordinateCount ? `，${eligibleCount - coordinateCount} 筆僅有村里` : ''}`
        : '';
}

function loadLeaflet() {
    if (window.L) return Promise.resolve(window.L);
    if (state.placeMap.leafletPromise) return state.placeMap.leafletPromise;

    state.placeMap.leafletPromise = new Promise((resolve, reject) => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link');
            link.id = 'leaflet-css';
            link.rel = 'stylesheet';
            link.href = LEAFLET_CSS_URL;
            link.integrity = LEAFLET_CSS_INTEGRITY;
            link.crossOrigin = '';
            document.head.appendChild(link);
        }

        const existingScript = document.getElementById('leaflet-js');
        if (existingScript) {
            existingScript.addEventListener('load', () => resolve(window.L), { once: true });
            existingScript.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = 'leaflet-js';
        script.src = LEAFLET_JS_URL;
        script.integrity = LEAFLET_JS_INTEGRITY;
        script.crossOrigin = '';
        script.onload = () => resolve(window.L);
        script.onerror = () => reject(new Error('Leaflet 載入失敗'));
        document.body.appendChild(script);
    });

    return state.placeMap.leafletPromise;
}

function ensurePlaceMapPanelOpen() {
    const panel = document.getElementById('place-map-panel');
    if (!panel) return false;
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
    document.body.classList.add('place-map-open');
    state.placeMap.isOpen = true;
    return true;
}

async function openPlaceMapView(options = {}) {
    if (!ensurePlaceMapPanelOpen()) return;
    setPlaceMapStatus('地圖載入中...');

    try {
        const L = await loadLeaflet();
        if (!state.placeMap.map) {
            state.placeMap.map = L.map('place-map-canvas', { preferCanvas: true }).setView(PLACE_MAP_DEFAULT_CENTER, PLACE_MAP_DEFAULT_ZOOM);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(state.placeMap.map);
            state.placeMap.layer = L.layerGroup().addTo(state.placeMap.map);
        }

        schedulePlaceMapResize();
        renderPlaceMapMarkers(options);
    } catch (err) {
        console.error('地圖載入失敗:', err);
        setPlaceMapStatus(`地圖載入失敗：${err.message}`);
    }
}

function schedulePlaceMapResize() {
    requestAnimationFrame(() => state.placeMap.map?.invalidateSize());
    setTimeout(() => state.placeMap.map?.invalidateSize(), 240);
}

function closePlaceMapView() {
    const panel = document.getElementById('place-map-panel');
    if (!panel) return;
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('place-map-open');
    state.placeMap.isOpen = false;
}

function setPlaceMapStatus(message) {
    const status = document.getElementById('place-map-status');
    if (status) status.textContent = message || '';
}

function renderPlaceMapMarkers(options = {}) {
    const L = window.L;
    const mapState = state.placeMap;
    if (!mapState.map || !mapState.layer || !L) return;

    mapState.layer.clearLayers();
    mapState.markers = new Map();
    const eligiblePlaces = getMapEligiblePlaces();
    const mappablePlaces = getMappablePlaces();
    const limitedPlaces = mappablePlaces.slice(0, PLACE_MAP_MARKER_LIMIT);
    const overflowCount = Math.max(0, mappablePlaces.length - limitedPlaces.length);
    const villageOnlyCount = eligiblePlaces.length - mappablePlaces.length;
    const selectedId = state.selectedPlace ? String(state.selectedPlace.id) : '';
    const bounds = L.latLngBounds([]);

    limitedPlaces.forEach(place => {
        const coords = getPlaceCoordinates(place);
        if (!coords) return;
        const isSelected = String(place.id) === selectedId;
        const marker = L.circleMarker([coords.lat, coords.lng], {
            radius: isSelected ? 8 : 5,
            weight: isSelected ? 3 : 1,
            color: isSelected ? '#006d5b' : '#1f546e',
            fillColor: isSelected ? '#00ed64' : '#2d736c',
            fillOpacity: isSelected ? 0.95 : 0.72
        }).addTo(mapState.layer);
        marker.bindTooltip(place.placeName || '未命名地名', { direction: 'top', sticky: true });
        marker.on('click', () => selectPlaceFromMap(place.id));
        mapState.markers.set(String(place.id), marker);
        bounds.extend([coords.lat, coords.lng]);
    });

    const parts = [`${eligiblePlaces.length} 筆可開啟地圖`];
    parts.push(`${mappablePlaces.length} 筆有經緯度`);
    if (villageOnlyCount > 0) parts.push(`${villageOnlyCount} 筆僅有村里`);
    if (overflowCount > 0) parts.push(`已先顯示前 ${PLACE_MAP_MARKER_LIMIT} 筆，請縮小篩選條件`);
    setPlaceMapStatus(parts.join('｜'));
    updatePlaceMapHeaderSummary(eligiblePlaces.length, mappablePlaces.length);

    if (state.selectedPlace) {
        renderSelectedMapCard(state.selectedPlace);
        const coords = getPlaceCoordinates(state.selectedPlace);
        if (coords && !options.preserveView) {
            mapState.map.setView([coords.lat, coords.lng], Math.max(mapState.map.getZoom?.() || 15, 15));
        } else if (!coords && mappablePlaces.length === 0 && !options.preserveView) {
            mapState.map.setView(PLACE_MAP_DEFAULT_CENTER, PLACE_MAP_DEFAULT_ZOOM);
        }
    } else {
        hideSelectedMapCard();
        if (bounds.isValid() && !options.preserveView) {
            mapState.map.fitBounds(bounds, { padding: [24, 24], maxZoom: 13 });
        } else if (!options.preserveView) {
            mapState.map.setView(PLACE_MAP_DEFAULT_CENTER, PLACE_MAP_DEFAULT_ZOOM);
        }
    }
}

function updatePlaceMapHeaderSummary(eligibleCount, coordinateCount) {
    const summary = document.getElementById('place-map-header-summary');
    if (!summary) return;
    summary.textContent = `目前篩選結果 ${eligibleCount} 筆，${coordinateCount} 筆可精準定位`;
}

function openSelectedPlaceMap() {
    if (!state.selectedPlace) return;
    openPlaceMapView({ focusPlace: state.selectedPlace });
}

function focusMapOnSelectedPlace() {
    if (!state.selectedPlace) return;
    const coords = getPlaceCoordinates(state.selectedPlace);
    if (coords && state.placeMap.map) {
        state.placeMap.map.setView([coords.lat, coords.lng], 16);
    }
    renderSelectedMapCard(state.selectedPlace);
}

function selectPlaceFromMap(taskId) {
    const place = getPlaceByTaskId(taskId);
    if (!place) return;
    const item = scrollPlaceListToTask(taskId);
    openRecordingUI(place, item);
}

function scrollPlaceListToTask(taskId) {
    const container = document.getElementById('place-list-container');
    if (!container) return null;
    let item = container.querySelector(`.place-item[data-task-id="${CSS.escape(String(taskId))}"]`);
    while (!item && (state.renderedPlaceCount || 0) < (state.filteredPlaces || []).length) {
        appendPlaceListBatch();
        item = container.querySelector(`.place-item[data-task-id="${CSS.escape(String(taskId))}"]`);
    }
    if (item) item.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return item;
}

function renderSelectedMapCard(place) {
    const card = document.getElementById('place-map-card');
    if (!card || !place) return;
    const coords = getPlaceCoordinates(place);
    const adminText = getPlaceAdminText(place) || '未提供行政區';
    const distanceText = getPlaceDistanceText(place);
    const accuracyText = getUserAccuracyText();
    const coordNotice = coords ? '' : '<p class="place-map-muted">此地名目前沒有經緯度，地圖無法精準標示；可先參考村里與地理位置文字。</p>';
    const taskIdArg = escapeJsString(String(place.id));
    const navigationButton = coords
        ? `<button class="place-map-card-btn secondary" type="button" onclick="openExternalNavigation(${coords.lat}, ${coords.lng})">外部導航</button>`
        : '<button class="place-map-card-btn secondary" type="button" disabled>外部導航</button>';
    const nearbyButton = coords
        ? `<button class="place-map-card-btn" type="button" onclick="showNearbyPlaces('${taskIdArg}')">顯示附近地名</button>`
        : '<button class="place-map-card-btn" type="button" disabled>顯示附近地名</button>';

    card.innerHTML = `
        <strong>${escapeHtml(place.placeName || '未命名地名')}</strong>
        <span>${escapeHtml(adminText)}</span>
        ${place.location ? `<p>${escapeHtml(place.location)}</p>` : ''}
        ${coordNotice}
        <div class="place-map-card-meta">${escapeHtml(distanceText)}</div>
        <div class="place-map-card-meta">${escapeHtml(accuracyText)}</div>
        <div id="place-map-nearby" class="place-map-nearby hidden"></div>
        <div class="place-map-card-actions">
            <button class="place-map-card-btn" type="button" onclick="scrollPlaceListToTask('${taskIdArg}')">查看完整資料</button>
            ${nearbyButton}
            ${navigationButton}
        </div>
    `;
    card.classList.remove('hidden');
}

function hideSelectedMapCard() {
    document.getElementById('place-map-card')?.classList.add('hidden');
}

function updatePlaceMapSelection(place) {
    if (!state.placeMap.isOpen || !state.placeMap.map) return;
    renderPlaceMapMarkers({ preserveView: true });
    const coords = getPlaceCoordinates(place);
    if (coords) state.placeMap.map.setView([coords.lat, coords.lng], 16);
    renderSelectedMapCard(place);
}

function isGeolocationAllowedHere() {
    return window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
}

function locateUserOnce() {
    if (!isGeolocationAllowedHere()) {
        setPlaceMapStatus('定位功能僅支援 HTTPS 或 localhost 環境。');
        return;
    }
    if (!state.placeMap.map) return;
    setPlaceMapStatus('正在取得你的位置...');
    state.placeMap.map.once('locationfound', handleUserLocationFound);
    state.placeMap.map.once('locationerror', event => {
        setPlaceMapStatus(event.message ? `定位失敗：${event.message}` : '定位失敗，請確認瀏覽器定位權限。');
    });
    state.placeMap.map.locate({ setView: false, watch: false, enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
}

function handleUserLocationFound(event) {
    const L = window.L;
    if (!L || !state.placeMap.map) return;
    const latlng = event.latlng;
    const accuracy = Number(event.accuracy || 0);
    state.placeMap.userPosition = { lat: latlng.lat, lng: latlng.lng, accuracy };

    if (state.placeMap.userMarker) state.placeMap.userMarker.remove();
    if (state.placeMap.userAccuracyCircle) state.placeMap.userAccuracyCircle.remove();

    state.placeMap.userMarker = L.circleMarker(latlng, {
        radius: 7,
        weight: 2,
        color: '#0b3d91',
        fillColor: '#2f80ed',
        fillOpacity: 0.9
    }).addTo(state.placeMap.map).bindTooltip('我的位置');
    state.placeMap.userAccuracyCircle = L.circle(latlng, {
        radius: accuracy,
        color: '#2f80ed',
        fillColor: '#2f80ed',
        fillOpacity: 0.08,
        weight: 1
    }).addTo(state.placeMap.map);

    setPlaceMapStatus(`已取得位置，定位精度約 ${Math.round(accuracy)} 公尺。`);
    if (state.selectedPlace) renderSelectedMapCard(state.selectedPlace);
}

function getPlaceDistanceText(place) {
    const coords = getPlaceCoordinates(place);
    const user = state.placeMap.userPosition;
    if (!coords) return '尚無精準座標，無法計算距離';
    if (!user) return '尚未定位，無法計算距離';
    const distance = calculateDistanceMeters(user.lat, user.lng, coords.lat, coords.lng);
    return `距離你約 ${formatDistance(distance)}（直線距離）`;
}

function getUserAccuracyText() {
    const user = state.placeMap.userPosition;
    if (!user) return '定位精度：尚未定位';
    const accuracyText = `定位精度：約 ${Math.round(user.accuracy)} 公尺`;
    return user.accuracy > LOW_ACCURACY_THRESHOLD_METERS
        ? `${accuracyText}。目前定位精度較低，距離僅供參考`
        : accuracyText;
}

function calculateDistanceMeters(lat1, lng1, lat2, lng2) {
    const radius = 6371000;
    const toRad = value => value * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters) {
    if (!Number.isFinite(meters)) return '無法計算';
    if (meters < 1000) return `${Math.round(meters)} 公尺`;
    return `${(meters / 1000).toFixed(1)} 公里`;
}

function openExternalNavigation(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank', 'noopener');
}

function showNearbyPlaces(taskId) {
    const panel = document.getElementById('place-map-nearby');
    const source = getPlaceByTaskId(taskId);
    const sourceCoords = getPlaceCoordinates(source);
    if (!panel || !sourceCoords) return;

    const rows = getMappablePlaces()
        .filter(place => String(place.id) !== String(taskId))
        .map(place => {
            const coords = getPlaceCoordinates(place);
            return {
                place,
                distance: calculateDistanceMeters(sourceCoords.lat, sourceCoords.lng, coords.lat, coords.lng)
            };
        })
        .sort((left, right) => left.distance - right.distance)
        .slice(0, 5);

    panel.innerHTML = rows.length
        ? rows.map(row => `<button type="button" onclick="selectPlaceFromMap('${escapeJsString(String(row.place.id))}')">${escapeHtml(row.place.placeName)}｜${escapeHtml(formatDistance(row.distance))}</button>`).join('')
        : '<span>目前篩選結果內沒有其他可定位地名。</span>';
    panel.classList.toggle('hidden');
}
function toggleSelectedPlaceNameHistory() {
    const historyPanel = document.getElementById('selected-place-name-history');
    const historyButton = document.getElementById('selected-place-history-btn');
    if (!historyPanel || !historyButton) return;

    const isExpanded = !historyPanel.classList.contains('hidden');
    historyPanel.classList.toggle('hidden', isExpanded);
    historyButton.setAttribute('aria-expanded', String(!isExpanded));
    historyButton.textContent = isExpanded ? '歷史沿革' : '收合歷史沿革';
}

function openRecordingUI(place, element) {
    if (pendingUploadJob) {
        alert('目前有一筆待完成的音檔上傳，請先重試或重新選擇音檔。');
        return;
    }
    state.selectedPlace = place;
    document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    const recSection = document.getElementById('recording-section');
    recSection.style.display = 'block';
    document.getElementById('selected-place-title').innerText = `📍 正在處理：${place.placeName}`;
    const infoPanel = document.getElementById('selected-place-info');
    const infoRow = document.getElementById('selected-place-info-row');
    const infoContent = document.getElementById('selected-place-info-content');
    const locationRow = document.getElementById('selected-place-location-row');
    const locationContent = document.getElementById('selected-place-location-content');
    const historyButton = document.getElementById('selected-place-history-btn');
    const locationButton = document.getElementById('selected-place-location-btn');
    const historyPanel = document.getElementById('selected-place-name-history');
    const info = String(place.info || '').trim();
    const location = String(place.location || '').trim();
    const nameHistory = String(place.nameHistory || '').trim();
    const canOpenMap = canShowPlaceMapButton(place);
    if (infoPanel && infoRow && infoContent && locationRow && locationContent && historyButton && locationButton && historyPanel) {
        infoContent.textContent = info;
        locationContent.textContent = location;
        historyPanel.textContent = nameHistory;
        historyPanel.classList.add('hidden');
        infoRow.classList.toggle('hidden', !info);
        locationRow.classList.toggle('hidden', !location);
        historyButton.classList.toggle('hidden', !nameHistory);
        locationButton.classList.toggle('hidden', !canOpenMap);
        historyButton.setAttribute('aria-expanded', 'false');
        historyButton.textContent = '歷史沿革';
        infoPanel.classList.toggle('hidden', !info && !location && !nameHistory && !canOpenMap);
    }
    
    resetRecordingState(getDefaultAnnotationLanguage(place)); renderHistoryList(place.id);
    updatePlaceMapSelection(place);
    recSection.scrollIntoView({ behavior: 'smooth' });
}

function closeRecordingUI() {
    state.selectedPlace = null;
    document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
    const recSection = document.getElementById('recording-section');
    if (recSection) recSection.style.display = 'none';
    if (state.placeMap.isOpen) {
        hideSelectedMapCard();
        renderPlaceMapMarkers({ preserveView: true });
    }
}

function renderHistoryList(placeId) {
    const historyList = document.getElementById('history-list');
    const records = state.uploadedRecords.filter(r => String(r.placeId) === String(placeId));
    
    if (records.length === 0) return historyList.innerHTML = "<div style='color:#999; text-align:center;'>尚未有任何錄音。</div>";
    
    historyList.innerHTML = records.map(r => {
        const canEdit = isCurrentUserIdentifier(r.uploaderId);
        return `
        <div class="history-item">
            <div class="history-meta"><span>🏷️ ${r.language}</span><span title="${escapeHtml(getUserEmail(r.uploaderId))}">👤 ${escapeHtml(getUserDisplayName(r.uploaderId))}</span></div>
            ${renderLinkedAudioNotice(r)}
            ${renderAnnotationSummary(r.annotations)}
            ${canEdit ? `<button class="record-edit-btn" type="button" onclick="openRecordAnnotationEditor('${escapeJsString(r.recordId)}')">編輯文字</button>` : ''}
            ${state.userRole === 'admin' ? `<button class="record-link-btn" type="button" onclick="openAudioLinkDialog('${escapeJsString(r.recordId)}')">連結到其他地名</button>` : ''}
            ${state.userRole === 'admin' ? `<button class="record-unlink-btn" type="button" onclick="unlinkAudioRecordFromPlace('${escapeJsString(r.recordId)}')">移除錯誤連結</button>` : ''}
            <div id="${escapeHtml(getRecordEditorId(r.recordId))}" class="record-edit-panel hidden"></div>
            <div id="player-${r.recordId}" style="margin-top: 10px;">
                <button class="play-btn" onclick="fetchAndPlayAudio('${r.url}', '${r.recordId}')">▶️ 點此從雲端載入音檔並播放</button>
            </div>
        </div>
    `;
    }).join('');
}

function renderLinkedAudioNotice(record) {
    if (!record || !record.linkMeta) return '';
    const sourceRecord = record.linkMeta.sourceRecordId ? `#${record.linkMeta.sourceRecordId}` : '';
    const sourcePlace = record.linkMeta.sourcePlaceName || '';
    const sourceText = [sourcePlace, sourceRecord].filter(Boolean).join(' ');
    return `<div class="linked-audio-notice">共用來源音檔${sourceText ? `：${escapeHtml(sourceText)}` : ''}</div>`;
}

function getAllKnownPlacesForAudioLinking() {
    const seen = new Set();
    return state.assignedPlaces
        .concat(state.allPlaces || [], state.reviewQueue || [])
        .filter(place => {
            const id = String(place?.id ?? '');
            if (!id || seen.has(id)) return false;
            seen.add(id);
            return true;
        });
}

function recordAlreadyLinkedToPlace(record, placeId) {
    return state.uploadedRecords.some(existing =>
        String(existing.placeId) === String(placeId) &&
        String(existing.url || '') === String(record.url || '') &&
        existing.language === record.language
    );
}

function getAudioLinkCandidatePlaces(record) {
    return getAllKnownPlacesForAudioLinking()
        .filter(place => String(place.id) !== String(record.placeId));
}

function getAudioLinkFilterOptions(record) {
    const candidates = getAudioLinkCandidatePlaces(record);
    const counties = [...new Set(candidates.map(place => place.county).filter(Boolean))].sort();
    const assigneeValues = new Set();
    candidates.forEach(place => {
        normalizeAssignedUsers(place.assignedUsers, place.assignedTo).forEach(value => assigneeValues.add(value));
        if (place.tAssignee) assigneeValues.add(place.tAssignee);
        if (place.hAssignee) assigneeValues.add(place.hAssignee);
    });
    const users = mergeUserRecords([...(state.allUserRecords || []), ...(state.allUsers || [])])
        .filter(user => user.role !== 'admin')
        .map(user => ({
            value: getUserAnnotatorName(user),
            label: user.name || user.account || user.email || getUserAnnotatorName(user),
            title: getUserHoverTitle(user)
        }))
        .filter(user => user.value && assigneeValues.has(user.value));
    const knownValues = new Set(users.map(user => user.value));
    assigneeValues.forEach(value => {
        if (!knownValues.has(value)) {
            users.push({
                value,
                label: getUserDisplayName(value),
                title: getUserEmail(value)
            });
        }
    });
    users.sort((a, b) => String(a.label).localeCompare(String(b.label), 'zh-Hant'));
    return { counties, users };
}

function getAudioLinkPlayerId(recordId) {
    return `audio-link-player-${String(recordId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

async function appendLinkedAudioRecordsToSheet(records) {
    const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
            action: 'linkAudioRecords',
            records
        })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.error || 'Google Sheet audio record append failed');
    return result;
}

async function unlinkAudioRecordFromPlace(recordId) {
    if (state.userRole !== 'admin') return;
    const record = findUploadedRecord(recordId);
    if (!record) return alert('找不到這筆錄音紀錄。');

    const place = getPlaceByTaskId(record.placeId);
    const placeName = place ? place.placeName : record.placeId;
    const reason = prompt('請輸入移除原因（可留空）：', '音檔上傳到錯誤地名');
    if (reason === null) return;
    const adminPassword = prompt('請輸入管理員密碼以移除這筆錯誤地名連結');
    if (!adminPassword) return;
    if (!confirm(`確定要移除「${placeName}」與這筆 ${record.language} 音檔的連結嗎？\n\n音檔與上傳紀錄會保留，只是不再算在這個地名底下。`)) return;

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'unlinkAudioRecord',
                recordId: Number(record.recordId),
                actorAccount: state.userId || state.userEmail || '',
                adminPassword,
                reason
            })
        });
        const result = await response.json();
        if (!result.success) throw new Error(result.error || 'unlink failed');

        state.uploadedRecords = state.uploadedRecords.filter(item => String(item.recordId) !== String(recordId));
        refreshPlaceRecordingStatus(place, record.language, -1);
        if (state.selectedPlace) renderHistoryList(state.selectedPlace.id);
        applyFilters();
        alert('已移除錯誤地名連結。音檔與原始上傳紀錄仍保留。');
    } catch (err) {
        console.error('移除音檔連結失敗:', err);
        alert(`移除音檔連結失敗：${err.message}`);
    }
}

function openAudioLinkDialog(recordId) {
    if (state.userRole !== 'admin') return;
    const record = findUploadedRecord(recordId);
    if (!record) return alert('找不到這筆錄音紀錄。');

    closeAudioLinkDialog();
    const sourcePlace = getPlaceByTaskId(record.placeId);
    const filterOptions = getAudioLinkFilterOptions(record);
    const playerId = getAudioLinkPlayerId(recordId);
    const dialog = document.createElement('div');
    dialog.id = 'audio-link-dialog';
    dialog.className = 'dialog-backdrop';
    dialog.innerHTML = `
        <div class="dialog-panel audio-link-dialog-panel" role="dialog" aria-modal="true" aria-labelledby="audio-link-title">
            <h3 id="audio-link-title">連結音檔到其他地名</h3>
            <p>來源：${escapeHtml(sourcePlace?.placeName || record.placeId)}｜${escapeHtml(record.language)}｜${escapeHtml(getUserDisplayName(record.uploaderId))}</p>
            <div class="audio-link-player-panel">
                <button class="play-btn compact" type="button" onclick="fetchAndPlayAudioToContainer('${escapeJsString(record.url)}', '${escapeJsString(playerId)}')">播放來源音檔</button>
                <div id="${escapeHtml(playerId)}" class="audio-link-player"></div>
            </div>
            <div class="audio-link-filters">
                <select id="audio-link-county-filter" onchange="renderAudioLinkTargetRows('${escapeJsString(recordId)}')">
                    <option value="">全部縣市</option>
                    ${filterOptions.counties.map(county => `<option value="${escapeHtml(county)}">${escapeHtml(county)}</option>`).join('')}
                </select>
                <select id="audio-link-assignee-filter" onchange="renderAudioLinkTargetRows('${escapeJsString(recordId)}')">
                    <option value="">全部調查員</option>
                    ${filterOptions.users.map(user => `<option value="${escapeHtml(user.value)}" title="${escapeHtml(user.title || '')}">${escapeHtml(user.label)}</option>`).join('')}
                </select>
                <input id="audio-link-search" type="text" placeholder="搜尋地名、UUID、鄉鎮、類型" oninput="renderAudioLinkTargetRows('${escapeJsString(recordId)}')">
            </div>
            <div id="audio-link-targets" class="audio-link-targets"></div>
            <div id="audio-link-status" class="user-edit-status" aria-live="polite"></div>
            <div class="dialog-actions">
                <button class="btn-secondary" type="button" onclick="closeAudioLinkDialog()">取消</button>
                <button class="btn-primary" id="audio-link-submit-btn" type="button" onclick="submitAudioLink('${escapeJsString(recordId)}')">建立連結</button>
            </div>
        </div>
    `;
    dialog.addEventListener('click', event => {
        if (event.target === dialog) closeAudioLinkDialog();
    });
    document.body.appendChild(dialog);
    renderAudioLinkTargetRows(recordId);
    document.getElementById('audio-link-search')?.focus();
}

function closeAudioLinkDialog() {
    document.getElementById('audio-link-dialog')?.remove();
}

function renderAudioLinkTargetRows(recordId) {
    const record = findUploadedRecord(recordId);
    const container = document.getElementById('audio-link-targets');
    if (!record || !container) return;

    const query = String(document.getElementById('audio-link-search')?.value || '').trim().toLowerCase();
    const county = document.getElementById('audio-link-county-filter')?.value || '';
    const assignee = document.getElementById('audio-link-assignee-filter')?.value || '';
    const rows = getAudioLinkCandidatePlaces(record)
        .filter(place => !county || place.county === county)
        .filter(place => !assignee || placeMatchesAssigneeFilter(place, assignee))
        .filter(place => {
            if (!query) return true;
            return [
                place.placeName,
                place.sourceId,
                place.id,
                place.town,
                place.type
            ].filter(Boolean).join(' ').toLowerCase().includes(query);
        })
        .slice(0, 80);

    if (rows.length === 0) {
        container.innerHTML = '<div class="audio-link-empty">沒有符合的地名。</div>';
        return;
    }

    container.innerHTML = rows.map(place => {
        const duplicated = recordAlreadyLinkedToPlace(record, place.id);
        const uuid = place.sourceId || place.id;
        const counts = `台 ${Number(place.taiAudioCount || 0)} / 客 ${Number(place.hakAudioCount || 0)}`;
        return `
            <label class="audio-link-target-row ${duplicated ? 'disabled' : ''}">
                <input class="audio-link-target" type="checkbox" value="${escapeHtml(place.id)}" ${duplicated ? 'disabled' : ''}>
                <span>
                    <strong>${escapeHtml(place.placeName)}</strong>
                    <small>${escapeHtml(uuid)}｜${escapeHtml(place.county || '')} ${escapeHtml(place.town || '')}｜${counts}${duplicated ? '｜已連結' : ''}</small>
                </span>
            </label>
        `;
    }).join('');
}

async function submitAudioLink(recordId) {
    if (state.userRole !== 'admin') return;
    const record = findUploadedRecord(recordId);
    if (!record) return alert('找不到這筆錄音紀錄。');

    const selectedIds = Array.from(document.querySelectorAll('.audio-link-target:checked'))
        .map(input => input.value)
        .filter(Boolean);
    if (selectedIds.length === 0) return alert('請先選擇要連結的地名。');

    const targets = selectedIds
        .map(id => getPlaceByTaskId(id))
        .filter(Boolean)
        .filter(place => !recordAlreadyLinkedToPlace(record, place.id));
    if (targets.length === 0) return alert('選取的地名都已經連結過這個音檔。');

    const button = document.getElementById('audio-link-submit-btn');
    const status = document.getElementById('audio-link-status');
    if (button) {
        button.disabled = true;
        button.innerText = '建立中...';
    }
    if (status) status.innerText = '';

    const sourcePlace = getPlaceByTaskId(record.placeId);
    const linkMeta = {
        sourceRecordId: record.recordId,
        sourceTaskId: record.placeId,
        sourcePlaceName: sourcePlace?.placeName || '',
        linkedBy: state.userId || state.userEmail || state.userName || '',
        linkedAt: new Date().toISOString()
    };
    const rows = targets.map(place => ({
        task_id: place.id,
        recorder_name: record.uploaderId,
        audio_file_id: record.url,
        phonetic_reading: record.phonetic || '',
        language: record.language,
        note: JSON.stringify(buildRecordNotePayload(record.annotations || {}, linkMeta, record.respondentKey || ''))
    }));

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/audio_records`, {
            method: 'POST',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
            },
            body: JSON.stringify(rows)
        });
        if (!response.ok) throw new Error(await response.text());

        const insertedRows = await response.json();
        const sheetRows = [];
        rows.forEach((row, index) => {
            const inserted = Array.isArray(insertedRows) ? insertedRows[index] : null;
            const target = targets[index];
            const insertedRecordId = inserted?.id || `${record.recordId}-link-${target.id}`;
            state.uploadedRecords.push({
                recordId: insertedRecordId,
                placeId: target.id,
                language: record.language,
                uploaderId: record.uploaderId,
                phonetic: record.phonetic || '',
                url: record.url,
                createdAt: inserted?.created_at || new Date().toISOString(),
                annotations: { ...(record.annotations || {}) },
                linkMeta
            });
            sheetRows.push({
                recordId: insertedRecordId,
                placeId: target.id,
                sourceId: target.sourceId || '',
                placeName: target.placeName || '',
                language: record.language,
                uploaderId: record.uploaderId,
                phonetic: record.phonetic || '',
                url: record.url
            });
            refreshPlaceRecordingStatus(target, record.language);
        });

        let sheetWarning = '';
        try {
            await appendLinkedAudioRecordsToSheet(sheetRows);
        } catch (sheetErr) {
            console.error('Google Sheet 音檔紀錄寫入失敗:', sheetErr);
            sheetWarning = `\n\nGoogle Sheet 的 Records 分頁寫入失敗，Supabase 已建立紀錄。請稍後補同步或檢查 GAS：${sheetErr.message}`;
        }

        if (state.selectedPlace) renderHistoryList(state.selectedPlace.id);
        applyFilters();
        closeAudioLinkDialog();
        alert(`已建立 ${targets.length} 筆音檔連結。${sheetWarning}`);
    } catch (err) {
        console.error('建立音檔連結失敗:', err);
        if (status) status.innerText = `建立失敗：${err.message}`;
        if (button) {
            button.disabled = false;
            button.innerText = '建立連結';
        }
    }
}

function getRecordEditorId(recordId) {
    return `record-edit-${String(recordId || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getRecordEditInputId(recordId, fieldKey) {
    return `${getRecordEditorId(recordId)}-${String(fieldKey || '').replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function findUploadedRecord(recordId) {
    return state.uploadedRecords.find(record => String(record.recordId) === String(recordId)) || null;
}

function getRecordEditableFields(record) {
    return REVIEW_FIELD_CONFIG[getRecordLanguageKey(record)].fields;
}

function openRecordAnnotationEditor(recordId) {
    const record = findUploadedRecord(recordId);
    if (!record) return alert('找不到這筆錄音紀錄。');
    if (!isCurrentUserIdentifier(record.uploaderId)) return alert('只有原上傳者可以編輯這筆錄音的文字欄位。');

    const panel = document.getElementById(getRecordEditorId(recordId));
    if (!panel) return;
    const fields = getRecordEditableFields(record);
    const annotations = record.annotations || {};
    panel.innerHTML = `
        <div class="record-edit-title">${escapeHtml(record.language)}文字欄位</div>
        <div class="record-edit-grid">
            ${fields.map(field => {
                const annotationKey = getPrimaryAnnotationKey(field);
                const value = annotations[annotationKey] || '';
                const inputId = getRecordEditInputId(recordId, field.key);
                const input = field.multiline
                    ? `<textarea id="${escapeHtml(inputId)}" rows="2">${escapeHtml(value)}</textarea>`
                    : `<input id="${escapeHtml(inputId)}" type="text" value="${escapeHtml(value)}">`;
                return `
                    <label class="record-edit-field">
                        <span>${escapeHtml(field.label)}</span>
                        ${input}
                    </label>
                `;
            }).join('')}
        </div>
        <div class="record-edit-actions">
            <button class="record-save-btn" type="button" onclick="saveRecordAnnotationEdit('${escapeJsString(recordId)}', this)">儲存文字</button>
            <button class="record-cancel-btn" type="button" onclick="closeRecordAnnotationEditor('${escapeJsString(recordId)}')">取消</button>
        </div>
    `;
    panel.classList.remove('hidden');
}

function closeRecordAnnotationEditor(recordId) {
    const panel = document.getElementById(getRecordEditorId(recordId));
    if (!panel) return;
    panel.classList.add('hidden');
    panel.innerHTML = '';
}

function collectRecordAnnotationEdit(record) {
    const updated = { ...(record.annotations || {}) };
    getRecordEditableFields(record).forEach(field => {
        const input = document.getElementById(getRecordEditInputId(record.recordId, field.key));
        updated[getPrimaryAnnotationKey(field)] = input ? input.value.trim() : '';
    });
    return updated;
}

async function saveRecordAnnotationEdit(recordId, button) {
    const record = findUploadedRecord(recordId);
    if (!record) return alert('找不到這筆錄音紀錄。');
    if (!isCurrentUserIdentifier(record.uploaderId)) return alert('只有原上傳者可以編輯這筆錄音的文字欄位。');

    const originalText = button ? button.innerText : '';
    if (button) {
        button.disabled = true;
        button.innerText = '儲存中...';
    }

    const annotations = collectRecordAnnotationEdit(record);
    const phonetic = record.language === '台語' ? annotations.tl1 : annotations.hp1;

    try {
        const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/audio_records?id=eq.${encodeURIComponent(record.recordId)}&recorder_name=eq.${encodeURIComponent(record.uploaderId)}`, {
            method: 'PATCH',
            headers: {
                'apikey': CONFIG.SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
                phonetic_reading: phonetic || '',
                note: JSON.stringify(buildRecordNotePayload(annotations, record.linkMeta || null))
            })
        });

        if (!response.ok) throw new Error(await response.text());

        record.annotations = annotations;
        record.phonetic = phonetic || '';
        renderHistoryList(record.placeId);
        alert('文字欄位已更新。');
    } catch (err) {
        console.error('更新錄音文字欄位失敗:', err);
        alert(`更新失敗：${err.message}`);
        if (button) {
            button.disabled = false;
            button.innerText = originalText || '儲存文字';
        }
    }
}

async function fetchAndPlayAudio(driveUrl, recordId) {
    const target = String(recordId || '');
    const containerId = target.startsWith('review-audio-') ? target : `player-${target}`;
    return fetchAndPlayAudioToContainer(driveUrl, containerId);
}

const AUDIO_MIME_TYPES_BY_EXTENSION = Object.freeze({
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
});

function resolveAudioMimeType(fileName = '', mimeType = '') {
    const normalizedMimeType = String(mimeType).split(';')[0].trim().toLowerCase();
    const mimeAliases = {
        'audio/x-aac': 'audio/aac',
        'audio/vnd.dlna.adts': 'audio/aac',
        'audio/x-m4a': 'audio/mp4',
        'audio/x-wav': 'audio/wav'
    };
    const canonicalMimeType = mimeAliases[normalizedMimeType] || normalizedMimeType;
    if (canonicalMimeType.startsWith('audio/')) return canonicalMimeType;
    const extension = String(fileName).split('.').pop().toLowerCase();
    return AUDIO_MIME_TYPES_BY_EXTENSION[extension] || canonicalMimeType || 'application/octet-stream';
}
function normalizeAudioDataUrl(dataUrl, fileName = '', mimeType = '') {
    const value = String(dataUrl || '');
    const currentMimeType = value.match(/^data:([^;,]+)/i)?.[1] || '';
    const resolvedMimeType = resolveAudioMimeType(fileName, mimeType || currentMimeType);
    return value.replace(/^data:[^;,]*/i, `data:${resolvedMimeType}`);
}

async function fetchAndPlayAudioToContainer(driveUrl, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = "<span style='color:#e67e22; font-weight:bold;'>⏳ 檔案載入中，請稍候...</span>";
    try {
        const response = await fetch(API_URL, {
            method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ action: 'getAudio', url: driveUrl })
        });
        const result = await response.json();
        if (result.success) {
            const audio = document.createElement('audio');
            audio.src = normalizeAudioDataUrl(result.dataUrl, result.fileName, result.mimeType);
            audio.controls = true;
            audio.autoplay = true;
            audio.style.width = '100%';
            audio.style.height = '35px';
            audio.addEventListener('error', () => {
                container.innerHTML = '<span style="color:red;">\u274c \u700f\u89bd\u5668\u7121\u6cd5\u89e3\u78bc\u9019\u7b46\u97f3\u6a94\uff0c\u8acb\u78ba\u8a8d\u6a94\u6848\u672a\u640d\u58de\u5f8c\u518d\u8a66\u4e00\u6b21\u3002</span>';
            }, { once: true });
            container.replaceChildren(audio);
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
function resetRecordingState(preferredLanguage = getDefaultAnnotationLanguage()) {
    const respondentInput = document.getElementById('respondent-key-input');
    if (respondentInput) respondentInput.value = '';
    resetAnnotationInputs();
    switchAnnotationLanguage(preferredLanguage);
    const confirmPanel = document.getElementById('audio-confirm-panel');
    const summary = document.getElementById('audio-file-summary');
    document.querySelector('.audio-source-panel')?.classList.remove('hidden');
    if (confirmPanel) confirmPanel.classList.add('hidden');
    if (summary) summary.innerHTML = '';
    document.getElementById('audio-playback').style.display = 'none';
    document.getElementById('upload-btn').style.display = 'none';
    document.getElementById('status').innerText = "";
    document.getElementById('start-btn').style.display = 'block';
    document.getElementById('file-btn').style.display = 'block';
    document.getElementById('audio-file-input').value = ""; 
    audioBlob = null;
    uploadedFileName = "";
    audioChunks = [];
    mediaRecorder = null;
    recordingStream = null;
}

function toggleLineHelp() {
    document.getElementById('line-help-box')?.classList.toggle('hidden');
}

function formatFileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getCurrentLanguageLabel() {
    return document.querySelector('input[name="lang"]:checked')?.value || '';
}

function showAudioConfirmation(sourceLabel, file) {
    const confirmPanel = document.getElementById('audio-confirm-panel');
    const summary = document.getElementById('audio-file-summary');
    const playback = document.getElementById('audio-playback');
    const uploadBtn = document.getElementById('upload-btn');
    const placeName = state.selectedPlace ? state.selectedPlace.placeName : '未選擇地名';
    const lang = getCurrentLanguageLabel();
    const fileName = file ? file.name : '現場錄音';
    const fileSize = file ? formatFileSize(file.size) : '';

    if (summary) {
        summary.innerHTML = `
            <div><span>目前地名</span><strong>${escapeHtml(placeName)}</strong></div>
            <div><span>錄音語言</span><strong>${escapeHtml(lang)}</strong></div>
            <div><span>音檔來源</span><strong>${escapeHtml(sourceLabel)}</strong></div>
            <div><span>音檔名稱</span><strong>${escapeHtml(fileName)}${fileSize ? ` (${escapeHtml(fileSize)})` : ''}</strong></div>
        `;
    }

    if (confirmPanel) confirmPanel.classList.remove('hidden');
    document.querySelector('.audio-source-panel')?.classList.add('hidden');
    if (playback) playback.style.display = 'block';
    if (uploadBtn) {
        uploadBtn.style.display = 'block';
        uploadBtn.disabled = false;
        uploadBtn.innerText = '⬆️ 確認上傳這筆音檔';
    }
    document.getElementById('start-btn').style.display = 'none';
    document.getElementById('file-btn').style.display = 'none';
}

function chooseAudioAgain() {
    audioBlob = null;
    uploadedFileName = "";
    document.getElementById('audio-confirm-panel')?.classList.add('hidden');
    document.getElementById('audio-playback').style.display = 'none';
    document.querySelector('.audio-source-panel')?.classList.remove('hidden');
    document.getElementById('audio-file-input').value = "";
    document.getElementById('audio-file-input').click();
}

function discardAudioAndRecordAgain() {
    resetRecordingState();
    startRecording();
}

function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(mp3|m4a|wav|aac|ogg|mp4|3gp|3gpp|amr|opus|caf)$/i)) {
        event.target.value = '';
        return alert('這個檔案不像音檔。請從 LINE 重新分享或儲存語音檔，再回來選擇。');
    }
    const normalizedMimeType = resolveAudioMimeType(file.name, file.type);
    audioBlob = file.type === normalizedMimeType ? file : new Blob([file], { type: normalizedMimeType });
    uploadedFileName = file.name;
    document.getElementById('audio-playback').src = URL.createObjectURL(audioBlob);
    showAudioConfirmation('LINE/手機音檔', file);
    document.getElementById('status').innerText = '已選擇音檔：' + file.name + '，請先播放確認再上傳。';
    document.getElementById('status').style.color = 'green';
}
function getPreferredRecordingMimeType() {
    const recorder = window.MediaRecorder;
    if (!recorder || typeof recorder.isTypeSupported !== 'function') return '';
    return ['audio/mp4', 'audio/aac', 'audio/webm', 'audio/ogg']
        .find(mimeType => recorder.isTypeSupported(mimeType)) || '';
}

function getAudioExtensionForMimeType(mimeType, fileName = '') {
    const normalized = resolveAudioMimeType(fileName, mimeType);
    const extensions = {
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
    if (extensions[normalized]) return extensions[normalized];
    const fallback = String(fileName || '').match(/\.([a-z0-9]+)$/i);
    return fallback ? fallback[1].toLowerCase() : 'webm';
}

async function startRecording() {
    const status = document.getElementById('status');
    const showFallback = message => {
        if (status) {
            status.innerText = message;
            status.style.color = 'red';
        }
        document.querySelector('.audio-source-panel')?.classList.remove('hidden');
        document.getElementById('file-btn').style.display = 'block';
    };

    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        showFallback('❌ 不支援現場錄音，請改用上傳音檔。');
        return;
    }
    const preferredMimeType = getPreferredRecordingMimeType();
    if (typeof window.MediaRecorder.isTypeSupported === 'function' && !preferredMimeType) {
        showFallback('❌ 此瀏覽器沒有可用的錄音格式，請改用上傳音檔。');
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recordingStream = stream;
        const options = preferredMimeType ? { mimeType: preferredMimeType } : undefined;
        mediaRecorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
        audioChunks = [];
        const recorder = mediaRecorder;
        recorder.ondataavailable = event => {
            if (event.data && event.data.size !== 0) audioChunks.push(event.data);
        };
        recorder.onstop = () => {
            const actualMimeType = resolveAudioMimeType(
                '',
                recorder.mimeType || audioChunks.find(chunk => chunk.type)?.type || preferredMimeType || 'audio/webm'
            );
            audioBlob = new Blob(audioChunks, { type: actualMimeType });
            uploadedFileName = '現場錄音.' + getAudioExtensionForMimeType(actualMimeType);
            document.getElementById('audio-playback').src = URL.createObjectURL(audioBlob);
            showAudioConfirmation('現場錄音', null);
        };
        recorder.start();
        document.querySelector('.audio-source-panel')?.classList.add('hidden');
        document.getElementById('start-btn').style.display = 'none';
        document.getElementById('file-btn').style.display = 'none';
        document.getElementById('stop-btn').style.display = 'block';
        if (status) {
            status.innerText = '🔴 現場錄音中...';
            status.style.color = 'red';
        }
    } catch (error) {
        const denied = error && (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError');
        showFallback(denied
            ? '❌ 麥克風權限被拒絕，請改用上傳音檔。'
            : '❌ 無法使用現場錄音，請改用上傳音檔。');
    }
}

function stopRecording() {
    const recorder = mediaRecorder;
    const stream = recordingStream || recorder?.stream;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
    document.getElementById('stop-btn').style.display = 'none';
    document.getElementById('status').innerText = '錄音完成，請先播放確認。可以重錄，也可以直接上傳。';
    document.getElementById('status').style.color = 'green';
    stream?.getTracks().forEach(track => track.stop());
    recordingStream = null;
}
// ==========================================
// 🌟 核心修改 2：上傳音檔至 GAS + 紀錄寫入 Supabase
// ==========================================
function createClientUploadId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    window.crypto?.getRandomValues?.(bytes);
    if (!bytes.some(Boolean)) {
        for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return hex.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

function readBlobAsDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('音檔讀取失敗'));
        reader.readAsDataURL(blob);
    });
}

function createUploadJobSnapshot() {
    const place = state.selectedPlace;
    const blob = audioBlob;
    const language = getCurrentLanguageLabel();
    const annotations = collectAnnotationInputs();
    const mimeType = resolveAudioMimeType(uploadedFileName, blob?.type || '');
    const extension = getAudioExtensionForMimeType(mimeType, uploadedFileName);
    const originalFileName = uploadedFileName || '現場錄音.' + extension;
    const recorderAccount = state.userId || state.userEmail || '';
    const recorderName = getUserAnnotatorName(recorderAccount) || state.userName || recorderAccount;
    const clientUploadId = createClientUploadId();
    return Object.freeze({
        clientUploadId,
        requestId: clientUploadId,
        taskId: String(place.id),
        sourceId: place.sourceId || '',
        placeName: place.placeName || '',
        language,
        phonetic: language === '台語' ? annotations.tl1 : annotations.hp1,
        annotations: { ...annotations },
        respondentKey: document.getElementById('respondent-key-input')?.value.trim() || '',
        recorderAccount,
        recorderName,
        uploadSource: uploadedFileName ? 'file' : 'recording',
        originalFileName,
        mimeType,
        fileSizeBytes: Number(blob?.size || 0),
        audioBlob: blob
    });
}

function createUploadPayload(job, audioBase64) {
    const extension = getAudioExtensionForMimeType(job.mimeType, job.originalFileName);
    const filename = 'Record_' + job.taskId + '_' + job.clientUploadId + '.' + extension;
    return {
        action: 'upload',
        requestId: job.requestId,
        clientUploadId: job.clientUploadId,
        userId: job.recorderAccount,
        taskId: job.taskId,
        placeId: job.taskId,
        sourceId: job.sourceId,
        placeName: job.placeName,
        language: job.language,
        phonetic: job.phonetic,
        note: JSON.stringify(buildRecordNotePayload(job.annotations, null, job.respondentKey)),
        annotations: job.annotations,
        respondentKey: job.respondentKey,
        recorderAccount: job.recorderAccount,
        recorderName: job.recorderName,
        uploadSource: job.uploadSource,
        originalFileName: job.originalFileName,
        mimeType: job.mimeType,
        fileSizeBytes: job.fileSizeBytes,
        filename,
        audioBase64
    };
}

function addUploadedRecordFromJob(job, recordData) {
    const recordId = recordData?.id || recordData?.recordId;
    if (!recordId) throw new Error('伺服器未回傳正式 audio_records id');
    const placeId = String(recordData.taskId ?? job.taskId);
    const url = recordData.url || recordData.audioFileId || '';
    const uploaderId = recordData.recorderAccount || job.recorderAccount || recordData.recorderName || job.recorderName;
    const record = {
        recordId,
        placeId,
        language: recordData.language || job.language,
        uploaderId,
        phonetic: recordData.phonetic || job.phonetic,
        url,
        createdAt: recordData.createdAt || recordData.created_at || new Date().toISOString(),
        annotations: { ...job.annotations },
        respondentKey: job.respondentKey,
        linkMeta: null
    };
    if (!state.uploadedRecords.some(existing => String(existing.recordId) === String(recordId))) {
        state.uploadedRecords.push(record);
    }
    if (state.userRole === 'admin' && !state.uploadReportRecords.some(existing => String(existing.recordId) === String(recordId))) {
        state.uploadReportRecords.push({ ...record, unlinkedAt: null });
    }
    return record;
}

async function executeUploadJob(job) {
    if (!job || uploadInProgress) return;
    uploadInProgress = true;
    const uploadBtn = document.getElementById('upload-btn');
    const statusDiv = document.getElementById('status');
    if (uploadBtn) {
        uploadBtn.disabled = true;
        uploadBtn.innerText = '⏳ 上傳音檔中...';
    }
    if (statusDiv) {
        statusDiv.innerText = '⏳ 上傳音檔中，請稍候...';
        statusDiv.style.color = 'green';
    }

    try {
        const audioBase64 = await readBlobAsDataUrl(job.audioBlob);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(createUploadPayload(job, audioBase64))
        });
        let result;
        try {
            result = await response.json();
        } catch (parseError) {
            throw new Error('伺服器回應遺失，請使用相同 request ID 重試');
        }
        if (!response.ok || !result.success) {
            const error = new Error(result.message || result.error || '音檔上傳失敗');
            error.stage = result.stage || 'VALIDATION';
            error.code = result.code || 'UPLOAD_FAILED';
            error.retryable = result.retryable !== false;
            throw error;
        }

        const recordData = result.recordData || {};
        addUploadedRecordFromJob(job, recordData);
        const place = getPlaceByTaskId(job.taskId) || state.selectedPlace;
        if (place) refreshPlaceRecordingStatus(place, job.language);
        if (place && state.selectedPlace && String(state.selectedPlace.id) === String(job.taskId)) {
            renderHistoryList(job.taskId);
        }
        applyFilters();
        pendingUploadJob = null;
        const warning = recordData.legacyLogPending ? '；Records 尚待補寫' : '';
        resetRecordingState();
        if (statusDiv) {
            statusDiv.innerText = '🎉 錄音上傳完成' + warning + '！';
            statusDiv.style.color = recordData.legacyLogPending ? '#e67e22' : 'blue';
        }
    } catch (error) {
        if (statusDiv) {
            statusDiv.innerText = '❌ 上傳失敗：' + error.message + '（可重試，request ID：' + job.clientUploadId + '）';
            statusDiv.style.color = 'red';
        }
        if (uploadBtn) {
            uploadBtn.innerText = '🔁 重試這筆上傳';
            uploadBtn.disabled = false;
        }
    } finally {
        uploadInProgress = false;
        if (uploadBtn && !pendingUploadJob) uploadBtn.disabled = false;
    }
}

function uploadAudio() {
    if (pendingUploadJob) {
        executeUploadJob(pendingUploadJob);
        return;
    }
    if (!audioBlob || !state.selectedPlace) return;

    const lang = getCurrentLanguageLabel();
    const annotations = collectAnnotationInputs();
    const hasAnnotation = Object.values(annotations).some(value => value);
    const uploadScopeWarning = getUploadScopeWarning(state.selectedPlace, lang);
    const baseConfirmText = hasAnnotation
        ? '你正在上傳「' + state.selectedPlace.placeName + '」的' + lang + '音檔，確定送出嗎？'
        : '這筆「' + state.selectedPlace.placeName + '」的' + lang + '音檔還沒有填文字註記，要直接送出錄音嗎？';
    const confirmText = uploadScopeWarning
        ? uploadScopeWarning + '\n\n' + baseConfirmText
        : baseConfirmText;
    if (!confirm(confirmText)) return;

    pendingUploadJob = createUploadJobSnapshot();
    const uploadBtn = document.getElementById('upload-btn');
    if (uploadBtn) {
        uploadBtn.innerText = '⏳ 準備上傳...';
        uploadBtn.disabled = true;
    }
    executeUploadJob(pendingUploadJob);
}
function toggleAdminAssignPanel() {
    const bar = document.getElementById('admin-assign-bar');
    const button = document.getElementById('admin-assign-toggle');
    if (!bar || !button || !bar.classList.contains('has-selection')) return;
    const shouldOpen = !bar.classList.contains('is-open');
    bar.classList.toggle('is-open', shouldOpen);
    button.setAttribute('aria-expanded', String(shouldOpen));
}

// 🌟 更新版：繪製底部批次指派工具列
function renderAdminBatchAssignUI() {
    if (state.userRole !== 'admin') return;
    
    let bar = document.getElementById('admin-assign-bar');
    const wasOpen = bar?.classList.contains('is-open') || false;
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'admin-assign-bar';
        document.body.appendChild(bar);
    }
    bar.style.display = 'flex';
    bar.classList.toggle('is-open', wasOpen);
    document.getElementById('app-section').style.paddingBottom = "80px";

    // 🛑 核心修改：改用 state.allUsers 來產生建議選單
    let options = state.allUsers.map(u => `<option value="${escapeHtml(getUserAnnotatorName(u))}" title="${escapeHtml(getUserHoverTitle(u))}">${escapeHtml(u.name || u.account)}</option>`).join('');

    bar.innerHTML = `
        <button id="admin-assign-toggle" class="admin-assign-toggle" type="button" aria-expanded="${wasOpen}" aria-controls="admin-assign-panel" onclick="toggleAdminAssignPanel()">
            <span>批次語種指派</span>
            <span id="admin-assign-toggle-count">0 筆已選</span>
            <span class="admin-assign-toggle-icon" aria-hidden="true">⌃</span>
        </button>
        <span class="assign-label">批次語種指派</span>
        <span id="assign-count" class="assign-count">0 筆已選</span>
        <div id="admin-assign-panel" class="admin-assign-panel">
            <select id="assignment-language-input" aria-label="指派語言">
                <option value="台語">台語</option>
                <option value="客語">客語</option>
            </select>
            <input id="assignee-input-search" type="text" placeholder="搜尋調查員..." aria-label="搜尋調查員" oninput="filterSelectOptions('assignee-input', this.value)">
            <select id="assignee-input" aria-label="選擇調查員">
                <option value="">選擇調查員</option>
                ${options}
            </select>
            <button id="assign-submit-btn" class="assign-submit" onclick="batchAssignTasks()">確認指派</button>
            <button id="unassign-submit-btn" class="unassign-submit" onclick="batchUnassignTasks()">撤回指派</button>
            <span class="assign-hint">Shift + 左鍵可連續選取</span>
        </div>
    `;
    updateSelectedAssignCount();
}

// 🌟 新增：執行批次指派 (寫入 Supabase)
async function batchAssignTasks() {
    // 找出所有被打勾的 checkbox
    const taskIds = getSelectedAdminTaskIds();
    const language = document.getElementById('assignment-language-input').value;
    const targetUser = document.getElementById('assignee-input').value.trim();
    const targetUserName = getUserDisplayName(targetUser);

    if (taskIds.length === 0) return alert("請先在清單中勾選要指派的地名！");
    if (!targetUser) return alert("請輸入或選擇要指派的調查員名稱！");
    if (!confirm(`確定要將勾選的 ${taskIds.length} 筆地名，其${language}指派給「${targetUserName}」嗎？`)) return;

    const button = document.getElementById('assign-submit-btn');
    if (button) {
        button.innerText = "處理中...";
        button.disabled = true;
    }

    try {
        await callAssignTaskLanguageRpc(taskIds, language, targetUser);

        alert(`🎉 ${language}指派成功！`);
        
        await refreshAfterAssignmentChange();

    } catch (err) {
        console.error("指派失敗:", err);
        alert("指派發生錯誤，請稍後再試。");
    } finally {
        renderAdminBatchAssignUI(); // 恢復按鈕文字
    }
}

// 🌟 新增：批次撤回指定調查員的指派
async function batchUnassignTasks() {
    const taskIds = getSelectedAdminTaskIds().map(taskId => Number(taskId));
    const language = document.getElementById('assignment-language-input').value;

    if (taskIds.length === 0) return alert("請先在清單中勾選要撤回指派的地名！");

    const selectedPlaces = taskIds.map(getPlaceByTaskId).filter(Boolean);
    const matchedCount = selectedPlaces.filter(place => getLanguageAssignee(place, language)).length;
    if (matchedCount === 0) {
        return alert(`勾選的地名目前都沒有${language}指派。`);
    }

    const extraNote = matchedCount < taskIds.length
        ? `\n\n其中 ${taskIds.length - matchedCount} 筆目前沒有${language}指派，系統會略過。`
        : '';
    if (!confirm(`確定要撤回 ${matchedCount} 筆地名的${language}指派嗎？${extraNote}`)) return;

    const button = document.getElementById('unassign-submit-btn');
    if (button) {
        button.innerText = "撤回中...";
        button.disabled = true;
    }

    try {
        const changed = await callUnassignTaskLanguageRpc(taskIds, language);
        alert(`已撤回 ${changed} 筆${language}指派。`);
        await refreshAfterAssignmentChange();
    } catch (err) {
        console.error("撤回指派失敗:", err);
        alert(`撤回指派發生錯誤：${err.message}`);
    } finally {
        renderAdminBatchAssignUI();
    }
}

window.addEventListener('DOMContentLoaded', restoreSession);
