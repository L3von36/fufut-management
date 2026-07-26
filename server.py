"""
FU FUT COFFEE — Development Server
Serves static files + REST API for content, reservations, orders, expenses, inventory, staff, shifts
"""
import http.server
import json
import os
import sys
import uuid
from datetime import datetime

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

def load_json(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []

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

    def do_GET(self):
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
        try:
            data = json.loads(body)
            if not isinstance(data, dict):
                raise ValueError("Expected JSON object")

            if self.path == '/save-content':
                out_path = os.path.join(ROOT, 'content.json')
                with open(out_path, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                send_json(self, 200, {"ok": True, "path": out_path})
                print(f"[SAVED] content.json ({len(body)} bytes)")
                return

            name = self._api_route()
            if name:
                items = load_json(FILES[name])
                prefix = PREFIXES[name]
                entry = dict(data)
                entry["id"] = prefix + str(uuid.uuid4())[:8]
                if "created" not in entry:
                    entry["created"] = datetime.now().isoformat()
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
                    # Preserve original created timestamp if not provided
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
        if any(x in msg for x in ['POST', 'GET /api/', 'ERROR', 'SAVED', 'RESERVATION', 'ORDER']):
            super().log_message(format, *args)

if __name__ == '__main__':
    print(f"FU FUT COFFEE — http://localhost:{PORT}")
    print(f"Static root: {ROOT}")
    print("Endpoints:")
    for name in FILES:
        print(f"  GET/POST /api/{name} -> {name}.json")
    print("  POST /save-content -> content.json")
    print("Press Ctrl+C to stop\n")
    with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
