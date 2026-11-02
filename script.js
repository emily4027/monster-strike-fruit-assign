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
    const PRESETS = [
        { btnId: 'presetBtn1', fruits: ['同族加擊', '同族加命擊', '同族加擊速'] },
        { btnId: 'presetBtn2', fruits: ['戰型加擊', '戰型加命擊', '戰型加擊速'] },
        { btnId: 'presetBtn3', fruits: ['擊種加擊', '擊種加命擊', '擊種加擊速'] },
        { btnId: 'presetBtn4', fruits: ['將消', '兵消', '速必'] }
    ];

    // 需要存檔 / 備份 / 雲端同步的資料欄位 (單一來源)
    const DATA_FIELDS = [
        'characters', 'fruitAssignments', 'fruitCategories', 'fruitObtained',
        'bankAssignments', 'storageCharacters', 'storageAssignments', 'recordName'
    ];


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
        recordName: ''
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

    const addOption = (select, value, text) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        select.appendChild(option);
    };

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
        transferSlotSelect: $('transferSlotSelect'),
        confirmTransferBtn: $('confirmTransferBtn'),
        storageSourceSelector: $('storageSourceSelector'),
        storageSourceSlotSelect: $('storageSourceSlotSelect'),

        // 雲端狀態
        cloudStatus: $('cloudStatus'),
        cloudStatusText: $('cloudStatusText'),
        statusDot: document.querySelector('.status-dot')
    };

    // 轉移視窗的兩個說明文字 (目標容器 / 目標欄位)
    const [transferTargetLabel, transferSlotLabel] = DOM.transferTargetContainer.querySelectorAll('p');

    // Firebase 相關
    let db = null;
    let auth = null;
    let currentUser = null;
    let isCloudMode = false;
    let saveTimeout = null;
    let envAppId = 'default-app-id';

    // 存檔槽位
    let currentSlot = 'default';
    let slotList = readJson('global_slot_list', null) || [...DEFAULT_SLOT_LIST];

    // 所有存檔資料 (欄位見 DATA_FIELDS)
    let state = createDefaultState();

    // 轉移狀態
    let currentTransfer = { sourceType: '', sourceIndex: -1, fruitName: '' };
    let storageSourceSlots = {};


    // =====================================================
    // 4. 存檔：LocalStorage / 雲端 / 存檔槽位
    // =====================================================
    const localKeyFor = (slot, key) => (slot === 'default' ? key : `${slot}_${key}`);
    const getLocalKey = (key) => localKeyFor(currentSlot, key);
    const getSaveDocName = () => (currentSlot === 'default' ? 'fruit_assign' : `fruit_assign_${currentSlot}`);

    const getSlotNameCache = () => readJson('slot_names_cache', {});
    const setSlotNameCache = (cache) => localStorage.setItem('slot_names_cache', JSON.stringify(cache));

    const getSelectedSlotText = (fallback = '') =>
        DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex]?.text || fallback;

    const pickData = () => {
        const data = {};
        DATA_FIELDS.forEach((field) => { data[field] = state[field]; });
        return data;
    };

    // 將讀到的資料套用到 state (缺少的欄位使用預設值)
    function applyData(data) {
        const defaults = createDefaultState();
        DATA_FIELDS.forEach((field) => { state[field] = data[field] || defaults[field]; });
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
    function loadFromLocalStorage() {
        try {
            state = createDefaultState();
            DATA_FIELDS.forEach((field) => {
                const item = localStorage.getItem(getLocalKey(field));
                if (field === 'recordName') state.recordName = item || '';
                else if (item) state[field] = JSON.parse(item);
            });
            if (state.bankAssignments.length !== BANK_SLOTS) state.bankAssignments = Array(BANK_SLOTS).fill('');
            console.log(`[DATA] LocalStorage 載入成功 (Slot: ${currentSlot})`);
        } catch (e) {
            console.error('LocalStorage 讀取失敗', e);
        }
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
    const getCloudDocRef = (uid) => {
        const { doc } = window.firebaseModules;
        return doc(db, 'artifacts', envAppId, 'users', uid, 'fruit_data', getSaveDocName());
    };

    const cacheCloudData = (uid, data) => sessionStorage.setItem(DATA_CACHE_PREFIX + uid, JSON.stringify(data));

    // 完整覆寫雲端文件 (不使用 merge，避免已刪除 / 改名的舊資料殘留在雲端)
    async function writeToCloud() {
        const { setDoc } = window.firebaseModules;
        const dataToSave = { ...pickData(), lastUpdated: new Date() };
        cacheCloudData(currentUser.uid, dataToSave);
        await setDoc(getCloudDocRef(currentUser.uid), dataToSave);
    }

    // 統一儲存 (雲端模式使用 Debounce；isImmediate 用於切換存檔等需要等待完成的情況)
    async function saveData(isImmediate = false) {
        if (isCloudMode && currentUser && db) {
            const performSave = async () => {
                try {
                    updateCloudStatus('saving', `儲存中 (${getSelectedSlotText(currentSlot)})...`);
                    await writeToCloud();
                    updateCloudStatus('online', `已同步至雲端 (${getSelectedSlotText()})`);
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

    async function changeSlot(newSlot) {
        // 1. 先儲存當前進度 (強制立即執行並等待完成)
        await saveData(true);

        updateCloudStatus('saving', '切換存檔中...');

        // 2. 切換槽位並清空目前資料
        currentSlot = newSlot;
        DOM.saveSlotSelect.value = newSlot;
        clearMemoryData();

        // 3. 重新載入資料
        if (isCloudMode && currentUser && db) {
            try {
                const { getDoc } = window.firebaseModules;
                const docSnap = await getDoc(getCloudDocRef(currentUser.uid));

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
                console.error('[CLOUD] 切換讀取失敗', e);
                loadFromLocalStorage();
                updateCloudStatus('offline', '切換讀取失敗，使用本地');
            }
        } else {
            loadFromLocalStorage();
            localStorage.setItem('lastSelectedSlot', currentSlot);
        }

        // 無論成功或失敗，最後都要重新渲染
        renderAll();
    }

    async function addSlot() {
        const newSlotId = `slot_${Date.now()}`;
        slotList.push(newSlotId);
        localStorage.setItem('global_slot_list', JSON.stringify(slotList));
        renderSlotOptions();

        await changeSlot(newSlotId);
        customAlert('已新增空白存檔。');
    }

    async function deleteSlot() {
        if (slotList.length <= 1) return customAlert('至少保留一個存檔！');
        if (currentSlot === 'default') return customAlert('無法刪除預設存檔，請先切換到其他存檔再進行操作，或直接使用「全部初始化」功能。');

        const slotName = getSelectedSlotText();
        if (await customConfirm(`確定要刪除「${slotName}」嗎？此操作無法復原。`)) {
            const deletedSlot = currentSlot;

            slotList = slotList.filter((id) => id !== deletedSlot);
            localStorage.setItem('global_slot_list', JSON.stringify(slotList));
            clearLocalSlotData(deletedSlot);

            const cache = getSlotNameCache();
            delete cache[deletedSlot];
            setSlotNameCache(cache);

            await changeSlot('default');
            customAlert(`已刪除「${slotName}」。`);
        }
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
    }

    // 從 sessionStorage 快取立即還原畫面 (不用等 Firebase)
    function checkAuthCache() {
        const cachedUserStr = sessionStorage.getItem(USER_CACHE_KEY);
        if (!cachedUserStr) return;

        try {
            const cachedUser = JSON.parse(cachedUserStr);
            renderAuthUI(cachedUser);

            const cachedDataStr = sessionStorage.getItem(DATA_CACHE_PREFIX + cachedUser.uid);
            if (cachedDataStr) {
                applyData(JSON.parse(cachedDataStr));

                const lastSlot = localStorage.getItem('lastSelectedSlot');
                if (lastSlot && slotList.includes(lastSlot)) currentSlot = lastSlot;

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

        // 若已有資料 (來自 sessionStorage 快取)，不顯示 Loading
        if (state.characters.length === 0) updateCloudStatus('saving', '正在從雲端載入...');

        try {
            const { getDoc } = window.firebaseModules;
            const docSnap = await getDoc(getCloudDocRef(user.uid));

            if (docSnap.exists()) {
                const data = docSnap.data();
                cacheCloudData(user.uid, data);
                applyData(data);
                updateCloudStatus('online', `雲端就緒 (${getSelectedSlotText()})`);
                renderAll();
            } else if (currentSlot === 'default' && localStorage.getItem('characters')) {
                // 雲端無資料：把瀏覽器本地資料備份上雲端
                loadFromLocalStorage();
                saveData();
                renderAll();
                customAlert(`歡迎！已自動將您原本在瀏覽器的資料備份至雲端帳號 (${user.uid})。`);
            } else {
                updateTitle();
                updateCloudStatus('online', '雲端就緒 (新資料)');
                renderAll();
            }
        } catch (e) {
            console.error('[CLOUD] 讀取雲端資料錯誤', e);
            if (state.characters.length === 0) {
                loadFromLocalStorage();
                renderAll();
            }
            isCloudMode = false;
            updateTitle();
            updateCloudStatus('offline', '雲端讀取錯誤');
        }
    }

    function handleUserLogout() {
        isCloudMode = false;
        updateCloudStatus('offline', '未偵測到帳戶 (離線模式)');
        if (state.characters.length === 0) {
            loadFromLocalStorage();
            updateTitle();
            renderAll();
        }
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
        checkAuthCache();
        renderSlotOptions();

        const lastSlot = localStorage.getItem('lastSelectedSlot');
        if (lastSlot && slotList.includes(lastSlot)) {
            currentSlot = lastSlot;
            DOM.saveSlotSelect.value = currentSlot;
        }

        waitForFirebase();
    }


    // =====================================================
    // 6. Modal (提示 / 確認 / 輸入)
    // =====================================================
    function toggleModal(modal, show) {
        if (show) modal.classList.add('show');
        else modal.classList.remove('show');
    }

    function customAlert(message, title = '提示') {
        $('alertTitle').textContent = title;
        $('alertMessage').textContent = message;
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
            inputField.onkeyup = (e) => { if (e.key === 'Enter') okBtn.click(); };
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

    // 目標選單：先選「容器 (角色)」，再選「欄位」
    function populateTargetGroups(destinations, groupKey, countSuffix, slotPlaceholder, buildSlotOption) {
        const groups = new Map();
        destinations.forEach((slot) => {
            const key = slot[groupKey];
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(slot);
        });

        groups.forEach((slots, name) => addOption(DOM.transferTargetSelect, name, `${name} (${slots.length} ${countSuffix})`));

        DOM.transferTargetSelect.onchange = () => {
            const selected = DOM.transferTargetSelect.value;
            DOM.transferSlotSelect.innerHTML = '';
            addOption(DOM.transferSlotSelect, '', slotPlaceholder);
            if (selected && groups.has(selected)) {
                groups.get(selected).forEach((slot) => {
                    const { value, text } = buildSlotOption(slot, selected);
                    addOption(DOM.transferSlotSelect, value, text);
                });
            }
        };
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
        DOM.transferSlotSelect.innerHTML = '';
        DOM.transferTargetContainer.style.display = 'none';

        DOM.transferDestinationType.onchange = () => {
            const type = DOM.transferDestinationType.value;
            DOM.transferTargetSelect.innerHTML = '';
            DOM.transferSlotSelect.innerHTML = '';
            DOM.transferTargetSelect.onchange = null; // 清除上一種目標類型留下的事件
            DOM.transferTargetContainer.style.display = 'none';

            if (!type) return;

            const destinations = allDestinations[type];
            DOM.transferTargetContainer.style.display = 'block';

            if (type === 'bank') {
                transferTargetLabel.textContent = '目標鳥籠:';
                transferSlotLabel.textContent = '位置: (鳥籠只有一個位置)';

                addOption(DOM.transferTargetSelect, '', '請選擇空閒鳥籠');
                destinations.forEach((slot) => addOption(DOM.transferTargetSelect, slot.id, slot.text));
                addOption(DOM.transferSlotSelect, '0', '唯一位置');
                DOM.transferSlotSelect.value = '0';
                if (destinations.length === 1) DOM.transferTargetSelect.value = destinations[0].id;

            } else if (type === 'main') {
                transferTargetLabel.textContent = '目標主力角色:';
                transferSlotLabel.textContent = '目標果實欄位:';

                addOption(DOM.transferTargetSelect, '', '請選擇角色');
                populateTargetGroups(destinations, 'char', '需', '請選擇欄位', (slot, selectedChar) => ({
                    value: slot.slot - 1,
                    text: `${slot.slotText} (分配: ${state.fruitAssignments[selectedChar][slot.slot - 1]})`
                }));

            } else if (type === 'storage') {
                transferTargetLabel.textContent = '目標倉庫角色:';
                transferSlotLabel.textContent = '目標果實欄位:';

                addOption(DOM.transferTargetSelect, '', '請選擇倉庫角色');
                populateTargetGroups(destinations, 'name', '空位', '請選擇空位', (slot) => ({
                    value: slot.id[1],
                    text: slot.slotText
                }));
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
        DOM.transferSlotSelect.innerHTML = '';

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

    function performTransfer() {
        const targetType = DOM.transferDestinationType.value;
        const targetContainer = DOM.transferTargetSelect.value;
        let targetSlotIndex = parseInt(DOM.transferSlotSelect.value, 10);

        if (!targetType || !targetContainer) return customAlert('請完整選擇目標類型和容器！');
        if (targetType === 'bank') targetSlotIndex = 0;
        else if (isNaN(targetSlotIndex)) return customAlert('請完整選擇目標欄位！');

        const { sourceType, fruitName, sourceIndex } = currentTransfer;
        let transferSuccess = false;

        // 1. 從來源移除
        if (sourceType === 'bank') {
            if (state.bankAssignments[sourceIndex] === fruitName) {
                state.bankAssignments[sourceIndex] = '';
                transferSuccess = true;
            }
        } else if (sourceType === 'storage') {
            const [charName, slotIndex] = sourceIndex;
            if (state.storageAssignments[charName] && state.storageAssignments[charName][slotIndex] === fruitName) {
                state.storageAssignments[charName][slotIndex] = '';
                transferSuccess = true;
            }
        }

        if (!transferSuccess) return customAlert('轉移失敗：來源果實狀態不正確或已被移除。');

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
        }

        if (targetChars.length === 0) {
            DOM.fruitTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px;">無符合資料</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        const optionsHtml = '<option value="">未選擇</option>' + getFruitOptionsHtml();

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
                    if (!select.value) state.fruitObtained[name][i] = false;
                    commit();
                };
                checkbox.onchange = () => {
                    if (!state.fruitObtained[name]) state.fruitObtained[name] = [];
                    state.fruitObtained[name][i] = checkbox.checked;
                    commit();
                };

                wrapper.appendChild(select);
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

    async function renameCharacter(oldName, type) {
        const newName = await customInput(`請輸入「${oldName}」的新名稱：`, oldName);
        if (!newName || newName === oldName) return;

        // 同步更名：清單 + 對應資料表
        const renameKey = (obj) => {
            if (obj[oldName]) {
                obj[newName] = obj[oldName];
                delete obj[oldName];
            }
        };

        if (type === 'main') {
            if (state.characters.includes(newName)) return customAlert('此角色名稱已存在！');

            const idx = state.characters.indexOf(oldName);
            if (idx !== -1) state.characters[idx] = newName;
            renameKey(state.fruitAssignments);
            renameKey(state.fruitObtained);

        } else if (type === 'storage') {
            if (state.storageCharacters.includes(newName)) return customAlert('此倉庫角色名稱已存在！');

            const idx = state.storageCharacters.indexOf(oldName);
            if (idx !== -1) state.storageCharacters[idx] = newName;
            renameKey(state.storageAssignments);
        }

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
            DOM.logoutBtn.onclick = () => {
                const { signOut } = window.firebaseModules;
                if (auth && signOut) {
                    signOut(auth).then(() => {
                        sessionStorage.removeItem(USER_CACHE_KEY);
                        customAlert('已成功登出', '登出');
                    }).catch((error) => {
                        console.error('Sign out error', error);
                    });
                } else {
                    location.reload();
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
            reader.onload = (evt) => {
                try {
                    let result = evt.target.result;
                    if (result.charCodeAt(0) === 0xFEFF) result = result.substr(1);
                    const d = JSON.parse(result);

                    state.characters = Array.isArray(d.characters) ? d.characters : [];
                    state.fruitAssignments = asObject(d.fruitAssignments, {});
                    if (d.fruitInventory && typeof d.fruitInventory === 'object' && !d.bankAssignments) {
                        customAlert('偵測到舊版庫存資料，已嘗試自動轉換至新版 BANK 介面。');
                        state.bankAssignments = Array(BANK_SLOTS).fill('');
                    } else {
                        state.bankAssignments = Array.isArray(d.bankAssignments) ? d.bankAssignments : Array(BANK_SLOTS).fill('');
                    }
                    state.fruitCategories = asObject(d.fruitCategories, cloneDefaultFruits());
                    state.fruitObtained = asObject(d.fruitObtained, {});
                    state.storageCharacters = Array.isArray(d.storageCharacters) ? d.storageCharacters : [];
                    state.storageAssignments = asObject(d.storageAssignments, {});
                    state.recordName = typeof d.recordName === 'string' ? d.recordName : '';

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
            const now = new Date();
            const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
            const blob = new Blob([JSON.stringify(pickData(), null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = state.recordName ? `${state.recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`;
            a.click();
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
                Object.keys(state.fruitAssignments).forEach((c) => {
                    state.fruitAssignments[c] = (state.fruitAssignments[c] || []).map(clearName);
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

        DOM.searchStorageChar.oninput = debounce(renderStorageTable, SEARCH_DEBOUNCE_MS);
    }

    function bindAssignmentEvents() {
        const refreshTable = () => { renderTable(); updatePresetCharacterSelect(); };
        DOM.searchInput.oninput = debounce(refreshTable, SEARCH_DEBOUNCE_MS);
        DOM.filterModeCheckbox.onchange = () => renderTable();
        DOM.hideCompletedCheckbox.onchange = refreshTable;
        DOM.sortCharacterBy.onchange = refreshTable;

        // 快速分配組合
        PRESETS.forEach(({ btnId, fruits: targets }) => {
            $(btnId).onclick = () => {
                const char = DOM.presetCharacterSelect.value;
                if (!char) return customAlert('請先選擇角色');

                const all = getAllFruits();
                const missing = targets.filter((t) => !all.includes(t));
                if (missing.length > 0) return customAlert(`果實清單中無此果實：${missing.join(', ')}`);

                state.fruitAssignments[char] = Array.from({ length: FRUITS_PER_CHAR }, (_, i) => targets[i] || '');
                state.fruitObtained[char] = Array(FRUITS_PER_CHAR).fill(false);
                commit();
            };
        });

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
            if (isCloudMode && currentUser && db) {
                await writeToCloud();
                updateCloudStatus('online', `雲端資料已清空 (${slotName})`);
            }
            renderAll();
            customAlert(`已重置【${slotName}】。`);
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
    }


    // =====================================================
    // 啟動
    // =====================================================
    bindEvents();
    initApp();
});
