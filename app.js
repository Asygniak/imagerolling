const $ = id => document.getElementById(id);
const DB_NAME='character-draw-db', STORE='characters', SETTINGS='settings';
let db, chars=[], editingId=null, pendingImage=null, nextAllowed=0, timer=null;

function openDB(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});if(!d.objectStoreNames.contains(SETTINGS))d.createObjectStore(SETTINGS,{keyPath:'key'});};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
function request(store,mode,fn){return new Promise((resolve,reject)=>{const tx=db.transaction(store,mode),s=tx.objectStore(store);let r=fn(s);tx.oncomplete=()=>resolve(r?.result);tx.onerror=()=>reject(tx.error);});}
const allChars=()=>new Promise((res,rej)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});
async function getSetting(key,def){const r=await request(SETTINGS,'readonly',s=>s.get(key));return r?.value??def;}
async function setSetting(key,value){await request(SETTINGS,'readwrite',s=>s.put({key,value}));}
const putChar=c=>request(STORE,'readwrite',s=>s.put(c));
const delChar=id=>request(STORE,'readwrite',s=>s.delete(id));
function showEditor(){ $('app').style.display='none';$('editor').style.display='block';renderList(); }
function showApp(){ $('editor').style.display='none';$('app').style.display='block';renderCollection();updateLock(); }
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function imgURL(blob){return blob?URL.createObjectURL(blob):'';}
function readFile(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);});}
async function fileToBlob(file){if(!file.type.startsWith('image/'))throw Error('Wybierz plik graficzny.');if(file.size>12*1024*1024)throw Error('Obrazek jest za duży (limit 12 MB).');return file;}
async function renderList(){
 const list=$('charList');list.innerHTML='';
 if(!chars.length){list.innerHTML='<div class="empty">Nie dodano jeszcze żadnej postaci.</div>';return;}
 for(const c of chars){const el=document.createElement('div');el.className='item';const url=imgURL(c.image);el.innerHTML=`${url?`<img src="${url}">`:'<div class="itemimg"></div>'}<div class="meta"><strong>${esc(c.name)}</strong><p>${esc(c.description||'Brak opisu')}</p><p>Waga: ${c.chance}</p><div class="row"><button class="secondary fit" data-edit="${c.id}">Edytuj</button><button class="danger fit" data-del="${c.id}">Usuń</button></div></div>`;list.append(el);}
 list.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>startEdit(b.dataset.edit));
 list.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{if(confirm('Usunąć tę postać?')){await delChar(b.dataset.del);chars=await allChars();renderList();}});
}
function startEdit(id){const c=chars.find(x=>x.id===id);if(!c)return;editingId=id;pendingImage=c.image;$('name').value=c.name;$('desc').value=c.description||'';$('chance').value=c.chance;$('saveChar').textContent='Zapisz zmiany';$('cancelEdit').classList.remove('hidden');$('imageFile').value='';$('name').focus();}
function resetForm(){editingId=null;pendingImage=null;$('name').value='';$('desc').value='';$('chance').value='1';$('imageFile').value='';$('saveChar').textContent='Dodaj postać';$('cancelEdit').classList.add('hidden');}
$('imageFile').addEventListener('change',async e=>{const f=e.target.files[0];if(f){try{pendingImage=await fileToBlob(f);}catch(err){alert(err.message);e.target.value='';}}});
$('saveChar').onclick=async()=>{const name=$('name').value.trim(),chance=Number($('chance').value);if(!name)return alert('Wpisz nazwę postaci.');if(!Number.isFinite(chance)||chance<=0)return alert('Waga musi być większa od zera.');if(!pendingImage&&!editingId)return alert('Dodaj obrazek postaci.');const old=chars.find(c=>c.id===editingId);const c={id:editingId||crypto.randomUUID(),name,description:$('desc').value.trim(),chance,image:pendingImage||old?.image};await putChar(c);chars=await allChars();resetForm();renderList();};
$('cancelEdit').onclick=resetForm;
$('finishEdit').onclick=()=>{if(!chars.length)return alert('Dodaj przynajmniej jedną postać.');setSetting('configured',true).then(showApp);};
$('editTop').onclick=$('editBottom').onclick=showEditor;

function renderCollection(){const box=$('collection');box.innerHTML='';$('totalCount').textContent=`${chars.length} postaci`;for(const c of chars){const el=document.createElement('div');el.className='item';const url=imgURL(c.image);el.innerHTML=`${url?`<img src="${url}">`:''}<div class="meta"><strong>${esc(c.name)}</strong><p>${esc(c.description||'')}</p><p>Waga: ${c.chance}</p></div>`;box.append(el);}}
function weightedPick(){const sum=chars.reduce((a,c)=>a+c.chance,0);let n=Math.random()*sum;for(const c of chars){n-=c.chance;if(n<0)return c;}return chars[chars.length-1];}
function nextEight(){const d=new Date();d.setDate(d.getDate()+1);d.setHours(8,0,0,0);return d.getTime();}
function fmt(ms){const s=Math.max(0,Math.floor(ms/1000));return [Math.floor(s/3600),Math.floor(s%3600/60),s%60].map(x=>String(x).padStart(2,'0')).join(':');}
function updateLock(){const locked=Date.now()<nextAllowed;$('drawBtn').disabled=locked;$('countdownWrap').classList.toggle('hidden',!locked);$('lockInfo').textContent=locked?'Losowanie zostało już wykorzystane. Wróć jutro o 08:00.':'Po losowaniu kolejna próba będzie dostępna następnego dnia o 08:00.';$('status').textContent=locked?'Dzisiejsze losowanie wykorzystane':'Gotowy do losowania';if(timer)clearInterval(timer);if(locked){const tick=()=>{const left=nextAllowed-Date.now();if(left<=0){clearInterval(timer);updateLock();return;}$('countdown').textContent=fmt(left);};tick();timer=setInterval(tick,1000);}}
async function draw(){if(Date.now()<nextAllowed)return;if(!chars.length)return alert('Najpierw dodaj postacie.');$('drawBtn').disabled=true;$('status').textContent='Losowanie w toku…';const result=$('result');const start=Date.now(),duration=2600;let interval=setInterval(()=>{const c=chars[Math.floor(Math.random()*chars.length)];result.innerHTML=`<img class="spinning" src="${imgURL(c.image)}"><h2>${esc(c.name)}</h2>`;},100);setTimeout(async()=>{clearInterval(interval);const winner=weightedPick();result.innerHTML=`<img src="${imgURL(winner.image)}" alt="${esc(winner.name)}"><h2>${esc(winner.name)}</h2><p class="muted">${esc(winner.description||'')}</p>`;nextAllowed=nextEight();await setSetting('nextAllowed',nextAllowed);updateLock();},duration);}
$('drawBtn').onclick=draw;
$('exportData').onclick=async()=>{const payload={version:1,characters:chars.map(c=>({...c,imageData:null}))};for(let i=0;i<chars.length;i++){payload.characters[i].imageData=await readFile(chars[i].image);}const blob=new Blob([JSON.stringify(payload)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='losowacz-kopia.json';a.click();URL.revokeObjectURL(a.href);};
$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!Array.isArray(data.characters))throw Error('Nieprawidłowy plik kopii.');for(const c of data.characters){const blob=c.imageData?await (await fetch(c.imageData)).blob():null;if(!blob)continue;await putChar({id:c.id||crypto.randomUUID(),name:c.name||'Postać',description:c.description||'',chance:Number(c.chance)||1,image:blob});}chars=await allChars();renderList();alert('Import zakończony.');}catch(err){alert('Nie udało się zaimportować: '+err.message);}e.target.value='';};
(async()=>{try{db=await openDB();chars=await allChars();nextAllowed=await getSetting('nextAllowed',0);const configured=await getSetting('configured',false);if(configured&&chars.length)showApp();else showEditor();if('serviceWorker'in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(()=>{});}catch(e){alert('Nie udało się uruchomić lokalnej bazy danych: '+e.message);}})();
