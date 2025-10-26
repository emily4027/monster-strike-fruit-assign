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
const mainTitle = document.getElementById('mainTitle');

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

function renderFruitAssignments() {
    fruitContainer.innerHTML = '';
    const mode = modeSelect.value;
    const fruits = getAllFruits();

    if (characters.length === 0) {
        fruitContainer.innerHTML = '<p style="text-align: center; color: #999;">請先新增角色</p>';
        return;
    }

    if (mode === 'list') {
        characters.forEach(name => {
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

        characters.forEach(name => {
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
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-fruit';
    deleteBtn.textContent = '✕';
    deleteBtn.onclick = () => deleteFruit(f);
    
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

    item.appendChild(deleteBtn);
    item.innerHTML += `<strong>${f}</strong>`;
    item.appendChild(contentDiv);
    
    return item;
}

function deleteFruit(fruitName) {
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
    }
}

function renderAll() {
    renderCharacters();
    renderFruitAssignments();
    renderInventory();
    updateTitle();
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

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
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
    
    fruitCategories[category].push(name);
    fruitInventory[name] = 0;
    saveData();
    renderAll();
    document.getElementById('newFruitName').value = '';
    alert(`果實「${name}」已新增到${category}類！`);
};

// 模式切換
modeSelect.onchange = renderFruitAssignments;

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
    e.target.value = ''; // 清空 input，允許重複匯入同一檔案
};

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