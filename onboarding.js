(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const screen = $('titleScreen');
  const views = [$('titleHome'), $('titleMenu'), $('wizardView')];
  const steps = [$('factionStep'), $('appearanceStep'), $('nameStep')];
  const palettes = {brown:'#4a3328',gold:'#b68c45',silver:'#b9c3bd',red:'#a94f3b'};
  let draft = {faction:'keepers',sex:'male',hairStyle:0,hairColor:'brown'}, step = 0;
  const choices = (name) => [...document.querySelectorAll(`[data-${name}]`)];
  function showView(view){views.forEach(v=>v.classList.toggle('is-hidden',v!==view));}
  function showHome(){
    showView($('titleHome'));
    const saved=window.HeatherGame.hasSave();
    $('playButton').innerHTML=saved?'Продолжить <span>›</span>':'Играть <span>›</span>';
    $('savedHero').textContent=saved?`ВАШ ГЕРОЙ · ${window.HeatherGame.profile().name}`:'ТВОЁ ПРИКЛЮЧЕНИЕ ЖДЁТ';
    $('continueButton').disabled=!saved;
    $('aboutText').classList.add('is-hidden');
  }
  function open(){window.HeatherGame.pause();screen.classList.remove('is-hidden');showHome();}
  function enter(){if(window.HeatherGame.resume()){screen.classList.add('is-hidden');}else begin();}
  function select(name,value){
    choices(name).forEach(button=>{const chosen=button.dataset[name]===String(value);button.classList.toggle('chosen',chosen);button.setAttribute('aria-pressed',String(chosen));});
  }
  function drawPreview(){
    const c=$('heroPreview'), ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);ctx.imageSmoothingEnabled=false;
    const hair=palettes[draft.hairColor], tunic=draft.faction==='shades'?'#76657d':'#657c72';
    const rect=(x,y,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(x,y,w,h);};
    [34,96,158].forEach((x,i)=>{
      ctx.fillStyle='#273a3a';ctx.beginPath();ctx.ellipse(x,78,21,7,0,0,Math.PI*2);ctx.fill();
      rect(x-8,63,7,13,'#272923');rect(x+2,63,7,13,'#272923');
      rect(x-13,43,26,22,'#34473f');rect(x-10,43,20,17,tunic);rect(x-12,47,4,12,'#c49c70');rect(x+8,47,4,12,'#c49c70');
      if(draft.sex==='female')rect(x-7,52,14,2,'#bfa981');
      rect(x-8,29,16,15,'#d5ad7f');rect(x-9,25,18,8,hair);
      if(i===2)rect(x-8,30,16,10,hair);else if(i===1)rect(x-9,30,5,9,hair);
      if(draft.hairStyle===1)rect(x-9,34,4,10,hair);
      if(draft.hairStyle===2){rect(x+5,31,4,12,hair);rect(x-7,22,5,4,hair);}
      if(i!==2)rect(x+3,35,2,2,'#252b25');
      rect(x+13,43,3,20,'#c9bd99');rect(x+11,56,7,3,'#ae8957');
    });
  }
  function displayStep(){
    showView($('wizardView'));
    steps.forEach((el,i)=>el.classList.toggle('is-hidden',i!==step));
    $('stepIndicator').textContent=`ШАГ ${step+1} / 3`;
    $('wizardNext').innerHTML=step===2?'Создать <span>›</span>':'Далее <span>›</span>';
    ['progressOne','progressTwo','progressThree'].forEach((id,i)=>$(id).classList.toggle('current',i<=step));
    $('nameError').textContent='';
    if(step===1)drawPreview();
  }
  function begin(){
    draft={faction:'keepers',sex:'male',hairStyle:0,hairColor:'brown'};step=0;
    select('faction',draft.faction);select('sex',draft.sex);select('hair',draft.hairStyle);select('color',draft.hairColor);
    $('factionDescription').textContent='Хранители оберегают покой лесных земель и помогают путникам.';
    $('heroNameInput').value='';displayStep();
  }
  choices('faction').forEach(el=>el.addEventListener('click',()=>{draft.faction=el.dataset.faction;select('faction',draft.faction);$('factionDescription').textContent=draft.faction==='keepers'?'Хранители оберегают покой лесных земель и помогают путникам.':'Сумеречные исследуют забытые тропы и хранят тайны ночного леса.';}));
  choices('sex').forEach(el=>el.addEventListener('click',()=>{draft.sex=el.dataset.sex;select('sex',draft.sex);drawPreview();}));
  choices('hair').forEach(el=>el.addEventListener('click',()=>{draft.hairStyle=Number(el.dataset.hair);select('hair',draft.hairStyle);drawPreview();}));
  choices('color').forEach(el=>el.addEventListener('click',()=>{draft.hairColor=el.dataset.color;select('color',draft.hairColor);drawPreview();}));
  $('playButton').onclick=()=>window.HeatherGame.hasSave()?enter():begin();
  $('titleMenuButton').onclick=()=>showView($('titleMenu'));
  $('menuBackButton').onclick=showHome;
  $('continueButton').onclick=enter;
  $('newHeroButton').onclick=begin;
  $('aboutButton').onclick=()=>$('aboutText').classList.toggle('is-hidden');
  $('wizardBack').onclick=()=>{if(step===0)showHome();else{step--;displayStep();}};
  $('wizardNext').onclick=()=>{
    if(step<2){step++;displayStep();return;}
    const name=$('heroNameInput').value;
    if(!/^[A-Za-z]{3,10}$/.test(name)){$('nameError').textContent='Введите от 3 до 10 латинских букв.';return;}
    if(window.HeatherGame.hasSave() && !window.confirm('Создать нового героя? Текущее локальное сохранение будет заменено.'))return;
    const result=window.HeatherGame.create({...draft,name});
    if(!result.ok){$('nameError').textContent='Не удалось создать героя. Проверьте данные.';return;}
    screen.classList.add('is-hidden');
    if(!result.saved)window.alert('Не удалось сохранить прогресс в браузере. Проверьте настройки хранения данных.');
  };
  window.HeatherTitle={open,newHero(){window.HeatherGame.pause();screen.classList.remove('is-hidden');begin();}};
  showHome();
})();
