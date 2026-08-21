"""
FU FUT COFFEE — Secure Development Server
Serves static files + REST API with SQLite, JWT auth, and password hashing
"""
import http.server
import json
import os
import sys
import uuid
import sqlite3
import hashlib
import secrets
import time
from datetime import datetime, timedelta
from functools import wraps

PORT = 3000
ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, 'futfut.db')
SECRET_KEY = os.environ.get('JWT_SECRET', secrets.token_hex(32))

# Rate limiting
rate_limits = {}

# ─── Role-Based Access Control ───────────────────────────────────────────
# Mirrors the Cloudflare Workers ROLE_ACCESS matrix in fufut-api/src/auth.js.
# Default-deny: unknown roles and unlisted resources are refused.
# Manager gets wildcard access to everything.
# "read" covers GET; "write" covers POST, PUT, DELETE.

ROLE_ACCESS = {
    'manager':             {'read': '*', 'write': '*'},
    'head-chef':           {'read': ['orders','inventory','waste','expenses','recipes','units','suppliers','purchases','reports'],
                            'write': ['orders','inventory','waste','menu-availability','recipes']},
    'assistant-chef':      {'read': ['orders','inventory','recipes','units'],
                            'write': ['orders']},
    'head-waiter':         {'read': ['orders','tables','reservations','payments','tips','reports'],
                            'write': ['orders','tables','reservations','tips']},
    'cashier':             {'read': ['orders','tables','reservations','expenses','staff','timeclock','cashdrawer','payments','tips','delivery','reports'],
                            'write': ['orders','tables','reservations','timeclock','cashdrawer','payments','tips','delivery','upload']},
    'delivery-staff':      {'read': ['delivery','orders','payments','tips'],
                            'write': ['delivery','payments','tips','upload']},
    'cleaner':             {'read': ['waste','tables','inventory'],
                            'write': ['waste']},
    'accountant':          {'read': ['reports','orders','payments','tips','expenses','purchases','suppliers','staff','attendance','overtime','leave','adjustments','payroll','inventory','cashdrawer','timeclock','shifts','audit'],
                            'write': ['expenses']},
}

# Resources any signed-in staff member may read (shared catalogue/CMS).
ANY_STAFF_READ = {'menu', 'content', 'gallery', 'reviews', 'units', 'settings'}

# Manager-only write operations (same as MANAGER_ONLY in the Worker).
MANAGER_ONLY_PATHS = [
    '/api/staff',
    '/api/auth/reset-password',
    '/api/auth/change-password',
    '/api/settings',
    '/api/payroll/run',
]

VALID_ROLES = set(ROLE_ACCESS.keys())


def _normalize_role(role):
    """Normalize a role string to the canonical lowercase-hyphenated form."""
    if not role:
        return None
    key = str(role).strip().lower().replace(' ', '-').replace('_', '-')
    return key if key in VALID_ROLES else None


def _role_can_access(role_key, resource, is_write):
    """Check whether a role may read or write a given resource. Default-deny."""
    if not role_key or role_key not in ROLE_ACCESS:
        return False
    access = ROLE_ACCESS[role_key]
    if access['read'] == '*' and access['write'] == '*':
        return True
    if not is_write and resource in ANY_STAFF_READ:
        return True
    allowed = access['write'] if is_write else access['read']
    return isinstance(allowed, list) and resource in allowed


def _resource_for_path(path):
    """Map a URL path to the resource name it acts on."""
    parts = path.split('/')
    # parts[0] is empty (before first /), parts[1] is 'api'
    if len(parts) < 3:
        return None
    head = parts[2]  # e.g. 'orders', 'staff', 'menu', 'events', 'export'
    # /api/events/kitchen -> 'orders' (kitchen SSE streams order data)
    if head == 'events':
        return 'orders' if len(parts) > 3 and parts[3] == 'kitchen' else 'tables'
    # /api/menus or /api/menus/save -> 'menu'
    if head == 'menus':
        return 'menu'
    # /api/save-content -> 'content'
    if head == 'save-content':
        return 'content'
    # /api/export/csv -> use the 'table' param from body (checked at call site)
    if head == 'export':
        return 'export'
    # The DB table is "cashdrawers" (plural) but the ROLE_ACCESS resource is
    # "cashdrawer" (singular), matching the Cloudflare Workers convention.
    if head == 'cashdrawers':
        return 'cashdrawer'
    return head


def _is_manager_only_path(path, method):
    """Check if a path is restricted to managers regardless of the resource matrix."""
    if method not in ('POST', 'PUT', 'DELETE'):
        return False
    for p in MANAGER_ONLY_PATHS:
        if path == p or path.startswith(p + '/'):
            return True
    return False

# SSE (Server-Sent Events) for real-time kitchen updates
import queue
sse_clients = {}  # client_id -> queue
sse_counter = 0

def broadcast_sse(event_type, data):
    """Send event to all connected SSE clients"""
    msg = f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
    dead = []
    for cid, q in sse_clients.items():
        try:
            q.put_nowait(msg)
        except queue.Full:
            dead.append(cid)
    for cid in dead:
        sse_clients.pop(cid, None)

# Tables to migrate
TABLES = [
    'reservations', 'orders', 'expenses', 'inventory', 'staff',
    'shifts', 'menu', 'cashdrawers', 'waste', 'timeclock', 'tables', 'delivery'
]

PREFIXES = {
    'reservations': 'R', 'orders': 'O', 'expenses': 'E',
    'inventory': 'I', 'staff': 'S', 'shifts': 'SH',
    'menu': 'M', 'cashdrawers': 'CD', 'waste': 'W', 'timeclock': 'TC', 'tables': 'T', 'delivery': 'DL',
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS staff (
    id TEXT PRIMARY KEY,
    firstName TEXT NOT NULL,
    lastName TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    role TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    password_hash TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price REAL,
    cost REAL,
    modifiers TEXT,
    image TEXT DEFAULT '',
    description TEXT DEFAULT '',
    available BOOLEAN DEFAULT 1,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    items TEXT NOT NULL,
    total REAL,
    payment TEXT,
    type TEXT,
    table_id TEXT,
    customer TEXT,
    status TEXT DEFAULT 'new',
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tables (
    id TEXT PRIMARY KEY,
    number INTEGER,
    capacity INTEGER,
    section TEXT,
    status TEXT DEFAULT 'available',
    server_id TEXT,
    guest_count INTEGER DEFAULT 0,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS inventory (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    stock REAL DEFAULT 0,
    unit TEXT,
    min_level REAL DEFAULT 0,
    cost REAL DEFAULT 0,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    category TEXT,
    description TEXT,
    amount REAL,
    date TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS shifts (
    id TEXT PRIMARY KEY,
    staff_id TEXT,
    date TEXT,
    start_time TEXT,
    end_time TEXT,
    role TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS timeclock (
    id TEXT PRIMARY KEY,
    staff_id TEXT,
    date TEXT,
    clock_in TEXT,
    clock_out TEXT,
    hours REAL,
    status TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cashdrawers (
    id TEXT PRIMARY KEY,
    shift_id TEXT,
    opened_at TEXT,
    opening_balance REAL,
    cash_sales REAL,
    closing_balance REAL,
    expected REAL,
    variance REAL,
    status TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS waste (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    qty REAL,
    unit TEXT,
    reason TEXT,
    est_cost REAL,
    logged_by TEXT,
    date TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    name TEXT,
    phone TEXT,
    email TEXT,
    date TEXT,
    time TEXT,
    guests INTEGER,
    table_id TEXT,
    status TEXT,
    notes TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    staff_id TEXT,
    role TEXT,
    expires_at TIMESTAMP,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery (
    id TEXT PRIMARY KEY,
    orderId TEXT,
    customer TEXT,
    address TEXT,
    driver TEXT,
    status TEXT DEFAULT 'pending',
    eta TEXT,
    phone TEXT,
    notes TEXT,
    created TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
"""

def init_db():
    """Initialize SQLite database and migrate from JSON files"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    c.executescript(SCHEMA)
    
    # Add image column to existing menu table if missing
    try:
        c.execute("ALTER TABLE menu ADD COLUMN image TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # column already exists
    try:
        c.execute("ALTER TABLE menu ADD COLUMN description TEXT DEFAULT ''")
    except sqlite3.OperationalError:
        pass  # column already exists
    
    # Save password hashes before migration (INSERT OR REPLACE wipes them)
    c.execute("SELECT id, password_hash FROM staff WHERE password_hash IS NOT NULL")
    saved_hashes = {row['id']: row['password_hash'] for row in c.fetchall()}

    # Migrate staff first (needed for auth)
    migrate_json_to_table(conn, 'staff', [
        'id', 'firstName', 'lastName', 'email', 'phone', 'role', 'status', 'created'
    ])

    # Restore password hashes that were wiped by INSERT OR REPLACE
    for staff_id, pwd_hash in saved_hashes.items():
        c.execute("UPDATE staff SET password_hash = ? WHERE id = ?", (pwd_hash, staff_id))

    # Set default password for managers without one
    c.execute("SELECT id FROM staff WHERE role = 'Manager' AND (password_hash IS NULL OR password_hash = '')")
    for row in c.fetchall():
        # Default password: fufut2026 (should be changed on first login)
        pwd_hash = hash_password('futfut2026')
        c.execute("UPDATE staff SET password_hash = ? WHERE id = ?", (pwd_hash, row['id']))
    
    # Migrate other tables
    for table in TABLES:
        if table != 'staff':
            migrate_json_to_table(conn, table, get_table_columns(table))
    
    conn.commit()
    return conn

def get_table_columns(table):
    """Get column names for each table"""
    columns = {
        'menu': ['id', 'name', 'category', 'price', 'cost', 'modifiers', 'image', 'description', 'available', 'created'],
        'orders': ['id', 'items', 'total', 'payment', 'type', 'table_id', 'customer', 'status', 'created'],
        'tables': ['id', 'number', 'capacity', 'section', 'status', 'server_id', 'guest_count', 'created'],
        'inventory': ['id', 'name', 'category', 'stock', 'unit', 'min_level', 'cost', 'created'],
        'expenses': ['id', 'category', 'description', 'amount', 'date', 'created'],
        'shifts': ['id', 'staff_id', 'date', 'start_time', 'end_time', 'role', 'created'],
        'timeclock': ['id', 'staff_id', 'date', 'clock_in', 'clock_out', 'hours', 'status', 'created'],
        'cashdrawers': ['id', 'shift_id', 'opened_at', 'opening_balance', 'cash_sales', 'closing_balance', 'expected', 'variance', 'status', 'created'],
        'waste': ['id', 'item_id', 'qty', 'unit', 'reason', 'est_cost', 'logged_by', 'date', 'created'],
        'reservations': ['id', 'name', 'phone', 'email', 'date', 'time', 'guests', 'table_id', 'status', 'notes', 'created'],
        'delivery': ['id', 'orderId', 'customer', 'address', 'driver', 'status', 'eta', 'phone', 'notes', 'created'],
    }
    return columns.get(table, ['id', 'created'])

def migrate_json_to_table(conn, table, columns):
    """Migrate data from JSON file to SQLite table"""
    json_path = os.path.join(ROOT, f'{table}.json')
    if not os.path.exists(json_path):
        return
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except (json.JSONDecodeError, FileNotFoundError):
        return
    
    if not data:
        return
    
    c = conn.cursor()
    placeholders = ', '.join(['?'] * len(columns))
    col_names = ', '.join(columns)
    
    for item in data:
        values = []
        for col in columns:
            val = item.get(col)
            if isinstance(val, (list, dict)):
                val = json.dumps(val, ensure_ascii=False)
            values.append(val)
        
        try:
            c.execute(f'INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})', values)
        except sqlite3.Error as e:
            print(f"[MIGRATE ERROR] {table}: {e}")

def hash_password(password):
    """Hash password with SHA-256 (simple, no bcrypt dependency)"""
    salt = secrets.token_hex(16)
    pwd_hash = hashlib.sha256((password + salt).encode()).hexdigest()
    return f"{salt}:{pwd_hash}"

def verify_password(password, stored_hash):
    """Verify password against stored hash"""
    if not stored_hash or ':' not in stored_hash:
        return False
    salt, pwd_hash = stored_hash.split(':', 1)
    return hashlib.sha256((password + salt).encode()).hexdigest() == pwd_hash

def generate_token():
    """Generate secure session token"""
    return secrets.token_urlsafe(32)

def create_session(staff_id, role):
    """Create new session"""
    conn = sqlite3.connect(DB_PATH)
    token = generate_token()
    expires = datetime.now() + timedelta(days=30)
    conn.execute(
        'INSERT INTO sessions (token, staff_id, role, expires_at) VALUES (?, ?, ?, ?)',
        (token, staff_id, role, expires.isoformat())
    )
    conn.commit()
    conn.close()
    return token

def validate_session(token):
    """Validate session token"""
    if not token:
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        'SELECT * FROM sessions WHERE token = ? AND expires_at > ?',
        (token, datetime.now().isoformat())
    ).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def delete_session(token):
    """Delete session (logout)"""
    if token:
        conn = sqlite3.connect(DB_PATH)
        conn.execute('DELETE FROM sessions WHERE token = ?', (token,))
        conn.commit()
        conn.close()

def rate_limit_check(ip, limit=100, window=60):
    """Check rate limit for IP"""
    now = time.time()
    if ip not in rate_limits:
        rate_limits[ip] = []
    rate_limits[ip] = [t for t in rate_limits[ip] if now - t < window]
    if len(rate_limits[ip]) >= limit:
        return False
    rate_limits[ip].append(now)
    return True

ALLOWED_ORIGINS = {'http://localhost:3000', 'http://localhost:5173', 'http://localhost:5175', 'http://127.0.0.1:5173', 'http://127.0.0.1:5175'}

def get_origin(handler):
    origin = handler.headers.get('Origin', '')
    if origin in ALLOWED_ORIGINS:
        return origin
    # Allow private LAN IP ranges (192.168.x, 10.x, 172.16-31.x) for same-network access
    if origin.startswith(('http://192.168.', 'http://10.', 'http://172.16.', 'http://172.17.', 'http://172.18.', 'http://172.19.', 'http://172.20.', 'http://172.21.', 'http://172.22.', 'http://172.23.', 'http://172.24.', 'http://172.25.', 'http://172.26.', 'http://172.27.', 'http://172.28.', 'http://172.29.', 'http://172.30.', 'http://172.31.')):
        return origin
    return 'http://localhost:3000'

def send_json(handler, code, obj):
    try:
        handler.send_response(code)
        handler.send_header('Content-Type', 'application/json')
        handler.send_header('Access-Control-Allow-Origin', get_origin(handler))
        handler.send_header('Access-Control-Allow-Credentials', 'true')
        handler.end_headers()
        handler.wfile.write(json.dumps(obj, ensure_ascii=False).encode())
    except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
        pass  # Client disconnected, ignore

def read_body(handler):
    length = int(handler.headers.get('Content-Length', 0))
    return handler.rfile.read(length)

def parse_cookies(handler):
    """Parse cookies from request headers"""
    cookies = {}
    cookie_header = handler.headers.get('Cookie', '')
    for part in cookie_header.split(';'):
        part = part.strip()
        if '=' in part:
            k, v = part.split('=', 1)
            cookies[k] = v
    return cookies

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _api_route(self):
        for name in TABLES:
            if self.path == f'/api/{name}':
                return name
        return None

    def _get_auth(self):
        """Get authenticated user from session cookie"""
        cookies = parse_cookies(self)
        token = cookies.get('session')
        session = validate_session(token)
        if session:
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            staff = conn.execute('SELECT * FROM staff WHERE id = ?', (session['staff_id'],)).fetchone()
            conn.close()
            if staff and staff['status'] == 'active':
                return dict(staff), session['role']
        return None, None

    def _require_auth(self, required_roles=None):
        """Decorator-like check for authentication"""
        user, role = self._get_auth()
        if not user:
            return None, None
        if required_roles and role not in required_roles:
            return None, None
        return user, role

    def do_GET(self):
        # Rate limiting
        client_ip = self.client_address[0]
        if not rate_limit_check(client_ip):
            send_json(self, 429, {"ok": False, "error": "Rate limit exceeded"})
            return

        # Session validation for protected routes
        if self.path.startswith('/api/'):
            if self.path == '/api/auth/me':
                user, role = self._get_auth()
                if user:
                    send_json(self, 200, {"ok": True, "user": {k: v for k, v in user.items() if k != 'password_hash'}, "role": role})
                else:
                    send_json(self, 401, {"ok": False, "error": "Not authenticated"})
                return

            # Public endpoints (no auth required)
            PUBLIC_ENDPOINTS = ['/api/auth/login', '/api/content']
            if self.path in PUBLIC_ENDPOINTS:
                pass  # Allow through
            else:
                # Protect all other API routes — require auth
                user, role = self._get_auth()
                if not user:
                    send_json(self, 401, {"ok": False, "error": "Authentication required"})
                    return

                role_key = _normalize_role(role)
                if not role_key:
                    send_json(self, 403, {"ok": False, "error": "Unrecognized role"})
                    return

                # Manager-only path check (staff CRUD, password ops, settings, payroll)
                if _is_manager_only_path(self.path, 'GET'):
                    # GET on manager-only paths is still allowed if role matrix grants read
                    pass

        name = self._api_route()
        if name:
            # ── Role-based access check on GET ──
            user, role = self._get_auth()
            if user:
                role_key = _normalize_role(role)
                resource = _resource_for_path(self.path)
                if resource and not _role_can_access(role_key, resource, is_write=False):
                    send_json(self, 403, {"ok": False, "error": "Your role does not have access to this data"})
                    return

            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            rows = conn.execute(f'SELECT * FROM {name} ORDER BY created DESC').fetchall()
            conn.close()
            data = [dict(row) for row in rows]
            # Don't expose password hashes
            if name == 'staff':
                data = [{k: v for k, v in row.items() if k != 'password_hash'} for row in data]
                # Redact PII for non-managers
                role_key = _normalize_role(role) if user else None
                if role_key != 'manager':
                    data = [{k: v for k, v in row.items() if k not in ('phone', 'email')} for row in data]
            send_json(self, 200, data)
            return
        
        # Content API
        if self.path == '/api/content':
            content_path = os.path.join(ROOT, 'content.json')
            try:
                with open(content_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                send_json(self, 200, data)
            except (FileNotFoundError, json.JSONDecodeError):
                send_json(self, 200, {})
            return

        # SSE endpoint for real-time kitchen updates — require auth + role check
        if self.path == '/api/events/kitchen':
            user, role = self._get_auth()
            if not user:
                send_json(self, 401, {"ok": False, "error": "Authentication required"})
                return
            role_key = _normalize_role(role)
            if not _role_can_access(role_key, 'orders', is_write=False):
                send_json(self, 403, {"ok": False, "error": "Your role does not have access to kitchen events"})
                return
            self.handle_sse()
            return

        # SPA fallback: serve index.html for app routes that don't match a file
        # This enables client-side routing for /pos/, /backoffice/, /admin/
        for app_prefix in ['/pos/', '/backoffice/', '/admin/']:
            if self.path.startswith(app_prefix):
                # Strip query string
                path = self.path.split('?')[0]
                # If the path doesn't have a file extension, serve the app's index.html
                if '.' not in os.path.basename(path):
                    index_path = os.path.join(ROOT, app_prefix.lstrip('/'), 'index.html')
                    if os.path.exists(index_path):
                        try:
                            with open(index_path, 'rb') as f:
                                content = f.read()
                            self.send_response(200)
                            self.send_header('Content-Type', 'text/html; charset=utf-8')
                            self.send_header('Content-Length', str(len(content)))
                            self.end_headers()
                            self.wfile.write(content)
                            return
                        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                            pass
                break

        super().do_GET()

    def _read_json_body(self):
        body = read_body(self)
        return json.loads(body)

    def do_POST(self):
        client_ip = self.client_address[0]
        if not rate_limit_check(client_ip):
            send_json(self, 429, {"ok": False, "error": "Rate limit exceeded"})
            return

        body = read_body(self)
        try:
            data = json.loads(body) if body else {}
            if not isinstance(data, dict):
                raise ValueError("Expected JSON object")

            # Auth endpoints
            if self.path == '/api/auth/login':
                self.handle_login(data)
                return

            if self.path == '/api/auth/logout':
                self.handle_logout()
                return

            if self.path == '/api/auth/change-password':
                self.handle_change_password(data)
                return

            if self.path == '/api/auth/reset-password':
                self.handle_reset_password(data)
                return

            # Export endpoints
            if self.path == '/api/export/csv':
                self.handle_export_csv(data)
                return

            if self.path == '/api/export/receipt':
                self.handle_export_receipt(data)
                return

            # Content save — requires auth + manager role
            if self.path == '/save-content':
                user, role = self._get_auth()
                if not user:
                    send_json(self, 401, {"ok": False, "error": "Authentication required"})
                    return
                role_key = _normalize_role(role)
                if role_key != 'manager':
                    send_json(self, 403, {"ok": False, "error": "Manager access required"})
                    return
                out_path = os.path.join(ROOT, 'content.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                send_json(self, 200, {"ok": True, "path": out_path})
                print(f"[SAVED] content.json ({len(body)} bytes)")
                return

            # Regular API routes - require auth
            user, role = self._get_auth()
            if not user:
                send_json(self, 401, {"ok": False, "error": "Authentication required"})
                return

            role_key = _normalize_role(role)
            if not role_key:
                send_json(self, 403, {"ok": False, "error": "Unrecognized role"})
                return

            # Manager-only path check for POST/PUT/DELETE
            if _is_manager_only_path(self.path, 'POST'):
                if role_key != 'manager':
                    send_json(self, 403, {"ok": False, "error": "Manager access required"})
                    return

            name = self._api_route()
            if name:
                # Role-based access check on POST (create)
                resource = _resource_for_path(self.path)
                if resource and not _role_can_access(role_key, resource, is_write=True):
                    send_json(self, 403, {"ok": False, "error": "Your role does not have write access to this data"})
                    return
                self.handle_create(name, data, user)
                return

        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})
            print(f"[ERROR] {e}")
            return

        send_json(self, 404, {"ok": False, "error": "not found"})

    def handle_login(self, data):
        """Handle login with password verification (email or staffId)"""
        staff_id = data.get('staffId')
        email = data.get('email')
        password = data.get('password', '')
        
        if not staff_id and not email:
            send_json(self, 400, {"ok": False, "error": "Email or Staff ID required"})
            return
        
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        if email:
            staff = conn.execute('SELECT * FROM staff WHERE email = ? AND status = "active"', (email,)).fetchone()
        else:
            staff = conn.execute('SELECT * FROM staff WHERE id = ? AND status = "active"', (staff_id,)).fetchone()
        conn.close()
        
        if not staff:
            send_json(self, 401, {"ok": False, "error": "Invalid credentials"})
            return
        
        staff_dict = dict(staff)
        
        # Check password for managers (or anyone with password set)
        if staff_dict.get('password_hash') or staff_dict['role'] == 'Manager':
            if not password:
                send_json(self, 400, {"ok": False, "error": "Password required for this role"})
                return
            if not verify_password(password, staff_dict.get('password_hash', '')):
                send_json(self, 401, {"ok": False, "error": "Invalid credentials"})
                return
        
        # Create session
        token = create_session(staff_dict['id'], staff_dict['role'].lower().replace(' ', '-'))
        
        # Set httpOnly cookie
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', get_origin(self))
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.send_header('Set-Cookie', f'session={token}; HttpOnly; SameSite=Lax; Max-Age=2592000; Path=/')
            self.end_headers()

            response = {
                "ok": True,
                "user": {k: v for k, v in staff_dict.items() if k != 'password_hash'},
                "role": staff_dict['role'].lower().replace(' ', '-')
            }
            self.wfile.write(json.dumps(response).encode())
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass  # Client disconnected, ignore

    def handle_logout(self):
        """Handle logout"""
        cookies = parse_cookies(self)
        token = cookies.get('session')
        delete_session(token)
        try:
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', get_origin(self))
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.send_header('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/')
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode())
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass

    def handle_change_password(self, data):
        """Handle password change (manager-only, matching production API policy)"""
        user, role = self._get_auth()
        if not user:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return

        role_key = _normalize_role(role)
        if role_key != 'manager':
            send_json(self, 403, {"ok": False, "error": "Manager access required"})
            return

        current_password = data.get('currentPassword')
        new_password = data.get('newPassword')
        
        if not current_password or not new_password:
            send_json(self, 400, {"ok": False, "error": "Both current and new password required"})
            return
        
        if len(new_password) < 8:
            send_json(self, 400, {"ok": False, "error": "Password must be at least 8 characters"})
            return
        
        # Verify current password
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        staff = conn.execute('SELECT password_hash FROM staff WHERE id = ?', (user['id'],)).fetchone()
        conn.close()
        
        if staff and staff['password_hash']:
            if not verify_password(current_password, staff['password_hash']):
                send_json(self, 401, {"ok": False, "error": "Current password is incorrect"})
                return
        
        # Update password
        new_hash = hash_password(new_password)
        conn = sqlite3.connect(DB_PATH)
        conn.execute('UPDATE staff SET password_hash = ? WHERE id = ?', (new_hash, user['id']))
        conn.commit()
        conn.close()
        
        send_json(self, 200, {"ok": True, "message": "Password updated successfully"})

    def handle_reset_password(self, data):
        """Handle password reset (admin only)"""
        user, role = self._get_auth()
        if not user or role not in ['manager']:
            send_json(self, 403, {"ok": False, "error": "Manager access required"})
            return

        staff_id = data.get('staffId')
        new_password = data.get('newPassword', 'fufut2026')

        if not staff_id:
            send_json(self, 400, {"ok": False, "error": "Staff ID required"})
            return

        new_hash = hash_password(new_password)
        conn = sqlite3.connect(DB_PATH)
        conn.execute('UPDATE staff SET password_hash = ? WHERE id = ?', (new_hash, staff_id))
        conn.commit()
        conn.close()

        send_json(self, 200, {"ok": True, "message": f"Password reset for staff {staff_id}"})

    def handle_export_csv(self, data):
        """Export data as CSV — requires read access to the requested table"""
        user, role = self._get_auth()
        if not user:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return

        role_key = _normalize_role(role)
        table = data.get('table', 'orders')
        if table not in TABLES:
            send_json(self, 400, {"ok": False, "error": "Invalid table"})
            return

        # Role check: user must have read access to this table's resource
        if not _role_can_access(role_key, table, is_write=False):
            send_json(self, 403, {"ok": False, "error": "Your role does not have access to export this data"})
            return

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(f'SELECT * FROM {table} ORDER BY created DESC').fetchall()
        conn.close()

        if not rows:
            send_json(self, 200, {"ok": True, "csv": "", "count": 0})
            return

        # Generate CSV
        headers = rows[0].keys()
        csv_lines = [','.join(headers)]
        for row in rows:
            values = []
            for h in headers:
                v = row[h]
                if v is None:
                    v = ''
                elif isinstance(v, (list, dict)):
                    v = json.dumps(v, ensure_ascii=False)
                v = str(v).replace('"', '""')
                values.append(f'"{v}"')
            csv_lines.append(','.join(values))

        csv_content = '\n'.join(csv_lines)
        send_json(self, 200, {"ok": True, "csv": csv_content, "count": len(rows)})

    def handle_export_receipt(self, data):
        """Generate receipt HTML for printing"""
        user, role = self._get_auth()
        if not user:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return

        order_id = data.get('orderId')
        if not order_id:
            send_json(self, 400, {"ok": False, "error": "Order ID required"})
            return

        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        order = conn.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        conn.close()

        if not order:
            send_json(self, 404, {"ok": False, "error": "Order not found"})
            return

        order_dict = dict(order)
        send_json(self, 200, {"ok": True, "order": order_dict})

    def handle_create(self, name, data, user):
        """Handle POST to create new record"""
        conn = sqlite3.connect(DB_PATH)
        prefix = PREFIXES.get(name, 'X')
        entry = dict(data)
        entry["id"] = prefix + str(uuid.uuid4())[:8]
        if "created" not in entry:
            entry["created"] = datetime.now().isoformat()
        
        columns = get_table_columns(name)
        # Filter entry to only valid columns
        filtered = {k: v for k, v in entry.items() if k in columns}
        
        placeholders = ', '.join(['?'] * len(filtered))
        col_names = ', '.join(filtered.keys())
        values = []
        for v in filtered.values():
            if isinstance(v, (list, dict)):
                v = json.dumps(v, ensure_ascii=False)
            values.append(v)
        
        try:
            conn.execute(f'INSERT INTO {name} ({col_names}) VALUES ({placeholders})', values)
            conn.commit()
            send_json(self, 200, {"ok": True, "id": entry["id"]})
            print(f"[{name.upper()}] {entry.get('name', entry['id'])}")
            # Broadcast SSE events for kitchen-related tables
            if name == 'orders':
                broadcast_sse('new_order', entry)
            elif name == 'tables':
                broadcast_sse('table_update', entry)
        except sqlite3.Error as e:
            send_json(self, 400, {"ok": False, "error": str(e)})
        finally:
            conn.close()

    def do_PUT(self):
        client_ip = self.client_address[0]
        if not rate_limit_check(client_ip):
            send_json(self, 429, {"ok": False, "error": "Rate limit exceeded"})
            return

        user, role = self._get_auth()
        if not user:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return

        role_key = _normalize_role(role)
        if not role_key:
            send_json(self, 403, {"ok": False, "error": "Unrecognized role"})
            return

        # Manager-only path check
        if _is_manager_only_path(self.path, 'PUT'):
            if role_key != 'manager':
                send_json(self, 403, {"ok": False, "error": "Manager access required"})
                return

        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
            return

        # Role-based access check on PUT (update)
        resource = _resource_for_path(self.path)
        if resource and not _role_can_access(role_key, resource, is_write=True):
            send_json(self, 403, {"ok": False, "error": "Your role does not have write access to this data"})
            return

        try:
            data = self._read_json_body()
            item_id = data.get("id")
            if not item_id:
                send_json(self, 400, {"ok": False, "error": "id required"})
                return
            
            conn = sqlite3.connect(DB_PATH)
            conn.row_factory = sqlite3.Row
            existing = conn.execute(f'SELECT * FROM {name} WHERE id = ?', (item_id,)).fetchone()
            if not existing:
                send_json(self, 404, {"ok": False, "error": "item not found"})
                conn.close()
                return
            
            # Preserve created timestamp
            if "created" not in data and "created" in dict(existing):
                data["created"] = dict(existing)["created"]
            
            columns = get_table_columns(name)
            filtered = {k: v for k, v in data.items() if k in columns}
            
            set_clause = ', '.join([f'{k} = ?' for k in filtered.keys()])
            values = []
            for v in filtered.values():
                if isinstance(v, (list, dict)):
                    v = json.dumps(v, ensure_ascii=False)
                values.append(v)
            values.append(item_id)
            
            conn.execute(f'UPDATE {name} SET {set_clause} WHERE id = ?', values)
            conn.commit()
            conn.close()
            
            send_json(self, 200, {"ok": True})
            print(f"[{name.upper()} UPDATED] {item_id}")
            # Broadcast SSE events for kitchen-related updates
            if name == 'orders':
                broadcast_sse('order_update', data)
            elif name == 'tables':
                broadcast_sse('table_update', data)
        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})

    def do_DELETE(self):
        client_ip = self.client_address[0]
        if not rate_limit_check(client_ip):
            send_json(self, 429, {"ok": False, "error": "Rate limit exceeded"})
            return

        user, role = self._get_auth()
        if not user:
            send_json(self, 401, {"ok": False, "error": "Authentication required"})
            return

        role_key = _normalize_role(role)
        if not role_key:
            send_json(self, 403, {"ok": False, "error": "Unrecognized role"})
            return

        # Manager-only path check
        if _is_manager_only_path(self.path, 'DELETE'):
            if role_key != 'manager':
                send_json(self, 403, {"ok": False, "error": "Manager access required"})
                return

        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
            return

        # Role-based access check on DELETE
        resource = _resource_for_path(self.path)
        if resource and not _role_can_access(role_key, resource, is_write=True):
            send_json(self, 403, {"ok": False, "error": "Your role does not have write access to this data"})
            return

        try:
            data = self._read_json_body()
            item_id = data.get("id")
            if not item_id:
                send_json(self, 400, {"ok": False, "error": "id required"})
                return
            
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.execute(f'DELETE FROM {name} WHERE id = ?', (item_id,))
            conn.commit()
            deleted = cursor.rowcount
            conn.close()
            
            if deleted == 0:
                send_json(self, 404, {"ok": False, "error": "item not found"})
                return
            
            send_json(self, 200, {"ok": True})
            print(f"[{name.upper()} DELETED] {item_id}")
        except Exception as e:
            send_json(self, 400, {"ok": False, "error": str(e)})

    def handle_sse(self):
        """Handle Server-Sent Events connection for kitchen updates"""
        global sse_counter
        sse_counter += 1
        client_id = sse_counter
        q = queue.Queue(maxsize=50)
        sse_clients[client_id] = q

        try:
            # Send headers
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', get_origin(self))
            self.send_header('Access-Control-Allow-Credentials', 'true')
            self.end_headers()

            # Send initial keepalive
            self.wfile.write(b"event: connected\ndata: {\"ok\":true}\n\n")
            self.wfile.flush()

            # Keep connection alive and send events
            while True:
                try:
                    msg = q.get(timeout=30)
                    self.wfile.write(msg.encode('utf-8'))
                    self.wfile.flush()
                except queue.Empty:
                    # Send keepalive comment
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError):
                    break
        finally:
            sse_clients.pop(client_id, None)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', get_origin(self))
        self.send_header('Access-Control-Allow-Credentials', 'true')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        msg = str(args)
        if any(x in msg for x in ['POST', 'GET /api/', 'ERROR', 'SAVED', 'RESERVATION', 'ORDER', 'LOGIN']):
            super().log_message(format, *args)

if __name__ == '__main__':
    # Initialize database on startup
    print("Initializing database...")
    init_db()
    print(f"Database ready: {DB_PATH}")
    
    print(f"FU FUT COFFEE — http://localhost:{PORT}")
    print(f"Static root: {ROOT}")
    print("Endpoints:")
    for name in TABLES:
        print(f"  GET/POST/PUT/DELETE /api/{name}")
    print("  POST /api/auth/login")
    print("  POST /api/auth/logout")
    print("  GET /api/auth/me")
    print("  POST /api/auth/change-password")
    print("  POST /save-content -> content.json")
    print("Press Ctrl+C to stop\n")
    with http.server.ThreadingHTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")