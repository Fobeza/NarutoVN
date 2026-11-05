const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'onboarding.js'), 'utf8');

function wizard(saved = false) {
  const elements = new Map(), groups = {};
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set(), handlers = {};
      elements.set(id, {id, dataset:{}, value:'', textContent:'', innerHTML:'', disabled:false,
        classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x),toggle(x,on){if(on===undefined)on=!classes.has(x);on?classes.add(x):classes.delete(x);}},
        setAttribute(name,value){this[name]=value;}, addEventListener(name,fn){handlers[name]=fn;},
        click(){if(this.onclick)this.onclick();if(handlers.click)handlers.click();},
        getContext(){return new Proxy({}, {get(t,p){return t[p] || (()=>{});},set(t,p,v){t[p]=v;return true;}});}
      });
    }
    return elements.get(id);
  }
  for (const [key,values] of Object.entries({faction:['keepers','shades'],sex:['male','female'],hair:['0','1','2'],color:['brown','gold','silver','red']})) {
    groups[key]=values.map(value=>{const e=element(`${key}-${value}`);e.dataset[key]=value;return e;});
  }
  let profile={name:'Странник'}, hasSave=saved, confirmResult=false, created=null, resumed=0, paused=0;
  const api={hasSave:()=>hasSave,profile:()=>profile,resume:()=>{resumed++;return hasSave;},pause:()=>paused++,create:p=>{created=p;profile=p;hasSave=true;return {ok:true,saved:true};}};
  const window={HeatherGame:api,confirm:()=>confirmResult,alert:()=>{}};
  vm.runInNewContext(source,{document:{getElementById:element,querySelectorAll:selector=>groups[selector.match(/data-(\w+)/)[1]]},window,Math});
  return {element,window,setConfirm:value=>confirmResult=value,created:()=>created,resumed:()=>resumed,paused:()=>paused};
}

test('fresh wizard validates names, supports returning, and passes selected appearance to game', () => {
  const w=wizard();w.element('playButton').click();assert.equal(w.element('wizardView').classList.contains('is-hidden'),false);
  w.element('faction-shades').click();w.element('wizardNext').click();
  w.element('sex-female').click();w.element('hair-2').click();w.element('color-silver').click();
  w.element('wizardNext').click();w.element('heroNameInput').value='имя';w.element('wizardNext').click();
  assert.match(w.element('nameError').textContent,/латинских/);assert.equal(w.created(),null);
  w.element('wizardBack').click();w.element('wizardNext').click();w.element('heroNameInput').value='Fobeza';w.element('wizardNext').click();
  assert.deepEqual(JSON.parse(JSON.stringify(w.created())),{name:'Fobeza',faction:'shades',sex:'female',hairStyle:2,hairColor:'silver'});
  assert.equal(w.element('titleScreen').classList.contains('is-hidden'),true);
});

test('existing character is not replaced if confirmation is declined', () => {
  const w=wizard(true);w.element('titleMenuButton').click();w.element('newHeroButton').click();
  w.element('wizardNext').click();w.element('wizardNext').click();w.element('heroNameInput').value='Newhero';w.element('wizardNext').click();
  assert.equal(w.created(),null);assert.equal(w.element('nameStep').classList.contains('is-hidden'),false);
  w.setConfirm(true);w.element('wizardNext').click();assert.equal(w.created().name,'Newhero');
});

test('existing character continues directly and the title can be reopened', () => {
  const w=wizard(true);assert.match(w.element('savedHero').textContent,/Странник/);
  w.element('playButton').click();assert.equal(w.resumed(),1);assert.equal(w.element('titleScreen').classList.contains('is-hidden'),true);
  w.window.HeatherTitle.open();assert.equal(w.paused(),1);assert.equal(w.element('titleScreen').classList.contains('is-hidden'),false);
});
