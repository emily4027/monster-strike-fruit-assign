const FruitStorage = (() => {
    const PREFIX = 'ms.fruit.';
    const MIGRATED_KEY = `${PREFIX}migrated`;
    const LOCAL_SLOT_LIST_KEY = 'global_slot_list';
    const LOCAL_SLOT_NAMES_KEY = 'slot_names_cache';
    const LAST_SELECTED_SLOT_KEY = 'lastSelectedSlot';
    const GACHA_SHOW_DATE_KEY = 'fruit_gacha_show_date';
    const LEGACY_INVENTORY_KEY = 'fruitInventory';

    // 存檔、備份、雲端同步和本機搬移共用的欄位。
    const DATA_FIELDS = [
        'characters', 'fruitAssignments', 'fruitCategories', 'fruitObtained',
        'bankAssignments', 'storageCharacters', 'storageAssignments', 'recordName',
        'gachaImports', 'gachaAccount'
    ];
    const SLOT_FIELDS = new Set([...DATA_FIELDS, LEGACY_INVENTORY_KEY]);

    // 舊版依序編號，之後用時間戳記，從備份另存時再附加隨機碼。
    const LEGACY_SLOT_ID = /^(?:slot\d+|slot_\d+(?:_[a-z0-9]{1,4})?)$/;

    const storageKeys = (storage) => Array.from({ length: storage.length }, (_, index) => storage.key(index));

    function createStore(getStorage, onWriteFailure) {
        return {
            get(key) {
                try { return getStorage().getItem(PREFIX + key); } catch (e) { return null; }
            },
            set(key, value) {
                try {
                    getStorage().setItem(PREFIX + key, value);
                    return true;
                } catch (e) {
                    onWriteFailure(key, e);
                    return false;
                }
            },
            remove(key) {
                try { getStorage().removeItem(PREFIX + key); } catch (e) { /* 刪不掉不影響資料 */ }
            },
            keys() {
                try {
                    return storageKeys(getStorage())
                        .filter((key) => key?.startsWith(PREFIX))
                        .map((key) => key.slice(PREFIX.length));
                } catch (e) { return []; }
            }
        };
    }

    function migrateLegacyStorage(getStorage) {
        try {
            const storage = getStorage();
            if (storage.getItem(MIGRATED_KEY) === '1') return;

            const copy = (key) => {
                const value = storage.getItem(key);
                if (value !== null && storage.getItem(PREFIX + key) === null) {
                    storage.setItem(PREFIX + key, value);
                }
            };

            // total_slots 是舊版的存檔數量設定，目前程式已不使用。
            for (const key of [...SLOT_FIELDS, LOCAL_SLOT_LIST_KEY, LOCAL_SLOT_NAMES_KEY,
                LAST_SELECTED_SLOT_KEY, GACHA_SHOW_DATE_KEY, 'total_slots']) {
                copy(key);
            }

            const legacyList = JSON.parse(storage.getItem(LOCAL_SLOT_LIST_KEY));
            const listedSlots = new Set(Array.isArray(legacyList) ? legacyList : []);
            for (const key of storageKeys(storage)) {
                if (!key || key.startsWith(PREFIX)) continue;
                const separator = key.lastIndexOf('_');
                if (separator <= 0 || !SLOT_FIELDS.has(key.slice(separator + 1))) continue;
                const slot = key.slice(0, separator);
                if (slot !== 'default' && (listedSlots.has(slot) || LEGACY_SLOT_ID.test(slot))) copy(key);
            }

            storage.setItem(MIGRATED_KEY, '1');
        } catch (e) {
            console.warn('本機資料搬移失敗，下次開啟頁面會重試。', e);
        }
    }

    return {
        createStore, migrateLegacyStorage, DATA_FIELDS, LOCAL_SLOT_LIST_KEY, LOCAL_SLOT_NAMES_KEY,
        LAST_SELECTED_SLOT_KEY, GACHA_SHOW_DATE_KEY, LEGACY_INVENTORY_KEY
    };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = FruitStorage;
