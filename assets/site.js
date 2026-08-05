
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
async function sendToSufler(){
  var sel = getSelected();
  if(!sel.length){ toast('Ничего не выбрано', true); return; }
  toast('Собираю тексты на суфлёр (' + sel.length + ')...');
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
  if(!parts.length){ toast('Нет текста ни у одного выбранного', true); return; }
  var blob = new Blob([parts.join('\n\n')], {type:'text/plain;charset=utf-8'});
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'na_sufler_' + Date.now() + '.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast(errors ? ('Отправлено, но ' + errors + ' из ' + sel.length + ' без текста') : 'Отправлено на суфлёр ✓ (суфлёр должен быть открыт на компе)', errors > 0);
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
document.addEventListener('DOMContentLoaded', function(){
  restoreSelUI();
  sortCards('desc');
  highlightFromHash();
});
