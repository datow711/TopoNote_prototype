// 註冊 Service Worker (PWA 必備)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker 註冊成功! PWA 已就緒。'))
            .catch(err => console.log('Service Worker 註冊失敗:', err));
    });
}

const STATUS_FILTER_VALUES = ['未錄音', '台語已有錄音', '客語已有錄音', '台語完成', '客語完成', '全部完成'];

let state = {
    userId: "", assignedPlaces: [], allPlaces: [], uploadedRecords: [], reviewQueue: [],
    userDbId: "",
    userName: "",
    userEmail: "",
    userPhone: "",
    currentTab: 'assigned', 
    selectedPlace: null, 
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
    selectedAssignTaskIds: new Set(),
    allUsers: [], // 🌟 新增這行：用來存放所有調查員名單
    allUserRecords: [],
    adminUserSort: { key: '', direction: 'asc' },
};

let mediaRecorder;
let audioChunks = [];
let audioBlob = null;
let uploadedFileName = ""; 

const SESSION_KEY = 'toponote_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
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
    const approvedCount = state.reviewQueue.reduce((count, place) => {
        const taiApproved = place.tReviewState === '已完成標注' && doesUserMatchIdentifier(user, place.tAssignee);
        const hakApproved = place.hReviewState === '已完成標注' && doesUserMatchIdentifier(user, place.hAssignee);
        return count + (taiApproved ? 1 : 0) + (hakApproved ? 1 : 0);
    }, 0);

    return {
        assignedCount: assignedTaskIds.size,
        recordingCount,
        approvedCount
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
        approved: stats.approvedCount,
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
    const current = state.adminUserSort || { key: '', direction: 'asc' };
    state.adminUserSort = {
        key,
        direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
    };
    renderAdminUserManager();
}

function renderAdminUserSortHeader(label, key) {
    const current = state.adminUserSort || {};
    const active = current.key === key;
    const direction = active ? current.direction : 'asc';
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
    const normalized = normalizeUserRecord({
        ...user,
        account: user.account || user.user_name || email,
        email: user.email || email
    });
    return {
        user_id: user.user_id || user.id || '',
        account: normalized.account,
        user_name: user.user_name || normalized.account,
        role: user.role === 'admin' ? 'admin' : 'user',
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
    state.userName = '';
    state.userEmail = '';
    state.userPhone = '';
    state.userRole = '';
    state.userSpecialty = '';
    state.assignedPlaces = [];
    state.allPlaces = [];
    state.uploadedRecords = [];
    state.reviewQueue = [];
    state.selectedPlace = null;
    state.currentTab = 'assigned';
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

    const userInfoDiv = document.getElementById('user-info-badge');
    if (userInfoDiv) userInfoDiv.remove();

    const adminBar = document.getElementById('admin-assign-bar');
    if (adminBar) adminBar.remove();
    const userManager = document.getElementById('admin-user-manager');
    if (userManager) userManager.remove();
    const classFilterRow = document.getElementById('class-filter-row');
    if (classFilterRow) classFilterRow.remove();

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
    const displayName = state.userName || state.userId;
    const hoverTitle = state.userEmail || state.userId;
    const taskDownloadButton = state.userRole === 'admin'
        ? ''
        : '<button class="btn-download-tasks" type="button" onclick="openTaskDownloadDialog()">下載任務清單</button>';
    const feedbackButton = state.userRole === 'admin'
        ? ''
        : '<button class="btn-feedback" type="button" onclick="openFeedbackDialog()">問題回報</button>';
    const adminPasswordButton = state.userRole === 'admin'
        ? '<button class="btn-change-password" type="button" onclick="openAdminPasswordDialog()">變更密碼</button>'
        : '';
    userInfoDiv.innerHTML = `
        <div>
            <div>${roleText}：${state.userId}</div>
            <div class="user-mode">${state.userRole === 'admin' ? '管理員模式' : '調查任務模式'}</div>
        </div>
        <div class="user-action-group">
            ${taskDownloadButton}
            ${feedbackButton}
            ${adminPasswordButton}
            <button class="btn-logout" onclick="logout()">登出</button>
        </div>
    `;
    const identityLine = userInfoDiv.querySelector('div > div');
    if (identityLine) {
        identityLine.textContent = `${roleText}: ${displayName}`;
        identityLine.title = hoverTitle;
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

function getAssignedTaskExportRows() {
    return [...state.assignedPlaces].sort((a, b) => {
        const countyCompare = String(a.county || '').localeCompare(String(b.county || ''), 'zh-Hant');
        if (countyCompare !== 0) return countyCompare;
        const townCompare = String(a.town || '').localeCompare(String(b.town || ''), 'zh-Hant');
        if (townCompare !== 0) return townCompare;
        return String(a.placeName || '').localeCompare(String(b.placeName || ''), 'zh-Hant');
    });
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

function configureRoleUI() {
    const tabAssigned = document.getElementById('tab-assigned');
    const tabOther = document.getElementById('tab-other');
    const tabReview = document.getElementById('tab-review');
    const tabUsers = document.getElementById('tab-users');
    const tabContainer = document.querySelector('.tab-container');
    const assigneeFilter = document.getElementById('assignee-filter');
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
        }
        if (tabUsers) {
            tabUsers.classList.remove('hidden');
            tabUsers.style.display = '';
        }
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
    if (tabUsers) {
        tabUsers.classList.add('hidden');
        tabUsers.classList.remove('active');
    }
    if (assigneeFilter) assigneeFilter.remove();
    if (classFilterRow) classFilterRow.remove();
    if (adminBar) adminBar.remove();
    if (appSection) appSection.style.paddingBottom = '';
    if (filterSection) filterSection.classList.remove('hidden');
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
                <span class="user-work-stat">${renderInvestigatorStatChip('通過', workStats.approvedCount)}</span>
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
                    <span>${renderAdminUserSortHeader('通過', 'approved')}</span>
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

    if (filterSection) filterSection.classList.toggle('hidden', state.currentTab === 'users');

    if (state.currentTab === 'review' || state.currentTab === 'users') {
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
            const usersRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_users_view?select=${USER_PROFILE_SELECT}&order=name.asc`, { headers });
            const usersData = await usersRes.json();
            // 將抓回來的名字存入 state
            state.allUserRecords = usersData.map(normalizeUserRecord);
            state.allUsers = state.allUserRecords
                .filter(u => u.role !== 'admin' && u.is_active)
                .map(u => normalizeUserRecord(u));
            const reviewsRes = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/app_review_queue_view?select=*`, { headers });
            const reviewsData = await reviewsRes.json();
            state.reviewQueue = reviewsData.map(normalizeReviewTask);

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
            state.assignedPlaces = places
                .filter(place => assignedUsersInclude(place.assignedUsers, state.userId) || assignedUsersInclude(place.assignedUsers, state.userName));
                
            state.allPlaces = places
                .filter(place => !assignedUsersInclude(place.assignedUsers, state.userId) && !assignedUsersInclude(place.assignedUsers, state.userName) && place.sourceTable !== 'test_places');
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
    if (state.currentTab !== tab) closeRecordingUI();
    state.currentTab = tab;
    document.getElementById('tab-assigned').classList.toggle('active', tab === 'assigned');
    document.getElementById('tab-other').classList.toggle('active', tab === 'other');
    document.getElementById('tab-review')?.classList.toggle('active', tab === 'review');
    document.getElementById('tab-users')?.classList.toggle('active', tab === 'users');
    syncAdminToolsForTab();
    document.getElementById('search-box').value = "";
    if (tab === 'users') {
        renderAdminUserManager();
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
    const previousTown = document.getElementById('town-filter').value;
    countySelect.innerHTML = '<option value="">所有縣市</option>'; 
    counties.forEach(c => countySelect.add(new Option(c, c)));
    if (previousCounty && counties.includes(previousCounty)) {
        countySelect.value = previousCounty;
    }
    updateTowns(previousTown);
    
    state.availableTypes = types;
    if (!state.typeFiltersInitialized) {
        state.selectedTypes = [...state.availableTypes];
        state.typeFiltersInitialized = true;
    } else {
        state.selectedTypes = reconcileMultiFilterSelection(state.selectedTypes, state.availableTypes, { emptySelectsAll: false });
    }
    renderMultiFilterChips('type-container', 'types', '全部類別', state.availableTypes, state.selectedTypes, getTypeDisplayText);
    syncStatusFilterChips();

    if (state.userRole === 'admin') {
        let assigneeSelect = document.getElementById('assignee-filter');
        const previousAssignee = assigneeSelect ? assigneeSelect.value : '';
        if (!assigneeSelect) {
            assigneeSelect = document.createElement('select');
            assigneeSelect.id = 'assignee-filter';
            assigneeSelect.onchange = handleFilterChange;
            
            const searchBox = document.getElementById('search-box');
            searchBox.parentNode.insertBefore(assigneeSelect, searchBox);
        }
        
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
        typeContainer.parentNode.insertBefore(classRow, typeContainer);
    }

    renderMultiFilterChips('tai-class-container', 'taiClasses', '全部台語分級', state.availableTaiClasses, state.selectedTaiClasses);
    renderMultiFilterChips('hak-class-container', 'hakClasses', '全部客語分級', state.availableHakClasses, state.selectedHakClasses);
}

function updateTowns(selectedTown = '') {
    const county = document.getElementById('county-filter').value;
    const townSelect = document.getElementById('town-filter');
    townSelect.innerHTML = '<option value="">所有鄉鎮</option>';
    if (county) {
        const towns = [...new Set(state.allPlaces.concat(state.assignedPlaces, state.reviewQueue).filter(p => p.county === county).map(p => p.town).filter(Boolean))];
        towns.forEach(t => townSelect.add(new Option(t, t)));
        if (selectedTown && towns.includes(selectedTown)) {
            townSelect.value = selectedTown;
        }
    }
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
    const allChip = `<button type="button" class="filter-chip ${isAllSelected ? 'selected' : ''}" onclick="selectAllMultiFilter('${filterKey}')">${escapeHtml(allLabel)}</button>`;
    const chips = values.map(value => {
        const selected = selectedSet.has(value);
        return `<button type="button" class="filter-chip ${selected ? 'selected' : ''}" onclick="toggleMultiFilterValue('${filterKey}', '${escapeJsString(value)}')">${escapeHtml(displayFormatter(value))}</button>`;
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
    document.querySelectorAll('.hak-area-chip').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');
    handleFilterChange();
}

function syncStatusFilterChips() {
    const selectedSet = new Set(Array.isArray(state.selectedStatuses) ? state.selectedStatuses : STATUS_FILTER_VALUES);
    const allSelected = STATUS_FILTER_VALUES.every(status => selectedSet.has(status));

    document.querySelectorAll('.status-chip').forEach(chip => {
        const status = chip.dataset.statusFilter;
        const selected = status === 'all' ? allSelected : selectedSet.has(status);
        chip.classList.toggle('selected', selected);
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
    return assignedUsersInclude(assignedUsers, assigneeFilter);
}

function placeMatchesStatusFilter(place, status) {
    if (status === '台語已有錄音') return Number(place.taiAudioCount || 0) > 0;
    if (status === '客語已有錄音') return Number(place.hakAudioCount || 0) > 0;
    return place.recordingStatus === status;
}

// 🌟 升級：執行篩選 (加入調查員條件)
function applyFilters() {
    if (state.currentTab === 'users') {
        renderAdminUserManager();
        return;
    }

    const keyword = document.getElementById('search-box').value.toLowerCase();
    const county = document.getElementById('county-filter').value;
    const town = document.getElementById('town-filter').value;
    const selectedTypes = Array.isArray(state.selectedTypes) ? state.selectedTypes : [];
    const selectedTaiClasses = Array.isArray(state.selectedTaiClasses) ? state.selectedTaiClasses : [];
    const selectedHakClasses = Array.isArray(state.selectedHakClasses) ? state.selectedHakClasses : [];
    const typeSet = new Set(selectedTypes);
    const taiClassSet = new Set(selectedTaiClasses);
    const hakClassSet = new Set(selectedHakClasses);
    const hasTypeOptions = (state.availableTypes || []).length > 0;
    const hakArea = state.selectedHakArea;
    const selectedStatuses = Array.isArray(state.selectedStatuses) ? state.selectedStatuses : [...STATUS_FILTER_VALUES];
    const statusFilterSet = new Set(selectedStatuses);
    const hasStatusFilter = selectedStatuses.length > 0 && selectedStatuses.length < STATUS_FILTER_VALUES.length;
    
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
        const matchTy = hasTypeOptions && selectedTypes.length > 0 ? typeSet.has(place.type || place.Type) : true;
        const matchTaiClass = selectedTaiClasses.length > 0 ? taiClassSet.has(place.taiClass) : true;
        const matchHakClass = selectedHakClasses.length > 0 ? hakClassSet.has(place.hakClass) : true;
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
    const id = Number(taskId);
    return state.assignedPlaces
        .concat(state.allPlaces, state.reviewQueue)
        .find(place => Number(place.id) === id) || null;
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
            checkboxHTML = `<input type="checkbox" class="assign-checkbox" value="${place.id}" data-task-id="${place.id}" data-list-index="${index}" onclick="toggleAdminPlaceSelection(event, ${index})" title="勾選；Shift + 左鍵可連續選取多筆" ${isChecked}>`;
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
                        <span class="meta-badge">${place.county} ${place.town}</span>
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
    const filteredCount = (state.filteredPlaces || []).length;
    const selectedCount = getSelectedAdminTaskIds().length;
    updateAdminSelectAllControl(selectedCount, filteredCount);
    if (!countEl) return;
    countEl.innerText = `篩選結果${filteredCount}筆，${selectedCount}筆已選`;
}

function openRecordingUI(place, element) {
    state.selectedPlace = place;
    document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    
    const recSection = document.getElementById('recording-section');
    recSection.style.display = 'block';
    document.getElementById('selected-place-title').innerText = `📍 正在處理：${place.placeName}`;
    
    resetRecordingState(getDefaultAnnotationLanguage(place)); renderHistoryList(place.id);
    recSection.scrollIntoView({ behavior: 'smooth' });
}

function closeRecordingUI() {
    state.selectedPlace = null;
    document.querySelectorAll('.place-item').forEach(el => el.classList.remove('active'));
    const recSection = document.getElementById('recording-section');
    if (recSection) recSection.style.display = 'none';
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
            ${renderAnnotationSummary(r.annotations)}
            ${canEdit ? `<button class="record-edit-btn" type="button" onclick="openRecordAnnotationEditor('${escapeJsString(r.recordId)}')">編輯文字</button>` : ''}
            <div id="${escapeHtml(getRecordEditorId(r.recordId))}" class="record-edit-panel hidden"></div>
            <div id="player-${r.recordId}" style="margin-top: 10px;">
                <button class="play-btn" onclick="fetchAndPlayAudio('${r.url}', '${r.recordId}')">▶️ 點此從雲端載入音檔並播放</button>
            </div>
        </div>
    `;
    }).join('');
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
                note: JSON.stringify({ annotations })
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
function resetRecordingState(preferredLanguage = getDefaultAnnotationLanguage()) {
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
        event.target.value = "";
        return alert("這個檔案不像音檔。請從 LINE 重新分享或儲存語音檔，再回來選擇。");
    }
    audioBlob = file; uploadedFileName = file.name; 
    document.getElementById('audio-playback').src = URL.createObjectURL(file);
    showAudioConfirmation('LINE/手機音檔', file);
    document.getElementById('status').innerText = `已選擇音檔：${file.name}，請先播放確認再上傳。`;
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
            showAudioConfirmation('現場錄音', null);
        };
        mediaRecorder.start();
        document.querySelector('.audio-source-panel')?.classList.add('hidden');
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
    document.getElementById('status').innerText = "錄音完成，請先播放確認。可以重錄，也可以直接上傳。";
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
    const hasAnnotation = Object.values(annotations).some(value => value);
    const uploadScopeWarning = getUploadScopeWarning(state.selectedPlace, lang);
    const baseConfirmText = hasAnnotation
        ? `你正在上傳「${state.selectedPlace.placeName}」的${lang}音檔，確定送出嗎？`
        : `這筆「${state.selectedPlace.placeName}」的${lang}音檔還沒有填文字註記，要直接送出錄音嗎？`;
    const confirmText = uploadScopeWarning
        ? `${uploadScopeWarning}\n\n${baseConfirmText}`
        : baseConfirmText;
    if (!confirm(confirmText)) return;

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
                const recorderName = getUserAnnotatorName(state.userId) || state.userName || state.userId;
                const supaPayload = {
                    task_id: state.selectedPlace.id,
                    recorder_name: recorderName,
                    audio_file_id: driveFileIdOrUrl,
                    phonetic_reading: phonetic,
                    language: lang,
                    note: JSON.stringify({ annotations: annotations })
                };

                const supaResponse = await fetch(supaUrl, {
                    method: 'POST',
                    headers: {
                        'apikey': CONFIG.SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
                        'Content-Type': 'application/json',
                        'Prefer': 'return=representation'
                    },
                    body: JSON.stringify(supaPayload)
                });
                if (!supaResponse.ok) throw new Error(await supaResponse.text());
                const insertedRecord = await supaResponse.json();

                statusDiv.innerText = `🎉 錄音與資料庫存檔完成！`; 
                statusDiv.style.color = "blue";
                
                // 更新畫面狀態
                state.uploadedRecords.push({
                    recordId: insertedRecord && insertedRecord[0] ? insertedRecord[0].id : new Date().getTime(),
                    placeId: state.selectedPlace.id,
                    language: lang,
                    uploaderId: recorderName,
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
    let options = state.allUsers.map(u => `<option value="${escapeHtml(getUserAnnotatorName(u))}" title="${escapeHtml(getUserHoverTitle(u))}">${escapeHtml(u.name || u.account)}</option>`).join('');

    bar.innerHTML = `
        <span class="assign-label">批次語種指派</span>
        <span id="assign-count" class="assign-count">0 筆已選</span>
        <select id="assignment-language-input">
            <option value="台語">台語</option>
            <option value="客語">客語</option>
        </select>
        <select id="assignee-input">
            <option value="">選擇調查員</option>
            ${options}
        </select>
        <button id="assign-submit-btn" class="assign-submit" onclick="batchAssignTasks()">確認指派</button>
        <button id="unassign-submit-btn" class="unassign-submit" onclick="batchUnassignTasks()">撤回指派</button>
        <span class="assign-hint">Shift + 左鍵可連續選取</span>
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
