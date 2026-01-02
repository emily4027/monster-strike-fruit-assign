document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 1. 常數與狀態初始化
    // ==========================================
    const DEFAULT_FRUITS = {
        "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
        "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
        "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
        "其他": ["將消", "兵消", "熱友", "速必"]
    };
    const BANK_SLOTS = 7;
    const USER_CACHE_KEY = 'fruit_user_cache_v1';
    const DATA_CACHE_PREFIX = 'fruit_data_cache_';

    // 安全獲取 DOM 元素的輔助函數
    const getEl = (id) => document.getElementById(id);

    // DOM 快取 (集中管理)
    const DOM = {
        mainTitle: getEl('mainTitle'),
        
        // Character Management
        newCharacter: getEl('newCharacter'),
        characterCount: getEl('characterCount'),
        addCharacter: getEl('addCharacter'),          
        showCharacterList: getEl('showCharacterList'), 
        resetCharacterList: getEl('resetCharacterList'), 
        
        // Header Controls
        userInfo: getEl('user-info'),
        userAvatar: getEl('user-avatar'),
        userDisplayName: getEl('user-display-name'),
        logoutBtn: getEl('logout-btn'),
        saveDataBtn: getEl('saveData'),
        loadDataBtn: getEl('loadData'),
        resetAllData: getEl('resetAllData'), 
        loadFile: getEl('loadFile'),

        // Tabs
        tabBtns: document.querySelectorAll('.tab-btn'),
        tabContents: document.querySelectorAll('.tab-content'),
        
        // Overview
        attackFruitsOverview: getEl('attackFruitsOverview'), 
        otherFruitsOverview: getEl('otherFruitsOverview'), 
        
        // Bank
        bankFruitSelectors: getEl('bankFruitSelectors'),
        resetBank: getEl('resetBank'), 

        // Storage
        newStorageChar: getEl('newStorageChar'),
        addStorageCharBtn: getEl('addStorageChar'),
        searchStorageChar: getEl('searchStorageChar'),
        storageTableBody: getEl('storageTableBody'),
        storageCharCount: getEl('storageCharCount'), 
        
        // Allocation (Main Table)
        fruitTableBody: getEl('fruitTableBody'),
        searchInput: getEl('searchCharacter'),
        filterModeCheckbox: getEl('filterModeCheckbox'),
        hideCompletedCheckbox: getEl('hideCompletedCheckbox'),
        resetAssignments: getEl('resetAssignments'), 
        
        // Preset Controls
        presetCharacterSelect: getEl('presetCharacter'),
        resetPresetCharacter: getEl('resetPresetCharacter'),
        presetBtns: [
            getEl('presetBtn1'),
            getEl('presetBtn2'),
            getEl('presetBtn3'),
            getEl('presetBtn4')
        ],

        uncompletedCharCount: getEl('uncompletedCharCount'),
        sortCharacterBy: getEl('sortCharacterBy'),
        
        // Slot Controls
        saveSlotSelect: getEl('saveSlotSelect'),
        renameSlotBtn: getEl('renameSlotBtn'),
        addSlotBtn: getEl('addSlotBtn'),
        deleteSlotBtn: getEl('deleteSlotBtn'),

        // Fruit Management
        newFruitName: getEl('newFruitName'),
        newFruitCategory: getEl('newFruitCategory'),
        addFruit: getEl('addFruit'),
        deleteFruitBtn: getEl('deleteFruitBtn'),
        deleteFruitSelect: getEl('deleteFruitSelect'), 
        confirmDeleteFruit: getEl('confirmDeleteFruit'),

        // Modals
        characterModal: getEl('characterModal'),
        characterListUl: getEl('characterList'),
        modalCharacterSearch: getEl('modalCharacterSearch'),
        deleteFruitModal: getEl('deleteFruitModal'),
        alertModal: getEl('alertModal'),
        confirmModal: getEl('confirmModal'),
        inputModal: getEl('inputModal'),

        // Transfer Modal
        fruitTransferModal: getEl('fruitTransferModal'),
        transferSourceMessage: getEl('transferSourceMessage'),
        transferTargetContainer: getEl('transferTargetContainer'),
        transferDestinationType: getEl('transferDestinationType'),
        transferTargetSelect: getEl('transferTargetSelect'),
        transferSlotSelect: getEl('transferSlotSelect'),
        confirmTransferBtn: getEl('confirmTransferBtn'),
        storageSourceSelector: getEl('storageSourceSelector'),
        storageSourceSlotSelect: getEl('storageSourceSlotSelect'),

        // Status
        cloudStatus: getEl('cloudStatus'),
        cloudStatusText: getEl('cloudStatusText'),
        statusDot: document.querySelector('.status-dot')
    };

    // Firebase 變數
    let db = null, auth = null, currentUser = null;
    let isCloudMode = false, saveTimeout = null;
    let envAppId = 'default-app-id';

    // 應用程式狀態
    let currentSlot = 'default';
    let slotList = JSON.parse(localStorage.getItem('global_slot_list')) || ['default', 'slot2', 'slot3', 'slot4'];

    // 資料模型 (預設值)
    let fruitCategories = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
    let characters = [];
    let fruitAssignments = {};
    let fruitObtained = {};
    let bankAssignments = Array(BANK_SLOTS).fill(''); 
    let storageCharacters = [];
    let storageAssignments = {}; 
    let recordName = '';

    // ==========================================
    // 2. 核心工具函數 (Utilities)
    // ==========================================

    const debounce = (func, delay = 300) => {
        let timer;
        return (...args) => {
            clearTimeout(timer);
            timer = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // [資料完整性修復] 這是解決 "壞掉" 問題的關鍵
    const ensureDataIntegrity = () => {
        // 1. 修復果實分類
        if (!fruitCategories || typeof fruitCategories !== 'object' || Object.keys(fruitCategories).length === 0) {
            fruitCategories = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
        }

        // 2. 修復 Bank
        if (!Array.isArray(bankAssignments) || bankAssignments.length !== BANK_SLOTS) {
            bankAssignments = Array(BANK_SLOTS).fill('');
        }

        // 3. 修復儲存庫資料 (基本結構)
        if (!Array.isArray(storageCharacters)) storageCharacters = [];
        if (!storageAssignments || typeof storageAssignments !== 'object') storageAssignments = {};
        
        // 4. [關鍵修復] 清理幽靈資料 (Garbage Collection)
        // 移除「不在倉庫名單內」但在「果實分配表」中殘留的資料
        const validStorageChars = new Set(storageCharacters);
        Object.keys(storageAssignments).forEach(key => {
            if (!validStorageChars.has(key)) {
                console.warn(`[Self-Healing] Removed ghost storage data for: ${key}`);
                delete storageAssignments[key];
            }
        });

        // 同步清理主力角色的幽靈資料 (預防萬一)
        const validMainChars = new Set(characters);
        Object.keys(fruitAssignments).forEach(key => {
            if (!validMainChars.has(key)) delete fruitAssignments[key];
        });
        Object.keys(fruitObtained).forEach(key => {
            if (!validMainChars.has(key)) delete fruitObtained[key];
        });

        // 5. 確保所有存在的儲存角色都有對應的 assignments 結構
        storageCharacters.forEach(char => {
            if (!storageAssignments[char] || !Array.isArray(storageAssignments[char])) {
                storageAssignments[char] = ['', '', '', ''];
            }
        });
    };

    const getAllFruits = () => {
        if (!fruitCategories) return [];
        return Object.values(fruitCategories).flat();
    };

    const generateFruitOptionsHTML = () => {
        const fruits = getAllFruits();
        const defaultOption = '<option value="">(空)</option>';
        return defaultOption + fruits.map(f => `<option value="${f}">${f}</option>`).join('');
    };

    const toggleModal = (modal, show) => {
        if(modal) modal.classList.toggle('show', show);
    };

    const customAlert = (message, title = '提示') => {
        if(!DOM.alertModal) return alert(message); 
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertMessage').textContent = message;
        toggleModal(DOM.alertModal, true);
        
        const btn = document.getElementById('alertOkBtn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', () => toggleModal(DOM.alertModal, false), { once: true });
    };

    const customConfirm = (message, title = '請確認') => {
        if(!DOM.confirmModal) return Promise.resolve(confirm(message)); 
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        toggleModal(DOM.confirmModal, true);
        
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const okBtn = document.getElementById('confirmOkBtn');
        
        return new Promise((resolve) => {
            const cleanup = () => {
                cancelBtn.onclick = null;
                okBtn.onclick = null;
            };
            cancelBtn.onclick = () => { toggleModal(DOM.confirmModal, false); cleanup(); resolve(false); };
            okBtn.onclick = () => { toggleModal(DOM.confirmModal, false); cleanup(); resolve(true); };
        });
    };

    const customInput = (message, defaultValue = '') => {
        if(!DOM.inputModal) return Promise.resolve(prompt(message, defaultValue)); 
        document.getElementById('inputTitle').textContent = '輸入';
        document.getElementById('inputMessage').textContent = message;
        const inputField = document.getElementById('inputField');
        inputField.value = defaultValue;
        
        toggleModal(DOM.inputModal, true);
        inputField.focus();

        const cancelBtn = document.getElementById('inputCancelBtn');
        const okBtn = document.getElementById('inputOkBtn');

        return new Promise((resolve) => {
            const cleanup = () => {
                cancelBtn.onclick = null;
                okBtn.onclick = null;
                inputField.onkeyup = null;
            };
            const close = (val) => { toggleModal(DOM.inputModal, false); cleanup(); resolve(val); };

            cancelBtn.onclick = () => close(null);
            okBtn.onclick = () => close(inputField.value.trim());
            inputField.onkeyup = (e) => { if(e.key === 'Enter') okBtn.click(); };
        });
    };

    const getUnassignedFruitCount = (charName) => {
        const assigned = fruitAssignments[charName] || [];
        const obtained = fruitObtained[charName] || [];
        return assigned.reduce((acc, val, idx) => (val && !obtained[idx] ? acc + 1 : acc), 0);
    };

    const isCharacterCompleted = (charName) => {
        const assigned = fruitAssignments[charName] || [];
        const obtained = fruitObtained[charName] || [];
        const hasAssignment = assigned.some(Boolean);
        if (!hasAssignment) return false;
        return assigned.every((val, idx) => !val || obtained[idx]);
    };

    // ==========================================
    // 3. 資料存取與雲端邏輯
    // ==========================================

    const updateCloudStatus = (status, msg) => {
        if(!DOM.cloudStatus) return;
        DOM.cloudStatus.style.display = 'flex';
        DOM.cloudStatusText.textContent = msg;
        DOM.statusDot.className = 'status-dot';
        DOM.statusDot.classList.remove('status-online', 'status-saving', 'status-offline');
        
        const map = { 'online': 'status-online', 'saving': 'status-saving', 'offline': 'status-offline' };
        if (map[status]) DOM.statusDot.classList.add(map[status]);
    };

    const getLocalKey = (key) => (currentSlot === 'default') ? key : `${currentSlot}_${key}`;
    const getSaveDocName = () => (currentSlot === 'default') ? "fruit_assign" : `fruit_assign_${currentSlot}`;

    const updateTitle = () => {
        if(DOM.mainTitle) {
            const name = recordName ? `${recordName}的果實分配` : '果實分配';
            DOM.mainTitle.textContent = name;
        }
        
        const cache = JSON.parse(localStorage.getItem('slot_names_cache') || '{}');
        if (recordName && recordName.trim() !== '') cache[currentSlot] = recordName;
        else delete cache[currentSlot];
        
        localStorage.setItem('slot_names_cache', JSON.stringify(cache));
        renderSlotOptions();
    };

    const renderSlotOptions = () => {
        if(!DOM.saveSlotSelect) return;
        const cache = JSON.parse(localStorage.getItem('slot_names_cache') || '{}');
        const fragment = document.createDocumentFragment();
        
        slotList.forEach((slotId, index) => {
            const option = document.createElement('option');
            option.value = slotId;
            const savedName = cache[slotId];
            const defaultName = (slotId === 'default') ? '存檔 1 (預設)' : `存檔 ${index + 1}`;
            option.textContent = savedName ? `📁 ${savedName}` : `📁 ${defaultName}`;
            fragment.appendChild(option);
        });
        
        DOM.saveSlotSelect.innerHTML = '';
        DOM.saveSlotSelect.appendChild(fragment);
        DOM.saveSlotSelect.value = currentSlot;
    };

    const applyData = (data) => {
        if (!data) return;
        characters = data.characters || [];
        fruitAssignments = data.fruitAssignments || {};
        // 優先使用載入的設定，若為空則使用預設值
        fruitCategories = (data.fruitCategories && Object.keys(data.fruitCategories).length > 0) 
            ? data.fruitCategories 
            : JSON.parse(JSON.stringify(DEFAULT_FRUITS));
            
        fruitObtained = data.fruitObtained || {};
        bankAssignments = data.bankAssignments || Array(BANK_SLOTS).fill('');
        storageCharacters = data.storageCharacters || [];
        storageAssignments = data.storageAssignments || {};
        recordName = data.recordName || '';
        
        ensureDataIntegrity(); // 再次檢查並修復
    };

    const clearMemoryData = () => {
        characters = []; fruitAssignments = {}; fruitObtained = {};
        bankAssignments = Array(BANK_SLOTS).fill('');
        storageCharacters = []; storageAssignments = {}; recordName = '';
        fruitCategories = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
    };

    const saveData = async (isImmediate = false) => {
        const currentOptionText = DOM.saveSlotSelect ? (DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex]?.text || currentSlot) : currentSlot;
        
        const performSave = async () => {
            try {
                const dataToSave = {
                    characters, fruitAssignments, fruitCategories, fruitObtained,
                    bankAssignments, storageCharacters, storageAssignments, recordName,
                    lastUpdated: new Date()
                };

                const keys = {
                    'characters': characters, 'fruitAssignments': fruitAssignments,
                    'fruitCategories': fruitCategories, 'fruitObtained': fruitObtained,
                    'bankAssignments': bankAssignments, 'storageCharacters': storageCharacters,
                    'storageAssignments': storageAssignments, 'recordName': recordName
                };
                Object.entries(keys).forEach(([k, v]) => {
                    localStorage.setItem(getLocalKey(k), (typeof v === 'string') ? v : JSON.stringify(v));
                });
                if (currentSlot === 'default') localStorage.setItem('fruitInventory', JSON.stringify({})); 
                localStorage.setItem('lastSelectedSlot', currentSlot);

                if (isCloudMode && currentUser && db) {
                    updateCloudStatus('saving', `儲存中 (${currentOptionText})...`);
                    const { doc, setDoc } = window.firebaseModules;
                    sessionStorage.setItem(DATA_CACHE_PREFIX + currentUser.uid, JSON.stringify(dataToSave));
                    const userDocRef = doc(db, "artifacts", envAppId, "users", currentUser.uid, "fruit_data", getSaveDocName());
                    await setDoc(userDocRef, dataToSave, { merge: true });
                    updateCloudStatus('online', `已同步至雲端 (${currentOptionText})`);
                } else {
                    updateCloudStatus('offline', `離線模式: ${currentOptionText}`);
                }
            } catch (e) {
                console.error("Save Error", e);
                updateCloudStatus('offline', '儲存失敗');
            }
        };

        clearTimeout(saveTimeout);
        if (isImmediate) await performSave();
        else saveTimeout = setTimeout(performSave, 1000);
    };

    const loadFromLocalStorage = () => {
        try {
            const load = (k, def) => {
                const v = localStorage.getItem(getLocalKey(k));
                return v ? JSON.parse(v) : def;
            };
            characters = load('characters', []);
            fruitAssignments = load('fruitAssignments', {});
            fruitObtained = load('fruitObtained', {});
            bankAssignments = load('bankAssignments', Array(BANK_SLOTS).fill(''));
            
            if (currentSlot === 'default' && localStorage.getItem('fruitInventory') && !localStorage.getItem('bankAssignments')) {
                bankAssignments = Array(BANK_SLOTS).fill('');
            }
            if (bankAssignments.length !== BANK_SLOTS) bankAssignments = Array(BANK_SLOTS).fill('');

            fruitCategories = load('fruitCategories', JSON.parse(JSON.stringify(DEFAULT_FRUITS)));
            storageCharacters = load('storageCharacters', []);
            storageAssignments = load('storageAssignments', {});
            recordName = localStorage.getItem(getLocalKey('recordName')) || '';
            
            ensureDataIntegrity(); // 確保資料可用
        } catch (e) {
            console.error("Local Load Error", e);
            // 發生錯誤時重置為預設，避免程式崩潰
            fruitCategories = JSON.parse(JSON.stringify(DEFAULT_FRUITS));
        }
    };

    // ==========================================
    // 4. 渲染邏輯 (UI Rendering)
    // ==========================================

    const renderAll = () => {
        // 安全檢查
        if (!DOM.characterListUl) return; 

        updateTitle();
        renderCharacters(); 
        renderOverviewCards();
        renderBankSelectors();
        renderStorageTable();
        renderTable();
        updatePresetCharacterSelect();
        
        if (DOM.storageCharCount) DOM.storageCharCount.textContent = storageCharacters.length;
        if (DOM.uncompletedCharCount) DOM.uncompletedCharCount.textContent = getUncompletedCharacterCount();
    };

    const renderCharacters = (searchTerm = '') => {
        DOM.characterCount.textContent = characters.length;
        const term = (searchTerm || DOM.modalCharacterSearch.value || '').trim().toLowerCase();
        
        const filtered = term ? characters.filter(n => n.toLowerCase().includes(term)) : characters;

        DOM.characterListUl.innerHTML = '';
        if (filtered.length === 0) {
            DOM.characterListUl.innerHTML = '<li style="text-align:center; color:#999; padding:10px;">無符合角色</li>';
            return;
        }

        const fragment = document.createDocumentFragment();
        filtered.forEach(name => {
            const li = document.createElement('li');
            li.className = 'character-list-item';
            li.innerHTML = `
                <span>${name}</span>
                <div class="character-actions">
                    <button class="btn btn-edit btn-rename" data-name="${name}" title="重新命名" style="padding: 2px 8px; font-size: 12px;">✏️</button>
                    <button class="btn btn-red btn-delete" data-name="${name}" title="刪除角色" style="padding: 2px 8px; font-size: 12px;">🗑️</button>
                </div>
            `;
            fragment.appendChild(li);
        });
        DOM.characterListUl.appendChild(fragment);
    };

    const renderTable = () => {
        DOM.fruitTableBody.innerHTML = '';
        const term = DOM.searchInput.value.trim().toLowerCase();
        const hideCompleted = DOM.hideCompletedCheckbox.checked;
        const filterMode = DOM.filterModeCheckbox.checked;
        const sortMode = DOM.sortCharacterBy.value;
        const optionsHtml = generateFruitOptionsHTML();

        let targetChars = [...characters];

        if (hideCompleted) targetChars = targetChars.filter(n => !isCharacterCompleted(n));
        if (filterMode && term) {
            targetChars = targetChars.filter(name => {
                if (name.toLowerCase().includes(term)) return true;
                const assigned = fruitAssignments[name] || [];
                return assigned.some(f => f && f.toLowerCase().includes(term));
            });
        }

        if (sortMode.includes('unassigned')) {
            const dir = sortMode === 'unassigned_asc' ? 1 : -1;
            targetChars.sort((a, b) => (getUnassignedFruitCount(a) - getUnassignedFruitCount(b)) * dir);
        }

        if (targetChars.length === 0) {
            DOM.fruitTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px;">無符合資料</td></tr>';
            return;
        }

        const fragment = document.createDocumentFragment();
        targetChars.forEach(name => {
            const assigned = fruitAssignments[name] || [];
            const obtained = fruitObtained[name] || [];
            
            const row = document.createElement('tr');
            if (isCharacterCompleted(name)) row.classList.add('row-completed');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.setAttribute('data-label', '角色');
            row.appendChild(nameCell);

            for (let i = 0; i < 4; i++) {
                const cell = document.createElement('td');
                cell.setAttribute('data-label', `果實 ${i+1}`);
                const hasFruit = !!assigned[i];
                const isChecked = !!obtained[i];
                cell.innerHTML = `
                    <div class="select-wrapper">
                        <select class="fruit-select" data-char="${name}" data-idx="${i}">
                            ${optionsHtml}
                        </select>
                        <input type="checkbox" class="fruit-check" data-char="${name}" data-idx="${i}" 
                               ${isChecked ? 'checked' : ''} style="display: ${hasFruit ? 'inline-block' : 'none'}">
                    </div>
                `;
                const select = cell.querySelector('select');
                if (select && assigned[i]) select.value = assigned[i];
                row.appendChild(cell);
            }
            fragment.appendChild(row);
        });
        DOM.fruitTableBody.appendChild(fragment);
    };

    const renderStorageTable = () => {
        DOM.storageTableBody.innerHTML = '';
        const term = DOM.searchStorageChar.value.trim().toLowerCase();
        const optionsHtml = generateFruitOptionsHTML();

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

        const fragment = document.createDocumentFragment();
        targets.forEach(name => {
            // 安全檢查：雖然有 ensureDataIntegrity，但再次確認更保險
            if (!storageAssignments[name]) storageAssignments[name] = ['', '', '', ''];
            const assigned = storageAssignments[name];
            
            const row = document.createElement('tr');
            row.innerHTML = `<td>${name}</td>`;
            
            let hasAnyFruit = false;
            for (let i = 0; i < 4; i++) {
                if (assigned[i]) hasAnyFruit = true;
                const cell = document.createElement('td');
                cell.innerHTML = `
                    <div style="display:flex; align-items:center; gap:5px;">
                        <select class="storage-select" data-char="${name}" data-idx="${i}" style="width:100%;">
                            ${optionsHtml}
                        </select>
                    </div>
                `;
                const select = cell.querySelector('select');
                if (select) select.value = assigned[i] || '';
                row.appendChild(cell);
            }

            const actionCell = document.createElement('td');
            actionCell.style.cssText = 'display:flex; gap:5px; align-items:center; justify-content:space-between;';
            let btns = `
                <div style="display:flex; gap:5px;">
                    <button class="btn btn-edit btn-rename" data-name="${name}" title="重新命名" style="padding: 8px 10px;">✏️</button>
                    <button class="btn btn-red btn-delete" data-name="${name}" title="刪除角色" style="padding: 8px 10px;">🗑️</button>
                </div>
            `;
            if (hasAnyFruit) {
                btns += `<button class="btn btn-blue btn-transfer" data-name="${name}" title="移出果實" style="padding: 8px 10px;">⚡</button>`;
            }
            actionCell.innerHTML = btns;
            row.appendChild(actionCell);
            fragment.appendChild(row);
        });
        DOM.storageTableBody.appendChild(fragment);
    };

    const renderBankSelectors = () => {
        DOM.bankFruitSelectors.innerHTML = '';
        const optionsHtml = generateFruitOptionsHTML();
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < BANK_SLOTS; i++) {
            const container = document.createElement('div');
            container.className = 'inventory-item bank-slot';
            const select = document.createElement('select');
            select.innerHTML = optionsHtml;
            select.value = bankAssignments[i] || '';
            
            // 綁定事件
            select.onchange = () => {
                bankAssignments[i] = select.value;
                saveData();
                renderAll();
            };

            container.innerHTML = `<strong>鳥籠 ${i + 1}</strong>`;
            container.appendChild(select);

            const fruitName = bankAssignments[i];
            if (fruitName) {
                const neededSlots = getNeededCharacterSlots(fruitName);
                const hasDestination = getAvailableDestinationSlots(fruitName);
                if (neededSlots.length > 0 || hasDestination.bank.length > 0 || hasDestination.storage.length > 0) {
                    const btn = document.createElement('button');
                    btn.className = 'btn btn-green';
                    btn.style.cssText = 'font-size: 12px; padding: 4px 8px; margin-top: 5px; width: 100%;';
                    btn.textContent = `⚡ 轉移果實`;
                    btn.onclick = () => initTransferModal(fruitName, 'bank', i);
                    container.appendChild(btn);
                } else {
                    const div = document.createElement('div');
                    div.textContent = '✓ 無需轉移';
                    div.style.cssText = 'font-size: 12px; color: #28a745; margin-top: 5px;';
                    container.appendChild(div);
                }
            }
            fragment.appendChild(container);
        }
        DOM.bankFruitSelectors.appendChild(fragment);
    };

    const renderOverviewCards = () => {
        DOM.attackFruitsOverview.innerHTML = '';
        DOM.otherFruitsOverview.innerHTML = '';
        
        const usageData = getFruitUsageData();
        const stockData = getTotalStockCounts();
        const fragAttack = document.createDocumentFragment();
        const fragOther = document.createDocumentFragment();

        const appendCard = (targetFrag, f) => {
            const totalStock = stockData[f] || 0;
            if ((usageData[f]?.total || 0) > 0 || totalStock > 0) {
                targetFrag.appendChild(createOverviewItem(f, usageData[f], totalStock));
            }
        };

        if (fruitCategories['同族']) fruitCategories['同族'].forEach(f => appendCard(fragAttack, f));
        if (fruitCategories['戰型']) fruitCategories['戰型'].forEach(f => appendCard(fragAttack, f));
        if (fruitCategories['擊種']) fruitCategories['擊種'].forEach(f => appendCard(fragAttack, f));
        if (fruitCategories['其他']) fruitCategories['其他'].forEach(f => appendCard(fragOther, f));
        
        DOM.attackFruitsOverview.appendChild(fragAttack);
        DOM.otherFruitsOverview.appendChild(fragOther);
    };

    const updatePresetCharacterSelect = () => {
        const term = DOM.searchInput.value.trim().toLowerCase();
        const filtered = getFilteredCharacters(); 
        const searchFiltered = term ? filtered.filter(n => n.toLowerCase().includes(term)) : filtered;
        
        const currentVal = DOM.presetCharacterSelect.value;
        const fragment = document.createDocumentFragment();
        const defOpt = document.createElement('option');
        defOpt.value = "";
        defOpt.textContent = "選擇角色";
        fragment.appendChild(defOpt);

        searchFiltered.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            fragment.appendChild(opt);
        });
        
        DOM.presetCharacterSelect.innerHTML = '';
        DOM.presetCharacterSelect.appendChild(fragment);

        if (searchFiltered.includes(currentVal)) DOM.presetCharacterSelect.value = currentVal;
        else if (searchFiltered.length === 1) DOM.presetCharacterSelect.value = searchFiltered[0];
    };

    // ==========================================
    // 5. 事件監聽 (Event Delegation & Handling)
    // ==========================================

    DOM.characterListUl.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const name = btn.dataset.name;
        
        if (btn.classList.contains('btn-delete')) {
            if (await customConfirm(`確定刪除「${name}」？`)) {
                characters = characters.filter(c => c !== name);
                delete fruitAssignments[name];
                delete fruitObtained[name];
                saveData();
                renderAll();
                if (DOM.modalCharacterSearch.value) renderCharacters(DOM.modalCharacterSearch.value);
            }
        } else if (btn.classList.contains('btn-rename')) {
            renameCharacter(name, 'main');
        }
    });

    DOM.storageTableBody.addEventListener('change', (e) => {
        if (e.target.classList.contains('storage-select')) {
            const { char, idx } = e.target.dataset;
            if (storageAssignments[char]) {
                storageAssignments[char][idx] = e.target.value;
                saveData();
                renderAll();
            }
        }
    });

    DOM.storageTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        const name = btn.dataset.name;

        if (btn.classList.contains('btn-delete')) {
            if (await customConfirm(`確定刪除倉庫角色「${name}」？`)) {
                storageCharacters = storageCharacters.filter(c => c !== name);
                delete storageAssignments[name];
                saveData();
                renderAll();
            }
        } else if (btn.classList.contains('btn-rename')) {
            renameCharacter(name, 'storage');
        } else if (btn.classList.contains('btn-transfer')) {
            initTransferModal(null, 'storage', name);
        }
    });

    DOM.fruitTableBody.addEventListener('change', (e) => {
        const target = e.target;
        const { char, idx } = target.dataset;
        if (!char) return;

        if (target.classList.contains('fruit-select')) {
            if (!fruitAssignments[char]) fruitAssignments[char] = [];
            fruitAssignments[char][idx] = target.value;
            if (!target.value) fruitObtained[char][idx] = false;
            
            saveData();
            renderAll();
        } else if (target.classList.contains('fruit-check')) {
            if (!fruitObtained[char]) fruitObtained[char] = [];
            fruitObtained[char][idx] = target.checked;
            
            saveData();
            renderAll();
        }
    });

    DOM.searchInput.addEventListener('input', debounce(() => {
        renderTable(); 
        updatePresetCharacterSelect();
    }, 300));

    DOM.modalCharacterSearch.addEventListener('input', debounce((e) => {
        renderCharacters(e.target.value);
    }, 300));

    DOM.searchStorageChar.addEventListener('input', debounce(() => renderStorageTable(), 300));

    // 按鈕綁定 (增加檢查)
    if(DOM.addCharacter) DOM.addCharacter.onclick = () => {
        const name = DOM.newCharacter.value.trim();
        if (name && !characters.includes(name)) {
            characters.push(name);
            saveData();
            renderAll();
            DOM.newCharacter.value = '';
        } else if (characters.includes(name)) customAlert('角色已存在');
    };

    if(DOM.showCharacterList) DOM.showCharacterList.onclick = () => {
        DOM.modalCharacterSearch.value = '';
        renderCharacters();
        toggleModal(DOM.characterModal, true);
    };

    if(DOM.resetCharacterList) DOM.resetCharacterList.onclick = async () => {
        if (await customConfirm('重置清單？將清除所有主力角色。')) {
            characters = [];
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };

    if(DOM.addStorageCharBtn) DOM.addStorageCharBtn.onclick = () => {
        const name = DOM.newStorageChar.value.trim();
        if (name && !storageCharacters.includes(name)) {
            storageCharacters.push(name);
            storageAssignments[name] = ['', '', '', ''];
            saveData();
            renderAll();
            DOM.newStorageChar.value = '';
        } else if (storageCharacters.includes(name)) customAlert('倉庫角色已存在');
    };

    if(DOM.saveSlotSelect) DOM.saveSlotSelect.onchange = (e) => changeSlot(e.target.value);
    if(DOM.addSlotBtn) DOM.addSlotBtn.onclick = addSlot;
    if(DOM.deleteSlotBtn) DOM.deleteSlotBtn.onclick = deleteSlot;
    if(DOM.renameSlotBtn) DOM.renameSlotBtn.onclick = async () => {
        const newName = await customInput('請輸入此存檔的名稱：', recordName);
        if (newName !== null) { 
            recordName = newName;
            saveData();
            updateTitle();
        }
    };

    if(DOM.addFruit) DOM.addFruit.onclick = () => {
        const name = DOM.newFruitName.value.trim();
        const cat = DOM.newFruitCategory.value;
        if (!name) return customAlert('請輸入名稱');
        if (getAllFruits().includes(name)) return customAlert('果實已存在');
        
        const target = cat === '加擊類' ? '同族' : '其他';
        if (!fruitCategories[target]) fruitCategories[target] = [];
        fruitCategories[target].push(name);
        
        saveData();
        applyData({ characters, fruitAssignments, fruitCategories, fruitObtained, bankAssignments, storageCharacters, storageAssignments, recordName });
        renderAll();
        DOM.newFruitName.value = '';
    };

    if(DOM.deleteFruitBtn) DOM.deleteFruitBtn.onclick = () => {
        DOM.deleteFruitSelect.innerHTML = '<option value="">請選擇果實</option>';
        getAllFruits().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            DOM.deleteFruitSelect.appendChild(opt);
        });
        toggleModal(DOM.deleteFruitModal, true);
    };

    if(DOM.confirmDeleteFruit) DOM.confirmDeleteFruit.onclick = async () => {
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
            applyData({ characters, fruitAssignments, fruitCategories, fruitObtained, bankAssignments, storageCharacters, storageAssignments, recordName });
            renderAll();
            toggleModal(DOM.deleteFruitModal, false);
        }
    };

    DOM.presetBtns.forEach((btn, idx) => {
        if(!btn) return;
        btn.onclick = () => {
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

    if(DOM.resetPresetCharacter) DOM.resetPresetCharacter.onclick = async () => {
        const char = DOM.presetCharacterSelect.value;
        if (!char) return customAlert('請先選擇角色');
        if (await customConfirm(`重置「${char}」的分配？`)) {
            fruitAssignments[char] = [];
            fruitObtained[char] = [];
            saveData();
            renderAll();
        }
    };

    if(DOM.resetAssignments) DOM.resetAssignments.onclick = async () => {
        if (await customConfirm('重置所有主力角色分配？')) {
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };

    if(DOM.resetAllData) DOM.resetAllData.onclick = async () => {
        const slotName = DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text;
        if (await customConfirm(`⚠️ 確定要初始化【${slotName}】的所有資料嗎？`)) {
            const keys = ['characters','fruitAssignments','fruitInventory','fruitCategories','fruitObtained','bankAssignments','storageCharacters','storageAssignments','recordName'];
            keys.forEach(k => localStorage.removeItem(getLocalKey(k)));
            
            clearMemoryData();
            
            const cache = JSON.parse(localStorage.getItem('slot_names_cache') || '{}');
            delete cache[currentSlot];
            localStorage.setItem('slot_names_cache', JSON.stringify(cache));
            updateTitle();

            if (isCloudMode && currentUser && db) {
                const { doc, setDoc } = window.firebaseModules;
                const userDocRef = doc(db, "artifacts", envAppId, "users", currentUser.uid, "fruit_data", getSaveDocName());
                await setDoc(userDocRef, {
                    characters: [], fruitAssignments: {}, fruitObtained: {},
                    bankAssignments: Array(BANK_SLOTS).fill(''), storageCharacters: [],
                    storageAssignments: {}, recordName: '', lastUpdated: new Date()
                });
                sessionStorage.removeItem(DATA_CACHE_PREFIX + currentUser.uid);
                updateCloudStatus('online', `雲端資料已清空 (${slotName})`);
            }
            renderAll();
            customAlert(`已重置【${slotName}】。`);
        }
    };

    if(DOM.saveDataBtn) DOM.saveDataBtn.onclick = () => {
        const now = new Date();
        const dateStr = now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
        const data = { characters, fruitAssignments, bankAssignments, fruitCategories, fruitObtained, storageCharacters, storageAssignments, recordName };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (recordName ? `${recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`);
        a.click();
    };

    if(DOM.loadDataBtn) DOM.loadDataBtn.onclick = () => DOM.loadFile.click();
    if(DOM.loadFile) DOM.loadFile.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                let result = evt.target.result;
                if (result.charCodeAt(0) === 0xFEFF) result = result.substr(1);
                const d = JSON.parse(result);
                applyData(d);
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

    if(DOM.resetBank) DOM.resetBank.onclick = async () => {
        if (await customConfirm('確定重置所有 7 個鳥籠的果實種類？')) {
            bankAssignments = Array(BANK_SLOTS).fill('');
            saveData();
            renderAll();
        }
    };

    // 其他全域監聽
    if(DOM.filterModeCheckbox) DOM.filterModeCheckbox.onchange = () => renderTable();
    if(DOM.hideCompletedCheckbox) DOM.hideCompletedCheckbox.onchange = () => { renderTable(); updatePresetCharacterSelect(); };
    if(DOM.sortCharacterBy) DOM.sortCharacterBy.onchange = () => { renderTable(); updatePresetCharacterSelect(); };
    
    document.querySelectorAll('.close-modal, .close-btn-action, .transfer-close').forEach(btn => {
        btn.onclick = () => toggleModal(btn.closest('.modal'), false);
    });
    
    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) toggleModal(e.target, false);
    };

    // 啟動
    initApp();

    // ==========================================
    // 6. 其他輔助與異步邏輯
    // ==========================================

    async function renameCharacter(oldName, type) {
        const newName = await customInput(`請輸入「${oldName}」的新名稱：`, oldName);
        if (!newName || newName === oldName) return;
        
        if (type === 'main') {
            if (characters.includes(newName)) return customAlert('此角色名稱已存在！');
            const idx = characters.indexOf(oldName);
            if (idx !== -1) characters[idx] = newName;
            
            if (fruitAssignments[oldName]) {
                fruitAssignments[newName] = fruitAssignments[oldName];
                delete fruitAssignments[oldName];
            }
            if (fruitObtained[oldName]) {
                fruitObtained[newName] = fruitObtained[oldName];
                delete fruitObtained[oldName];
            }
            if (DOM.modalCharacterSearch.value) renderCharacters(DOM.modalCharacterSearch.value);

        } else {
            if (storageCharacters.includes(newName)) return customAlert('此倉庫角色名稱已存在！');
            const idx = storageCharacters.indexOf(oldName);
            if (idx !== -1) storageCharacters[idx] = newName;
            
            if (storageAssignments[oldName]) {
                storageAssignments[newName] = storageAssignments[oldName];
                delete storageAssignments[oldName];
            }
        }
        
        saveData();
        renderAll();
        customAlert(`已將「${oldName}」更名為「${newName}」。`);
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
        if (currentSlot === 'default') return customAlert('無法刪除預設存檔。');

        const slotName = DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex].text;
        if (await customConfirm(`確定要刪除「${slotName}」嗎？`)) {
            const deletedSlot = currentSlot;
            slotList = slotList.filter(id => id !== deletedSlot);
            localStorage.setItem('global_slot_list', JSON.stringify(slotList));
            
            const keys = ['characters','fruitAssignments','fruitCategories','fruitObtained','bankAssignments','storageCharacters','storageAssignments','recordName'];
            keys.forEach(key => localStorage.removeItem(`${deletedSlot}_${key}`));
            
            const cache = JSON.parse(localStorage.getItem('slot_names_cache') || '{}');
            delete cache[deletedSlot];
            localStorage.setItem('slot_names_cache', JSON.stringify(cache));

            await changeSlot('default');
            customAlert(`已刪除「${slotName}」。`);
        }
    }

    async function changeSlot(newSlot) {
        await saveData(true); // Force Save
        updateCloudStatus('saving', '切換存檔中...');
        
        currentSlot = newSlot;
        if(DOM.saveSlotSelect) DOM.saveSlotSelect.value = newSlot;
        clearMemoryData();
        
        if (isCloudMode && currentUser && db) {
            try {
                const { doc, getDoc } = window.firebaseModules;
                const userDocRef = doc(db, "artifacts", envAppId, "users", currentUser.uid, "fruit_data", getSaveDocName());
                const docSnap = await getDoc(userDocRef);
                
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    applyData(data);
                    sessionStorage.setItem(DATA_CACHE_PREFIX + currentUser.uid, JSON.stringify(data));
                    updateCloudStatus('online', `已載入: ${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex]?.text}`);
                } else {
                    loadFromLocalStorage();
                    updateCloudStatus('online', `新存檔: ${DOM.saveSlotSelect.options[DOM.saveSlotSelect.selectedIndex]?.text}`);
                }
            } catch(e) {
                console.error("Cloud Change Error", e);
                loadFromLocalStorage();
                updateCloudStatus('offline', '切換讀取失敗，使用本地');
            }
        } else {
            loadFromLocalStorage();
            localStorage.setItem('lastSelectedSlot', currentSlot);
        }
        renderAll();
    }

    function checkAuthCache() {
        const cachedUserStr = sessionStorage.getItem(USER_CACHE_KEY);
        if (cachedUserStr) {
            try {
                const cachedUser = JSON.parse(cachedUserStr);
                renderAuthUI(cachedUser);
                
                const cachedDataStr = sessionStorage.getItem(DATA_CACHE_PREFIX + cachedUser.uid);
                if (cachedDataStr) {
                    const data = JSON.parse(cachedDataStr);
                    applyData(data);
                    const lastSlot = localStorage.getItem('lastSelectedSlot');
                    if (lastSlot && slotList.includes(lastSlot)) currentSlot = lastSlot;
                    
                    renderAll();
                    updateCloudStatus('online', '雲端就緒 (快取)');
                }
            } catch (e) {
                console.warn('Cache Error', e);
                sessionStorage.removeItem(USER_CACHE_KEY);
            }
        }
    }

    function renderAuthUI(user) {
        if (user && DOM.userInfo) {
            DOM.userInfo.style.display = 'flex';
            DOM.userDisplayName.textContent = user.displayName || "使用者";
            DOM.userAvatar.src = user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || "User"}&background=random`;
        } else if (DOM.userInfo) {
            DOM.userInfo.style.display = 'none';
        }
    }

    function initApp(retries = 0) {
        if (retries === 0) {
            checkAuthCache();
            renderSlotOptions();
            const lastSlot = localStorage.getItem('lastSelectedSlot');
            if (lastSlot && slotList.includes(lastSlot)) {
                currentSlot = lastSlot;
                if(DOM.saveSlotSelect) DOM.saveSlotSelect.value = currentSlot;
            }
            
            if (DOM.logoutBtn) {
                DOM.logoutBtn.onclick = () => {
                    if (window.firebaseModules?.signOut && auth) {
                        window.firebaseModules.signOut(auth).then(() => {
                             sessionStorage.removeItem(USER_CACHE_KEY);
                             customAlert("已成功登出", "登出");
                        });
                    } else location.reload();
                };
            }
        }

        if (window.firebaseApp && window.firebaseAuth) {
            db = window.firebaseDb;
            auth = window.firebaseAuth;
            envAppId = window.envAppId || 'default-app-id';
            
            window.onAuthStateChanged(auth, async (user) => {
                if (user) {
                     sessionStorage.setItem(USER_CACHE_KEY, JSON.stringify({
                        uid: user.uid, displayName: user.displayName, photoURL: user.photoURL
                     }));
                     renderAuthUI(user);
                     currentUser = user;
                     isCloudMode = true; 
                     
                     if (characters.length === 0) updateCloudStatus('saving', '正在從雲端載入...');

                     try {
                        const { doc, getDoc } = window.firebaseModules;
                        const userDocRef = doc(db, "artifacts", envAppId, "users", user.uid, "fruit_data", getSaveDocName());
                        const docSnap = await getDoc(userDocRef);

                        if (docSnap.exists()) {
                            const data = docSnap.data();
                            sessionStorage.setItem(DATA_CACHE_PREFIX + user.uid, JSON.stringify(data));
                            applyData(data);
                            updateCloudStatus('online', `雲端就緒`);
                            renderAll(); 
                        } else {
                            if (currentSlot === 'default' && localStorage.getItem('characters')) { 
                                loadFromLocalStorage(); 
                                saveData(); 
                                customAlert(`歡迎！已備份本地資料至雲端。`);
                            } else {
                                updateTitle(); 
                                updateCloudStatus('online', '雲端就緒 (新資料)');
                                renderAll();
                            }
                        }
                     } catch (e) {
                        console.error("Auth Load Error", e);
                        if (characters.length === 0) { loadFromLocalStorage(); renderAll(); }
                        isCloudMode = false;
                        updateCloudStatus('offline', '雲端讀取錯誤'); 
                     }
                } else {
                     sessionStorage.removeItem(USER_CACHE_KEY);
                     renderAuthUI(null);
                     isCloudMode = false;
                     updateCloudStatus('offline', '未偵測到帳戶 (離線模式)');
                     if (characters.length === 0) { loadFromLocalStorage(); renderAll(); }
                }
            });
        } else if (retries < 50) { 
            setTimeout(() => initApp(retries + 1), 100);
        } else {
            if (characters.length === 0) { loadFromLocalStorage(); renderAll(); }
        }
    }
});