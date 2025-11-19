document.addEventListener('DOMContentLoaded', () => {

    // --- 1. 資料初始化 ---
    const defaultFruits = {
        "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
        "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
        "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
        "其他": ["將消", "兵消", "熱友", "速必"]
    };

    // 快取 DOM 元素
    const DOM = {
        mainTitle: document.getElementById('mainTitle'),
        recordName: document.getElementById('recordName'),
        newCharacter: document.getElementById('newCharacter'),
        characterCount: document.getElementById('characterCount'),
        attackFruits: document.getElementById('attackFruits'),
        otherFruits: document.getElementById('otherFruits'),
        fruitTableBody: document.getElementById('fruitTableBody'),
        searchInput: document.getElementById('searchCharacter'),
        filterModeCheckbox: document.getElementById('filterModeCheckbox'),
        hideCompletedCheckbox: document.getElementById('hideCompletedCheckbox'),
        presetCharacterSelect: document.getElementById('presetCharacter'),
        showInventoryDetail: document.getElementById('showInventoryDetail'),
        characterModal: document.getElementById('characterModal'),
        characterListUl: document.getElementById('characterList'),
        modalCharacterSearch: document.getElementById('modalCharacterSearch'),
        deleteFruitModal: document.getElementById('deleteFruitModal'),
        deleteFruitSelect: document.getElementById('deleteFruitSelect'),
        alertModal: document.getElementById('alertModal'),
        confirmModal: document.getElementById('confirmModal')
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

    let fruitCategories = safeLoad('fruitCategories', JSON.parse(JSON.stringify(defaultFruits)));
    let characters = safeLoad('characters', []);
    let fruitAssignments = safeLoad('fruitAssignments', {});
    let fruitInventory = safeLoad('fruitInventory', {});
    let fruitObtained = safeLoad('fruitObtained', {});
    let recordName = localStorage.getItem('recordName') || '';

    if (fruitCategories && typeof fruitCategories === 'object') {
        const allFruits = Object.values(fruitCategories).flat();
        allFruits.forEach(f => {
            if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
        });
    } else {
        fruitCategories = JSON.parse(JSON.stringify(defaultFruits));
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

    // --- 3. 核心渲染與邏輯 ---

    function updateTitle() {
        const name = recordName ? `${recordName}的果實分配` : '果實分配';
        if (DOM.mainTitle) DOM.mainTitle.textContent = name;
        if (DOM.recordName) DOM.recordName.value = recordName;
    }

    function renderAll() {
        updateTitle();
        renderCharacters();
        renderInventory();
        renderTable();
        updatePresetCharacterSelect();
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

    function renderInventory() {
        DOM.attackFruits.innerHTML = '';
        DOM.otherFruits.innerHTML = '';
        
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

        const fragmentAttack = document.createDocumentFragment();
        const fragmentOther = document.createDocumentFragment();

        ['同族', '戰型', '擊種'].forEach(category => {
            if (fruitCategories[category]) {
                fruitCategories[category].forEach(f => {
                    fragmentAttack.appendChild(createInventoryItem(f, usageMap[f]));
                });
            }
        });
        
        if (fruitCategories['其他']) {
            fruitCategories['其他'].forEach(f => {
                fragmentOther.appendChild(createInventoryItem(f, usageMap[f]));
            });
        }

        DOM.attackFruits.appendChild(fragmentAttack);
        DOM.otherFruits.appendChild(fragmentOther);
    }

    function createInventoryItem(fruitName, usageData) {
        const item = document.createElement('div');
        item.className = 'inventory-item';
        
        const totalAssigned = usageData ? usageData.total : 0;
        const obtainedCount = usageData ? usageData.obtained : 0;
        
        const used = totalAssigned - obtainedCount;
        const stock = fruitInventory[fruitName] || 0;
        const diff = stock - used;
        
        let diffHtml = '';
        if (diff === 0) diffHtml = '<span class="stat-diff diff-ok">✓ 剛好</span>';
        else if (diff > 0) diffHtml = `<span class="stat-diff diff-more">📦 多 ${diff}</span>`;
        else diffHtml = `<span class="stat-diff diff-less">⚠️ 少 ${Math.abs(diff)}</span>`;
        
        const showDetail = DOM.showInventoryDetail.checked;

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
                    renderInventory();
                    if (DOM.hideCompletedCheckbox.checked || finished !== (hasAssignment && checkbox.checked)) {
                        renderTable();
                    }
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
                fruitInventory = (typeof d.fruitInventory === 'object') ? d.fruitInventory : {};
                fruitCategories = (typeof d.fruitCategories === 'object') ? d.fruitCategories : JSON.parse(JSON.stringify(defaultFruits));
                fruitObtained = (typeof d.fruitObtained === 'object') ? d.fruitObtained : {};
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

        const data = { characters, fruitAssignments, fruitInventory, fruitCategories, fruitObtained, recordName };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = (recordName ? `${recordName}_${dateStr}.json` : `果實分配_${dateStr}.json`);
        a.click();
    };

    DOM.searchInput.oninput = () => { renderTable(); updatePresetCharacterSelect(); };
    DOM.filterModeCheckbox.onchange = () => renderTable();
    DOM.hideCompletedCheckbox.onchange = () => renderTable();
    DOM.showInventoryDetail.onchange = () => renderInventory();
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
        fruitInventory[name] = 0;
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
            delete fruitInventory[name];
            Object.keys(fruitAssignments).forEach(c => {
                fruitAssignments[c] = fruitAssignments[c].map(f => f === name ? '' : f);
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
        if (missing.length > 0) return customAlert(`庫存中無此果實：${missing.join(', ')}`);
        
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

    renderAll();
});