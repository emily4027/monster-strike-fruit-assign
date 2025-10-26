// 初始化果實資料結構
const defaultFruits = {
    "同族": ["同族加擊", "同族加命擊", "同族加擊速"],
    "戰型": ["戰型加擊", "戰型加命擊", "戰型加擊速"],
    "擊種": ["擊種加擊", "擊種加命擊", "擊種加擊速"],
    "其他": ["將消", "兵消", "熱友", "速必"]
};

let fruitCategories = JSON.parse(localStorage.getItem('fruitCategories')) || defaultFruits;
let characters = JSON.parse(localStorage.getItem('characters')) || [];
let fruitAssignments = JSON.parse(localStorage.getItem('fruitAssignments')) || {};
let fruitInventory = JSON.parse(localStorage.getItem('fruitInventory')) || {};
let recordName = localStorage.getItem('recordName') || '';

// 初始化庫存
Object.values(fruitCategories).flat().forEach(f => {
    if (fruitInventory[f] === undefined) fruitInventory[f] = 0;
});

const characterList = document.getElementById('characterList');
const fruitContainer = document.getElementById('fruitAssignments');
const inventoryContainer = document.getElementById('inventoryContainer');
const modeSelect = document.getElementById('displayMode');
const modal = document.getElementById('characterModal');
const deleteFruitModal = document.getElementById('deleteFruitModal');
const mainTitle = document.getElementById('mainTitle');
const searchInput = document.getElementById('searchCharacter');
const presetCharacterSelect = document.getElementById('presetCharacter');

// 更新標題
function updateTitle() {
    const name = recordName ? `${recordName}的果實分配模擬器` : '果實分配模擬器';
    mainTitle.textContent = name;
}

function saveData() {
    localStorage.setItem('characters', JSON.stringify(characters));
    localStorage.setItem('fruitAssignments', JSON.stringify(fruitAssignments));
    localStorage.setItem('fruitInventory', JSON.stringify(fruitInventory));
    localStorage.setItem('fruitCategories', JSON.stringify(fruitCategories));
    localStorage.setItem('recordName', recordName);
}

function getAllFruits() {
    return Object.values(fruitCategories).flat();
}

function updatePresetCharacterSelect() {
    presetCharacterSelect.innerHTML = '<option value="">選擇角色</option>';
    characters.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.textContent = name;
        presetCharacterSelect.appendChild(option);
    });
}

function renderCharacters() {
    characterList.innerHTML = '';
    document.getElementById('characterCount').textContent = characters.length;
    
    if (characters.length === 0) {
        characterList.innerHTML = '<li style="text-align: center; color: #999;">尚無角色</li>';
        return;
    }

    characters.forEach(name => {
        const li = document.createElement('li');
        li.className = 'character-list-item';
        li.innerHTML = `
            <span>${name}</span>
            <button class="danger" onclick="deleteCharacter('${name}')">🗑️ 刪除</button>
        `;
        characterList.appendChild(li);
    });
}

function deleteCharacter(name) {
    if (confirm(`確定要刪除角色「${name}」嗎？`)) {
        characters = characters.filter(c => c !== name);
        delete fruitAssignments[name];
        saveData();
        renderAll();
    }
}

function getFilteredCharacters() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    if (!searchTerm) return characters;
    return characters.filter(name => name.toLowerCase().includes(searchTerm));
}

function renderFruitAssignments() {
    fruitContainer.innerHTML = '';
    const mode = modeSelect.value;
    const fruits = getAllFruits();
    const filteredCharacters = getFilteredCharacters();

    if (characters.length === 0) {
        fruitContainer.innerHTML = '<p style="text-align: center; color: #999;">請先新增角色</p>';
        return;
    }

    if (filteredCharacters.length === 0) {
        fruitContainer.innerHTML = '<p style="text-align: center; color: #999;">找不到符合的角色</p>';
        return;
    }

    if (mode === 'list') {
        filteredCharacters.forEach(name => {
            const div = document.createElement('div');
            div.style.marginBottom = '15px';
            div.innerHTML = `<strong style="font-size: 16px;">${name}</strong><br>`;
            const assigned = fruitAssignments[name] || [];
            for (let i = 0; i < 4; i++) {
                const sel = document.createElement('select');
                const opt = document.createElement('option');
                opt.value = ''; opt.textContent = '未選擇';
                sel.appendChild(opt);
                fruits.forEach(f => {
                    const option = document.createElement('option');
                    option.value = f;
                    option.textContent = f;
                    sel.appendChild(option);
                });
                sel.value = assigned[i] || '';
                sel.onchange = () => {
                    if (!fruitAssignments[name]) fruitAssignments[name] = [];
                    fruitAssignments[name][i] = sel.value;
                    saveData();
                    renderInventory();
                };
                div.appendChild(sel);
            }
            fruitContainer.appendChild(div);
        });
    } else {
        const table = document.createElement('table');
        const header = table.insertRow();
        header.insertCell().innerHTML = '<strong>角色</strong>';
        for (let i = 1; i <= 4; i++) header.insertCell().innerHTML = `<strong>果實 ${i}</strong>`;

        filteredCharacters.forEach(name => {
            const row = table.insertRow();
            row.insertCell().textContent = name;
            const assigned = fruitAssignments[name] || [];
            for (let i = 0; i < 4; i++) {
                const cell = row.insertCell();
                const sel = document.createElement('select');
                const opt = document.createElement('option');
                opt.value = ''; opt.textContent = '未選擇';
                sel.appendChild(opt);
                fruits.forEach(f => {
                    const option = document.createElement('option');
                    option.value = f;
                    option.textContent = f;
                    sel.appendChild(option);
                });
                sel.value = assigned[i] || '';
                sel.onchange = () => {
                    if (!fruitAssignments[name]) fruitAssignments[name] = [];
                    fruitAssignments[name][i] = sel.value;
                    saveData();
                    renderInventory();
                };
                cell.appendChild(sel);
            }
        });
        fruitContainer.appendChild(table);
    }
}

function renderInventory() {
    inventoryContainer.innerHTML = '';

    // 加擊類區域
    const attackDiv = document.createElement('div');
    attackDiv.className = 'inventory-category';
    attackDiv.innerHTML = '<h3>⚔️ 加擊類</h3>';

    ['同族', '戰型', '擊種'].forEach(category => {
        if (fruitCategories[category] && fruitCategories[category].length > 0) {
            const row = document.createElement('div');
            row.className = 'inventory-row';
            fruitCategories[category].forEach(f => {
                row.appendChild(createInventoryItem(f));
            });
            attackDiv.appendChild(row);
        }
    });

    // 其他類區域
    const otherDiv = document.createElement('div');
    otherDiv.className = 'inventory-category';
    otherDiv.innerHTML = '<h3>🎯 其他類</h3>';

    if (fruitCategories['其他']) {
        // 將消、兵消一行
        const row1 = document.createElement('div');
        row1.className = 'inventory-row';
        ['將消', '兵消'].forEach(f => {
            if (fruitCategories['其他'].includes(f)) {
                row1.appendChild(createInventoryItem(f));
            }
        });
        if (row1.children.length > 0) otherDiv.appendChild(row1);

        // 其他的各自一行
        fruitCategories['其他'].forEach(f => {
            if (!['將消', '兵消'].includes(f)) {
                const row = document.createElement('div');
                row.className = 'inventory-row';
                row.appendChild(createInventoryItem(f));
                otherDiv.appendChild(row);
            }
        });
    }

    inventoryContainer.appendChild(attackDiv);
    inventoryContainer.appendChild(otherDiv);
}

function createInventoryItem(f) {
    const item = document.createElement('div');
    item.className = 'inventory-item';
    
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = fruitInventory[f] || 0;
    input.onchange = () => {
        fruitInventory[f] = parseInt(input.value) || 0;
        saveData();
        renderInventory();
    };

    const usedCount = Object.values(fruitAssignments)
        .flat()
        .filter(x => x === f).length;

    const diff = (fruitInventory[f] || 0) - usedCount;
    const diffText = diff === 0 ? '✓ 剛好' :
        diff > 0 ? `📦 多 ${diff}` : `⚠️ 少 ${Math.abs(diff)}`;
    const diffColor = diff === 0 ? '#4CAF50' : diff > 0 ? '#2196F3' : '#f44336';

    const statsDiv = document.createElement('div');
    statsDiv.className = 'stats';
    statsDiv.innerHTML = `使用: ${usedCount} <span style="color: ${diffColor}; font-weight: bold;">${diffText}</span>`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'inventory-content';
    contentDiv.appendChild(input);
    contentDiv.appendChild(statsDiv);

    item.innerHTML = `<strong>${f}</strong>`;
    item.appendChild(contentDiv);
    
    return item;
}

function renderAll() {
    renderCharacters();
    renderFruitAssignments();
    renderInventory();
    updateTitle();
    updatePresetCharacterSelect();
}

// 新增角色
document.getElementById('addCharacter').onclick = () => {
    const name = document.getElementById('newCharacter').value.trim();
    if (name && !characters.includes(name)) {
        characters.push(name);
        saveData();
        renderAll();
        document.getElementById('newCharacter').value = '';
    } else if (characters.includes(name)) {
        alert('此角色已存在！');
    }
};

// 顯示角色清單
document.getElementById('showCharacterList').onclick = () => {
    modal.style.display = 'block';
};

// 關閉模態框
document.querySelector('.close').onclick = () => {
    modal.style.display = 'none';
};

document.querySelector('.closeDeleteModal').onclick = () => {
    deleteFruitModal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
    if (event.target === deleteFruitModal) {
        deleteFruitModal.style.display = 'none';
    }
};

// 新增果實
document.getElementById('addFruit').onclick = () => {
    const name = document.getElementById('newFruitName').value.trim();
    const category = document.getElementById('newFruitCategory').value;
    
    if (!name) {
        alert('請輸入果實名稱！');
        return;
    }
    
    const allFruits = getAllFruits();
    if (allFruits.includes(name)) {
        alert('此果實已存在！');
        return;
    }
    
    // 根據選擇的類別，決定要加到哪裡
    if (category === '加擊類') {
        // 預設加到同族類
        if (!fruitCategories['同族']) fruitCategories['同族'] = [];
        fruitCategories['同族'].push(name);
    } else {
        if (!fruitCategories['其他']) fruitCategories['其他'] = [];
        fruitCategories['其他'].push(name);
    }
    
    fruitInventory[name] = 0;
    saveData();
    renderAll();
    document.getElementById('newFruitName').value = '';
    alert(`果實「${name}」已新增到${category}！`);
};

// 刪除果實按鈕
document.getElementById('deleteFruitBtn').onclick = () => {
    const allFruits = getAllFruits();
    if (allFruits.length === 0) {
        alert('目前沒有可刪除的果實！');
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
    
    deleteFruitModal.style.display = 'block';
};

document.getElementById('confirmDeleteFruit').onclick = () => {
    const fruitName = document.getElementById('deleteFruitSelect').value;
    if (!fruitName) {
        alert('請選擇要刪除的果實！');
        return;
    }
    
    if (confirm(`確定要刪除果實「${fruitName}」嗎？\n這會清除所有相關的分配記錄。`)) {
        // 從分類中移除
        Object.keys(fruitCategories).forEach(category => {
            fruitCategories[category] = fruitCategories[category].filter(f => f !== fruitName);
        });
        
        // 從庫存中移除
        delete fruitInventory[fruitName];
        
        // 從分配中移除
        Object.keys(fruitAssignments).forEach(char => {
            fruitAssignments[char] = fruitAssignments[char].map(f => f === fruitName ? '' : f);
        });
        
        saveData();
        renderAll();
        deleteFruitModal.style.display = 'none';
        alert('果實已刪除！');
    }
};

document.getElementById('cancelDeleteFruit').onclick = () => {
    deleteFruitModal.style.display = 'none';
};

// 模式切換
modeSelect.onchange = renderFruitAssignments;

// 搜尋功能
searchInput.oninput = renderFruitAssignments;

// 匯出紀錄
document.getElementById('saveData').onclick = () => {
    const name = document.getElementById('recordName').value.trim();
    if (name) {
        recordName = name;
        localStorage.setItem('recordName', recordName);
        updateTitle();
    }
    
    const data = { 
        fruitAssignments, 
        fruitInventory,
        fruitCategories,
        characters,
        recordName: name || recordName
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = (name || recordName || '果實紀錄');
    a.href = url;
    a.download = `${filename}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

// 匯入紀錄
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
            fruitInventory = data.fruitInventory || fruitInventory;
            fruitCategories = data.fruitCategories || fruitCategories;
            characters = data.characters || characters;
            recordName = data.recordName || '';
            
            document.getElementById('recordName').value = recordName;
            saveData();
            renderAll();
            alert('匯入成功！');
        } catch (error) {
            alert('匯入失敗：檔案格式錯誤');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// 重置果實
document.getElementById('resetFruits').onclick = () => {
    if (confirm('確定要重置所有果實嗎？\n這會將所有果實庫存歸零，並清除所有分配記錄。')) {
        // 重置庫存
        Object.keys(fruitInventory).forEach(key => {
            fruitInventory[key] = 0;
        });
        
        // 重置分配
        Object.keys(fruitAssignments).forEach(char => {
            fruitAssignments[char] = ['', '', '', ''];
        });
        
        saveData();
        renderAll();
        alert('果實已重置！');
    }
};

// 匯出角色清單
document.getElementById('exportCharacters').onclick = () => {
    if (characters.length === 0) {
        alert('目前沒有角色可匯出！');
        return;
    }
    
    const data = { characters };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '角色清單.json';
    a.click();
    URL.revokeObjectURL(url);
};

// 匯入角色清單
document.getElementById('importCharacters').onclick = () => {
    document.getElementById('importCharactersFile').click();
};

document.getElementById('importCharactersFile').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
        try {
            const data = JSON.parse(evt.target.result);
            if (!data.characters || !Array.isArray(data.characters)) {
                alert('匯入失敗：檔案格式錯誤');
                return;
            }
            
            // 合併角色清單，避免重複
            const newCharacters = data.characters.filter(c => !characters.includes(c));
            if (newCharacters.length === 0) {
                alert('沒有新的角色需要匯入！');
                return;
            }
            
            characters.push(...newCharacters);
            saveData();
            renderAll();
            alert(`成功匯入 ${newCharacters.length} 個角色！`);
        } catch (error) {
            alert('匯入失敗：檔案格式錯誤');
        }
    };
    reader.readAsText(file);
    e.target.value = '';
};

// 預設組合
const presetCombinations = {
    '同族': ['同族加擊', '同族加命擊', '同族加擊速'],
    '戰型': ['戰型加擊', '戰型加命擊', '戰型加擊速'],
    '擊種': ['擊種加擊', '擊種加命擊', '擊種加擊速'],
    '速必雙削': ['將消', '兵消', '速必']
};

function applyPreset(presetName) {
    const characterName = presetCharacterSelect.value;
    if (!characterName) {
        alert('請先選擇角色！');
        return;
    }
    
    const fruits = presetCombinations[presetName];
    if (!fruits) {
        alert('未知的組合！');
        return;
    }
    
    // 檢查所有果實是否存在
    const allFruits = getAllFruits();
    const missingFruits = fruits.filter(f => !allFruits.includes(f));
    if (missingFruits.length > 0) {
        alert(`以下果實不存在：${missingFruits.join('、')}\n請先新增這些果實！`);
        return;
    }
    
    // 套用組合
    if (!fruitAssignments[characterName]) {
        fruitAssignments[characterName] = [];
    }
    
    fruits.forEach((fruit, index) => {
        fruitAssignments[characterName][index] = fruit;
    });
    
    // 如果組合少於4個，剩餘的設為空
    for (let i = fruits.length; i < 4; i++) {
        fruitAssignments[characterName][i] = '';
    }
    
    saveData();
    renderAll();
    alert(`已將「${presetName}」組合套用到「${characterName}」！`);
}

// 預設組合按鈕事件
document.getElementById('presetBtn1').onclick = () => applyPreset('同族');
document.getElementById('presetBtn2').onclick = () => applyPreset('戰型');
document.getElementById('presetBtn3').onclick = () => applyPreset('擊種');
document.getElementById('presetBtn4').onclick = () => applyPreset('速必雙削');

// 按 Enter 新增角色
document.getElementById('newCharacter').onkeypress = (e) => {
    if (e.key === 'Enter') {
        document.getElementById('addCharacter').click();
    }
};

// 初始化
window.onload = renderAll;

// 全域函數供 onclick 使用
window.deleteCharacter = deleteCharacter;
