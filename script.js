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
    
    // [修改] 更新 DOM 物件，新增倉庫來源選擇 DOM
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
        
        // 分配區
        fruitTableBody: document.getElementById('fruitTableBody'),
        searchInput: document.getElementById('searchCharacter'),
        filterModeCheckbox: document.getElementById('filterModeCheckbox'),
        hideCompletedCheckbox: document.getElementById('hideCompletedCheckbox'),
        presetCharacterSelect: document.getElementById('presetCharacter'),
        
        // Modal
        characterModal: document.getElementById('characterModal'),
        characterListUl: document.getElementById('characterList'),
        modalCharacterSearch: document.getElementById('modalCharacterSearch'),
        deleteFruitModal: document.getElementById('deleteFruitModal'),
        deleteFruitSelect: document.getElementById('deleteFruitSelect'),
        alertModal: document.getElementById('alertModal'),
        confirmModal: document.getElementById('confirmModal'),
        
        // [新增] 轉移 Modal 相關
        fruitTransferModal: fruitTransferModal,
        transferSourceMessage: transferSourceMessage,
        transferTargetContainer: transferTargetContainer,
        transferDestinationType: transferDestinationType,
        transferTargetSelect: transferTargetSelect,
        transferSlotSelect: transferSlotSelect,
        confirmTransferBtn: confirmTransferBtn,
        // 新增的倉庫來源選擇器
        storageSourceSelector: document.getElementById('storageSourceSelector'),
        storageSourceSlotSelect: document.getElementById('storageSourceSlotSelect')
    };

    function safeLoad(key, defaultValue) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn(`讀取 ${key} 失敗，使用預設值`);
            return defaultValue;
        }
    }

    // 資料變數
    let fruitCategories = safeLoad('fruitCategories', JSON.parse(JSON.stringify(defaultFruits)));
    let characters = safeLoad('characters', []); // 主力角色
    let fruitAssignments = safeLoad('fruitAssignments', {}); // 主力分配
    let fruitObtained = safeLoad('fruitObtained', {});
    
    // BANK 庫存改為陣列 (7個鳥籠)
    let bankAssignments = safeLoad('bankAssignments', Array(BANK_SLOTS).fill('')); 
    
    // 倉庫資料
    let storageCharacters = safeLoad('storageCharacters', []); // 倉庫角色
    let storageAssignments = safeLoad('storageAssignments', {}); // 倉庫分配
    
    let recordName = localStorage.getItem('recordName') || '';

    // 初始化時，如果果實類別改變，確保 BANK 陣列長度不變
    if (bankAssignments.length !== BANK_SLOTS) {
        bankAssignments = Array(BANK_SLOTS).fill('');
    }
    
    // [新增] 轉移狀態追蹤
    let currentTransfer = {
        sourceType: '', // 'bank' 或 'storage'
        sourceIndex: -1, // bank: 鳥籠索引, storage: [角色名稱, 果實索引]
        fruitName: ''
    };
    let storageSourceSlots = {}; // 儲存倉庫角色的果實/欄位資訊

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

    function saveData() {
        localStorage.setItem('characters', JSON.stringify(characters));
        localStorage.setItem('fruitAssignments', JSON.stringify(fruitAssignments));
        localStorage.setItem('fruitCategories', JSON.stringify(fruitCategories));
        localStorage.setItem('fruitObtained', JSON.stringify(fruitObtained));
        localStorage.setItem('bankAssignments', JSON.stringify(bankAssignments)); // 儲存 BANK 陣列
        localStorage.setItem('storageCharacters', JSON.stringify(storageCharacters));
        localStorage.setItem('storageAssignments', JSON.stringify(storageAssignments));
        localStorage.setItem('recordName', recordName);
    }

    function getAllFruits() {
        if (!fruitCategories || typeof fruitCategories !== 'object') return [];
        return Object.values(fruitCategories).flat();
    }

    // 取得所有果實的 總需求 (Total Assigned) 和 已獲得 (Total Obtained)
    function getFruitUsageData() {
        const usageMap = {};
        Object.keys(fruitAssignments).forEach(char => {
            const assigned = fruitAssignments[char] || [];
            const obtained = fruitObtained[char] || [];
            assigned.forEach((fruitName, idx) => {
                if (!fruitName) return;
                if (!usageMap[fruitName]) usageMap[fruitName] = { total: 0, obtained: 0 };
                usageMap[fruitName].total++; // 總分配/需求
                if (obtained[idx]) usageMap[fruitName].obtained++; // 已獲得
            });
        });
        return usageMap;
    }
    
    // 計算總庫存 (BANK + 倉庫)
    function getTotalStockCounts() {
        const stockCounts = {};
        
        // 1. 計算 BANK 數量
        bankAssignments.forEach(fruitName => {
            if (fruitName) {
                stockCounts[fruitName] = (stockCounts[fruitName] || 0) + 1;
            }
        });
        
        // 2. 計算倉庫角色數量
        Object.keys(storageAssignments).forEach(char => {
            const fruits = storageAssignments[char] || [];
            fruits.forEach(f => {
                if (f) {
                    stockCounts[f] = (stockCounts[f] || 0) + 1;
                }
            });
        });
        
        return stockCounts;
    }
    
    // 建立只讀的果實卡片 (用於總覽)
    function createOverviewItem(fruitName, usageData, totalStock) {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        
        const totalAssigned = usageData?.total || 0;
        const obtainedCount = usageData?.obtained || 0; 
        
        const needed = totalAssigned - obtainedCount; // 缺少的數量 (主力需求 - 已獲得)
        const diff = totalStock - needed; // 總庫存 - 缺少 = 缺/多
        
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

        // 調整 HTML 結構：將三個數據放在底部一行，由左至右：分配、已獲得、庫存
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

    // [新增] 取得需要某顆果實且未打勾的角色列表
    function getNeededCharacterSlots(fruitName) {
        const neededSlots = [];
        
        characters.forEach(charName => {
            const assigned = fruitAssignments[charName] || [];
            const obtained = fruitObtained[charName] || [];
            
            assigned.forEach((assignedFruit, index) => {
                // 條件: 1. 果實名稱符合 2. 該欄位未打勾
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

    // [新增] 取得所有可用的空閒目標欄位
    function getAvailableDestinationSlots(fruitName) {
        const slots = {
            main: [], // 主力角色 (需要該果實且未獲得)
            bank: [], // 英雄 BANK (空位)
            storage: [] // 倉庫角色 (空位)
        };
        
        // 1. 主力角色 (Consuming Transfer)
        slots.main = getNeededCharacterSlots(fruitName);
        
        // 2. 英雄 BANK (Relocation Transfer)
        for (let i = 0; i < BANK_SLOTS; i++) {
            if (!bankAssignments[i]) {
                slots.bank.push({ 
                    id: i, 
                    name: `鳥籠 ${i + 1}`,
                    text: `鳥籠 ${i + 1} (空)`
                });
            }
        }

        // 3. 倉庫角色 (Relocation Transfer)
        storageCharacters.forEach(charName => {
            const assigned = storageAssignments[charName] || [];
            // 確保檢查所有 4 個欄位
            for (let index = 0; index < 4; index++) {
                if (!assigned[index]) { // 找到空位
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
    
    // [新增] 獨立函式來載入目的地類型，方便在 Storage 來源選擇後重載
    function loadDestinationTypes(fruitName) {
        const allDestinations = getAvailableDestinationSlots(fruitName);
        const hasMain = allDestinations.main.length > 0;
        const hasBank = allDestinations.bank.length > 0;
        const hasStorage = allDestinations.storage.length > 0;
        
        // 重新設置目的地類型
        DOM.transferDestinationType.innerHTML = '<option value="">-- 請選擇目標類型 --</option>';
        if (hasMain) DOM.transferDestinationType.innerHTML += `<option value="main">主力角色 (填補空缺) (${allDestinations.main.length} 需)</option>`;
        if (hasBank) DOM.transferDestinationType.innerHTML += `<option value="bank">英雄 BANK (空閒鳥籠) (${allDestinations.bank.length} 空)</option>`;
        if (hasStorage) DOM.transferDestinationType.innerHTML += `<option value="storage">倉庫角色 (空閒果實欄位) (${allDestinations.storage.length} 空)</option>`;

        // 重設目標選擇 (防止殘留)
        DOM.transferTargetSelect.innerHTML = '';
        DOM.transferSlotSelect.innerHTML = '';
        DOM.transferTargetContainer.style.display = 'none';
        
        // 目的地類型選擇事件監聽 (原邏輯，但移到這裡)
        DOM.transferDestinationType.onchange = () => {
            const type = DOM.transferDestinationType.value;
            DOM.transferTargetSelect.innerHTML = '';
            DOM.transferSlotSelect.innerHTML = '';
            DOM.transferTargetContainer.style.display = 'none';

            if (!type) return;
            
            const destinations = allDestinations[type];
            DOM.transferTargetContainer.style.display = 'block';
            
            // Start of the destination logic
            if (type === 'bank') {
                // BANK 目的地 (Relocation)
                document.querySelector('#transferTargetContainer p:first-child').textContent = '目標鳥籠:';
                document.querySelector('#transferTargetContainer p:nth-child(3)').textContent = '位置: (鳥籠只有一個位置)';

                DOM.transferTargetSelect.innerHTML = '<option value="">請選擇空閒鳥籠</option>';
                destinations.forEach(slot => {
                    const option = document.createElement('option');
                    option.value = slot.id; // 鳥籠索引
                    option.textContent = slot.text;
                    DOM.transferTargetSelect.appendChild(option);
                });
                
                DOM.transferSlotSelect.innerHTML = '<option value="0">唯一位置</option>';
                DOM.transferSlotSelect.value = '0'; 

                if (destinations.length === 1) {
                    DOM.transferTargetSelect.value = destinations[0].id;
                }
                
            } else if (type === 'main') {
                // 主力角色 (Consuming)
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

                // 角色選擇事件監聽 (動態填充欄位)
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
                // 倉庫角色 (Relocation)
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

                // 角色選擇事件監聽 (動態填充欄位)
                DOM.transferTargetSelect.onchange = () => {
                    const selectedChar = DOM.transferTargetSelect.value;
                    DOM.transferSlotSelect.innerHTML = '<option value="">請選擇空位</option>';

                    if (selectedChar) {
                        charOptions[selectedChar].forEach(slot => {
                            const option = document.createElement('option');
                            option.value = slot.id[1]; // 儲存果實欄位索引
                            option.textContent = slot.text.split(' / ')[1]; // 顯示 '果實 X (空)'
                            DOM.transferSlotSelect.appendChild(option);
                        });
                    }
                };
            }
        };

        if (!hasMain && !hasBank && !hasStorage) {
            // 如果沒有任何目的地，應該在 initTransferModal 被攔截
            DOM.transferDestinationType.innerHTML = '<option value="">無可用目標</option>';
            DOM.transferDestinationType.disabled = true;
        } else {
            DOM.transferDestinationType.disabled = false;
        }
    }


    // [修改] 轉移模態框初始化 (現在處理所有目的地)
    function initTransferModal(fruitName, sourceType, sourceIdentifier) {
        
        // 重設轉移狀態
        currentTransfer.sourceType = '';
        currentTransfer.fruitName = '';
        currentTransfer.sourceIndex = -1;
        
        // 重設 Modal UI
        DOM.transferTargetContainer.style.display = 'none';
        DOM.transferDestinationType.value = '';
        DOM.storageSourceSelector.style.display = 'none'; // 預設隱藏倉庫來源選擇
        DOM.transferTargetSelect.innerHTML = '';
        DOM.transferSlotSelect.innerHTML = '';
        
        // --- 處理倉庫單按鈕啟動邏輯 ---
        if (sourceType === 'storage' && fruitName === null) {
            const charName = sourceIdentifier;
            const assigned = storageAssignments[charName] || [];
            
            storageSourceSlots = {}; // 重置
            let slotCount = 0;
            
            // 找出所有非空的果實欄位
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
            
            if (slotCount === 0) {
                 return customAlert(`倉庫角色「${charName}」目前沒有持有任何果實。`);
            }
            
            // 啟用源頭選擇介面
            DOM.storageSourceSelector.style.display = 'block';
            DOM.transferSourceMessage.textContent = `來源：倉庫角色「${charName}」`;
            DOM.transferDestinationType.disabled = true; // 禁用目標選擇直到來源確定
            
            DOM.storageSourceSlotSelect.innerHTML = '<option value="">-- 請選擇要移出的果實 --</option>';
            Object.keys(storageSourceSlots).forEach(key => {
                const slot = storageSourceSlots[key];
                // 檢查是否有目的地再列出
                const destinations = getAvailableDestinationSlots(slot.fruitName);
                if (destinations.main.length > 0 || destinations.bank.length > 0 || destinations.storage.length > 0) {
                    DOM.storageSourceSlotSelect.innerHTML += `<option value="${key}">${slot.text}</option>`;
                }
            });
            
            if (DOM.storageSourceSlotSelect.options.length <= 1) { // 只有標題或沒有可轉移的
                 return customAlert(`倉庫角色「${charName}」上所有果實都無處可轉移 (主力已獲或庫存已滿)。`);
            }


            // 監聽源頭選擇
            DOM.storageSourceSlotSelect.onchange = () => {
                const selectedKey = DOM.storageSourceSlotSelect.value;
                if (selectedKey) {
                    const slot = storageSourceSlots[selectedKey];
                    
                    // 設置臨時的 currentTransfer 狀態和 UI
                    currentTransfer.sourceType = 'storage';
                    currentTransfer.fruitName = slot.fruitName;
                    currentTransfer.sourceIndex = [charName, slot.slotIndex];
                    DOM.transferSourceMessage.textContent = `來源：倉庫角色「${charName}」的果實 ${slot.slotIndex + 1} (「${slot.fruitName}」)`;
                    
                    DOM.transferDestinationType.disabled = false; // 啟用目的地選擇
                    DOM.transferDestinationType.value = ''; // 重設目的地類型
                    DOM.transferTargetContainer.style.display = 'none';
                    
                    // 重新加載目的地類型選項 (因為目的地取決於果實名稱)
                    loadDestinationTypes(slot.fruitName);

                } else {
                    DOM.transferDestinationType.disabled = true;
                    DOM.transferDestinationType.innerHTML = '<option value="">-- 請選擇目標類型 --</option>';
                    DOM.transferTargetContainer.style.display = 'none';
                }
            };
            
            // 如果只有一個可轉移的果實，自動選擇
            if (DOM.storageSourceSlotSelect.options.length === 2) { 
                DOM.storageSourceSlotSelect.value = DOM.storageSourceSlotSelect.options[1].value;
                DOM.storageSourceSlotSelect.onchange(); 
            }


        } 
        // --- 處理 BANK 或 倉庫單欄位啟動邏輯 (原邏輯) ---
        else if (fruitName) {
            // 設置當前轉移狀態
            currentTransfer.sourceType = sourceType;
            currentTransfer.fruitName = fruitName;
            currentTransfer.sourceIndex = sourceIdentifier;
            
            // 設置來源訊息
            let sourceMsg = '';
            if (sourceType === 'bank') {
                sourceMsg = `來源：英雄 BANK (鳥籠 ${sourceIdentifier + 1}) 的「${fruitName}」`;
            } else if (sourceType === 'storage') {
                const [charName, slotIndex] = sourceIdentifier;
                sourceMsg = `來源：倉庫角色「${charName}」的果實 ${slotIndex + 1} (「${fruitName}」)`;
            }
            DOM.transferSourceMessage.textContent = sourceMsg;
            
            DOM.transferDestinationType.disabled = false; // 確保啟用
            loadDestinationTypes(fruitName); // 載入目的地類型
        } else {
            return customAlert('無法啟動轉移介面：果實名稱缺失。');
        }
        
        // 點擊確認轉移按鈕
        DOM.confirmTransferBtn.onclick = () => performTransfer();
        
        toggleModal(DOM.fruitTransferModal, true);
    }
    
    // [修改] 執行轉移動作 (現在處理所有來源和目的地)
    function performTransfer() {
        const targetType = DOM.transferDestinationType.value;
        const targetContainer = DOM.transferTargetSelect.value;
        let targetSlotIndex = parseInt(DOM.transferSlotSelect.value, 10);

        // 檢查基本選擇
        if (!targetType || !targetContainer) {
             return customAlert('請完整選擇目標類型和容器！');
        }

        // 對 BANK 目的地的特殊處理：欄位索引固定為 0
        if (targetType === 'bank') {
            targetSlotIndex = 0; // 忽略 DOM 傳來的 targetSlotSelect.value，直接使用 0
        } else if (isNaN(targetSlotIndex)) {
            // 對主力或倉庫，如果欄位選擇為 NaN (未選)，則報錯
            return customAlert('請完整選擇目標欄位！');
        }

        
        const { sourceType, fruitName, sourceIndex } = currentTransfer;
        
        // 1. 從來源移除果實
        let transferSuccess = false;
        
        // 來源：BANK
        if (sourceType === 'bank') {
            if (bankAssignments[sourceIndex] === fruitName) {
                bankAssignments[sourceIndex] = '';
                transferSuccess = true;
            }
        } 
        // 來源：倉庫角色
        else if (sourceType === 'storage') {
            const [charName, slotIndex] = sourceIndex;
            if (storageAssignments[charName] && storageAssignments[charName][slotIndex] === fruitName) {
                storageAssignments[charName][slotIndex] = '';
                transferSuccess = true;
            }
        }
        
        if (!transferSuccess) {
            return customAlert('轉移失敗：來源果實狀態不正確或已被移除。');
        }

        // 2. 將果實移到目的地
        let destinationText = '';

        if (targetType === 'main') {
            // 主力角色 (Consuming Transfer)
            fruitObtained[targetContainer][targetSlotIndex] = true;
            destinationText = `主力角色「${targetContainer}」的果實 ${targetSlotIndex + 1}`;
            
        } else if (targetType === 'bank') {
            // 英雄 BANK (Relocation Transfer)
            const bankIndex = parseInt(targetContainer, 10);
            bankAssignments[bankIndex] = fruitName;
            destinationText = `英雄 BANK (鳥籠 ${bankIndex + 1})`;
            
        } else if (targetType === 'storage') {
            // 倉庫角色 (Relocation Transfer)
            const charName = targetContainer;
            // targetSlotIndex 即為果實欄位索引
            if (!storageAssignments[charName]) storageAssignments[charName] = [];
            storageAssignments[charName][targetSlotIndex] = fruitName;
            destinationText = `倉庫角色「${charName}」的果實 ${targetSlotIndex + 1}`;
        }

        // 3. 關閉 Modal, 儲存, 刷新
        toggleModal(DOM.fruitTransferModal, false);
        saveData();
        renderAll();
        customAlert(`成功將「${fruitName}」轉移至 ${destinationText}！`, '轉移成功');
    }
    
    // 關閉轉移 Modal 的通用事件
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

            // 確保切換到總覽時數據是最新的
            if (btn.dataset.tab === 'tab-overview') {
                renderOverviewCards();
            }
        };
    });

    // --- 4. 核心渲染與邏輯 ---

    function updateTitle() {
        const name = recordName ? `${recordName}的果實分配` : '果實分配';
        if (DOM.mainTitle) DOM.mainTitle.textContent = name;
        if (DOM.recordName) DOM.recordName.value = recordName;
    }

    function renderAll() {
        updateTitle();
        renderCharacters();
        renderOverviewCards(); // 總覽 (卡片)
        renderBankSelectors(); // 英雄 BANK
        renderStorageTable(); // 角色暫存箱
        renderTable(); // 主力分配表
        updatePresetCharacterSelect();
    }
    
    // 渲染總覽卡片 (只讀)
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
    
    // 渲染英雄 BANK 下拉選單 (新增轉移按鈕)
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
            
            // 綁定下拉選單事件
            select.onchange = () => {
                bankAssignments[i] = select.value;
                saveData();
                renderAll(); // 更新所有分頁
            };
            
            container.innerHTML = `<strong>鳥籠 ${i + 1}</strong>`;
            container.appendChild(select);
            
            // [新增/修改] 轉移按鈕
            if (fruitName && (neededSlots.length > 0 || hasDestination.bank.length > 0 || hasDestination.storage.length > 0)) {
                const transferBtn = document.createElement('button');
                transferBtn.className = 'btn btn-green';
                transferBtn.style.cssText = 'font-size: 12px; padding: 4px 8px; margin-top: 5px; width: 100%;';
                transferBtn.textContent = `⚡ 轉移果實`; // 簡化為轉移果實，進 Modal 再選目的地
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
        
        const filtered = searchTerm 
            ? characters.filter(n => n.toLowerCase().includes(searchTerm.toLowerCase()))
            : characters;
            
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
    
    // --- 倉庫角色邏輯 (回歸單一轉移按鈕) ---
    DOM.addStorageCharBtn.onclick = () => {
        const name = DOM.newStorageChar.value.trim();
        if (name && !storageCharacters.includes(name)) {
            storageCharacters.push(name);
            // 初始化倉庫角色的 4 個果實欄位
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
            // [修正點 2]: 確保 storageAssignments[name] 是一個長度為 4 的陣列
            if (!storageAssignments[name] || storageAssignments[name].length !== 4) {
                 storageAssignments[name] = (storageAssignments[name] || []).concat(['', '', '', '']).slice(0, 4);
            }
            const assigned = storageAssignments[name];
            
            const row = document.createElement('tr');
            
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            row.appendChild(nameCell);
            
            let hasAnyFruit = false; // 檢查是否有果實可以操作
            
            for (let i = 0; i < 4; i++) {
                const cell = document.createElement('td');
                const wrapper = document.createElement('div');
                wrapper.style.display = 'flex';
                wrapper.style.alignItems = 'center';
                wrapper.style.gap = '5px';

                // 1. 下拉選單
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
                
                // 檢查是否有果實
                if (assigned[i]) {
                    hasAnyFruit = true;
                }
                
                cell.appendChild(wrapper);
                row.appendChild(cell);
            }

            const actionCell = document.createElement('td');
            actionCell.style.display = 'flex';
            actionCell.style.gap = '5px';
            actionCell.style.alignItems = 'center';
            actionCell.style.justifyContent = 'space-between'; // 左右對齊
            
            // 1. 刪除按鈕
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

            // 2. [新增/修改] 單一轉移按鈕
            if (hasAnyFruit) {
                const transferBtn = document.createElement('button');
                transferBtn.className = 'btn btn-blue';
                transferBtn.textContent = '移出果實';
                transferBtn.style.padding = '8px 10px';
                
                // 呼叫 initTransferModal(null, 'storage', name) 讓 Modal 處理果實選擇
                transferBtn.onclick = () => initTransferModal(null, 'storage', name);
                actionCell.appendChild(transferBtn);
            }

            row.appendChild(actionCell);
            fragment.appendChild(row);
        });

        DOM.storageTableBody.appendChild(fragment);
    }


    // --- 主力分配表邏輯 (僅保留) ---
    function renderTable() {
        DOM.fruitTableBody.innerHTML = '';
        const searchTerm = DOM.searchInput.value.trim().toLowerCase();
        const shouldFilter = DOM.filterModeCheckbox.checked;
        const shouldHideCompleted = DOM.hideCompletedCheckbox.checked;
        
        let targetChars = characters;
        if (shouldFilter && searchTerm) {
            targetChars = characters.filter(name => {
                if (name.toLowerCase().includes(searchTerm)) return true;
                const assigned = fruitAssignments[name] || [];
                return assigned.some(fruit => fruit && fruit.toLowerCase().includes(searchTerm));
            });
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
            
            let hasAssignment = false;
            let allDone = true;
            for(let i=0; i<4; i++) {
                if (assigned[i]) {
                    hasAssignment = true;
                    if (!fruitObtained[name][i]) {
                        allDone = false;
                        break;
                    }
                }
            }
            const finished = hasAssignment && allDone;

            if (shouldHideCompleted && finished) return;

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
        const term = DOM.searchInput.value.trim().toLowerCase();
        const currentVal = DOM.presetCharacterSelect.value;
        DOM.presetCharacterSelect.innerHTML = '<option value="">選擇角色</option>';
        
        const filtered = term ? characters.filter(n => n.toLowerCase().includes(term)) : characters;
        filtered.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            DOM.presetCharacterSelect.appendChild(opt);
        });
        
        if (filtered.includes(currentVal)) DOM.presetCharacterSelect.value = currentVal;
        else if (filtered.length === 1) DOM.presetCharacterSelect.value = filtered[0];
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
                
                // 處理舊版果實庫存 (數字) 轉換為新版 BANK 陣列
                if (d.fruitInventory && typeof d.fruitInventory === 'object' && !d.bankAssignments) {
                    customAlert('偵測到舊版庫存資料，已嘗試自動轉換至新版 BANK 介面。');
                    // 舊版數字庫存無法準確對應到鳥籠，因此直接清空 BANK，但保留果實類別
                    bankAssignments = Array(BANK_SLOTS).fill('');
                } else {
                    bankAssignments = Array.isArray(d.bankAssignments) ? d.bankAssignments : Array(BANK_SLOTS).fill('');
                }
                
                fruitCategories = (typeof d.fruitCategories === 'object') ? d.fruitCategories : JSON.parse(JSON.stringify(defaultFruits));
                fruitObtained = (typeof d.fruitObtained === 'object') ? d.fruitObtained : {};
                
                // 載入倉庫資料
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
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');

        const data = { 
            characters, fruitAssignments, bankAssignments, fruitCategories, fruitObtained, 
            storageCharacters, storageAssignments, 
            recordName 
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (recordName ? `${recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`);
        a.click();
    };

    DOM.searchInput.oninput = () => { renderTable(); updatePresetCharacterSelect(); };
    DOM.filterModeCheckbox.onchange = () => renderTable();
    DOM.hideCompletedCheckbox.onchange = () => renderTable();
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
            
            // 清理所有相關資料
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

    const presets = {
        '同族': ['同族加擊', '同族加命擊', '同族加擊速'],
        '戰型': ['戰型加擊', '戰型加命擊', '戰型加擊速'],
        '擊種': ['擊種加擊', '擊種加命擊', '擊種加擊速'],
        '速必雙削': ['將消', '兵消', '速必']
    };
    function applyPreset(type) {
        const char = DOM.presetCharacterSelect.value;
        if (!char) return customAlert('請先選擇角色');
        
        const targets = presets[type];
        const all = getAllFruits();
        const missing = targets.filter(t => !all.includes(t));
        if (missing.length > 0) return customAlert(`果實清單中無此果實：${missing.join(', ')}`);
        
        fruitAssignments[char] = [...targets, '', '', '', ''].slice(0, 4);
        fruitObtained[char] = [false, false, false, false];
        saveData();
        renderAll();
    }

    ['presetBtn1', 'presetBtn2', 'presetBtn3', 'presetBtn4'].forEach((id, idx) => {
        document.getElementById(id).onclick = () => applyPreset(Object.keys(presets)[idx]);
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
        if (await customConfirm('⚠️ 全部初始化？將清除所有資料(含 BANK 與倉庫)！')) {
            localStorage.clear();
            location.reload();
        }
    };

    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) toggleModal(e.target, false);
    };

    renderAll();
});