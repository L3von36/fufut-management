"""
FU FUT COFFEE — Development Server
Serves static files + REST API for content, reservations, orders, expenses, inventory, staff, shifts

Content Management Features:
  - Draft / Publish workflow
  - Version history with rollback
  - Scheduled publishing
  - Section layout (dynamic zones — visibility + order)
"""
import http.server
import json
import os
import sys
import uuid
import re
from datetime import datetime, timezone
from urllib.parse import urlparse, parse_qs

PORT = 3000
ROOT = os.path.dirname(os.path.abspath(__file__))

FILES = {
    'reservations': os.path.join(ROOT, 'reservations.json'),
    'orders':       os.path.join(ROOT, 'orders.json'),
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

CONTENT_FILE = os.path.join(ROOT, 'content.json')
DRAFT_FILE = os.path.join(ROOT, 'content-draft.json')
VERSIONS_FILE = os.path.join(ROOT, 'content-versions.json')

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
        'status': 'published',  # or 'draft'
        'content': content
    }
    versions.append(entry)
    # Keep last 50 versions max
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
            # Publish it
            publishable = strip_meta(draft)
            save_json(CONTENT_FILE, publishable)
            create_version(publishable, note='Scheduled auto-publish')
            # Clear draft
            os.remove(DRAFT_FILE)
            print(f"[AUTO-PUBLISH] Scheduled content published at {now_iso()}")
    except Exception as e:
        print(f"[AUTO-PUBLISH ERROR] {e}")

PREFIXES = {
    'reservations': 'R', 'orders': 'O', 'expenses': 'E',
    'inventory': 'I', 'staff': 'S', 'shifts': 'SH',
    'menu': 'M', 'cashdrawers': 'CD', 'waste': 'W', 'timeclock': 'TC', 'tables': 'T',
}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _api_route(self):
        for name in FILES:
            if self.path == f'/api/{name}':
                return name
        return None

    def _parse_path(self):
        """Parse URL path and query parameters."""
        parsed = urlparse(self.path)
        path = parsed.path
        params = parse_qs(parsed.query)
        return path, {k: v[0] for k, v in params.items()}

    def do_GET(self):
        path, params = self._parse_path()

        # === CONTENT ENDPOINTS ===

        # GET /api/content — returns published content (backward compatible)
        # GET /api/content?draft=true — returns draft content
        # GET /api/content?preview=true — returns draft content (for preview mode)
        if path == '/api/content':
            is_draft = params.get('draft') == 'true' or params.get('preview') == 'true'
            if is_draft:
                content = load_json(DRAFT_FILE, default=None)
                if content is None:
                    # No draft exists, return published as fallback
                    content = load_json(CONTENT_FILE, default={})
                send_json(self, 200, strip_meta(content))
            else:
                # Check scheduled publish first
                check_scheduled_publish()
                content = load_json(CONTENT_FILE, default={})
                send_json(self, 200, strip_meta(content))
            return

        # GET /api/content/versions — list version history
        if path == '/api/content/versions':
            versions = load_versions()
            # Return lite list (without full content payloads for speed)
            lite = [{
                'id': v['id'],
                'timestamp': v['timestamp'],
                'note': v['note'],
                'status': v['status']
            } for v in reversed(versions)]  # newest first
            send_json(self, 200, lite)
            return

        # GET /api/content/versions/:id — get full content of a specific version
        if path.startswith('/api/content/versions/'):
            vid = path.split('/')[-1]
            versions = load_versions()
            for v in reversed(versions):
                if v['id'] == vid:
                    send_json(self, 200, {
                        'id': v['id'],
                        'timestamp': v['timestamp'],
                        'note': v['note'],
                        'status': v['status'],
                        'content': strip_meta(v['content'])
                    })
                    return
            send_json(self, 404, {"ok": False, "error": "Version not found"})
            return

        # GET /api/content/status — get draft/publish status
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

        name = self._api_route()
        if name:
            send_json(self, 200, load_json(FILES[name]))
            return
        super().do_GET()

    def _read_json_body(self):
        body = read_body(self)
        return json.loads(body)

    def do_POST(self):
        body = read_body(self)
        path = self.path
        try:
            data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError("Expected JSON object")

            # === LEGACY: POST /api/save-content or /save-content ===
            # Still works — saves as BOTH draft AND creates a version (backward compatible)
            if path == '/api/save-content' or path == '/save-content':
                clean = strip_meta(data)
                # Save as published (backward compatible behavior)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Save (legacy)')
                print(f"[SAVED] content.json ({len(body)} bytes) — version {vid}")
                send_json(self, 200, {"ok": True, "version": vid})
                return

            # === POST /api/content/draft — save as draft (does NOT affect published) ===
            if path == '/api/content/draft':
                data['_meta'] = {
                    'updated_at': now_iso(),
                    'status': 'draft',
                    'scheduled_at': data.pop('_scheduled_at', None)
                }
                save_json(DRAFT_FILE, data)
                send_json(self, 200, {"ok": True, "message": "Draft saved"})
                print(f"[DRAFT] content-draft.json saved")
                return

            # === POST /api/content/publish — publish current draft to live ===
            if path == '/api/content/publish':
                draft = load_json(DRAFT_FILE, default=None)
                if draft is None:
                    send_json(self, 400, {"ok": False, "error": "No draft to publish"})
                    return
                clean = strip_meta(draft)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Published from draft')
                # Remove draft file
                try:
                    os.remove(DRAFT_FILE)
                except FileNotFoundError:
                    pass
                send_json(self, 200, {"ok": True, "version": vid, "message": "Content published"})
                print(f"[PUBLISHED] content.json updated — version {vid}")
                return

            # === POST /api/content/schedule — schedule draft for future publishing ===
            if path == '/api/content/schedule':
                scheduled_at = data.get('scheduled_at')
                if not scheduled_at:
                    send_json(self, 400, {"ok": False, "error": "scheduled_at is required"})
                    return
                # Validate datetime
                try:
                    datetime.fromisoformat(scheduled_at.replace('Z', '+00:00'))
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

            # === POST /api/content/discard — discard current draft ===
            if path == '/api/content/discard':
                try:
                    os.remove(DRAFT_FILE)
                except FileNotFoundError:
                    pass
                send_json(self, 200, {"ok": True, "message": "Draft discarded"})
                print(f"[DISCARDED] Draft removed")
                return

            # === POST /api/content/rollback/:id — rollback to a specific version ===
            if path.startswith('/api/content/rollback/'):
                vid = path.split('/')[-1]
                versions = load_versions()
                for v in versions:
                    if v['id'] == vid:
                        clean = strip_meta(v['content'])
                        save_json(CONTENT_FILE, clean)
                        # Also save as new version (marks the rollback point)
                        new_vid = create_version(clean, note=f'Rollback to {vid}')
                        # Clear any draft
                        try:
                            os.remove(DRAFT_FILE)
                        except FileNotFoundError:
                            pass
                        send_json(self, 200, {"ok": True, "version": new_vid, "message": f"Rolled back to {vid}"})
                        print(f"[ROLLBACK] Restored version {vid}, new version {new_vid}")
                        return
                send_json(self, 404, {"ok": False, "error": "Version not found"})
                return

            # === POST /api/content/save-and-publish — save content AND publish in one step ===
            if path == '/api/content/save-and-publish':
                clean = strip_meta(data)
                save_json(CONTENT_FILE, clean)
                vid = create_version(clean, note='Save & Publish')
                # Clear any draft
                try:
                    os.remove(DRAFT_FILE)
                except FileNotFoundError:
                    pass
                send_json(self, 200, {"ok": True, "version": vid, "message": "Saved and published"})
                print(f"[SAVE+PUBLISH] content.json — version {vid}")
                return

            name = self._api_route()
            if name:
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

    def do_PUT(self):
        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
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

    def do_DELETE(self):
        name = self._api_route()
        if not name:
            send_json(self, 404, {"ok": False, "error": "not found"})
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
        if any(x in msg for x in ['POST', 'GET /api/', 'ERROR', 'SAVED', 'PUBLISHED', 'DRAFT', 'ROLLBACK', 'RESERVATION', 'ORDER']):
            super().log_message(format, *args)

if __name__ == '__main__':
    print(f"FU FUT COFFEE — http://localhost:{PORT}")
    print(f"Static root: {ROOT}")
    print("Endpoints:")
    for name in FILES:
        print(f"  GET/POST /api/{name} -> {name}.json")
    print("  Content Management:")
    print("    GET  /api/content              -> Published content (backward compat)")
    print("    GET  /api/content?draft=true   -> Draft content")
    print("    GET  /api/content?preview=true -> Draft content (preview mode)")
    print("    GET  /api/content/status      -> Draft/publish status")
    print("    GET  /api/content/versions    -> Version history (lite)")
    print("    GET  /api/content/versions/:id -> Full version content")
    print("    POST /api/content/draft       -> Save as draft")
    print("    POST /api/content/publish     -> Publish draft to live")
    print("    POST /api/content/schedule    -> Schedule draft for future publish")
    print("    POST /api/content/discard     -> Discard current draft")
    print("    POST /api/content/rollback/:id -> Rollback to version")
    print("    POST /api/content/save-and-publish -> Save + publish in one step")
    print("    POST /api/save-content         -> Legacy: save and publish (backward compat)")
    print("Press Ctrl+C to stop\n")
    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
