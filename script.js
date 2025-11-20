document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 資料初始化 ---
    const defaultFruits = {
        "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
        "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
        "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
        "其他": ["將消", "兵消", "熱友", "速必"]
    };
    const BANK_SLOTS = 7; // 固定 7 個鳥籠

    // 快取 DOM 元素
    const fruitTransferModal = document.getElementById('fruitTransferModal');
    const transferSourceMessage = document.getElementById('transferSourceMessage');
    const transferTargetContainer = document.getElementById('transferTargetContainer');
    const transferDestinationType = document.getElementById('transferDestinationType');
    const transferTargetSelect = document.getElementById('transferTargetSelect');
    const transferSlotSelect = document.getElementById('transferSlotSelect');
    const confirmTransferBtn = document.getElementById('confirmTransferBtn');
    
    // [修改] 更新 DOM 物件，新增倉庫來源選擇 DOM 和計數器
    const DOM = {
        mainTitle: document.getElementById('mainTitle'),
        recordName: document.getElementById('recordName'),
        newCharacter: document.getElementById('newCharacter'),
        characterCount: document.getElementById('characterCount'),
        
        // Tab 相關
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // 總覽卡片 DOM
        attackFruitsOverview: document.getElementById('attackFruitsOverview'), 
        otherFruitsOverview: document.getElementById('otherFruitsOverview'), 
        
        bankFruitSelectors: document.getElementById('bankFruitSelectors'), // BANK 選單容器

        // 倉庫相關
        newStorageChar: document.getElementById('newStorageChar'),
        addStorageCharBtn: document.getElementById('addStorageChar'),
        searchStorageChar: document.getElementById('searchStorageChar'),
        storageTableBody: document.getElementById('storageTableBody'),
        storageCharCount: document.getElementById('storageCharCount'), 
        
        // 分配區
        fruitTableBody: document.getElementById('fruitTableBody'),
        searchInput: document.getElementById('searchCharacter'),
        filterModeCheckbox: document.getElementById('filterModeCheckbox'),
        hideCompletedCheckbox: document.getElementById('hideCompletedCheckbox'),
        presetCharacterSelect: document.getElementById('presetCharacter'),
        uncompletedCharCount: document.getElementById('uncompletedCharCount'),
        sortCharacterBy: document.getElementById('sortCharacterBy'),
        
        // [新增] 存檔切換
        saveSlotSelect: document.getElementById('saveSlotSelect'),

        // Modal
        characterModal: document.getElementById('characterModal'),
        characterListUl: document.getElementById('characterList'),
        modalCharacterSearch: document.getElementById('modalCharacterSearch'),
        deleteFruitModal: document.getElementById('deleteFruitModal'),
        deleteFruitSelect: document.getElementById('deleteFruitSelect'),
        alertModal: document.getElementById('alertModal'),
        confirmModal: document.getElementById('confirmModal'),
        
        // 轉移 Modal 相關
        fruitTransferModal: fruitTransferModal,
        transferSourceMessage: transferSourceMessage,
        transferTargetContainer: transferTargetContainer,
        transferDestinationType: transferDestinationType,
        transferTargetSelect: transferTargetSelect,
        transferSlotSelect: transferSlotSelect,
        confirmTransferBtn: confirmTransferBtn,
        storageSourceSelector: document.getElementById('storageSourceSelector'),
        storageSourceSlotSelect: document.getElementById('storageSourceSlotSelect'),

        // [新增] 雲端狀態指示器
        cloudStatus: document.getElementById('cloudStatus'),
        cloudStatusText: document.getElementById('cloudStatusText'),
        statusDot: document.querySelector('.status-dot')
    };

    // Firebase 相關變數
    let db = null;
    let auth = null;
    let currentUser = null;
    let isCloudMode = false; // 標記是否為雲端模式
    let saveTimeout = null;  // 用於 Debounce

    // [新增] 存檔槽位相關變數
    let currentSlot = 'default'; // 'default', 'slot2', 'slot3'...

    // 資料變數 (預設為空，等待載入)
    let fruitCategories = JSON.parse(JSON.stringify(defaultFruits));
    let characters = []; 
    let fruitAssignments = {}; 
    let fruitObtained = {};
    let bankAssignments = Array(BANK_SLOTS).fill(''); 
    let storageCharacters = []; 
    let storageAssignments = {}; 
    let recordName = '';

    // 轉移狀態追蹤
    let currentTransfer = {
        sourceType: '', // 'bank' 或 'storage'
        sourceIndex: -1, // bank: 鳥籠索引, storage: [角色名稱, 果實索引]
        fruitName: ''
    };
    let storageSourceSlots = {}; 

    // -----------------------------------------------------
    // 🚀 雲端同步與存檔管理邏輯
    // -----------------------------------------------------

    // 更新雲端狀態燈
    function updateCloudStatus(status, msg) {
        DOM.cloudStatus.style.display = 'flex';
        DOM.cloudStatusText.textContent = msg;
        DOM.statusDot.className = 'status-dot'; // reset
        
        if (status === 'online') {
            DOM.statusDot.classList.add('status-online');
        } else if (status === 'saving') {
            DOM.statusDot.classList.add('status-saving');
        } else {
            DOM.statusDot.classList.add('status-offline');
        }
    }

    // [新增] 取得當前存檔對應的 LocalStorage Key
    function getLocalKey(key) {
        if (currentSlot === 'default') return key;
        return `${currentSlot}_${key}`;
    }

    // [新增] 取得當前存檔對應的 Firebase Doc ID
    function getSaveDocName() {
        if (currentSlot === 'default') return "fruit_assign";
        return `fruit_assign_${currentSlot}`;
    }

    // 讀取 LocalStorage (支援多存檔)
    function loadFromLocalStorage() {
        try {
            const load = (baseKey, def) => {
                const key = getLocalKey(baseKey);
                const item = localStorage.getItem(key);
                return item ? JSON.parse(item) : def;
            };

            // 載入前先初始化變數
            characters = load('characters', []);
            fruitAssignments = load('fruitAssignments', {});
            fruitObtained = load('fruitObtained', {});
            
            // 處理 Bank
            const bankKey = getLocalKey('bankAssignments');
            bankAssignments = load('bankAssignments', Array(BANK_SLOTS).fill(''));
            
            // 兼容舊版 (僅限 Default Slot)
            if (currentSlot === 'default') {
                const oldInventory = localStorage.getItem('fruitInventory');
                if (oldInventory && !localStorage.getItem(bankKey)) {
                    bankAssignments = Array(BANK_SLOTS).fill('');
                }
            }
            
            fruitCategories = load('fruitCategories', JSON.parse(JSON.stringify(defaultFruits)));
            storageCharacters = load('storageCharacters', []);
            storageAssignments = load('storageAssignments', {});
            recordName = localStorage.getItem(getLocalKey('recordName')) || '';

            if (bankAssignments.length !== BANK_SLOTS) bankAssignments = Array(BANK_SLOTS).fill('');

            console.log(`已從 LocalStorage 載入資料 (Slot: ${currentSlot})`);
        } catch (e) {
            console.error("LocalStorage 讀取失敗", e);
        }
    }

    // 統一儲存函式 (含 Debounce 與多存檔支援)
    function saveData() {
        // 如果是雲端模式，使用 Debounce 寫入 Firestore
        if (isCloudMode && currentUser && db) {
            updateCloudStatus('saving', `儲存中 (${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text})...`);
            
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(async () => {
                try {
                    const dataToSave = {
                        characters,
                        fruitAssignments,
                        fruitCategories,
                        fruitObtained,
                        bankAssignments,
                        storageCharacters,
                        storageAssignments,
                        recordName,
                        lastUpdated: new Date()
                    };
                    
                    const { doc, setDoc } = window.firebaseModules;
                    // 使用動態 Doc ID
                    const docId = getSaveDocName();
                    const userDocRef = doc(db, "users", currentUser.uid, "apps", docId);
                    await setDoc(userDocRef, dataToSave, { merge: true });
                    
                    updateCloudStatus('online', `已同步至雲端 (${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text})`);
                    console.log(`雲端儲存成功 (Doc: ${docId})`);
                } catch (e) {
                    console.error("雲端儲存失敗", e);
                    updateCloudStatus('offline', '儲存失敗');
                }
            }, 1000); // 延遲 1 秒存檔
        } else {
            // 降級模式：存入 LocalStorage (使用前綴 Key)
            localStorage.setItem(getLocalKey('characters'), JSON.stringify(characters));
            localStorage.setItem(getLocalKey('fruitAssignments'), JSON.stringify(fruitAssignments));
            if (currentSlot === 'default') localStorage.setItem('fruitInventory', JSON.stringify({})); // 兼容
            localStorage.setItem(getLocalKey('fruitCategories'), JSON.stringify(fruitCategories));
            localStorage.setItem(getLocalKey('fruitObtained'), JSON.stringify(fruitObtained));
            localStorage.setItem(getLocalKey('bankAssignments'), JSON.stringify(bankAssignments));
            localStorage.setItem(getLocalKey('storageCharacters'), JSON.stringify(storageCharacters));
            localStorage.setItem(getLocalKey('storageAssignments'), JSON.stringify(storageAssignments));
            localStorage.setItem(getLocalKey('recordName'), recordName);
            
            // 記憶上次選擇的 Slot
            localStorage.setItem('lastSelectedSlot', currentSlot);
            
            if (!isCloudMode) updateCloudStatus('offline', `離線模式: ${currentSlot}`);
        }
    }

    // [新增] 清空記憶體中的資料 (切換存檔用)
    function clearMemoryData() {
        characters = []; 
        fruitAssignments = {}; 
        fruitObtained = {};
        bankAssignments = Array(BANK_SLOTS).fill(''); 
        storageCharacters = []; 
        storageAssignments = {}; 
        recordName = '';
        fruitCategories = JSON.parse(JSON.stringify(defaultFruits));
    }

    // [新增] 切換存檔邏輯
    async function changeSlot(newSlot) {
        // 1. 先儲存當前進度 (避免切換流失) - 立即執行不 Debounce
        saveData(); 
        
        updateCloudStatus('saving', '切換存檔中...');
        
        // 2. 更新 Slot 指標
        currentSlot = newSlot;
        DOM.saveSlotSelect.value = newSlot;
        
        // 3. 清空當前變數
        clearMemoryData();
        
        // 4. 重新載入資料
        if (isCloudMode && currentUser && db) {
            try {
                const { doc, getDoc } = window.firebaseModules;
                const docId = getSaveDocName();
                const userDocRef = doc(db, "users", currentUser.uid, "apps", docId);
                const docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    characters = data.characters || [];
                    fruitAssignments = data.fruitAssignments || {};
                    fruitCategories = data.fruitCategories || JSON.parse(JSON.stringify(defaultFruits));
                    fruitObtained = data.fruitObtained || {};
                    bankAssignments = data.bankAssignments || Array(BANK_SLOTS).fill('');
                    storageCharacters = data.storageCharacters || [];
                    storageAssignments = data.storageAssignments || {};
                    recordName = data.recordName || '';
                    updateCloudStatus('online', `已載入: ${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text}`);
                } else {
                    // 該 Slot 尚無雲端資料，嘗試讀取本地 (若是第一次用這個 Slot)
                    loadFromLocalStorage();
                    updateCloudStatus('online', `新存檔: ${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text}`);
                }
            } catch(e) {
                console.error("切換讀取失敗", e);
                loadFromLocalStorage(); // 降級
                updateCloudStatus('offline', '切換讀取失敗，使用本地');
            }
        } else {
            loadFromLocalStorage();
            localStorage.setItem('lastSelectedSlot', currentSlot);
        }
        
        // 5. 渲染
        renderAll();
    }

    // 初始化應用程式
    async function initApp() {
        // 恢復上次選擇的 Slot (僅限離線初始化，雲端會蓋過)
        const lastSlot = localStorage.getItem('lastSelectedSlot');
        if (lastSlot && ['default', 'slot2', 'slot3', 'slot4', 'slot5'].includes(lastSlot)) {
            currentSlot = lastSlot;
            DOM.saveSlotSelect.value = lastSlot;
        }

        // 綁定切換事件
        DOM.saveSlotSelect.onchange = (e) => {
            changeSlot(e.target.value);
        };

        // 等待 Firebase SDK 載入
        const checkFirebase = setInterval(async () => {
            if (window.firebaseApp && window.firebaseAuth) {
                clearInterval(checkFirebase);
                
                db = window.firebaseDb;
                auth = window.firebaseAuth;
                const { onAuthStateChanged } = window;
                const { doc, getDoc } = window.firebaseModules;

                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        // === 使用者已登入 (雲端模式) ===
                        currentUser = user;
                        isCloudMode = true;
                        updateCloudStatus('saving', '正在從雲端載入...');

                        try {
                            const docId = getSaveDocName();
                            const userDocRef = doc(db, "users", user.uid, "apps", docId);
                            const docSnap = await getDoc(userDocRef);

                            if (docSnap.exists()) {
                                // 1. 雲端有資料 -> 載入雲端資料
                                const data = docSnap.data();
                                characters = data.characters || [];
                                fruitAssignments = data.fruitAssignments || {};
                                fruitCategories = data.fruitCategories || JSON.parse(JSON.stringify(defaultFruits));
                                fruitObtained = data.fruitObtained || {};
                                bankAssignments = data.bankAssignments || Array(BANK_SLOTS).fill('');
                                storageCharacters = data.storageCharacters || [];
                                storageAssignments = data.storageAssignments || {};
                                recordName = data.recordName || '';
                                
                                console.log("雲端資料載入成功");
                                updateCloudStatus('online', `雲端就緒 (${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text})`);
                            } else {
                                // 2. 雲端無資料 -> 檢查 LocalStorage (僅限 default Slot 才做遷移檢查，避免副存檔亂備份)
                                if (currentSlot === 'default' && localStorage.getItem('characters')) { 
                                    loadFromLocalStorage(); // 先讀本地
                                    saveData(); // 立即觸發存檔 (上傳到雲端)
                                    customAlert(`歡迎！已自動將您原本在瀏覽器的資料備份至雲端帳號 (${user.email})。`);
                                } else {
                                    // 雲端無資料且無需遷移
                                    updateCloudStatus('online', '雲端就緒 (新資料)');
                                }
                            }
                        } catch (e) {
                            console.error("讀取雲端資料錯誤", e);
                            customAlert("讀取雲端資料失敗，將暫時使用離線模式。");
                            loadFromLocalStorage();
                            isCloudMode = false;
                        }
                    } else {
                        // === 使用者未登入 (離線模式) ===
                        isCloudMode = false;
                        updateCloudStatus('offline', '未登入 (使用離線資料)');
                        loadFromLocalStorage();
                    }

                    // 無論哪種模式，最後都要渲染畫面
                    renderAll();
                });

            } else {
                // Firebase 載入超時或失敗，降級處理
                console.warn("Firebase SDK 未就緒");
            }
        }, 100);

        // 若 3 秒後 Firebase 仍未回應，直接載入本地並渲染，避免白畫面
        setTimeout(() => {
            if (!currentUser && characters.length === 0) {
                loadFromLocalStorage();
                renderAll();
            }
        }, 3000);
    }


    // --- 2. Helper Functions ---
    function toggleModal(modal, show) {
        if (show) modal.classList.add('show');
        else modal.classList.remove('show');
    }

    function customAlert(message, title = '提示') {
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertMessage').textContent = message;
        toggleModal(DOM.alertModal, true);
        
        const btn = document.getElementById('alertOkBtn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = () => toggleModal(DOM.alertModal, false);
    }

    function customConfirm(message, title = '請確認') {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        toggleModal(DOM.confirmModal, true);
        
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const okBtn = document.getElementById('confirmOkBtn');
        
        return new Promise((resolve) => {
            const newCancel = cancelBtn.cloneNode(true);
            const newOk = okBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            okBtn.parentNode.replaceChild(newOk, okBtn);
            
            newCancel.onclick = () => { toggleModal(DOM.confirmModal, false); resolve(false); };
            newOk.onclick = () => { toggleModal(DOM.confirmModal, false); resolve(true); };
        });
    }

    function getAllFruits() {
        if (!fruitCategories || typeof fruitCategories !== 'object') return [];
        return Object.values(fruitCategories).flat();
    }

    function getFruitUsageData() {
        const usageMap = {};
        Object.keys(fruitAssignments).forEach(char => {
            const assigned = fruitAssignments[char] || [];
            const obtained = fruitObtained[char] || [];
            assigned.forEach((fruitName, idx) => {
                if (!fruitName) return;
                if (!usageMap[fruitName]) usageMap[fruitName] = { total: 0, obtained: 0 };
                usageMap[fruitName].total++; 
                if (obtained[idx]) usageMap[fruitName].obtained++; 
            });
        });
        return usageMap;
    }
    
    function getTotalStockCounts() {
        const stockCounts = {};
        bankAssignments.forEach(fruitName => {
            if (fruitName) stockCounts[fruitName] = (stockCounts[fruitName] || 0) + 1;
        });
        Object.keys(storageAssignments).forEach(char => {
            const fruits = storageAssignments[char] || [];
            fruits.forEach(f => {
                if (f) stockCounts[f] = (stockCounts[f] || 0) + 1;
            });
        });
        return stockCounts;
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
            <strong style="margin-bottom: 5px; text-align: center;">${fruitName}</strong>
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

    function getNeededCharacterSlots(fruitName) {
        const neededSlots = [];
        characters.forEach(charName => {
            const assigned = fruitAssignments[charName] || [];
            const obtained = fruitObtained[charName] || [];
            assigned.forEach((assignedFruit, index) => {
                if (assignedFruit === fruitName && !obtained[index]) {
                    neededSlots.push({
                        char: charName,
                        slot: index + 1,
                        slotText: `果實 ${index + 1}`
                    });
                }
            });
        });
        return neededSlots;
    }

    function getAvailableDestinationSlots(fruitName) {
        const slots = {
            main: [], 
            bank: [], 
            storage: [] 
        };
        slots.main = getNeededCharacterSlots(fruitName);
        for (let i = 0; i < BANK_SLOTS; i++) {
            if (!bankAssignments[i]) {
                slots.bank.push({ id: i, name: `鳥籠 ${i + 1}`, text: `鳥籠 ${i + 1} (空)`});
            }
        }
        storageCharacters.forEach(charName => {
            const assigned = storageAssignments[charName] || [];
            for (let index = 0; index < 4; index++) {
                if (!assigned[index]) { 
                    slots.storage.push({
                        id: [charName, index],
                        name: charName,
                        text: `${charName} / 果實 ${index + 1} (空)`
                    });
                }
            }
        });
        return slots;
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
            DOM.transferTargetContainer.style.display = 'none';

            if (!type) return;
            
            const destinations = allDestinations[type];
            DOM.transferTargetContainer.style.display = 'block';
            
            if (type === 'bank') {
                document.querySelector('#transferTargetContainer p:first-child').textContent = '目標鳥籠:';
                document.querySelector('#transferTargetContainer p:nth-child(3)').textContent = '位置: (鳥籠只有一個位置)';

                DOM.transferTargetSelect.innerHTML = '<option value="">請選擇空閒鳥籠</option>';
                destinations.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.id; 
                    option.textContent = slot.text;
                    DOM.transferTargetSelect.appendChild(option);
                });
                DOM.transferSlotSelect.innerHTML = '<option value="0">唯一位置</option>';
                DOM.transferSlotSelect.value = '0'; 
                if (destinations.length === 1) {
                    DOM.transferTargetSelect.value = destinations[0].id;
                }
            } else if (type === 'main') {
                document.querySelector('#transferTargetContainer p:first-child').textContent = '目標主力角色:';
                document.querySelector('#transferTargetContainer p:nth-child(3)').textContent = '目標果實欄位:';

                DOM.transferTargetSelect.innerHTML = '<option value="">請選擇角色</option>';
                const charOptions = {}; 
                destinations.forEach(slot => {
                    if (!charOptions[slot.char]) charOptions[slot.char] = [];
                    charOptions[slot.char].push(slot);
                });
                Object.keys(charOptions).forEach(char => {
                    const option = document.createElement('option');
                    option.value = char;
                    option.textContent = `${char} (${charOptions[char].length} 需)`;
                    DOM.transferTargetSelect.appendChild(option);
                });
                DOM.transferTargetSelect.onchange = () => {
                    const selectedChar = DOM.transferTargetSelect.value;
                    DOM.transferSlotSelect.innerHTML = '<option value="">請選擇欄位</option>';
                    if (selectedChar) {
                        charOptions[selectedChar].forEach(slot => {
                            const option = document.createElement('option');
                            option.value = slot.slot - 1; 
                            option.textContent = `${slot.slotText} (分配: ${fruitAssignments[selectedChar][slot.slot - 1]})`;
                            DOM.transferSlotSelect.appendChild(option);
                        });
                    }
                };
            } else if (type === 'storage') {
                document.querySelector('#transferTargetContainer p:first-child').textContent = '目標倉庫角色:';
                document.querySelector('#transferTargetContainer p:nth-child(3)').textContent = '目標果實欄位:';
                
                DOM.transferTargetSelect.innerHTML = '<option value="">請選擇倉庫角色</option>';
                const charOptions = {};
                destinations.forEach(slot => {
                    if (!charOptions[slot.name]) charOptions[slot.name] = [];
                    charOptions[slot.name].push(slot);
                });
                Object.keys(charOptions).forEach(char => {
                    const option = document.createElement('option');
                    option.value = char;
                    option.textContent = `${char} (${charOptions[char].length} 空位)`;
                    DOM.transferTargetSelect.appendChild(option);
                });
                DOM.transferTargetSelect.onchange = () => {
                    const selectedChar = DOM.transferTargetSelect.value;
                    DOM.transferSlotSelect.innerHTML = '<option value="">請選擇空位</option>';
                    if (selectedChar) {
                        charOptions[selectedChar].forEach(slot => {
                            const option = document.createElement('option');
                            option.value = slot.id[1]; 
                            option.textContent = slot.text.split(' / ')[1]; 
                            DOM.transferSlotSelect.appendChild(option);
                        });
                    }
                };
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
            const charName = sourceIdentifier;
            const assigned = storageAssignments[charName] || [];
            
            storageSourceSlots = {}; 
            let slotCount = 0;
            assigned.forEach((fruit, index) => {
                if (fruit) {
                    slotCount++;
                    const slotKey = `${charName}_${index}`;
                    storageSourceSlots[slotKey] = {
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
            
            DOM.storageSourceSlotSelect.innerHTML = '<option value="">-- 請選擇要移出的果實 --</option>';
            Object.keys(storageSourceSlots).forEach(key => {
                const slot = storageSourceSlots[key];
                const destinations = getAvailableDestinationSlots(slot.fruitName);
                if (destinations.main.length > 0 || destinations.bank.length > 0 || destinations.storage.length > 0) {
                    DOM.storageSourceSlotSelect.innerHTML += `<option value="${key}">${slot.text}</option>`;
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
        
        DOM.confirmTransferBtn.onclick = () => performTransfer();
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
        
        if (sourceType === 'bank') {
            if (bankAssignments[sourceIndex] === fruitName) {
                bankAssignments[sourceIndex] = '';
                transferSuccess = true;
            }
        } else if (sourceType === 'storage') {
            const [charName, slotIndex] = sourceIndex;
            if (storageAssignments[charName] && storageAssignments[charName][slotIndex] === fruitName) {
                storageAssignments[charName][slotIndex] = '';
                transferSuccess = true;
            }
        }
        
        if (!transferSuccess) return customAlert('轉移失敗：來源果實狀態不正確或已被移除。');

        let destinationText = '';
        if (targetType === 'main') {
            fruitObtained[targetContainer][targetSlotIndex] = true;
            destinationText = `主力角色「${targetContainer}」的果實 ${targetSlotIndex + 1}`;
        } else if (targetType === 'bank') {
            const bankIndex = parseInt(targetContainer, 10);
            bankAssignments[bankIndex] = fruitName;
            destinationText = `英雄 BANK (鳥籠 ${bankIndex + 1})`;
        } else if (targetType === 'storage') {
            const charName = targetContainer;
            if (!storageAssignments[charName]) storageAssignments[charName] = [];
            storageAssignments[charName][targetSlotIndex] = fruitName;
            destinationText = `倉庫角色「${charName}」的果實 ${targetSlotIndex + 1}`;
        }

        toggleModal(DOM.fruitTransferModal, false);
        saveData();
        renderAll();
        customAlert(`成功將「${fruitName}」轉移至 ${destinationText}！`, '轉移成功');
    }
    
    document.querySelectorAll('.transfer-close').forEach(btn => {
        btn.onclick = () => toggleModal(DOM.fruitTransferModal, false);
    });

    // --- 3. Tab 切換邏輯 ---
    DOM.tabBtns.forEach(btn => {
        btn.onclick = () => {
            DOM.tabBtns.forEach(b => b.classList.remove('active'));
            DOM.tabContents.forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            targetTab.classList.add('active');
            if (btn.dataset.tab === 'tab-overview') renderOverviewCards();
        };
    });

    // --- 4. 核心渲染與邏輯 ---
    function updateTitle() {
        const name = recordName ? `${recordName}的果實分配` : '果實分配';
        if (DOM.mainTitle) DOM.mainTitle.textContent = name;
        if (DOM.recordName) DOM.recordName.value = recordName;
    }
    
    function isCharacterCompleted(charName) {
        const assigned = fruitAssignments[charName] || [];
        const obtained = fruitObtained[charName] || [];
        let hasAssignment = false;
        let allDone = true;
        for(let i = 0; i < 4; i++) {
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
        const assigned = fruitAssignments[charName] || [];
        const obtained = fruitObtained[charName] || [];
        let count = 0;
        for (let i = 0; i < 4; i++) {
            if (assigned[i] && !obtained[i]) count++;
        }
        return count;
    }
    
    function getFilteredCharacters() {
        const shouldHideCompleted = DOM.hideCompletedCheckbox.checked;
        if (!shouldHideCompleted) return characters;
        return characters.filter(charName => !isCharacterCompleted(charName));
    }
    
    function getUncompletedCharacterCount() {
        return characters.filter(charName => !isCharacterCompleted(charName)).length;
    }

    function renderAll() {
        updateTitle();
        renderCharacters();
        renderOverviewCards(); 
        renderBankSelectors(); 
        renderStorageTable(); 
        renderTable(); 
        updatePresetCharacterSelect(); 
        
        if (DOM.storageCharCount) DOM.storageCharCount.textContent = storageCharacters.length;
        if (DOM.uncompletedCharCount) DOM.uncompletedCharCount.textContent = getUncompletedCharacterCount();
    }
    
    function renderOverviewCards() {
        DOM.attackFruitsOverview.innerHTML = '';
        DOM.otherFruitsOverview.innerHTML = '';
        const usageData = getFruitUsageData();
        const stockData = getTotalStockCounts();
        const fragmentAttack = document.createDocumentFragment();
        const fragmentOther = document.createDocumentFragment();
        ['同族', '戰型', '擊種'].forEach(category => {
            if (fruitCategories[category]) {
                fruitCategories[category].forEach(f => {
                    const totalStock = stockData[f] || 0;
                    if ((usageData[f]?.total || 0) > 0 || totalStock > 0) {
                        fragmentAttack.appendChild(createOverviewItem(f, usageData[f], totalStock));
                    }
                });
            }
        });
        if (fruitCategories['其他']) {
            fruitCategories['其他'].forEach(f => {
                const totalStock = stockData[f] || 0;
                if ((usageData[f]?.total || 0) > 0 || totalStock > 0) {
                    fragmentOther.appendChild(createOverviewItem(f, usageData[f], totalStock));
                }
            });
        }
        DOM.attackFruitsOverview.appendChild(fragmentAttack);
        DOM.otherFruitsOverview.appendChild(fragmentOther);
    }
    
    function renderBankSelectors() {
        DOM.bankFruitSelectors.innerHTML = '';
        const allFruits = getAllFruits();
        const defaultOption = '<option value="">(空)</option>';
        const optionsHtml = allFruits.map(f => `<option value="${f}">${f}</option>`).join('');
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < BANK_SLOTS; i++) {
            const container = document.createElement('div');
            container.className = 'inventory-item bank-slot';
            const select = document.createElement('select');
            select.innerHTML = defaultOption + optionsHtml;
            select.value = bankAssignments[i] || '';
            const fruitName = bankAssignments[i];
            const neededSlots = getNeededCharacterSlots(fruitName);
            const hasDestination = getAvailableDestinationSlots(fruitName);
            select.onchange = () => {
                bankAssignments[i] = select.value;
                saveData();
                renderAll(); 
            };
            container.innerHTML = `<strong>鳥籠 ${i + 1}</strong>`;
            container.appendChild(select);
            if (fruitName && (neededSlots.length > 0 || hasDestination.bank.length > 0 || hasDestination.storage.length > 0)) {
                const transferBtn = document.createElement('button');
                transferBtn.className = 'btn btn-green';
                transferBtn.style.cssText = 'font-size: 12px; padding: 4px 8px; margin-top: 5px; width: 100%;';
                transferBtn.textContent = `⚡ 轉移果實`; 
                transferBtn.onclick = () => initTransferModal(fruitName, 'bank', i);
                container.appendChild(transferBtn);
            } else if (fruitName) {
                const placeholder = document.createElement('div');
                placeholder.textContent = '✓ 無需轉移或無空位';
                placeholder.style.cssText = 'font-size: 12px; color: #28a745; margin-top: 5px;';
                container.appendChild(placeholder);
            }
            fragment.appendChild(container);
        }
        DOM.bankFruitSelectors.appendChild(fragment);

        document.getElementById('resetBank').onclick = async () => {
            if (await customConfirm('確定重置所有 7 個鳥籠的果實種類？')) {
                bankAssignments = Array(BANK_SLOTS).fill('');
                saveData();
                renderAll();
            }
        };
    }

    function renderCharacters(searchTerm = '') {
        DOM.characterListUl.innerHTML = '';
        DOM.characterCount.textContent = characters.length;
        const filtered = searchTerm ? characters.filter(n => n.toLowerCase().includes(searchTerm.toLowerCase())) : characters;
        if (filtered.length === 0) {
            DOM.characterListUl.innerHTML = '<li style="text-align:center; color:#999; padding:10px;">無符合角色</li>';
            return;
        }
        const fragment = document.createDocumentFragment();
        filtered.forEach(name => {
            const li = document.createElement('li');
            li.className = 'character-list-item';
            const span = document.createElement('span');
            span.textContent = name;
            const btn = document.createElement('button');
            btn.className = 'btn btn-red';
            btn.style.cssText = "padding: 2px 8px; font-size: 12px;";
            btn.textContent = '🗑️';
            btn.onclick = async () => {
                if (await customConfirm(`確定刪除「${name}」？`)) {
                    characters = characters.filter(c => c !== name);
                    delete fruitAssignments[name];
                    delete fruitObtained[name];
                    saveData();
                    renderAll();
                    renderCharacters(DOM.modalCharacterSearch.value);
                }
            };
            li.appendChild(span);
            li.appendChild(btn);
            fragment.appendChild(li);
        });
        DOM.characterListUl.appendChild(fragment);
    }
    
    DOM.addStorageCharBtn.onclick = () => {
        const name = DOM.newStorageChar.value.trim();
        if (name && !storageCharacters.includes(name)) {
            storageCharacters.push(name);
            if (!storageAssignments[name]) storageAssignments[name] = ['', '', '', ''];
            saveData();
            renderAll();
            DOM.newStorageChar.value = '';
        } else if (storageCharacters.includes(name)) {
            customAlert('倉庫角色已存在');
        }
    };
    DOM.searchStorageChar.oninput = () => renderStorageTable();

    function renderStorageTable() {
        DOM.storageTableBody.innerHTML = '';
        const term = DOM.searchStorageChar.value.trim().toLowerCase();
        let targets = storageCharacters;
        if (term) {
            targets = targets.filter(name => {
                if (name.toLowerCase().includes(term)) return true;
                const assigned = storageAssignments[name] || [];
                return assigned.some(f => f && f.toLowerCase().includes(term));
            });
        }
        if (targets.length === 0) {
            DOM.storageTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 15px;">無符合倉庫資料</td></tr>';
            return;
        }
        const fruits = getAllFruits();
        const defaultOption = '<option value="">(空)</option>';
        const optionsHtml = fruits.map(f => `<option value="${f}">${f}</option>`).join('');
        const fragment = document.createDocumentFragment();
        targets.forEach(name => {
            if (!storageAssignments[name] || storageAssignments[name].length !== 4) {
                 storageAssignments[name] = (storageAssignments[name] || []).concat(['', '', '', '']).slice(0, 4);
            }
            const assigned = storageAssignments[name];
            const row = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            row.appendChild(nameCell);
            
            let hasAnyFruit = false; 
            for (let i = 0; i < 4; i++) {
                const cell = document.createElement('td');
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '5px';
                const select = document.createElement('select');
                select.innerHTML = defaultOption + optionsHtml;
                select.value = assigned[i] || '';
                select.style.width = '100%';
                select.onchange = () => {
                    storageAssignments[name][i] = select.value;
                    saveData();
                    renderAll(); 
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
            const delBtn = document.createElement('button');
            delBtn.className = 'btn btn-red';
            delBtn.textContent = '🗑️ 刪除角色';
            delBtn.style.padding = '8px 10px';
            delBtn.onclick = async () => {
                if (await customConfirm(`確定刪除倉庫角色「${name}」？`)) {
                    storageCharacters = storageCharacters.filter(c => c !== name);
                    delete storageAssignments[name];
                    saveData();
                    renderAll(); 
                }
            };
            actionCell.appendChild(delBtn);
            if (hasAnyFruit) {
                const transferBtn = document.createElement('button');
                transferBtn.className = 'btn btn-blue';
                transferBtn.textContent = '移出果實';
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
        
        let targetChars = characters;
        if (shouldHideCompleted) targetChars = targetChars.filter(charName => !isCharacterCompleted(charName));
        if (shouldFilter && searchTerm) {
            targetChars = targetChars.filter(name => {
                if (name.toLowerCase().includes(searchTerm)) return true;
                const assigned = fruitAssignments[name] || [];
                return assigned.some(fruit => fruit && fruit.toLowerCase().includes(searchTerm));
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
        const fruits = getAllFruits();
        const fragment = document.createDocumentFragment();
        const defaultOption = '<option value="">未選擇</option>';
        const optionsHtml = fruits.map(f => `<option value="${f}">${f}</option>`).join('');
        targetChars.forEach(name => {
            const assigned = fruitAssignments[name] || [];
            if (!fruitObtained[name]) fruitObtained[name] = [];
            const finished = isCharacterCompleted(name);
            const row = document.createElement('tr');
            if (finished) row.classList.add('row-completed');
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.setAttribute('data-label', '角色');
            row.appendChild(nameCell);
            for (let i = 0; i < 4; i++) {
                const cell = document.createElement('td');
                cell.setAttribute('data-label', `果實 ${i+1}`);
                const wrapper = document.createElement('div');
                wrapper.className = 'select-wrapper';
                const select = document.createElement('select');
                select.innerHTML = defaultOption + optionsHtml;
                if (assigned[i]) select.value = assigned[i];
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = !!(fruitObtained[name] && fruitObtained[name][i]); 
                checkbox.style.display = assigned[i] ? 'inline-block' : 'none';
                select.onchange = () => {
                    if (!fruitAssignments[name]) fruitAssignments[name] = [];
                    fruitAssignments[name][i] = select.value;
                    if (!select.value) fruitObtained[name][i] = false;
                    saveData();
                    renderAll();
                };
                checkbox.onchange = () => {
                    if (!fruitObtained[name]) fruitObtained[name] = [];
                    fruitObtained[name][i] = checkbox.checked;
                    saveData();
                    renderAll();
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
        const searchFiltered = term ? filtered.filter(n => n.toLowerCase().includes(term)) : filtered;
        searchFiltered.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            DOM.presetCharacterSelect.appendChild(opt);
        });
        if (searchFiltered.includes(currentVal)) DOM.presetCharacterSelect.value = currentVal;
        else if (searchFiltered.length === 1) DOM.presetCharacterSelect.value = searchFiltered[0];
    }

    DOM.recordName.oninput = () => { recordName = DOM.recordName.value; saveData(); updateTitle(); };
    
    document.getElementById('loadData').onclick = () => document.getElementById('loadFile').click();
    document.getElementById('loadFile').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                let result = evt.target.result;
                if (result.charCodeAt(0) === 0xFEFF) result = result.substr(1);
                const d = JSON.parse(result);
                characters = Array.isArray(d.characters) ? d.characters : [];
                fruitAssignments = (typeof d.fruitAssignments === 'object') ? d.fruitAssignments : {};
                if (d.fruitInventory && typeof d.fruitInventory === 'object' && !d.bankAssignments) {
                    customAlert('偵測到舊版庫存資料，已嘗試自動轉換至新版 BANK 介面。');
                    bankAssignments = Array(BANK_SLOTS).fill('');
                } else {
                    bankAssignments = Array.isArray(d.bankAssignments) ? d.bankAssignments : Array(BANK_SLOTS).fill('');
                }
                fruitCategories = (typeof d.fruitCategories === 'object') ? d.fruitCategories : JSON.parse(JSON.stringify(defaultFruits));
                fruitObtained = (typeof d.fruitObtained === 'object') ? d.fruitObtained : {};
                storageCharacters = Array.isArray(d.storageCharacters) ? d.storageCharacters : [];
                storageAssignments = (typeof d.storageAssignments === 'object') ? d.storageAssignments : {};
                recordName = typeof d.recordName === 'string' ? d.recordName : '';
                for (let key in fruitObtained) {
                    if (Array.isArray(fruitObtained[key])) fruitObtained[key] = fruitObtained[key].map(v => !!v);
                }
                saveData();
                renderAll();
                customAlert(`成功載入：${recordName || '未命名紀錄'}`);
            } catch (err) {
                console.error(err);
                customAlert('載入失敗：檔案格式錯誤。');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };
    
    document.getElementById('saveData').onclick = () => {
        const now = new Date();
        const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const data = { characters, fruitAssignments, bankAssignments, fruitCategories, fruitObtained, storageCharacters, storageAssignments, recordName };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (recordName ? `${recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`);
        a.click();
    };

    DOM.searchInput.oninput = () => { renderTable(); updatePresetCharacterSelect(); };
    DOM.filterModeCheckbox.onchange = () => renderTable();
    DOM.hideCompletedCheckbox.onchange = () => { renderTable(); updatePresetCharacterSelect(); };
    DOM.sortCharacterBy.onchange = () => { renderTable(); updatePresetCharacterSelect(); };
    DOM.modalCharacterSearch.oninput = () => renderCharacters(DOM.modalCharacterSearch.value);

    document.getElementById('addCharacter').onclick = () => {
        const name = DOM.newCharacter.value.trim();
        if (name && !characters.includes(name)) {
            characters.push(name);
            saveData();
            renderAll();
            DOM.newCharacter.value = '';
        } else if (characters.includes(name)) customAlert('角色已存在');
    };

    document.getElementById('showCharacterList').onclick = () => {
        DOM.modalCharacterSearch.value = '';
        renderCharacters();
        toggleModal(DOM.characterModal, true);
    };

    document.querySelectorAll('.close-modal, .close-btn-action').forEach(btn => {
        btn.onclick = () => toggleModal(btn.closest('.modal'), false);
    });

    document.getElementById('addFruit').onclick = () => {
        const name = document.getElementById('newFruitName').value.trim();
        const cat = document.getElementById('newFruitCategory').value;
        if (!name) return customAlert('請輸入名稱');
        if (getAllFruits().includes(name)) return customAlert('果實已存在');
        const target = cat === '加擊類' ? '同族' : '其他';
        if (!fruitCategories[target]) fruitCategories[target] = [];
        fruitCategories[target].push(name);
        saveData();
        renderAll();
        document.getElementById('newFruitName').value = '';
    };

    document.getElementById('deleteFruitBtn').onclick = () => {
        DOM.deleteFruitSelect.innerHTML = '<option value="">請選擇果實</option>';
        getAllFruits().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            DOM.deleteFruitSelect.appendChild(opt);
        });
        toggleModal(DOM.deleteFruitModal, true);
    };

    document.getElementById('confirmDeleteFruit').onclick = async () => {
        const name = DOM.deleteFruitSelect.value;
        if (!name) return;
        if (await customConfirm(`確定刪除「${name}」？`)) {
            Object.keys(fruitCategories).forEach(k => {
                fruitCategories[k] = fruitCategories[k].filter(f => f !== name);
            });
            bankAssignments = bankAssignments.map(f => f === name ? '' : f);
            Object.keys(fruitAssignments).forEach(c => {
                fruitAssignments[c] = fruitAssignments[c].map(f => f === name ? '' : f);
            });
            Object.keys(storageAssignments).forEach(c => {
                storageAssignments[c] = storageAssignments[c].map(f => f === name ? '' : f);
            });
            saveData();
            renderAll();
            toggleModal(DOM.deleteFruitModal, false);
        }
    };

    ['presetBtn1', 'presetBtn2', 'presetBtn3', 'presetBtn4'].forEach((id, idx) => {
        document.getElementById(id).onclick = () => {
            const char = DOM.presetCharacterSelect.value;
            if (!char) return customAlert('請先選擇角色');
            
            const targets = [
                ['同族加擊', '同族加命擊', '同族加擊速'],
                ['戰型加擊', '戰型加命擊', '戰型加擊速'],
                ['擊種加擊', '擊種加命擊', '擊種加擊速'],
                ['將消', '兵消', '速必']
            ][idx];
            
            const all = getAllFruits();
            const missing = targets.filter(t => !all.includes(t));
            if (missing.length > 0) return customAlert(`果實清單中無此果實：${missing.join(', ')}`);
            
            fruitAssignments[char] = [...targets, '', '', '', ''].slice(0, 4);
            fruitObtained[char] = [false, false, false, false];
            saveData();
            renderAll();
        };
    });

    document.getElementById('resetPresetCharacter').onclick = async () => {
        const char = DOM.presetCharacterSelect.value;
        if (!char) return customAlert('請先選擇角色');
        if (await customConfirm(`重置「${char}」的分配？`)) {
            fruitAssignments[char] = [];
            fruitObtained[char] = [];
            saveData();
            renderAll();
        }
    };
    document.getElementById('resetAssignments').onclick = async () => {
        if (await customConfirm('重置所有主力角色分配？')) {
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };
    document.getElementById('resetCharacterList').onclick = async () => {
        if (await customConfirm('重置清單？將清除所有主力角色。')) {
            characters = [];
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };
    document.getElementById('resetAllData').onclick = async () => {
        const slotName = DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text;
        if (await customConfirm(`⚠️ 確定要初始化【${slotName}】的所有資料嗎？此動作無法復原。`)) {
            // 清除本地儲存 (僅清除當前 Slot)
            localStorage.removeItem(getLocalKey('characters'));
            localStorage.removeItem(getLocalKey('fruitAssignments'));
            localStorage.removeItem(getLocalKey('fruitInventory'));
            localStorage.removeItem(getLocalKey('fruitCategories'));
            localStorage.removeItem(getLocalKey('fruitObtained'));
            localStorage.removeItem(getLocalKey('bankAssignments'));
            localStorage.removeItem(getLocalKey('storageCharacters'));
            localStorage.removeItem(getLocalKey('storageAssignments'));
            localStorage.removeItem(getLocalKey('recordName'));

            // 重置記憶體變數
            clearMemoryData();

            // 如果是雲端模式，也要清空雲端資料
            if (isCloudMode && currentUser && db) {
                const { doc, setDoc } = window.firebaseModules;
                const docId = getSaveDocName();
                const userDocRef = doc(db, "users", currentUser.uid, "apps", docId);
                // 寫入空物件覆蓋
                await setDoc(userDocRef, {
                    characters: [],
                    fruitAssignments: {},
                    fruitObtained: {},
                    bankAssignments: Array(BANK_SLOTS).fill(''),
                    storageCharacters: [],
                    storageAssignments: {},
                    recordName: '',
                    lastUpdated: new Date()
                });
                updateCloudStatus('online', `雲端資料已清空 (${slotName})`);
            }
            renderAll();
            customAlert(`已重置【${slotName}】。`);
        }
    };

    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) toggleModal(e.target, false);
    };

    // 啟動 App
    initApp();
});