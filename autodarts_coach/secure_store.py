"""Einstellungen inkl. verschlüsselter Zugangsdaten.

Unter Windows werden Passwort und API-Key mit der Windows-DPAPI
(CryptProtectData) verschlüsselt. Die Daten sind damit an dein
Windows-Benutzerkonto gebunden und auf einem anderen PC/Konto nicht lesbar.
"""

import base64
import ctypes
import json
import os
import sys

from .paths import SETTINGS_PATH

SECRET_FIELDS = ("autodarts_password", "anthropic_api_key")

DEFAULTS = {
    "autodarts_email": "",
    "autodarts_password": "",
    "anthropic_api_key": "",
    "claude_model": "claude-opus-5-5",
    "match_limit": 50,
    "keycloak_client_id": "autodarts-play",
    "appearance": "dark",
}


if sys.platform == "win32":
    from ctypes import wintypes

    class _DataBlob(ctypes.Structure):
        _fields_ = [("cbData", wintypes.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]

    _crypt32 = ctypes.windll.crypt32
    _kernel32 = ctypes.windll.kernel32
    _ENTROPY = b"AutodartsAICoach-v1"

    def _blob(data: bytes) -> _DataBlob:
        buf = ctypes.create_string_buffer(data, len(data))
        return _DataBlob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))

    def _protect(data: bytes) -> bytes:
        out = _DataBlob()
        ent = _blob(_ENTROPY)
        if not _crypt32.CryptProtectData(ctypes.byref(_blob(data)), "AutodartsCoach", ctypes.byref(ent),
                                         None, None, 0x01, ctypes.byref(out)):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    def _unprotect(data: bytes) -> bytes:
        out = _DataBlob()
        ent = _blob(_ENTROPY)
        if not _crypt32.CryptUnprotectData(ctypes.byref(_blob(data)), None, ctypes.byref(ent),
                                           None, None, 0x01, ctypes.byref(out)):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    _PREFIX = "dpapi:"
else:  # Nur für Entwicklung/Tests außerhalb von Windows (keine echte Verschlüsselung)
    def _protect(data: bytes) -> bytes:
        return data

    def _unprotect(data: bytes) -> bytes:
        return data

    _PREFIX = "plain:"


def encrypt(value: str) -> str:
    if not value:
        return ""
    return _PREFIX + base64.b64encode(_protect(value.encode("utf-8"))).decode("ascii")


def decrypt(value: str) -> str:
    if not value:
        return ""
    for prefix in ("dpapi:", "plain:"):
        if value.startswith(prefix):
            if prefix != _PREFIX:
                return ""
            try:
                return _unprotect(base64.b64decode(value[len(prefix):])).decode("utf-8")
            except Exception:
                return ""
    return ""


def load_settings() -> dict:
    settings = dict(DEFAULTS)
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                stored = json.load(f)
            for k, v in stored.items():
                settings[k] = decrypt(v) if k in SECRET_FIELDS else v
        except Exception:
            pass
    return settings


def save_settings(settings: dict) -> None:
    out = {}
    for k, v in settings.items():
        out[k] = encrypt(v) if k in SECRET_FIELDS else v
    tmp = SETTINGS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    os.replace(tmp, SETTINGS_PATH)


def is_configured(settings: dict) -> bool:
    return bool(settings.get("autodarts_email") and settings.get("autodarts_password")
                and settings.get("anthropic_api_key"))
