"""
server.py
PEA Construction & Disbursement Dashboard (PSCTM)
Central HTTP server with disk persistence, upload history and multi-machine sync.

Data layout (all files are plain static files, so they also work on Vercel after `git push`):
  data/latest_data.json        -> current dashboard dataset
  data/latest_uploaded.xlsx    -> current original Excel file
  data/metadata.json           -> info about the current dataset (used for change detection)
  data/upload_history.json     -> list of previous uploads (newest first)
  data/history/<id>.json       -> snapshot of each upload
  data/history/<id>.xlsx       -> original Excel of each upload
"""

import http.server
import socketserver
import webbrowser
import os
import re
import sys
import json
import socket
import shutil
import subprocess
import threading
import urllib.parse
import time

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, "data")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
DATA_FILE = os.path.join(DATA_DIR, "latest_data.json")
EXCEL_FILE = os.path.join(DATA_DIR, "latest_uploaded.xlsx")
META_FILE = os.path.join(DATA_DIR, "metadata.json")
HISTORY_INDEX = os.path.join(DATA_DIR, "upload_history.json")

MAX_HISTORY = 20          # keep the repository small when publishing to GitHub
ID_PATTERN = re.compile(r'^[A-Za-z0-9_\-]+$')

os.makedirs(HISTORY_DIR, exist_ok=True)
_lock = threading.Lock()
_publish_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def get_local_ips():
    """Detect LAN IP addresses for network sharing across computers"""
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('10.255.255.255', 1))  # no packet is actually sent
        ip = s.getsockname()[0]
        if ip and not ip.startswith('127.'):
            ips.append(ip)
        s.close()
    except Exception:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
    return ips or ['127.0.0.1']


def write_atomic(path, data_bytes):
    tmp = path + ".tmp"
    with open(tmp, 'wb') as f:
        f.write(data_bytes)
    os.replace(tmp, path)


def write_json(path, obj):
    write_atomic(path, json.dumps(obj, ensure_ascii=False, indent=2).encode('utf-8'))


def read_json(path, default=None):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return default


def load_history():
    data = read_json(HISTORY_INDEX, [])
    return data if isinstance(data, list) else []


def save_history(entries):
    # Prune old snapshots beyond MAX_HISTORY
    keep, drop = entries[:MAX_HISTORY], entries[MAX_HISTORY:]
    for old in drop:
        for ext in ('.json', '.xlsx'):
            p = os.path.join(HISTORY_DIR, f"{old.get('id')}{ext}")
            if os.path.exists(p):
                try:
                    os.remove(p)
                except Exception:
                    pass
    write_json(HISTORY_INDEX, keep)


def run_git(args, timeout=90):
    env = dict(os.environ, GIT_TERMINAL_PROMPT='0')
    proc = subprocess.run(['git'] + args, cwd=DIRECTORY, capture_output=True,
                          text=True, encoding='utf-8', errors='replace',
                          timeout=timeout, env=env)
    return proc.returncode, (proc.stdout or '') + (proc.stderr or '')


def publish_to_github():
    """Commit data/ and push to GitHub -> Vercel redeploys the public website."""
    with _publish_lock:
        log = []
        code, out = run_git(['add', 'data'])
        log.append(out)
        if code != 0:
            return False, 'git add ล้มเหลว', ''.join(log)

        code, _ = run_git(['diff', '--cached', '--quiet'])
        if code != 0:  # there are staged changes
            meta = read_json(META_FILE, {}) or {}
            msg = f"data: publish dashboard data ({meta.get('fileName', 'reset')}) {time.strftime('%Y-%m-%d %H:%M')}"
            code, out = run_git(['commit', '-m', msg])
            log.append(out)
            if code != 0:
                return False, 'git commit ล้มเหลว', ''.join(log)

        code, out = run_git(['pull', '--rebase', '--autostash', 'origin', 'main'])
        log.append(out)
        if code != 0:
            run_git(['rebase', '--abort'])
            return False, 'git pull ล้มเหลว (อาจมีไฟล์ขัดแย้งบน GitHub)', ''.join(log)

        code, out = run_git(['push', 'origin', 'HEAD:main'])
        log.append(out)
        if code != 0:
            return False, 'git push ล้มเหลว (ตรวจสอบอินเทอร์เน็ต/สิทธิ์ GitHub บนเครื่องนี้)', ''.join(log)

        return True, 'เผยแพร่ขึ้น GitHub สำเร็จ เว็บสาธารณะ (Vercel) จะอัปเดตภายในประมาณ 1 นาที', ''.join(log)


class DashboardServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = False   # on Windows, True would let 2 servers share a port
    daemon_threads = True


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------
class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status_code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def read_body(self):
        length = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(length) if length > 0 else b''

    # ----------------------------- GET ------------------------------------
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/server-info':
            self.handle_server_info()
        elif path == '/api/data':
            self.handle_get_data()
        elif path == '/api/status':
            meta = read_json(META_FILE)
            self.send_json(200, dict(meta, hasCustomData=True) if meta else {'hasCustomData': False})
        elif path == '/api/history':
            self.send_json(200, load_history())
        elif path == '/api/download-excel':
            self.handle_download_excel()
        else:
            super().do_GET()

    def handle_server_info(self):
        local_ips = get_local_ips()
        self.send_json(200, {
            'serverMode': True,
            'port': PORT,
            'hostname': socket.gethostname(),
            'localIps': local_ips,
            'localUrl': f"http://localhost:{PORT}/index.html",
            'networkUrls': [f"http://{ip}:{PORT}/index.html" for ip in local_ips],
            'serverTime': int(time.time() * 1000)
        })

    def handle_get_data(self):
        if not os.path.exists(DATA_FILE):
            self.send_json(200, {'hasData': False})
            return
        with open(DATA_FILE, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def handle_download_excel(self):
        if not os.path.exists(EXCEL_FILE):
            self.send_json(404, {'error': 'No uploaded Excel file found on server'})
            return
        meta = read_json(META_FILE, {}) or {}
        filename = meta.get('fileName') or 'latest_uploaded.xlsx'
        with open(EXCEL_FILE, 'rb') as f:
            content = f.read()
        self.send_response(200)
        self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        self.send_header('Content-Disposition',
                         f"attachment; filename=\"latest_uploaded.xlsx\"; filename*=UTF-8''{urllib.parse.quote(filename)}")
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    # ----------------------------- POST -----------------------------------
    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        try:
            if path in ('/api/save-data', '/api/data'):
                self.handle_save_data()
            elif path == '/api/upload-excel':
                self.handle_upload_excel((query.get('id') or [''])[0])
            elif path == '/api/restore':
                self.handle_restore((query.get('id') or [''])[0])
            elif path == '/api/reset':
                self.handle_reset()
            elif path == '/api/publish':
                self.handle_publish()
            else:
                self.send_json(404, {'error': 'Endpoint not found'})
        except Exception as e:
            print(f"  [Server Error] {path}: {e}")
            self.send_json(500, {'error': str(e)})

    def handle_save_data(self):
        body = self.read_body()
        if not body:
            self.send_json(400, {'error': 'Empty request body'})
            return
        data = json.loads(body.decode('utf-8'))
        data.pop('_storageSource', None)

        now_ms = int(time.time() * 1000)
        upload_id = time.strftime('%Y%m%d_%H%M%S') + f"_{now_ms % 1000:03d}"
        data['savedAt'] = now_ms
        data['uploadId'] = upload_id
        uploaded_by = str(data.get('uploadedBy') or '').strip()[:60]

        entry = {
            'id': upload_id,
            'fileName': data.get('fileName', 'ข้อมูลนำเข้า.xlsx'),
            'lastUpdated': data.get('lastUpdated', ''),
            'savedAt': now_ms,
            'savedAtText': time.strftime('%d/%m/%Y %H:%M:%S'),
            'uploadedBy': uploaded_by,
            'clientIp': self.client_address[0],
            'hasExcel': False,
            'stats': {
                'transmissionLines': len(data.get('transmissionLines') or []),
                'substations': len(data.get('substationsDetail') or []),
                'permits': len(data.get('permits') or []),
            }
        }

        with _lock:
            payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
            write_atomic(DATA_FILE, payload)
            write_atomic(os.path.join(HISTORY_DIR, f"{upload_id}.json"), payload)
            write_json(META_FILE, {k: entry[k] for k in ('id', 'fileName', 'lastUpdated', 'savedAt', 'savedAtText', 'uploadedBy')})
            # A new upload replaces the old Excel; it will be re-sent by /api/upload-excel
            if os.path.exists(EXCEL_FILE):
                os.remove(EXCEL_FILE)
            history = load_history()
            history.insert(0, entry)
            save_history(history)

        print(f"  [Upload] {self.client_address[0]} ({uploaded_by or '-'}) -> '{entry['fileName']}' id={upload_id}")
        self.send_json(200, {'success': True, 'id': upload_id, 'savedAt': now_ms, 'fileName': entry['fileName']})

    def handle_upload_excel(self, upload_id):
        file_data = self.read_body()
        if not file_data:
            self.send_json(400, {'error': 'Empty file content'})
            return
        with _lock:
            write_atomic(EXCEL_FILE, file_data)
            if upload_id and ID_PATTERN.match(upload_id):
                write_atomic(os.path.join(HISTORY_DIR, f"{upload_id}.xlsx"), file_data)
                history = load_history()
                for h in history:
                    if h.get('id') == upload_id:
                        h['hasExcel'] = True
                save_history(history)
        self.send_json(200, {'success': True})

    def handle_restore(self, upload_id):
        if not upload_id or not ID_PATTERN.match(upload_id):
            self.send_json(400, {'error': 'Invalid id'})
            return
        snap_path = os.path.join(HISTORY_DIR, f"{upload_id}.json")
        if not os.path.exists(snap_path):
            self.send_json(404, {'error': 'ไม่พบข้อมูลย้อนหลังที่เลือก'})
            return
        with _lock:
            data = read_json(snap_path, {})
            now_ms = int(time.time() * 1000)
            data['savedAt'] = now_ms          # makes other clients detect the change
            data['restoredFrom'] = upload_id
            write_atomic(DATA_FILE, json.dumps(data, ensure_ascii=False).encode('utf-8'))
            xlsx = os.path.join(HISTORY_DIR, f"{upload_id}.xlsx")
            if os.path.exists(xlsx):
                shutil.copyfile(xlsx, EXCEL_FILE)
            elif os.path.exists(EXCEL_FILE):
                os.remove(EXCEL_FILE)
            entry = next((h for h in load_history() if h.get('id') == upload_id), {})
            write_json(META_FILE, {
                'id': upload_id,
                'fileName': data.get('fileName', ''),
                'lastUpdated': data.get('lastUpdated', ''),
                'savedAt': now_ms,
                'savedAtText': time.strftime('%d/%m/%Y %H:%M:%S'),
                'uploadedBy': entry.get('uploadedBy', ''),
                'restoredFrom': upload_id
            })
        print(f"  [Restore] {self.client_address[0]} restored id={upload_id}")
        self.send_json(200, {'success': True, 'savedAt': now_ms})

    def handle_reset(self):
        with _lock:
            for p in (DATA_FILE, EXCEL_FILE, META_FILE):
                if os.path.exists(p):
                    os.remove(p)
        print(f"  [Reset] by {self.client_address[0]} (history kept)")
        self.send_json(200, {'success': True})

    def handle_publish(self):
        print(f"  [Publish] requested by {self.client_address[0]} ...")
        try:
            ok, message, log = publish_to_github()
        except FileNotFoundError:
            ok, message, log = False, 'ไม่พบโปรแกรม git บนเครื่องเซิร์ฟเวอร์', ''
        except subprocess.TimeoutExpired:
            ok, message, log = False, 'git ใช้เวลานานเกินไป (timeout)', ''
        print(f"  [Publish] {'OK' if ok else 'FAILED'}: {message}")
        if log.strip():
            print('    ' + log.strip().replace('\n', '\n    '))
        self.send_json(200 if ok else 500, {'success': ok, 'message': message, 'log': log[-2000:]})


# ---------------------------------------------------------------------------
def run_server():
    os.chdir(DIRECTORY)
    global PORT
    local_ips = get_local_ips()

    server = None
    while PORT < 8095:
        try:
            server = DashboardServer(("0.0.0.0", PORT), DashboardHandler)
            break
        except OSError:
            PORT += 1

    if not server:
        print("[ERROR] ไม่สามารถเปิดเซิร์ฟเวอร์บนพอร์ต 8080 - 8094 ได้")
        sys.exit(1)

    with server:
        local_url = f"http://localhost:{PORT}/index.html"
        print("=" * 72)
        print("  PEA Construction & Disbursement Dashboard (PSCTM)")
        print("=" * 72)
        print(f"  -> เครื่องนี้ (Local):              {local_url}")
        for ip in local_ips:
            print(f"  -> เครื่องอื่นในเครือข่าย (LAN):     http://{ip}:{PORT}/index.html")
        print("-" * 72)
        print("  * อัปโหลดจากเครื่องใดก็ได้ ข้อมูลจะถูกบันทึกที่เซิร์ฟเวอร์นี้ + เก็บประวัติ")
        print("  * กดปุ่ม 'เผยแพร่ขึ้นเว็บ' หรือรัน publish_data.bat เพื่อให้คนข้างนอกเห็น")
        print("=" * 72)
        print("  กด Ctrl+C เพื่อหยุดเซิร์ฟเวอร์")
        print("=" * 72)

        if '--no-browser' not in sys.argv:
            webbrowser.open(local_url)
        server.serve_forever()


if __name__ == '__main__':
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nเซิร์ฟเวอร์หยุดทำงานเรียบร้อยแล้ว (Server stopped).")
        sys.exit(0)
