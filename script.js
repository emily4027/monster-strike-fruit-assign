document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 資料初始化 ---
    const defaultFruits = {
        "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
        "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
        "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
        "其他": ["將消", "兵消", "熱友", "速必"]
    };

    // 安全讀取 LocalStorage
    function safeLoad(key, defaultValue) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (e) {
            console.warn(`讀取 ${key} 失敗，使用預設值`);
            return defaultValue;
        }
    }

    let fruitCategories = safeLoad('fruitCategories', JSON.parse(JSON.stringify(defaultFruits)));
    let characters = safeLoad('characters', []);
    let fruitAssignments = safeLoad('fruitAssignments', {});
    let fruitInventory = safeLoad('fruitInventory', {});
    let fruitObtained = safeLoad('fruitObtained', {});
    let recordName = localStorage.getItem('recordName') || '';

    // 初始化庫存 (確保所有果實都有 key)
    // [修正] 確保 fruitCategories 是物件且有值
    if (fruitCategories && typeof fruitCategories === 'object') {
        const allFruits = Object.values(fruitCategories).flat();
        allFruits.forEach(f => {
            if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
        });
    } else {
        // 如果 fruitCategories 損壞，重置為預設
        fruitCategories = JSON.parse(JSON.stringify(defaultFruits));
    }

    // --- 2. DOM 元素 ---
    const mainTitle = document.getElementById('mainTitle');
    const recordNameInput = document.getElementById('recordName');
    const newCharacterInput = document.getElementById('newCharacter');
    const characterCountSpan = document.getElementById('characterCount');
    const attackFruitsContainer = document.getElementById('attackFruits');
    const otherFruitsContainer = document.getElementById('otherFruits');
    const fruitTableBody = document.getElementById('fruitTableBody');
    const searchInput = document.getElementById('searchCharacter');
    const filterModeCheckbox = document.getElementById('filterModeCheckbox');
    const presetCharacterSelect = document.getElementById('presetCharacter');
    const showInventoryDetailCheckbox = document.getElementById('showInventoryDetail');
    
    // Modal 相關
    const characterModal = document.getElementById('characterModal');
    const deleteFruitModal = document.getElementById('deleteFruitModal');
    const alertModal = document.getElementById('alertModal');
    const confirmModal = document.getElementById('confirmModal');
    const characterListUl = document.getElementById('characterList');
    const modalCharacterSearch = document.getElementById('modalCharacterSearch');

    // --- 3. Modal Helper Functions ---
    function toggleModal(modal, show) {
        if (show) modal.classList.add('show');
        else modal.classList.remove('show');
    }

    function customAlert(message, title = '提示') {
        document.getElementById('alertTitle').textContent = title;
        document.getElementById('alertMessage').textContent = message;
        toggleModal(alertModal, true);
        
        const btn = document.getElementById('alertOkBtn');
        const newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.onclick = () => toggleModal(alertModal, false);
    }

    function customConfirm(message, title = '請確認') {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        toggleModal(confirmModal, true);
        
        const cancelBtn = document.getElementById('confirmCancelBtn');
        const okBtn = document.getElementById('confirmOkBtn');
        
        return new Promise((resolve) => {
            const newCancel = cancelBtn.cloneNode(true);
            const newOk = okBtn.cloneNode(true);
            cancelBtn.parentNode.replaceChild(newCancel, cancelBtn);
            okBtn.parentNode.replaceChild(newOk, okBtn);
            
            newCancel.onclick = () => { toggleModal(confirmModal, false); resolve(false); };
            newOk.onclick = () => { toggleModal(confirmModal, false); resolve(true); };
        });
    }

    // --- 4. 核心邏輯 ---
    function saveData() {
        localStorage.setItem('characters', JSON.stringify(characters));
        localStorage.setItem('fruitAssignments', JSON.stringify(fruitAssignments));
        localStorage.setItem('fruitInventory', JSON.stringify(fruitInventory));
        localStorage.setItem('fruitCategories', JSON.stringify(fruitCategories));
        localStorage.setItem('fruitObtained', JSON.stringify(fruitObtained));
        localStorage.setItem('recordName', recordName);
    }

    function getAllFruits() {
        if (!fruitCategories || typeof fruitCategories !== 'object') return [];
        return Object.values(fruitCategories).flat();
    }

    function updateTitle() {
        const name = recordName ? `${recordName}的果實分配` : '果實分配';
        if (mainTitle) mainTitle.textContent = name;
        document.title = name;
        if (recordNameInput) recordNameInput.value = recordName;
    }

    function renderAll() {
        updateTitle();
        renderCharacters();
        renderInventory();
        renderTable();
        updatePresetCharacterSelect();
    }

    // --- 5. 渲染函式 ---
    function renderCharacters(searchTerm = '') {
        characterListUl.innerHTML = '';
        characterCountSpan.textContent = characters.length;
        
        const filtered = searchTerm 
            ? characters.filter(n => n.toLowerCase().includes(searchTerm.toLowerCase()))
            : characters;
            
        if (filtered.length === 0) {
            characterListUl.innerHTML = '<li style="text-align:center; color:#999; padding:10px;">無符合角色</li>';
            return;
        }
        
        filtered.forEach(name => {
            const li = document.createElement('li');
            li.className = 'character-list-item';
            li.innerHTML = `
                <span>${name}</span>
                <button class="btn btn-red" style="padding: 2px 8px; font-size: 12px;" data-name="${name}">🗑️</button>
            `;
            li.querySelector('button').onclick = async () => {
                if (await customConfirm(`確定刪除「${name}」？`)) {
                    characters = characters.filter(c => c !== name);
                    delete fruitAssignments[name];
                    delete fruitObtained[name];
                    saveData();
                    renderAll();
                    renderCharacters(modalCharacterSearch.value);
                }
            };
            characterListUl.appendChild(li);
        });
    }

    function renderInventory() {
        attackFruitsContainer.innerHTML = '';
        otherFruitsContainer.innerHTML = '';
        
        const allFruits = getAllFruits();
        // 確保庫存 key 存在
        allFruits.forEach(f => { 
            if (fruitInventory[f] === undefined) fruitInventory[f] = 0; 
        });

        ['同族', '戰型', '擊種'].forEach(category => {
            if (fruitCategories[category]) {
                fruitCategories[category].forEach(f => {
                    attackFruitsContainer.appendChild(createInventoryItem(f));
                });
            }
        });
        
        if (fruitCategories['其他']) {
            fruitCategories['其他'].forEach(f => {
                otherFruitsContainer.appendChild(createInventoryItem(f));
            });
        }
    }

    function createInventoryItem(fruitName) {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        
        const safeAssignments = fruitAssignments || {};
        const totalAssigned = Object.values(safeAssignments).flat().filter(x => x === fruitName).length;
        
        let obtainedCount = 0;
        const safeObtained = fruitObtained || {};
        
        Object.keys(safeObtained).forEach(char => {
            const assigns = safeAssignments[char] || [];
            const obtained = safeObtained[char] || [];
            assigns.forEach((f, i) => { 
                // [修正] 增加 null 檢查，並確保 obtained[i] 為真值
                if (f === fruitName && obtained && obtained[i]) obtainedCount++; 
            });
        });
        
        const used = totalAssigned - obtainedCount;
        const stock = fruitInventory[fruitName] || 0;
        const diff = stock - used;
        
        let diffHtml = '';
        if (diff === 0) diffHtml = '<span class="stat-diff diff-ok">✓ 剛好</span>';
        else if (diff > 0) diffHtml = `<span class="stat-diff diff-more">📦 多 ${diff}</span>`;
        else diffHtml = `<span class="stat-diff diff-less">⚠️ 少 ${Math.abs(diff)}</span>`;
        
        const showDetail = showInventoryDetailCheckbox.checked;

        item.innerHTML = `
            <strong>${fruitName}</strong>
            <div class="item-content">
                <input type="number" class="item-input" value="${stock}" min="0">
                <div class="item-stats">
                    ${showDetail ? `總: ${totalAssigned} / 用: ${used}<br>` : ''}
                    ${diffHtml}
                </div>
            </div>
        `;
        
        item.querySelector('input').onchange = (e) => {
            fruitInventory[fruitName] = parseInt(e.target.value) || 0;
            saveData();
            renderInventory();
        };
        
        return item;
    }

    function renderTable() {
        fruitTableBody.innerHTML = '';
        const searchTerm = searchInput.value.trim().toLowerCase();
        
        // 過濾邏輯
        let targetChars = characters;
        if (filterModeCheckbox.checked && searchTerm) {
            targetChars = characters.filter(c => c.toLowerCase().includes(searchTerm));
        }
        
        if (targetChars.length === 0) {
            fruitTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 15px;">無符合資料</td></tr>';
            return;
        }

        const fruits = getAllFruits();

        targetChars.forEach(name => {
            const row = document.createElement('tr');
            
            // 角色欄位
            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.setAttribute('data-label', '角色');
            row.appendChild(nameCell);

            const assigned = fruitAssignments[name] || [];
            // [修正] 確保 fruitObtained[name] 存在且為陣列
            if (!fruitObtained[name] || !Array.isArray(fruitObtained[name])) {
                fruitObtained[name] = [];
            }

            for (let i = 0; i < 4; i++) {
                const cell = document.createElement('td');
                cell.setAttribute('data-label', `果實 ${i+1}`);
                
                const wrapper = document.createElement('div');
                wrapper.className = 'select-wrapper';
                
                const select = document.createElement('select');
                select.innerHTML = '<option value="">未選擇</option>';
                fruits.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f; opt.textContent = f;
                    if (assigned[i] === f) opt.selected = true;
                    select.appendChild(opt);
                });
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                // [關鍵修正] 強制轉換 null/undefined 為 false，防止錯誤
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
                    renderInventory();
                };
                
                wrapper.appendChild(select);
                wrapper.appendChild(checkbox);
                cell.appendChild(wrapper);
                row.appendChild(cell);
            }
            fruitTableBody.appendChild(row);
        });
    }

    function updatePresetCharacterSelect() {
        if (!presetCharacterSelect) return;
        const term = searchInput.value.trim().toLowerCase();
        const currentVal = presetCharacterSelect.value;
        presetCharacterSelect.innerHTML = '<option value="">選擇角色</option>';
        
        const filtered = term ? characters.filter(n => n.toLowerCase().includes(term)) : characters;
        filtered.forEach(n => {
            const opt = document.createElement('option');
            opt.value = n; opt.textContent = n;
            presetCharacterSelect.appendChild(opt);
        });
        
        if (filtered.includes(currentVal)) presetCharacterSelect.value = currentVal;
        else if (filtered.length === 1) presetCharacterSelect.value = filtered[0];
    }

    // --- 事件監聽 ---
    recordNameInput.oninput = () => { 
        recordName = recordNameInput.value; 
        saveData(); 
        updateTitle(); 
    };
    
    // [關鍵修正] 檔案載入邏輯：移除 BOM、相容舊資料
    document.getElementById('loadData').onclick = () => document.getElementById('loadFile').click();
    document.getElementById('loadFile').onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                let result = evt.target.result;
                // 移除可能存在的 BOM (0xFEFF)
                if (result.charCodeAt(0) === 0xFEFF) {
                    result = result.substr(1);
                }
                
                const d = JSON.parse(result);
                
                // [修正] 深度合併與防呆處理
                if (d.characters && Array.isArray(d.characters)) characters = d.characters;
                else characters = [];

                if (d.fruitAssignments && typeof d.fruitAssignments === 'object') fruitAssignments = d.fruitAssignments;
                else fruitAssignments = {};

                if (d.fruitInventory && typeof d.fruitInventory === 'object') fruitInventory = d.fruitInventory;
                else fruitInventory = {};

                if (d.fruitCategories && typeof d.fruitCategories === 'object') fruitCategories = d.fruitCategories;
                else fruitCategories = JSON.parse(JSON.stringify(defaultFruits));

                if (d.fruitObtained && typeof d.fruitObtained === 'object') fruitObtained = d.fruitObtained;
                else fruitObtained = {};

                recordName = typeof d.recordName === 'string' ? d.recordName : '';
                
                // 額外清洗：確保 fruitObtained 內的陣列沒有 null，並轉換為 boolean
                for (let key in fruitObtained) {
                    if (Array.isArray(fruitObtained[key])) {
                        fruitObtained[key] = fruitObtained[key].map(v => !!v);
                    }
                }

                saveData();
                renderAll();
                customAlert(`成功載入：${recordName || '未命名紀錄'}`);
            } catch (err) {
                console.error(err);
                customAlert('載入失敗：檔案格式錯誤或編碼不支援。請檢查檔案是否為有效的 JSON。');
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };
    
    document.getElementById('saveData').onclick = () => {
        // 取得當前日期字串 YYYYMMDD
        const now = new Date();
        const dateStr = now.getFullYear() +
            String(now.getMonth() + 1).padStart(2, '0') +
            String(now.getDate()).padStart(2, '0');

        const data = { characters, fruitAssignments, fruitInventory, fruitCategories, fruitObtained, recordName };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        
        // [新增] 檔名加上日期後綴
        const fileName = recordName ? `${recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`;
        a.download = fileName;
        
        a.click();
    };

    searchInput.oninput = () => { renderTable(); updatePresetCharacterSelect(); };
    filterModeCheckbox.onchange = () => renderTable();
    showInventoryDetailCheckbox.onchange = () => renderInventory();
    modalCharacterSearch.oninput = () => renderCharacters(modalCharacterSearch.value);

    document.getElementById('addCharacter').onclick = () => {
        const name = newCharacterInput.value.trim();
        if (name && !characters.includes(name)) {
            characters.push(name);
            saveData();
            renderAll();
            newCharacterInput.value = '';
        } else if (characters.includes(name)) customAlert('角色已存在');
    };

    document.getElementById('showCharacterList').onclick = () => {
        modalCharacterSearch.value = '';
        renderCharacters();
        toggleModal(characterModal, true);
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
        fruitInventory[name] = 0;
        saveData();
        renderAll();
        document.getElementById('newFruitName').value = '';
    };

    document.getElementById('deleteFruitBtn').onclick = () => {
        const select = document.getElementById('deleteFruitSelect');
        select.innerHTML = '<option value="">請選擇果實</option>';
        getAllFruits().forEach(f => {
            const opt = document.createElement('option');
            opt.value = f; opt.textContent = f;
            select.appendChild(opt);
        });
        toggleModal(deleteFruitModal, true);
    };

    document.getElementById('confirmDeleteFruit').onclick = async () => {
        const name = document.getElementById('deleteFruitSelect').value;
        if (!name) return;
        if (await customConfirm(`確定刪除「${name}」？`)) {
            Object.keys(fruitCategories).forEach(k => {
                fruitCategories[k] = fruitCategories[k].filter(f => f !== name);
            });
            delete fruitInventory[name];
            Object.keys(fruitAssignments).forEach(c => {
                fruitAssignments[c] = fruitAssignments[c].map(f => f === name ? '' : f);
                if (fruitObtained[c]) {
                    fruitObtained[c] = fruitObtained[c].map((checked, idx) => fruitAssignments[c][idx] ? checked : false);
                }
            });
            saveData();
            renderAll();
            toggleModal(deleteFruitModal, false);
        }
    };

    const presets = {
        '同族': ['同族加擊', '同族加命擊', '同族加擊速'],
        '戰型': ['戰型加擊', '戰型加命擊', '戰型加擊速'],
        '擊種': ['擊種加擊', '擊種加命擊', '擊種加擊速'],
        '速必雙削': ['將消', '兵消', '速必']
    };
    function applyPreset(type) {
        const char = presetCharacterSelect.value;
        if (!char) return customAlert('請先選擇角色');
        
        const targets = presets[type];
        const all = getAllFruits();
        const missing = targets.filter(t => !all.includes(t));
        if (missing.length > 0) return customAlert(`缺少果實：${missing.join(', ')}`);
        
        fruitAssignments[char] = [...targets, '', '', '', ''].slice(0, 4);
        fruitObtained[char] = [false, false, false, false];
        saveData();
        renderAll();
    }

    ['presetBtn1', 'presetBtn2', 'presetBtn3', 'presetBtn4'].forEach((id, idx) => {
        document.getElementById(id).onclick = () => applyPreset(Object.keys(presets)[idx]);
    });

    document.getElementById('resetPresetCharacter').onclick = async () => {
        const char = presetCharacterSelect.value;
        if (!char) return customAlert('請先選擇角色');
        if (await customConfirm(`重置「${char}」的分配？`)) {
            fruitAssignments[char] = [];
            fruitObtained[char] = [];
            saveData();
            renderAll();
        }
    };

    document.getElementById('resetInventory').onclick = async () => {
        if (await customConfirm('重置所有庫存數量？')) {
            Object.keys(fruitInventory).forEach(k => fruitInventory[k] = 0);
            saveData();
            renderInventory();
        }
    };
    document.getElementById('resetAssignments').onclick = async () => {
        if (await customConfirm('重置所有角色分配？')) {
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };
    document.getElementById('resetCharacterList').onclick = async () => {
        if (await customConfirm('重置清單？將清除所有角色。')) {
            characters = [];
            fruitAssignments = {};
            fruitObtained = {};
            saveData();
            renderAll();
        }
    };
    document.getElementById('resetAllData').onclick = async () => {
        if (await customConfirm('⚠️ 全部初始化？將清除所有資料包含自訂果實！')) {
            localStorage.clear();
            location.reload();
        }
    };

    window.onclick = (e) => {
        if (e.target.classList.contains('modal')) toggleModal(e.target, false);
    };

    // 啟動應用
    renderAll();
});