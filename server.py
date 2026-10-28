#!/usr/bin/env python3
"""Opskrift-gemmer: gem Instagram-opslag (tekst + link) lokalt i SQLite.

Kun Python-standardbiblioteket. Start med:  python3 server.py
"""
import argparse
import html
import json
import mimetypes
import os
import re
import socket
import sqlite3
import ssl
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = Path(os.environ.get("DATA_DIR", ROOT / "data"))
THUMBS = DATA / "thumbs"
DB_PATH = DATA / "opskrifter.db"

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
BOT_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uagent.php)"

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY,
  shortcode TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  image_url TEXT NOT NULL DEFAULT '',
  thumb TEXT NOT NULL DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
"""


def db():
    con = sqlite3.connect(DB_PATH)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    con.create_function("fold", 1, lambda s: (s or "").casefold())
    return con


def init_db():
    DATA.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    con = db()
    con.execute("PRAGMA journal_mode=WAL")
    con.executescript(SCHEMA)
    con.commit()
    con.close()


# --------------------------------------------------------------------------
# Instagram: find link + hent beskrivelse
# --------------------------------------------------------------------------
IG_RE = re.compile(r"https?://(?:www\.)?instagram\.com/(?:[\w.]+/)?(p|reels?|tv)/([\w-]+)", re.I)


def find_post(text):
    """Returnerer (kind, shortcode, kanonisk_url) for første Instagram-opslag i teksten."""
    m = IG_RE.search(text or "")
    if not m:
        return None
    kind = "reel" if m.group(1).lower().startswith("reel") else m.group(1).lower()
    code = m.group(2)
    return kind, code, f"https://www.instagram.com/{kind}/{code}/"


def http_get(url, ua, timeout=12, binary=False, limit=3_000_000):
    req = urllib.request.Request(url, headers={
        "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9",
        "Accept": "text/html,application/xhtml+xml,image/*,*/*;q=0.8"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read(limit)
        return raw if binary else raw.decode(r.headers.get_content_charset() or "utf-8", "replace")


class MetaParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        if tag == "meta":
            a = dict(attrs)
            key = a.get("property") or a.get("name")
            if key and a.get("content") is not None:
                self.meta.setdefault(key, a["content"])


def parse_og(page):
    p = MetaParser()
    p.feed(page)
    m = p.meta
    author, text = "", ""
    desc, title = m.get("og:description", ""), m.get("og:title", "")
    # '1,234 likes, 5 comments - bruger on March 3, 2024: "tekst".'
    d = re.match(r'^.*? - (\S+) on [^:]{3,40}: "(.*)"\.?\s*$', desc, re.S)
    if d:
        author, text = d.group(1), d.group(2)
    # 'Navn on Instagram: "tekst"'
    t = re.match(r'^(.*?) on Instagram: ["“](.*?)["”]?\s*$', title, re.S)
    if t:
        author = author or t.group(1)
        if len(t.group(2)) > len(text):
            text = t.group(2)
    return {"author": author, "text": text.strip(), "image_url": m.get("og:image", "")}


def parse_embed(page):
    out = {"author": "", "text": "", "image_url": ""}
    i = page.find('class="Caption"')
    if i >= 0:
        seg = page[i:]
        j = seg.find('class="CaptionComments"')
        j = seg.rfind("<", 0, j) if j >= 0 else -1
        end = seg.find("</div>")
        cut = min(x for x in (j, end) if x >= 0) if (j >= 0 or end >= 0) else len(seg)
        seg = seg[:cut]
        a = re.search(r'<a[^>]*class="CaptionUsername"[^>]*>(.*?)</a>', seg, re.S)
        if a:
            out["author"] = html.unescape(re.sub(r"<[^>]+>", "", a.group(1))).strip()
            seg = seg.replace(a.group(0), "")
        seg = re.sub(r"<br\s*/?>", "\n", seg)
        seg = seg.split(">", 1)[-1]  # resten af <div class="Caption">-tagget
        seg = re.sub(r"<[^>]+>", "", seg)
        out["text"] = html.unescape(seg).strip()
    im = re.search(r'class="EmbeddedMediaImage"[^>]*src="([^"]+)"', page)
    if im:
        out["image_url"] = html.unescape(im.group(1))
    return out


def fetch_instagram(url):
    """Prøver flere kilder; returnerer det bedste resultat. Fejler stille."""
    best = {"author": "", "text": "", "image_url": ""}
    attempts = [
        (url + "embed/captioned/", BROWSER_UA, parse_embed),
        (url, BOT_UA, parse_og),
        (url, BROWSER_UA, parse_og),
    ]
    for u, ua, parser in attempts:
        try:
            got = parser(http_get(u, ua))
        except Exception:
            continue
        for k, v in got.items():
            if len(v) > len(best[k]):
                best[k] = v
        if best["text"] and best["image_url"]:
            break
    return best


def save_thumb(code, image_url):
    if not image_url:
        return ""
    try:
        data = http_get(image_url, BROWSER_UA, binary=True, limit=4_000_000)
        if len(data) < 500:
            return ""
        name = f"{code}.jpg"
        (THUMBS / name).write_bytes(data)
        return name
    except Exception:
        return ""


# --------------------------------------------------------------------------
# Data-lag
# --------------------------------------------------------------------------
def post_dict(r):
    d = dict(r)
    d["thumb_url"] = f"thumbs/{d['thumb']}" if d["thumb"] else ""
    return d


def create_post(raw, category_id=None, fetcher=None, text=""):
    found = find_post(raw)
    if not found:
        return None, False
    kind, code, url = found
    con = db()
    try:
        row = con.execute("SELECT * FROM posts WHERE shortcode=?", (code,)).fetchone()
        if row:
            return post_dict(row), True
        info = (fetcher or fetch_instagram)(url)
        info["text"] = text or info["text"]
        thumb = save_thumb(code, info["image_url"])
        cur = con.execute(
            "INSERT INTO posts(shortcode,kind,url,author,text,image_url,thumb,category_id) VALUES(?,?,?,?,?,?,?,?)",
            (code, kind, url, info["author"], info["text"], info["image_url"], thumb, category_id))
        con.commit()
        return post_dict(con.execute("SELECT * FROM posts WHERE id=?", (cur.lastrowid,)).fetchone()), False
    finally:
        con.close()


def list_posts(cat, q):
    sql, args = "SELECT * FROM posts WHERE 1=1", []
    if cat == "none":
        sql += " AND category_id IS NULL"
    elif cat:
        sql += " AND category_id=?"
        args.append(int(cat))
    for w in (q or "").split():
        sql += " AND (fold(text) LIKE ? OR fold(author) LIKE ?)"
        args += [f"%{w.casefold()}%"] * 2
    sql += " ORDER BY id DESC"
    con = db()
    try:
        return [post_dict(r) for r in con.execute(sql, args)]
    finally:
        con.close()


def list_categories():
    con = db()
    try:
        rows = con.execute("""SELECT c.id, c.name, COUNT(p.id) AS count FROM categories c
                              LEFT JOIN posts p ON p.category_id=c.id
                              GROUP BY c.id ORDER BY c.name COLLATE NOCASE""").fetchall()
        none = con.execute("SELECT COUNT(*) FROM posts WHERE category_id IS NULL").fetchone()[0]
        total = con.execute("SELECT COUNT(*) FROM posts").fetchone()[0]
        return {"categories": [dict(r) for r in rows], "uncategorized": none, "total": total}
    finally:
        con.close()


# --------------------------------------------------------------------------
# HTTP
# --------------------------------------------------------------------------
class Handler(BaseHTTPRequestHandler):
    server_version = "OpskriftGemmer/1.0"

    def log_message(self, fmt, *a):
        print("%s %s" % (self.address_string(), fmt % a))

    # -- hjælpere
    def send_json(self, obj, status=200, headers=None):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def redirect(self, to):
        self.send_response(303)
        self.send_header("Location", to)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n))
        except ValueError:
            return {}

    def send_file(self, path, root):
        try:
            path = path.resolve()
            path.relative_to(root.resolve())
        except ValueError:
            return self.send_json({"error": "ikke fundet"}, 404)
        if not path.is_file():
            return self.send_json({"error": "ikke fundet"}, 404)
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if path.suffix == ".webmanifest":
            ctype = "application/manifest+json"
        self.send_response(200)
        self.send_header("Content-Type", ctype + ("; charset=utf-8" if ctype.startswith("text/") or "javascript" in ctype else ""))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    def route(self):
        u = urllib.parse.urlparse(self.path)
        return u.path, urllib.parse.parse_qs(u.query)

    # -- GET
    def do_GET(self):
        path, qs = self.route()
        one = lambda k: (qs.get(k) or [""])[0]
        if path == "/share":  # Web Share Target + iOS-genvej
            raw = " ".join(one(k) for k in ("url", "text", "title"))
            post, _ = create_post(raw)
            return self.redirect(f"/?new={post['id']}" if post else "/?err=nolink")
        if path == "/api/posts":
            return self.send_json(list_posts(one("category"), one("q")))
        if path == "/api/categories":
            return self.send_json(list_categories())
        if path == "/api/export":
            con = db()
            data = {"categories": [dict(r) for r in con.execute("SELECT * FROM categories")],
                    "posts": [dict(r) for r in con.execute("SELECT * FROM posts")]}
            con.close()
            return self.send_json(data, headers={"Content-Disposition": 'attachment; filename="opskrifter-backup.json"'})
        if path.startswith("/thumbs/"):
            return self.send_file(THUMBS / path[len("/thumbs/"):], THUMBS)
        rel = "index.html" if path == "/" else path.lstrip("/")
        return self.send_file(STATIC / rel, STATIC)

    # -- POST
    def do_POST(self):
        path, _ = self.route()
        b = self.body()
        if path == "/api/posts":
            post, existing = create_post(str(b.get("input", "")), b.get("category_id"),
                                       text=str(b.get("text", "")).strip())
            if not post:
                return self.send_json({"error": "Fandt intet Instagram-link (p/reel/tv)."}, 400)
            return self.send_json({"post": post, "existing": existing})
        m = re.fullmatch(r"/api/posts/(\d+)/refetch", path)
        if m:
            con = db()
            row = con.execute("SELECT * FROM posts WHERE id=?", (m.group(1),)).fetchone()
            if not row:
                con.close()
                return self.send_json({"error": "ikke fundet"}, 404)
            info = fetch_instagram(row["url"])
            thumb = row["thumb"] or save_thumb(row["shortcode"], info["image_url"])
            con.execute("UPDATE posts SET text=?, author=?, image_url=?, thumb=? WHERE id=?",
                        (info["text"] or row["text"], info["author"] or row["author"],
                         info["image_url"] or row["image_url"], thumb, row["id"]))
            con.commit()
            out = post_dict(con.execute("SELECT * FROM posts WHERE id=?", (row["id"],)).fetchone())
            con.close()
            return self.send_json(out)
        if path == "/api/categories":
            name = str(b.get("name", "")).strip()
            if not name:
                return self.send_json({"error": "Navn mangler"}, 400)
            con = db()
            try:
                con.execute("INSERT OR IGNORE INTO categories(name) VALUES(?)", (name,))
                con.commit()
                row = con.execute("SELECT id, name FROM categories WHERE name=?", (name,)).fetchone()
                return self.send_json(dict(row))
            finally:
                con.close()
        self.send_json({"error": "ikke fundet"}, 404)

    # -- PATCH
    def do_PATCH(self):
        path, _ = self.route()
        b = self.body()
        con = db()
        try:
            m = re.fullmatch(r"/api/posts/(\d+)", path)
            if m:
                sets, args = [], []
                if "category_id" in b:
                    sets.append("category_id=?")
                    args.append(b["category_id"])
                if "text" in b:
                    sets.append("text=?")
                    args.append(str(b["text"]))
                if sets:
                    con.execute(f"UPDATE posts SET {', '.join(sets)} WHERE id=?", (*args, m.group(1)))
                    con.commit()
                row = con.execute("SELECT * FROM posts WHERE id=?", (m.group(1),)).fetchone()
                return self.send_json(post_dict(row)) if row else self.send_json({"error": "ikke fundet"}, 404)
            m = re.fullmatch(r"/api/categories/(\d+)", path)
            if m:
                name = str(b.get("name", "")).strip()
                if not name:
                    return self.send_json({"error": "Navn mangler"}, 400)
                try:
                    con.execute("UPDATE categories SET name=? WHERE id=?", (name, m.group(1)))
                    con.commit()
                except sqlite3.IntegrityError:
                    return self.send_json({"error": "Der findes allerede en kategori med det navn"}, 409)
                return self.send_json({"ok": True})
            self.send_json({"error": "ikke fundet"}, 404)
        finally:
            con.close()

    # -- DELETE
    def do_DELETE(self):
        path, _ = self.route()
        con = db()
        try:
            m = re.fullmatch(r"/api/posts/(\d+)", path)
            if m:
                row = con.execute("SELECT thumb FROM posts WHERE id=?", (m.group(1),)).fetchone()
                con.execute("DELETE FROM posts WHERE id=?", (m.group(1),))
                con.commit()
                if row and row["thumb"]:
                    (THUMBS / row["thumb"]).unlink(missing_ok=True)
                return self.send_json({"ok": True})
            m = re.fullmatch(r"/api/categories/(\d+)", path)
            if m:
                con.execute("DELETE FROM categories WHERE id=?", (m.group(1),))
                con.commit()
                return self.send_json({"ok": True})
            self.send_json({"error": "ikke fundet"}, 404)
        finally:
            con.close()


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--cert", help="TLS-certifikat (PEM) for HTTPS")
    ap.add_argument("--key", help="TLS-nøgle (PEM)")
    a = ap.parse_args()
    init_db()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    scheme = "http"
    if a.cert and a.key:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(a.cert, a.key)
        srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
        scheme = "https"
    print(f"Kører på {scheme}://localhost:{a.port}  (netværk: {scheme}://{lan_ip()}:{a.port})")
    print(f"Data gemmes i {DATA}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
