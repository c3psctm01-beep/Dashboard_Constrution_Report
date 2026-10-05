"""
server.py
PEA Construction & Disbursement Dashboard (PSCTM)
Central HTTP server with disk persistence and multi-machine sync
"""

import http.server
import socketserver
import webbrowser
import os
import sys
import json
import socket
import urllib.parse
import time

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(DIRECTORY, "data")
DATA_FILE = os.path.join(DATA_DIR, "latest_data.json")
EXCEL_FILE = os.path.join(DATA_DIR, "latest_uploaded.xlsx")
META_FILE = os.path.join(DATA_DIR, "metadata.json")

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

def get_local_ips():
    """Detect LAN IP addresses for network sharing across computers"""
    ips = []
    # Primary probe via UDP socket (does not transmit packets)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(0.5)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        if ip and not ip.startswith('127.'):
            ips.append(ip)
        s.close()
    except Exception:
        pass

    # Secondary lookup via hostname
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith('127.') and ip not in ips:
                ips.append(ip)
    except Exception:
        pass

    return ips or ['127.0.0.1']

class ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads = True

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and disable aggressive caching for live sync
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE')
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

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/data':
            self.handle_api_get_data()
        elif path == '/api/status':
            self.handle_api_status()
        elif path == '/api/server-info':
            self.handle_api_server_info()
        elif path == '/api/download-excel':
            self.handle_api_download_excel()
        else:
            super().do_GET()

    def handle_api_get_data(self):
        if os.path.exists(DATA_FILE):
            try:
                with open(DATA_FILE, 'rb') as f:
                    content = f.read()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_json(500, {'hasData': False, 'error': str(e)})
        else:
            self.send_json(200, {'hasData': False, 'message': 'No saved server dataset'})

    def handle_api_status(self):
        if os.path.exists(DATA_FILE):
            try:
                mtime = int(os.path.getmtime(DATA_FILE) * 1000)
                size = os.path.getsize(DATA_FILE)
                meta = {}
                if os.path.exists(META_FILE):
                    try:
                        with open(META_FILE, 'r', encoding='utf-8') as mf:
                            meta = json.load(mf)
                    except Exception:
                        pass
                self.send_json(200, {
                    'hasCustomData': True,
                    'savedAt': meta.get('savedAt', mtime),
                    'fileName': meta.get('fileName', 'latest_uploaded_data.xlsx'),
                    'lastUpdated': meta.get('lastUpdated', ''),
                    'hasExcelFile': os.path.exists(EXCEL_FILE),
                    'fileSize': size
                })
            except Exception as e:
                self.send_json(500, {'hasCustomData': False, 'error': str(e)})
        else:
            self.send_json(200, {'hasCustomData': False})

    def handle_api_server_info(self):
        local_ips = get_local_ips()
        urls = [f"http://{ip}:{PORT}/index.html" for ip in local_ips]
        self.send_json(200, {
            'port': PORT,
            'hostname': socket.gethostname(),
            'localIps': local_ips,
            'localUrl': f"http://localhost:{PORT}/index.html",
            'networkUrls': urls,
            'serverTime': int(time.time() * 1000)
        })

    def handle_api_download_excel(self):
        if os.path.exists(EXCEL_FILE):
            try:
                meta = {}
                filename = 'latest_uploaded_data.xlsx'
                if os.path.exists(META_FILE):
                    try:
                        with open(META_FILE, 'r', encoding='utf-8') as mf:
                            meta = json.load(mf)
                            if meta.get('fileName'):
                                filename = meta['fileName']
                    except Exception:
                        pass

                with open(EXCEL_FILE, 'rb') as f:
                    content = f.read()

                quoted_name = urllib.parse.quote(filename)
                self.send_response(200)
                self.send_header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                self.send_header('Content-Disposition', f'attachment; filename="{filename}"; filename*=UTF-8\'\'{quoted_name}')
                self.send_header('Content-Length', str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_json(500, {'error': str(e)})
        else:
            self.send_json(404, {'error': 'No uploaded Excel file found on server'})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ('/api/save-data', '/api/data'):
            self.handle_api_save_data()
        elif path == '/api/upload-excel':
            self.handle_api_upload_excel()
        elif path == '/api/reset':
            self.handle_api_reset()
        else:
            self.send_json(404, {'error': 'Endpoint not found'})

    def handle_api_save_data(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_json(400, {'error': 'Empty request body'})
                return

            body = self.rfile.read(content_length)
            parsed_json = json.loads(body.decode('utf-8'))

            # Write atomically to latest_data.json
            tmp_file = DATA_FILE + ".tmp"
            with open(tmp_file, 'wb') as f:
                f.write(body)
            if os.path.exists(DATA_FILE):
                os.remove(DATA_FILE)
            os.rename(tmp_file, DATA_FILE)

            # Save metadata
            now_ts = int(time.time() * 1000)
            meta = {
                'fileName': parsed_json.get('fileName', 'ข้อมูลนำเข้า.xlsx'),
                'lastUpdated': parsed_json.get('lastUpdated', ''),
                'savedAt': parsed_json.get('savedAt', now_ts),
                'savedAtIso': time.strftime('%Y-%m-%d %H:%M:%S'),
                'clientIp': self.client_address[0]
            }
            with open(META_FILE, 'w', encoding='utf-8') as mf:
                json.dump(meta, mf, ensure_ascii=False, indent=2)

            client_host = self.client_address[0]
            print(f"  [Server Storage] Saved data from {client_host}: '{meta['fileName']}' ({len(body):,} bytes)")

            self.send_json(200, {
                'success': True,
                'message': 'บันทึกข้อมูลลงเซิร์ฟเวอร์ส่วนกลางสำเร็จ',
                'savedAt': meta['savedAt'],
                'fileName': meta['fileName']
            })
        except Exception as e:
            print(f"  [Server Storage Error] {e}")
            self.send_json(500, {'error': str(e)})

    def handle_api_upload_excel(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0:
                self.send_json(400, {'error': 'Empty file content'})
                return

            file_data = self.rfile.read(content_length)
            tmp_file = EXCEL_FILE + ".tmp"
            with open(tmp_file, 'wb') as f:
                f.write(file_data)
            if os.path.exists(EXCEL_FILE):
                os.remove(EXCEL_FILE)
            os.rename(tmp_file, EXCEL_FILE)

            client_host = self.client_address[0]
            print(f"  [Server Storage] Saved original Excel file from {client_host} ({len(file_data):,} bytes)")

            self.send_json(200, {
                'success': True,
                'message': 'บันทึกไฟล์ Excel ต้นฉบับลงเซิร์ฟเวอร์สำเร็จ'
            })
        except Exception as e:
            print(f"  [Server Excel Upload Error] {e}")
            self.send_json(500, {'error': str(e)})

    def handle_api_reset(self):
        try:
            for p in [DATA_FILE, EXCEL_FILE, META_FILE]:
                if os.path.exists(p):
                    try:
                        os.remove(p)
                    except Exception:
                        pass
            client_host = self.client_address[0]
            print(f"  [Server Storage] Reset data triggered by {client_host}")
            self.send_json(200, {
                'success': True,
                'message': 'รีเซ็ตข้อมูลเซิร์ฟเวอร์เรียบร้อยแล้ว'
            })
        except Exception as e:
            self.send_json(500, {'error': str(e)})

def run_server():
    os.chdir(DIRECTORY)
    global PORT
    local_ips = get_local_ips()

    server = None
    while PORT < 8095:
        try:
            server = ReusableTCPServer(("0.0.0.0", PORT), DashboardHandler)
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
        print("  เซิร์ฟเวอร์ระบบติดตามงานก่อสร้างและการเบิกจ่าย กฟภ. (กฟก.3)")
        print("=" * 72)
        print(f"  -> สำหรับเครื่องนี้ (Local):       {local_url}")
        for ip in local_ips:
            print(f"  -> สำหรับเครื่องอื่นในเครือข่าย (LAN): http://{ip}:{PORT}/index.html")
        print("-" * 72)
        print("  * ระบบแชร์ข้อมูลส่วนกลาง (Shared Server Storage):")
        print("    เมื่ออัปโหลดไฟล์จากเครื่องใดก็ตาม ข้อมูลจะถูกบันทึกที่เซิร์ฟเวอร์")
        print("    และทุกเครื่องในเครือข่ายจะเห็นข้อมูลล่าสุดเดียวกันทันที!")
        print("=" * 72)
        print("  กด Ctrl+C เพื่อหยุดการทำงานของเซิร์ฟเวอร์")
        print("=" * 72)

        webbrowser.open(local_url)
        server.serve_forever()

if __name__ == '__main__':
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nเซิร์ฟเวอร์หยุดทำงานเรียบร้อยแล้ว (Server stopped).")
        sys.exit(0)
