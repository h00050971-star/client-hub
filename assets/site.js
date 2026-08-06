
function toast(msg, isError){
  var el = document.getElementById('toastbox');
  if(!el){
    el = document.createElement('div');
    el.id = 'toastbox';
    el.style.cssText = 'position:fixed;bottom:70px;right:16px;background:#1c1c1c;border:1px solid #333;border-radius:8px;padding:10px 14px;font-size:13px;z-index:60;max-width:280px;';
    document.body.appendChild(el);
  }
  el.style.color = isError ? '#ff8080' : '#7ee787';
  el.textContent = msg;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function(){ el.style.display = 'none'; }, 5000);
}
function getSelected(){
  try { return JSON.parse(localStorage.getItem('selected_client_items')||'[]'); } catch(e){ return []; }
}
function setSelected(arr){ localStorage.setItem('selected_client_items', JSON.stringify(arr)); updateSelCount(); }
function clearSelection(){
  setSelected([]);
  document.querySelectorAll('.selchk').forEach(function(c){ c.checked = false; });
}
function toggleSel(sc, checked){
  var sel = getSelected();
  var i = sel.indexOf(sc);
  if(checked && i===-1) sel.push(sc);
  if(!checked && i!==-1) sel.splice(i,1);
  setSelected(sel);
}
function restoreSelUI(){
  var sel = getSelected();
  document.querySelectorAll('.selchk').forEach(function(chk){
    chk.checked = sel.indexOf(chk.dataset.sc) !== -1;
  });
  updateSelCount();
}
function updateSelCount(){
  var el = document.getElementById('selcount');
  if(el) el.textContent = getSelected().length;
}
async function downloadSelectedTranscripts(){
  var sel = getSelected();
  if(!sel.length){ toast('Ничего не выбрано', true); return; }
  toast('Собираю тексты (' + sel.length + ')...');
  var parts = [];
  var errors = 0;
  for (var i=0;i<sel.length;i++){
    var sc = sel[i];
    try {
      var res = await fetch('../media/' + sc + '_export.txt');
      var text = res.ok ? await res.text() : '(текст недоступен)';
      if(!res.ok) errors++;
      parts.push('=== ' + sc + ' ===\n' + text.trim() + '\n');
    } catch(e){
      errors++;
      parts.push('=== ' + sc + ' ===\n(ошибка загрузки)\n');
    }
  }
  var blob = new Blob([parts.join('\n')], {type:'text/plain;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'transcripts_selected.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(errors ? ('Файл скачан, но ' + errors + ' из ' + sel.length + ' без текста') : 'Файл скачан ✓', errors > 0);
}
async function _collectSelectedTexts(label){
  var sel = getSelected();
  if(!sel.length){ toast('Ничего не выбрано', true); return null; }
  toast(label + ' (' + sel.length + ')...');
  var parts = [];
  var errors = 0;
  for (var i=0;i<sel.length;i++){
    var sc = sel[i];
    try {
      var res = await fetch('../media/' + sc + '_export.txt');
      var text = res.ok ? (await res.text()).trim() : '';
      if(!res.ok || !text) errors++;
      if(text) parts.push(text);
    } catch(e){
      errors++;
    }
  }
  if(!parts.length){ toast('Нет текста ни у одного выбранного', true); return null; }
  return {text: parts.join('\n\n'), errors: errors, total: sel.length};
}
function _downloadForSufler(text, filenamePrefix){
  var blob = new Blob([text], {type:'text/plain;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filenamePrefix + '_' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function sendToSufler(){
  var res = await _collectSelectedTexts('Собираю тексты на суфлёр');
  if(!res) return;
  _downloadForSufler(res.text, 'na_sufler');
  clearSelection();
  toast(res.errors ? ('Отправлено, но ' + res.errors + ' из ' + res.total + ' без текста') : 'Отправлено на суфлёр ✓ (суфлёр должен быть открыт на компе)', res.errors > 0);
}
async function addToSufler(){
  var res = await _collectSelectedTexts('Собираю тексты для добавления в суфлёр');
  if(!res) return;
  _downloadForSufler(res.text, 'dobavit_sufler');
  clearSelection();
  toast(res.errors ? ('Добавлено, но ' + res.errors + ' из ' + res.total + ' без текста') : 'Добавлено в суфлёр ✓ (суфлёр должен быть открыт на компе)', res.errors > 0);
}
function getShotSet(){
  try { return JSON.parse(localStorage.getItem('shot_items')||'{}'); } catch(e){ return {}; }
}
function setShotLocal(key, val){
  var s = getShotSet();
  if(val) s[key] = true; else delete s[key];
  localStorage.setItem('shot_items', JSON.stringify(s));
}
function toggleShot(key, btn){
  var cur = getShotSet()[key] === true;
  var next = !cur;
  setShotLocal(key, next);
  var card = document.getElementById('card-' + key) || (btn ? btn.closest('.card') : null);
  if(!card){
    document.querySelectorAll('.card[data-shotkey]').forEach(function(c){
      if(c.dataset.shotkey === key) card = c;
    });
  }
  if(card) card.classList.toggle('shot', next);
  if(btn) btn.innerHTML = next ? '&#8635;' : '&#10005;';
  var slug = (typeof SITE_SLUG !== 'undefined') ? SITE_SLUG : 'unknown';
  var blob = new Blob([next ? 'mark' : 'unmark'], {type:'text/plain;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'snyato--client-hub--' + slug + '--' + key + '--' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(next ? 'Отмечено «Снято» ✓' : 'Метка «Снято» снята ✓');
}
function restoreShotUI(){
  var shots = getShotSet();
  document.querySelectorAll('.card[data-shotkey]').forEach(function(card){
    var key = card.dataset.shotkey;
    if(!(key in shots)) return;
    var next = shots[key] === true;
    card.classList.toggle('shot', next);
    var btn = card.querySelector('.shotbtn');
    if(btn) btn.innerHTML = next ? '&#8635;' : '&#10005;';
  });
}
var _refIndexCache = null;
async function getRefIndex(){
  if(_refIndexCache) return _refIndexCache;
  var base = location.pathname.includes('/pages/') ? '../' : '';
  try {
    var res = await fetch(base + 'assets/ref_index.json');
    _refIndexCache = res.ok ? await res.json() : {};
  } catch(e){ _refIndexCache = {}; }
  return _refIndexCache;
}
async function searchByRefCode(){
  var input = document.getElementById('refcodeInput');
  var val = (input.value || '').trim().toUpperCase();
  if(!val){ toast('Введи код, например CLI-00042', true); return; }
  var idx = await getRefIndex();
  var info = idx[val];
  if(!info){ toast('Код не найден: ' + val, true); return; }
  var base = location.pathname.includes('/pages/') ? '' : 'pages/';
  location.href = base + info.page + '#card-' + val;
}
function highlightFromHash(){
  if(location.hash && location.hash.indexOf('#card-') === 0){
    var el = document.querySelector(location.hash);
    if(el){
      el.scrollIntoView({behavior:'smooth', block:'center'});
      el.classList.add('hl');
      setTimeout(function(){ el.classList.remove('hl'); }, 4000);
    } else {
      toast('Карточка ' + location.hash.replace('#card-','') + ' не найдена на этой странице', true);
    }
  }
}
function toggleAccordion(key){
  document.querySelectorAll('[id^="acc-"]').forEach(function(el){
    if (el.id.indexOf('acc-idx-') === 0) return;
    var k = el.id.replace('acc-', '');
    var label = document.getElementById('label-' + k);
    var open = (k === key);
    el.classList.toggle('collapsed', !open);
    if(label){
      var arrow = label.querySelector('.acc-arrow');
      if(arrow) arrow.textContent = open ? '▾' : '▸';
    }
  });
}
function sortCards(dir){
  var grid = document.querySelector('.grid');
  if(!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  cards.sort(function(a,b){
    var da = a.dataset.date || '';
    var db = b.dataset.date || '';
    if(dir === 'desc') return da < db ? 1 : (da > db ? -1 : 0);
    return da > db ? 1 : (da < db ? -1 : 0);
  });
  cards.forEach(function(c){ grid.appendChild(c); });
  var descBtn = document.getElementById('sort-desc');
  var ascBtn = document.getElementById('sort-asc');
  if(descBtn) descBtn.classList.toggle('active', dir === 'desc');
  if(ascBtn) ascBtn.classList.toggle('active', dir === 'asc');
}
function sortByShot(mode){
  var grid = document.querySelector('.grid');
  if(!grid) return;
  var cards = Array.prototype.slice.call(grid.children);
  cards.sort(function(a,b){
    var sa = a.classList.contains('shot') ? 1 : 0;
    var sb = b.classList.contains('shot') ? 1 : 0;
    return mode === 'shot' ? (sb - sa) : (sa - sb);
  });
  cards.forEach(function(c){ grid.appendChild(c); });
  var unshotBtn = document.getElementById('sort-unshot');
  var shotBtn = document.getElementById('sort-shot');
  if(unshotBtn) unshotBtn.classList.toggle('active', mode === 'unshot');
  if(shotBtn) shotBtn.classList.toggle('active', mode === 'shot');
}
document.addEventListener('DOMContentLoaded', function(){
  restoreSelUI();
  restoreShotUI();
  sortCards('desc');
  highlightFromHash();
});
