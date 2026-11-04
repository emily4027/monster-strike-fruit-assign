document.addEventListener('DOMContentLoaded', () => {

    // =====================================================
    // 檔案結構
    //   1. 設定與常數 (新增功能時，先看這裡有沒有可改的設定)
    //   2. 工具函式
    //   3. DOM 快取與全域狀態
    //   4. 存檔：LocalStorage / 雲端 / 存檔槽位
    //   5. 初始化與 Firebase 登入流程
    //   6. Modal (提示 / 確認 / 輸入)
    //   7. 資料計算 (純函式，不碰 DOM)
    //   8. 果實轉移
    //   9. 渲染
    //  10. 事件綁定 (所有按鈕事件集中在 bindEvents)
    //
    //  新增資料欄位：只要把欄位名稱加進 DATA_FIELDS 與 createDefaultState，
    //  存檔、讀檔、備份、重置、切換存檔都會自動處理。
    //  資料有變動時，一律呼叫 commit() (= 存檔 + 重新渲染)。
    // =====================================================


    // =====================================================
    // 1. 設定與常數
    // =====================================================
    const BANK_SLOTS = 7;            // 固定 7 個鳥籠
    const FRUITS_PER_CHAR = 4;       // 每個角色 4 顆果實
    const SEARCH_DEBOUNCE_MS = 300;  // 搜尋輸入延遲

    const USER_CACHE_KEY = 'fruit_user_cache_v1';
    const DATA_CACHE_PREFIX = 'fruit_data_cache_';
    const DEFAULT_SLOT_LIST = ['default', 'slot2', 'slot3', 'slot4'];
    const LOCAL_SLOT_LIST_KEY = 'global_slot_list';          // localStorage：這台電腦 (離線) 的存檔清單
    const LOCAL_SLOT_NAMES_KEY = 'slot_names_cache';         // localStorage：這台電腦 (離線) 的存檔名稱
    const SLOT_LIST_DOC = 'fruit_slots';                     // 雲端：所有裝置共用的存檔清單
    const SLOT_LIST_CACHE_PREFIX = 'fruit_slot_list_cache_'; // sessionStorage：雲端存檔清單快取

    const defaultFruits = {
        "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
        "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
        "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
        "其他": ["將消", "兵消", "熱友", "速必"]
    };

    // 總覽頁面：左側「加擊類」包含哪些分類；其餘歸「其他類」
    const ATTACK_CATEGORIES = ['同族', '戰型', '擊種'];
    const OTHER_CATEGORY = '其他';

    // 快速分配組合 (按鈕 id 對應到果實清單)
    //   tag：套用組合時自動在角色名稱後加上的註記，例如「虹夏(同族)」
    const PRESETS = [
        { btnId: 'presetBtn1', fruits: ['同族加擊', '同族加命擊', '同族加擊速'], tag: '同族' },
        { btnId: 'presetBtn2', fruits: ['戰型加擊', '戰型加命擊', '戰型加擊速'], tag: '戰型' },
        { btnId: 'presetBtn3', fruits: ['擊種加擊', '擊種加命擊', '擊種加擊速'], tag: '擊種' },
        { btnId: 'presetBtn4', fruits: ['將消', '兵消', '速必'], tag: '雙削' }
    ];

    // 角色名稱最後的註記「(同族)」「（戰型）」…：只在果實分配使用，和抽卡統計比對名字時會先拿掉
    const CHARACTER_TAG_RE = new RegExp(`\\s*[(（](?:${PRESETS.map((p) => p.tag).join('|')})[)）]$`);
    const stripTag = (name) => String(name).replace(CHARACTER_TAG_RE, '');
    const tagOf = (name) => (String(name).match(CHARACTER_TAG_RE) || [''])[0];

    // 需要存檔 / 備份 / 雲端同步的資料欄位 (單一來源)
    const DATA_FIELDS = [
        'characters', 'fruitAssignments', 'fruitCategories', 'fruitObtained',
        'bankAssignments', 'storageCharacters', 'storageAssignments', 'recordName',
        'gachaImports', 'gachaAccount'
    ];

    // 從抽卡統計匯入：讀取抽卡統計的資料 (只讀不寫)
    //   抽卡統計改了這些路徑 / 欄位 (account、notes、tag、date、event、id) 時，這邊也要一起改
    const GACHA_LOCAL_KEY = 'gachaRecords';          // localStorage：抽卡統計的本機紀錄 (同網域共用)
    const GACHA_CLOUD_DOC = ['data', 'gacha_records']; // 雲端：artifacts/{appId}/users/{uid}/data/gacha_records
    const GACHA_SKIP_TAGS = ['orb'];                 // 寶珠紀錄的「獲得角色」是數量，不是角色


    // =====================================================
    // 2. 工具函式
    // =====================================================
    const $ = (id) => document.getElementById(id);

    const cloneDefaultFruits = () => JSON.parse(JSON.stringify(defaultFruits));

    const createDefaultState = () => ({
        characters: [],
        fruitAssignments: {},
        fruitCategories: cloneDefaultFruits(),
        fruitObtained: {},
        bankAssignments: Array(BANK_SLOTS).fill(''),
        storageCharacters: [],
        storageAssignments: {},
        recordName: '',
        // 抽卡紀錄的匯入狀態：[{ rid: 紀錄 id, name: 抽卡角色名, linked: [{ n: 果實分配角色名, t: 'main'|'storage' }], trashed: 丟進垃圾桶的數量 }]
        gachaImports: [],
        gachaAccount: ''   // 上次選的抽卡帳號
    });

    const debounce = (func, wait) => {
        let timeout;
        return (...args) => {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    };

    // 跳脫 HTML 特殊字元 (自訂果實名稱含引號或 < > 時不會弄壞畫面)
    const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));

    const readJson = (key, fallback) => {
        try {
            const raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) {
            return fallback;
        }
    };

    const readLocalSlotList = () => readJson(LOCAL_SLOT_LIST_KEY, null) || [...DEFAULT_SLOT_LIST];

    const addOption = (select, value, text) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    };

    // 中文輸入法選字時按的 Enter 不算 (isComposing / keyCode 229)
    const isEnterKey = (e) => e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;

    const asObject = (value, fallback) =>
        (value && typeof value === 'object') ? value : fallback;


    // =====================================================
    // 3. DOM 快取與全域狀態
    // =====================================================
    const DOM = {
        mainTitle: $('mainTitle'),
        newCharacter: $('newCharacter'),
        characterCount: $('characterCount'),

        // 使用者資訊
        userInfo: $('user-info'),
        userAvatar: $('user-avatar'),
        userDisplayName: $('user-display-name'),
        logoutBtn: $('logout-btn'),
        loginBtn: $('google-login-btn'),

        // Tab
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),

        // 總覽 / BANK
        attackFruitsOverview: $('attackFruitsOverview'),
        otherFruitsOverview: $('otherFruitsOverview'),
        bankFruitSelectors: $('bankFruitSelectors'),

        // 倉庫
        newStorageChar: $('newStorageChar'),
        addStorageCharBtn: $('addStorageChar'),
        searchStorageChar: $('searchStorageChar'),
        storageTableBody: $('storageTableBody'),
        storageCharCount: $('storageCharCount'),

        // 分配區
        fruitTableBody: $('fruitTableBody'),
        searchInput: $('searchCharacter'),
        filterModeCheckbox: $('filterModeCheckbox'),
        hideCompletedCheckbox: $('hideCompletedCheckbox'),
        presetCharacterSelect: $('presetCharacter'),
        uncompletedCharCount: $('uncompletedCharCount'),
        sortCharacterBy: $('sortCharacterBy'),

        // 存檔管理
        saveSlotSelect: $('saveSlotSelect'),
        renameSlotBtn: $('renameSlotBtn'),
        addSlotBtn: $('addSlotBtn'),
        deleteSlotBtn: $('deleteSlotBtn'),

        // Modal
        characterModal: $('characterModal'),
        characterListUl: $('characterList'),
        modalCharacterSearch: $('modalCharacterSearch'),
        deleteFruitModal: $('deleteFruitModal'),
        deleteFruitSelect: $('deleteFruitSelect'),
        alertModal: $('alertModal'),
        confirmModal: $('confirmModal'),
        inputModal: $('inputModal'),

        // 轉移 Modal
        fruitTransferModal: $('fruitTransferModal'),
        transferSourceMessage: $('transferSourceMessage'),
        transferTargetContainer: $('transferTargetContainer'),
        transferDestinationType: $('transferDestinationType'),
        transferTargetSelect: $('transferTargetSelect'),
        pullFruitModal: $('pullFruitModal'),
        pullFruitMessage: $('pullFruitMessage'),
        pullSourceSelect: $('pullSourceSelect'),
        confirmPullBtn: $('confirmPullBtn'),
        confirmTransferBtn: $('confirmTransferBtn'),
        storageSourceSelector: $('storageSourceSelector'),
        storageSourceSlotSelect: $('storageSourceSlotSelect'),

        // 從抽卡統計匯入 Modal
        gachaImportBtn: $('gachaImportBtn'),
        gachaImportModal: $('gachaImportModal'),
        gachaImportSource: $('gachaImportSource'),
        gachaAccountSelect: $('gachaAccountSelect'),
        gachaShowDate: $('gachaShowDate'),
        gachaImportList: $('gachaImportList'),
        confirmGachaImportBtn: $('confirmGachaImportBtn'),

        // 雲端狀態
        cloudStatus: $('cloudStatus'),
        cloudStatusText: $('cloudStatusText'),
        statusDot: document.querySelector('.status-dot')
    };

    // 轉移視窗的目標容器說明文字
    const transferTargetLabel = DOM.transferTargetContainer.querySelector('p');

    // Firebase 相關
    let db = null;
    let auth = null;
    let currentUser = null;
    let isCloudMode = false;
    let isCloudLoading = false;   // 讀取雲端資料期間不寫入雲端，避免舊資料覆蓋雲端
    let hasSaveDuringLoad = false;
    let saveTimeout = null;
    let envAppId = 'default-app-id';

    // 存檔槽位
    //   登入時 slotList 為雲端清單 (所有裝置共用)，未登入時為這台電腦的本機清單；
    //   兩份清單分開保存，登出後會換回本機清單，雲端清單不會留在這台電腦上。
    let currentSlot = 'default';
    let slotList = readLocalSlotList();
    let slotSource = 'local';             // 'local' | 'cloud'：目前 slotList 的來源
    let cloudSlotNames = {};              // 雲端清單中的存檔名稱
    let cloudSlotListSynced = false;      // 已和雲端清單同步完成，之後的變更才寫回雲端

    // 所有存檔資料 (欄位見 DATA_FIELDS)
    let state = createDefaultState();

    // 轉移狀態
    let currentTransfer = { sourceType: '', sourceIndex: -1, fruitName: '' };
    let storageSourceSlots = {};
    const transferTargetSlots = new Map();   // 目標容器 -> 自動放入的欄位 index

    // 搬入狀態 (從分配表直接把庫存果實搬給主力角色)
    let currentPull = { charName: '', slotIndex: -1, fruitName: '', sources: [] };


    // =====================================================
    // 4. 存檔：LocalStorage / 雲端 / 存檔槽位
    // =====================================================
    const localKeyFor = (slot, key) => (slot === 'default' ? key : `${slot}_${key}`);
    const getLocalKey = (key) => localKeyFor(currentSlot, key);
    const getSaveDocName = (slot = currentSlot) => (slot === 'default' ? 'fruit_assign' : `fruit_assign_${slot}`);

    // 存檔名稱：依目前清單來源讀寫 (雲端清單的名稱有變動時會寫回雲端)
    const getSlotNameCache = () => (slotSource === 'cloud' ? { ...cloudSlotNames } : readJson(LOCAL_SLOT_NAMES_KEY, {}));
    function setSlotNameCache(cache) {
        if (slotSource !== 'cloud') {
            localStorage.setItem(LOCAL_SLOT_NAMES_KEY, JSON.stringify(cache));
            return;
        }
        if (JSON.stringify(cache) === JSON.stringify(cloudSlotNames)) return;
        cloudSlotNames = { ...cache };
        persistSlotList();
    }

    const getSelectedSlotText = (fallback = '') =>
        DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex]?.text || fallback;

    const pickData = () => {
        const data = {};
        DATA_FIELDS.forEach((field) => { data[field] = state[field]; });
        return data;
    };

    // 鳥籠固定 BANK_SLOTS 格：不足補空，多的截掉
    const normalizeBank = (bank) =>
        Array.from({ length: BANK_SLOTS }, (_, i) => (Array.isArray(bank) && bank[i]) || '');

    // 將讀到的資料套用到 state (缺少的欄位使用預設值)
    function applyData(data) {
        const defaults = createDefaultState();
        DATA_FIELDS.forEach((field) => { state[field] = data[field] || defaults[field]; });
        state.bankAssignments = normalizeBank(state.bankAssignments);
        state.gachaImports = sanitizeGachaImports(state.gachaImports);
        if (typeof state.gachaAccount !== 'string') state.gachaAccount = '';
    }

    function updateCloudStatus(status, msg) {
        DOM.cloudStatus.style.display = 'flex';
        DOM.cloudStatusText.textContent = msg;
        DOM.statusDot.className = 'status-dot';

        if (status === 'online') DOM.statusDot.classList.add('status-online');
        else if (status === 'saving') DOM.statusDot.classList.add('status-saving');
        else DOM.statusDot.classList.add('status-offline');
    }

    // ---- LocalStorage ----
    // 讀取某個存檔在這台電腦上的資料 (不影響目前畫面)
    function readLocalSlotData(slot) {
        const data = createDefaultState();
        DATA_FIELDS.forEach((field) => {
            const item = localStorage.getItem(localKeyFor(slot, field));
            if (field === 'recordName') data.recordName = item || '';
            else if (item) data[field] = JSON.parse(item);
        });
        data.bankAssignments = normalizeBank(data.bankAssignments);
        data.gachaImports = sanitizeGachaImports(data.gachaImports);
        if (typeof data.gachaAccount !== 'string') data.gachaAccount = '';
        return data;
    }

    function loadFromLocalStorage() {
        try {
            state = readLocalSlotData(currentSlot);
            console.log(`[DATA] LocalStorage 載入成功 (Slot: ${currentSlot})`);
        } catch (e) {
            state = createDefaultState();
            console.error('LocalStorage 讀取失敗', e);
        }
    }

    // 這台電腦上有資料的存檔 ID (預設存檔以外的存檔，key 為 `<存檔ID>_characters`)
    function getLocalSlotIdsWithData() {
        const suffix = '_characters';
        return Object.keys(localStorage)
            .filter((key) => key.endsWith(suffix))
            .map((key) => key.slice(0, -suffix.length))
            .filter((slot) => slot && slot !== 'default');
    }

    function saveToLocalStorage() {
        DATA_FIELDS.forEach((field) => {
            const value = field === 'recordName' ? state.recordName : JSON.stringify(state[field]);
            localStorage.setItem(getLocalKey(field), value);
        });
        if (currentSlot === 'default') localStorage.setItem('fruitInventory', JSON.stringify({})); // 舊版相容
        localStorage.setItem('lastSelectedSlot', currentSlot);
    }

    function clearLocalSlotData(slot) {
        [...DATA_FIELDS, 'fruitInventory'].forEach((field) => localStorage.removeItem(localKeyFor(slot, field)));
    }

    // ---- 雲端 ----
    const getCloudDocRef = (uid, slot = currentSlot) => {
        const { doc } = window.firebaseModules;
        return doc(db, 'artifacts', envAppId, 'users', uid, 'fruit_data', getSaveDocName(slot));
    };

    const getSlotListDocRef = (uid) => {
        const { doc } = window.firebaseModules;
        return doc(db, 'artifacts', envAppId, 'users', uid, 'fruit_data', SLOT_LIST_DOC);
    };

    // 雲端資料快取 (每個存檔槽位分開存，避免重新整理後套用到別的存檔)
    const getDataCacheKey = (uid, slot = currentSlot) => `${DATA_CACHE_PREFIX}${uid}_${slot}`;
    const cacheCloudData = (uid, data, slot = currentSlot) => sessionStorage.setItem(getDataCacheKey(uid, slot), JSON.stringify(data));

    // ---- 雲端版本檢查 (兩台裝置同時開著時，避免互相覆蓋) ----
    //   每次寫入時 version + 1。寫入前在 transaction 裡比對雲端的 version 與 lastUpdated
    //   是否和上次讀到 / 寫入的一樣，只要有一個不同就當作其他裝置改過。
    //   (舊版網頁寫入時不會更新 version，所以 lastUpdated 也要比；大家都換成新版後可拿掉)
    const CONFLICT_PREFIX = '雲端資料已被其他裝置更新，';
    const stampOf = (value) => {
        if (!value) return null;
        if (typeof value.toMillis === 'function') return value.toMillis();
        const ms = new Date(value).getTime();
        return Number.isNaN(ms) ? null : ms;
    };
    const versionOf = (data) => (data
        ? { exists: true, version: Number.isInteger(data.version) ? data.version : null, stamp: stampOf(data.lastUpdated) }
        : { exists: false });
    const snapVersion = (snap) => versionOf(snap.exists() ? snap.data() : null);
    const isSameVersion = (a, b) => a.exists === b.exists && (!a.exists || (a.version === b.version && a.stamp === b.stamp));
    const nextVersion = (snap) => (snap.exists() && Number.isInteger(snap.data().version) ? snap.data().version : 0) + 1;

    // 目前存檔在雲端「上次讀到 / 寫入」的版本 (data 為 null 代表雲端沒有這份文件)
    let slotDocBase = { slot: null, exists: false };
    const rememberSlotDoc = (slot, data) => { slotDocBase = { slot, ...versionOf(data) }; };

    // 寫入雲端前先比對版本；雲端被其他裝置改過時不寫入，回傳 conflict
    // (完整覆寫雲端文件，不使用 merge，避免已刪除 / 改名的舊資料殘留在雲端)
    async function writeToCloud() {
        const { runTransaction } = window.firebaseModules;
        const uid = currentUser.uid;
        const slot = currentSlot;
        const ref = getCloudDocRef(uid, slot);
        const base = slotDocBase.slot === slot ? slotDocBase : { exists: false };
        const mine = pickData();

        const result = await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!isSameVersion(snapVersion(snap), base)) {
                return { conflict: true, cloudData: snap.exists() ? snap.data() : null };
            }
            const dataToSave = { ...mine, version: nextVersion(snap), lastUpdated: new Date() };
            tx.set(ref, dataToSave);
            return { conflict: false, dataToSave };
        });

        if (result.conflict) return { conflict: true, slot, cloudData: result.cloudData, mine };
        rememberSlotDoc(slot, result.dataToSave);
        cacheCloudData(uid, result.dataToSave, slot);
        return { conflict: false };
    }

    function downloadJson(data, fileName) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    const dateStamp = (withTime = false) => {
        const now = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
        return withTime ? `${date}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}` : date;
    };

    // 存檔衝突：先把這台剛才的版本下載成備份，再重新載入雲端的最新資料
    function handleSaveConflict({ slot, cloudData, mine }, { backup = true, message } = {}) {
        clearTimeout(saveTimeout);
        const isCurrent = slot === currentSlot;
        if (backup) {
            const myData = isCurrent ? pickData() : mine;   // 包含存檔送出後才做的修改
            downloadJson(myData, `${myData.recordName || '果實分配'}_衝突備份_${dateStamp(true)}.json`);
        }

        rememberSlotDoc(slot, cloudData);
        if (cloudData) cacheCloudData(currentUser.uid, cloudData, slot);
        else sessionStorage.removeItem(getDataCacheKey(currentUser.uid, slot));

        if (isCurrent) {
            if (cloudData) applyData(cloudData);
            else state = createDefaultState();   // 這個存檔已在其他裝置刪除或初始化
            renderAll();
        }
        updateCloudStatus('online', `已載入其他裝置的最新資料 (${getSelectedSlotText()})`);
        customAlert(message || (backup
            ? `${CONFLICT_PREFIX}已重新載入最新資料，你剛才的修改已下載備份，請重新操作。`
            : `${CONFLICT_PREFIX}已重新載入最新資料。`), '雲端資料已更新');
    }

    // 統一儲存 (雲端模式使用 Debounce；isImmediate 用於切換存檔等需要等待完成的情況)
    async function saveData(isImmediate = false) {
        if (isCloudMode && currentUser && db) {
            if (isCloudLoading) {
                hasSaveDuringLoad = true;
                return;
            }
            const performSave = async () => {
                try {
                    updateCloudStatus('saving', `儲存中 (${getSelectedSlotText(currentSlot)})...`);
                    const result = await writeToCloud();
                    if (result.conflict) handleSaveConflict(result);
                    else updateCloudStatus('online', `已同步至雲端 (${getSelectedSlotText()})`);
                } catch (e) {
                    console.error('[CLOUD] 雲端儲存失敗', e);
                    updateCloudStatus('offline', '儲存失敗');
                }
            };

            clearTimeout(saveTimeout);
            if (isImmediate) await performSave();
            else saveTimeout = setTimeout(performSave, 1000);
        } else {
            saveToLocalStorage();
            if (!isCloudMode) updateCloudStatus('offline', `離線模式: ${currentSlot}`);
        }
    }

    // 資料有變動時一律呼叫：存檔 + 重新渲染
    function commit() {
        saveData();
        renderAll();
    }

    function clearMemoryData() {
        state = createDefaultState();
    }

    // ---- 存檔槽位 ----
    function renderSlotOptions() {
        const cache = getSlotNameCache();
        DOM.saveSlotSelect.innerHTML = '';

        slotList.forEach((slotId, index) => {
            const savedName = cache[slotId];
            const fallbackName = slotId === 'default' ? '存檔 1 (預設)' : `存檔 ${index + 1}`;
            addOption(DOM.saveSlotSelect, slotId, `📁 ${savedName || fallbackName}`);
        });
        DOM.saveSlotSelect.value = currentSlot;
    }

    // ---- 存檔清單 (本機 / 雲端) ----
    function useLocalSlotList() {
        slotSource = 'local';
        slotList = readLocalSlotList();
        cloudSlotNames = {};
        cloudSlotListSynced = false;
    }

    function useCloudSlotList(ids, names) {
        slotSource = 'cloud';
        slotList = ids.includes('default') ? [...ids] : ['default', ...ids];
        cloudSlotNames = { ...names };
        cacheCloudSlotList();
    }

    function cacheCloudSlotList() {
        if (!currentUser) return;
        sessionStorage.setItem(SLOT_LIST_CACHE_PREFIX + currentUser.uid, JSON.stringify({ ids: slotList, names: cloudSlotNames }));
    }

    // 重新整理時先用快取的雲端清單，不必等 Firebase
    function restoreCachedCloudSlotList(uid) {
        const cached = (() => {
            try { return JSON.parse(sessionStorage.getItem(SLOT_LIST_CACHE_PREFIX + uid)); } catch (e) { return null; }
        })();
        if (!cached || !Array.isArray(cached.ids)) return;
        slotSource = 'cloud';
        slotList = cached.ids;
        cloudSlotNames = asObject(cached.names, {});
    }

    // 切換到上次使用的存檔 (不在目前清單中時改用預設存檔)
    function restoreLastSlot() {
        const lastSlot = localStorage.getItem('lastSelectedSlot');
        currentSlot = (lastSlot && slotList.includes(lastSlot)) ? lastSlot : 'default';
    }

    // 雲端存檔清單「上次讀到 / 寫入」的內容與版本，用來判斷其他裝置改了什麼
    let slotListBase = { exists: false, ids: [], names: {} };

    function parseSlotListDoc(data) {
        const slots = data && Array.isArray(data.slots) ? data.slots.filter((s) => s && typeof s.id === 'string') : [];
        const names = {};
        slots.forEach((s) => { if (s.name) names[s.id] = s.name; });
        return { ...versionOf(data), ids: slots.map((s) => s.id), names };
    }

    // 三方合併：以雲端最新清單為底，套上這台相對於 base 做的新增、刪除、改名
    // (兩邊各自新增 / 刪除的存檔都會保留；同一個存檔兩邊都改名時，以正在存檔的這台為準)
    function mergeSlotLists(base, mine, cloud) {
        const removedHere = new Set(base.ids.filter((id) => !mine.ids.includes(id)));
        const ids = cloud.ids.filter((id) => !removedHere.has(id));
        mine.ids.forEach((id) => { if (!base.ids.includes(id) && !ids.includes(id)) ids.push(id); });
        // 正在使用的存檔被其他裝置刪除時先保留在清單中，避免選單上找不到目前的存檔
        if (mine.ids.includes(currentSlot) && !ids.includes(currentSlot)) ids.push(currentSlot);
        if (!ids.includes('default')) ids.unshift('default');

        const names = {};
        ids.forEach((id) => {
            const renamedHere = mine.ids.includes(id) && (mine.names[id] || '') !== (base.names[id] || '');
            const name = renamedHere || !cloud.ids.includes(id) ? mine.names[id] : cloud.names[id];
            if (name) names[id] = name;
        });
        return { ids, names };
    }

    const sameSlotList = (a, b) => JSON.stringify(a.ids) === JSON.stringify(b.ids) && JSON.stringify(a.names) === JSON.stringify(b.names);

    async function writeSlotListToCloud() {
        const { runTransaction } = window.firebaseModules;
        const ref = getSlotListDocRef(currentUser.uid);
        const base = slotListBase;
        const mine = { ids: [...slotList], names: { ...cloudSlotNames } };
        cacheCloudSlotList();

        const result = await runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            const cloud = parseSlotListDoc(snap.exists() ? snap.data() : null);
            // 雲端沒被其他裝置改過 (或清單已不存在) 就直接寫入這台的清單，否則合併
            const merged = !cloud.exists || isSameVersion(cloud, base) ? mine : mergeSlotLists(base, mine, cloud);
            const version = nextVersion(snap);
            const lastUpdated = new Date();
            tx.set(ref, { slots: merged.ids.map((id) => ({ id, name: merged.names[id] || '' })), version, lastUpdated });
            return { merged, version, stamp: lastUpdated.getTime() };
        });

        const { merged } = result;
        slotListBase = { exists: true, version: result.version, stamp: result.stamp, ...merged };
        if (sameSlotList(merged, mine)) return;

        // 合併進了其他裝置的修改：更新畫面上的清單
        slotList = [...merged.ids];
        cloudSlotNames = { ...merged.names };
        cacheCloudSlotList();
        renderSlotOptions();
        customAlert(`${CONFLICT_PREFIX}已自動合併兩邊的存檔清單修改。`, '雲端資料已更新');
    }

    // 存檔清單有變動時呼叫：雲端清單寫回雲端，本機清單寫入 localStorage
    async function persistSlotList() {
        if (slotSource !== 'cloud') {
            localStorage.setItem(LOCAL_SLOT_LIST_KEY, JSON.stringify(slotList));
            return true;
        }
        cacheCloudSlotList();
        if (!(isCloudMode && currentUser && db && cloudSlotListSynced)) return true;
        try {
            await writeSlotListToCloud();
            return true;
        } catch (e) {
            console.error('[CLOUD] 存檔清單同步失敗', e);
            updateCloudStatus('offline', '存檔清單同步失敗');
            return false;
        }
    }

    // 登入時同步存檔清單：雲端還沒有清單就上傳本機清單，已有清單則以雲端為準
    async function syncSlotListOnLogin(uid) {
        const { getDoc } = window.firebaseModules;
        const localNames = readJson(LOCAL_SLOT_NAMES_KEY, {});
        const snap = await getDoc(getSlotListDocRef(uid));
        const cloudSlots = snap.exists() && Array.isArray(snap.data().slots)
            ? snap.data().slots.filter((s) => s && typeof s.id === 'string')
            : null;
        slotListBase = parseSlotListDoc(snap.exists() ? snap.data() : null);

        if (!cloudSlots) {
            const ids = readLocalSlotList();
            const names = {};
            ids.forEach((id) => { if (localNames[id]) names[id] = localNames[id]; });
            useCloudSlotList(ids, names);
            cloudSlotListSynced = true;
            await writeSlotListToCloud();
            await uploadLocalSlotData(uid, ids);
        } else {
            const names = {};
            cloudSlots.forEach((s) => { if (s.name) names[s.id] = s.name; });
            useCloudSlotList(cloudSlots.map((s) => s.id), names);
            cloudSlotListSynced = true;
            await offerUploadLocalOnlySlots(uid, localNames);
        }

        restoreLastSlot();
        renderSlotOptions();
    }

    // 第一次同步清單時，把清單中「本機有資料、雲端還沒有」的存檔一起上傳，
    // 避免其他裝置看到存檔名稱卻打開是空的
    async function uploadLocalSlotData(uid, ids) {
        const { getDoc, setDoc } = window.firebaseModules;
        for (const id of ids) {
            if (!localStorage.getItem(localKeyFor(id, 'characters'))) continue;
            const ref = getCloudDocRef(uid, id);
            if ((await getDoc(ref)).exists()) continue;
            await setDoc(ref, { ...readLocalSlotData(id), version: 1, lastUpdated: new Date() });
        }
    }

    // 這台電腦有資料、但不在雲端清單的存檔：詢問是否加入雲端 (取消的話下次登入會再問)
    async function offerUploadLocalOnlySlots(uid, localNames) {
        const pending = getLocalSlotIdsWithData().filter((id) => !slotList.includes(id));
        if (pending.length === 0) return;

        const labelOf = (id) => localNames[id] || localStorage.getItem(localKeyFor(id, 'recordName')) || id;
        const labels = pending.map((id) => `「${labelOf(id)}」`).join('、');
        const ok = await customConfirm(
            `這台電腦有 ${pending.length} 個存檔不在雲端清單中：${labels}。要加入雲端清單並上傳嗎？（按取消的話，下次登入會再詢問）`,
            '發現本機存檔'
        );
        if (!ok) return;

        try {
            const { setDoc } = window.firebaseModules;
            for (const id of pending) {
                await setDoc(getCloudDocRef(uid, id), { ...readLocalSlotData(id), version: 1, lastUpdated: new Date() });
                slotList.push(id);
                cloudSlotNames[id] = labelOf(id);
            }
            await writeSlotListToCloud();
            customAlert(`已將 ${pending.length} 個本機存檔加入雲端。`);
        } catch (e) {
            console.error('[CLOUD] 上傳本機存檔失敗', e);
            customAlert('上傳本機存檔失敗，下次登入時會再詢問。');
        }
    }

    async function changeSlot(newSlot, { skipSave = false } = {}) {
        // 1. 先儲存當前進度 (強制立即執行並等待完成；刪除存檔後切換時不再存回被刪除的存檔)
        if (skipSave) clearTimeout(saveTimeout);
        else await saveData(true);

        updateCloudStatus('saving', '切換存檔中...');

        // 2. 切換槽位並清空目前資料
        currentSlot = newSlot;
        DOM.saveSlotSelect.value = newSlot;
        localStorage.setItem('lastSelectedSlot', currentSlot);
        clearMemoryData();

        // 3. 重新載入資料
        if (isCloudMode && currentUser && db) {
            isCloudLoading = true;
            try {
                const { getDoc } = window.firebaseModules;
                const docSnap = await getDoc(getCloudDocRef(currentUser.uid));
                isCloudLoading = false;
                rememberSlotDoc(newSlot, docSnap.exists() ? docSnap.data() : null);

                if (docSnap.exists()) {
                    const data = docSnap.data();
                    applyData(data);
                    cacheCloudData(currentUser.uid, data);
                    updateCloudStatus('online', `已載入: ${getSelectedSlotText()}`);
                } else {
                    // 該槽位尚無雲端資料，嘗試讀取本地
                    loadFromLocalStorage();
                    updateCloudStatus('online', `新存檔: ${getSelectedSlotText()}`);
                }
            } catch (e) {
                isCloudLoading = false;
                rememberSlotDoc(newSlot, null);   // 版本不明：之後存檔時雲端若已有資料就會當作衝突，重新載入
                console.error('[CLOUD] 切換讀取失敗', e);
                loadFromLocalStorage();
                updateCloudStatus('offline', '切換讀取失敗，使用本地');
            }
        } else {
            loadFromLocalStorage();
        }

        // 無論成功或失敗，最後都要重新渲染
        renderAll();
    }

    async function addSlot() {
        const newSlotId = `slot_${Date.now()}`;
        slotList.push(newSlotId);
        await persistSlotList();
        renderSlotOptions();

        await changeSlot(newSlotId);
        customAlert('已新增空白存檔。');
    }

    async function deleteSlot() {
        if (slotList.length <= 1) return customAlert('至少保留一個存檔！');
        if (currentSlot === 'default') return customAlert('無法刪除預設存檔，請先切換到其他存檔再進行操作，或直接使用「全部初始化」功能。');

        const slotName = getSelectedSlotText();
        if (!(await customConfirm(`確定要刪除「${slotName}」嗎？此操作無法復原。`))) return;

        const deletedSlot = currentSlot;
        const useCloud = isCloudMode && currentUser && db;

        // 登入時要再確認一次，才會連雲端資料一起刪除；按取消則完全不刪
        if (useCloud) {
            const ok = await customConfirm(
                `「${slotName}」在雲端也有資料，刪除後所有裝置都會看不到，而且無法復原。確定要連雲端一起刪除嗎？`,
                '再次確認：刪除雲端資料'
            );
            if (!ok) return;

            clearTimeout(saveTimeout);   // 避免尚未送出的儲存在刪除後又把資料寫回雲端
            try {
                const { deleteDoc } = window.firebaseModules;
                await deleteDoc(getCloudDocRef(currentUser.uid, deletedSlot));
            } catch (e) {
                console.error('[CLOUD] 刪除雲端存檔失敗', e);
                return customAlert('刪除失敗：無法刪除雲端資料，請檢查網路後再試一次。存檔沒有被刪除。');
            }
            sessionStorage.removeItem(getDataCacheKey(currentUser.uid, deletedSlot));
            delete cloudSlotNames[deletedSlot];
        }

        // 這台電腦上的資料、本機清單與名稱也一併移除 (避免下次登入時被當成本機存檔再詢問上傳)
        clearLocalSlotData(deletedSlot);
        localStorage.setItem(LOCAL_SLOT_LIST_KEY, JSON.stringify(readLocalSlotList().filter((id) => id !== deletedSlot)));
        const localNames = readJson(LOCAL_SLOT_NAMES_KEY, {});
        delete localNames[deletedSlot];
        localStorage.setItem(LOCAL_SLOT_NAMES_KEY, JSON.stringify(localNames));

        slotList = slotList.filter((id) => id !== deletedSlot);
        const listSaved = await persistSlotList();

        await changeSlot('default', { skipSave: true });
        customAlert(listSaved
            ? `已刪除「${slotName}」。`
            : `已刪除「${slotName}」的資料，但雲端存檔清單更新失敗，其他裝置可能仍會看到這個（已清空的）存檔。`);
    }


    // =====================================================
    // 5. 初始化與 Firebase 登入流程
    // =====================================================
    function renderAuthUI(userData) {
        if (userData && DOM.userInfo) {
            DOM.userInfo.style.display = 'flex';
            DOM.userDisplayName.textContent = userData.displayName || '使用者';
            const defaultAvatar = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(userData.displayName || 'User') + '&background=random';
            DOM.userAvatar.src = userData.photoURL || defaultAvatar;
        } else if (DOM.userInfo) {
            DOM.userInfo.style.display = 'none';
        }
        if (DOM.loginBtn) DOM.loginBtn.style.display = userData ? 'none' : 'inline-block';
    }

    function readCachedUser() {
        try {
            const cached = JSON.parse(sessionStorage.getItem(USER_CACHE_KEY));
            return cached && cached.uid ? cached : null;
        } catch (e) {
            return null;
        }
    }

    // 從 sessionStorage 快取立即還原畫面 (不用等 Firebase)
    function checkAuthCache() {
        const cachedUserStr = sessionStorage.getItem(USER_CACHE_KEY);
        if (!cachedUserStr) return;

        try {
            const cachedUser = JSON.parse(cachedUserStr);
            renderAuthUI(cachedUser);

            // currentSlot 已在 initApp 還原為上次的存檔，只讀取該存檔的快取
            const cachedDataStr = sessionStorage.getItem(getDataCacheKey(cachedUser.uid));
            if (cachedDataStr) {
                applyData(JSON.parse(cachedDataStr));

                updateTitle();
                renderSlotOptions();
                renderAll();
                updateCloudStatus('online', '雲端就緒 (快取)');
                console.log('[Optimization] 已從快取恢復資料，無需等待 Firebase');
            }
        } catch (e) {
            console.warn('[Cache] 快取解析失敗，清除快取', e);
            sessionStorage.removeItem(USER_CACHE_KEY);
        }
    }

    async function handleUserLogin(user) {
        currentUser = user;
        isCloudMode = true;
        isCloudLoading = true;
        hasSaveDuringLoad = false;

        // 若已有資料 (來自 sessionStorage 快取)，不顯示 Loading
        if (state.characters.length === 0) updateCloudStatus('saving', '正在從雲端載入...');

        try {
            // 先同步存檔清單 (可能會切換 currentSlot)，再讀取目前存檔的資料
            const slotBefore = currentSlot;
            await syncSlotListOnLogin(user.uid);
            if (currentSlot !== slotBefore) clearMemoryData();

            const { getDoc } = window.firebaseModules;
            const docSnap = await getDoc(getCloudDocRef(user.uid));
            isCloudLoading = false;
            rememberSlotDoc(currentSlot, docSnap.exists() ? docSnap.data() : null);

            if (docSnap.exists()) {
                // 以雲端資料為準 (載入期間的編輯會被雲端資料取代)
                const data = docSnap.data();
                cacheCloudData(user.uid, data);
                applyData(data);
                updateCloudStatus('online', `雲端就緒 (${getSelectedSlotText()})`);
                renderAll();
            } else if (localStorage.getItem(localKeyFor(currentSlot, 'characters'))) {
                // 雲端無資料：把瀏覽器本地資料備份上雲端 (與切換存檔時相同，改用本機資料)
                loadFromLocalStorage();
                saveData();
                renderAll();
                customAlert(`歡迎！已自動將您原本在瀏覽器的資料備份至雲端帳號 (${user.uid})。`);
            } else {
                updateTitle();
                updateCloudStatus('online', '雲端就緒 (新資料)');
                renderAll();
                if (hasSaveDuringLoad) saveData();   // 補存載入期間的編輯
            }
        } catch (e) {
            isCloudLoading = false;
            console.error('[CLOUD] 讀取雲端資料錯誤', e);
            // 雲端讀取失敗：改回本機清單與本機資料
            useLocalSlotList();
            restoreLastSlot();
            renderSlotOptions();
            loadFromLocalStorage();
            renderAll();
            isCloudMode = false;
            updateTitle();
            updateCloudStatus('offline', '雲端讀取錯誤');
        }
    }

    // 清除所有雲端資料快取 (登出後不留在這台電腦上)
    function clearCloudDataCache() {
        Object.keys(sessionStorage)
            .filter((key) => key.startsWith(DATA_CACHE_PREFIX) || key.startsWith(SLOT_LIST_CACHE_PREFIX))
            .forEach((key) => sessionStorage.removeItem(key));
    }

    // 未登入 / 登出：畫面上的雲端資料一律換回這台電腦的本機 (離線) 資料
    function handleUserLogout() {
        clearTimeout(saveTimeout);
        currentUser = null;
        isCloudMode = false;
        isCloudLoading = false;
        clearCloudDataCache();
        useLocalSlotList();
        restoreLastSlot();
        renderSlotOptions();
        updateCloudStatus('offline', '未偵測到帳戶 (離線模式)');
        loadFromLocalStorage();
        renderAll();
    }

    function setupAuthListener() {
        db = window.firebaseDb;
        auth = window.firebaseAuth;
        envAppId = window.envAppId || 'default-app-id';

        window.onAuthStateChanged(auth, async (user) => {
            if (user) {
                const userData = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL };
                sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify(userData));
                renderAuthUI(userData);
                await handleUserLogin(user);
            } else {
                sessionStorage.removeItem(USER_CACHE_KEY);
                renderAuthUI(null);
                handleUserLogout();
            }
        });
    }

    // 等待 Firebase SDK 載入 (Polling)
    function waitForFirebase(retries = 0) {
        if (window.firebaseApp && window.firebaseAuth) {
            setupAuthListener();
        } else if (retries < 50) {
            setTimeout(() => waitForFirebase(retries + 1), 100);
        } else {
            console.warn('[INIT] Firebase SDK 載入超時，降級為離線模式');
            if (state.characters.length === 0) {
                loadFromLocalStorage();
                renderAll();
                updateTitle();
            }
        }
    }

    function initApp() {
        // 已登入過 (有快取)：先套用快取的雲端存檔清單，再還原上次的存檔
        const cachedUser = readCachedUser();
        if (cachedUser) restoreCachedCloudSlotList(cachedUser.uid);
        restoreLastSlot();

        checkAuthCache();
        renderSlotOptions();

        waitForFirebase();
    }


    // =====================================================
    // 6. Modal (提示 / 確認 / 輸入)
    // =====================================================
    function toggleModal(modal, show) {
        if (show) modal.classList.add('show');
        else modal.classList.remove('show');
    }

    // 提示視窗已開著時 (例如自動合併的通知後緊接著其他提示)，新訊息接在後面，不會蓋掉前一則
    function customAlert(message, title = '提示') {
        const msgEl = $('alertMessage');
        msgEl.style.whiteSpace = 'pre-line';
        if (DOM.alertModal.classList.contains('show')) {
            msgEl.textContent += `\n\n${message}`;
            return;
        }
        $('alertTitle').textContent = title;
        msgEl.textContent = message;
        toggleModal(DOM.alertModal, true);
        $('alertOkBtn').onclick = () => toggleModal(DOM.alertModal, false);
    }

    function customConfirm(message, title = '請確認') {
        $('confirmTitle').textContent = title;
        $('confirmMessage').textContent = message;
        toggleModal(DOM.confirmModal, true);

        return new Promise((resolve) => {
            $('confirmCancelBtn').onclick = () => { toggleModal(DOM.confirmModal, false); resolve(false); };
            $('confirmOkBtn').onclick = () => { toggleModal(DOM.confirmModal, false); resolve(true); };
        });
    }

    // 多選一視窗：choices = [{ value, label, cls }]，按 × 或視窗外面時回傳 null
    function customChoice(message, title, choices) {
        $('choiceTitle').textContent = title;
        $('choiceMessage').textContent = message;
        const box = $('choiceButtons');
        box.innerHTML = '';
        const modal = $('choiceModal');
        toggleModal(modal, true);

        return new Promise((resolve) => {
            const finish = (value) => {
                toggleModal(modal, false);
                modal.onclick = null;
                resolve(value);
            };
            choices.forEach(({ value, label, cls }) => {
                const btn = document.createElement('button');
                btn.className = `btn ${cls || 'btn-blue'}`;
                btn.textContent = label;
                btn.onclick = () => finish(value);
                box.appendChild(btn);
            });
            modal.querySelector('.close-modal').onclick = () => finish(null);
            modal.onclick = (e) => { if (e.target === modal) finish(null); };
        });
    }

    function customInput(message, defaultValue = '') {
        $('inputTitle').textContent = '輸入';
        $('inputMessage').textContent = message;
        const inputField = $('inputField');
        inputField.value = defaultValue;

        toggleModal(DOM.inputModal, true);
        inputField.focus();

        const cancelBtn = $('inputCancelBtn');
        const okBtn = $('inputOkBtn');

        return new Promise((resolve) => {
            const finish = (value) => {
                toggleModal(DOM.inputModal, false);
                cancelBtn.onclick = null;
                okBtn.onclick = null;
                resolve(value);
            };
            cancelBtn.onclick = () => finish(null);
            okBtn.onclick = () => finish(inputField.value.trim());
            inputField.onkeydown = (e) => { if (isEnterKey(e)) okBtn.click(); };
        });
    }


    // =====================================================
    // 7. 資料計算 (不碰 DOM)
    // =====================================================
    function getAllFruits() {
        if (!state.fruitCategories || typeof state.fruitCategories !== 'object') return [];
        return Object.values(state.fruitCategories).flat();
    }

    // 果實下拉選單的 <option> HTML：果實清單沒變就重用上次結果
    let fruitOptionsCache = { key: null, html: '' };
    function getFruitOptionsHtml() {
        const fruits = getAllFruits();
        const key = fruits.join('\u0000');
        if (fruitOptionsCache.key !== key) {
            fruitOptionsCache = {
                key,
                html: fruits.map((f) => `<option value="${escapeHtml(f)}">${escapeHtml(f)}</option>`).join('')
            };
        }
        return fruitOptionsCache.html;
    }

    function isCharacterCompleted(charName) {
        const assigned = state.fruitAssignments[charName] || [];
        const obtained = state.fruitObtained[charName] || [];
        let hasAssignment = false;
        let allDone = true;
        for (let i = 0; i < FRUITS_PER_CHAR; i++) {
            if (assigned[i]) {
                hasAssignment = true;
                if (!obtained[i]) {
                    allDone = false;
                    break;
                }
            }
        }
        return hasAssignment && allDone;
    }

    function getUnassignedFruitCount(charName) {
        const assigned = state.fruitAssignments[charName] || [];
        const obtained = state.fruitObtained[charName] || [];
        let count = 0;
        for (let i = 0; i < FRUITS_PER_CHAR; i++) {
            if (assigned[i] && !obtained[i]) count++;
        }
        return count;
    }

    function getFilteredCharacters() {
        if (!DOM.hideCompletedCheckbox.checked) return state.characters;
        return state.characters.filter((charName) => !isCharacterCompleted(charName));
    }

    function getUncompletedCharacterCount() {
        return state.characters.filter((charName) => !isCharacterCompleted(charName)).length;
    }

    // 各果實的「分配數 / 已獲得數」(只計算仍存在於角色清單的角色)
    function getFruitUsageData() {
        const usageMap = {};
        state.characters.forEach((char) => {
            const assigned = state.fruitAssignments[char] || [];
            const obtained = state.fruitObtained[char] || [];
            assigned.forEach((fruitName, idx) => {
                if (!fruitName) return;
                if (!usageMap[fruitName]) usageMap[fruitName] = { total: 0, obtained: 0 };
                usageMap[fruitName].total++;
                if (obtained[idx]) usageMap[fruitName].obtained++;
            });
        });
        return usageMap;
    }

    // 總庫存 = 英雄 BANK + 倉庫角色
    function getTotalStockCounts() {
        const stockCounts = {};
        state.bankAssignments.forEach((fruitName) => {
            if (fruitName) stockCounts[fruitName] = (stockCounts[fruitName] || 0) + 1;
        });
        state.storageCharacters.forEach((char) => {
            (state.storageAssignments[char] || []).forEach((f) => {
                if (f) stockCounts[f] = (stockCounts[f] || 0) + 1;
            });
        });
        return stockCounts;
    }

    function getNeededCharacterSlots(fruitName) {
        const neededSlots = [];
        state.characters.forEach((charName) => {
            const assigned = state.fruitAssignments[charName] || [];
            const obtained = state.fruitObtained[charName] || [];
            assigned.forEach((assignedFruit, index) => {
                if (assignedFruit === fruitName && !obtained[index]) {
                    neededSlots.push({ char: charName, slot: index + 1, slotText: `果實 ${index + 1}` });
                }
            });
        });
        return neededSlots;
    }

    function getAvailableDestinationSlots(fruitName) {
        const slots = { main: getNeededCharacterSlots(fruitName), bank: [], storage: [] };

        for (let i = 0; i < BANK_SLOTS; i++) {
            if (!state.bankAssignments[i]) {
                slots.bank.push({ id: i, name: `鳥籠 ${i + 1}`, text: `鳥籠 ${i + 1} (空)` });
            }
        }

        state.storageCharacters.forEach((charName) => {
            const assigned = state.storageAssignments[charName] || [];
            for (let index = 0; index < FRUITS_PER_CHAR; index++) {
                if (!assigned[index]) {
                    slots.storage.push({
                        id: [charName, index],
                        name: charName,
                        slotText: `果實 ${index + 1} (空)`,
                        text: `${charName} / 果實 ${index + 1} (空)`
                    });
                }
            }
        });
        return slots;
    }


    // =====================================================
    // 8. 果實轉移
    // =====================================================

    // 目標選單只選「容器 (角色 / 鳥籠)」，欄位自動使用該容器第一個可用的位置
    // (主力角色：第一個分配到此果實且未獲得的欄位；倉庫角色：第一個空欄位)
    function populateTargetGroups(destinations, groupKey, countSuffix, getSlotIndex) {
        const groups = new Map();
        destinations.forEach((slot) => {
            const key = slot[groupKey];
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(slot);
        });

        groups.forEach((slots, name) => {
            transferTargetSlots.set(name, getSlotIndex(slots[0]));
            addOption(DOM.transferTargetSelect, name, `${name} (${slots.length} ${countSuffix})`);
        });
        if (groups.size === 1) DOM.transferTargetSelect.value = [...groups.keys()][0];
    }

    function loadDestinationTypes(fruitName) {
        const allDestinations = getAvailableDestinationSlots(fruitName);
        const hasMain = allDestinations.main.length > 0;
        const hasBank = allDestinations.bank.length > 0;
        const hasStorage = allDestinations.storage.length > 0;

        DOM.transferDestinationType.innerHTML = '<option value="">-- 請選擇目標類型 --</option>';
        if (hasMain) DOM.transferDestinationType.innerHTML += `<option value="main">主力角色 (填補空缺) (${allDestinations.main.length} 需)</option>`;
        if (hasBank) DOM.transferDestinationType.innerHTML += `<option value="bank">英雄 BANK (空閒鳥籠) (${allDestinations.bank.length} 空)</option>`;
        if (hasStorage) DOM.transferDestinationType.innerHTML += `<option value="storage">倉庫角色 (空閒果實欄位) (${allDestinations.storage.length} 空)</option>`;

        DOM.transferTargetSelect.innerHTML = '';
        transferTargetSlots.clear();
        DOM.transferTargetContainer.style.display = 'none';

        DOM.transferDestinationType.onchange = () => {
            const type = DOM.transferDestinationType.value;
            DOM.transferTargetSelect.innerHTML = '';
            transferTargetSlots.clear();
            DOM.transferTargetContainer.style.display = 'none';

            if (!type) return;

            const destinations = allDestinations[type];
            DOM.transferTargetContainer.style.display = 'block';

            if (type === 'bank') {
                transferTargetLabel.textContent = '目標鳥籠:';
                addOption(DOM.transferTargetSelect, '', '請選擇空閒鳥籠');
                destinations.forEach((slot) => {
                    transferTargetSlots.set(String(slot.id), 0);
                    addOption(DOM.transferTargetSelect, slot.id, slot.text);
                });
                if (destinations.length === 1) DOM.transferTargetSelect.value = destinations[0].id;

            } else if (type === 'main') {
                transferTargetLabel.textContent = '目標主力角色:';
                addOption(DOM.transferTargetSelect, '', '請選擇角色');
                populateTargetGroups(destinations, 'char', '需', (slot) => slot.slot - 1);

            } else if (type === 'storage') {
                transferTargetLabel.textContent = '目標倉庫角色:';
                addOption(DOM.transferTargetSelect, '', '請選擇倉庫角色');
                populateTargetGroups(destinations, 'name', '空位', (slot) => slot.id[1]);
            }
        };

        if (!hasMain && !hasBank && !hasStorage) {
            DOM.transferDestinationType.innerHTML = '<option value="">無可用目標</option>';
            DOM.transferDestinationType.disabled = true;
        } else {
            DOM.transferDestinationType.disabled = false;
        }
    }

    function initTransferModal(fruitName, sourceType, sourceIdentifier) {
        currentTransfer.sourceType = '';
        currentTransfer.fruitName = '';
        currentTransfer.sourceIndex = -1;

        DOM.transferTargetContainer.style.display = 'none';
        DOM.transferDestinationType.value = '';
        DOM.storageSourceSelector.style.display = 'none';
        DOM.transferTargetSelect.innerHTML = '';
        transferTargetSlots.clear();

        if (sourceType === 'storage' && fruitName === null) {
            // 從倉庫角色移出：先選要移出哪一顆果實
            const charName = sourceIdentifier;
            const assigned = state.storageAssignments[charName] || [];

            storageSourceSlots = {};
            let slotCount = 0;
            assigned.forEach((fruit, index) => {
                if (fruit) {
                    slotCount++;
                    storageSourceSlots[`${charName}_${index}`] = {
                        fruitName: fruit,
                        slotIndex: index,
                        text: `果實 ${index + 1} (${fruit})`
                    };
                }
            });

            if (slotCount === 0) return customAlert(`倉庫角色「${charName}」目前沒有持有任何果實。`);

            DOM.storageSourceSelector.style.display = 'block';
            DOM.transferSourceMessage.textContent = `來源：倉庫角色「${charName}」`;
            DOM.transferDestinationType.disabled = true;

            DOM.storageSourceSlotSelect.innerHTML = '';
            addOption(DOM.storageSourceSlotSelect, '', '-- 請選擇要移出的果實 --');
            Object.keys(storageSourceSlots).forEach((key) => {
                const slot = storageSourceSlots[key];
                const destinations = getAvailableDestinationSlots(slot.fruitName);
                if (destinations.main.length > 0 || destinations.bank.length > 0 || destinations.storage.length > 0) {
                    addOption(DOM.storageSourceSlotSelect, key, slot.text);
                }
            });

            if (DOM.storageSourceSlotSelect.options.length <= 1) {
                return customAlert(`倉庫角色「${charName}」上所有果實都無處可轉移 (主力已獲或庫存已滿)。`);
            }

            DOM.storageSourceSlotSelect.onchange = () => {
                const selectedKey = DOM.storageSourceSlotSelect.value;
                if (selectedKey) {
                    const slot = storageSourceSlots[selectedKey];
                    currentTransfer.sourceType = 'storage';
                    currentTransfer.fruitName = slot.fruitName;
                    currentTransfer.sourceIndex = [charName, slot.slotIndex];
                    DOM.transferSourceMessage.textContent = `來源：倉庫角色「${charName}」的果實 ${slot.slotIndex + 1} (「${slot.fruitName}」)`;

                    DOM.transferDestinationType.disabled = false;
                    DOM.transferDestinationType.value = '';
                    DOM.transferTargetContainer.style.display = 'none';
                    loadDestinationTypes(slot.fruitName);
                } else {
                    DOM.transferDestinationType.disabled = true;
                    DOM.transferDestinationType.innerHTML = '<option value="">-- 請選擇目標類型 --</option>';
                    DOM.transferTargetContainer.style.display = 'none';
                }
            };

            // 只有一個可選項目時自動選取
            if (DOM.storageSourceSlotSelect.options.length === 2) {
                DOM.storageSourceSlotSelect.value = DOM.storageSourceSlotSelect.options[1].value;
                DOM.storageSourceSlotSelect.onchange();
            }

        } else if (fruitName) {
            currentTransfer.sourceType = sourceType;
            currentTransfer.fruitName = fruitName;
            currentTransfer.sourceIndex = sourceIdentifier;

            let sourceMsg = '';
            if (sourceType === 'bank') {
                sourceMsg = `來源：英雄 BANK (鳥籠 ${sourceIdentifier + 1}) 的「${fruitName}」`;
            } else if (sourceType === 'storage') {
                const [charName, slotIndex] = sourceIdentifier;
                sourceMsg = `來源：倉庫角色「${charName}」的果實 ${slotIndex + 1} (「${fruitName}」)`;
            }
            DOM.transferSourceMessage.textContent = sourceMsg;
            DOM.transferDestinationType.disabled = false;
            loadDestinationTypes(fruitName);
        } else {
            return customAlert('無法啟動轉移介面：果實名稱缺失。');
        }

        toggleModal(DOM.fruitTransferModal, true);
    }

    // 從來源 (鳥籠 / 倉庫角色) 取出果實；來源已不是這顆果實時回傳 false
    function takeFruitFromSource(sourceType, sourceIndex, fruitName) {
        if (sourceType === 'bank') {
            if (state.bankAssignments[sourceIndex] !== fruitName) return false;
            state.bankAssignments[sourceIndex] = '';
            return true;
        }
        if (sourceType === 'storage') {
            const [charName, slotIndex] = sourceIndex;
            const assigned = state.storageAssignments[charName];
            if (!assigned || assigned[slotIndex] !== fruitName) return false;
            assigned[slotIndex] = '';
            return true;
        }
        return false;
    }

    function performTransfer() {
        const targetType = DOM.transferDestinationType.value;
        const targetContainer = DOM.transferTargetSelect.value;
        const targetSlotIndex = transferTargetSlots.get(targetContainer);

        if (!targetType || !targetContainer || targetSlotIndex === undefined) return customAlert('請完整選擇目標類型和容器！');

        const { sourceType, fruitName, sourceIndex } = currentTransfer;

        // 1. 從來源移除
        if (!takeFruitFromSource(sourceType, sourceIndex, fruitName)) return customAlert('轉移失敗：來源果實狀態不正確或已被移除。');

        // 2. 放入目標
        let destinationText = '';
        if (targetType === 'main') {
            if (!state.fruitObtained[targetContainer]) state.fruitObtained[targetContainer] = [];
            state.fruitObtained[targetContainer][targetSlotIndex] = true;
            destinationText = `主力角色「${targetContainer}」的果實 ${targetSlotIndex + 1}`;
        } else if (targetType === 'bank') {
            const bankIndex = parseInt(targetContainer, 10);
            state.bankAssignments[bankIndex] = fruitName;
            destinationText = `英雄 BANK (鳥籠 ${bankIndex + 1})`;
        } else if (targetType === 'storage') {
            const charName = targetContainer;
            if (!state.storageAssignments[charName]) state.storageAssignments[charName] = [];
            state.storageAssignments[charName][targetSlotIndex] = fruitName;
            destinationText = `倉庫角色「${charName}」的果實 ${targetSlotIndex + 1}`;
        }

        toggleModal(DOM.fruitTransferModal, false);
        commit();
        customAlert(`成功將「${fruitName}」轉移至 ${destinationText}！`, '轉移成功');
    }

    // 持有某果實的所有庫存位置 (鳥籠在前，倉庫角色在後)
    function getFruitSources(fruitName) {
        const sources = [];
        state.bankAssignments.forEach((f, i) => {
            if (f === fruitName) sources.push({ type: 'bank', index: i, text: `英雄 BANK：鳥籠 ${i + 1}` });
        });
        state.storageCharacters.forEach((charName) => {
            (state.storageAssignments[charName] || []).forEach((f, i) => {
                if (f === fruitName) sources.push({ type: 'storage', index: [charName, i], text: `倉庫角色：${charName} / 果實 ${i + 1}` });
            });
        });
        return sources;
    }

    // 從分配表直接搬入：選擇要從哪個鳥籠 / 倉庫角色拿這顆果實
    function initPullModal(charName, slotIndex) {
        const fruitName = (state.fruitAssignments[charName] || [])[slotIndex];
        const sources = fruitName ? getFruitSources(fruitName) : [];
        if (sources.length === 0) return customAlert(`目前鳥籠與倉庫中都沒有「${fruitName}」。`);

        currentPull = { charName, slotIndex, fruitName, sources };
        DOM.pullFruitMessage.textContent = `把「${fruitName}」搬給「${charName}」的果實 ${slotIndex + 1}，從哪裡拿？`;
        DOM.pullSourceSelect.innerHTML = '';
        sources.forEach((source, i) => addOption(DOM.pullSourceSelect, i, source.text));
        toggleModal(DOM.pullFruitModal, true);
    }

    function performPull() {
        const { charName, slotIndex, fruitName, sources } = currentPull;
        const source = sources[parseInt(DOM.pullSourceSelect.value, 10)];
        if (!source) return customAlert('請選擇來源！');

        // 開啟視窗後資料可能已變動，搬入前再確認一次
        if ((state.fruitAssignments[charName] || [])[slotIndex] !== fruitName) return customAlert('搬入失敗：該欄位的分配已變更。');
        if (!takeFruitFromSource(source.type, source.index, fruitName)) return customAlert('搬入失敗：來源果實狀態不正確或已被移除。');

        if (!state.fruitObtained[charName]) state.fruitObtained[charName] = [];
        state.fruitObtained[charName][slotIndex] = true;

        toggleModal(DOM.pullFruitModal, false);
        commit();
    }


    // =====================================================
    // 8-1. 從抽卡統計匯入角色
    //   每筆抽卡紀錄的「獲得角色」拆成一隻一隻，每隻可以：新增到主力 / 新增到倉庫 /
    //   對應到已有角色 / 丟進垃圾桶 / 先不處理。處理結果記在 state.gachaImports，
    //   所以已處理的角色不會再出現在「待處理」。
    // =====================================================
    const gachaImport = { records: [], account: '', tab: 'pending', pending: [], imported: [], trashed: [], checkedRids: new Set() };

    const charList = (type) => (type === 'storage' ? state.storageCharacters : state.characters);
    const linkKey = (t, n) => `${t}|${n}`;
    const numberedName = (base, k) => (k === 1 ? base : `${base}-${k}`);
    // 「虹夏-2(同族)」→「虹夏」(拿掉註記與編號)
    const baseNameOf = (name) => stripTag(name).replace(/-\d+$/, '');
    // 主力 + 倉庫中，拿掉註記後的名字 (編號與撞名都以這個判斷)
    const plainNamesInUse = () => new Set([...state.characters, ...state.storageCharacters].map(stripTag));

    // 「虹夏*3、麒麟兒*2」→ [{ name: '虹夏', count: 3 }, { name: '麒麟兒', count: 2 }]
    //   也支援「2新春」(數字在前) 與「杏子α、*2」(上一隻 ×2)；
    //   「3抽」「11顆」「無」和單獨的數字不是角色，會略過
    const GACHA_NOT_CHARACTER = /^(?:[\d?？]+\s*抽|\d+\s*顆|\d+|無)$/;
    function parseGachaCharacters(notes) {
        const counts = new Map();
        let last = '';
        String(notes || '').split(/[,，、\s+]+/).forEach((part) => {
            const p = part.trim();
            if (!p) return;
            if (GACHA_NOT_CHARACTER.test(p)) {
                last = '';   // 「光屬8、9、*2」的 *2 是接在 9 後面，不套到光屬8
                return;
            }

            const bare = p.match(/^[*xX×](\d+)$/);   // 單獨的「*2」：上一隻角色 ×2
            if (bare) {
                if (last) counts.set(last, counts.get(last) + Math.min(parseInt(bare[1], 10), 99) - 1);
                return;
            }

            const m = p.match(/^(.+?)(?:[ *xX×]+(\d+)[隻體]?|(\d+)[隻體])?$/);
            if (!m) return;
            let name = m[1].trim();
            let count = parseInt(m[2] || m[3] || '1', 10);
            // 數字在前：「2新春」= 新春 ×2 (「8號」這種一個字的不算)
            const lead = !m[2] && !m[3] && name.match(/^(\d+)(\D{2,}.*)$/);
            if (lead) {
                count = parseInt(lead[1], 10);
                name = lead[2].trim();
            }
            count = Math.min(count, 99);
            if (!name || count <= 0) return;
            counts.set(name, (counts.get(name) || 0) + count);
            last = name;
        });
        return [...counts].map(([name, count]) => ({ name, count }));
    }

    // 登入時讀抽卡統計的雲端紀錄，未登入時讀這台電腦上的紀錄
    async function loadGachaRecords() {
        let list;
        let source;
        if (isCloudMode && currentUser && db) {
            const { doc, getDoc } = window.firebaseModules;
            const snap = await getDoc(doc(db, 'artifacts', envAppId, 'users', currentUser.uid, ...GACHA_CLOUD_DOC));
            list = snap.exists() ? snap.data().records : [];
            source = '抽卡統計的雲端紀錄（已登入）';
        } else {
            list = readJson(GACHA_LOCAL_KEY, []);
            source = '這台電腦上的抽卡統計紀錄（未登入）';
        }
        const records = (Array.isArray(list) ? list : []).filter((r) => r && typeof r === 'object'
            && r.id !== undefined && r.id !== null
            && typeof r.account === 'string' && r.account
            && !GACHA_SKIP_TAGS.includes(r.tag));
        return { records, source };
    }

    const findGachaEntry = (rid, name) => state.gachaImports.find((e) => e.rid === rid && e.name === name);
    function ensureGachaEntry(rid, name) {
        let entry = findGachaEntry(rid, name);
        if (!entry) {
            entry = { rid, name, linked: [], trashed: 0 };
            state.gachaImports.push(entry);
        }
        return entry;
    }

    // 已對應過的果實分配角色 (同一個角色只能對應一隻抽到的角色)
    const getLinkedSet = () => new Set(state.gachaImports.flatMap((e) => e.linked.map((l) => linkKey(l.t, l.n))));

    // 依目前帳號整理出 待處理 / 已匯入 / 垃圾桶 三份清單 (由舊到新，第一隻抽到的拿原名)
    function buildGachaRows() {
        const records = gachaImport.records
            .filter((r) => r.account === gachaImport.account)
            .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || Number(a.id) - Number(b.id));
        const pending = [];
        const imported = [];
        const trashed = [];
        records.forEach((record) => {
            const rid = String(record.id);
            parseGachaCharacters(record.notes).forEach(({ name, count }) => {
                const entry = findGachaEntry(rid, name);
                const linked = entry ? entry.linked : [];
                const trashCount = entry ? entry.trashed : 0;
                linked.forEach((link) => imported.push({ record, rid, name, link }));
                for (let i = 0; i < trashCount; i++) trashed.push({ record, rid, name });
                const left = Math.max(0, count - linked.length - trashCount);
                for (let i = 0; i < left; i++) pending.push({ record, rid, name, action: 'skip', suggest: '', newName: '', rename: null });
            });
        });
        gachaImport.pending = pending;
        gachaImport.imported = imported;
        gachaImport.trashed = trashed;
        setDefaultGachaActions(null, false);   // 一開始全部「先不處理」，只顯示建議
    }

    // 預設動作：有同名 (或同名編號) 且還沒對應過的角色 → 對應到它；否則新增到主力
    //   onlyRids：只重設這些紀錄的列 (其他列目前選的對應不會被搶走)
    //   建議記在 row.suggest；apply 為 true 時才實際套用 (一開始全部是「先不處理」，只顯示建議)
    function setDefaultGachaActions(onlyRids = null, apply = true) {
        const linked = getLinkedSet();
        const claimed = new Set();
        gachaImport.pending.forEach((row) => {
            if (onlyRids && !onlyRids.has(row.rid) && row.action.startsWith('link:')) claimed.add(row.action.slice(5));
        });
        const suggestFor = (row) => {
            for (let k = 1; k < 100; k++) {
                const n = numberedName(row.name, k);
                // 名稱有註記也算同名：「虹夏(同族)」= 「虹夏」
                for (const t of ['main', 'storage']) {
                    const c = charList(t).find((name) => stripTag(name) === n && !linked.has(linkKey(t, name)) && !claimed.has(linkKey(t, name)));
                    if (c) {
                        claimed.add(linkKey(t, c));
                        return `link:${linkKey(t, c)}`;
                    }
                }
            }
            return 'add:main';
        };
        gachaImport.pending.forEach((row) => {
            if (onlyRids && !onlyRids.has(row.rid)) return;
            row.suggest = suggestFor(row);
            if (apply) {
                row.action = row.suggest;
                row.rename = null;
            }
        });
        assignGachaNewNames();
    }

    // 「新增」的角色依序取名：虹夏、虹夏-2、虹夏-3…… (主力和倉庫的名字一起算)
    //   preview：選了「改抽卡統計的名字」時，同名的其他列先用改好的名字預覽
    function assignGachaNewNames(preview = true) {
        const used = plainNamesInUse();
        const renames = new Map();
        if (preview) {
            gachaImport.pending.forEach((row) => {
                if (row.rename === 'fruit' && !renames.has(row.name)) renames.set(row.name, baseNameOf(parseLinkAction(row.action).n));
            });
        }
        gachaImport.pending.forEach((row) => {
            row.newName = '';
            if (!row.action.startsWith('add:')) return;
            const base = renames.get(row.name) || row.name;
            let k = 1;
            while (used.has(numberedName(base, k))) k++;
            row.newName = numberedName(base, k);
            used.add(row.newName);
        });
    }

    // 活動標題：勾選「顯示日期」時在活動名稱前加上日期 (設定記在這台電腦)
    const GACHA_SHOW_DATE_KEY = 'fruit_gacha_show_date';
    const readShowDate = () => { try { return localStorage.getItem(GACHA_SHOW_DATE_KEY) === '1'; } catch (e) { return false; } };
    const gachaRecordLabel = (record) => {
        const event = String(record.event || '').trim();
        const date = record.date || '';
        if (!event) return date;
        return DOM.gachaShowDate.checked && date ? `${date} ${event}` : event;
    };

    function gachaActionResult(row) {
        if (row.action.startsWith('add:')) {
            const where = row.action === 'add:storage' ? '倉庫' : '主力';
            const exists = plainNamesInUse().has(row.name);
            const note = exists && row.newName !== row.name ? `（已有「${row.name}」）` : '';
            return `→ 新增到${where}「${row.newName}」${note}`;
        }
        if (row.action.startsWith('link:')) {
            const { t, n } = parseLinkAction(row.action);
            const base = `→ 對應到${t === 'storage' ? '倉庫' : ''}「${n}」`;
            if (row.rename === 'gacha') return `${base}，並改名為「${renamedTarget(n, row.name, t)}」`;
            if (row.rename === 'fruit') return `${base}，並把抽卡統計的「${row.name}」改成「${baseNameOf(n)}」`;
            return base;
        }
        if (row.action === 'trash') return '→ 移到垃圾桶';
        // 先不處理：顯示建議的動作 (勾選活動後按「套用建議」即可套用)
        if (row.action === 'skip' && row.suggest) {
            if (row.suggest.startsWith('link:')) return `建議：對應到「${parseLinkAction(row.suggest).n}」`;
            return '建議：新增到主力';
        }
        return '';
    }

    const parseLinkAction = (action) => {
        const [t, ...rest] = action.slice(5).split('|');
        return { t, n: rest.join('|') };
    };

    // 對應時兩邊名字不同 (不看編號)：要選用哪個名字
    const namesDiffer = (row) => row.action.startsWith('link:') && baseNameOf(parseLinkAction(row.action).n) !== row.name;

    // 果實分配的角色改用抽卡統計的名字：保留編號與註記 (羌廆-2(同族) → 羌瘣-2(同族))，撞名時接下一個編號
    function renamedTarget(target, gachaName) {
        const plain = stripTag(target);
        const suffix = plain.match(/-(\d+)$/);
        let k = suffix ? parseInt(suffix[1], 10) : 1;
        const others = new Set([...state.characters, ...state.storageCharacters].filter((n) => n !== target).map(stripTag));
        while (others.has(numberedName(gachaName, k))) k++;
        return numberedName(gachaName, k) + tagOf(target);
    }

    // 把「獲得角色」文字裡的某個角色名稱換掉，其他角色和寫法 (數量、分隔符號) 不動
    function replaceGachaName(notes, oldName, newName) {
        return String(notes).split(/([,，、\s+]+)/).map((part, i) => {
            if (i % 2 === 1 || !part || GACHA_NOT_CHARACTER.test(part)) return part;
            const m = part.match(/^(.+?)((?:[ *xX×]+\d+[隻體]?|\d+[隻體])?)$/);
            if (!m) return part;
            const lead = !m[2] && m[1].match(/^(\d+)(\D{2,}.*)$/);
            const prefix = lead ? lead[1] : '';
            const name = lead ? lead[2] : m[1];
            return name.trim() === oldName ? `${prefix}${newName}${m[2]}` : part;
        }).join('');
    }

    const gachaCloudRef = () => {
        const { doc } = window.firebaseModules;
        return doc(db, 'artifacts', envAppId, 'users', currentUser.uid, ...GACHA_CLOUD_DOC);
    };

    // 改寫抽卡統計的雲端紀錄：所有帳號中寫成 oldName 的角色都改成 newName。
    // 用 transaction 讀最新資料再改，version + 1，抽卡統計下次存檔時會以三方合併接收這次修改。
    async function renameInGachaCloud(oldName, newName) {
        const { runTransaction } = window.firebaseModules;
        const ref = gachaCloudRef();
        return runTransaction(db, async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists() || !Array.isArray(snap.data().records)) return 0;
            let changed = 0;
            const records = snap.data().records.map((r) => {
                if (!r || typeof r.notes !== 'string') return r;
                const notes = replaceGachaName(r.notes, oldName, newName);
                if (notes === r.notes) return r;
                changed++;
                return { ...r, notes };
            });
            if (changed > 0) tx.set(ref, { records, version: nextVersion(snap), lastUpdated: new Date() }, { merge: true });
            return changed;
        });
    }

    // 抽卡統計的名字改了之後，匯入狀態也跟著改 (同一筆紀錄已有新名字的狀態時合併)
    function renameGachaEntries(oldName, newName, rids = null) {
        state.gachaImports.slice().forEach((entry) => {
            if (entry.name !== oldName || (rids && !rids.has(entry.rid))) return;
            const existing = findGachaEntry(entry.rid, newName);
            if (existing && existing !== entry) {
                existing.linked.push(...entry.linked);
                existing.trashed += entry.trashed;
                state.gachaImports.splice(state.gachaImports.indexOf(entry), 1);
            } else {
                entry.name = newName;
            }
        });
    }

    // 對應時記下抽卡紀錄的日期 (排序用)；舊版對應的沒有日期、或抽卡統計改了日期時補上
    function backfillGachaLinkDates() {
        const dateByRid = new Map(gachaImport.records.map((r) => [String(r.id), r.date || '']));
        let changed = 0;
        state.gachaImports.forEach((entry) => {
            const date = dateByRid.get(entry.rid);
            if (!date) return;
            entry.linked.forEach((link) => {
                if (link.d !== date) {
                    link.d = date;
                    changed++;
                }
            });
        });
        return changed;
    }

    // 主力角色 → 對應的抽卡紀錄 { date, rid } (對應到多筆時取最新的)
    function getGachaDateMap() {
        const map = new Map();
        state.gachaImports.forEach((entry) => entry.linked.forEach((link) => {
            if (link.t !== 'main' || !link.d) return;
            const prev = map.get(link.n);
            if (!prev || link.d > prev.date || (link.d === prev.date && Number(entry.rid) > Number(prev.rid))) {
                map.set(link.n, { date: link.d, rid: entry.rid });
            }
        }));
        return map;
    }

    // 直接在抽卡統計改了名字：同一筆紀錄中「已處理的名字不見了、又多了一個沒處理的名字」，
    // 而且剛好只有一對時，把匯入狀態接到新名字上 (兩對以上猜不出對應，就不處理)
    function recoverRenamedGachaEntries() {
        let recovered = 0;
        gachaImport.records.forEach((record) => {
            const rid = String(record.id);
            const names = parseGachaCharacters(record.notes).map((c) => c.name);
            const orphans = state.gachaImports.filter((e) => e.rid === rid && !names.includes(e.name) && (e.linked.length || e.trashed));
            const fresh = names.filter((n) => !findGachaEntry(rid, n));
            if (orphans.length === 1 && fresh.length === 1) {
                orphans[0].name = fresh[0];
                recovered++;
            }
        });
        return recovered;
    }

    function gachaActionOptionsHtml(row, linked) {
        const opt = (value, text) => `<option value="${escapeHtml(value)}"${row.action === value ? ' selected' : ''}>${escapeHtml(text)}</option>`;
        // 可對應的角色：還沒被對應過的主力 / 倉庫角色，同名或名字相近的排前面
        const score = (n) => (baseNameOf(n) === row.name ? 0 : (n.includes(row.name) || row.name.includes(n) ? 1 : 2));
        const candidates = ['main', 'storage']
            .flatMap((t) => charList(t).map((n) => ({ t, n })))
            .filter(({ t, n }) => !linked.has(linkKey(t, n)))
            .sort((a, b) => score(a.n) - score(b.n));
        const linkOptions = candidates
            .map(({ t, n }) => opt(`link:${linkKey(t, n)}`, `🔗 ${n}${t === 'storage' ? '（倉庫）' : ''}`))
            .join('');
        return opt('add:main', '➕ 新增到主力')
            + opt('add:storage', '➕ 新增到倉庫')
            + opt('trash', '🗑️ 不需要')
            + opt('skip', '⏸ 先不處理')
            + (linkOptions ? `<optgroup label="對應到已有角色">${linkOptions}</optgroup>` : '');
    }

    // 依紀錄分組 (最新的紀錄在最上面)
    function groupGachaRows(rows) {
        const groups = [];
        const byRid = new Map();
        rows.forEach((row, index) => {
            if (!byRid.has(row.rid)) {
                const group = { record: row.record, items: [] };
                byRid.set(row.rid, group);
                groups.push(group);
            }
            byRid.get(row.rid).items.push({ row, index });
        });
        return groups.reverse();
    }

    function renderGachaImport() {
        $('giCountPending').textContent = gachaImport.pending.length;
        $('giCountImported').textContent = gachaImport.imported.length;
        $('giCountTrash').textContent = gachaImport.trashed.length;
        document.querySelectorAll('.gi-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.giTab === gachaImport.tab));
        DOM.confirmGachaImportBtn.style.display = gachaImport.tab === 'pending' && gachaImport.pending.length ? '' : 'none';

        const list = DOM.gachaImportList;
        const rows = gachaImport[gachaImport.tab];
        if (!gachaImport.account) {
            list.innerHTML = '<p class="gi-empty">沒有找到抽卡紀錄。</p>';
            return;
        }
        if (rows.length === 0) {
            const empty = { pending: '沒有待處理的角色，這個帳號的抽卡紀錄都處理過了。', imported: '還沒有匯入或對應過的角色。', trashed: '垃圾桶是空的。' };
            list.innerHTML = `<p class="gi-empty">${empty[gachaImport.tab]}</p>`;
            return;
        }

        const linked = getLinkedSet();
        const itemHtml = (row, index) => {
            const name = `<span class="gi-name">${escapeHtml(row.name)}</span>`;
            if (gachaImport.tab === 'pending') {
                return `<div class="gi-row">${name}
                    <select class="gi-action" data-index="${index}">${gachaActionOptionsHtml(row, linked)}</select>
                    <span class="gi-result" data-result="${index}">${escapeHtml(gachaActionResult(row))}</span></div>`;
            }
            if (gachaImport.tab === 'imported') {
                const target = `${row.link.n}${row.link.t === 'storage' ? '（倉庫）' : ''}`;
                return `<div class="gi-row">${name}<span class="gi-result">→ ${escapeHtml(target)}</span>
                    <button class="btn btn-gray btn-small gi-unlink" data-index="${index}">取消對應</button></div>`;
            }
            return `<div class="gi-row">${name}<button class="btn btn-blue btn-small gi-restore" data-index="${index}">找回</button></div>`;
        };

        const bulk = gachaImport.tab === 'pending'
            ? `<div class="gi-bulk"><span class="gi-bulk-label">勾選的活動（${gachaImport.checkedRids.size}）：</span>
               <button class="btn btn-gray btn-small" id="giResetDefaults">套用建議</button>
               <button class="btn btn-gray btn-small" id="giSkipAll">先不處理</button>
               <button class="btn btn-gray btn-small" id="giUncheckAll">取消勾選</button></div>`
            : '';
        // 依月份收合 (最新的月份在上面)；只有展開的月份才產生內容
        const months = [];
        groupGachaRows(rows).forEach((group) => {
            const month = /^\d{4}-\d{2}/.test(group.record.date || '') ? group.record.date.slice(0, 7) : '日期不明';
            let entry = months.find((m) => m.month === month);
            if (!entry) {
                entry = { month, groups: [], count: 0 };
                months.push(entry);
            }
            entry.groups.push(group);
            entry.count += group.items.length;
        });
        const openKey = (month) => `${gachaImport.tab}|${month}`;
        // 每個分頁第一次顯示時，只展開最新的月份
        if (!gachaImport.openMonths) {
            gachaImport.openMonths = new Set();
            gachaImport.seenTabs = new Set();
        }
        if (!gachaImport.seenTabs.has(gachaImport.tab)) {
            gachaImport.seenTabs.add(gachaImport.tab);
            if (months.length) gachaImport.openMonths.add(openKey(months[0].month));
        }

        list.innerHTML = bulk + months.map(({ month, groups, count }) => {
            const open = gachaImport.openMonths.has(openKey(month));
            const body = open ? groups.map((group) => `
                <div class="gi-group">
                    ${gachaImport.tab === 'pending'
                        ? `<label class="gi-group-title"><input type="checkbox" class="gi-check" data-rid="${escapeHtml(group.record.id)}"${gachaImport.checkedRids.has(String(group.record.id)) ? ' checked' : ''}> ${escapeHtml(gachaRecordLabel(group.record))}</label>`
                        : `<div class="gi-group-title">${escapeHtml(gachaRecordLabel(group.record))}</div>`}
                    ${group.items.map(({ row, index }) => itemHtml(row, index)).join('')}
                </div>`).join('') : '';
            return `<div class="gi-month">
                <button class="gi-month-title" data-month="${escapeHtml(month)}">${open ? '▾' : '▸'} ${escapeHtml(month)}<span class="gi-month-count">${count} 隻</span></button>
                ${body}
            </div>`;
        }).join('');
    }

    function renderGachaAccounts() {
        const counts = new Map();
        gachaImport.records.forEach((r) => counts.set(r.account, (counts.get(r.account) || 0) + 1));
        const accounts = [...counts.keys()];
        DOM.gachaAccountSelect.innerHTML = '';
        accounts.forEach((a) => addOption(DOM.gachaAccountSelect, a, `${a} (${counts.get(a)} 筆)`));
        // 這個存檔上次選的帳號；第一次用時選紀錄最多的帳號
        gachaImport.account = accounts.includes(state.gachaAccount)
            ? state.gachaAccount
            : [...counts].sort((a, b) => b[1] - a[1]).map(([a]) => a)[0] || '';
        DOM.gachaAccountSelect.value = gachaImport.account;
        DOM.gachaAccountSelect.disabled = accounts.length === 0;
    }

    async function openGachaImport() {
        gachaImport.tab = 'pending';
        DOM.gachaImportSource.textContent = '讀取抽卡紀錄中...';
        DOM.gachaImportList.innerHTML = '';
        DOM.confirmGachaImportBtn.style.display = 'none';
        toggleModal(DOM.gachaImportModal, true);
        try {
            const { records, source } = await loadGachaRecords();
            gachaImport.records = records;
            const recovered = recoverRenamedGachaEntries();
            const dated = backfillGachaLinkDates();
            if (recovered > 0 || dated > 0) commit();
            DOM.gachaImportSource.textContent = `資料來源：${source}`
                + (recovered > 0 ? `（${recovered} 隻在抽卡統計改過名字的角色已自動接回）` : '');
        } catch (e) {
            console.error('[GACHA] 讀取抽卡紀錄失敗', e);
            DOM.gachaImportSource.textContent = '讀取抽卡紀錄失敗，請檢查網路後再試一次。';
            return;
        }
        renderGachaAccounts();
        gachaImport.openMonths = null;   // 打開時只展開最新的月份
        gachaImport.checkedRids.clear();
        buildGachaRows();
        renderGachaImport();
    }

    // 對應時選了「用果實分配的名字」：先改抽卡統計 (只在登入時改雲端；未登入時請使用者自己改)
    async function applyGachaRenames(rows) {
        const wanted = new Map();
        rows.filter((row) => row.rename === 'fruit').forEach((row) => {
            if (!wanted.has(row.name)) wanted.set(row.name, baseNameOf(parseLinkAction(row.action).n));
        });
        const renamed = new Map();
        const manual = [];
        const failed = [];
        const loggedIn = isCloudMode && currentUser && db;

        for (const [oldName, newName] of wanted) {
            if (!loggedIn) {
                manual.push(`「${oldName}」→「${newName}」`);
                continue;
            }
            const count = gachaImport.records.filter((r) => parseGachaCharacters(r.notes).some((c) => c.name === oldName)).length;
            const ok = await customConfirm(`抽卡統計有 ${count} 筆紀錄（所有帳號）寫成「${oldName}」，要全部改成「${newName}」嗎？\n（按取消的話，只對應、不改名字）`, '修改抽卡統計');
            if (!ok) continue;
            try {
                await renameInGachaCloud(oldName, newName);
                renamed.set(oldName, newName);
                gachaImport.records.forEach((r) => { r.notes = replaceGachaName(r.notes, oldName, newName); });
                renameGachaEntries(oldName, newName);
            } catch (e) {
                console.error('[GACHA] 修改抽卡統計失敗', e);
                failed.push(oldName);
            }
        }
        return { renamed, manual, failed };
    }

    async function performGachaImport() {
        const rows = gachaImport.pending.filter((row) => row.action && row.action !== 'skip');
        if (rows.length === 0) return customAlert('沒有要處理的角色（都設為「先不處理」）。');

        // 同一個角色不能對應兩次
        const targets = rows.filter((row) => row.action.startsWith('link:')).map((row) => row.action.slice(5));
        const dup = targets.find((t, i) => targets.indexOf(t) !== i);
        if (dup) return customAlert(`「${dup.split('|').slice(1).join('|')}」被選了兩次對應，同一個角色只能對應一隻。`);

        DOM.confirmGachaImportBtn.disabled = true;
        let gachaResult;
        try {
            gachaResult = await applyGachaRenames(rows);
        } finally {
            DOM.confirmGachaImportBtn.disabled = false;
        }

        // 抽卡統計改了名字：同名的其他列 (例如第二隻要新增的) 也改用新名字取名
        // 沒改成的 (按取消或失敗) 照原本的名字取名
        gachaImport.pending.forEach((row) => {
            if (gachaResult.renamed.has(row.name)) row.name = gachaResult.renamed.get(row.name);
        });
        assignGachaNewNames(false);

        const done = { add: 0, link: 0, trash: 0, renamed: [] };
        const applyRow = (row) => {
            const entry = ensureGachaEntry(row.rid, row.name);
            if (row.action.startsWith('add:')) {
                const t = row.action === 'add:storage' ? 'storage' : 'main';
                charList(t).push(row.newName);
                if (t === 'storage' && !state.storageAssignments[row.newName]) state.storageAssignments[row.newName] = Array(FRUITS_PER_CHAR).fill('');
                entry.linked.push({ n: row.newName, t, d: row.record.date || '' });
                done.add++;
            } else if (row.action.startsWith('link:')) {
                const { t, n } = parseLinkAction(row.action);
                let target = n;
                if (row.rename === 'gacha') {
                    // 果實分配的角色改用抽卡統計的名字
                    const newName = renamedTarget(n, row.name, t);
                    if (!renameCharacterData(n, newName, t)) {
                        done.renamed.push(`「${n}」→「${newName}」`);
                        target = newName;
                    }
                }
                entry.linked.push({ n: target, t, d: row.record.date || '' });
                done.link++;
            } else if (row.action === 'trash') {
                entry.trashed++;
                done.trash++;
            }
        };
        // 先處理不改名的，改名的最後做 (改名時才看得到新增的名字，避免撞名)
        rows.filter((row) => row.rename !== 'gacha').forEach(applyRow);
        rows.filter((row) => row.rename === 'gacha').forEach(applyRow);

        state.gachaAccount = gachaImport.account;
        commit();
        buildGachaRows();
        renderGachaImport();

        const lines = [`已新增 ${done.add} 位、對應 ${done.link} 位、移到垃圾桶 ${done.trash} 位。`];
        if (done.renamed.length) lines.push(`果實分配已改名：${done.renamed.join('、')}`);
        if (gachaResult.renamed.size) lines.push(`抽卡統計已改名：${[...gachaResult.renamed].map(([a, b]) => `「${a}」→「${b}」`).join('、')}`);
        if (gachaResult.manual.length) lines.push(`目前沒有登入，抽卡統計沒有改名，請到抽卡統計手動修改：${gachaResult.manual.join('、')}`);
        if (gachaResult.failed.length) lines.push(`抽卡統計改名失敗（請檢查網路後再試一次）：${gachaResult.failed.map((n) => `「${n}」`).join('、')}`);
        customAlert(lines.join('\n'), '匯入完成');
    }

    function bindGachaImportEvents() {
        DOM.gachaImportBtn.onclick = openGachaImport;
        DOM.confirmGachaImportBtn.onclick = performGachaImport;

        DOM.gachaShowDate.checked = readShowDate();
        DOM.gachaShowDate.onchange = () => {
            try { localStorage.setItem(GACHA_SHOW_DATE_KEY, DOM.gachaShowDate.checked ? '1' : '0'); } catch (e) { /* 無法保存設定時只影響這次 */ }
            renderGachaImport();
        };

        DOM.gachaAccountSelect.onchange = () => {
            gachaImport.account = DOM.gachaAccountSelect.value;
            gachaImport.openMonths = null;   // 換帳號時只展開最新的月份
            gachaImport.checkedRids.clear();
            buildGachaRows();
            renderGachaImport();
        };

        document.querySelectorAll('.gi-tab').forEach((btn) => {
            btn.onclick = () => {
                gachaImport.tab = btn.dataset.giTab;
                renderGachaImport();
            };
        });

        // 改動作時只更新結果文字 (新增的編號會跟著其他列的選擇變動)
        DOM.gachaImportList.onchange = async (e) => {
            if (e.target.classList.contains('gi-check')) {
                const rid = e.target.dataset.rid;
                if (e.target.checked) gachaImport.checkedRids.add(rid);
                else gachaImport.checkedRids.delete(rid);
                const label = DOM.gachaImportList.querySelector('.gi-bulk-label');
                if (label) label.textContent = `勾選的活動（${gachaImport.checkedRids.size}）：`;
                return;
            }
            if (!e.target.classList.contains('gi-action')) return;
            const row = gachaImport.pending[Number(e.target.dataset.index)];
            const previous = row.action;
            const previousRename = row.rename;
            row.action = e.target.value;
            row.rename = null;

            // 對應到名字不同的角色：選用哪個名字 (按 × 則取消這次選擇)
            if (namesDiffer(row)) {
                const { n } = parseLinkAction(row.action);
                const fruitBase = baseNameOf(n);
                const choice = await customChoice(
                    `抽卡統計寫的是「${row.name}」，果實分配是「${n}」。要統一成哪個名字？`,
                    '選擇名字',
                    [
                        { value: 'gacha', label: `用「${row.name}」（改果實分配）`, cls: 'btn-blue' },
                        { value: 'fruit', label: `用「${fruitBase}」（改抽卡統計）`, cls: 'btn-blue' },
                        { value: 'none', label: '兩邊都不改', cls: 'btn-gray' }
                    ]
                );
                if (choice === null) {
                    row.action = previous;
                    row.rename = previousRename;
                    e.target.value = previous;
                } else {
                    row.rename = choice === 'none' ? null : choice;
                }
            }
            assignGachaNewNames();
            gachaImport.pending.forEach((row, i) => {
                const el = DOM.gachaImportList.querySelector(`[data-result="${i}"]`);
                if (el) el.textContent = gachaActionResult(row);
            });
        };

        DOM.gachaImportList.onclick = (e) => {
            const target = e.target;
            const monthBtn = target.closest('.gi-month-title');
            if (monthBtn) {
                const key = `${gachaImport.tab}|${monthBtn.dataset.month}`;
                if (gachaImport.openMonths.has(key)) gachaImport.openMonths.delete(key);
                else gachaImport.openMonths.add(key);
                return renderGachaImport();
            }
            if (['giResetDefaults', 'giSkipAll'].includes(target.id) && gachaImport.checkedRids.size === 0) {
                return customAlert('請先在活動名稱旁打勾，再選擇要套用的動作。');
            }
            if (target.id === 'giResetDefaults') {
                setDefaultGachaActions(gachaImport.checkedRids);
                return renderGachaImport();
            }
            if (target.id === 'giSkipAll') {
                gachaImport.pending.forEach((row) => {
                    if (!gachaImport.checkedRids.has(row.rid)) return;
                    row.action = 'skip';
                    row.rename = null;
                });
                assignGachaNewNames();
                return renderGachaImport();
            }
            if (target.id === 'giUncheckAll') {
                gachaImport.checkedRids.clear();
                return renderGachaImport();
            }
            const index = Number(target.dataset.index);
            if (target.classList.contains('gi-unlink')) {
                // 只解除對應，果實分配裡的角色不會被刪除
                const { rid, name, link } = gachaImport.imported[index];
                const entry = findGachaEntry(rid, name);
                if (entry) entry.linked = entry.linked.filter((l) => l !== link);
            } else if (target.classList.contains('gi-restore')) {
                const { rid, name } = gachaImport.trashed[index];
                const entry = findGachaEntry(rid, name);
                if (entry && entry.trashed > 0) entry.trashed--;
            } else {
                return;
            }
            commit();
            buildGachaRows();
            renderGachaImport();
        };
    }

    // 改名時，對應到這個角色的抽卡紀錄也跟著改
    function renameGachaLinks(oldName, newName, type) {
        state.gachaImports.forEach((entry) => entry.linked.forEach((l) => {
            if (l.t === type && l.n === oldName) l.n = newName;
        }));
    }

    // 讀入的匯入狀態格式不對時丟掉該筆，避免畫面出錯
    function sanitizeGachaImports(list) {
        if (!Array.isArray(list)) return [];
        return list
            .filter((e) => e && typeof e.rid === 'string' && typeof e.name === 'string')
            .map((e) => ({
                rid: e.rid,
                name: e.name,
                linked: Array.isArray(e.linked)
                    ? e.linked.filter((l) => l && typeof l.n === 'string' && (l.t === 'main' || l.t === 'storage')).map((l) => ({ n: l.n, t: l.t, d: typeof l.d === 'string' ? l.d : '' }))
                    : [],
                trashed: Number.isInteger(e.trashed) && e.trashed > 0 ? e.trashed : 0
            }));
    }


    // =====================================================
    // 9. 渲染
    // =====================================================
    function updateTitle() {
        const name = state.recordName ? `${state.recordName}的果實分配` : '果實分配';
        if (DOM.mainTitle) DOM.mainTitle.textContent = name;

        const cache = getSlotNameCache();
        if (state.recordName && state.recordName.trim() !== '') cache[currentSlot] = state.recordName;
        else delete cache[currentSlot];
        setSlotNameCache(cache);
        renderSlotOptions();
    }

    function renderAll() {
        updateTitle();
        renderCharacters();
        renderOverviewCards();
        renderBankSelectors();
        renderStorageTable();
        renderTable();
        updatePresetCharacterSelect();

        if (DOM.storageCharCount) DOM.storageCharCount.textContent = state.storageCharacters.length;
        if (DOM.uncompletedCharCount) DOM.uncompletedCharCount.textContent = getUncompletedCharacterCount();
    }

    function createOverviewItem(fruitName, usageData, totalStock) {
        const item = document.createElement('div');
        item.className = 'inventory-item';

        const totalAssigned = usageData?.total || 0;
        const obtainedCount = usageData?.obtained || 0;
        const needed = totalAssigned - obtainedCount;
        const diff = totalStock - needed;

        let diffText = '';
        let diffClass = '';

        if (diff === 0) {
            diffText = '剛好';
            diffClass = 'diff-ok';
        } else if (diff > 0) {
            diffText = `多 ${diff}`;
            diffClass = 'diff-more';
        } else {
            diffText = `缺 ${Math.abs(diff)}`;
            diffClass = 'diff-less';
        }

        item.innerHTML = `
            <strong style="margin-bottom: 5px; text-align: center;">${escapeHtml(fruitName)}</strong>
            <div class="status-indicator ${diffClass}">
                ${diffClass === 'diff-less' ? '⚠️' : diffClass === 'diff-more' ? '📦' : '✓'} ${diffText}
            </div>
            <div class="overview-footer">
                <span style="font-weight: bold;">分配: ${totalAssigned}</span>
                <span>已獲得: ${obtainedCount}</span>
                <span style="font-weight: bold;">庫存: ${totalStock}</span>
            </div>
        `;
        return item;
    }

    function renderOverviewCards() {
        DOM.attackFruitsOverview.innerHTML = '';
        DOM.otherFruitsOverview.innerHTML = '';
        const usageData = getFruitUsageData();
        const stockData = getTotalStockCounts();

        const appendFruits = (categories, container) => {
            const fragment = document.createDocumentFragment();
            categories.forEach((category) => {
                (state.fruitCategories[category] || []).forEach((f) => {
                    const totalStock = stockData[f] || 0;
                    if ((usageData[f]?.total || 0) > 0 || totalStock > 0) {
                        fragment.appendChild(createOverviewItem(f, usageData[f], totalStock));
                    }
                });
            });
            container.appendChild(fragment);
        };

        appendFruits(ATTACK_CATEGORIES, DOM.attackFruitsOverview);
        appendFruits([OTHER_CATEGORY], DOM.otherFruitsOverview);
    }

    function renderBankSelectors() {
        DOM.bankFruitSelectors.innerHTML = '';
        const optionsHtml = '<option value="">(空)</option>' + getFruitOptionsHtml();
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < BANK_SLOTS; i++) {
            const container = document.createElement('div');
            container.className = 'inventory-item bank-slot';
            const select = document.createElement('select');
            select.innerHTML = optionsHtml;
            select.value = state.bankAssignments[i] || '';
            const fruitName = state.bankAssignments[i];
            select.onchange = () => {
                state.bankAssignments[i] = select.value;
                commit();
            };
            container.innerHTML = `<strong>鳥籠 ${i + 1}</strong>`;
            container.appendChild(select);

            if (fruitName) {
                const neededSlots = getNeededCharacterSlots(fruitName);
                const hasDestination = getAvailableDestinationSlots(fruitName);
                if (neededSlots.length > 0 || hasDestination.bank.length > 0 || hasDestination.storage.length > 0) {
                    const transferBtn = document.createElement('button');
                    transferBtn.className = 'btn btn-green';
                    transferBtn.style.cssText = 'font-size: 12px; padding: 4px 8px; margin-top: 5px; width: 100%;';
                    transferBtn.textContent = '⚡ 轉移果實';
                    transferBtn.onclick = () => initTransferModal(fruitName, 'bank', i);
                    container.appendChild(transferBtn);
                } else {
                    const placeholder = document.createElement('div');
                    placeholder.textContent = '✓ 無需轉移或無空位';
                    placeholder.style.cssText = 'font-size: 12px; color: #28a745; margin-top: 5px;';
                    container.appendChild(placeholder);
                }
            }
            fragment.appendChild(container);
        }
        DOM.bankFruitSelectors.appendChild(fragment);
    }

    function renderCharacters(searchTerm = '') {
        DOM.characterListUl.innerHTML = '';
        DOM.characterCount.textContent = state.characters.length;
        const filtered = searchTerm
            ? state.characters.filter((n) => n.toLowerCase().includes(searchTerm.toLowerCase()))
            : state.characters;

        if (filtered.length === 0) {
            DOM.characterListUl.innerHTML = '<li style="text-align:center; color:#999; padding:10px;">無符合角色</li>';
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach((name) => {
            const li = document.createElement('li');
            li.className = 'character-list-item';
            const span = document.createElement('span');
            span.textContent = name;

            const actionDiv = document.createElement('div');
            actionDiv.className = 'character-actions';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-edit';
            renameBtn.style.cssText = 'padding: 2px 8px; font-size: 12px;';
            renameBtn.textContent = '✏️';
            renameBtn.title = '重新命名';
            renameBtn.onclick = () => renameCharacter(name, 'main');

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-red';
            delBtn.style.cssText = 'padding: 2px 8px; font-size: 12px;';
            delBtn.textContent = '🗑️';
            delBtn.title = '刪除角色';
            delBtn.onclick = async () => {
                if (await customConfirm(`確定刪除「${name}」？`)) {
                    state.characters = state.characters.filter((c) => c !== name);
                    delete state.fruitAssignments[name];
                    delete state.fruitObtained[name];
                    commit();
                    renderCharacters(DOM.modalCharacterSearch.value);
                }
            };

            actionDiv.appendChild(renameBtn);
            actionDiv.appendChild(delBtn);
            li.appendChild(span);
            li.appendChild(actionDiv);
            fragment.appendChild(li);
        });
        DOM.characterListUl.appendChild(fragment);
    }

    function renderStorageTable() {
        DOM.storageTableBody.innerHTML = '';
        const term = DOM.searchStorageChar.value.trim().toLowerCase();
        let targets = state.storageCharacters;
        if (term) {
            targets = targets.filter((name) => {
                if (name.toLowerCase().includes(term)) return true;
                const assigned = state.storageAssignments[name] || [];
                return assigned.some((f) => f && f.toLowerCase().includes(term));
            });
        }
        if (targets.length === 0) {
            DOM.storageTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">無符合倉庫資料</td></tr>';
            return;
        }

        const optionsHtml = '<option value="">(空)</option>' + getFruitOptionsHtml();
        const fragment = document.createDocumentFragment();

        targets.forEach((name) => {
            if (!state.storageAssignments[name] || state.storageAssignments[name].length !== FRUITS_PER_CHAR) {
                state.storageAssignments[name] = (state.storageAssignments[name] || [])
                    .concat(Array(FRUITS_PER_CHAR).fill('')).slice(0, FRUITS_PER_CHAR);
            }
            const assigned = state.storageAssignments[name];
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            row.appendChild(nameCell);

            let hasAnyFruit = false;
            for (let i = 0; i < FRUITS_PER_CHAR; i++) {
                const cell = document.createElement('td');
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '5px';
                const select = document.createElement('select');
                select.innerHTML = optionsHtml;
                select.value = assigned[i] || '';
                select.style.width = '100%';
                select.onchange = () => {
                    state.storageAssignments[name][i] = select.value;
                    commit();
                };
                wrapper.appendChild(select);
                if (assigned[i]) hasAnyFruit = true;
                cell.appendChild(wrapper);
                row.appendChild(cell);
            }

            const actionCell = document.createElement('td');
            actionCell.style.display = 'flex';
            actionCell.style.gap = '5px';
            actionCell.style.alignItems = 'center';
            actionCell.style.justifyContent = 'space-between';

            const btnGroup = document.createElement('div');
            btnGroup.style.display = 'flex';
            btnGroup.style.gap = '5px';

            const renameBtn = document.createElement('button');
            renameBtn.className = 'btn btn-edit';
            renameBtn.textContent = '✏️';
            renameBtn.style.padding = '8px 10px';
            renameBtn.title = '重新命名';
            renameBtn.onclick = () => renameCharacter(name, 'storage');

            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-red';
            delBtn.textContent = '🗑️';
            delBtn.style.padding = '8px 10px';
            delBtn.title = '刪除角色';
            delBtn.onclick = async () => {
                if (await customConfirm(`確定刪除倉庫角色「${name}」？`)) {
                    state.storageCharacters = state.storageCharacters.filter((c) => c !== name);
                    delete state.storageAssignments[name];
                    commit();
                }
            };

            btnGroup.appendChild(renameBtn);
            btnGroup.appendChild(delBtn);
            actionCell.appendChild(btnGroup);

            if (hasAnyFruit) {
                const transferBtn = document.createElement('button');
                transferBtn.className = 'btn btn-blue';
                transferBtn.textContent = '⚡';
                transferBtn.title = '移出果實';
                transferBtn.style.padding = '8px 10px';
                transferBtn.onclick = () => initTransferModal(null, 'storage', name);
                actionCell.appendChild(transferBtn);
            }
            row.appendChild(actionCell);
            fragment.appendChild(row);
        });
        DOM.storageTableBody.appendChild(fragment);
    }

    function renderTable() {
        DOM.fruitTableBody.innerHTML = '';
        const searchTerm = DOM.searchInput.value.trim().toLowerCase();
        const shouldFilter = DOM.filterModeCheckbox.checked;
        const shouldHideCompleted = DOM.hideCompletedCheckbox.checked;
        const sortMode = DOM.sortCharacterBy.value;

        // 複製一份再處理，避免排序時改動到 state.characters 的原始順序
        let targetChars = [...state.characters];
        if (shouldHideCompleted) targetChars = targetChars.filter((charName) => !isCharacterCompleted(charName));
        if (shouldFilter && searchTerm) {
            targetChars = targetChars.filter((name) => {
                if (name.toLowerCase().includes(searchTerm)) return true;
                const assigned = state.fruitAssignments[name] || [];
                return assigned.some((fruit) => fruit && fruit.toLowerCase().includes(searchTerm));
            });
        }
        if (sortMode === 'unassigned_asc') {
            targetChars.sort((a, b) => getUnassignedFruitCount(a) - getUnassignedFruitCount(b));
        } else if (sortMode === 'unassigned_desc') {
            targetChars.sort((a, b) => getUnassignedFruitCount(b) - getUnassignedFruitCount(a));
        } else if (sortMode === 'gacha_date_desc') {
            // 依對應的抽卡活動日期，新的在上面；同一天依紀錄順序；沒對應的放最下面 (保持加入順序)
            const dates = getGachaDateMap();
            const order = new Map(state.characters.map((n, i) => [n, i]));
            targetChars.sort((a, b) => {
                const da = dates.get(a);
                const db = dates.get(b);
                if (da && db) {
                    if (da.date !== db.date) return da.date < db.date ? 1 : -1;
                    if (da.rid !== db.rid) return Number(db.rid) - Number(da.rid);
                } else if (da || db) {
                    return da ? -1 : 1;
                }
                return order.get(a) - order.get(b);
            });
        }

        if (targetChars.length === 0) {
            DOM.fruitTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px;">無符合資料</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const optionsHtml = '<option value="">未選擇</option>' + getFruitOptionsHtml();
        const stockCounts = getTotalStockCounts();
        const usageData = getFruitUsageData();

        targetChars.forEach((name) => {
            const assigned = state.fruitAssignments[name] || [];
            if (!state.fruitObtained[name]) state.fruitObtained[name] = [];
            const row = document.createElement('tr');
            if (isCharacterCompleted(name)) row.classList.add('row-completed');

            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.setAttribute('data-label', '角色');
            row.appendChild(nameCell);

            for (let i = 0; i < FRUITS_PER_CHAR; i++) {
                const cell = document.createElement('td');
                cell.setAttribute('data-label', `果實 ${i + 1}`);
                const wrapper = document.createElement('div');
                wrapper.className = 'select-wrapper';

                const select = document.createElement('select');
                select.innerHTML = optionsHtml;
                if (assigned[i]) select.value = assigned[i];

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!(state.fruitObtained[name] && state.fruitObtained[name][i]);
                checkbox.style.display = assigned[i] ? 'inline-block' : 'none';

                select.onchange = () => {
                    if (!state.fruitAssignments[name]) state.fruitAssignments[name] = [];
                    state.fruitAssignments[name][i] = select.value;
                    if (!select.value && state.fruitObtained[name]) state.fruitObtained[name][i] = false;
                    // 分配改完剛好符合某個組合：自動加上 (或換成) 註記
                    const tag = detectCharacterTag(name);
                    const { notice } = tag ? tagCharacter(name, tag) : { notice: '' };
                    commit();
                    if (notice) customAlert(notice);
                };
                checkbox.onchange = () => {
                    if (!state.fruitObtained[name]) state.fruitObtained[name] = [];
                    state.fruitObtained[name][i] = checkbox.checked;
                    commit();
                };

                wrapper.appendChild(select);

                // 已分配、未獲得，且庫存有這顆果實：可直接從鳥籠 / 倉庫搬入
                if (assigned[i] && !checkbox.checked && stockCounts[assigned[i]] > 0) {
                    const pullBtn = document.createElement('button');
                    pullBtn.type = 'button';
                    pullBtn.className = 'btn btn-blue btn-pull';
                    pullBtn.textContent = '📥';
                    // 尚需 = 所有主力角色分配到此果實但未獲得的數量，讓使用者知道庫存夠不夠分
                    const usage = usageData[assigned[i]];
                    const stillNeeded = usage ? usage.total - usage.obtained : 0;
                    pullBtn.title = `從鳥籠 / 倉庫搬入「${assigned[i]}」(庫存 ${stockCounts[assigned[i]]} / 尚需 ${stillNeeded})`;
                    pullBtn.onclick = () => initPullModal(name, i);
                    wrapper.appendChild(pullBtn);
                }

                wrapper.appendChild(checkbox);
                cell.appendChild(wrapper);
                row.appendChild(cell);
            }
            fragment.appendChild(row);
        });
        DOM.fruitTableBody.appendChild(fragment);
    }

    function updatePresetCharacterSelect() {
        const filtered = getFilteredCharacters();
        const term = DOM.searchInput.value.trim().toLowerCase();
        const currentVal = DOM.presetCharacterSelect.value;
        DOM.presetCharacterSelect.innerHTML = '<option value="">選擇角色</option>';
        const searchFiltered = term ? filtered.filter((n) => n.toLowerCase().includes(term)) : filtered;
        searchFiltered.forEach((n) => addOption(DOM.presetCharacterSelect, n, n));
        if (searchFiltered.includes(currentVal)) DOM.presetCharacterSelect.value = currentVal;
        else if (searchFiltered.length === 1) DOM.presetCharacterSelect.value = searchFiltered[0];
    }

    // 角色改名 (清單 + 分配 / 已獲得 / 倉庫果實 + 抽卡對應)；名稱已存在時回傳錯誤訊息
    function renameCharacterData(oldName, newName, type) {
        const renameKey = (obj) => {
            if (obj[oldName]) {
                obj[newName] = obj[oldName];
                delete obj[oldName];
            }
        };

        if (type === 'main') {
            if (state.characters.includes(newName)) return '此角色名稱已存在！';
            const idx = state.characters.indexOf(oldName);
            if (idx !== -1) state.characters[idx] = newName;
            renameKey(state.fruitAssignments);
            renameKey(state.fruitObtained);
        } else if (type === 'storage') {
            if (state.storageCharacters.includes(newName)) return '此倉庫角色名稱已存在！';
            const idx = state.storageCharacters.indexOf(oldName);
            if (idx !== -1) state.storageCharacters[idx] = newName;
            renameKey(state.storageAssignments);
        }
        renameGachaLinks(oldName, newName, type);
        return '';
    }

    // 主力角色名稱加上 (或換成) 註記；撞名時不改名，回傳提示
    function tagCharacter(name, tag) {
        const tagged = `${stripTag(name)}(${tag})`;
        if (tagged === name) return { name, notice: '' };
        const error = renameCharacterData(name, tagged, 'main');
        return error ? { name, notice: `已有「${tagged}」，「${name}」沒有加上註記。` } : { name: tagged, notice: '' };
    }

    // 依分配判斷註記：
    //   同族 / 戰型 / 擊種：分配了該類的 2 顆以上 (例如同族加擊 + 同族加擊速 + 速必 → 同族)
    //   雙削：分配了將消與兵消
    //   符合兩種以上 (例如同族 2 顆 + 戰型 2 顆) 時判斷不出來，不加註記
    const TYPE_TAGS = ['同族', '戰型', '擊種'];
    function detectCharacterTag(name) {
        const fruits = (state.fruitAssignments[name] || []).filter(Boolean);
        const inCategory = (fruit, tag) => (state.fruitCategories[tag] || []).includes(fruit) || fruit.startsWith(tag);
        const matches = TYPE_TAGS.filter((tag) => fruits.filter((f) => inCategory(f, tag)).length >= 2);
        if (fruits.includes('將消') && fruits.includes('兵消')) matches.push('雙削');
        return matches.length === 1 ? matches[0] : '';
    }

    // 依分配幫所有主力角色加註記 (已經是正確註記的不動)
    async function autoTagAllCharacters() {
        const changes = state.characters
            .map((name) => ({ name, tag: detectCharacterTag(name) }))
            .filter(({ name, tag }) => tag && `${stripTag(name)}(${tag})` !== name);
        if (changes.length === 0) return customAlert('沒有需要加上註記的角色（已加好或分配不符合任何組合）。');

        const preview = changes.slice(0, 10).map(({ name, tag }) => `${name} → ${stripTag(name)}(${tag})`).join('\n');
        const more = changes.length > 10 ? `\n……等 ${changes.length} 個` : '';
        if (!(await customConfirm(`會幫 ${changes.length} 個角色加上註記：\n${preview}${more}`, '依分配自動加註記'))) return;

        const notices = [];
        let done = 0;
        changes.forEach(({ name, tag }) => {
            const { notice } = tagCharacter(name, tag);
            if (notice) notices.push(notice);
            else done++;
        });
        commit();
        customAlert([`已幫 ${done} 個角色加上註記。`, ...notices].join('\n'), '完成');
    }

    async function renameCharacter(oldName, type) {
        const newName = await customInput(`請輸入「${oldName}」的新名稱：`, oldName);
        if (!newName || newName === oldName) return;

        const error = renameCharacterData(oldName, newName, type);
        if (error) return customAlert(error);

        commit();
        customAlert(`已將「${oldName}」更名為「${newName}」。`);

        if (type === 'main') renderCharacters(DOM.modalCharacterSearch.value);
    }


    // =====================================================
    // 10. 事件綁定
    // =====================================================
    function bindSlotEvents() {
        DOM.saveSlotSelect.onchange = (e) => changeSlot(e.target.value);
        DOM.addSlotBtn.onclick = addSlot;
        DOM.deleteSlotBtn.onclick = deleteSlot;

        DOM.renameSlotBtn.onclick = async () => {
            const newName = await customInput('請輸入此存檔的名稱：', state.recordName);
            if (newName !== null) { // 允許空字串 (清除名稱)
                state.recordName = newName;
                saveData();
                updateTitle();
            }
        };

        if (DOM.logoutBtn) {
            DOM.logoutBtn.onclick = async () => {
                const { signOut } = window.firebaseModules || {};
                if (!auth || !signOut) return location.reload();
                try {
                    // 登出前先送出尚未儲存的變更 (登出後畫面會換回本機資料)
                    if (saveTimeout) await saveData(true);
                    await signOut(auth);
                    sessionStorage.removeItem(USER_CACHE_KEY);
                    customAlert('已成功登出，畫面已切換為這台電腦的本機資料。', '登出');
                } catch (error) {
                    console.error('Sign out error', error);
                }
            };
        }

        if (DOM.loginBtn) {
            DOM.loginBtn.onclick = async () => {
                const { GoogleAuthProvider, signInWithPopup } = window.firebaseModules || {};
                if (!auth || !GoogleAuthProvider) return customAlert('雲端服務尚未載入完成，請稍後再試。');
                try {
                    const provider = new GoogleAuthProvider();
                    provider.setCustomParameters({ prompt: 'select_account' });
                    await signInWithPopup(auth, provider);
                } catch (error) {
                    console.error('Login failed', error);
                    if (error.code !== 'auth/popup-closed-by-user') customAlert(`登入失敗：${error.message}`);
                }
            };
        }
    }

    function bindModalEvents() {
        document.querySelectorAll('.close-modal, .close-btn-action, .transfer-close').forEach((btn) => {
            btn.onclick = () => toggleModal(btn.closest('.modal'), false);
        });

        window.onclick = (e) => {
            if (e.target.classList.contains('modal')) toggleModal(e.target, false);
        };

        DOM.confirmTransferBtn.onclick = performTransfer;
        DOM.confirmPullBtn.onclick = performPull;

        $('showCharacterList').onclick = () => {
            DOM.modalCharacterSearch.value = '';
            renderCharacters();
            toggleModal(DOM.characterModal, true);
        };
    }

    function bindTabEvents() {
        DOM.tabBtns.forEach((btn) => {
            btn.onclick = () => {
                DOM.tabBtns.forEach((b) => b.classList.remove('active'));
                DOM.tabContents.forEach((c) => c.classList.remove('active'));

                btn.classList.add('active');
                $(btn.dataset.tab).classList.add('active');
                if (btn.dataset.tab === 'tab-overview') renderOverviewCards();
            };
        });
    }

    function bindBackupEvents() {
        $('loadData').onclick = () => $('loadFile').click();

        $('loadFile').onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = async (evt) => {
                let d;
                try {
                    let result = evt.target.result;
                    if (result.charCodeAt(0) === 0xFEFF) result = result.substr(1);
                    d = JSON.parse(result);
                    if (!d || typeof d !== 'object') throw new Error('格式錯誤');
                } catch (err) {
                    console.error(err);
                    return customAlert('載入失敗：檔案格式錯誤。');
                }

                const slotName = getSelectedSlotText();
                if (!(await customConfirm(`載入「${file.name}」會覆蓋目前存檔【${slotName}】的所有資料，確定嗎？`))) return;

                try {

                    state.characters = Array.isArray(d.characters) ? d.characters : [];
                    state.fruitAssignments = asObject(d.fruitAssignments, {});
                    if (d.fruitInventory && typeof d.fruitInventory === 'object' && !d.bankAssignments) {
                        customAlert('偵測到舊版庫存資料，已嘗試自動轉換至新版 BANK 介面。');
                        state.bankAssignments = Array(BANK_SLOTS).fill('');
                    } else {
                        state.bankAssignments = normalizeBank(d.bankAssignments);
                    }
                    state.fruitCategories = asObject(d.fruitCategories, cloneDefaultFruits());
                    state.fruitObtained = asObject(d.fruitObtained, {});
                    state.storageCharacters = Array.isArray(d.storageCharacters) ? d.storageCharacters : [];
                    state.storageAssignments = asObject(d.storageAssignments, {});
                    state.recordName = typeof d.recordName === 'string' ? d.recordName : '';
                    state.gachaImports = sanitizeGachaImports(d.gachaImports);
                    state.gachaAccount = typeof d.gachaAccount === 'string' ? d.gachaAccount : '';

                    for (const key in state.fruitObtained) {
                        if (Array.isArray(state.fruitObtained[key])) state.fruitObtained[key] = state.fruitObtained[key].map((v) => !!v);
                    }
                    commit();
                    customAlert(`成功載入：${state.recordName || '未命名紀錄'}`);
                } catch (err) {
                    console.error(err);
                    customAlert('載入失敗：檔案格式錯誤。');
                }
            };
            reader.readAsText(file);
            e.target.value = '';
        };

        $('saveData').onclick = () => {
            downloadJson(pickData(), `${state.recordName || '果實分配'}_${dateStamp()}.json`);
        };
    }

    function bindCharacterEvents() {
        $('addCharacter').onclick = () => {
            const name = DOM.newCharacter.value.trim();
            if (name && !state.characters.includes(name)) {
                state.characters.push(name);
                commit();
                DOM.newCharacter.value = '';
            } else if (state.characters.includes(name)) {
                customAlert('角色已存在');
            }
        };

        DOM.newCharacter.onkeydown = (e) => { if (isEnterKey(e)) $('addCharacter').click(); };

        DOM.modalCharacterSearch.oninput = debounce(() => renderCharacters(DOM.modalCharacterSearch.value), SEARCH_DEBOUNCE_MS);

        $('resetCharacterList').onclick = async () => {
            if (await customConfirm('重置清單？將清除所有主力角色。')) {
                state.characters = [];
                state.fruitAssignments = {};
                state.fruitObtained = {};
                commit();
            }
        };
    }

    function bindFruitEvents() {
        $('addFruit').onclick = () => {
            const name = $('newFruitName').value.trim();
            const cat = $('newFruitCategory').value;
            if (!name) return customAlert('請輸入名稱');
            if (getAllFruits().includes(name)) return customAlert('果實已存在');
            const target = cat === '加擊類' ? ATTACK_CATEGORIES[0] : OTHER_CATEGORY;
            if (!state.fruitCategories[target]) state.fruitCategories[target] = [];
            state.fruitCategories[target].push(name);
            commit();
            $('newFruitName').value = '';
        };

        $('newFruitName').onkeydown = (e) => { if (isEnterKey(e)) $('addFruit').click(); };

        $('deleteFruitBtn').onclick = () => {
            DOM.deleteFruitSelect.innerHTML = '<option value="">請選擇果實</option>';
            getAllFruits().forEach((f) => addOption(DOM.deleteFruitSelect, f, f));
            toggleModal(DOM.deleteFruitModal, true);
        };

        $('confirmDeleteFruit').onclick = async () => {
            const name = DOM.deleteFruitSelect.value;
            if (!name) return;
            if (await customConfirm(`確定刪除「${name}」？`)) {
                const clearName = (f) => (f === name ? '' : f);
                Object.keys(state.fruitCategories).forEach((k) => {
                    state.fruitCategories[k] = state.fruitCategories[k].filter((f) => f !== name);
                });
                state.bankAssignments = state.bankAssignments.map(clearName);
                // 主力角色：清空分配的同時取消「已獲得」，避免之後重新分配時直接顯示為已獲得
                Object.keys(state.fruitAssignments).forEach((c) => {
                    const obtained = state.fruitObtained[c];
                    state.fruitAssignments[c] = (state.fruitAssignments[c] || []).map((f, i) => {
                        if (f !== name) return f;
                        if (obtained) obtained[i] = false;
                        return '';
                    });
                });
                Object.keys(state.storageAssignments).forEach((c) => {
                    state.storageAssignments[c] = (state.storageAssignments[c] || []).map(clearName);
                });
                commit();
                toggleModal(DOM.deleteFruitModal, false);
            }
        };
    }

    function bindBankAndStorageEvents() {
        $('resetBank').onclick = async () => {
            if (await customConfirm(`確定重置所有 ${BANK_SLOTS} 個鳥籠的果實種類？`)) {
                state.bankAssignments = Array(BANK_SLOTS).fill('');
                commit();
            }
        };

        DOM.addStorageCharBtn.onclick = () => {
            const name = DOM.newStorageChar.value.trim();
            if (name && !state.storageCharacters.includes(name)) {
                state.storageCharacters.push(name);
                if (!state.storageAssignments[name]) state.storageAssignments[name] = Array(FRUITS_PER_CHAR).fill('');
                commit();
                DOM.newStorageChar.value = '';
            } else if (state.storageCharacters.includes(name)) {
                customAlert('倉庫角色已存在');
            }
        };

        DOM.newStorageChar.onkeydown = (e) => { if (isEnterKey(e)) DOM.addStorageCharBtn.click(); };

        DOM.searchStorageChar.oninput = debounce(renderStorageTable, SEARCH_DEBOUNCE_MS);
    }

    function bindAssignmentEvents() {
        const refreshTable = () => { renderTable(); updatePresetCharacterSelect(); };
        DOM.searchInput.oninput = debounce(refreshTable, SEARCH_DEBOUNCE_MS);
        DOM.filterModeCheckbox.onchange = () => renderTable();
        DOM.hideCompletedCheckbox.onchange = refreshTable;
        DOM.sortCharacterBy.onchange = refreshTable;

        // 快速分配組合
        PRESETS.forEach(({ btnId, fruits: targets, tag }) => {
            $(btnId).onclick = () => {
                let char = DOM.presetCharacterSelect.value;
                if (!char) return customAlert('請先選擇角色');

                const all = getAllFruits();
                const missing = targets.filter((t) => !all.includes(t));
                if (missing.length > 0) return customAlert(`果實清單中無此果實：${missing.join(', ')}`);

                // 名稱加上 (或換成) 這個組合的註記：虹夏 → 虹夏(同族)、虹夏(同族) → 虹夏(戰型)
                const result = tagCharacter(char, tag);
                const { notice } = result;
                char = result.name;

                state.fruitAssignments[char] = Array.from({ length: FRUITS_PER_CHAR }, (_, i) => targets[i] || '');
                state.fruitObtained[char] = Array(FRUITS_PER_CHAR).fill(false);
                commit();
                DOM.presetCharacterSelect.value = char;
                if (notice) customAlert(notice);
            };
        });

        $('autoTagCharacters').onclick = autoTagAllCharacters;

        $('resetPresetCharacter').onclick = async () => {
            const char = DOM.presetCharacterSelect.value;
            if (!char) return customAlert('請先選擇角色');
            if (await customConfirm(`重置「${char}」的分配？`)) {
                state.fruitAssignments[char] = [];
                state.fruitObtained[char] = [];
                commit();
            }
        };

        $('resetAssignments').onclick = async () => {
            if (await customConfirm('重置所有主力角色分配？')) {
                state.fruitAssignments = {};
                state.fruitObtained = {};
                commit();
            }
        };
    }

    function bindResetAllEvent() {
        $('resetAllData').onclick = async () => {
            const slotName = getSelectedSlotText();
            if (!(await customConfirm(`⚠️ 確定要初始化【${slotName}】的所有資料嗎？此動作無法復原。`))) return;

            // 清除本地儲存 (僅清除當前槽位) 與記憶體資料
            clearLocalSlotData(currentSlot);
            clearMemoryData();

            // 清除該槽位的名稱快取
            const cache = getSlotNameCache();
            delete cache[currentSlot];
            setSlotNameCache(cache);
            renderSlotOptions();

            // 雲端模式：以空資料覆蓋雲端文件
            let cloudFailed = false;
            if (isCloudMode && currentUser && db) {
                clearTimeout(saveTimeout);   // 取消尚未送出的儲存，避免舊資料在清空後又寫回雲端
                try {
                    const result = await writeToCloud();
                    if (result.conflict) {
                        // 其他裝置剛改過：不清空雲端，改為載入最新資料讓使用者確認
                        return handleSaveConflict(result, {
                            backup: false,
                            message: `${CONFLICT_PREFIX}已重新載入最新資料，雲端資料沒有被清空。請確認內容後，如仍要初始化請再操作一次。`
                        });
                    }
                    updateCloudStatus('online', `雲端資料已清空 (${slotName})`);
                } catch (e) {
                    console.error('[CLOUD] 清空雲端資料失敗', e);
                    updateCloudStatus('offline', '雲端清空失敗');
                    cloudFailed = true;
                }
            }
            renderAll();
            customAlert(cloudFailed
                ? `已重置本機的【${slotName}】，但雲端資料清空失敗，請檢查網路後再試一次。`
                : `已重置【${slotName}】。`);
        };
    }

    function bindEvents() {
        bindSlotEvents();
        bindModalEvents();
        bindTabEvents();
        bindBackupEvents();
        bindCharacterEvents();
        bindFruitEvents();
        bindBankAndStorageEvents();
        bindAssignmentEvents();
        bindResetAllEvent();
        bindGachaImportEvents();
    }


    // =====================================================
    // 啟動
    // =====================================================
    bindEvents();
    initApp();
});
