"""Einstellungen inkl. verschlüsseltem Claude-API-Key.

Unter Windows wird der API-Key mit der Windows-DPAPI (CryptProtectData)
verschlüsselt. Er ist damit an dein Windows-Benutzerkonto gebunden und auf
einem anderen PC/Konto nicht lesbar.
"""

import base64
import ctypes
import json
import os
import sys

from .paths import SETTINGS_PATH

SECRET_FIELDS = ("anthropic_api_key",)

DEFAULTS = {
    "anthropic_api_key": "",
    "claude_model": "claude-opus-5-5",
    "player_name": "",
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
        if not _crypt32.CryptProtectData(ctypes.byref(_blob(data)), "AutodartsCoach", ctypes.byref(_blob(_ENTROPY)),
                                         None, None, 0x01, ctypes.byref(out)):
            raise ctypes.WinError()
        try:
            return ctypes.string_at(out.pbData, out.cbData)
        finally:
            _kernel32.LocalFree(out.pbData)

    def _unprotect(data: bytes) -> bytes:
        out = _DataBlob()
        if not _crypt32.CryptUnprotectData(ctypes.byref(_blob(data)), None, ctypes.byref(_blob(_ENTROPY)),
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
    if not value or not value.startswith(_PREFIX):
        return ""
    try:
        return _unprotect(base64.b64decode(value[len(_PREFIX):])).decode("utf-8")
    except Exception:
        return ""


def load_settings() -> dict:
    settings = dict(DEFAULTS)
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH, "r", encoding="utf-8") as f:
                stored = json.load(f)
            for k, v in stored.items():
                if k in DEFAULTS:
                    settings[k] = decrypt(v) if k in SECRET_FIELDS else v
        except Exception:
            pass
    return settings


def save_settings(settings: dict) -> None:
    out = {k: (encrypt(v) if k in SECRET_FIELDS else v) for k, v in settings.items() if k in DEFAULTS}
    tmp = SETTINGS_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
    os.replace(tmp, SETTINGS_PATH)


def is_configured(settings: dict) -> bool:
    return bool(settings.get("anthropic_api_key"))
