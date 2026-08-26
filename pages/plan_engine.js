/* Общий движок контент-планов.
   Страница задаёт window.PLAN_CONFIG = {key, title, sub, nav:[[href,label],...]}
   Файл данных задаёт window.PLAN_META = {kinds:[{k,label,emoji,color,service}]}
                    и window.PLAN_DAYS = [{d,w,items:[{k,h,s}]}]
   Ключи localStorage строятся из PLAN_CONFIG.key, поэтому планы не мешают друг другу. */
(function () {
"use strict";

var CFG   = window.PLAN_CONFIG || { key: "plan", title: "Контент-план", sub: "" };
var META  = window.PLAN_META || { kinds: [] };
var DAYS  = window.PLAN_DAYS || [];
var KINDS = META.kinds || [];

var K_DONE  = CFG.key + "_plan_done";
var K_OWN   = CFG.key + "_plan_custom";
var K_EDITS = CFG.key + "_plan_edits";

var KIND = {};
KINDS.forEach(function (x) { KIND[x.k] = x; });

function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key) || fallback); } catch (e) { return JSON.parse(fallback); }
}
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {} }

var done  = load(K_DONE, "{}");
var own   = load(K_OWN, "{}");
var edits = load(K_EDITS, "{}");
var sel   = {};
var currentFilter = "all";

/* ---------- общая для всех планов синхронизация через GitHub ----------
   localStorage остаётся мгновенным локальным кэшем (быстрая отрисовка),
   а pages/{key}_plan_state.json в репозитории - источник правды, который
   видят все, с любого браузера/устройства. */
var GH_OWNER = "h00050971-star";
var GH_REPO  = "client-hub";
var GH_PATH  = "pages/" + CFG.key + "_plan_state.json";
var GH_API   = "https://api.github.com/repos/" + GH_OWNER + "/" + GH_REPO + "/contents/" + GH_PATH;
var GH_TOKEN_KEY = "gh_pat_client_hub";
var ghSha = null;
var pendingSaves = 0;
window.addEventListener("beforeunload", function (e) {
  if (pendingSaves > 0) { e.preventDefault(); e.returnValue = ""; }
});

function ghToken(promptIfMissing) {
  var t = localStorage.getItem(GH_TOKEN_KEY);
  if (!t && promptIfMissing) {
    t = window.prompt("Нужен GitHub-токен (fine-grained PAT на репозиторий client-hub, права Contents: Read & Write), чтобы карточки видели все, а не только этот браузер:");
    if (t) localStorage.setItem(GH_TOKEN_KEY, t.trim());
  }
  return t ? t.trim() : "";
}
function b64ToUtf8(b64) {
  var bin = atob(b64.replace(/\n/g, ""));
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder("utf-8").decode(bytes);
}
function utf8ToB64(str) {
  var bytes = new TextEncoder().encode(str), bin = "";
  bytes.forEach(function (b) { bin += String.fromCharCode(b); });
  return btoa(bin);
}
function ghFetchState(cb) {
  fetch(GH_API, { headers: { "Accept": "application/vnd.github+json" }, cache: "no-store" })
    .then(function (r) {
      if (r.status === 404) { ghSha = null; return null; }
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      if (!data) { cb && cb(null); return; }
      ghSha = data.sha;
      cb && cb(JSON.parse(b64ToUtf8(data.content)));
    })
    .catch(function (e) { console.warn("gh fetch failed", e); cb && cb(null); });
}
function ghSaveState() {
  var token = ghToken(true);
  if (!token) { toast("Не сохранил в общий доступ - нет токена (сохранено только локально)", true); return; }
  pendingSaves++;
  toast("⏳ Сохраняю для всех... не обновляй страницу");
  var payload = JSON.stringify({ done: done, own: own, edits: edits }, null, 1);
  function doPut(sha) {
    return fetch(GH_API, {
      method: "PUT",
      headers: { "Authorization": "Bearer " + token, "Accept": "application/vnd.github+json" },
      body: JSON.stringify({ message: "plan update: " + CFG.key, content: utf8ToB64(payload), sha: sha || undefined, branch: "main" })
    });
  }
  doPut(ghSha).then(function (r) {
    if (r.status === 409 || r.status === 422) {
      return fetch(GH_API, { headers: { "Accept": "application/vnd.github+json" } })
        .then(function (r2) { return r2.json(); })
        .then(function (data2) { ghSha = data2.sha; return doPut(ghSha); });
    }
    return r;
  }).then(function (r) {
    if (!r.ok) return r.json().then(function (e) { throw new Error(e.message || r.status); });
    return r.json();
  }).then(function (data) {
    if (data && data.content) ghSha = data.content.sha;
    toast("☁️ Сохранено для всех - можно обновлять");
  }).catch(function (e) {
    toast("Не сохранил в общий доступ: " + e.message, true);
  }).finally(function () {
    pendingSaves--;
  });
}

function esc(t) {
  return String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function emoji(k) { return (KIND[k] || {}).emoji || "•"; }
function label(k) { return (KIND[k] || {}).label || k; }
function color(k) { return (KIND[k] || {}).color || "#444"; }
function isService(k) { return !!(KIND[k] || {}).service; }

function tileMediaHtml(media) {
  if (!media) return "";
  if (media.type === "video" && media.url) {
    return '<div class="tile-media"><video controls preload="metadata" src="' + esc(media.url) + '"></video></div>';
  }
  if (media.type === "images" && media.urls && media.urls.length) {
    if (media.urls.length === 1) {
      return '<div class="tile-media"><img class="tile-img-single" src="' + esc(media.urls[0]) + '"></div>';
    }
    return '<div class="tile-media"><div class="thumbs-row">'
      + media.urls.map(function (u) { return '<img src="' + esc(u) + '">'; }).join("")
      + "</div></div>";
  }
  if (media.type === "missing") {
    return '<div class="tile-media tile-media-missing">&#9888;&#65039; медиа не загрузилось - скажи автору догрузить</div>';
  }
  return "";
}

/* ---------- каркас страницы ---------- */
function shell() {
  var navHtml = (CFG.nav || []).map(function (n) {
    return '<a href="' + esc(n[0]) + '">' + esc(n[1]) + '</a>';
  }).join("");

  var filterBtns = '<button data-f="all" class="active">Все</button>'
    + KINDS.map(function (x) {
        return '<button data-f="' + x.k + '">' + x.emoji + " " + esc(x.label) + "</button>";
      }).join("");

  var legend = KINDS.filter(function (x) { return x.hint; }).map(function (x) {
    return '<span><b style="color:' + x.color + '">' + x.emoji + " " + esc(x.label)
         + "</b> " + esc(x.hint) + "</span>";
  }).join("");

  document.body.innerHTML =
      '<div><h1>' + esc(CFG.title) + '</h1><p class="sub">' + esc(CFG.sub || "") + '</p></div>'
    + '<nav>' + navHtml + '</nav>'
    + '<div class="panel">'
    +   '<div class="filters">' + filterBtns
    +     '<span class="counter">Снято: <b id="doneCount">0</b> из <span id="totalCount">0</span></span>'
    +   '</div>'
    +   (legend ? '<div class="legend">' + legend + '</div>' : '')
    +   '<div class="toolrow">'
    +     '<button onclick="selectAllVisible()">Выбрать всё видимое</button>'
    +     '<button onclick="expandAll(true)">Раскрыть все сценарии</button>'
    +     '<button onclick="expandAll(false)">Свернуть все</button>'
    +     '<button onclick="downloadAll()">Скачать весь план txt</button>'
    +   '</div>'
    + '</div>'
    + '<div class="daygrid" id="grid"></div>'
    + '<div class="selbar" id="selbar">Выбрано: <span id="selCount">0</span>'
    +   '<button onclick="downloadSelected()">Скачать txt</button>'
    +   '<button class="teleprompter" onclick="sendToSufler()">На суфлёр</button>'
    +   '<button class="teleprompter" onclick="addToSufler()">Добавить в суфлёр</button>'
    +   '<button class="secondary" onclick="clearSelection()">Сбросить</button>'
    + '</div>'
    + '<div id="toastbox"></div>';

  document.querySelectorAll(".filters button").forEach(function (b) {
    b.addEventListener("click", function () {
      document.querySelectorAll(".filters button").forEach(function (x) {
        x.classList.remove("active"); x.style.color = ""; x.style.borderColor = "";
      });
      b.classList.add("active");
      var f = b.dataset.f;
      if (f !== "all") { b.style.color = color(f); b.style.borderColor = color(f); }
      applyFilter(f);
    });
  });
}

/* ---------- тосты ---------- */
var toastTimer = null;
function toast(msg, isError) {
  var el = document.getElementById("toastbox");
  el.textContent = msg;
  el.classList.toggle("err", !!isError);
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.classList.remove("show"); }, isError ? 5000 : 3500);
}

/* ---------- данные дня с учётом правок ---------- */
function itemsFor(day) {
  var list = (day.items || []).map(function (it, i) {
    var id = day.d + "_" + i, e = edits[id];
    return {
      id: id, k: it.k, own: false,
      h: e && e.h != null ? e.h : it.h,
      s: e && e.s != null ? e.s : it.s,
      edited: !!e
    };
  });
  (own[day.d] || []).forEach(function (o, i) {
    list.push({ id: day.d + "_own" + i, k: o.k || "own", h: o.h, s: o.s, own: true, oi: i, media: o.media || null });
  });
  return list;
}

function kindOptions(selected) {
  return KINDS.map(function (x) {
    return '<option value="' + x.k + '"' + (x.k === selected ? " selected" : "") + ">"
         + x.emoji + " " + esc(x.label) + "</option>";
  }).join("");
}

/* ---------- отрисовка ---------- */
function render() {
  var out = "", num = 0, total = 0;

  DAYS.forEach(function (day) {
    var list = itemsFor(day);
    total += list.length;

    var tiles = list.map(function (it) {
      num++;
      var cls = "tile" + (isService(it.k) ? " service" : "") + (it.s ? "" : " empty-script")
              + (done[it.id] ? " done" : "") + (sel[it.id] ? " sel" : "");
      return '<div class="' + cls + '" data-id="' + it.id + '" data-kind="' + it.k + '"'
        + ' style="border-left-color:' + color(it.k) + '"'
        + ' data-date="' + day.d + '"'
        + (it.own ? ' data-oi="' + it.oi + '"' : "") + ">"
        + '<div class="trow">'
        +   '<span class="num">' + num + "</span>"
        +   '<span class="kind-badge" style="color:' + color(it.k) + ";border-color:" + color(it.k) + '">'
        +     emoji(it.k) + " " + esc(label(it.k)) + "</span>"
        +   (it.edited ? '<span class="edited-badge">изменён</span>' : "")
        +   (done[it.id] ? '<span class="shot-badge">СНЯТО</span>' : "")
        +   '<span class="spacer"></span>'
        +   '<button class="minibtn edit" title="Редактировать" onclick="openEdit(this)">✎</button>'
        +   '<button class="minibtn dup" title="Дублировать карточку" onclick="dupTile(this)">⧉</button>'
        +   (it.own ? '<button class="minibtn del" title="Удалить карточку" onclick="delOwn(\'' + day.d + "'," + it.oi + ')">🗑</button>' : "")
        +   '<button class="minibtn shot' + (done[it.id] ? " on" : "") + '" title="Отметить снятым" onclick="toggleDone(this)">✕</button>'
        +   '<span class="chk" title="Выбрать" onclick="toggleSel(this)"></span>'
        + "</div>"
        + '<span class="hook" onclick="toggleScript(this)"><span class="em">' + emoji(it.k) + "</span>" + esc(it.h) + "</span>"
        + tileMediaHtml(it.media)
        + (it.s ? '<button class="more" onclick="toggleScript(this)">Подробнее ▾</button>'
                + '<div class="script">' + esc(it.s) + "</div>"
                : '<span class="fillhint">текст впишем сами, жми ✎</span>')
        + '<div class="editform">'
        +   '<select class="ed-k">' + kindOptions(it.k) + "</select>"
        +   '<input type="text" class="ed-h" value="' + esc(it.h) + '" placeholder="Хук">'
        +   '<textarea class="ed-s" rows="8" placeholder="Сценарий">' + esc(it.s || "") + "</textarea>"
        +   '<div class="btns">'
        +     '<button onclick="saveEdit(this)">Сохранить</button>'
        +     '<button class="cancel" onclick="closeEdit(this)">Отмена</button>'
        +     (it.edited ? '<button class="revert" onclick="revertEdit(this)">Вернуть исходный</button>' : "")
        +   "</div>"
        + "</div>"
        + "</div>";
    }).join("");

    out += '<div class="day" data-date="' + day.d + '">'
      + '<div class="day-head">'
      +   '<span class="day-date">' + day.d + '</span><span class="day-dow">' + day.w + "</span>"
      +   '<span class="day-count">' + list.length + " шт</span>"
      +   '<button class="addbtn" title="Добавить карточку" onclick="openAdd(\'' + day.d + '\')">+</button>'
      + "</div>"
      + '<div class="addform" id="add_' + day.d + '">'
      +   '<select id="addk_' + day.d + '">' + kindOptions(KINDS.length ? KINDS[0].k : "own") + "</select>"
      +   '<input type="text" placeholder="Хук (первая фраза)" id="addh_' + day.d + '">'
      +   '<textarea rows="4" placeholder="Сценарий целиком (можно оставить пустым)" id="adds_' + day.d + '"></textarea>'
      +   '<div class="btns"><button onclick="saveOwn(\'' + day.d + '\')">Сохранить</button>'
      +   '<button class="cancel" onclick="closeAdd(\'' + day.d + '\')">Отмена</button></div>'
      + "</div>"
      + (list.length ? '<div class="tiles">' + tiles + "</div>"
                     : '<div class="tiles"></div><div class="day-empty">пусто, добавь карточку через +</div>');
    out += "</div>";
  });

  document.getElementById("grid").innerHTML = out;
  document.getElementById("totalCount").textContent = total;
  refreshCounters();
  applyFilter(currentFilter);
}

function refreshCounters() {
  var n = 0, k;
  for (k in done) if (done[k]) n++;
  document.getElementById("doneCount").textContent = n;
  var s = 0;
  for (k in sel) if (sel[k]) s++;
  document.getElementById("selCount").textContent = s;
  document.getElementById("selbar").classList.toggle("show", s > 0);
}

function tileOf(el) { return el.closest(".tile"); }

/* ---------- действия ---------- */
function toggleDone(btn) {
  var t = tileOf(btn), id = t.dataset.id;
  done[id] = !done[id];
  save(K_DONE, done);
  render();
  ghSaveState();
}

function toggleSel(el) {
  var t = tileOf(el), id = t.dataset.id;
  sel[id] = !sel[id];
  t.classList.toggle("sel", !!sel[id]);
  refreshCounters();
}

function toggleScript(el) {
  var t = tileOf(el), sc = t.querySelector(".script");
  if (!sc || t.classList.contains("editing")) return;
  var open = sc.classList.toggle("open");
  var mb = t.querySelector(".more");
  if (mb) mb.textContent = open ? "Свернуть ▴" : "Подробнее ▾";
}

function expandAll(open) {
  document.querySelectorAll(".tile").forEach(function (t) {
    var sc = t.querySelector(".script");
    if (!sc) return;
    sc.classList.toggle("open", open);
    var mb = t.querySelector(".more");
    if (mb) mb.textContent = open ? "Свернуть ▴" : "Подробнее ▾";
  });
}

function openEdit(btn) {
  var t = tileOf(btn);
  t.classList.add("editing");
  t.querySelector(".editform").classList.add("open");
  t.querySelector(".ed-h").focus();
}
function closeEdit(btn) {
  var t = tileOf(btn);
  t.classList.remove("editing");
  t.querySelector(".editform").classList.remove("open");
  render();
}
function saveEdit(btn) {
  var t = tileOf(btn), id = t.dataset.id;
  var h = t.querySelector(".ed-h").value.trim();
  var s = t.querySelector(".ed-s").value.trim();
  var k = t.querySelector(".ed-k").value;
  if (!h) { toast("Хук не может быть пустым", true); return; }
  if (t.dataset.oi !== undefined) {
    var prevMedia = (own[t.dataset.date][+t.dataset.oi] || {}).media || null;
    own[t.dataset.date][+t.dataset.oi] = { k: k, h: h, s: s, media: prevMedia };
    save(K_OWN, own);
  } else {
    edits[id] = { h: h, s: s };
    save(K_EDITS, edits);
  }
  render();
  toast("Сохранено ✓");
  ghSaveState();
}
function revertEdit(btn) {
  var t = tileOf(btn), id = t.dataset.id;
  delete edits[id];
  save(K_EDITS, edits);
  render();
  toast("Вернул исходный текст");
  ghSaveState();
}

function applyFilter(f) {
  currentFilter = f;
  document.querySelectorAll(".tile").forEach(function (t) {
    t.classList.toggle("hidden", f !== "all" && t.dataset.kind !== f);
  });
  document.querySelectorAll(".day").forEach(function (d) {
    var vis = d.querySelectorAll(".tile:not(.hidden)").length;
    d.classList.toggle("empty", f !== "all" && vis === 0);
    var e = d.querySelector(".day-empty");
    if (e) e.style.display = f === "all" ? "" : "none";
  });
}

function selectAllVisible() {
  document.querySelectorAll(".tile:not(.hidden)").forEach(function (t) {
    sel[t.dataset.id] = true; t.classList.add("sel");
  });
  refreshCounters();
}
function clearSelection() {
  sel = {};
  document.querySelectorAll(".tile.sel").forEach(function (t) { t.classList.remove("sel"); });
  refreshCounters();
}

function openAdd(date) {
  document.getElementById("add_" + date).classList.add("open");
  document.getElementById("addh_" + date).focus();
}
function closeAdd(date) {
  document.getElementById("add_" + date).classList.remove("open");
  document.getElementById("addh_" + date).value = "";
  document.getElementById("adds_" + date).value = "";
}
function saveOwn(date) {
  var h = document.getElementById("addh_" + date).value.trim();
  var s = document.getElementById("adds_" + date).value.trim();
  var k = document.getElementById("addk_" + date).value;
  if (!h) { toast("Впиши хотя бы хук", true); return; }
  if (!own[date]) own[date] = [];
  own[date].push({ k: k, h: h, s: s, media: null });
  save(K_OWN, own);
  closeAdd(date);
  render();
  toast("Карточка добавлена ✓");
  ghSaveState();
}
function delOwn(date, i) {
  if (!confirm("Удалить карточку?")) return;
  own[date].splice(i, 1);
  if (!own[date].length) delete own[date];
  save(K_OWN, own);
  render();
  ghSaveState();
}

function dupTile(btn) {
  var t = tileOf(btn);
  var date = t.dataset.date;
  var k = t.dataset.kind;
  var h = t.querySelector(".ed-h").value.trim();
  var s = t.querySelector(".ed-s").value.trim();
  if (!h) { toast("Нечего дублировать - пустой хук", true); return; }
  var srcMedia = null;
  if (t.dataset.oi !== undefined && own[date] && own[date][+t.dataset.oi]) {
    srcMedia = own[date][+t.dataset.oi].media || null;
  }
  if (!own[date]) own[date] = [];
  own[date].push({ k: k, h: h, s: s, media: srcMedia });
  save(K_OWN, own);
  render();
  toast("Дубликат добавлен ✓ - поменяй тип карточки если нужно");
  ghSaveState();
}

/* ---------- выгрузка ---------- */
function collectSelected() {
  var res = [], num = 0;
  DAYS.forEach(function (day) {
    itemsFor(day).forEach(function (it) {
      num++;
      if (sel[it.id]) { it._n = num; res.push(it); }
    });
  });
  return res;
}

function buildText(onlySelected) {
  var lines = [CFG.title.toUpperCase(), CFG.sub || "", ""];
  var num = 0, taken = 0, lastDate = null;
  DAYS.forEach(function (day) {
    itemsFor(day).forEach(function (it) {
      num++;
      if (onlySelected && !sel[it.id]) return;
      taken++;
      if (lastDate !== day.d) {
        lines.push("======  " + day.d + "  (" + day.w + ")  ======", "");
        lastDate = day.d;
      }
      lines.push("[" + num + "] " + label(it.k).toUpperCase() + (done[it.id] ? "  · СНЯТО" : ""));
      lines.push("ХУК: " + it.h);
      if (it.s) lines.push("", it.s);
      lines.push("", "------------------------------------------------", "");
    });
  });
  return { text: lines.join("\n"), count: taken };
}

function buildSuflerText() {
  var picked = collectSelected();
  if (!picked.length) { toast("Ничего не выбрано", true); return null; }
  var parts = picked.map(function (it) { return it.s ? it.h + "\n\n" + it.s : it.h; });
  return { text: parts.join("\n\n\n"), count: picked.length };
}

function download(name, text) {
  var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  var a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function downloadSelected() {
  var r = buildText(true);
  if (!r.count) { toast("Ничего не выбрано", true); return; }
  download(CFG.key + "_plan_vybrannoe_" + r.count + ".txt", r.text);
  toast("Файл скачан ✓");
}
function downloadAll() {
  var r = buildText(false);
  download(CFG.key + "_plan.txt", r.text);
  toast("Весь план скачан ✓");
}

/* Вахтёр суфлёра слушает Downloads: na_sufler_*.txt заменяет текст,
   dobavit_sufler_*.txt дописывает к текущему. */
function sendToSufler() {
  var r = buildSuflerText();
  if (!r) return;
  download("na_sufler_" + Date.now() + ".txt", r.text);
  clearSelection();
  toast("Отправлено на суфлёр ✓ (" + r.count + " шт, суфлёр должен быть открыт на компе)");
}
function addToSufler() {
  var r = buildSuflerText();
  if (!r) return;
  download("dobavit_sufler_" + Date.now() + ".txt", r.text);
  clearSelection();
  toast("Добавлено в суфлёр ✓ (" + r.count + " шт, суфлёр должен быть открыт на компе)");
}

/* обработчики вызываются из разметки, поэтому живут в window */
window.toggleDone = toggleDone;
window.toggleSel = toggleSel;
window.toggleScript = toggleScript;
window.expandAll = expandAll;
window.openEdit = openEdit;
window.closeEdit = closeEdit;
window.saveEdit = saveEdit;
window.revertEdit = revertEdit;
window.selectAllVisible = selectAllVisible;
window.clearSelection = clearSelection;
window.openAdd = openAdd;
window.closeAdd = closeAdd;
window.saveOwn = saveOwn;
window.delOwn = delOwn;
window.dupTile = dupTile;
window.downloadSelected = downloadSelected;
window.downloadAll = downloadAll;
window.sendToSufler = sendToSufler;
window.addToSufler = addToSufler;

shell();
render();
ghFetchState(function (remote) {
  if (!remote) return;
  done = remote.done || {};
  own = remote.own || {};
  edits = remote.edits || {};
  save(K_DONE, done); save(K_OWN, own); save(K_EDITS, edits);
  render();
});
})();

