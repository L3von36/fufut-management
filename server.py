"""
FU FUT COFFEE — Development Server
Serves static files + REST API for content, reservations, orders, expenses, inventory, staff, shifts

Storage:
  - CMS content: JSON files (content.json, content-draft.json, content-versions.json)
  - Orders, Reservations, Reviews: SQLite (mirrors D1 in production)
  - All other data: JSON files (expenses, inventory, staff, shifts, menu, etc.)

Content Management Features:
  - Draft / Publish workflow
  - Version history with rollback
  - Scheduled publishing
  - Section layout (dynamic zones — visibility + order)
"""
import http.server
import json
import os
import sqlite3
import uuid
import hashlib
import http.cookies
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

PORT = 3000
ROOT = os.path.dirname(os.path.abspath(__file__))

# JSON-backed collections (NOT migrated to SQLite)
FILES = {
    'expenses':     os.path.join(ROOT, 'expenses.json'),
    'inventory':    os.path.join(ROOT, 'inventory.json'),
    'staff':        os.path.join(ROOT, 'staff.json'),
    'shifts':       os.path.join(ROOT, 'shifts.json'),
    'menu':         os.path.join(ROOT, 'menu.json'),
    'cashdrawers':  os.path.join(ROOT, 'cashdrawers.json'),
    'waste':        os.path.join(ROOT, 'waste.json'),
    'timeclock':    os.path.join(ROOT, 'timeclock.json'),
    'tables':       os.path.join(ROOT, 'tables.json'),
}

# JSON-backed content (CMS)
CONTENT_FILE = os.path.join(ROOT, 'content.json')
DRAFT_FILE = os.path.join(ROOT, 'content-draft.json')
VERSIONS_FILE = os.path.join(ROOT, 'content-versions.json')

# SQLite database (mirrors D1 in production)
DB_PATH = os.path.join(ROOT, 'fufut.db')

# ===== DEV AUTH (local only — production uses Cloudflare Worker/D1) =====

# Simple in-memory sessions: { session_id: { email, role, user, expires } }
_dev_sessions = {}

# Default passwords for local dev (email -> password)
_DEV_PASSWORDS = {
    'amanuel@fufut.coffee':  'manager123',
    'selam@fufut.coffee':     'chef123',
    'yonas@fufut.coffee':     'waiter123',
    'bethel@fufut.coffee':    'cashier123',
    'tigist@fufut.coffee':    'chef123',
    'gebremedhin@fufut.coffee': 'delivery123',
    'asnegash@fufut.coffee':  'cleaner123',
}

SESSION_COOKIE = 'fufut_session'
SESSION_MAX_AGE = 86400  # 24 hours

def _make_session_id():
    return hashlib.sha256(uuid.uuid4().bytes + os.urandom(8)).hexdigest()[:32]

def _get_cookie(self):
    """Parse session cookie from request."""
    hdr = self.headers.get('Cookie', '')
    c = http.cookies.SimpleCookie(hdr)
    return c.get(SESSION_COOKIE)

def _get_session(self):
    """Return session dict or None."""
    morsel = _get_cookie(self)
    if not morsel:
        return None
    sid = morsel.value
    sess = _dev_sessions.get(sid)
    if not sess:
        return None
    # Check expiry
    if datetime.now(timezone.utc).timestamp() > sess.get('expires', 0):
        del _dev_sessions[sid]
        return None
    return sess

def _set_session_cookie(self, sid):
    self.send_header('Set-Cookie', f'{SESSION_COOKIE}={sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age={SESSION_MAX_AGE}')

def _clear_session_cookie(self):
    self.send_header('Set-Cookie', f'{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0')

# ===== RBAC CONFIG =====

def _normalize_role(role):
    """Normalize role name to kebab-case for permission lookup."""
    if not role:
        return ''
    return role.lower().replace(' ', '-')

# Role -> permission sets (mirrors frontend ROLE_PERMISSIONS in api/index.js)
_ROLE_PERMS = {
    'manager': {'dashboard','orders','tables','menu-mgmt','menu-view','expenses','pnl',
                'cashdrawer','inventory','waste','staff','shifts','timeclock','kitchen',
                'reports','reservations','delivery','analytics','checkout','revenue','pipeline'},
    'head-chef': {'kitchen','orders','dashboard','inventory','waste','reports','pipeline'},
    'assistant-chef': {'kitchen','orders','dashboard','inventory'},
    'head-waiter': {'tables','orders','dashboard','reservations','delivery','shifts',
                    'timeclock','inventory','waste','kitchen','reports','pipeline',
                    'menu-view','checkout'},
    'cashier': {'cashdrawer','orders','dashboard','tables','reports','timeclock',
                'reservations','revenue','menu-view','analytics','checkout'},
    'delivery-staff': {'delivery','dashboard'},
    'cleaner': {'waste','dashboard'},
}

# API collection -> permissions that grant read access
_READ_PERMS = {
    'orders': {'orders','kitchen','pipeline','checkout','reports','analytics','revenue','pnl'},
    'reservations': {'reservations'},
    'expenses': {'expenses','pnl'},
    'inventory': {'inventory'},
    'waste': {'waste'},
    'staff': {'staff'},
    'shifts': {'shifts'},
    'timeclock': {'timeclock'},
    'menu': {'menu-mgmt','menu-view'},
    'tables': {'tables','dashboard'},
    'cashdrawers': {'cashdrawer'},
    'delivery': {'delivery'},
    'reviews': set(),  # No role has reviews permission — fully restricted
}

# API collection -> permissions that grant write access (POST/PUT/DELETE)
_WRITE_PERMS = {
    'orders': {'orders','kitchen','pipeline','checkout'},
    'reservations': {'reservations'},
    'expenses': {'expenses'},
    'inventory': {'inventory'},
    'waste': {'waste'},
    'staff': {'staff'},
    'shifts': {'shifts'},
    'timeclock': {'timeclock'},
    'menu': {'menu-mgmt'},
    'tables': {'tables'},
    'cashdrawers': {'cashdrawer'},
    'delivery': {'delivery'},
    'reviews': set(),
}

def _role_has_perm(role_key, collection, write=False):
    """Check if a normalized role has permission for a collection."""
    role_perms = _ROLE_PERMS.get(role_key, set())
    required = (_WRITE_PERMS if write else _READ_PERMS).get(collection, set())
    return bool(role_perms & required)

# ===== JSON HELPERS =====

def load_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default if default is not None else []

def save_json(path, data):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def send_json(handler, code, obj):
    handler.send_response(code)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(json.dumps(obj).encode())

def read_body(handler):
    length = int(handler.headers.get('Content-Length', 0))
    return handler.rfile.read(length)

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def strip_meta(content):
    """Remove internal _meta and _sectionLayout keys from content before sending to client."""
    if not isinstance(content, dict):
        return content
    return {k: v for k, v in content.items() if not k.startswith('_')}

# ===== SQLite HELPERS =====

def get_db():
    """Get SQLite connection. Creates tables if they don't exist."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    # Create tables if needed (idempotent)
    conn.executescript('''
        CREATE TABLE IF NOT EXISTS orders (
            id TEXT PRIMARY KEY,
            items TEXT NOT NULL DEFAULT '',
            total REAL NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'new',
            name TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            order_type TEXT NOT NULL DEFAULT '',
            table_number TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL DEFAULT '',
            updated TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS reservations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            date TEXT NOT NULL DEFAULT '',
            time TEXT NOT NULL DEFAULT '',
            guests INTEGER NOT NULL DEFAULT 1,
            tableId TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'new',
            notes TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL DEFAULT '',
            updated TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS reviews (
            id TEXT PRIMARY KEY,
            author TEXT NOT NULL DEFAULT '',
            text TEXT NOT NULL DEFAULT '',
            rating INTEGER NOT NULL DEFAULT 5,
            status TEXT NOT NULL DEFAULT 'pending',
            date TEXT NOT NULL DEFAULT '',
            created TEXT NOT NULL DEFAULT '',
            updated TEXT NOT NULL DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created);
        CREATE INDEX IF NOT EXISTS idx_reservations_status ON reservations(status);
        CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations(date);
        CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
    ''')
    # Phase 2: Add new columns if they don't exist (safe migration)
    new_cols = [
        ('orders', 'subtotal', 'REAL NOT NULL DEFAULT 0'),
        ('orders', 'tip', 'REAL NOT NULL DEFAULT 0'),
        ('orders', 'tip_type', 'TEXT NOT NULL DEFAULT \'none\''),
        ('orders', 'discount', 'REAL NOT NULL DEFAULT 0'),
        ('orders', 'discount_type', 'TEXT NOT NULL DEFAULT \'none\''),
        ('orders', 'discount_reason', 'TEXT NOT NULL DEFAULT \'\''),
        ('orders', 'payment_method', 'TEXT NOT NULL DEFAULT \'cash\''),
        ('orders', 'payment_breakdown', 'TEXT NOT NULL DEFAULT \'\''),
        ('orders', 'order_items', 'TEXT NOT NULL DEFAULT \'\''),
        ('orders', 'customer', 'TEXT NOT NULL DEFAULT \'\''),
    ]
    for table, col, coldef in new_cols:
        try:
            conn.execute(f'ALTER TABLE {table} ADD COLUMN {col} {coldef}')
        except Exception:
            pass  # Column already exists
    conn.commit()
    return conn

def row_to_dict(row):
    """Convert sqlite3.Row to dict. Auto-parses JSON fields."""
    if row is None:
        return None
    d = dict(row)
    # Auto-parse known JSON columns for orders
    for key in ('items', 'payment_breakdown', 'order_items'):
        val = d.get(key)
        if isinstance(val, str) and val.strip().startswith('['):
            try:
                d[key] = json.loads(val)
            except (json.JSONDecodeError, ValueError):
                pass
    return d

def migrate_json_to_sqlite():
    """One-time migration: read existing JSON files and insert into SQLite.
    Uses INSERT OR IGNORE so it's safe to run multiple times."""
    try:
        conn = get_db()
        # Migrate orders
        orders_file = os.path.join(ROOT, 'orders.json')
        if os.path.exists(orders_file):
            orders = load_json(orders_file, default=[])
            if orders:
                for o in orders:
                    items = o.get('items', [])
                    if not isinstance(items, str):
                        items = json.dumps(items)
                    try:
                        conn.execute('''
                            INSERT OR IGNORE INTO orders (id, items, total, status, name, phone, email, order_type, table_number, notes, created, updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (o.get('id', ''), items, o.get('total', 0), o.get('status', 'new'),
                              o.get('name', ''), o.get('phone', ''), o.get('email', ''),
                              o.get('order_type', ''), o.get('table_number', ''), o.get('notes', ''),
                              o.get('created', ''), o.get('created', '')))
                    except Exception as e:
                        print(f"[MIGRATE] order {o.get('id', '?')}: {e}")
                conn.commit()
                count = conn.execute('SELECT COUNT(*) FROM orders').fetchone()[0]
                print(f"[MIGRATE] orders: {len(orders)} records from JSON, {count} in SQLite")

        # Migrate reservations
        res_file = os.path.join(ROOT, 'reservations.json')
        if os.path.exists(res_file):
            reservations = load_json(res_file, default=[])
            if reservations:
                for r in reservations:
                    try:
                        conn.execute('''
                            INSERT OR IGNORE INTO reservations (id, name, phone, email, date, time, guests, tableId, status, notes, created, updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (r.get('id', ''), r.get('name', ''), r.get('phone', ''), r.get('email', ''),
                              r.get('date', ''), r.get('time', ''), r.get('guests', 1), r.get('tableId', ''),
                              r.get('status', 'new'), r.get('notes', ''), r.get('created', ''), r.get('created', '')))
                    except Exception as e:
                        print(f"[MIGRATE] reservation {r.get('id', '?')}: {e}")
                conn.commit()
                count = conn.execute('SELECT COUNT(*) FROM reservations').fetchone()[0]
                print(f"[MIGRATE] reservations: {len(reservations)} records from JSON, {count} in SQLite")

        # Migrate reviews
        rev_file = os.path.join(ROOT, 'reviews.json')
        if os.path.exists(rev_file):
            reviews = load_json(rev_file, default=[])
            if reviews:
                for r in reviews:
                    try:
                        conn.execute('''
                            INSERT OR IGNORE INTO reviews (id, author, text, rating, status, date, created, updated)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        ''', (r.get('id', ''), r.get('author', r.get('name', '')), r.get('text', r.get('review', '')),
                              r.get('rating', 5), r.get('status', 'pending'), r.get('date', ''),
                              r.get('created', ''), r.get('created', '')))
                    except Exception as e:
                        print(f"[MIGRATE] review {r.get('id', '?')}: {e}")
                conn.commit()
                count = conn.execute('SELECT COUNT(*) FROM reviews').fetchone()[0]
                print(f"[MIGRATE] reviews: {len(reviews)} records from JSON, {count} in SQLite")

        conn.close()
    except Exception as e:
        print(f"[MIGRATE ERROR] {e}")

# ===== CMS VERSION HELPERS =====

def load_versions():
    return load_json(VERSIONS_FILE, default=[])

def save_versions(versions):
    save_json(VERSIONS_FILE, versions)

def create_version(content, note=''):
    versions = load_versions()
    vid = 'v' + str(uuid.uuid4())[:8]
    entry = {
        'id': vid,
        'timestamp': now_iso(),
        'note': note or 'Manual save',
        'status': 'published',
        'content': content
    }
    versions.append(entry)
    if len(versions) > 50:
        versions = versions[-50:]
    save_versions(versions)
    return vid

def check_scheduled_publish():
    """Auto-publish draft if scheduled time has passed."""
    try:
        draft = load_json(DRAFT_FILE, default=None)
        if not draft or not isinstance(draft, dict):
            return
        scheduled = draft.get('_meta', {}).get('scheduled_at')
        if not scheduled:
            return
        scheduled_dt = datetime.fromisoformat(scheduled.replace('Z', '+00:00'))
        if datetime.now(timezone.utc) >= scheduled_dt:
            publishable = strip_meta(draft)
            save_json(CONTENT_FILE, publishable)
            create_version(publishable, note='Scheduled auto-publish')
            try:
                os.remove(DRAFT_FILE)
            except FileNotFoundError:
                pass
            print(f"[AUTO-PUBLISH] Scheduled content published at {now_iso()}")
    except Exception as e:
        print(f"[AUTO-PUBLISH ERROR] {e}")

# ===== SQLITE ROUTE HELPERS =====

# Collections handled by SQLite (not JSON files)
SQLITE_COLLECTIONS = {'orders', 'reservations', 'reviews'}

PREFIXES = {
    'expenses': 'E', 'inventory': 'I', 'staff': 'S', 'shifts': 'SH',
    'menu': 'M', 'cashdrawers': 'CD', 'waste': 'W', 'timeclock': 'TC', 'tables': 'T',
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _api_route(self):
        """Check if path matches a JSON-backed collection (not SQLite ones)."""
        for name in FILES:
            if self.path == f'/api/{name}':
                return name
        return None

    def _parse_path(self):
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        return path, {k: v[0] for k, v in params.items()}

    def _is_sqlite_collection(self, path):
        """Check if path is for a SQLite-backed collection."""
        for coll in SQLITE_COLLECTIONS:
            if path == f'/api/{coll}' or path.startswith(f'/api/{coll}/'):
                return coll
        return None

    # ===== GET =====

    def do_GET(self):
        path, params = self._parse_path()

        # === AUTH ENDPOINTS ===
        if path == '/api/auth/me':
            sess = _get_session(self)
            if not sess:
                send_json(self, 200, {"ok": False})
            else:
                send_json(self, 200, {"ok": True, "user": sess['user'], "role": sess['role']})
            return

        # === CMS CONTENT ENDPOINTS ===
        if path == '/api/content':
            is_draft = params.get('draft') == 'true' or params.get('preview') == 'true'
            if is_draft:
                content = load_json(DRAFT_FILE, default=None)
                if content is None:
                    content = load_json(CONTENT_FILE, default={})
                send_json(self, 200, strip_meta(content))
            else:
                check_scheduled_publish()
                content = load_json(CONTENT_FILE, default={})
                send_json(self, 200, strip_meta(content))
            return

        if path == '/api/content/versions':
            versions = load_versions()
            lite = [{'id': v['id'], 'timestamp': v['timestamp'], 'note': v['note'], 'status': v['status']} for v in reversed(versions)]
            send_json(self, 200, lite)
            return

        if path.startswith('/api/content/versions/'):
            vid = path.split('/')[-1]
            versions = load_versions()
            for v in reversed(versions):
                if v['id'] == vid:
                    send_json(self, 200, {'id': v['id'], 'timestamp': v['timestamp'], 'note': v['note'], 'status': v['status'], 'content': strip_meta(v['content'])})
                    return
            send_json(self, 404, {"ok": False, "error": "Version not found"})
            return

        if path == '/api/content/status':
            draft = load_json(DRAFT_FILE, default=None)
            published = load_json(CONTENT_FILE, default={})
            has_draft = draft is not None and isinstance(draft, dict)
            result = {
                'hasDraft': has_draft,
                'draftModified': draft.get('_meta', {}).get('updated_at', '') if has_draft else '',
                'publishedModified': published.get('_meta', {}).get('updated_at', '') if isinstance(published, dict) else '',
                'scheduledAt': draft.get('_meta', {}).get('scheduled_at', '') if has_draft else None,
                'hasUnpublishedChanges': has_draft
            }
            send_json(self, 200, result)
            return

        # === AUTH + RBAC CHECK FOR DATA ENDPOINTS ===
        sess = _get_session(self)
        if not sess:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return
        role_key = _normalize_role(sess.get('role', ''))

        # === SQLITE COLLECTIONS: orders, reservations, reviews ===
        coll = self._is_sqlite_collection(path)
        if coll and path == f'/api/{coll}':
            if not _role_has_perm(role_key, coll, write=False):
                send_json(self, 403, {"ok": False, "error": "Access denied"})
                return
            conn = get_db()
            query = f'SELECT * FROM {coll}'
            where_clauses = []
            query_params = []
            # Phase 4: filter orders by table_number
            if coll == 'orders' and params.get('table_number'):
                where_clauses.append('table_number = ?')
                query_params.append(params['table_number'])
            # Phase 4: filter orders by status
            if coll == 'orders' and params.get('status'):
                where_clauses.append('status = ?')
                query_params.append(params['status'])
            if where_clauses:
                query += ' WHERE ' + ' AND '.join(where_clauses)
            query += f' ORDER BY created DESC'
            rows = conn.execute(query, query_params).fetchall()
            conn.close()
            send_json(self, 200, [row_to_dict(r) for r in rows])
            return

        # === JSON COLLECTIONS (everything else) ===
        name = self._api_route()
        if name:
            if not _role_has_perm(role_key, name, write=False):
                send_json(self, 403, {"ok": False, "error": "Access denied"})
                return
            send_json(self, 200, load_json(FILES[name]))
            return
        super().do_GET()

    def _read_json_body(self):
        body = read_body(self)
        return json.loads(body)

    # ===== POST =====

    def do_POST(self):
        body = read_body(self)
        path = self.path
        try:
            data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError("Expected JSON object")

            # === AUTH ENDPOINTS ===
            if path == '/api/auth/login':
                email = (data.get('email') or '').strip().lower()
                password = data.get('password', '')
                staff = load_json(FILES['staff'])
                user = next((s for s in staff if s.get('email', '').lower() == email), None)
                if not user or _DEV_PASSWORDS.get(email) != password:
                    send_json(self, 401, {"ok": False, "error": "Invalid email or password"})
                    return
                # Create session
                sid = _make_session_id()
                role = user.get('role', 'staff')
                _dev_sessions[sid] = {
                    'email': email, 'role': role, 'user': {**user},
                    'expires': datetime.now(timezone.utc).timestamp() + SESSION_MAX_AGE,
                }
                # Build response manually so we can set cookie before end_headers
                resp = json.dumps({"ok": True, "user": user, "role": role}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                _set_session_cookie(self, sid)
                self.end_headers()
                self.wfile.write(resp)
                print(f"[AUTH LOGIN] {email} ({role})")
                return

            if path == '/api/auth/logout':
                sess = _get_session(self)
                if sess:
                    morsel = _get_cookie(self)
                    if morsel:
                        _dev_sessions.pop(morsel.value, None)
                    print(f"[AUTH LOGOUT] {sess.get('email', '?')}")
                resp = json.dumps({"ok": True}).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                _clear_session_cookie(self)
                self.end_headers()
                self.wfile.write(resp)
                return

            # === CMS CONTENT ENDPOINTS ===
            if path == '/api/save-content' or path == '/save-content':
                clean = strip_meta(data)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Save (legacy)')
                print(f"[SAVED] content.json ({len(body)} bytes) — version {vid}")
                send_json(self, 200, {"ok": True, "version": vid})
                return

            if path == '/api/content/draft':
                data['_meta'] = {'updated_at': now_iso(), 'status': 'draft', 'scheduled_at': data.pop('_scheduled_at', None)}
                save_json(DRAFT_FILE, data)
                send_json(self, 200, {"ok": True, "message": "Draft saved"})
                print(f"[DRAFT] content-draft.json saved")
                return

            if path == '/api/content/publish':
                draft = load_json(DRAFT_FILE, default=None)
                if draft is None:
                    send_json(self, 400, {"ok": False, "error": "No draft to publish"})
                    return
                clean = strip_meta(draft)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Published from draft')
                try: os.remove(DRAFT_FILE)
                except FileNotFoundError: pass
                send_json(self, 200, {"ok": True, "version": vid, "message": "Content published"})
                print(f"[PUBLISHED] content.json updated — version {vid}")
                return

            if path == '/api/content/schedule':
                scheduled_at = data.get('scheduled_at')
                if not scheduled_at:
                    send_json(self, 400, {"ok": False, "error": "scheduled_at is required"})
                    return
                try: datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
                except ValueError:
                    send_json(self, 400, {"ok": False, "error": "Invalid datetime format"})
                    return
                draft = load_json(DRAFT_FILE, default=None)
                if draft is None:
                    send_json(self, 400, {"ok": False, "error": "No draft to schedule. Save a draft first."})
                    return
                draft['_meta'] = draft.get('_meta', {})
                draft['_meta']['scheduled_at'] = scheduled_at
                draft['_meta']['status'] = 'scheduled'
                save_json(DRAFT_FILE, draft)
                send_json(self, 200, {"ok": True, "message": f"Scheduled for {scheduled_at}"})
                print(f"[SCHEDULED] Draft scheduled for {scheduled_at}")
                return

            if path == '/api/content/discard':
                try: os.remove(DRAFT_FILE)
                except FileNotFoundError: pass
                send_json(self, 200, {"ok": True, "message": "Draft discarded"})
                print(f"[DISCARDED] Draft removed")
                return

            if path.startswith('/api/content/rollback/'):
                vid = path.split('/')[-1]
                versions = load_versions()
                for v in versions:
                    if v['id'] == vid:
                        clean = strip_meta(v['content'])
                        save_json(CONTENT_FILE, clean)
                        new_vid = create_version(clean, note=f'Rollback to {vid}')
                        try: os.remove(DRAFT_FILE)
                        except FileNotFoundError: pass
                        send_json(self, 200, {"ok": True, "version": new_vid, "message": f"Rolled back to {vid}"})
                        print(f"[ROLLBACK] Restored version {vid}, new version {new_vid}")
                        return
                send_json(self, 404, {"ok": False, "error": "Version not found"})
                return

            if path == '/api/content/save-and-publish':
                clean = strip_meta(data)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Save & Publish')
                try: os.remove(DRAFT_FILE)
                except FileNotFoundError: pass
                send_json(self, 200, {"ok": True, "version": vid, "message": "Saved and published"})
                print(f"[SAVE+PUBLISH] content.json — version {vid}")
                return

            # === AUTH + RBAC CHECK FOR DATA ENDPOINTS ===
            sess = _get_session(self)
            if not sess:
                send_json(self, 401, {"ok": False, "error": "Authentication required"})
                return
            role_key = _normalize_role(sess.get('role', ''))

            # === SQLITE COLLECTIONS: orders, reservations, reviews ===
            coll = self._is_sqlite_collection(path)
            if coll and path == f'/api/{coll}':
                if not _role_has_perm(role_key, coll, write=True):
                    send_json(self, 403, {"ok": False, "error": "Access denied"})
                    return
                conn = get_db()
                oid = data.get('id') or (coll[0].upper() + str(uuid.uuid4())[:7])
                created = data.get('created', now_iso())

                if coll == 'orders':
                    items = data.get('items', [])
                    if not isinstance(items, str):
                        items = json.dumps(items)
                    # Phase 2: serialize structured order items
                    order_items = data.get('orderItems')
                    if order_items and not isinstance(order_items, str):
                        order_items = json.dumps(order_items)
                    # Phase 2: serialize payment breakdown
                    payment_breakdown = data.get('paymentBreakdown')
                    if payment_breakdown and not isinstance(payment_breakdown, str):
                        payment_breakdown = json.dumps(payment_breakdown)
                    conn.execute('''
                        INSERT INTO orders (id, items, total, status, name, phone, email, order_type, table_number, notes, created, updated,
                            subtotal, tip, tip_type, discount, discount_type, discount_reason,
                            payment_method, payment_breakdown, order_items, customer)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (oid, items, data.get('total', 0), data.get('status', 'new'),
                          data.get('name', ''), data.get('phone', ''), data.get('email', ''),
                          data.get('order_type', ''), data.get('table_number', ''), data.get('notes', ''),
                          created, created,
                          data.get('subtotal', 0),
                          data.get('tip', 0),
                          data.get('tipType', 'none'),
                          data.get('discount', 0),
                          data.get('discountType', 'none'),
                          data.get('discountReason', ''),
                          data.get('payment', 'cash'),
                          payment_breakdown or '',
                          order_items or '',
                          data.get('customer', '')))
                elif coll == 'reservations':
                    conn.execute('''
                        INSERT INTO reservations (id, name, phone, email, date, time, guests, tableId, status, notes, created, updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (oid, data.get('name', ''), data.get('phone', ''), data.get('email', ''),
                          data.get('date', ''), data.get('time', ''), data.get('guests', 1), data.get('tableId', ''),
                          data.get('status', 'new'), data.get('notes', ''), created, created))
                elif coll == 'reviews':
                    conn.execute('''
                        INSERT INTO reviews (id, author, text, rating, status, date, created, updated)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    ''', (oid, data.get('author', data.get('name', '')), data.get('text', data.get('review', '')),
                          data.get('rating', 5), data.get('status', 'pending'), data.get('date', created[:10]),
                          created, created))

                conn.commit()
                conn.close()
                send_json(self, 200, {"ok": True, "id": oid})
                print(f"[{coll.upper()}] {oid} created")
                return

            # === JSON COLLECTIONS (everything else) ===
            name = self._api_route()
            if name:
                if not _role_has_perm(role_key, name, write=True):
                    send_json(self, 403, {"ok": False, "error": "Access denied"})
                    return
                items = load_json(FILES[name])
                prefix = PREFIXES[name]
                entry = dict(data)
                entry["id"] = prefix + str(uuid.uuid4())[:8]
                if "created" not in entry:
                    entry["created"] = now_iso()
                items.append(entry)
                save_json(FILES[name], items)
                send_json(self, 200, {"ok": True, "id": entry["id"]})
                print(f"[{name.upper()}] {entry.get('name', entry['id'])}")
                return

        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})
            print(f"[ERROR] {e}")
            return

        send_json(self, 404, {"ok": False, "error": "not found"})

    # ===== PUT =====

    def do_PUT(self):
        path, _ = self._parse_path()

        # Auth + RBAC check
        sess = _get_session(self)
        if not sess:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return
        role_key = _normalize_role(sess.get('role', ''))

        # Check SQLite collections first
        coll = self._is_sqlite_collection(path)
        if coll and '/' in path.split('/api/')[1]:
            if not _role_has_perm(role_key, coll, write=True):
                send_json(self, 403, {"ok": False, "error": "Access denied"})
                return
            item_id = path.split('/')[-1]
            try:
                data = self._read_json_body()
                conn = get_db()

                # Build dynamic UPDATE
                fields = []
                values = []
                updateable = {
                    'orders': ['status', 'items', 'total', 'name', 'phone', 'email', 'order_type', 'table_number', 'notes',
                               'subtotal', 'tip', 'tip_type', 'discount', 'discount_type', 'discount_reason',
                               'payment_method', 'payment_breakdown', 'order_items', 'customer'],
                    'reservations': ['status', 'name', 'phone', 'email', 'date', 'time', 'guests', 'tableId', 'notes'],
                    'reviews': ['status', 'author', 'text', 'rating'],
                }
                json_fields = {'items', 'payment_breakdown', 'order_items'}
                for field in updateable.get(coll, []):
                    if field in data:
                        val = data[field]
                        if field in json_fields and not isinstance(val, str):
                            val = json.dumps(val)
                        fields.append(f"{field} = ?")
                        values.append(val)

                if not fields:
                    conn.close()
                    send_json(self, 400, {"ok": False, "error": "No fields to update"})
                    return

                fields.append("updated = ?")
                values.append(now_iso())
                values.append(item_id)

                sql = f"UPDATE {coll} SET {', '.join(fields)} WHERE id = ?"
                cursor = conn.execute(sql, values)
                conn.commit()
                if cursor.rowcount == 0:
                    conn.close()
                    send_json(self, 404, {"ok": False, "error": "Item not found"})
                    return
                conn.close()
                send_json(self, 200, {"ok": True})
                print(f"[{coll.upper()} UPDATED] {item_id}")
            except Exception as e:
                send_json(self, 400, {"ok": False, "error": str(e)})
                print(f"[ERROR] {e}")
            return

        # JSON collections
        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        if not _role_has_perm(role_key, name, write=True):
            send_json(self, 403, {"ok": False, "error": "Access denied"})
            return
        try:
            data = self._read_json_body()
            item_id = data.get("id")
            if not item_id:
                send_json(self, 400, {"ok": False, "error": "id required"})
                return
            items = load_json(FILES[name])
            found = False
            for i, item in enumerate(items):
                if item.get("id") == item_id:
                    if "created" not in data and "created" in item:
                        data["created"] = item["created"]
                    items[i] = data
                    found = True
                    break
            if not found:
                send_json(self, 404, {"ok": False, "error": "item not found"})
                return
            save_json(FILES[name], items)
            send_json(self, 200, {"ok": True})
            print(f"[{name.upper()} UPDATED] {item_id}")
        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})

    # ===== DELETE =====

    def do_DELETE(self):
        path, _ = self._parse_path()

        # Auth + RBAC check
        sess = _get_session(self)
        if not sess:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return
        role_key = _normalize_role(sess.get('role', ''))

        # Check SQLite collections first
        coll = self._is_sqlite_collection(path)
        if coll and '/' in path.split('/api/')[1]:
            if not _role_has_perm(role_key, coll, write=True):
                send_json(self, 403, {"ok": False, "error": "Access denied"})
                return
            item_id = path.split('/')[-1]
            try:
                data = self._read_json_body()
                item_id = data.get("id", item_id)
                conn = get_db()
                cursor = conn.execute(f"DELETE FROM {coll} WHERE id = ?", (item_id,))
                conn.commit()
                conn.close()
                if cursor.rowcount == 0:
                    send_json(self, 404, {"ok": False, "error": "Item not found"})
                    return
                send_json(self, 200, {"ok": True})
                print(f"[{coll.upper()} DELETED] {item_id}")
            except Exception as e:
                send_json(self, 400, {"ok": False, "error": str(e)})
            return

        # JSON collections
        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
            return
        if not _role_has_perm(role_key, name, write=True):
            send_json(self, 403, {"ok": False, "error": "Access denied"})
            return
        try:
            data = self._read_json_body()
            item_id = data.get("id")
            if not item_id:
                send_json(self, 400, {"ok": False, "error": "id required"})
                return
            items = load_json(FILES[name])
            new_items = [i for i in items if i.get("id") != item_id]
            if len(new_items) == len(items):
                send_json(self, 404, {"ok": False, "error": "item not found"})
                return
            save_json(FILES[name], new_items)
            send_json(self, 200, {"ok": True})
            print(f"[{name.upper()} DELETED] {item_id}")
        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        msg = str(args)
        if any(x in msg for x in ['POST', 'GET /api/', 'ERROR', 'SAVED', 'PUBLISHED', 'DRAFT', 'ROLLBACK', 'RESERVATION', 'ORDER', 'MIGRATE']):
            super().log_message(format, *args)

if __name__ == '__main__':
    # Migrate existing JSON data to SQLite on startup
    migrate_json_to_sqlite()

    print(f"FU FUT COFFEE — http://localhost:{PORT}")
    print(f"Static root: {ROOT}")
    print(f"Database: {DB_PATH} (SQLite — mirrors D1 in production)")
    print("Endpoints:")
    print("  SQLite-backed (orders, reservations, reviews):")
    print("    GET/POST /api/orders, /api/reservations, /api/reviews")
    print("    PUT/DELETE /api/{collection}/:id")
    print("  JSON-backed:")
    for name in FILES:
        print(f"    GET/POST /api/{name} -> {name}.json")
    print("  Content Management (CMS):")
    print("    GET  /api/content              -> Published content")
    print("    GET  /api/content?draft=true   -> Draft content")
    print("    GET  /api/content?preview=true -> Preview mode")
    print("    GET  /api/content/status      -> Draft/publish status")
    print("    GET  /api/content/versions    -> Version history")
    print("    POST /api/content/draft       -> Save as draft")
    print("    POST /api/content/publish     -> Publish draft to live")
    print("    POST /api/content/schedule    -> Schedule for later")
    print("    POST /api/content/discard     -> Discard draft")
    print("    POST /api/content/rollback/:id -> Rollback to version")
    print("    POST /api/save-content         -> Legacy: save+publish")
    print("Press Ctrl+C to stop\n")
    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
