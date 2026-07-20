import http.server
import socketserver
import urllib.parse
import os
import threading

PORT = 8000

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = urllib.parse.unquote(path)
        
        # Simula o rewrite do Vercel para a página do cliente (vitrine)
        if path.startswith('/cliente/') or path.startswith('/vitrinedesk/'):
            prefix = '/cliente/' if path.startswith('/cliente/') else '/vitrinedesk/'
            
            if path.startswith(prefix + 'css/') or path.startswith(prefix + 'js/') or path.startswith(prefix + 'assets/'):
                # Deixe passar se for estático da própria pasta (ajustando vitrinedesk para cliente)
                if prefix == '/vitrinedesk/':
                    return super().translate_path(path.replace('/vitrinedesk/', '/cliente/', 1))
                return super().translate_path(path)
                
            subpath = path.replace(prefix, '', 1)
            
            # Se for requisição de arquivo estático genérico sem o prefixo, mas capturado
            if subpath.startswith('css/') or subpath.startswith('js/') or subpath.startswith('assets/'):
                return super().translate_path('/cliente/' + subpath)
            # Se tiver extensão
            elif '.' in subpath:
                client_path = super().translate_path('/cliente/' + subpath)
                if os.path.exists(client_path):
                    return client_path
                return super().translate_path('/' + subpath)
            # URL da loja SPA
            else:
                return super().translate_path('/cliente/index.html')
            
        return super().translate_path(path)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True

if __name__ == "__main__":
    server_address = ("", PORT)
    with ThreadingHTTPServer(server_address, NoCacheHandler) as httpd:
        print(f"Servidor Multithread rodando na porta {PORT} (Sem Cache e com SPA Rewrite Avançado)")
        print(f"Acesse: http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServidor encerrado.")
            httpd.server_close()
