const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const pools = require('../../monster-strike-gacha-data/pools.js');

// 從 script.js 取出 fixGachaName 的實際程式碼 (標記之間)，在帶有 CharacterPools 的沙盒執行
const source = fs.readFileSync(path.join(__dirname, '..', 'script.js'), 'utf8').replace(/\r\n/g, '\n');
const m = source.match(/GACHA_FIXNAME_BEGIN\n([\s\S]*?)\/\/ GACHA_FIXNAME_END/);
assert.ok(m, 'script.js 找不到 fixGachaName 標記');
const sandbox = { window: { CharacterPools: pools } };
vm.runInNewContext(`${m[1]}; this.fixGachaName = fixGachaName;`, sandbox);
const fixGachaName = sandbox.fixGachaName;

// 改前的舊實作 (Map 版)，用來算期望值
const OLD_RE = /^(.*?)((?:-\d+)?(?:\s*[(（](?:同族|戰型|擊種|雙削)[)）])?)$/;
function oldFixGachaName(renames, name) {
    const mm = String(name).match(OLD_RE);
    const base = mm ? mm[1].trim() : String(name);
    let current = base;
    const seen = new Set([current]);
    while (renames.has(current)) {
        const next = renames.get(current);
        if (seen.has(next)) return name;
        seen.add(next);
        current = next;
    }
    const to = current.replace(/\s+/g, '');
    return to === base ? name : to + (mm ? mm[2].trim() : '');
}

const renameMap = new Map([
    ['砲姐', '御坂 美琴'], ['A', 'B'], ['B', 'C'], ['X', 'Y'], ['Y', 'X'], ['P Q', 'R']
]);
const fixes = pools.readNameFixes({ renames: [...renameMap].map(([from, to]) => ({ from, to })) });

const names = [
    '砲姐-2(擊種)', '砲姐', '砲姐（同族）', '砲姐 (戰型)', '砲姐-3', 'Two for all', 'Two for all-2(雙削)',
    '無修正角色', '無修正角色-2(同族)', 'A', 'A-2', 'A(同族)', 'X', 'X-2(擊種)', 'Y', 'P Q', 'P Q-2', '', '  ', ' 砲姐 ',
    '虹夏-2(同族)', 'S T'
];

test('包裝後的 fixGachaName 與舊實作輸出完全相同', () => {
    for (const n of names) assert.equal(fixGachaName(fixes, n), oldFixGachaName(renameMap, n), JSON.stringify(n));
});

test('具體期望值', () => {
    assert.equal(fixGachaName(fixes, '砲姐-2(擊種)'), '御坂美琴-2(擊種)');
    assert.equal(fixGachaName(fixes, 'Two for all'), 'Twoforall');
    assert.equal(fixGachaName(fixes, '無修正角色'), '無修正角色');
    assert.equal(fixGachaName(fixes, 'A-2'), 'C-2');
    assert.equal(fixGachaName(fixes, 'X-2(擊種)'), 'X-2(擊種)');
    assert.equal(fixGachaName(fixes, 'S T'), 'ST');
});
