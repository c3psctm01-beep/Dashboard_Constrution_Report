"""
server.py
PEA Construction & Disbursement Dashboard (PSCTM)
Lightweight local HTTP server with automatic browser launch
"""

import http.server
import socketserver
import webbrowser
import os
import sys

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable CORS and caching headers
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

def run_server():
    os.chdir(DIRECTORY)
    # Find available port if 8080 is in use
    global PORT
    while PORT < 8095:
        try:
            with socketserver.TCPServer(("", PORT), DashboardHandler) as httpd:
                url = f"http://localhost:{PORT}/index.html"
                print("=" * 65)
                print("  PEA Construction & Disbursement Dashboard (PSCTM)")
                print(f"  Server running at: {url}")
                print("  Press Ctrl+C to stop the server.")
                print("=" * 65)
                webbrowser.open(url)
                httpd.serve_forever()
                break
        except OSError:
            PORT += 1

if __name__ == '__main__':
    try:
        run_server()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        sys.exit(0)
