# Static server that mimics GitHub Pages caching: every response carries Cache-Control: max-age=600.
import http.server, sys, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'max-age=600')
        super().end_headers()
    def log_message(self, *a): pass
root = sys.argv[1]
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), functools.partial(H, directory=root)).serve_forever()
