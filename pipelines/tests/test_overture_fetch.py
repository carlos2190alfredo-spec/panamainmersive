"""Anti-SSRF del acceso remoto: lista blanca estricta y NINGUNA redirección (docs/security.md)."""
import http.server
import threading

import pytest

from pipelines.lib import overture as ov

GOOD = ov.HOST + "release/2026-09-23.1/theme=base/type=land/part.parquet"


@pytest.mark.parametrize(
    "url",
    [
        "http://overturemaps-us-west-2.s3.amazonaws.com/x",                      # sin TLS
        "https://169.254.169.254/latest/meta-data/",                              # metadatos de nube
        "https://localhost/x",
        "https://127.0.0.1/x",
        "https://[::1]/x",
        "https://overturemaps-us-west-2.s3.amazonaws.com.evil.example/x",        # sufijo engañoso
        "https://evil.example/overturemaps-us-west-2.s3.amazonaws.com/x",
        "https://overturemaps-us-west-2.s3.amazonaws.com@evil.example/x",         # credenciales falsas
        "https://usuario:clave@overturemaps-us-west-2.s3.amazonaws.com/x",
        "https://overturemaps-us-west-2.s3.amazonaws.com:8443/x",                 # otro puerto
        "file:///etc/passwd",
        "ftp://overturemaps-us-west-2.s3.amazonaws.com/x",
        "",
    ],
)
def test_lista_blanca_rechaza(url):
    with pytest.raises(PermissionError):
        ov._check_host(url)


def test_lista_blanca_acepta_solo_el_host_de_overture():
    ov._check_host(GOOD)
    ov._check_host(GOOD.replace("https://", "https://").replace(".com/", ".com:443/"))


@pytest.fixture
def servidor_local():
    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == "/redirige":
                self.send_response(302)
                self.send_header("Location", f"http://127.0.0.1:{self.server.server_address[1]}/secreto")
                self.end_headers()
            else:
                body = b"SECRETO-INTERNO"
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

        do_HEAD = do_GET

        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()


def test_no_se_siguen_redirecciones_aunque_el_host_este_permitido(servidor_local, monkeypatch):
    # Se desactiva SOLO la comprobación de host/esquema para poder usar un servidor local; lo que se prueba es la política
    # de redirecciones de `open_remote`.
    monkeypatch.setattr(ov, "_check_host", lambda *a, **k: None)
    with pytest.raises(ov.RemoteFetchError, match="sin tamaño"):
        ov.open_remote(f"http://127.0.0.1:{servidor_local}/redirige", scheme="http")
    with ov.open_remote(f"http://127.0.0.1:{servidor_local}/ok", scheme="http") as handle:  # control positivo
        assert handle.read(15) == b"SECRETO-INTERNO"
