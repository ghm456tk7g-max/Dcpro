"""CustomTkinter-Oberfläche des Autodarts AI Coach."""

import datetime as dt
import logging
import os
import queue
import re
import threading
import traceback
import webbrowser

import customtkinter as ctk
from tkinter import filedialog, messagebox

from . import APP_NAME, __version__
from .autodarts_client import AutodartsClient, AutodartsError
from .coach import CoachError, build_payload, run_coach
from .paths import DATA_DIR
from .secure_store import is_configured, load_settings, save_settings
from .stats import METRIC_DEFS, METRIC_INDEX, compare, compute_metrics, fmt
from .storage import Storage

log = logging.getLogger(__name__)

GREEN = "#2fbf71"
RED = "#e5484d"
GREY = "#8b8d98"
ACCENT = "#e8a33d"
CARD_KEYS = ["average", "first9", "checkout_pct", "last10_average", "win_rate", "t180_per_leg",
             "plus140_per_leg", "plus100_per_leg", "darts_per_leg", "highest_checkout", "best_leg",
             "matches_count"]
STATUS_COLOR = {"besser": GREEN, "schlechter": RED, "gleich": GREY, "neu": GREY}
STATUS_ARROW = {"besser": "▲", "schlechter": "▼", "gleich": "■", "neu": "•"}


def ts(t: float) -> str:
    return dt.datetime.fromtimestamp(t).strftime("%d.%m.%Y %H:%M")


class App(ctk.CTk):
    def __init__(self, selftest: bool = False):
        super().__init__()
        self.settings = load_settings()
        ctk.set_appearance_mode(self.settings.get("appearance", "dark"))
        ctk.set_default_color_theme("dark-blue")
        self.title(f"{APP_NAME} {__version__}")
        self.geometry("1280x820")
        self.minsize(1000, 680)

        self.storage = Storage()
        self.client: AutodartsClient | None = None
        self.queue: queue.Queue = queue.Queue()
        self.busy = False
        self.current_snapshot: dict | None = None

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._build_sidebar()
        self.content = ctk.CTkFrame(self, fg_color="transparent")
        self.content.grid(row=0, column=1, sticky="nsew", padx=16, pady=16)
        self.content.grid_columnconfigure(0, weight=1)
        self.content.grid_rowconfigure(0, weight=1)

        self.pages = {
            "dashboard": self._build_dashboard(),
            "progress": self._build_progress(),
            "coach": self._build_coach(),
            "history": self._build_history(),
            "settings": self._build_settings(),
        }
        self.after(50, self._poll_queue)
        self._load_latest()
        if not is_configured(self.settings):
            self.show("settings")
            self.set_status("Willkommen! Bitte zuerst die Zugangsdaten eintragen und speichern.")
        else:
            self.show("dashboard")
        if selftest:
            self.after(2500, self._selftest_finish)

    # ------------------------------------------------------------ Layout
    def _build_sidebar(self):
        sb = ctk.CTkFrame(self, width=260, corner_radius=0)
        sb.grid(row=0, column=0, sticky="nsw")
        sb.grid_rowconfigure(9, weight=1)
        ctk.CTkLabel(sb, text="🎯 Autodarts\nAI Coach", font=ctk.CTkFont(size=24, weight="bold"),
                     justify="left").grid(row=0, column=0, padx=20, pady=(24, 18), sticky="w")

        self.main_btn = ctk.CTkButton(sb, text="Stats aktualisieren\n& Analyse starten", height=64,
                                      font=ctk.CTkFont(size=15, weight="bold"), fg_color=ACCENT,
                                      hover_color="#c9862a", text_color="#1a1a1a", command=self.on_refresh)
        self.main_btn.grid(row=1, column=0, padx=20, pady=(0, 8), sticky="ew")
        self.reanalyze_btn = ctk.CTkButton(sb, text="Nur KI-Analyse wiederholen", fg_color="transparent",
                                           border_width=1, command=self.on_reanalyze)
        self.reanalyze_btn.grid(row=2, column=0, padx=20, pady=(0, 18), sticky="ew")

        self.nav_buttons = {}
        for i, (key, label) in enumerate([("dashboard", "📊  Dashboard"), ("progress", "📈  Fortschritte"),
                                          ("coach", "🧠  KI-Coach"), ("history", "🗂  Historie"),
                                          ("settings", "⚙  Einstellungen")]):
            b = ctk.CTkButton(sb, text=label, anchor="w", fg_color="transparent", height=38,
                              text_color=("gray10", "gray90"), hover_color=("gray75", "gray25"),
                              command=lambda k=key: self.show(k))
            b.grid(row=3 + i, column=0, padx=12, pady=2, sticky="ew")
            self.nav_buttons[key] = b

        self.progress = ctk.CTkProgressBar(sb)
        self.progress.set(0)
        self.progress.grid(row=10, column=0, padx=20, pady=(8, 4), sticky="ew")
        self.status = ctk.CTkLabel(sb, text="Bereit.", wraplength=220, justify="left", anchor="w",
                                   font=ctk.CTkFont(size=12))
        self.status.grid(row=11, column=0, padx=20, pady=(0, 18), sticky="ew")

    def show(self, key):
        for k, p in self.pages.items():
            p.grid_forget()
            self.nav_buttons[k].configure(fg_color="transparent")
        self.pages[key].grid(row=0, column=0, sticky="nsew")
        self.nav_buttons[key].configure(fg_color=("gray75", "gray25"))

    def _title(self, parent, text, sub=None):
        ctk.CTkLabel(parent, text=text, font=ctk.CTkFont(size=22, weight="bold")).pack(anchor="w")
        if sub:
            ctk.CTkLabel(parent, text=sub, text_color=GREY).pack(anchor="w", pady=(0, 10))

    # --------------------------------------------------------- Dashboard
    def _build_dashboard(self):
        page = ctk.CTkScrollableFrame(self.content, fg_color="transparent")
        self._title(page, "Dashboard", "Deine aktuellen Kennzahlen und die Veränderung zum vorherigen Abruf")
        self.dash_info = ctk.CTkLabel(page, text="Noch keine Daten – klicke links auf „Stats aktualisieren“.",
                                      text_color=GREY)
        self.dash_info.pack(anchor="w", pady=(0, 8))
        self.cards_frame = ctk.CTkFrame(page, fg_color="transparent")
        self.cards_frame.pack(fill="x")
        for c in range(4):
            self.cards_frame.grid_columnconfigure(c, weight=1, uniform="cards")

        ctk.CTkLabel(page, text="Scoring-Verteilung (pro Leg)",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(anchor="w", pady=(18, 6))
        self.dist_frame = ctk.CTkFrame(page)
        self.dist_frame.pack(fill="x")

        ctk.CTkLabel(page, text="Letzte Matches", font=ctk.CTkFont(size=16, weight="bold")).pack(
            anchor="w", pady=(18, 6))
        self.matches_frame = ctk.CTkFrame(page)
        self.matches_frame.pack(fill="x")
        return page

    def _render_dashboard(self, snap: dict, previous: dict | None):
        for w in self.cards_frame.winfo_children():
            w.destroy()
        m = snap["metrics"]
        rows = {r["key"]: r for r in compare(m, previous["metrics"] if previous else {})}
        self.dash_info.configure(text=f"Stand: {ts(snap['created_at'])}"
                                 + (f"   ·   verglichen mit {ts(previous['created_at'])}" if previous
                                    else "   ·   erster Abruf (noch kein Vergleich)"))
        keys = [k for k in CARD_KEYS if k in m]
        for i, k in enumerate(keys):
            _, label, _, unit, _ = METRIC_INDEX[k]
            r = rows.get(k)
            card = ctk.CTkFrame(self.cards_frame, corner_radius=12)
            card.grid(row=i // 4, column=i % 4, padx=6, pady=6, sticky="nsew")
            ctk.CTkLabel(card, text=label, text_color=GREY, font=ctk.CTkFont(size=12)).pack(
                anchor="w", padx=14, pady=(10, 0))
            ctk.CTkLabel(card, text=fmt(m[k], unit), font=ctk.CTkFont(size=26, weight="bold")).pack(
                anchor="w", padx=14)
            if r and r["delta"] is not None:
                d = r["delta"]
                txt = f"{STATUS_ARROW[r['status']]} {'+' if d >= 0 else ''}{fmt(d)} {unit}".strip()
            else:
                txt = "• kein Vergleich"
            ctk.CTkLabel(card, text=txt, text_color=STATUS_COLOR[r["status"] if r else "neu"],
                         font=ctk.CTkFont(size=12, weight="bold")).pack(anchor="w", padx=14, pady=(0, 10))

        for w in self.dist_frame.winfo_children():
            w.destroy()
        dist = [("60+", "plus60_per_leg"), ("100+", "plus100_per_leg"), ("140+", "plus140_per_leg"),
                ("170+", "plus170_per_leg"), ("180", "t180_per_leg")]
        vals = [(lbl, m.get(k)) for lbl, k in dist if m.get(k) is not None]
        if not vals:
            ctk.CTkLabel(self.dist_frame, text="Keine Scoring-Verteilung in den API-Daten gefunden.",
                         text_color=GREY).pack(padx=14, pady=10, anchor="w")
        mx = max([v for _, v in vals] + [0.0001])
        for lbl, v in vals:
            row = ctk.CTkFrame(self.dist_frame, fg_color="transparent")
            row.pack(fill="x", padx=14, pady=4)
            ctk.CTkLabel(row, text=lbl, width=50, anchor="w").pack(side="left")
            bar = ctk.CTkProgressBar(row, height=14, progress_color=ACCENT)
            bar.set(v / mx)
            bar.pack(side="left", fill="x", expand=True, padx=8)
            ctk.CTkLabel(row, text=fmt(v), width=60, anchor="e").pack(side="left")

        for w in self.matches_frame.winfo_children():
            w.destroy()
        matches = snap.get("matches") or []
        header = ["Datum", "Modus", "Avg", "First-9", "Checkout %", "180er", "Ergebnis"]
        for c, h in enumerate(header):
            self.matches_frame.grid_columnconfigure(c, weight=1)
            ctk.CTkLabel(self.matches_frame, text=h, font=ctk.CTkFont(weight="bold"), text_color=GREY).grid(
                row=0, column=c, padx=8, pady=(8, 4), sticky="w")
        if not matches:
            ctk.CTkLabel(self.matches_frame, text="Keine Matches gefunden.", text_color=GREY).grid(
                row=1, column=0, columnspan=7, padx=8, pady=8, sticky="w")
        for r, mt in enumerate(matches[:25], start=1):
            co = mt.get("checkout_pct")
            if co is None and mt.get("checkout_darts"):
                co = 100 * (mt.get("checkouts_hit") or 0) / mt["checkout_darts"]
            elif co is not None and co <= 1:
                co *= 100
            won = mt.get("won")
            res = "Sieg" if won == 1 else ("Niederlage" if won == 0 else "–")
            vals = [str(mt.get("date", ""))[:16].replace("T", " "), mt.get("variant", "") or "–",
                    fmt(mt.get("average")), fmt(mt.get("first9")), fmt(co), fmt(mt.get("t180")), res]
            for c, v in enumerate(vals):
                color = (GREEN if won == 1 else RED if won == 0 else None) if c == 6 else None
                ctk.CTkLabel(self.matches_frame, text=v, text_color=color).grid(
                    row=r, column=c, padx=8, pady=1, sticky="w")

    # ---------------------------------------------------------- Progress
    def _build_progress(self):
        page = ctk.CTkFrame(self.content, fg_color="transparent")
        page.grid_columnconfigure((0, 1), weight=1)
        page.grid_rowconfigure(2, weight=1)
        head = ctk.CTkFrame(page, fg_color="transparent")
        head.grid(row=0, column=0, columnspan=2, sticky="ew")
        self._title(head, "Fortschritte & Rückschritte")
        bar = ctk.CTkFrame(page, fg_color="transparent")
        bar.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(4, 10))
        ctk.CTkLabel(bar, text="Vergleichen mit:").pack(side="left")
        self.compare_var = ctk.StringVar(value="vorheriger Abruf")
        self.compare_menu = ctk.CTkOptionMenu(bar, variable=self.compare_var, values=["vorheriger Abruf"],
                                              command=lambda _: self._render_progress(), width=260)
        self.compare_menu.pack(side="left", padx=10)

        self.better_frame = ctk.CTkScrollableFrame(page, label_text="▲ Fortschritte",
                                                   label_text_color=GREEN)
        self.better_frame.grid(row=2, column=0, sticky="nsew", padx=(0, 6))
        self.worse_frame = ctk.CTkScrollableFrame(page, label_text="▼ Rückschritte", label_text_color=RED)
        self.worse_frame.grid(row=2, column=1, sticky="nsew", padx=(6, 0))
        self.same_label = ctk.CTkLabel(page, text="", text_color=GREY, wraplength=900, justify="left")
        self.same_label.grid(row=3, column=0, columnspan=2, sticky="w", pady=(10, 0))
        return page

    def _render_progress(self):
        for f in (self.better_frame, self.worse_frame):
            for w in f.winfo_children():
                w.destroy()
        snaps = self.storage.list_snapshots()
        cur = self.current_snapshot
        if not cur:
            self.same_label.configure(text="Noch keine Daten vorhanden.")
            return
        older = [s for s in snaps if s["id"] < cur["id"]]
        options = ["vorheriger Abruf"] + ([f"erster Abruf ({ts(older[-1]['created_at'])})"] if older else []) + \
                  [f"#{s['id']} – {ts(s['created_at'])}" for s in older]
        self.compare_menu.configure(values=options)
        choice = self.compare_var.get()
        if choice not in options:
            choice = "vorheriger Abruf"
            self.compare_var.set(choice)
        ref = None
        if older:
            if choice == "vorheriger Abruf":
                ref = older[0]
            elif choice.startswith("erster"):
                ref = older[-1]
            else:
                sid = int(choice.split("–")[0].strip(" #"))
                ref = next((s for s in older if s["id"] == sid), older[0])
        if not ref:
            self.same_label.configure(text="Erst ab dem zweiten Abruf können Veränderungen angezeigt werden.")
            return
        rows = compare(cur["metrics"], ref["metrics"])
        same = []
        for r in rows:
            if r["status"] in ("besser", "schlechter"):
                target = self.better_frame if r["status"] == "besser" else self.worse_frame
                color = GREEN if r["status"] == "besser" else RED
                box = ctk.CTkFrame(target)
                box.pack(fill="x", pady=4, padx=4)
                ctk.CTkLabel(box, text=r["label"], font=ctk.CTkFont(weight="bold")).pack(
                    anchor="w", padx=10, pady=(6, 0))
                d = r["delta"]
                ctk.CTkLabel(box, text=f"{fmt(r['previous'], r['unit'])}  →  {fmt(r['current'], r['unit'])}"
                                       f"   ({'+' if d >= 0 else ''}{fmt(d)})",
                             text_color=color).pack(anchor="w", padx=10, pady=(0, 6))
            elif r["status"] == "gleich":
                same.append(f"{r['label']} ({fmt(r['current'], r['unit'])})")
        for f, txt in ((self.better_frame, "Keine Verbesserungen."), (self.worse_frame, "Keine Verschlechterungen.")):
            if not f.winfo_children():
                ctk.CTkLabel(f, text=txt, text_color=GREY).pack(anchor="w", padx=8, pady=8)
        self.same_label.configure(text=f"Vergleich {ts(cur['created_at'])} mit {ts(ref['created_at'])}.   "
                                       + ("Unverändert: " + ", ".join(same) if same else ""))

    # ------------------------------------------------------------- Coach
    def _build_coach(self):
        page = ctk.CTkFrame(self.content, fg_color="transparent")
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(1, weight=1)
        head = ctk.CTkFrame(page, fg_color="transparent")
        head.grid(row=0, column=0, sticky="ew")
        self._title(head, "KI-Dart-Coach", "Schwachstellen, Trainingsplan, Doppelwege und mentale Tipps von Claude")
        btns = ctk.CTkFrame(head, fg_color="transparent")
        btns.pack(anchor="e", fill="x")
        ctk.CTkButton(btns, text="Als Textdatei speichern", width=180, command=self.save_coach_text).pack(
            side="right")
        self.coach_box = ctk.CTkTextbox(page, wrap="word", font=ctk.CTkFont(size=14))
        self.coach_box.grid(row=1, column=0, sticky="nsew", pady=(8, 0))
        tb = self.coach_box._textbox
        tb.tag_config("h2", font=ctk.CTkFont(size=19, weight="bold"), foreground=ACCENT, spacing1=14, spacing3=4)
        tb.tag_config("h3", font=ctk.CTkFont(size=16, weight="bold"), spacing1=8)
        tb.tag_config("bold", font=ctk.CTkFont(size=14, weight="bold"))
        self._set_coach_text("Noch keine Analyse. Klicke links auf „Stats aktualisieren & Analyse starten“.")
        return page

    def _set_coach_text(self, text: str, formatted: bool = True):
        box = self.coach_box
        box.configure(state="normal")
        box.delete("1.0", "end")
        if formatted:
            self._insert_markdown(text)
        else:
            box.insert("end", text)
        box.configure(state="disabled")

    def _insert_markdown(self, text: str):
        tb = self.coach_box._textbox
        for line in text.splitlines():
            tag = None
            if line.startswith("### "):
                line, tag = line[4:], "h3"
            elif line.startswith("## ") or line.startswith("# "):
                line, tag = line.lstrip("#").strip(), "h2"
            elif re.match(r"^\s*[-*] ", line):
                line = re.sub(r"^(\s*)[-*] ", r"\1• ", line)
            if line.strip() in ("---", "***"):
                line = "─" * 40
            if tag:
                tb.insert("end", line.replace("**", "") + "\n", tag)
                continue
            for i, part in enumerate(re.split(r"\*\*(.+?)\*\*", line)):
                tb.insert("end", part, "bold" if i % 2 else ())
            tb.insert("end", "\n")

    def _append_coach(self, text: str):
        box = self.coach_box
        box.configure(state="normal")
        box.insert("end", text)
        box.see("end")
        box.configure(state="disabled")

    def save_coach_text(self):
        text = (self.current_snapshot or {}).get("coach_text")
        if not text:
            messagebox.showinfo(APP_NAME, "Es gibt noch keine Analyse zum Speichern.")
            return
        name = "Coach_Analyse_" + dt.datetime.now().strftime("%Y-%m-%d_%H-%M") + ".txt"
        path = filedialog.asksaveasfilename(initialdir=DATA_DIR, initialfile=name, defaultextension=".txt",
                                            filetypes=[("Textdatei", "*.txt"), ("Markdown", "*.md")])
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            self.set_status(f"Gespeichert: {path}")

    # ----------------------------------------------------------- History
    def _build_history(self):
        page = ctk.CTkFrame(self.content, fg_color="transparent")
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(1, weight=1)
        head = ctk.CTkFrame(page, fg_color="transparent")
        head.grid(row=0, column=0, sticky="ew")
        self._title(head, "Historie", f"Alle Abrufe werden lokal gespeichert: {DATA_DIR}")
        self.hist_frame = ctk.CTkScrollableFrame(page)
        self.hist_frame.grid(row=1, column=0, sticky="nsew")
        return page

    def _render_history(self):
        f = self.hist_frame
        for w in f.winfo_children():
            w.destroy()
        snaps = self.storage.list_snapshots()
        cols = ["Zeitpunkt", "Average", "First-9", "Checkout %", "Matches", "Analyse", "", ""]
        for c, h in enumerate(cols):
            f.grid_columnconfigure(c, weight=1 if c < 6 else 0)
            ctk.CTkLabel(f, text=h, font=ctk.CTkFont(weight="bold"), text_color=GREY).grid(
                row=0, column=c, padx=8, pady=4, sticky="w")
        if not snaps:
            ctk.CTkLabel(f, text="Noch keine Abrufe gespeichert.", text_color=GREY).grid(
                row=1, column=0, columnspan=5, sticky="w", padx=8)
        for r, s in enumerate(snaps, start=1):
            m = s["metrics"]
            mark = "  ◀ angezeigt" if self.current_snapshot and s["id"] == self.current_snapshot["id"] else ""
            vals = [ts(s["created_at"]) + mark, fmt(m.get("average")), fmt(m.get("first9")),
                    fmt(m.get("checkout_pct"), "%"), fmt(m.get("matches_count")), "✓" if s["coach_text"] else "–"]
            for c, v in enumerate(vals):
                ctk.CTkLabel(f, text=v).grid(row=r, column=c, padx=8, pady=2, sticky="w")
            ctk.CTkButton(f, text="Anzeigen", width=90, command=lambda s=s: self._show_snapshot(s["id"])).grid(
                row=r, column=6, padx=4, pady=2)
            ctk.CTkButton(f, text="Löschen", width=80, fg_color=RED, hover_color="#b3373b",
                          command=lambda s=s: self._delete_snapshot(s["id"])).grid(row=r, column=7, padx=4, pady=2)

    def _show_snapshot(self, sid):
        self._load_latest(sid)
        self.show("dashboard")

    def _delete_snapshot(self, sid):
        if messagebox.askyesno(APP_NAME, "Diesen Abruf wirklich aus der Historie löschen?"):
            self.storage.delete_snapshot(sid)
            self._load_latest()

    # ---------------------------------------------------------- Settings
    def _build_settings(self):
        page = ctk.CTkScrollableFrame(self.content, fg_color="transparent")
        self._title(page, "Einstellungen",
                    "Passwort und API-Key werden mit Windows-DPAPI verschlüsselt (nur dein Windows-Konto kann sie lesen).")
        form = ctk.CTkFrame(page)
        form.pack(fill="x", pady=6)
        form.grid_columnconfigure(1, weight=1)
        self.entries = {}

        def row(r, key, label, show=None, hint=None):
            ctk.CTkLabel(form, text=label, anchor="w").grid(row=r, column=0, padx=14, pady=(10, 0), sticky="w")
            e = ctk.CTkEntry(form, show=show, width=460)
            e.insert(0, str(self.settings.get(key, "")))
            e.grid(row=r, column=1, padx=14, pady=(10, 0), sticky="ew")
            if hint:
                ctk.CTkLabel(form, text=hint, text_color=GREY, font=ctk.CTkFont(size=11), anchor="w").grid(
                    row=r + 1, column=1, padx=14, sticky="w")
            self.entries[key] = e
            return e

        ctk.CTkLabel(form, text="Autodarts-Konto", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=0, column=0, columnspan=2, padx=14, pady=(12, 0), sticky="w")
        row(1, "autodarts_email", "E-Mail")
        row(3, "autodarts_password", "Passwort", show="•")
        ctk.CTkLabel(form, text="Claude (Anthropic)", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=5, column=0, columnspan=2, padx=14, pady=(18, 0), sticky="w")
        row(6, "anthropic_api_key", "API-Key", show="•", hint="Beginnt mit sk-ant-…  (console.anthropic.com → API Keys)")
        row(8, "claude_model", "Modell", hint="Standard: claude-opus-5-5")
        ctk.CTkLabel(form, text="Erweitert", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=10, column=0, columnspan=2, padx=14, pady=(18, 0), sticky="w")
        row(11, "match_limit", "Anzahl Matches pro Abruf", hint="Wie viele der letzten Matches ausgewertet werden (z. B. 50)")
        row(13, "keycloak_client_id", "Keycloak Client-ID", hint="Nur ändern, falls Autodarts den Login umstellt (Standard: autodarts-play)")

        self.show_secrets = ctk.CTkCheckBox(form, text="Passwort/Key anzeigen", command=self._toggle_secrets)
        self.show_secrets.grid(row=15, column=1, padx=14, pady=(12, 0), sticky="w")
        ctk.CTkLabel(form, text="Darstellung", anchor="w").grid(row=16, column=0, padx=14, pady=(12, 0), sticky="w")
        self.appearance = ctk.CTkSegmentedButton(form, values=["dark", "light", "system"],
                                                 command=lambda v: ctk.set_appearance_mode(v))
        self.appearance.set(self.settings.get("appearance", "dark"))
        self.appearance.grid(row=16, column=1, padx=14, pady=(12, 0), sticky="w")

        btns = ctk.CTkFrame(form, fg_color="transparent")
        btns.grid(row=17, column=0, columnspan=2, padx=14, pady=16, sticky="w")
        ctk.CTkButton(btns, text="Speichern", fg_color=ACCENT, text_color="#1a1a1a", hover_color="#c9862a",
                      command=self.on_save_settings).pack(side="left")
        ctk.CTkButton(btns, text="Autodarts-Login testen", command=self.on_test_login).pack(side="left", padx=10)
        ctk.CTkButton(btns, text="Datenordner öffnen", fg_color="transparent", border_width=1,
                      command=self._open_data_dir).pack(side="left")
        ctk.CTkButton(btns, text="API-Key besorgen", fg_color="transparent", border_width=1,
                      command=lambda: webbrowser.open("https://console.anthropic.com/settings/keys")).pack(
            side="left", padx=10)
        return page

    def _toggle_secrets(self):
        show = "" if self.show_secrets.get() else "•"
        for k in ("autodarts_password", "anthropic_api_key"):
            self.entries[k].configure(show=show)

    def _open_data_dir(self):
        try:
            os.startfile(DATA_DIR)  # type: ignore[attr-defined]
        except Exception:
            webbrowser.open("file://" + DATA_DIR)

    def _read_settings_form(self) -> dict:
        s = dict(self.settings)
        for k, e in self.entries.items():
            s[k] = e.get().strip()
        try:
            s["match_limit"] = max(1, min(500, int(s.get("match_limit") or 50)))
        except ValueError:
            s["match_limit"] = 50
        s["claude_model"] = s.get("claude_model") or "claude-opus-5-5"
        s["keycloak_client_id"] = s.get("keycloak_client_id") or "autodarts-play"
        s["appearance"] = self.appearance.get()
        return s

    def on_save_settings(self):
        self.settings = self._read_settings_form()
        try:
            save_settings(self.settings)
        except Exception as e:
            messagebox.showerror(APP_NAME, f"Speichern fehlgeschlagen:\n{e}")
            return
        self.client = None
        self.set_status("Einstellungen gespeichert.")
        if is_configured(self.settings):
            messagebox.showinfo(APP_NAME, "Gespeichert! Du kannst jetzt links auf\n"
                                          "„Stats aktualisieren & Analyse starten“ klicken.")

    def on_test_login(self):
        self.settings = self._read_settings_form()
        self.client = None

        def job():
            c = self._get_client()
            c.login()
            return f"Login OK – angemeldet als {c.username}"
        self._run_bg(job, lambda msg: (self.set_status(msg), messagebox.showinfo(APP_NAME, msg)))

    # ------------------------------------------------------------ Actions
    def _get_client(self) -> AutodartsClient:
        s = self.settings
        if self.client is None or self.client.email != s["autodarts_email"] or \
                self.client.password != s["autodarts_password"]:
            self.client = AutodartsClient(s["autodarts_email"], s["autodarts_password"],
                                          s.get("keycloak_client_id", "autodarts-play"))
        return self.client

    def on_refresh(self):
        if self.busy:
            return
        if not is_configured(self.settings):
            self.show("settings")
            messagebox.showwarning(APP_NAME, "Bitte zuerst Autodarts-Zugangsdaten und Claude API-Key eintragen "
                                             "und speichern.")
            return

        def job():
            client = self._get_client()
            raw = client.fetch_everything(int(self.settings.get("match_limit", 50)),
                                          progress=lambda msg, frac: self.queue.put(("progress", msg, frac)))
            result = compute_metrics(raw)
            sid = self.storage.add_snapshot(result["metrics"], result["matches"], raw)
            return sid

        def done(sid):
            self._load_latest(sid)
            self.set_status("Statistiken aktualisiert. Starte KI-Analyse …")
            self._start_coach()
        self._run_bg(job, done)

    def on_reanalyze(self):
        if self.busy:
            return
        if not self.current_snapshot:
            messagebox.showinfo(APP_NAME, "Noch keine Statistiken vorhanden – bitte zuerst aktualisieren.")
            return
        if not self.settings.get("anthropic_api_key"):
            self.show("settings")
            messagebox.showwarning(APP_NAME, "Bitte zuerst den Claude API-Key eintragen.")
            return
        self._start_coach()

    def _start_coach(self):
        snap = self.current_snapshot
        snaps = self.storage.list_snapshots(limit=30)
        history = [s for s in snaps if s["id"] < snap["id"]][:20]
        previous = history[0] if history else None
        comparison = compare(snap["metrics"], previous["metrics"] if previous else {})
        raw = self.storage.get_raw(snap["id"]) or {}
        payload = build_payload(snap["metrics"], comparison, history, snap["matches"], raw)
        self.show("coach")
        self._set_coach_text("", formatted=False)
        self.progress.configure(mode="indeterminate")
        self.progress.start()

        def job():
            text = run_coach(self.settings["anthropic_api_key"], self.settings.get("claude_model"), payload,
                             lambda t: self.queue.put(("coach_text", t)))
            self.storage.set_coach_text(snap["id"], text)
            return text

        def done(text):
            self.progress.stop()
            self.progress.configure(mode="determinate")
            self.progress.set(1)
            snap["coach_text"] = text
            self._set_coach_text(text)
            self.set_status("Analyse fertig.")

        def failed():
            self.progress.stop()
            self.progress.configure(mode="determinate")
            self.progress.set(0)
        self.set_status("Claude analysiert deine Daten …")
        self._run_bg(job, done, on_error=failed)

    def _run_bg(self, job, on_done, on_error=None):
        self.busy = True
        self.main_btn.configure(state="disabled")
        self.reanalyze_btn.configure(state="disabled")

        def worker():
            try:
                res = job()
                self.queue.put(("done", on_done, res))
            except (AutodartsError, CoachError) as e:
                log.warning("Fehler: %s", e)
                self.queue.put(("error", str(e), on_error))
            except Exception as e:
                log.error("Unerwarteter Fehler:\n%s", traceback.format_exc())
                self.queue.put(("error", f"Unerwarteter Fehler: {e}\n(Details in log.txt im Datenordner)", on_error))
        threading.Thread(target=worker, daemon=True).start()

    def _poll_queue(self):
        try:
            while True:
                item = self.queue.get_nowait()
                kind = item[0]
                if kind == "progress":
                    self.set_status(item[1])
                    self.progress.set(item[2])
                elif kind == "coach_text":
                    self._append_coach(item[1])
                elif kind == "done":
                    self._finish_bg()
                    item[1](item[2])
                elif kind == "error":
                    self._finish_bg()
                    if item[2]:
                        item[2]()
                    self.set_status("Fehler – siehe Meldung.")
                    messagebox.showerror(APP_NAME, item[1])
        except queue.Empty:
            pass
        self.after(50, self._poll_queue)

    def _finish_bg(self):
        self.busy = False
        self.main_btn.configure(state="normal")
        self.reanalyze_btn.configure(state="normal")

    def set_status(self, text):
        self.status.configure(text=text)

    # ------------------------------------------------------------ Loading
    def _load_latest(self, sid=None):
        snaps = self.storage.list_snapshots()
        if not snaps:
            self.current_snapshot = None
            self._render_history()
            return
        snap = next((s for s in snaps if s["id"] == sid), snaps[0]) if sid else snaps[0]
        self.current_snapshot = snap
        older = [s for s in snaps if s["id"] < snap["id"]]
        self._render_dashboard(snap, older[0] if older else None)
        self.compare_var.set("vorheriger Abruf")
        self._render_progress()
        self._render_history()
        if snap.get("coach_text"):
            self._set_coach_text(snap["coach_text"])
        else:
            self._set_coach_text("Für diesen Abruf gibt es noch keine KI-Analyse. "
                                 "Klicke links auf „Nur KI-Analyse wiederholen“.")

    def _selftest_finish(self):
        """Wird beim Build-Test genutzt: rendert alle Seiten mit Beispieldaten und beendet sich."""
        try:
            fake = {"id": 0, "created_at": 1.7e9, "coach_text": "## Test\n**ok**\n- Punkt",
                    "metrics": {d[0]: 10.0 for d in METRIC_DEFS},
                    "matches": [{"date": "2026-01-01T10:00", "variant": "X01 501", "average": 55.2, "won": 1}]}
            self._render_dashboard(fake, None)
            self._set_coach_text(fake["coach_text"])
            for k in self.pages:
                self.show(k)
                self.update()
            with open(os.path.join(DATA_DIR, "selftest_ok.txt"), "w", encoding="utf-8") as f:
                f.write("OK")
        finally:
            self.destroy()
