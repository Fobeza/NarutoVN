const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'game.js'), 'utf8');

// Minimal browser stand-in; this verifies game logic, not actual browser rendering or touch support.
function game(saved) {
  const elements = {};
  const context2d = new Proxy({}, {
    get: (obj, key) => obj[key] || (obj[key] = () => {}),
    set: (obj, key, value) => { obj[key] = value; return true; },
  });
  function element(id) {
    if (!elements[id]) {
      const classes = new Set(id === 'overlay' ? ['hidden'] : []);
      elements[id] = {
        style: {}, textContent: '', innerHTML: '',
        classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value), toggle: (value, force) => { if (force) classes.add(value); else classes.delete(value); } },
        addEventListener(type, callback) { this[type] = callback; },
        getBoundingClientRect: () => ({ width: 390, height: 800, left: 0, top: 0 }),
        getContext: () => context2d,
        setAttribute(name,value) { this[name] = value; },
        setPointerCapture() {},
      };
    }
    return elements[id];
  }
  let stored = saved ? JSON.stringify(saved) : null, frame, time = 0;
  const environment = {
    Math, JSON, Number, console, devicePixelRatio: 1,
    Image: class { constructor() { this.complete = false; this.naturalWidth = 0; } },
    document: { getElementById: element, addEventListener() {} },
    window: { addEventListener() {} },
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    requestAnimationFrame: callback => { frame = callback; }, confirm: () => true,
  };
  vm.runInNewContext(source, environment);
  return {
    element,
    step(count) { for (let i = 0; i < count; i++) { time += 50; frame(time); } },
    press(id) { element(id).pointerdown({ preventDefault() {} }); },
    tapCanvas(x, y) { element('world').pointerdown({ preventDefault() {}, clientX: x, clientY: y }); },
    saved: () => JSON.parse(stored),
  };
}

const oldSave = overrides => ({ x: 785, y: 330, hp: 100, mana: 40, level: 1, xp: 0, gold: 0, potions: 3, kills: 0, questDone: false, ...overrides });

test('a fresh game displays its initial health and quest', () => {
  const g = game();
  g.step(2);
  assert.equal(g.element('healthText').textContent, '100 / 100');
  assert.equal(g.element('questProgress').textContent, 'Победите слизней: 0 / 3');
});

test('defeating a slime drops a sword; equipment changes and survives saving', () => {
  const g = game(oldSave());
  g.step(1);
  g.press('attackBtn'); g.step(55);
  assert.equal(g.saved().kills, 1);
  assert.equal(g.saved().swordOwned, true);
  g.element('bagBtn').onclick();
  assert.match(g.element('panelBody').innerHTML, /Меч разведчика/);
  g.element('equipSword').onclick();
  assert.equal(g.saved().swordEquipped, true);
  g.element('closePanel').onclick();
  g.element('characterBtn').onclick();
  assert.match(g.element('panelBody').innerHTML, /Атака<\/span><strong>19/);
  const reloaded = game(g.saved());
  reloaded.element('bagBtn').onclick();
  assert.match(reloaded.element('panelBody').innerHTML, /Снять/);
});

test('old saves gain earned equipment without losing quest progress', () => {
  const g = game(oldSave({ x: 555, y: 395, kills: 3 }));
  g.element('bagBtn').onclick();
  assert.match(g.element('panelBody').innerHTML, /id="equipSword"/);
  assert.match(g.element('panelBody').innerHTML, /id="equipArmor"/);
  g.element('equipArmor').onclick();
  assert.equal(g.saved().armorEquipped, true);
  g.element('closePanel').onclick();
  g.press('attackBtn');
  assert.equal(g.saved().questDone, true);
  assert.equal(g.saved().gold, 20);
  assert.equal(g.saved().potions, 4);
});

test('a selected distant enemy is approached and attacked', () => {
  const g = game();
  g.step(2); // Establish the camera before converting screen coordinates.
  const scale = 1.15, cameraX = 670 - 390 / scale / 2, cameraY = 420 - 800 / scale / 2;
  g.tapCanvas((785 - cameraX) * scale, (318 - cameraY) * scale);
  assert.equal(g.element('targetName').textContent, 'Слизень');
  assert.equal(g.element('attackBtn')['aria-pressed'], 'true');
  g.step(90);
  assert.equal(g.saved().kills, 1);
  assert.equal(g.saved().swordOwned, true);
});

test('potion is consumed and health restored', () => {
  const g = game(oldSave({ hp: 70 }));
  g.press('potionBtn');
  assert.equal(g.saved().hp, 100);
  assert.equal(g.saved().potions, 2);
});

test('equipped armor reduces damage from enemies', () => {
  const unarmored = game(oldSave());
  const armored = game(oldSave({ kills: 3, armorOwned: true, armorEquipped: true }));
  unarmored.step(2); armored.step(2);
  assert.equal(unarmored.element('healthText').textContent, '94 / 100');
  assert.equal(armored.element('healthText').textContent, '96 / 100');
});

test('defensive stance costs energy, reduces damage, expires and has a cooldown', () => {
  const g = game(oldSave());
  g.press('guardBtn');
  assert.equal(g.saved().mana, 30);
  assert.equal(g.element('guardBtn').classList.contains('active'), true);
  g.step(2);
  assert.equal(g.element('healthText').textContent, '98 / 100');
  g.press('guardBtn');
  assert.match(g.element('toast').textContent, /восстанавливается/);
  g.step(101);
  assert.equal(g.element('guardBtn').classList.contains('active'), false);
  assert.notEqual(g.element('guardTimer').textContent, '3');
});

test('boar kills count only after the first quest and the second quest rewards only once', () => {
  function defeatBoar(save) {
    const g = game(oldSave({x:1170,y:590,...save}));
    g.step(1);
    g.press('attackBtn');g.step(80);
    return g.saved();
  }
  const locked = defeatBoar({questDone:false});
  assert.equal(locked.boarKills, 0);
  assert.equal(locked.kills, 0);
  const first = defeatBoar({questDone:true,kills:3});
  assert.equal(first.boarKills, 1);
  assert.equal(first.gold, 5);
  const second = defeatBoar({...first,x:1170,y:590,hp:100});
  assert.equal(second.boarKills, 2);
  const g = game({...second,x:555,y:395});
  assert.equal(g.element('questProgress').textContent,'Вернитесь к старейшине');
  g.press('attackBtn');
  const complete = g.saved();
  assert.equal(complete.trailQuestDone, true);
  assert.equal(complete.gold, 40);
  assert.equal(complete.potions, 4);
  g.press('attackBtn');
  assert.equal(g.saved().gold, 40);
  const reload = game(complete);
  assert.equal(reload.element('questProgress').textContent, 'Задания выполнены');
});

test('walking into either marked exit changes and saves the zone', () => {
  const g = game(oldSave({ x:1260, y:390 }));
  g.step(2);
  const scale=1.15, cameraX=1376-390/scale, cameraY=390-800/scale/2;
  g.tapCanvas((1290-cameraX)*scale,(390-cameraY)*scale);
  g.step(5);
  assert.equal(g.saved().zone,'camp');
  assert.equal(g.element('locationName').textContent,'Лесной лагерь');
  // Transition spawns the player outside the portal, so remaining idle does not bounce back.
  g.step(5);
  assert.equal(g.element('locationName').textContent,'Лесной лагерь');
  const campCameraX=205-390/scale/2;
  g.tapCanvas((90-campCameraX)*scale,(390-cameraY)*scale);
  g.step(20);
  assert.equal(g.saved().zone,'meadow');
  assert.equal(g.element('locationName').textContent,'Вересковая поляна');
});

test('healer restores health and energy without consuming a potion', () => {
  const g = game(oldSave({zone:'camp',x:780,y:410,hp:35,mana:5}));
  g.press('attackBtn');
  assert.equal(g.element('panelTitle').textContent,'Травница Мирра');
  g.element('healBtn').onclick();
  assert.equal(g.saved().hp,100);
  assert.equal(g.saved().mana,40);
  assert.equal(g.saved().potions,3);
});

test('herb quest accepts, persists individual pickups and rewards only once', () => {
  let g=game(oldSave({zone:'camp',x:780,y:410}));
  g.press('attackBtn');g.element('acceptHerbs').onclick();
  assert.equal(g.saved().campQuestAccepted,true);
  let save=g.saved();
  for(const [x,y] of [[480,510],[880,535],[690,270]]){
    g=game({...save,x,y});g.step(2);save=g.saved();
  }
  assert.equal(save.herbMask,7);
  assert.equal(g.element('questProgress').textContent,'Вернитесь к травнице');
  g=game({...save,x:780,y:410});g.press('attackBtn');
  g.element('finishHerbs').onclick();
  assert.equal(g.saved().campQuestDone,true);
  assert.equal(g.saved().gold,25);
  assert.equal(g.saved().potions,5);
  g.press('attackBtn');
  assert.doesNotMatch(g.element('panelBody').innerHTML,/id="finishHerbs"/);
});

test('camp does not contain meadow enemies, even at the same coordinates', () => {
  const g=game(oldSave({zone:'camp',x:785,y:330}));
  g.step(2);
  assert.equal(g.element('healthText').textContent,'100 / 100');
});

test('merchant sells potions only when there is enough gold', () => {
  const g=game(oldSave({zone:'camp',x:1065,y:410,gold:12,potions:1}));
  g.press('attackBtn');
  assert.equal(g.element('panelTitle').textContent,'Торговец Бран');
  g.element('buyPotion').onclick();
  assert.equal(g.saved().gold,4);
  assert.equal(g.saved().potions,2);
  g.element('buyPotion').onclick();
  assert.equal(g.saved().gold,4);
  assert.equal(g.saved().potions,2);
  assert.match(g.element('shopStatus').textContent,/Недостаточно золота/);
  const reloaded=game(g.saved());
  reloaded.element('bagBtn').onclick();
  assert.match(reloaded.element('panelBody').innerHTML,/× 2/);
});

test('shield purchase is unique, equipped and persists; it can be removed in the bag', () => {
  const g=game(oldSave({zone:'camp',x:1065,y:410,gold:30}));
  g.press('attackBtn');
  const purchase=g.element('buyShield').onclick;
  purchase();
  assert.equal(g.saved().gold,5);
  assert.equal(g.saved().shieldOwned,true);
  assert.equal(g.saved().shieldEquipped,true);
  purchase(); // A stale click handler must not charge twice.
  assert.equal(g.saved().gold,5);
  assert.match(g.element('panelBody').innerHTML,/Куплено/);
  const reloaded=game(g.saved());
  reloaded.element('characterBtn').onclick();
  assert.match(reloaded.element('panelBody').innerHTML,/Защита<\/span><strong>3/);
  reloaded.element('closePanel').onclick();
  reloaded.element('bagBtn').onclick();
  reloaded.element('equipShield').onclick();
  assert.equal(reloaded.saved().shieldOwned,true);
  assert.equal(reloaded.saved().shieldEquipped,false);
});

test('shield reduces damage and cannot be equipped without owning it', () => {
  const shielded=game(oldSave({shieldOwned:true,shieldEquipped:true}));
  shielded.step(2);
  assert.equal(shielded.element('healthText').textContent,'97 / 100');
  const invalid=game(oldSave({shieldOwned:false,shieldEquipped:true}));
  invalid.step(2);
  assert.equal(invalid.element('healthText').textContent,'94 / 100');
  invalid.element('bagBtn').onclick();
  assert.match(invalid.element('panelBody').innerHTML,/Можно купить у торговца/);
});

test('merchant refuses a shield without enough gold', () => {
  const g=game(oldSave({zone:'camp',x:1065,y:410,gold:24}));
  g.press('attackBtn');g.element('buyShield').onclick();
  assert.match(g.element('shopStatus').textContent,/Недостаточно золота/);
  g.element('closePanel').onclick();g.element('bagBtn').onclick();
  assert.match(g.element('panelBody').innerHTML,/Можно купить у торговца/);
  assert.equal(g.saved().gold,24);
});

// The camera tracks the hero in the test viewport and is clamped to the world edges.
function screenPoint(playerX, playerY, worldX, worldY) {
  const scale=1.15, width=390/scale, height=800/scale;
  const cameraX=Math.max(0,Math.min(1376-width,playerX-width/2));
  const cameraY=Math.max(0,Math.min(768-height,playerY-height/2));
  return [(worldX-cameraX)*scale,(worldY-cameraY)*scale];
}

test('tapping an enemy starts continuous attacks and stops when it dies', () => {
  const g=game(oldSave());g.step(1);
  g.tapCanvas(...screenPoint(785,330,785,318));
  assert.equal(g.element('attackBtn')['aria-pressed'],'true');
  assert.equal(g.element('targetHealth').textContent,'16 / 30');
  g.step(27);
  assert.equal(g.element('targetHealth').textContent,'2 / 30');
  g.step(27);
  assert.equal(g.saved().kills,1);
  assert.equal(g.element('attackBtn')['aria-pressed'],'false');
  assert.equal(g.element('targetHud').classList.contains('hidden'),true);
  g.step(90);
  assert.equal(g.saved().kills,1); // Does not silently switch to another enemy.
});

test('attack button stops and resumes autoattack without bypassing cooldown', () => {
  const g=game(oldSave());g.step(1);
  g.tapCanvas(...screenPoint(785,330,785,318));
  g.press('attackBtn');
  assert.equal(g.element('attackBtn')['aria-pressed'],'false');
  g.step(30);
  assert.equal(g.element('targetHealth').textContent,'16 / 30');
  g.press('attackBtn');
  assert.equal(g.element('targetHealth').textContent,'2 / 30');
  g.press('attackBtn'); // Stop immediately; resume immediately cannot add a free hit.
  g.press('attackBtn');
  assert.equal(g.element('targetHealth').textContent,'2 / 30');
  g.step(27);
  assert.equal(g.saved().kills,1);
});

test('touch movement cancels autoattack and skills work independently', () => {
  const g=game(oldSave({x:1170,y:590}));g.step(1);
  g.tapCanvas(...screenPoint(1170,590,1170,578));
  assert.equal(g.element('targetHealth').textContent,'36 / 50');
  g.press('skillBtn');
  assert.equal(g.element('targetHealth').textContent,'10 / 50');
  assert.equal(g.element('attackBtn')['aria-pressed'],'true');
  g.element('joystick').pointerdown({preventDefault(){},pointerId:1,clientX:240,clientY:400});
  g.step(30);
  assert.equal(g.element('attackBtn')['aria-pressed'],'false');
  assert.equal(g.element('targetHealth').textContent,'10 / 50');
});

test('tapping a different enemy retargets without a duplicate immediate hit', () => {
  const g=game(oldSave({x:850,y:400}));g.step(1);
  g.tapCanvas(...screenPoint(850,400,785,318));
  assert.equal(g.element('targetHealth').textContent,'16 / 30');
  g.tapCanvas(...screenPoint(850,400,915,448));
  assert.equal(g.element('targetHealth').textContent,'30 / 30');
  g.step(27);
  assert.equal(g.element('targetHealth').textContent,'16 / 30');
});

test('tapping ground or opening a menu cancels combat without an automatic restart', () => {
  const g=game(oldSave());g.step(1);
  g.tapCanvas(...screenPoint(785,330,785,318));
  g.tapCanvas(35,100);
  assert.equal(g.element('attackBtn')['aria-pressed'],'false');
  assert.equal(g.element('targetHud').classList.contains('hidden'),true);
  g.step(5);
  const h=game(oldSave());h.step(1);
  h.tapCanvas(...screenPoint(785,330,785,318));
  h.element('bagBtn').onclick();
  h.element('closePanel').onclick();
  h.step(30);
  assert.equal(h.element('attackBtn')['aria-pressed'],'false');
  assert.equal(h.element('targetHealth').textContent,'16 / 30');
});
