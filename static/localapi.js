"use strict";
// Erstatter serveren, når appen kører som ren webapp (fx på iPhone): samme API som server.py,
// men data gemmes i browserens IndexedDB på telefonen.
const IG_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(p|reels?|tv)\/([\w-]+)/i;

const LocalStore = (() => {
  let dbp;
  const open = () => (dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open("recimoi", 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore("posts", { keyPath: "id", autoIncrement: true });
      r.result.createObjectStore("categories", { keyPath: "id", autoIncrement: true });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
  const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const st = async (n, mode = "readonly") => (await open()).transaction(n, mode).objectStore(n);
  return {
    all: async (n) => req((await st(n)).getAll()),
    get: async (n, id) => req((await st(n)).get(id)),
    put: async (n, v) => req((await st(n, "readwrite")).put(v)),
    del: async (n, id) => req((await st(n, "readwrite")).delete(id)),
    clear: async (n) => req((await st(n, "readwrite")).clear()),
  };
})();

const nowStamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const withThumb = (p) => ({ ...p, thumb_url: "" });

async function localApi(path, method = "GET", body = {}) {
  const [p, qs] = path.replace(/^\//, "").split("?");
  const q = new URLSearchParams(qs || "");
  const id = Number((p.match(/\/(\d+)/) || [])[1]);

  if (p === "api/categories" && method === "GET") {
    const [cats, posts] = await Promise.all([LocalStore.all("categories"), LocalStore.all("posts")]);
    cats.sort((a, b) => a.name.localeCompare(b.name, "da"));
    return {
      categories: cats.map((c) => ({ id: c.id, name: c.name, count: posts.filter((x) => x.category_id === c.id).length })),
      uncategorized: posts.filter((x) => x.category_id == null).length,
      total: posts.length,
    };
  }
  if (p === "api/categories" && method === "POST") {
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Navn mangler");
    const cats = await LocalStore.all("categories");
    const hit = cats.find((c) => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (hit) return { id: hit.id, name: hit.name };
    return { id: await LocalStore.put("categories", { name }), name };
  }
  if (/^api\/categories\/\d+$/.test(p) && method === "PATCH") {
    const name = String(body.name || "").trim();
    if (!name) throw new Error("Navn mangler");
    const cats = await LocalStore.all("categories");
    if (cats.some((c) => c.id !== id && c.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new Error("Der findes allerede en kategori med det navn");
    await LocalStore.put("categories", { id, name });
    return { ok: true };
  }
  if (/^api\/categories\/\d+$/.test(p) && method === "DELETE") {
    for (const post of await LocalStore.all("posts"))
      if (post.category_id === id) await LocalStore.put("posts", { ...post, category_id: null });
    await LocalStore.del("categories", id);
    return { ok: true };
  }

  if (p === "api/posts" && method === "GET") {
    let posts = await LocalStore.all("posts");
    const cat = q.get("category");
    if (cat === "none") posts = posts.filter((x) => x.category_id == null);
    else if (cat) posts = posts.filter((x) => x.category_id === Number(cat));
    for (const w of (q.get("q") || "").split(/\s+/).filter(Boolean)) {
      const f = w.toLocaleLowerCase();
      posts = posts.filter((x) => (x.text + " " + x.author).toLocaleLowerCase().includes(f));
    }
    return posts.sort((a, b) => b.id - a.id).map(withThumb);
  }
  if (p === "api/posts" && method === "POST") {
    const m = IG_RE.exec(body.input || "");
    if (!m) throw new Error("Fandt intet Instagram-link (p/reel/tv).");
    const kind = m[1].toLowerCase().startsWith("reel") ? "reel" : m[1].toLowerCase();
    const code = m[2];
    const text = String(body.text || "").trim();
    const found = (await LocalStore.all("posts")).find((x) => x.shortcode === code);
    if (found) {
      if (text && !found.text) found.text = text, await LocalStore.put("posts", found);
      return { post: withThumb(found), existing: true };
    }
    const post = {
      shortcode: code, kind, url: `https://www.instagram.com/${kind}/${code}/`, author: String(body.author || ""), text,
      image_url: "", thumb: "", category_id: body.category_id ?? null, created: nowStamp(),
    };
    post.id = await LocalStore.put("posts", post);
    return { post: withThumb(post), existing: false };
  }
  if (/^api\/posts\/\d+$/.test(p) && method === "PATCH") {
    const post = await LocalStore.get("posts", id);
    if (!post) throw new Error("ikke fundet");
    if ("category_id" in body) post.category_id = body.category_id;
    if ("text" in body) post.text = String(body.text);
    await LocalStore.put("posts", post);
    return withThumb(post);
  }
  if (/^api\/posts\/\d+$/.test(p) && method === "DELETE") {
    await LocalStore.del("posts", id);
    return { ok: true };
  }
  if (/\/refetch$/.test(p)) throw new Error("Automatisk hentning af tekst virker kun med server (Android/Termux). Brug “Rediger”.");
  throw new Error("ikke fundet");
}

async function localExport() {
  return { categories: await LocalStore.all("categories"), posts: await LocalStore.all("posts") };
}

async function localImport(data) {
  if (!data || !Array.isArray(data.posts) || !Array.isArray(data.categories)) throw new Error("Ugyldig backup-fil");
  await LocalStore.clear("categories");
  await LocalStore.clear("posts");
  for (const c of data.categories) await LocalStore.put("categories", { id: c.id, name: c.name });
  for (const x of data.posts) await LocalStore.put("posts", { ...x, thumb: "" });
}
