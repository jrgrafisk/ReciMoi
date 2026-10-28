"use strict";
const $ = (id) => document.getElementById(id);
const view = $("view");
const state = { cats: [], counts: {}, filter: "all", q: "" };

function el(tag, props = {}, ...kids) {
  const e = Object.assign(document.createElement(tag), props);
  e.append(...kids.flat().filter((k) => k != null && k !== false));
  return e;
}
const btn = (label, onclick, className = "link") => el("button", { type: "button", className, onclick }, label);

let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 3500);
}

const fmtDate = (s) => new Date(s.replace(" ", "T") + "Z").toLocaleDateString("da-DK");
const titleOf = (r) => r.title || (r.author ? "Opslag fra @" + r.author : "Uden titel");
const go = (hash) => { location.hash = hash; };

async function loadCats() {
  const d = await Store.categories();
  state.cats = d.categories;
  state.counts = { all: d.total, none: d.uncategorized };
}

async function updateBadge() {
  const n = await Store.openItems();
  $("badge").textContent = n;
  $("badge").hidden = !n;
}

// ---------------------------------------------------------------- opskriftsliste
async function renderList() {
  await loadCats();
  const input = el("input", { type: "text", inputMode: "url", placeholder: "Indsæt Instagram-link…", ariaLabel: "Instagram-link" });
  const add = el("form", { autocomplete: "off" }, input, el("button", { type: "submit" }, "Gem"));
  add.onsubmit = async (e) => {
    e.preventDefault();
    try {
      const { recipe, existing } = await Store.addShared({ input: input.value });
      input.value = "";
      if (existing) toast("Det opslag var allerede gemt");
      openAfterSave(recipe, existing);
    } catch (err) {
      toast(err.message);
    }
  };
  const search = el("input", { type: "search", placeholder: "Søg i opskrifter og ingredienser…", ariaLabel: "Søg", value: state.q });
  let timer;
  search.oninput = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.q = search.value.trim(); loadList(); }, 200);
  };
  const chips = el("nav", { id: "chips", ariaLabel: "Kategorier" });
  const list = el("main", { id: "list" });
  const footer = el("footer", {},
    el("p", { className: "muted" }, "Data gemmes kun på denne enhed."),
    btn("Rediger kategorier", openCatManager), " · ",
    btn("Download backup", downloadBackup), " · ",
    btn("Gendan backup", () => $("import").click()), " · ",
    el("a", { href: "ios.html" }, "iPhone-genvej"));
  view.replaceChildren(el("header", {}, add, search, chips), list, footer);
  renderChips();
  await loadList();
}

function renderChips() {
  const nav = $("chips");
  if (!nav) return;
  const chip = (key, label, count) => {
    nav.append(btn([label, count != null ? el("small", {}, String(count)) : null], () => {
      state.filter = key;
      renderChips();
      loadList();
    }, "chip" + (state.filter === key ? " on" : "")));
  };
  nav.replaceChildren();
  chip("all", "Alle", state.counts.all);
  state.cats.forEach((c) => chip(String(c.id), c.name, c.count));
  if (state.counts.none) chip("none", "Uden kategori", state.counts.none);
}

async function loadList() {
  const list = $("list");
  if (!list) return;
  const recs = await Store.recipes({ category: state.filter, q: state.q });
  const catName = (id) => state.cats.find((c) => c.id === id)?.name;
  list.replaceChildren(...recs.map((r) => el("a", { className: "card", href: "#/r/" + r.id },
    el("div", { className: "thumb" }, r.kind === "reel" ? "▶" : "🍽"),
    el("div", { className: "body" },
      el("div", { className: "title" }, titleOf(r)),
      el("div", { className: "muted" }, [
        r.author && "@" + r.author,
        catName(r.category_id),
        r.ingredients.length ? r.ingredients.length + " ingredienser" : "ingen ingredienser endnu",
      ].filter(Boolean).join(" · "))))));
  if (!recs.length)
    list.append(el("p", { className: "empty" }, state.counts.all ? "Ingen opskrifter matcher."
      : "Ingen opskrifter endnu. Del et opslag fra Instagram, indsæt et link ovenfor, eller tryk ＋ Ny."));
}

// ---------------------------------------------------------------- én opskrift
async function renderRecipe(id) {
  const r = await Store.recipe(id);
  if (!r) return go("#/");
  await loadCats();

  const sel = el("select", { ariaLabel: "Kategori" }, el("option", { value: "" }, "Uden kategori"),
    state.cats.map((c) => el("option", { value: c.id, selected: c.id === r.category_id }, c.name)));
  sel.onchange = async () => {
    r.category_id = sel.value ? Number(sel.value) : null;
    await Store.saveRecipe(r);
    toast("Kategori gemt");
  };

  const ings = r.ingredients.filter((l) => l.trim());
  const toShop = btn("＋ Læg på indkøbslisten", async () => {
    const n = await Store.addToShopping(ings, titleOf(r));
    toast(n ? `${n} varer lagt på indkøbslisten` : "Ingen varer at tilføje");
    updateBadge();
  }, "small");

  const del = btn("Slet opskrift", async () => {
    if (!confirm("Slet denne opskrift?")) return;
    await Store.deleteRecipe(r.id);
    go("#/");
  }, "link danger");

  view.replaceChildren(el("article", { className: "recipe" },
    el("div", { className: "topbar" }, el("a", { href: "#/" }, "← Opskrifter"), el("a", { href: `#/r/${r.id}/edit` }, "Rediger")),
    el("h1", {}, titleOf(r)),
    el("p", { className: "muted" }, [r.author && "@" + r.author, "gemt " + fmtDate(r.created)].filter(Boolean).join(" · "),
      r.url ? [" · ", el("a", { href: r.url, target: "_blank", rel: "noopener" }, r.shortcode ? "Åbn på Instagram" : "Åbn kilde")] : null),
    el("div", { className: "row" }, sel, r.servings ? el("span", { className: "pill" }, r.servings + " portioner") : null),
    el("section", {},
      el("div", { className: "sechead" }, el("h2", {}, "Ingredienser"), ings.length ? toShop : null),
      ings.length ? el("ul", { className: "ings" }, ings.map((l) => el("li", { className: /:$/.test(l) ? "sub" : "" }, l)))
        : el("p", { className: "muted" }, "Ingen ingredienser fundet. Tryk “Rediger” for at tilføje dem.")),
    el("section", {},
      el("h2", {}, "Fremgangsmåde"),
      r.steps.length ? el("ol", { className: "steps" }, r.steps.map((s) => el("li", {}, s)))
        : el("p", { className: "muted" }, "Ingen trin fundet. Tryk “Rediger” for at tilføje dem.")),
    r.text ? el("details", {}, el("summary", {}, "Original tekst fra opslaget"), el("p", { className: "orig" }, r.text)) : null,
    el("p", {}, del)));
}

// ---------------------------------------------------------------- opret / rediger
async function renderEdit(id) {
  const r = id ? await Store.recipe(id) : { title: "", url: "", servings: null, ingredients: [], steps: [], text: "" };
  if (!r) return go("#/");
  const f = {
    title: el("input", { value: r.title || "", placeholder: "Fx Verdens bedste lasagne" }),
    url: el("input", { value: r.url || "", type: "url", placeholder: "https://…" }),
    servings: el("input", { value: r.servings || "", type: "number", min: 1, inputMode: "numeric" }),
    ingredients: el("textarea", { value: r.ingredients.join("\n"), rows: 8, placeholder: "500 g hakket oksekød\n2 dåser hakkede tomater\n1 løg" }),
    steps: el("textarea", { value: r.steps.join("\n"), rows: 8, placeholder: "Svits løg og kød.\nTilsæt tomater og lad det simre." }),
    text: el("textarea", { value: r.text || "", rows: 6 }),
  };
  const field = (label, input, hint) => el("label", { className: "field" },
    el("span", {}, label), input, hint ? el("small", { className: "muted" }, hint) : null);

  const refill = btn("Udfyld felterne ud fra teksten", () => {
    if (!f.text.value.trim()) return toast("Indsæt først teksten i feltet ovenfor");
    if ((f.ingredients.value || f.steps.value) && !confirm("Erstat titel, ingredienser og trin med forslaget?")) return;
    const p = parseCaption(f.text.value);
    f.title.value = p.title;
    f.servings.value = p.servings || "";
    f.ingredients.value = p.ingredients.join("\n");
    f.steps.value = p.steps.join("\n");
    toast("Felterne er udfyldt – ret til efter behov");
  });

  const lines = (ta) => ta.value.split("\n").map((l) => l.trim()).filter(Boolean);
  const form = el("form", { className: "edit", autocomplete: "off" },
    el("div", { className: "topbar" }, el("a", { href: id ? `#/r/${id}` : "#/" }, "← Annuller")),
    el("h1", {}, id ? "Rediger opskrift" : "Ny opskrift"),
    field("Titel", f.title),
    field("Portioner", f.servings),
    field("Ingredienser", f.ingredients, "Én pr. linje. Skriv mængden først, så kan indkøbslisten lægge dem sammen."),
    field("Fremgangsmåde", f.steps, "Ét trin pr. linje."),
    field("Link (valgfrit)", f.url),
    field("Original tekst / noter", f.text, "Indsæt fx beskrivelsen fra Instagram her."),
    el("p", {}, refill),
    el("button", { type: "submit" }, "Gem opskrift"));
  form.onsubmit = async (e) => {
    e.preventDefault();
    const saved = await Store.saveRecipe({
      ...r, title: f.title.value.trim(), url: f.url.value.trim(), servings: Number(f.servings.value) || null,
      ingredients: lines(f.ingredients), steps: lines(f.steps), text: f.text.value.trim(),
    });
    toast("Gemt");
    if (id) go("#/r/" + saved.id);
    else openAfterSave(saved, false);
  };
  view.replaceChildren(form);
}

// ---------------------------------------------------------------- indkøbsliste
async function renderShop() {
  const items = await Store.shopping();
  const input = el("input", { id: "shopInput", placeholder: "Tilføj vare, fx 2 l mælk", ariaLabel: "Tilføj vare" });
  const add = el("form", { autocomplete: "off" }, input, el("button", { type: "submit" }, "Tilføj"));
  add.onsubmit = async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    await Store.addToShopping([input.value]);
    await renderShop();
    $("shopInput").focus();
  };

  const row = (it) => {
    const cb = el("input", { type: "checkbox", checked: it.checked, ariaLabel: it.name });
    cb.onchange = async () => { await Store.toggleItem(it.id); renderShop(); };
    return el("li", { className: it.checked ? "done" : "" },
      el("label", {}, cb, el("span", {},
        it.qty != null ? el("b", {}, `${fmtQty(it.qty)}${it.unit ? " " + it.unit : ""} `) : null, it.name,
        it.from.length ? el("small", { className: "muted" }, it.from.join(", ")) : null)),
      btn("✕", async () => { await Store.deleteItem(it.id); renderShop(); }, "link x"));
  };
  const checked = items.filter((i) => i.checked).length;
  view.replaceChildren(
    el("h1", {}, "Indkøbsliste"), add,
    items.length ? el("ul", { className: "shop" }, items.map(row))
      : el("p", { className: "empty" }, "Listen er tom. Åbn en opskrift og tryk “Læg på indkøbslisten”."),
    items.length ? el("p", { className: "row" },
      checked ? btn(`Ryd afkrydsede (${checked})`, async () => { await Store.clearShopping(true); renderShop(); }) : null,
      btn("Ryd hele listen", async () => {
        if (!confirm("Ryd hele indkøbslisten?")) return;
        await Store.clearShopping(false);
        renderShop();
      }, "link danger")) : null);
  updateBadge();
}

// ---------------------------------------------------------------- kategorier
function pickCategory(recipe) {
  $("pickerInfo").textContent = titleOf(recipe);
  const assign = async (catId) => {
    recipe.category_id = catId;
    await Store.saveRecipe(recipe);
    $("picker").close();
    route();
  };
  $("pickerList").replaceChildren(...state.cats.map((c) => btn(c.name, () => assign(c.id), "")));
  $("newCat").onsubmit = async (e) => {
    e.preventDefault();
    const name = $("newCatName").value.trim();
    if (!name) return;
    const c = await Store.addCategory(name);
    $("newCatName").value = "";
    await loadCats();
    assign(c.id);
  };
  $("picker").showModal();
}
$("pickerClose").onclick = () => $("picker").close();

async function openAfterSave(recipe, existing) {
  go("#/r/" + recipe.id);
  if (existing || recipe.category_id != null) return;
  await loadCats();
  pickCategory(recipe);
}

function renderCatList() {
  $("catList").replaceChildren(...state.cats.map((c) => el("li", {},
    el("span", {}, `${c.name} (${c.count})`),
    btn("Omdøb", async () => {
      const name = prompt("Nyt navn", c.name);
      if (!name || !name.trim()) return;
      try { await Store.renameCategory(c.id, name); } catch (e) { return toast(e.message); }
      await refreshCats();
    }),
    btn("Slet", async () => {
      if (!confirm(`Slet “${c.name}”? Opskrifterne beholdes uden kategori.`)) return;
      await Store.deleteCategory(c.id);
      if (state.filter === String(c.id)) state.filter = "all";
      await refreshCats();
    }, "link danger"))));
}
async function refreshCats() {
  await loadCats();
  renderCatList();
  renderChips();
  loadList();
}
async function openCatManager() {
  await loadCats();
  renderCatList();
  $("cats").showModal();
}
$("catsClose").onclick = () => $("cats").close();
$("newCat2").onsubmit = async (e) => {
  e.preventDefault();
  const name = $("newCat2Name").value.trim();
  if (!name) return;
  await Store.addCategory(name);
  $("newCat2Name").value = "";
  await refreshCats();
};

// ---------------------------------------------------------------- backup
const BACKUP_KEY = "recimoi-last-backup";
const BACKUP_DAYS = 14;

async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await Store.exportAll(), null, 1)], { type: "application/json" });
  const stamp = new Date().toISOString().slice(0, 10);
  el("a", { href: URL.createObjectURL(blob), download: `recimoi-backup-${stamp}.json` }).click();
  try { localStorage.setItem(BACKUP_KEY, String(Date.now())); } catch {}
  $("backupNote").hidden = true;
}
$("backupNow").onclick = downloadBackup;

function maybeRemindBackup() {
  if (!state.counts.all) return;
  let last = 0;
  try { last = Number(localStorage.getItem(BACKUP_KEY)) || 0; } catch {}
  $("backupNote").hidden = Date.now() - last < BACKUP_DAYS * 864e5;
}

$("import").onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file || !confirm("Gendan backup? Det erstatter alt, der er gemt nu.")) return;
  try {
    await Store.importAll(JSON.parse(await file.text()));
    toast("Backup gendannet");
    state.filter = "all";
    if (location.hash && location.hash !== "#/") go("#/");
    else route();
    updateBadge();
  } catch (err) {
    toast(err.message);
  }
};

// ---------------------------------------------------------------- navigation
async function route() {
  const h = location.hash.slice(1) || "/";
  const tab = h === "/shop" ? "shop" : h === "/new" ? "new" : "list";
  for (const a of $("tabs").querySelectorAll("a")) a.classList.toggle("on", a.dataset.tab === tab);
  if (h !== "/") window.scrollTo(0, 0);
  let m;
  if (h === "/shop") return renderShop();
  if (h === "/new") return renderEdit(null);
  if ((m = h.match(/^\/r\/(\d+)\/edit$/))) return renderEdit(Number(m[1]));
  if ((m = h.match(/^\/r\/(\d+)$/))) return renderRecipe(Number(m[1]));
  return renderList();
}
window.addEventListener("hashchange", route);

// Fjerner &quot; osv. og Instagrams indpakning: '12 likes, 3 comments - bruger on dato: "…".'
function cleanCaption(s) {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  const m = t.value.match(/^.*? - (\S+) on [^:]{3,40}: "([\s\S]*)"\.?\s*$/);
  return m ? { author: m[1], text: m[2] } : { author: "", text: t.value };
}

(async function init() {
  const params = new URLSearchParams(location.search);
  // Delt fra Instagram (Android "Del", iPhone-genvej): ?url=…&text=…&title=…[&caption=…]
  const shared = ["url", "text", "title"].map((k) => params.get(k)).filter(Boolean).join(" ");
  const caption = cleanCaption(params.get("caption") || "");
  if (location.search) history.replaceState(null, "", location.pathname + location.hash);
  navigator.storage?.persist?.().catch(() => {});

  await loadCats();
  if (shared) {
    try {
      const { recipe, existing } = await Store.addShared({ input: shared, caption: caption.text, author: caption.author });
      history.replaceState(null, "", location.pathname + "#/r/" + recipe.id);
      await route();
      if (existing) toast("Det opslag var allerede gemt");
      else pickCategory(recipe);
    } catch (err) {
      toast(err.message);
      await route();
    }
  } else {
    await route();
  }
  updateBadge();
  maybeRemindBackup();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
