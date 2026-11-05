(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('world'), ctx = canvas.getContext('2d');
  const backgrounds = {meadow: new Image(), camp: new Image()};
  backgrounds.meadow.src = 'assets/meadow.png'; backgrounds.camp.src = 'assets/camp.png';
  const W = 1376, H = 768, SAVE = 'heather-legends-v1';
  const initial = () => ({x: 670, y: 420, hp: 100, mana: 40, level: 1, xp: 0, gold: 0, potions: 3, kills: 0, questDone: false, swordOwned: false, armorOwned: false, swordEquipped: false, armorEquipped: false, boarKills: 0, trailQuestDone: false, zone: 'meadow', campQuestAccepted: false, campQuestDone: false, herbMask: 0, shieldOwned: false, shieldEquipped: false});
  let player = initial();
  try { const saved = JSON.parse(localStorage.getItem(SAVE)); if (saved && typeof saved === 'object') { const base = initial(); for (const key of Object.keys(base)) { if (typeof saved[key] === typeof base[key] && (typeof saved[key] !== 'number' || Number.isFinite(saved[key]))) base[key] = saved[key]; } player = base; player.x = Math.max(40, Math.min(W-40, player.x)); player.y = Math.max(40, Math.min(H-40, player.y)); player.level = Math.max(1, Math.min(99, Math.floor(player.level))); player.hp = Math.max(1, Math.min(100 + (player.level-1)*20, player.hp)); player.mana = Math.max(0, Math.min(40, player.mana));
    if (!['meadow','camp'].includes(player.zone)) player.zone='meadow';
    player.herbMask=Math.max(0,Math.min(7,Math.floor(player.herbMask)));
    // Migrate earlier saves: do not take earned loot away from existing heroes.
    if (player.kills >= 1) player.swordOwned = true;
    if (player.kills >= 3) player.armorOwned = true;
    if (!player.swordOwned) player.swordEquipped = false;
    if (!player.armorOwned) player.armorEquipped = false;
    if (!player.shieldOwned) player.shieldEquipped = false;
  } } catch (_) {}
  const npc = {x: 555, y: 395};
  const healer = {x: 780, y: 410};
  const merchant = {x: 1065, y: 410};
  const PRICES = {potion: 8, shield: 25};
  const portals = {meadow:{x:1290,y:390},camp:{x:90,y:390}};
  const herbs = [{x:480,y:510},{x:880,y:535},{x:690,y:270}];
  const herbCount = () => herbs.reduce((n,_,i)=>n+((player.herbMask>>i)&1),0);
  const visibleEnemies = () => player.zone==='meadow' ? enemies : [];
  const spawns = [[785,330],[915,460],[740,550],[1030,335],[425,535],[340,320]];
  const boarSpawns = [[1170,590],[230,205],[1130,160]];
  function makeEnemy(p,i,type){
    const boar=type==='boar', hp=boar?50:30;
    return {x:p[0],y:p[1],sx:p[0],sy:p[1],type,name:boar?'Лесной кабан':'Слизень',maxHp:hp,hp,damage:boar?9:6,speed:boar?43:35,alive:true,respawn:0,phase:i*1.8,hit:0,cooldown:0};
  }
  const enemies = [...spawns.map((p,i)=>makeEnemy(p,i,'slime')), ...boarSpawns.map((p,i)=>makeEnemy(p,i,'boar'))];
  const particles = [];
  let viewW=0, viewH=0, scale=1, camera={x:0,y:0}, last=0, attackCooldown=0, skillCooldown=0, guardCooldown=0, guardDuration=0, saveClock=0, messageTimer=0, walkTarget=null, keySet=new Set(), stick={x:0,y:0,id:null}, facing=1, moving=false, selectedEnemy=null, autoAttacking=false;
  const maxHp = () => 100 + (player.level-1)*20;
  const maxXp = () => 50 + (player.level-1)*30;
  const attackPower = () => 12 + player.level*2 + (player.swordEquipped ? 5 : 0);
  const defense = () => (player.armorEquipped ? 2 : 0) + (player.shieldEquipped ? 3 : 0) + (guardDuration > 0 ? 4 : 0);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function save(){ try{localStorage.setItem(SAVE, JSON.stringify(player));}catch(_){} }
  function resize(){const dpr=Math.min(devicePixelRatio||1,2); const rect=canvas.getBoundingClientRect();viewW=rect.width;viewH=rect.height;canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.imageSmoothingEnabled=false; scale = viewW < 600 ? 1.15 : Math.max(1,Math.min(1.35, viewW/1000));}
  window.addEventListener('resize',resize); resize();
  function ui(){
    $('levelBadge').textContent=player.level;
    $('healthFill').style.width=`${100*player.hp/maxHp()}%`; $('healthText').textContent=`${Math.ceil(player.hp)} / ${maxHp()}`;
    $('manaFill').style.width=`${100*player.mana/40}%`; $('manaText').textContent=`${Math.floor(player.mana)} / 40`;
    $('xpFill').style.width=`${100*player.xp/maxXp()}%`; $('xpText').textContent=`${player.xp} / ${maxXp()}`;
    $('potionCount').textContent=player.potions; $('skillTimer').textContent=skillCooldown>0?Math.ceil(skillCooldown):'2';
    $('guardTimer').textContent=guardCooldown>0?Math.ceil(guardCooldown):'3';
    $('guardBtn').classList.toggle('active',guardDuration>0);
    $('attackBtn').classList.toggle('active',autoAttacking);
    $('attackBtn').setAttribute('aria-pressed',String(autoAttacking));
    $('attackState').textContent=autoAttacking?'АВТО':'';
    const showTarget=selectedEnemy && selectedEnemy.alive;
    $('targetHud').classList.toggle('hidden',!showTarget);
    if(showTarget){$('targetName').textContent=selectedEnemy.name;$('targetHealth').textContent=`${Math.max(0,selectedEnemy.hp)} / ${selectedEnemy.maxHp}`;$('targetFill').style.width=`${100*Math.max(0,selectedEnemy.hp)/selectedEnemy.maxHp}%`;}
    const camp=player.zone==='camp';
    $('locationName').textContent=camp?'Лесной лагерь':'Вересковая поляна';
    $('worldTitle').textContent=camp?'Лесной лагерь':'Вересковая поляна';
    $('worldSubtitle').textContent=camp?'Тихие земли · Место отдыха':'Тихие земли · Уровень 1–3';
    if(player.campQuestAccepted&&!player.campQuestDone){$('questTitle').textContent='Лекарственные травы';$('questProgress').textContent=herbCount()>=3?'Вернитесь к травнице':'Соберите травы: '+herbCount()+' / 3';}
    else if(!player.questDone){$('questTitle').textContent='Незваные гости';$('questProgress').textContent=player.kills>=3?'Вернитесь к старейшине':'Победите слизней: '+Math.min(3,player.kills)+' / 3';}
    else if(!player.trailQuestDone){$('questTitle').textContent='Опасная тропа';$('questProgress').textContent=player.boarKills>=2?'Вернитесь к старейшине':'Победите кабанов: '+Math.min(2,player.boarKills)+' / 2';}
    else {$('questTitle').textContent='Поляна в безопасности';$('questProgress').textContent='Задания выполнены';}
  }
  function toast(text){$('toast').textContent=text;$('toast').classList.add('show');messageTimer=3;}
  function hideHint(){ $('hint').style.opacity='0'; }
  function openPanel(title, html){$('panelTitle').textContent=title;$('panelBody').innerHTML=html;$('overlay').classList.remove('hidden');stick.x=stick.y=0;stick.id=null;$('knob').style.transform='';walkTarget=null;stopAuto();keySet.clear();}
  function closePanel(){ $('overlay').classList.add('hidden'); }
  $('closePanel').onclick=closePanel; $('overlay').addEventListener('pointerdown',e=>{if(e.target===$('overlay'))closePanel();});
  function showBag(){
    const gear = (owned, equipped, id, name, bonus, hint='Найдите у слизней') => owned
      ? `<div class="gear-row"><div><strong>${name}</strong><small>${bonus}</small></div><button class="gear-button ${equipped?'equipped':''}" id="${id}">${equipped?'Снять':'Надеть'}</button></div>`
      : `<div class="gear-row locked"><div><strong>${name}</strong><small>${hint}</small></div><span>✧</span></div>`;
    openPanel('Сумка', `<span class="badge">ВАШИ ВЕЩИ</span><div class="row"><span>🧪 &nbsp; Малое зелье здоровья</span><strong>× ${player.potions}</strong></div><div class="row"><span>✦ &nbsp; Золото</span><strong class="gold">${player.gold}</strong></div><h3>Снаряжение</h3>${gear(player.swordOwned,player.swordEquipped,'equipSword','Меч разведчика','+5 к атаке')}${gear(player.armorOwned,player.armorEquipped,'equipArmor','Кожаный жилет','+2 к защите')}${gear(player.shieldOwned,player.shieldEquipped,'equipShield','Деревянный щит','+3 к защите','Можно купить у торговца в лагере')}<p class="subtle">Снаряжение остаётся с вами после перезагрузки. Зелье восстанавливает 45 здоровья.</p>`);
    if(player.swordOwned) $('equipSword').onclick=()=>{player.swordEquipped=!player.swordEquipped;save();showBag();};
    if(player.armorOwned) $('equipArmor').onclick=()=>{player.armorEquipped=!player.armorEquipped;save();showBag();};
    if(player.shieldOwned) $('equipShield').onclick=()=>{player.shieldEquipped=!player.shieldEquipped;save();showBag();};
  }
  function showMap(){
    const here=player.zone==='meadow';
    openPanel('Карта местности', `<span class="badge">ТИХИЕ ЗЕМЛИ</span><div class="route-map"><div class="route-node ${here?'current':''}"><span>✿</span><strong>Вересковая поляна</strong><small>${here?'ВЫ ЗДЕСЬ':'Слизни, кабаны и старейшина'}</small></div><div class="route-line">━━━━━━ ✦ ━━━━━━</div><div class="route-node ${!here?'current':''}"><span>⌂</span><strong>Лесной лагерь</strong><small>${!here?'ВЫ ЗДЕСЬ':'Травница, торговец и место отдыха'}</small></div></div><p class="subtle">${here?'Идите к золотому переходу на востоке поляны (справа).':'Идите к золотому переходу на западе лагеря (слева), чтобы вернуться.'} Карта не перемещает героя автоматически.</p>`);
  }
  $('mapBtn').onclick=showMap;
  function showHealer(){
    const status=player.campQuestDone?'Вы помогли травнице пополнить запасы.':!player.campQuestAccepted?'Мне нужны три пучка целебных трав. Они растут на поляне лагеря.':herbCount()<3?`Соберите светящиеся травы в лагере: ${herbCount()} / 3.`:'Вы собрали все травы. Спасибо за помощь!';
    const questButton=player.campQuestDone?'':!player.campQuestAccepted?'<button class="panel-action" id="acceptHerbs">Принять задание</button>':herbCount()>=3?'<button class="panel-action" id="finishHerbs">Сдать травы</button>':'';
    openPanel('Травница Мирра', `<span class="badge">ЛЕСНОЙ ЛАГЕРЬ</span><h3>Рада видеть путника</h3><p>${status}</p><p class="subtle">Лечение бесплатно восстанавливает здоровье и энергию. За травы: 45 опыта, 25 золота и 2 зелья.</p><div class="npc-actions"><button class="panel-action" id="healBtn">Отдохнуть и восстановиться</button>${questButton}</div>`);
    $('healBtn').onclick=()=>{player.hp=maxHp();player.mana=40;save();ui();toast('Здоровье и энергия восстановлены');closePanel();};
    if(!player.campQuestAccepted&&!player.campQuestDone) $('acceptHerbs').onclick=()=>{player.campQuestAccepted=true;save();ui();toast('Задание принято: соберите три травы');closePanel();};
    if(player.campQuestAccepted&&!player.campQuestDone&&herbCount()>=3) $('finishHerbs').onclick=()=>{
      player.campQuestDone=true;player.gold+=25;player.potions+=2;gainXp(45);save();ui();toast('Травы доставлены! +25 золота');closePanel();
    };
  }
  function showShop(message=''){
    const shieldButton=player.shieldOwned
      ? '<button class="gear-button" disabled>Куплено</button>'
      : `<button class="gear-button" id="buyShield">${PRICES.shield} зол.</button>`;
    openPanel('Торговец Бран', `<span class="badge">ЛЕСНОЙ ЛАГЕРЬ</span><h3>Припасы для странника</h3><div class="row"><span>Ваше золото</span><strong class="gold">${player.gold}</strong></div><div class="gear-row"><div><strong>Малое зелье здоровья</strong><small>В сумке: ${player.potions} · восстанавливает 45 здоровья</small></div><button class="gear-button" id="buyPotion">${PRICES.potion} зол.</button></div><div class="gear-row"><div><strong>Деревянный щит</strong><small>+3 к защите · можно снять в сумке</small></div>${shieldButton}</div><p class="subtle shop-status" id="shopStatus" role="status">${message || 'Зарабатывайте золото, побеждая врагов и выполняя задания.'}</p>`);
    $('buyPotion').onclick=()=>{
      if(player.gold<PRICES.potion){$('shopStatus').textContent='Недостаточно золота для покупки зелья.';return;}
      player.gold-=PRICES.potion;player.potions++;save();ui();showShop('Зелье добавлено в сумку.');
    };
    if(!player.shieldOwned) $('buyShield').onclick=()=>{
      if(player.shieldOwned)return;
      if(player.gold<PRICES.shield){$('shopStatus').textContent='Недостаточно золота для покупки щита.';return;}
      player.gold-=PRICES.shield;player.shieldOwned=true;player.shieldEquipped=true;save();ui();showShop('Щит куплен и надет.');
    };
  }
  $('bagBtn').onclick=showBag;
  $('questBtn').onclick=$('questCard').onclick=()=>{
    const first=`<span class="badge">${player.questDone?'ВЫПОЛНЕНО':'ЗАДАНИЕ ПОЛЯНЫ'}</span><h3>Незваные гости</h3><p>Слизни расползлись по Вересковой поляне. Помогите старейшине защитить тропу и победите трёх слизней.</p><div class="row"><span>Побеждено слизней</span><strong class="gold">${Math.min(3,player.kills)} / 3</strong></div><p class="subtle">${player.questDone?'Задание выполнено.':player.kills>=3?'Вернитесь к старейшине и нажмите кнопку атаки рядом с ним.':'Награда: 30 опыта, 20 золота и зелье.'}</p>`;
    const second=player.questDone?`<span class="badge">${player.trailQuestDone?'ВЫПОЛНЕНО':'СЛЕДУЮЩЕЕ ЗАДАНИЕ'}</span><h3>Опасная тропа</h3><p>На окраинах поляны появились лесные кабаны. Победите двух, чтобы путь снова стал безопасным.</p><div class="row"><span>Побеждено кабанов</span><strong class="gold">${Math.min(2,player.boarKills)} / 2</strong></div><p class="subtle">${player.trailQuestDone?'Задание выполнено.':player.boarKills>=2?'Вернитесь к старейшине за наградой.':'Награда: 40 опыта, 30 золота и зелье.'}</p>`:'';
    const third=player.campQuestAccepted?`<span class="badge">${player.campQuestDone?'ВЫПОЛНЕНО':'ЗАДАНИЕ ЛАГЕРЯ'}</span><h3>Лекарственные травы</h3><p>Соберите три светящихся растения в лесном лагере для травницы Мирры.</p><div class="row"><span>Собрано трав</span><strong class="gold">${herbCount()} / 3</strong></div><p class="subtle">${player.campQuestDone?'Задание выполнено.':herbCount()>=3?'Вернитесь к травнице в лагере.':'Подойдите к растениям, чтобы собрать их. Награда: 45 опыта, 25 золота и 2 зелья.'}</p>`:'';
    openPanel('Журнал заданий', first+second+third);
  };
  $('characterBtn').onclick=()=>openPanel('Ваш герой',`<span class="badge">ВОИН · УРОВЕНЬ ${player.level}</span><h3>Странник</h3><p>Отважный искатель приключений, ступивший на земли Вереска.</p><div class="row"><span>Здоровье</span><strong>${Math.ceil(player.hp)} / ${maxHp()}</strong></div><div class="row"><span>Энергия</span><strong>${Math.floor(player.mana)} / 40</strong></div><div class="row"><span>Атака</span><strong>${attackPower()}</strong></div><div class="row"><span>Защита</span><strong>${defense()}</strong></div><div class="row"><span>Опыт</span><strong>${player.xp} / ${maxXp()}</strong></div><div class="row"><span>Золото</span><strong class="gold">${player.gold}</strong></div>`);
  $('menuBtn').onclick=()=>{openPanel('Меню',`<span class="badge">ОДИНОЧНОЕ ПРИКЛЮЧЕНИЕ</span><h3>Легенды Вереска</h3><p>Перемещайтесь джойстиком или касанием земли. Коснитесь врага: герой подойдёт и начнёт автоатаку. Для остановки нажмите ⚔ или начните двигаться. ⚔ без выбранной цели выбирает ближайшего врага; рядом с персонажами начинает разговор. Для перехода между локациями подойдите к золотому указателю; направление показано на карте. ✧ — сильный удар, ⛨ — защитная стойка на 5 секунд, зелье восстанавливает здоровье.</p><p class="subtle">Прогресс сохраняется в этом браузере на устройстве. На компьютере также работают WASD и стрелки, пробел — атака.</p><button class="panel-action danger" id="resetBtn">Начать заново</button>`);$('resetBtn').onclick=()=>{if(confirm('Удалить сохранение и начать заново?')){player=initial();selectedEnemy=null;stopAuto();guardCooldown=guardDuration=0;attackCooldown=skillCooldown=0;enemies.forEach(e=>{e.alive=true;e.hp=e.maxHp;e.x=e.sx;e.y=e.sy;e.cooldown=0;});save();ui();closePanel();toast('Новое приключение начинается!');}};};
  function gainXp(n){player.xp+=n;while(player.xp>=maxXp()){player.xp-=maxXp();player.level++;player.hp=maxHp();player.mana=40;toast('Новый уровень: '+player.level+'!');}}
  function interact(){
    if(player.zone==='camp'){if(distance(player,healer)<95){showHealer();return true;}if(distance(player,merchant)<95){showShop();return true;}return false;}
    if(distance(player,npc)>=95)return false;
    if(!player.questDone && player.kills>=3){
      player.questDone=true;player.gold+=20;player.potions++;gainXp(30);
      toast('Задание выполнено! Новое: Опасная тропа');save();
    }else if(!player.questDone)toast('Старейшина: Защити поляну от слизней!');
    else if(!player.trailQuestDone && player.boarKills>=2){
      player.trailQuestDone=true;player.gold+=30;player.potions++;gainXp(40);
      toast('Тропа безопасна! +30 золота');save();
    }else if(!player.trailQuestDone)toast('Старейшина: На окраинах появились кабаны!');
    else toast('Старейшина: Спасибо за помощь!');
    ui();return true;
  }
  // The interaction is source-backed; range and 1.2 second interval are prototype values.
  const ATTACK_RANGE=110, ATTACK_INTERVAL=1.2;
  function stopAuto(){autoAttacking=false;}
  function strike(target,special){
    if(!target || !target.alive)return;
    if(special){player.mana-=12;skillCooldown=4;}else attackCooldown=ATTACK_INTERVAL;
    hideHint();facing=target.x<player.x?-1:1;
    const damage=attackPower()+(special?12:0);
    target.hp-=damage;target.hit=.18;
    particles.push({x:target.x,y:target.y-55,text:'−'+damage,t:1,color:special?'#a8eaff':'#fff0bc'});
    if(target.hp<=0){
      target.alive=false;target.respawn=12;if(selectedEnemy===target){selectedEnemy=null;stopAuto();}
      const boar=target.type==='boar', xp=boar?20:12;
      player.gold+=boar?5:3;gainXp(xp);
      particles.push({x:target.x,y:target.y-75,text:`+${xp} опыта`,t:1.4,color:'#f7df83'});
      if(boar){
        if(player.questDone&&!player.trailQuestDone){player.boarKills++;if(player.boarKills===2)toast('Кабаны побеждены! Вернитесь к старейшине');}
      }else{
        player.kills++;
        if(!player.swordOwned){player.swordOwned=true;toast('Добыча: меч разведчика. Откройте сумку');}
        else if(player.kills>=3&&!player.armorOwned){player.armorOwned=true;toast('Добыча: кожаный жилет. Откройте сумку');}
        else if(player.kills===3&&!player.questDone)toast('Слизни побеждены! Вернитесь к старейшине');
      }
      save();
    }
    ui();
  }
  function startAuto(target){
    if(!target || !target.alive)return;
    selectedEnemy=target;autoAttacking=true;walkTarget=null;hideHint();
    if(distance(player,target)<=ATTACK_RANGE && attackCooldown<=0)strike(target,false);
    ui();
  }
  function toggleAuto(){
    if(!$('overlay').classList.contains('hidden'))return;
    if(autoAttacking){stopAuto();ui();toast('Автоатака остановлена');return;}
    if(selectedEnemy && !selectedEnemy.alive)selectedEnemy=null;
    if(!selectedEnemy && interact())return;
    const target=selectedEnemy||visibleEnemies().filter(e=>e.alive).sort((a,b)=>distance(player,a)-distance(player,b))[0];
    if(!target || (!selectedEnemy && distance(player,target)>ATTACK_RANGE)){toast('Выберите врага или подойдите ближе');return;}
    startAuto(target);
  }
  function useStrikeSkill(){
    if(!$('overlay').classList.contains('hidden'))return;
    if(skillCooldown>0){toast('Умение ещё восстанавливается');return;}
    const target=selectedEnemy&&selectedEnemy.alive?selectedEnemy:visibleEnemies().filter(e=>e.alive).sort((a,b)=>distance(player,a)-distance(player,b))[0];
    if(!target || distance(player,target)>ATTACK_RANGE){toast('Подойдите ближе к врагу');return;}
    if(player.mana<12){toast('Недостаточно энергии');return;}
    strike(target,true);
  }

  function useGuard(){
    if(!$('overlay').classList.contains('hidden'))return;
    if(guardCooldown>0){toast('Стойка ещё восстанавливается');return;}
    if(player.mana<10){toast('Недостаточно энергии');return;}
    player.mana-=10;guardCooldown=10;guardDuration=5;
    particles.push({x:player.x,y:player.y-65,text:'+4 защита',t:1.4,color:'#bce6ff'});
    toast('Защитная стойка: +4 защиты на 5 секунд');ui();save();
  }
  $('guardBtn').addEventListener('pointerdown',e=>{e.preventDefault();useGuard();});
  $('attackBtn').addEventListener('pointerdown',e=>{e.preventDefault();toggleAuto();});$('skillBtn').addEventListener('pointerdown',e=>{e.preventDefault();useStrikeSkill();});$('potionBtn').addEventListener('pointerdown',e=>{e.preventDefault();if(player.potions<=0){toast('Зелья закончились');return;}if(player.hp>=maxHp()){toast('Здоровье уже полное');return;}player.potions--;player.hp=Math.min(maxHp(),player.hp+45);toast('Здоровье восстановлено');ui();save();});
  const joy=$('joystick');function moveStick(e){const r=joy.getBoundingClientRect();let dx=e.clientX-(r.left+r.width/2),dy=e.clientY-(r.top+r.height/2),length=Math.hypot(dx,dy),limit=35;if(length>limit){dx*=limit/length;dy*=limit/length;}stick.x=dx/limit;stick.y=dy/limit;$('knob').style.transform=`translate(${dx}px,${dy}px)`;if(length>4){hideHint();walkTarget=null;stopAuto();}}
  joy.addEventListener('pointerdown',e=>{e.preventDefault();if(stick.id!==null)return;stick.id=e.pointerId;joy.setPointerCapture(e.pointerId);moveStick(e);});joy.addEventListener('pointermove',e=>{if(e.pointerId===stick.id)moveStick(e);});function release(e){if(e.pointerId!==stick.id)return;stick.id=null;stick.x=stick.y=0;$('knob').style.transform='';}joy.addEventListener('pointerup',release);joy.addEventListener('pointercancel',release);joy.addEventListener('lostpointercapture',release);
  canvas.addEventListener('pointerdown',e=>{
    e.preventDefault();hideHint();const rect=canvas.getBoundingClientRect();
    const point={x:camera.x+(e.clientX-rect.left)/scale,y:camera.y+(e.clientY-rect.top)/scale};
    const target=visibleEnemies().filter(enemy=>enemy.alive && Math.hypot(point.x-enemy.x,point.y-(enemy.y-12))<38).sort((a,b)=>distance(point,a)-distance(point,b))[0];
    if(target){startAuto(target);}
    else {stopAuto();selectedEnemy=null;walkTarget=point;ui();}
  });
  window.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(e.key))e.preventDefault();if(e.key==='Escape'){closePanel();return;}if(!$('overlay').classList.contains('hidden'))return;keySet.add(e.key.toLowerCase());if(['w','a','s','d','arrowup','arrowdown','arrowleft','arrowright'].includes(e.key.toLowerCase()))stopAuto();if(e.key===' '&&!e.repeat)toggleAuto();if(e.key==='2'&&!e.repeat)useStrikeSkill();if(e.key==='3'&&!e.repeat)useGuard();});window.addEventListener('keyup',e=>keySet.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>{stopAuto();ui();keySet.clear();stick.x=stick.y=0;stick.id=null;$('knob').style.transform='';save();});document.addEventListener('visibilitychange',()=>{if(document.hidden){stopAuto();ui();save();}});
  function changeZone(){
    player.zone=player.zone==='meadow'?'camp':'meadow';
    player.x=player.zone==='camp'?205:1175;player.y=390;
    walkTarget=null;selectedEnemy=null;stopAuto();stick.x=stick.y=0;stick.id=null;
    $('knob').style.transform='';keySet.clear();particles.length=0;
    save();toast(player.zone==='camp'?'Лесной лагерь':'Вересковая поляна');
  }
  function update(dt){if(!$('overlay').classList.contains('hidden'))return;attackCooldown=Math.max(0,attackCooldown-dt);skillCooldown=Math.max(0,skillCooldown-dt);guardCooldown=Math.max(0,guardCooldown-dt);guardDuration=Math.max(0,guardDuration-dt);player.mana=Math.min(40,player.mana+dt*1.4);let dx=stick.x+(keySet.has('d')||keySet.has('arrowright')?1:0)-(keySet.has('a')||keySet.has('arrowleft')?1:0),dy=stick.y+(keySet.has('s')||keySet.has('arrowdown')?1:0)-(keySet.has('w')||keySet.has('arrowup')?1:0);if(dx||dy){walkTarget=null;stopAuto();}else if(autoAttacking && selectedEnemy && selectedEnemy.alive){let d=distance(player,selectedEnemy);if(d<=ATTACK_RANGE){if(attackCooldown<=0)strike(selectedEnemy,false);}else{dx=(selectedEnemy.x-player.x)/d;dy=(selectedEnemy.y-player.y)/d;}}else if(walkTarget){let d=distance(player,walkTarget);if(d<5)walkTarget=null;else {dx=(walkTarget.x-player.x)/d;dy=(walkTarget.y-player.y)/d;}}let l=Math.hypot(dx,dy);moving=l>.08;if(l>1){dx/=l;dy/=l;}if(moving){player.x=Math.max(30,Math.min(W-30,player.x+dx*125*dt));player.y=Math.max(55,Math.min(H-25,player.y+dy*125*dt));if(Math.abs(dx)>.1)facing=dx<0?-1:1;}
    if(moving && distance(player,portals[player.zone])<42){changeZone();ui();return;}
    if(player.zone==='camp' && player.campQuestAccepted && !player.campQuestDone){
      herbs.forEach((herb,i)=>{if(!(player.herbMask&(1<<i)) && distance(player,herb)<30){player.herbMask|=1<<i;toast(herbCount()===3?'Травы собраны! Вернитесь к Мирре':`Собрана трава: ${herbCount()} / 3`);save();}});
    }
    for(const e of visibleEnemies()){if(!e.alive){e.respawn-=dt;if(e.respawn<=0){e.alive=true;e.hp=e.maxHp;e.x=e.sx;e.y=e.sy;e.cooldown=0;}continue;}e.hit=Math.max(0,e.hit-dt);e.cooldown=Math.max(0,e.cooldown-dt);let d=distance(player,e);if(d<145&&d>38){e.x+=(player.x-e.x)/d*e.speed*dt;e.y+=(player.y-e.y)/d*e.speed*dt;}else if(d>=145){e.x+=(e.sx-e.x)*dt*.25;e.y+=(e.sy-e.y)*dt*.25;}if(d<48&&e.cooldown<=0){let damage=Math.max(1,e.damage-defense());player.hp=Math.max(0,player.hp-damage);e.cooldown=1.1;particles.push({x:player.x,y:player.y-55,text:'−'+damage,t:1,color:'#ff9890'});if(player.hp<=0){player.hp=maxHp();player.zone='meadow';player.x=670;player.y=420;player.gold=Math.max(0,player.gold-5);walkTarget=null;stopAuto();selectedEnemy=null;guardDuration=0;toast('Вы вернулись на поляну. −5 золота');save();}}}
    for(const p of particles){p.t-=dt;p.y-=22*dt;}while(particles.length&&particles[0].t<=0)particles.shift();saveClock+=dt;if(saveClock>5){saveClock=0;save();}if(messageTimer>0){messageTimer-=dt;if(messageTimer<=0)$('toast').classList.remove('show');}ui();}
  function pixel(x,y,w,h,color){ctx.fillStyle=color;ctx.fillRect(x,y,w,h);}
  function shadow(x,y,rx=20){ctx.fillStyle='rgba(7,15,9,.35)';ctx.beginPath();ctx.ellipse(x,y,rx,7,0,0,Math.PI*2);ctx.fill();}
  function hero(x,y,time){shadow(x,y+1,19);ctx.save();ctx.translate(x,y-2);ctx.scale(facing,1);let bob=moving?Math.round(Math.sin(time*11))*2:0;ctx.translate(0,bob);pixel(-11,-14,9,14,'#282923');pixel(3,-14,9,14,'#282923');pixel(-12,-5,11,6,'#443b30');pixel(2,-5,11,6,'#443b30');pixel(-14,-30,28,20,'#3a4e49');pixel(-11,-30,22,17,'#657c72');pixel(-14,-26,5,16,'#baa276');pixel(9,-26,5,16,'#baa276');if(player.shieldEquipped){pixel(-19,-28,9,17,'#634b30');pixel(-18,-27,7,14,'#b48a51');pixel(-16,-24,3,7,'#dac094');}pixel(-9,-18,18,4,'#8b7452');pixel(-9,-44,18,15,'#d6aa79');pixel(-11,-43,4,9,'#b98961');pixel(7,-43,4,9,'#b98961');pixel(-10,-48,20,8,'#4a3328');pixel(-12,-45,6,7,'#4a3328');pixel(5,-42,3,3,'#24241d');pixel(14,-26,4,22,'#86764f');pixel(16,-38,3,19,'#d7d2b5');pixel(14,-39,5,3,'#f3e7c0');ctx.restore();}
  function slime(e,time){let bob=Math.sin(time*4+e.phase)*2;shadow(e.x,e.y+1,19);ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y+bob));pixel(-17,-13,34,11,e.hit?'#e5fff2':'#3c7653');pixel(-14,-20,28,8,e.hit?'#e5fff2':'#579c70');pixel(-10,-23,20,5,'#76bd88');pixel(-14,-10,28,8,'#4e9362');pixel(-9,-15,4,4,'#172d22');pixel(5,-15,4,4,'#172d22');pixel(-5,-20,7,3,'#a5dca6');ctx.restore();}
  function boar(e,time){
    const bob=Math.round(Math.sin(time*5+e.phase));shadow(e.x,e.y+1,21);
    ctx.save();ctx.translate(Math.round(e.x),Math.round(e.y+bob));
    pixel(-18,-14,33,12,e.hit?'#f5ddc8':'#73543e');pixel(-14,-21,25,9,e.hit?'#f5ddc8':'#8e6b4d');
    pixel(-14,-5,5,6,'#48372d');pixel(8,-5,5,6,'#48372d');pixel(10,-17,11,12,'#9e7655');
    pixel(12,-22,5,6,'#604332');pixel(16,-13,6,4,'#b99472');pixel(13,-16,3,3,'#221e19');
    pixel(19,-11,3,5,'#eee1bd');ctx.restore();
  }
  function drawEnemy(e,t){
    if(e===selectedEnemy){ctx.strokeStyle='#f4d270';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(e.x,e.y+2,25,10,0,0,Math.PI*2);ctx.stroke();}
    if(e.type==='boar')boar(e,t);else slime(e,t);
  }
  function drawHerb(herb,t){
    const pulse=.65+Math.sin(t*3)*.2;ctx.save();ctx.globalAlpha=pulse;
    ctx.fillStyle='#b4eab0';ctx.beginPath();ctx.ellipse(herb.x,herb.y,14,6,0,0,Math.PI*2);ctx.fill();ctx.restore();
    pixel(herb.x-2,herb.y-18,4,16,'#6ca660');pixel(herb.x-10,herb.y-14,8,5,'#8aca78');pixel(herb.x+2,herb.y-20,8,6,'#c5e99e');pixel(herb.x-5,herb.y-23,5,5,'#edf1b5');
    label(herb.x,herb.y-28,'Трава','#d1f6b1');
  }
  function drawPortal(portal,t){
    ctx.save();ctx.strokeStyle='#f3da8d';ctx.globalAlpha=.65+Math.sin(t*3)*.2;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(portal.x,portal.y,30,14,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    label(portal.x,portal.y-18,player.zone==='meadow'?'→ Лесной лагерь':'← На поляну','#ffe39b');
  }
  function medic(x,y){
    shadow(x,y,19);ctx.save();ctx.translate(x,y);
    pixel(-13,-27,26,25,'#466a5a');pixel(-10,-26,20,20,'#b8c5a0');pixel(-13,-8,26,8,'#43594a');
    pixel(-9,-43,18,16,'#d9b28c');pixel(-11,-47,22,8,'#73513c');pixel(-10,-41,4,11,'#73513c');
    pixel(4,-39,3,3,'#272a24');pixel(-3,-20,6,4,'#e6e5c5');pixel(-2,-22,4,8,'#e6e5c5');ctx.restore();
  }
  function trader(x,y){
    shadow(x,y,19);ctx.save();ctx.translate(x,y);
    pixel(-13,-27,26,25,'#5b4132');pixel(-10,-26,20,20,'#9b7653');pixel(-13,-8,26,8,'#54402e');
    pixel(-9,-43,18,16,'#d2a783');pixel(-11,-47,22,8,'#563d30');pixel(-8,-36,16,7,'#614535');
    pixel(4,-39,3,3,'#272a24');pixel(-3,-21,6,8,'#d5b778');pixel(15,-20,7,16,'#7a5a3c');ctx.restore();
  }
  function elder(x,y){shadow(x,y,19);ctx.save();ctx.translate(x,y);pixel(-13,-27,26,25,'#76574f');pixel(-10,-26,20,22,'#a77c66');pixel(-13,-9,26,8,'#65453e');pixel(-9,-43,18,16,'#d9b28c');pixel(-11,-46,22,8,'#d2cfb5');pixel(-8,-36,16,9,'#e1ddc5');pixel(-5,-34,10,11,'#e1ddc5');pixel(-7,-39,3,3,'#272a24');pixel(5,-39,3,3,'#272a24');pixel(16,-38,3,37,'#95744e');ctx.restore();}
  function label(x,y,text,color='#f7e8bc'){ctx.font='bold 12px Arial';ctx.textAlign='center';ctx.lineWidth=3;ctx.strokeStyle='#172118';ctx.strokeText(text,x,y);ctx.fillStyle=color;ctx.fillText(text,x,y);}
  function render(t){ctx.clearRect(0,0,viewW,viewH);let worldViewW=viewW/scale,worldViewH=viewH/scale;camera.x=worldViewW>=W?(W-worldViewW)/2:Math.max(0,Math.min(W-worldViewW,player.x-worldViewW/2));camera.y=worldViewH>=H?(H-worldViewH)/2:Math.max(0,Math.min(H-worldViewH,player.y-worldViewH/2));ctx.save();ctx.scale(scale,scale);ctx.translate(-Math.round(camera.x),-Math.round(camera.y));ctx.fillStyle='#173c23';ctx.fillRect(camera.x,camera.y,worldViewW,worldViewH);const background=backgrounds[player.zone];if(background.complete&&background.naturalWidth)ctx.drawImage(background,0,0,W,H);drawPortal(portals[player.zone],t);if(player.zone==='camp'&&player.campQuestAccepted&&!player.campQuestDone)herbs.forEach((h,i)=>{if(!(player.herbMask&(1<<i)))drawHerb(h,t);});let figures=[{y:player.y,draw:()=>hero(player.x,player.y,t)},...(player.zone==='meadow'?[{y:npc.y,draw:()=>elder(npc.x,npc.y)}]:[{y:healer.y,draw:()=>medic(healer.x,healer.y)},{y:merchant.y,draw:()=>trader(merchant.x,merchant.y)}]),...visibleEnemies().filter(e=>e.alive).map(e=>({y:e.y,draw:()=>drawEnemy(e,t)}))];figures.sort((a,b)=>a.y-b.y).forEach(o=>o.draw());if(player.zone==='meadow'){label(npc.x,npc.y-56,'Старейшина','#f3dc91');if(!player.trailQuestDone)label(npc.x,npc.y-75,(!player.questDone?player.kills>=3:player.boarKills>=2)?'?':'!','#ffe178');}else{label(healer.x,healer.y-56,'Травница Мирра','#f3dc91');label(merchant.x,merchant.y-56,'Торговец Бран','#f3dc91');if(!player.campQuestDone)label(healer.x,healer.y-75,player.campQuestAccepted&&herbCount()===3?'?':'!','#ffe178');}label(player.x,player.y-56,'Странник','#eaf1d8');for(const e of visibleEnemies().filter(e=>e.alive)){label(e.x,e.y-35,(e===selectedEnemy?'◆ ':'')+e.name,e===selectedEnemy?'#ffe296':'#f1ded0');if(e.hp<e.maxHp || e===selectedEnemy){pixel(e.x-18,e.y-30,36,4,'#2a2921');pixel(e.x-17,e.y-29,34*e.hp/e.maxHp,2,'#e16959');}}for(const p of particles){ctx.globalAlpha=Math.min(1,p.t);label(p.x,p.y,p.text,p.color);ctx.globalAlpha=1;}ctx.restore();}
  function frame(ts){let dt=last?Math.min((ts-last)/1000,.05):0;last=ts;update(dt);render(ts/1000);requestAnimationFrame(frame);}ui();requestAnimationFrame(frame);
})();
