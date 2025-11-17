// --- 1. 資料初始化 ---
const defaultFruits = {
    "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
    "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
    "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
    "其他": ["將消", "兵消", "熱友", "速必"]
};

let fruitCategories = JSON.parse(localStorage.getItem('fruitCategories')) || JSON.parse(JSON.stringify(defaultFruits));
let characters = JSON.parse(localStorage.getItem('characters')) || [];
let fruitAssignments = JSON.parse(localStorage.getItem('fruitAssignments')) || {};
let fruitInventory = JSON.parse(localStorage.getItem('fruitInventory')) || {};
let fruitObtained = JSON.parse(localStorage.getItem('fruitObtained')) || {};
let recordName = localStorage.getItem('recordName') || '';

// 首次載入時初始化庫存 (如果為空)
if (Object.keys(fruitInventory).length === 0) {
    Object.values(fruitCategories).flat().forEach(f => {
        if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
    });
}


// --- 2. 取得 DOM 元素 ---
const mainTitle = document.getElementById('mainTitle');
const recordNameInput = document.getElementById('recordName');
const newCharacterInput = document.getElementById('newCharacter');
const characterCountSpan = document.getElementById('characterCount');
const inventoryContainer = document.getElementById('inventoryContainer');
const attackFruitsContainer = document.getElementById('attackFruits');
const otherFruitsContainer = document.getElementById('otherFruits');
const fruitAssignmentsContainer = document.getElementById('fruitAssignments');
const searchInput = document.getElementById('searchCharacter');
const filterModeCheckbox = document.getElementById('filterModeCheckbox');
const presetCharacterSelect = document.getElementById('presetCharacter');
const displayModeSelect = document.getElementById('displayMode');
const showInventoryDetailCheckbox = document.getElementById('showInventoryDetail'); 

// Modal 相關
const characterModal = document.getElementById('characterModal');
const deleteFruitModal = document.getElementById('deleteFruitModal');
const alertModal = document.getElementById('alertModal');
const confirmModal = document.getElementById('confirmModal');
const characterListUl = document.getElementById('characterList');
const modalCharacterSearch = document.getElementById('modalCharacterSearch'); 

// --- 3. 自訂 Modal 函式 (取代 alert/confirm) ---

function customAlert(message, title = '提示') {
    document.getElementById('alertTitle').textContent = title;
    document.getElementById('alertMessage').textContent = message;
    alertModal.classList.remove('modal-hidden');
    alertModal.classList.add('modal-visible');
    
    const alertOkBtn = document.getElementById('alertOkBtn');
    const newOkBtn = alertOkBtn.cloneNode(true); 
    alertOkBtn.parentNode.replaceChild(newOkBtn, alertOkBtn); 
    
    newOkBtn.onclick = () => {
        alertModal.classList.add('modal-hidden');
        alertModal.classList.remove('modal-visible');
    };
}

function customConfirm(message, title = '請確認') {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    confirmModal.classList.remove('modal-hidden');
    confirmModal.classList.add('modal-visible');

    const confirmCancelBtn = document.getElementById('confirmCancelBtn');
    const confirmOkBtn = document.getElementById('confirmOkBtn');

    return new Promise((resolve) => {
        const newCancelBtn = confirmCancelBtn.cloneNode(true);
        confirmCancelBtn.parentNode.replaceChild(newCancelBtn, confirmCancelBtn);

        const newOkBtn = confirmOkBtn.cloneNode(true);
        confirmOkBtn.parentNode.replaceChild(newOkBtn, confirmOkBtn);

        newCancelBtn.onclick = () => {
            confirmModal.classList.add('modal-hidden');
            confirmModal.classList.remove('modal-visible');
            resolve(false);
        };
        newOkBtn.onclick = () => {
            confirmModal.classList.add('modal-hidden');
            confirmModal.classList.remove('modal-visible');
            resolve(true);
        };
    });
}

// --- 4. 核心功能函式 ---

function saveData() {
    localStorage.setItem('characters', JSON.stringify(characters));
    localStorage.setItem('fruitAssignments', JSON.stringify(fruitAssignments));
    localStorage.setItem('fruitInventory', JSON.stringify(fruitInventory));
    localStorage.setItem('fruitCategories', JSON.stringify(fruitCategories));
    localStorage.setItem('fruitObtained', JSON.stringify(fruitObtained));
    localStorage.setItem('recordName', recordName);
}

function getAllFruits() {
    return Object.values(fruitCategories).flat();
}

function updateTitle() {
    const name = recordName ? `${recordName}的果實分配` : '果實分配';
    mainTitle.textContent = name;
    document.title = name;
    recordNameInput.value = recordName;
}

function renderAll() {
    updateTitle();
    renderCharacters(); 
    renderInventory(); 
    renderFruitAssignments(); 
    updatePresetCharacterSelect();
}

// --- 5. 畫面渲染 (Render) 函式 ---

function renderCharacters(searchTerm = '') {
    characterListUl.innerHTML = '';
    characterCountSpan.textContent = characters.length;

    const filteredCharacters = searchTerm
        ? characters.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()))
        : characters;

    if (filteredCharacters.length === 0) {
        characterListUl.innerHTML = `<li class="text-center text-gray-500">尚無角色或找不到符合的角色</li>`;
        return;
    }

    filteredCharacters.forEach(name => {
        const li = document.createElement('li');
        li.className = 'character-list-item flex justify-between items-center p-3 hover:bg-gray-50 rounded-md';
        li.innerHTML = `
            <span class="text-gray-800">${name}</span>
            <button class="delete-char-btn px-3 py-1 bg-red-600 text-white text-sm font-semibold rounded-md shadow-sm hover:bg-red-700 transition-colors" data-name="${name}">🗑️ 刪除</button>
        `;
        characterListUl.appendChild(li);
    });
}

function renderInventory() {
    if (!attackFruitsContainer || !otherFruitsContainer) return;

    attackFruitsContainer.innerHTML = '';
    otherFruitsContainer.innerHTML = '';
    
    const allFruits = getAllFruits();
    
    allFruits.forEach(f => {
        if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
    });

    ['同族', '戰型', '擊種'].forEach(category => {
        if (fruitCategories[category] && fruitCategories[category].length > 0) {
            const row = document.createElement('div');
            row.className = 'inventory-row flex flex-col sm:flex-row gap-4'; 
            fruitCategories[category].forEach(fruitName => {
                row.appendChild(createInventoryItem(fruitName));
            });
            for (let i = fruitCategories[category].length; i < 3; i++) {
                 const placeholder = document.createElement('div');
                 placeholder.className = 'flex-1 min-w-[180px]'; 
                 row.appendChild(placeholder);
            }
            attackFruitsContainer.appendChild(row);
        }
    });

    if (fruitCategories['其他']) {
        const otherFruits = fruitCategories['其他'];
        for (let i = 0; i < otherFruits.length; i += 2) {
            const chunk = otherFruits.slice(i, i + 2); 
            const row = document.createElement('div');
            row.className = 'inventory-row flex flex-col sm:flex-row gap-4'; 
            
            chunk.forEach(fruitName => {
                row.appendChild(createInventoryItem(fruitName));
            });

            if (chunk.length === 1) {
                 const placeholder = document.createElement('div');
                 placeholder.className = 'flex-1 min-w-[180px]'; 
                 row.appendChild(placeholder);
            }
            otherFruitsContainer.appendChild(row);
        }
    }
}


function createInventoryItem(fruitName) {
    const item = document.createElement('div');
    item.className = 'inventory-item bg-gray-50 p-3 rounded-lg shadow-sm flex flex-col gap-2 flex-1 min-w-[180px]';

    const name = document.createElement('strong');
    name.className = 'text-gray-800 text-base';
    name.textContent = fruitName;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'flex items-center gap-3 flex-grow w-full'; 

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = fruitInventory[fruitName] || 0;
    input.className = 'w-16 border rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500';
    input.onchange = () => {
        fruitInventory[fruitName] = parseInt(input.value) || 0;
        saveData();
        renderInventory(); 
    };

    const totalAssigned = Object.values(fruitAssignments).flat().filter(x => x === fruitName).length;
    
    let obtainedCount = 0;
    Object.keys(fruitObtained).forEach(char => {
        const assignments = fruitAssignments[char] || [];
        const obtained = fruitObtained[char] || [];
        assignments.forEach((fruit, idx) => {
            if (fruit === fruitName && obtained[idx]) {
                obtainedCount++;
            }
        });
    });

    const usedCount = totalAssigned - obtainedCount;
    const diff = (fruitInventory[fruitName] || 0) - usedCount;

    let diffText, diffColor, diffIcon;
    if (diff === 0) {
        diffText = '剛好';
        diffColor = 'text-green-600';
        diffIcon = '✓';
    } else if (diff > 0) {
        diffText = `多 ${diff}`;
        diffColor = 'text-blue-600';
        diffIcon = '📦';
    } else {
        diffText = `少 ${Math.abs(diff)}`;
        diffColor = 'text-red-600';
        diffIcon = '⚠️';
    }

    const statsDiv = document.createElement('div');
    statsDiv.className = 'stats text-sm text-gray-700 flex-grow text-left';

    const showDetail = showInventoryDetailCheckbox.checked;
    
    statsDiv.innerHTML = `
        ${showDetail ? `<span class="detail-info block">總分配: <strong>${totalAssigned}</strong></span>` : ''}
        ${showDetail ? `<span class="detail-info block">使用中: <strong>${usedCount}</strong></span>` : ''}
        <span class="font-bold ${diffColor} text-base">${diffIcon} ${diffText}</span>
    `;

    contentDiv.appendChild(input);
    contentDiv.appendChild(statsDiv);
    
    item.appendChild(name); 
    item.appendChild(contentDiv); 
    
    return item;
}

function renderFruitAssignments() {
    const isMobile = window.innerWidth <= 768; 
    const mode = isMobile ? 'list' : 'table'; 

    fruitAssignmentsContainer.innerHTML = '';
    const fruits = getAllFruits();
    const filteredCharacters = getFilteredCharacters(); 

    if (characters.length === 0) {
        fruitAssignmentsContainer.innerHTML = '<p class="text-center text-gray-500 py-4">請先新增角色</p>';
        return;
    }

    if (filteredCharacters.length === 0) {
        fruitAssignmentsContainer.innerHTML = '<p class="text-center text-gray-500 py-4">找不到符合的角色</p>';
        return;
    }

    if (mode === 'list') {
        renderListMode(filteredCharacters, fruits);
    } else {
        renderTableMode(filteredCharacters, fruits);
    }
}

function renderListMode(filteredCharacters, fruits) {
    const container = document.createElement('div');
    container.className = 'space-y-4';

    filteredCharacters.forEach(name => {
        const div = document.createElement('div');
        div.className = 'bg-gray-50 p-4 rounded-lg shadow-sm';
        div.innerHTML = `<strong class="text-lg font-semibold text-gray-800">${name}</strong>`;
        
        const assigned = fruitAssignments[name] || [];
        if (!fruitObtained[name]) fruitObtained[name] = [];

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-3 mt-3'; 

        for (let i = 0; i < 4; i++) {
            grid.appendChild(createFruitSelector(name, i, assigned[i], fruits));
        }
        div.appendChild(grid);
        container.appendChild(div);
    });
    fruitAssignmentsContainer.appendChild(container);
}

function renderTableMode(filteredCharacters, fruits) {
    const table = document.createElement('table');
    table.id = "fruitTable";
    table.className = 'w-full min-w-[800px] bg-white border border-gray-200'; 
    
    const thead = table.createTHead();
    thead.className = 'bg-gray-800 text-white';
    const headerRow = thead.insertRow();
    headerRow.innerHTML = `
        <th class="p-3 text-left border-r border-gray-600">角色</th>
        <th class="p-3 text-left border-r border-gray-600">果實 1</th>
        <th class="p-3 text-left border-r border-gray-600">果實 2</th>
        <th class="p-3 text-left border-r border-gray-600">果實 3</th>
        <th class="p-3 text-left">果實 4</th>
    `;

    const tbody = table.createTBody();
    filteredCharacters.forEach(name => {
        const row = tbody.insertRow();
        row.className = 'border-b border-gray-200 hover:bg-gray-50';
        
        const assigned = fruitAssignments[name] || [];
        if (!fruitObtained[name]) fruitObtained[name] = [];

        const cellName = row.insertCell();
        cellName.textContent = name;
        cellName.className = 'p-3 font-medium text-gray-800 border-r border-gray-200';
        cellName.setAttribute('data-label', '角色'); 

        for (let i = 0; i < 4; i++) {
            const cell = row.insertCell();
            cell.className = 'p-2'; 
            cell.setAttribute('data-label', `果實 ${i + 1}`); 
            if (i < 3) {
                cell.className += ' border-r border-gray-200';
            }
            cell.appendChild(createFruitSelector(name, i, assigned[i], fruits));
        }
    });
    fruitAssignmentsContainer.appendChild(table);
}

function createFruitSelector(name, index, selectedValue, fruits) {
    const wrapper = document.createElement('div');
    wrapper.className = 'flex items-center gap-2';

    const sel = document.createElement('select');
    sel.className = 'flex-grow border rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 transition min-w-[100px] text-sm';
    
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '未選擇';
    sel.appendChild(opt);

    fruits.forEach(f => {
        const option = document.createElement('option');
        option.value = f;
        option.textContent = f;
        sel.appendChild(option);
    });

    sel.value = selectedValue || '';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = fruitObtained[name] && fruitObtained[name][index] ? fruitObtained[name][index] : false; 
    checkbox.className = 'rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer';
    checkbox.title = '已獲得';

    if (!sel.value) {
        checkbox.style.display = 'none';
    }

    sel.onchange = () => {
        if (!fruitAssignments[name]) fruitAssignments[name] = [];
        fruitAssignments[name][index] = sel.value;
        
        if (!sel.value) {
            if (fruitObtained[name] && fruitObtained[name][index]) {
                fruitObtained[name][index] = false;
            }
        }
        
        saveData();
        renderInventory();
        renderFruitAssignments(); 
    };

    checkbox.onchange = () => {
        if (!fruitObtained[name]) fruitObtained[name] = [];
        fruitObtained[name][index] = checkbox.checked;
        saveData();
        renderInventory(); 
    };

    wrapper.appendChild(sel);
    wrapper.appendChild(checkbox);
    return wrapper;
}

function getFilteredCharacters() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    
    if (!filterModeCheckbox.checked) {
        return characters;
    }
    
    if (!searchTerm) return characters;
    return characters.filter(name => name.toLowerCase().includes(searchTerm));
}

function updatePresetCharacterSelect() {
    if (!presetCharacterSelect) return;

    const searchTerm = searchInput.value.trim().toLowerCase();
    const originalValue = presetCharacterSelect.value;
    presetCharacterSelect.innerHTML = '<option value="">選擇角色</option>';
    
    const filteredChars = searchTerm 
        ? characters.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()))
        : characters;
    
    filteredChars.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        presetCharacterSelect.appendChild(option);
    });
    
    if (filteredChars.includes(originalValue)) {
        presetCharacterSelect.value = originalValue;
    } else if (filteredChars.length === 1) { 
        presetCharacterSelect.value = filteredChars[0];
    }
}

// --- 6. 事件監聽 (Event Listeners) ---

document.getElementById('addCharacter').onclick = () => {
    const name = newCharacterInput.value.trim();
    if (name && !characters.includes(name)) {
        characters.push(name);
        saveData();
        renderAll();
        newCharacterInput.value = '';
    } else if (characters.includes(name)) {
        customAlert('此角色已存在！');
    }
};
newCharacterInput.onkeypress = (e) => {
    if (e.key === 'Enter') {
        document.getElementById('addCharacter').click();
    }
};

document.getElementById('showCharacterList').onclick = () => {
    modalCharacterSearch.value = ''; 
    renderCharacters(); 
    characterModal.classList.remove('modal-hidden');
    characterModal.classList.add('modal-visible');
};
document.getElementById('closeCharacterModal').onclick = () => {
    characterModal.classList.add('modal-hidden');
    characterModal.classList.remove('modal-visible');
};
characterListUl.onclick = async (e) => {
    if (e.target.classList.contains('delete-char-btn')) {
        const name = e.target.dataset.name;
        const confirmed = await customConfirm(`確定要刪除角色「${name}」嗎？`);
        if (confirmed) {
            characters = characters.filter(c => c !== name);
            delete fruitAssignments[name];
            delete fruitObtained[name]; 
            saveData();
            renderAll(); 
            renderCharacters(modalCharacterSearch.value); 
        }
    }
};
modalCharacterSearch.oninput = () => {
    renderCharacters(modalCharacterSearch.value);
};

showInventoryDetailCheckbox.onchange = renderInventory;

document.getElementById('addFruit').onclick = () => {
    const name = document.getElementById('newFruitName').value.trim();
    const categoryInput = document.getElementById('newFruitCategory').value;
    
    if (!name) {
        customAlert('請輸入果實名稱！');
        return;
    }
    
    const allFruits = getAllFruits();
    if (allFruits.includes(name)) {
        customAlert('此果實已存在！');
        return;
    }
    
    let targetCategory;
    if (categoryInput === '加擊類') {
        targetCategory = '同族'; 
    } else {
        targetCategory = '其他';
    }

    if (!fruitCategories[targetCategory]) fruitCategories[targetCategory] = [];
    fruitCategories[targetCategory].push(name);
    
    fruitInventory[name] = 0; 
    saveData();
    renderAll();
    document.getElementById('newFruitName').value = '';
    customAlert(`果實「${name}」已新增到 ${targetCategory} 類！`);
};

document.getElementById('deleteFruitBtn').onclick = () => {
    const allFruits = getAllFruits();
    if (allFruits.length === 0) {
        customAlert('目前沒有可刪除的果實！');
        return;
    }
    
    const select = document.getElementById('deleteFruitSelect');
    select.innerHTML = '<option value="">請選擇果實</option>';
    allFruits.forEach(f => {
        const option = document.createElement('option');
        option.value = f;
        option.textContent = f;
        select.appendChild(option);
    });
    
    deleteFruitModal.classList.remove('modal-hidden');
    deleteFruitModal.classList.add('modal-visible');
};
document.getElementById('closeDeleteFruitModal').onclick = () => {
    deleteFruitModal.classList.add('modal-hidden');
    deleteFruitModal.classList.remove('modal-visible');
};
document.getElementById('cancelDeleteFruit').onclick = () => {
    deleteFruitModal.classList.add('modal-hidden');
    deleteFruitModal.classList.remove('modal-visible');
};
document.getElementById('confirmDeleteFruit').onclick = async () => {
    const fruitName = document.getElementById('deleteFruitSelect').value;
    if (!fruitName) {
        customAlert('請選擇要刪除的果實！');
        return;
    }
    
    const confirmed = await customConfirm(`確定要刪除果實「${fruitName}」嗎？\n這會清除所有相關的分配記錄。`);
    if (confirmed) {
        Object.keys(fruitCategories).forEach(category => {
            fruitCategories[category] = fruitCategories[category].filter(f => f !== fruitName);
        });
        delete fruitInventory[fruitName];
        Object.keys(fruitAssignments).forEach(char => {
            fruitAssignments[char] = fruitAssignments[char].map(f => f === fruitName ? '' : f);
            if (fruitObtained[char]) {
                 fruitObtained[char] = fruitObtained[char].map((obtained, idx) => fruitAssignments[char][idx] ? obtained : false);
            }
        });
        
        saveData();
        renderAll();
        deleteFruitModal.classList.add('modal-hidden');
        deleteFruitModal.classList.remove('modal-visible');
        customAlert('果實已刪除！');
    }
};

document.getElementById('saveData').onclick = () => {
    const name = recordNameInput.value.trim();
    if (name) {
        recordName = name;
        updateTitle(); 
    }
    
    const data = { 
        fruitAssignments, 
        fruitInventory,
        fruitCategories,
        characters,
        fruitObtained,
        recordName
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const now = new Date();
    const timestamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
    const filename = (recordName || '果實紀錄');
    
    a.href = url;
    a.download = `${filename}_${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

document.getElementById('loadData').onclick = () => {
    document.getElementById('loadFile').click();
};
document.getElementById('loadFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const data = JSON.parse(evt.target.result);
            fruitAssignments = data.fruitAssignments || {};
            fruitInventory = data.fruitInventory || {};
            fruitCategories = data.fruitCategories || JSON.parse(JSON.stringify(defaultFruits));
            characters = data.characters || [];
            fruitObtained = data.fruitObtained || {};
            recordName = data.recordName || '';
            
            saveData();
            renderAll();
            customAlert('載入成功！');
        } catch (error) {
            customAlert('載入失敗：檔案格式錯誤');
        }
    };
    reader.readAsText(file);
    e.target.value = ''; 
};

document.getElementById('resetAllData').onclick = async () => {
    const confirmed = await customConfirm('確定要初始化所有資料嗎？\n這將會清除所有角色、果實庫存、分配和自訂果實，並還原為預設值。');
    if (confirmed) {
        characters = [];
        fruitAssignments = {};
        fruitObtained = {};
        fruitCategories = JSON.parse(JSON.stringify(defaultFruits));
        fruitInventory = {};
        recordName = '';
        
        Object.values(fruitCategories).flat().forEach(f => {
            if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
        });
        
        saveData();
        renderAll();
        customAlert('已初始化所有資料！');
    }
};

document.getElementById('resetInventory').onclick = async () => {
    const confirmed = await customConfirm('確定要重置所有果實庫存嗎？\n這會將所有庫存歸零。');
    if (confirmed) {
        Object.keys(fruitInventory).forEach(key => {
            fruitInventory[key] = 0;
        });
        saveData();
        renderInventory();
        customAlert('果實庫存已重置！');
    }
};

document.getElementById('resetAssignments').onclick = async () => {
    const confirmed = await customConfirm('確定要重置所有角色的果實分配嗎？');
    if (confirmed) {
        fruitAssignments = {}; 
        fruitObtained = {}; 
        saveData();
        renderAll();
        customAlert('角色果實分配已重置！');
    }
};

document.getElementById('resetCharacterList').onclick = async () => {
    const confirmed = await customConfirm('確定要重置所有角色清單嗎？\n這會清除所有角色、果實分配和獲得狀態。');
    if (confirmed) {
        characters = [];
        fruitAssignments = {};
        fruitObtained = {};
        saveData();
        renderAll();
        customAlert('角色清單已重置！');
    }
};

document.getElementById('resetPresetCharacter').onclick = async () => {
    const characterName = presetCharacterSelect.value;
    if (!characterName) {
        customAlert('請先選擇角色！');
        return;
    }
    const confirmed = await customConfirm(`確定要重置「${characterName}」的果實分配嗎？`);
    if (confirmed) {
        fruitAssignments[characterName] = [];
        fruitObtained[characterName] = [];
        saveData();
        renderAll();
        customAlert(`已重置「${characterName}」的果實分配！`);
    }
};

searchInput.oninput = () => {
    renderFruitAssignments(); 
    updatePresetCharacterSelect(); 
};

filterModeCheckbox.onchange = renderFruitAssignments;

const presetCombinations = {
    '同族': ['同族加擊', '同族加命擊', '同族加擊速'],
    '戰型': ['戰型加擊', '戰型加命擊', '戰型加擊速'],
    '擊種': ['擊種加擊', '擊種加命擊', '擊種加擊速'],
    '速必雙削': ['將消', '兵消', '速必']
};

function applyPreset(presetName) {
    const characterName = presetCharacterSelect.value;
    if (!characterName) {
        customAlert('請先選擇角色！');
        return;
    }
    const fruits = presetCombinations[presetName];
    if (!fruits) {
        customAlert('未知的組合！');
        return;
    }
    
    const allFruits = getAllFruits();
    const missingFruits = fruits.filter(f => !allFruits.includes(f));
    if (missingFruits.length > 0) {
        customAlert(`以下果實不存在：${missingFruits.join('、')}\n請先新增這些果實！`);
        return;
    }
    
    fruitAssignments[characterName] = [...fruits]; 
    while (fruitAssignments[characterName].length < 4) {
        fruitAssignments[characterName].push('');
    }
    fruitObtained[characterName] = [false, false, false, false];

    saveData();
    renderAll();
    customAlert(`已將「${presetName}」組合套用到「${characterName}」！`);
}

document.getElementById('presetBtn1').onclick = () => applyPreset('同族');
document.getElementById('presetBtn2').onclick = () => applyPreset('戰型');
document.getElementById('presetBtn3').onclick = () => applyPreset('擊種');
document.getElementById('presetBtn4').onclick = () => applyPreset('速必雙削');

let resizeTimer;
window.onresize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(renderFruitAssignments, 100);
};

window.onclick = (event) => {
    if (event.target === characterModal) {
        characterModal.classList.add('modal-hidden');
        characterModal.classList.remove('modal-visible');
    }
    if (event.target === deleteFruitModal) {
        deleteFruitModal.classList.add('modal-hidden');
        deleteFruitModal.classList.remove('modal-visible');
    }
    if (event.target === alertModal) {
        alertModal.classList.add('modal-hidden');
        alertModal.classList.remove('modal-visible');
    }
    if (event.target === confirmModal) {
        confirmModal.classList.add('modal-hidden');
        confirmModal.classList.remove('modal-visible');
    }
};

// --- 7. 初始載入 ---
window.onload = renderAll;