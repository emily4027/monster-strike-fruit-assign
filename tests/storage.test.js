const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, migrateLegacyStorage } = require('../storage.js');

function fakeStorage(entries = {}) {
    const data = new Map(Object.entries(entries));
    return {
        get length() { return data.size; },
        key(index) { return [...data.keys()][index] ?? null; },
        getItem(key) { return data.get(key) ?? null; },
        setItem(key, value) { data.set(key, String(value)); },
        removeItem(key) { data.delete(key); }
    };
}

test('首次搬移所有預設欄位和本機設定，保留舊鍵', () => {
    const legacy = {
        characters: '["角色甲"]', fruitAssignments: '{}', fruitCategories: '{}', fruitObtained: '{}',
        bankAssignments: '[]', storageCharacters: '[]', storageAssignments: '{}', recordName: '',
        gachaImports: '[]', gachaAccount: '"帳號甲"', fruitInventory: '{"熱友":2}',
        global_slot_list: '["default","slot2"]', slot_names_cache: '{"slot2":"第二份"}',
        lastSelectedSlot: 'slot2', fruit_gacha_show_date: '0', total_slots: '4'
    };
    const storage = fakeStorage(legacy);

    migrateLegacyStorage(() => storage);

    for (const [key, value] of Object.entries(legacy)) {
        assert.equal(storage.getItem(`ms.fruit.${key}`), value, key);
        assert.equal(storage.getItem(key), value, key);
    }
    assert.equal(storage.getItem('ms.fruit.migrated'), '1');
});

test('搬移保留已有的新值，完成後重跑也不會復原已刪除的資料', (t) => {
    const storage = fakeStorage({
        recordName: '舊名稱', 'ms.fruit.recordName': '',
        slot2_characters: '["角色甲"]'
    });

    migrateLegacyStorage(() => storage);
    assert.equal(storage.getItem('ms.fruit.recordName'), '');
    assert.equal(storage.getItem('ms.fruit.slot2_characters'), '["角色甲"]');
    storage.removeItem('ms.fruit.slot2_characters');
    const write = t.mock.method(storage, 'setItem');

    migrateLegacyStorage(() => storage);

    assert.equal(write.mock.callCount(), 0);
    assert.equal(storage.getItem('ms.fruit.slot2_characters'), null);
    assert.equal(storage.getItem('slot2_characters'), '["角色甲"]');
});

test('搬移依清單和舊版編號找出多份存檔，保留其他工具的鍵', () => {
    const slots = {
        custom_id_characters: '["角色乙"]', custom_id_recordName: '額外存檔',
        slot4_bankAssignments: '[]', slot_1730000000000_gachaImports: '[]',
        slot_1730000000001_ab12_fruitInventory: '{}', slot_1730000000001_ab12_gachaAccount: '"甲"'
    };
    const shared = { gachaRecords: '[{"id":1}]', other_characters: '[]', slot4_otherField: '資料' };
    const storage = fakeStorage({ ...slots, ...shared, global_slot_list: '["default","custom_id"]' });

    migrateLegacyStorage(() => storage);

    for (const [key, value] of Object.entries(slots)) {
        assert.equal(storage.getItem(`ms.fruit.${key}`), value, key);
        assert.equal(storage.getItem(key), value, key);
    }
    for (const [key, value] of Object.entries(shared)) {
        assert.equal(storage.getItem(key), value, key);
        assert.equal(storage.getItem(`ms.fruit.${key}`), null, key);
    }
});

test('搬移中途失敗會警告並保留進度，下次重試會補齊', (t) => {
    const storage = fakeStorage({ characters: '[]', recordName: '舊名稱', slot2_characters: '[]' });
    const setItem = storage.setItem;
    const write = t.mock.method(storage, 'setItem', (key, value) => {
        if (key === 'ms.fruit.recordName') throw new Error('空間已滿');
        setItem(key, value);
    });
    const warn = t.mock.method(console, 'warn', () => {});

    assert.doesNotThrow(() => migrateLegacyStorage(() => storage));
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(storage.getItem('ms.fruit.migrated'), null);
    assert.equal(storage.getItem('ms.fruit.characters'), '[]');
    assert.equal(storage.getItem('ms.fruit.recordName'), null);
    assert.equal(storage.getItem('recordName'), '舊名稱');

    write.mock.restore();
    storage.setItem('ms.fruit.characters', '["更新的角色"]');
    migrateLegacyStorage(() => storage);

    assert.equal(storage.getItem('ms.fruit.characters'), '["更新的角色"]');
    assert.equal(storage.getItem('ms.fruit.recordName'), '舊名稱');
    assert.equal(storage.getItem('ms.fruit.slot2_characters'), '[]');
    assert.equal(storage.getItem('ms.fruit.migrated'), '1');
});

test('儲存包裝使用短名，列舉與刪除只作用於本工具的鍵', () => {
    const storage = fakeStorage({ slot2_characters: '["舊資料"]', gachaRecords: '[]' });
    const store = createStore(() => storage, assert.fail);

    assert.equal(store.get('slot2_characters'), null);
    assert.equal(store.set('slot2_characters', '["新資料"]'), true);
    assert.equal(store.get('slot2_characters'), '["新資料"]');
    assert.deepEqual(store.keys(), ['slot2_characters']);
    store.remove('slot2_characters');
    assert.equal(storage.getItem('ms.fruit.slot2_characters'), null);
    assert.equal(storage.getItem('slot2_characters'), '["舊資料"]');
});

test('無法存取本機儲存時，包裝仍可使用並通知寫入失敗', (t) => {
    const error = new Error('無法存取本機儲存');
    const getStorage = () => { throw error; };
    const onWriteFailure = t.mock.fn();
    const warn = t.mock.method(console, 'warn', () => {});
    const store = createStore(getStorage, onWriteFailure);

    assert.doesNotThrow(() => migrateLegacyStorage(getStorage));
    assert.equal(warn.mock.callCount(), 1);
    assert.equal(store.get('characters'), null);
    assert.deepEqual(store.keys(), []);
    assert.doesNotThrow(() => store.remove('characters'));
    assert.equal(store.set('characters', '[]'), false);
    assert.deepEqual(onWriteFailure.mock.calls[0].arguments, ['characters', error]);
});
