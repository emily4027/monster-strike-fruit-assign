// 對照新（MSShared.PATHS）舊（原字串）Firestore 路徑，結果必須完全相同
const test = require('node:test');
const assert = require('node:assert');
const { PATHS } = require('../../monster-strike-toolbox/shared/shared.js');

const getSaveDocName = (slot) => (slot === 'default' ? 'fruit_assign' : `fruit_assign_${slot}`);
const oldSave = (appId, uid, slot) => ['artifacts', appId, 'users', uid, 'fruit_data', getSaveDocName(slot)];
const oldSlotList = (appId, uid) => ['artifacts', appId, 'users', uid, 'fruit_data', 'fruit_slots'];
const oldGacha = (appId, uid) => ['artifacts', appId, 'users', uid, 'data', 'gacha_records'];

test('果實存檔路徑：default 與各 slot 後綴相同', () => {
    for (const appId of ['default-app-id', 'app-x']) {
        for (const slot of ['default', 'slot2', 'slot_1700000000', 'a b']) {
            assert.deepStrictEqual(PATHS.fruitSave(appId, 'u1', slot), oldSave(appId, 'u1', slot));
        }
    }
});

test('存檔清單、抽卡紀錄、shared/characters 路徑相同', () => {
    assert.deepStrictEqual(PATHS.fruitSlotList('app-x', 'u1'), oldSlotList('app-x', 'u1'));
    assert.deepStrictEqual(PATHS.gachaRecords('app-x', 'u1'), oldGacha('app-x', 'u1'));
    assert.deepStrictEqual(PATHS.sharedCharacters, ['shared', 'characters']);
});
