"use strict";
const $ = (id) => document.getElementById(id);
const state = { cats: [], counts: {}, filter: "all", q: "", highlight: null };

// "server" (python server.py), "local" (ren webapp, data i browseren) eller "down" (server utilgængelig)
let mode = "server";

async function detectMode() {
  try {
    const r = await fetch("api/categories");
    const json = (r.headers.get("content-type") || "").includes("json");
    return r.ok && json ? "server" : "local";
  } catch {
    return /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "down" : "local";
  }
}

async function api(path, method = "GET", body) {
  if (mode === "local") return localApi(path, method, body || {});
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || "Noget gik galt");
  return data;
}

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.filter((k) => k != null));
  return e;
}

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

async function loadCats() {
  const d = await api("api/categories");
  state.cats = d.categories;
  state.counts = { all: d.total, none: d.uncategorized };
  renderChips();
}

function renderChips() {
  const nav = $("chips");
  nav.replaceChildren();
  const chip = (key, label, count) => {
    const b = el("button", { className: "chip" + (state.filter === key ? " on" : ""), type: "button" }, label);
    if (count != null) b.append(el("small", {}, String(count)));
    b.onclick = () => { state.filter = key; renderChips(); loadPosts(); };
    nav.append(b);
  };
  chip("all", "Alle", state.counts.all);
  state.cats.forEach((c) => chip(String(c.id), c.name, c.count));
  if (state.counts.none) chip("none", "Uden kategori", state.counts.none);
}

async function loadPosts() {
  const p = new URLSearchParams();
  if (state.filter !== "all") p.set("category", state.filter);
  if (state.q) p.set("q", state.q);
  const posts = await api("api/posts?" + p);
  const list = $("list");
  list.replaceChildren(...posts.map(card));
  $("empty").hidden = posts.length > 0;
}

function card(p) {
  const thumb = p.thumb_url
    ? el("img", { className: "thumb", src: p.thumb_url, alt: "", loading: "lazy" })
    : el("div", { className: "thumb none" }, p.kind === "reel" ? "▶" : "▣");

  const text = el("div", { className: "text" + (p.text ? "" : " missing") }, p.text || (mode === "local" ? "Ingen tekst – tryk “Rediger” og indsæt beskrivelsen." : "Ingen tekst hentet – tryk “Hent igen” eller “Rediger”."));
  text.onclick = () => text.classList.toggle("open");

  const sel = el("select", { ariaLabel: "Kategori" }, el("option", { value: "" }, "Uden kategori"),
    ...state.cats.map((c) => el("option", { value: c.id, selected: c.id === p.category_id }, c.name)));
  sel.onchange = async () => {
    await api("api/posts/" + p.id, "PATCH", { category_id: sel.value ? Number(sel.value) : null });
    await loadCats();
    if (state.filter !== "all") loadPosts();
  };

  const open = el("a", { href: p.url, target: "_blank", rel: "noopener" }, "Åbn på Instagram");
  const edit = el("button", { className: "link", type: "button" }, "Rediger");
  edit.onclick = () => {
    const ta = el("textarea", { value: p.text });
    const save = el("button", { type: "button" }, "Gem tekst");
    save.onclick = async () => { await api("api/posts/" + p.id, "PATCH", { text: ta.value }); loadPosts(); };
    text.replaceWith(ta);
    edit.replaceWith(save);
    ta.focus();
  };
  const refetch = el("button", { className: "link", type: "button" }, "Hent igen");
  refetch.onclick = async () => {
    refetch.textContent = "Henter…";
    try { await api(`api/posts/${p.id}/refetch`, "POST", {}); } catch (e) { toast(e.message); }
    loadPosts();
  };
  const del = el("button", { className: "link danger", type: "button" }, "Slet");
  del.onclick = async () => {
    if (!confirm("Slet dette opslag og den gemte tekst?")) return;
    await api("api/posts/" + p.id, "DELETE");
    await loadCats();
    loadPosts();
  };

  const meta = el("div", { className: "meta" },
    el("span", { className: "author" }, p.author ? "@" + p.author : "Instagram"),
    el("span", { className: "muted" }, new Date(p.created.replace(" ", "T") + "Z").toLocaleDateString("da-DK")));
  const actions = el("div", { className: "actions" }, sel, open, edit, ...(p.text || mode === "local" ? [] : [refetch]), el("span", { className: "sp" }), del);

  const c = el("article", { className: "card" + (state.highlight === p.id ? " hl" : "") }, thumb, el("div", { className: "body" }, meta, text, actions));
  return c;
}

// ---- kategori-vælger (vises efter deling) ----
function pickCategory(post) {
  $("pickerInfo").textContent = (post.author ? "@" + post.author + " – " : "") + (post.text || "Opslag gemt").slice(0, 80);
  const assign = async (id) => {
    await api("api/posts/" + post.id, "PATCH", { category_id: id });
    $("picker").close();
    await loadCats();
    loadPosts();
  };
  $("pickerList").replaceChildren(...state.cats.map((c) => {
    const b = el("button", { type: "button" }, c.name);
    b.onclick = () => assign(c.id);
    return b;
  }));
  $("newCat").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("newCatName").value.trim();
    if (!name) return;
    const c = await api("api/categories", "POST", { name });
    $("newCatName").value = "";
    assign(c.id);
  };
  $("picker").showModal();
}
$("pickerClose").onclick = () => $("picker").close();

// ---- kategori-administration ----
function renderCatList() {
  $("catList").replaceChildren(...state.cats.map((c) => {
    const ren = el("button", { className: "link", type: "button" }, "Omdøb");
    ren.onclick = async () => {
      const name = prompt("Nyt navn", c.name);
      if (!name || !name.trim()) return;
      try { await api("api/categories/" + c.id, "PATCH", { name }); } catch (e) { return toast(e.message); }
      await loadCats(); renderCatList(); loadPosts();
    };
    const del = el("button", { className: "link danger", type: "button" }, "Slet");
    del.onclick = async () => {
      if (!confirm(`Slet “${c.name}”? Opslagene beholdes uden kategori.`)) return;
      await api("api/categories/" + c.id, "DELETE");
      if (state.filter === String(c.id)) state.filter = "all";
      await loadCats(); renderCatList(); loadPosts();
    };
    return el("li", {}, el("span", {}, `${c.name} (${c.count})`), ren, del);
  }));
}
$("manage").onclick = () => { renderCatList(); $("cats").showModal(); };
$("catsClose").onclick = () => $("cats").close();
$("newCat2").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("newCat2Name").value.trim();
  if (!name) return;
  await api("api/categories", "POST", { name });
  $("newCat2Name").value = "";
  await loadCats(); renderCatList(); loadPosts();
};

// ---- tilføj via indsat link ----
$("add").onsubmit = async (e) => {
  e.preventDefault();
  const input = $("addInput").value.trim();
  if (!input) return;
  const btn = e.submitter;
  btn.disabled = true;
  btn.textContent = "Henter…";
  try {
    const { post, existing } = await api("api/posts", "POST", { input });
    $("addInput").value = "";
    state.highlight = post.id;
    await loadCats();
    await loadPosts();
    if (existing) toast("Det opslag var allerede gemt");
    else if (!post.text) toast("Gemt – men teksten kunne ikke hentes. Brug “Rediger”.");
    if (!post.category_id) pickCategory(post);
  } catch (err) {
    toast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Gem";
  }
};

let searchTimer;
$("search").oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.q = e.target.value.trim(); loadPosts(); }, 200);
};

const cleanCaption = (s) => {
  const t = document.createElement("textarea");
  t.innerHTML = s; // afkod &quot; osv. fra Instagrams meta-tag
  const m = t.value.match(/^.*? - (\S+) on [^:]{3,40}: "([\s\S]*)"\.?\s*$/);
  return m ? { author: m[1], text: m[2] } : { author: "", text: t.value };
};

// ---- backup (kun lokal tilstand; serveren har sit eget endpoint) ----
const BACKUP_KEY = "recimoi-last-backup";
const BACKUP_DAYS = 14;

async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await localExport(), null, 1)], { type: "application/json" });
  const stamp = new Date().toISOString().slice(0, 10);
  el("a", { href: URL.createObjectURL(blob), download: `recimoi-backup-${stamp}.json` }).click();
  try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
  $("backupNote").hidden = true;
}

function maybeRemindBackup() {
  if (mode !== "local" || !state.counts.all) return;
  let last = 0;
  try { last = Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch {}
  $("backupNote").hidden = Date.now() - last < BACKUP_DAYS * 864e5;
}

$("export").onclick = (e) => {
  if (mode !== "local") return;
  e.preventDefault();
  downloadBackup();
};
$("backupNow").onclick = downloadBackup;
$("import").onchange = async (e) => {
  try {
    if (!confirm("Gendan backup? Det erstatter alt, der er gemt nu.")) return;
    await localImport(JSON.parse(await e.target.files[0].text()));
    await loadCats();
    loadPosts();
    toast("Backup gendannet");
  } catch (err) {
    toast(err.message);
  }
};

// ---- start ----
(async function init() {
  mode = await detectMode();
  if (mode === "down") {
    $("list").replaceChildren(el("p", { className: "muted" }, "Serveren kører ikke. Åbn Termux og start den (se README), og genindlæs siden."));
    return;
  }
  if (mode === "local") {
    $("importLbl").hidden = false;
    $("where").hidden = false;
    // Bed browseren om ikke at rydde data automatisk (virker bedst, når appen er installeret)
    navigator.storage?.persist?.().catch(() => {});
  }
  const params = new URLSearchParams(location.search);
  let newId = Number(params.get("new")) || null;
  // Delt fra Instagram (Android "Del til", iOS-genvej): ?url=…&text=…&title=…[&caption=…]
  const shared = ["url", "text", "title"].map((k) => params.get(k)).filter(Boolean).join(" ");
  let shareErr = params.get("err");
  if (shared) {
    try {
      const cap = cleanCaption(params.get("caption") || "");
      const { post } = await api("api/posts", "POST", { input: shared, text: cap.text, author: cap.author });
      newId = post.id;
    } catch { shareErr = "1"; }
  }
  await loadCats();
  state.highlight = newId;
  await loadPosts();
  maybeRemindBackup();
  if (shareErr) toast("Fandt intet Instagram-link i det, du delte.");
  if (newId) {
    const posts = await api("api/posts");
    const post = posts.find((p) => p.id === newId);
    if (post && !post.category_id) pickCategory(post);
    else if (post) toast("Det opslag var allerede gemt");
  }
  if (location.search) history.replaceState(null, "", location.pathname);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
