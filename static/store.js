"use strict";
// Al data ligger i IndexedDB på enheden. Intet sendes nogen steder hen.
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i;

const Store = (() => {
  let dbp;
  const open = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("recimoi", 2);
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const name of ["posts", "categories", "shopping"])
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = async (n, mode = "readonly") => (await open()).transaction(n, mode).objectStore(n);
  const all = async (n) => req((await st(n)).getAll());
  const get = async (n, id) => req((await st(n)).get(id));
  const put = async (n, v) => req((await st(n, "readwrite")).put(v));
  const del = async (n, id) => req((await st(n, "readwrite")).delete(id));
  const clear = async (n) => req((await st(n, "readwrite")).clear());

  const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
  const fold = (s) => (s || "").toLocaleLowerCase("da");

  // Opslag gemt før opskriftsformatet fandtes får deres felter foreslået ud fra teksten.
  function normalize(r) {
    if (!r || Array.isArray(r.ingredients)) return r;
    const p = parseCaption(r.text);
    return { ...r, title: p.title, servings: p.servings, ingredients: p.ingredients, steps: p.steps };
  }

  const nameTaken = (cats, name, exceptId) =>
    cats.some((c) => c.id !== exceptId && fold(c.name) === fold(name));

  return {
    // ---- kategorier
    async categories() {
      const [cats, recs] = await Promise.all([all("categories"), all("posts")]);
      cats.sort((a, b) => a.name.localeCompare(b.name, "da"));
      return {
        categories: cats.map((c) => ({ ...c, count: recs.filter((r) => r.category_id === c.id).length })),
        uncategorized: recs.filter((r) => r.category_id == null).length,
        total: recs.length,
      };
    },
    async addCategory(name) {
      name = name.trim();
      const cats = await all("categories");
      const hit = cats.find((c) => fold(c.name) === fold(name));
      if (hit) return hit;
      const c = { name };
      c.id = await put("categories", c);
      return c;
    },
    async renameCategory(id, name) {
      name = name.trim();
      if (nameTaken(await all("categories"), name, id)) throw new Error("Der findes allerede en kategori med det navn");
      await put("categories", { id, name });
    },
    async deleteCategory(id) {
      for (const r of await all("posts"))
        if (r.category_id === id) await put("posts", { ...r, category_id: null });
      await del("categories", id);
    },

    // ---- opskrifter
    async recipes({ category = "all", q = "" } = {}) {
      let list = (await all("posts")).map(normalize);
      if (category === "none") list = list.filter((r) => r.category_id == null);
      else if (category !== "all") list = list.filter((r) => r.category_id === Number(category));
      for (const w of q.split(/\s+/).filter(Boolean)) {
        const f = fold(w);
        list = list.filter((r) => fold([r.title, r.author, r.text, ...r.ingredients].join(" ")).includes(f));
      }
      return list.sort((a, b) => b.id - a.id);
    },
    recipe: async (id) => normalize(await get("posts", id)),
    async saveRecipe(r) {
      const m = IG_RE.exec(r.url || "");
      const rec = { category_id: null, author: "", text: "", created: now(), ...r, shortcode: m ? m[2] : r.shortcode || "" };
      rec.id = await put("posts", rec);
      return rec;
    },
    deleteRecipe: (id) => del("posts", id),
    async addShared({ input, caption = "", author = "" }) {
      const m = IG_RE.exec(input || "");
      if (!m) throw new Error("Fandt intet Instagram-link (p/reel/tv).");
      const kind = m[1].toLowerCase().startsWith("reel") ? "reel" : m[1].toLowerCase();
      const found = (await all("posts")).find((r) => r.shortcode === m[2]);
      if (found) {
        if (caption && !found.text) { // fx delt fra Android først, derefter fra iPhone med tekst
          Object.assign(found, { text: caption, author: found.author || author }, found.ingredients?.length ? {} : parseCaption(caption));
          await put("posts", found);
        }
        return { recipe: normalize(found), existing: true };
      }
      const p = parseCaption(caption);
      const recipe = await this.saveRecipe({
        url: `https://www.instagram.com/${kind}/${m[2]}/`, author, text: caption,
        title: p.title, servings: p.servings, ingredients: p.ingredients, steps: p.steps,
      });
      return { recipe, existing: false };
    },

    // ---- indkøbsliste
    async shopping() {
      return (await all("shopping")).sort((a, b) => a.checked - b.checked || a.created - b.created);
    },
    async addToShopping(lines, from = "") {
      const items = await all("shopping");
      let added = 0;
      for (const line of lines) {
        if (!line.trim() || /:$/.test(line.trim())) continue; // fx "Dressing:"
        const ing = parseIngredient(line);
        const key = fold(ing.name) + "|" + ing.unit;
        const hit = items.find((i) => !i.checked && i.key === key);
        if (hit && ((hit.qty != null && ing.qty != null) || (hit.qty == null && ing.qty == null))) {
          if (hit.qty != null) hit.qty += ing.qty;
          if (from && !hit.from.includes(from)) hit.from.push(from);
          await put("shopping", hit);
        } else {
          const item = { ...ing, key, checked: false, from: from ? [from] : [], created: Date.now() + added };
          item.id = await put("shopping", item);
          items.push(item);
        }
        added++;
      }
      return added;
    },
    async toggleItem(id) {
      const it = await get("shopping", id);
      it.checked = !it.checked;
      await put("shopping", it);
    },
    deleteItem: (id) => del("shopping", id),
    async clearShopping(onlyChecked) {
      for (const it of await all("shopping")) if (!onlyChecked || it.checked) await del("shopping", it.id);
    },
    openItems: async () => (await all("shopping")).filter((i) => !i.checked).length,

    // ---- backup
    async exportAll() {
      return { app: "recimoi", version: 2, categories: await all("categories"), posts: await all("posts"), shopping: await all("shopping") };
    },
    async importAll(data) {
      if (!data || !Array.isArray(data.posts) || !Array.isArray(data.categories)) throw new Error("Ugyldig backup-fil");
      for (const n of ["categories", "posts", "shopping"]) await clear(n);
      for (const c of data.categories) await put("categories", { id: c.id, name: c.name });
      for (const r of data.posts) await put("posts", r);
      for (const s of data.shopping || []) await put("shopping", s);
    },
  };
})();
