"""Autodarts-API-Client mit automatischem Keycloak-Login und Token-Verwaltung."""

import base64
import hashlib
import html
import json
import logging
import re
import secrets
import time
from urllib.parse import parse_qs, urljoin, urlparse

import requests

log = logging.getLogger(__name__)

KEYCLOAK_BASE = "https://login.autodarts.io/realms/autodarts/protocol/openid-connect"
TOKEN_URL = KEYCLOAK_BASE + "/token"
AUTH_URL = KEYCLOAK_BASE + "/auth"
API_BASE = "https://api.autodarts.io"
REDIRECT_URI = "https://play.autodarts.io/"
USER_AGENT = "AutodartsAICoach/1.0"


class AutodartsError(Exception):
    pass


class AutodartsClient:
    def __init__(self, email: str, password: str, client_id: str = "autodarts-play", timeout: int = 30):
        self.email = email
        self.password = password
        self.client_id = client_id or "autodarts-play"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        self.access_token = None
        self.refresh_token = None
        self.expires_at = 0.0
        self.refresh_expires_at = 0.0
        self.user_id = None
        self.username = None

    # ------------------------------------------------------------------ Auth
    def _store_tokens(self, data: dict) -> None:
        now = time.time()
        self.access_token = data["access_token"]
        self.refresh_token = data.get("refresh_token")
        self.expires_at = now + float(data.get("expires_in", 300))
        self.refresh_expires_at = now + float(data.get("refresh_expires_in", 1800))
        claims = _jwt_claims(self.access_token)
        self.user_id = claims.get("sub") or self.user_id
        self.username = claims.get("preferred_username") or claims.get("name") or self.email

    def _password_grant(self) -> bool:
        r = self.session.post(TOKEN_URL, timeout=self.timeout, data={
            "grant_type": "password",
            "client_id": self.client_id,
            "username": self.email,
            "password": self.password,
            "scope": "openid",
        })
        if r.status_code == 200 and "access_token" in r.text:
            self._store_tokens(r.json())
            return True
        try:
            err = r.json()
        except ValueError:
            err = {}
        if err.get("error") == "invalid_grant" and "credentials" in str(err.get("error_description", "")).lower():
            raise AutodartsError("Login fehlgeschlagen: E-Mail oder Passwort falsch.")
        log.info("Password-Grant nicht möglich (%s), nutze Browser-Login-Flow.", r.status_code)
        return False

    def _browser_flow(self) -> None:
        """Bildet den normalen Login auf login.autodarts.io nach (Authorization Code + PKCE)."""
        verifier = secrets.token_urlsafe(64)
        challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
        state = secrets.token_urlsafe(16)
        params = {
            "client_id": self.client_id,
            "redirect_uri": REDIRECT_URI,
            "response_type": "code",
            "response_mode": "query",
            "scope": "openid",
            "state": state,
            "nonce": secrets.token_urlsafe(16),
            "code_challenge": challenge,
            "code_challenge_method": "S256",
        }
        r = self.session.get(AUTH_URL, params=params, timeout=self.timeout)
        if r.status_code != 200:
            raise AutodartsError(f"Login-Seite nicht erreichbar (HTTP {r.status_code}).")
        action = _form_action(r.text)
        if not action:
            raise AutodartsError("Login-Formular von Autodarts nicht gefunden (Seite hat sich evtl. geändert).")
        action = urljoin(r.url, action)

        r = self.session.post(action, timeout=self.timeout, allow_redirects=False, data={
            "username": self.email, "password": self.password, "credentialId": "",
        })
        code = None
        for _ in range(5):  # evtl. Zwischen-Redirects innerhalb von Keycloak
            loc = r.headers.get("Location", "")
            if not loc:
                break
            q = parse_qs(urlparse(loc).query)
            if "code" in q:
                code = q["code"][0]
                break
            if loc.startswith(REDIRECT_URI):
                break
            r = self.session.get(urljoin(r.url, loc), timeout=self.timeout, allow_redirects=False)
        if not code:
            msg = _kc_error(r.text) if r.text else ""
            raise AutodartsError("Login fehlgeschlagen" + (f": {msg}" if msg else ": E-Mail/Passwort prüfen."))

        r = self.session.post(TOKEN_URL, timeout=self.timeout, data={
            "grant_type": "authorization_code",
            "client_id": self.client_id,
            "code": code,
            "redirect_uri": REDIRECT_URI,
            "code_verifier": verifier,
        })
        if r.status_code != 200:
            raise AutodartsError(f"Token-Austausch fehlgeschlagen (HTTP {r.status_code}): {r.text[:200]}")
        self._store_tokens(r.json())

    def login(self) -> None:
        if not self.email or not self.password:
            raise AutodartsError("Bitte zuerst Autodarts-E-Mail und Passwort in den Einstellungen eintragen.")
        try:
            if not self._password_grant():
                self._browser_flow()
        except requests.RequestException as e:
            raise AutodartsError(f"Keine Verbindung zu login.autodarts.io: {e}") from e
        log.info("Autodarts-Login erfolgreich als %s (%s)", self.username, self.user_id)

    def _refresh(self) -> bool:
        if not self.refresh_token or time.time() > self.refresh_expires_at - 30:
            return False
        try:
            r = self.session.post(TOKEN_URL, timeout=self.timeout, data={
                "grant_type": "refresh_token", "client_id": self.client_id, "refresh_token": self.refresh_token,
            })
        except requests.RequestException:
            return False
        if r.status_code == 200:
            self._store_tokens(r.json())
            return True
        return False

    def ensure_token(self) -> None:
        if self.access_token and time.time() < self.expires_at - 60:
            return
        if not self._refresh():
            self.login()

    # ------------------------------------------------------------------- API
    def get(self, path: str, params: dict | None = None):
        self.ensure_token()
        url = path if path.startswith("http") else API_BASE + path
        for attempt in range(2):
            try:
                r = self.session.get(url, params=params, timeout=self.timeout,
                                     headers={"Authorization": f"Bearer {self.access_token}"})
            except requests.RequestException as e:
                raise AutodartsError(f"Netzwerkfehler bei {path}: {e}") from e
            if r.status_code == 401 and attempt == 0:
                self.access_token = None
                self.ensure_token()
                continue
            if r.status_code >= 400:
                raise AutodartsError(f"HTTP {r.status_code} bei {path}")
            try:
                return r.json()
            except ValueError:
                return None
        raise AutodartsError(f"Nicht autorisiert bei {path}")

    def _try(self, paths, errors, params=None):
        for p in paths:
            try:
                data = self.get(p, params=params)
                if data is not None:
                    return p, data
            except AutodartsError as e:
                errors.append(str(e))
        return None, None

    def fetch_everything(self, match_limit: int = 50, progress=lambda msg, frac: None) -> dict:
        """Zieht alle verfügbaren Statistiken. Gibt ein Roh-Daten-Dict zurück."""
        progress("Anmeldung bei Autodarts …", 0.02)
        self.ensure_token()
        uid = self.user_id
        errors: list[str] = []
        raw = {"user_id": uid, "username": self.username, "fetched_at": time.time(),
               "user_stats": {}, "matches": [], "errors": errors}

        progress("Lade Spieler-Statistiken …", 0.08)
        for key, paths in {
            "x01": [f"/as/v0/users/{uid}/stats/x01?limit={max(match_limit, 10)}",
                    f"/as/v0/users/{uid}/stats/x01"],
            "general": [f"/as/v0/users/{uid}/stats"],
        }.items():
            used, data = self._try(paths, errors)
            if data is not None:
                raw["user_stats"][key] = data
                raw["user_stats"][key + "_endpoint"] = used

        progress("Lade Match-History …", 0.15)
        matches = []
        page, size = 0, min(25, max(1, match_limit))
        while len(matches) < match_limit:
            used, data = self._try(["/as/v0/matches/filter"], errors, params={
                "size": size, "page": page, "sort": "-finished_at", "userId": uid})
            items = _as_list(data)
            if not items:
                break
            matches.extend(items)
            if len(items) < size:
                break
            page += 1
        matches = matches[:match_limit]

        for i, m in enumerate(matches):
            mid = m.get("id") if isinstance(m, dict) else None
            progress(f"Lade Match-Details {i + 1}/{len(matches)} …", 0.2 + 0.75 * (i + 1) / max(1, len(matches)))
            entry = {"summary": m, "stats": None}
            if mid:
                _, st = self._try([f"/as/v0/matches/{mid}/stats"], errors)
                entry["stats"] = st
            raw["matches"].append(entry)

        if not raw["user_stats"] and not raw["matches"]:
            raise AutodartsError("Keine Statistiken von der Autodarts-API erhalten.\n" + "\n".join(errors[-5:]))
        progress("Daten geladen.", 1.0)
        return raw


# ---------------------------------------------------------------- Helpers
def _jwt_claims(token: str) -> dict:
    try:
        payload = token.split(".")[1]
        payload += "=" * (-len(payload) % 4)
        return json.loads(base64.urlsafe_b64decode(payload))
    except Exception:
        return {}


def _form_action(page: str) -> str | None:
    m = re.search(r'<form[^>]*id="kc-form-login"[^>]*action="([^"]+)"', page) or \
        re.search(r'<form[^>]*action="([^"]+)"[^>]*id="kc-form-login"', page) or \
        re.search(r'<form[^>]*action="([^"]*login-actions/authenticate[^"]*)"', page)
    return html.unescape(m.group(1)) if m else None


def _kc_error(page: str) -> str:
    m = re.search(r'id="input-error[^"]*"[^>]*>\s*([^<]+)<', page) or \
        re.search(r'class="[^"]*(?:alert-error|kc-feedback-text)[^"]*"[^>]*>\s*([^<]+)<', page)
    return html.unescape(m.group(1)).strip() if m else ""


def _as_list(data) -> list:
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("items", "matches", "data", "content", "results"):
            if isinstance(data.get(key), list):
                return data[key]
    return []
