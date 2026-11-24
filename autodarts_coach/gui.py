"""CustomTkinter-Oberfläche des Autodarts AI Coach (manuelle Eingabe, keine Verbindung zu Autodarts)."""

import datetime as dt
import logging
import os
import queue
import re
import threading
import tkinter as tk
import traceback
import webbrowser
from tkinter import filedialog, messagebox

import customtkinter as ctk

from . import APP_NAME, __version__
from .coach import CoachError, build_payload, run_coach
from .paths import DATA_DIR
from .secure_store import is_configured, load_settings, save_settings
from .stats import (ENTRY_FIELDS, METRIC_DEFS, METRIC_INDEX, EntryError, average_of, compare, fmt,
                    session_metrics, validate_entry)
from .storage import Storage

log = logging.getLogger(__name__)

GREEN = "#2fbf71"
RED = "#e5484d"
GREY = "#8b8d98"
ACCENT = "#e8a33d"
ACCENT_HOVER = "#c9862a"
CARD_KEYS = ["average", "first9", "checkout_pct", "win_rate", "t180_per_leg", "plus140_per_leg",
             "plus100_per_leg", "highest_checkout", "best_leg", "bobs27", "atc_darts", "jdc", "rc_pct"]
STATUS_COLOR = {"besser": GREEN, "schlechter": RED, "gleich": GREY, "neu": GREY}
STATUS_ARROW = {"besser": "▲", "schlechter": "▼", "gleich": "■", "neu": "•"}
MODES = ["501 gegen Bot", "501 Online / Lobby", "501 Training (allein)", "301", "Cricket", "Nur Trainingsspiele",
         "Sonstiges"]


def de_date(iso: str) -> str:
    try:
        return dt.date.fromisoformat(iso).strftime("%d.%m.%Y")
    except ValueError:
        return iso


def parse_date(text: str) -> str:
    text = text.strip()
    for f in ("%d.%m.%Y", "%Y-%m-%d", "%d.%m.%y"):
        try:
            return dt.datetime.strptime(text, f).date().isoformat()
        except ValueError:
            pass
    raise EntryError("Datum bitte als TT.MM.JJJJ eingeben, z. B. 24.11.2026.")


class App(ctk.CTk):
    def __init__(self, selftest: bool = False):
        super().__init__()
        self.settings = load_settings()
        ctk.set_appearance_mode(self.settings.get("appearance", "dark"))
        ctk.set_default_color_theme("dark-blue")
        self.title(f"{APP_NAME} {__version__}")
        self.geometry("1280x840")
        self.minsize(1040, 700)

        self.storage = Storage()
        self.queue: queue.Queue = queue.Queue()
        self.busy = False
        self.sessions: list[dict] = []
        self.current: dict | None = None
        self.editing_id: int | None = None

        self.grid_columnconfigure(1, weight=1)
        self.grid_rowconfigure(0, weight=1)
        self._build_sidebar()
        self.content = ctk.CTkFrame(self, fg_color="transparent")
        self.content.grid(row=0, column=1, sticky="nsew", padx=16, pady=16)
        self.content.grid_columnconfigure(0, weight=1)
        self.content.grid_rowconfigure(0, weight=1)

        self.pages = {
            "entry": self._build_entry(),
            "dashboard": self._build_dashboard(),
            "progress": self._build_progress(),
            "coach": self._build_coach(),
            "history": self._build_history(),
            "settings": self._build_settings(),
        }
        self.after(50, self._poll_queue)
        self.reload()
        self.show("dashboard" if self.sessions else "entry")
        if not is_configured(self.settings):
            self.set_status("Tipp: Für den KI-Coach einmalig den Claude API-Key in den Einstellungen eintragen.")
        if selftest:
            self.after(2500, self._selftest_finish)

    # ------------------------------------------------------------ Layout
    def _build_sidebar(self):
        sb = ctk.CTkFrame(self, width=260, corner_radius=0)
        sb.grid(row=0, column=0, sticky="nsw")
        sb.grid_rowconfigure(10, weight=1)
        ctk.CTkLabel(sb, text="🎯 Autodarts\nAI Coach", font=ctk.CTkFont(size=24, weight="bold"),
                     justify="left").grid(row=0, column=0, padx=20, pady=(24, 18), sticky="w")

        self.main_btn = ctk.CTkButton(sb, text="➕  Neue Session eintragen", height=54,
                                      font=ctk.CTkFont(size=15, weight="bold"), fg_color=ACCENT,
                                      hover_color=ACCENT_HOVER, text_color="#1a1a1a", command=self.new_entry)
        self.main_btn.grid(row=1, column=0, padx=20, pady=(0, 8), sticky="ew")
        self.analyze_btn = ctk.CTkButton(sb, text="🧠  KI-Analyse starten", fg_color="transparent",
                                         border_width=1, command=self.on_analyze)
        self.analyze_btn.grid(row=2, column=0, padx=20, pady=(0, 18), sticky="ew")

        self.nav_buttons = {}
        for i, (key, label) in enumerate([("entry", "✏  Session eintragen"), ("dashboard", "📊  Dashboard"),
                                          ("progress", "📈  Fortschritte"), ("coach", "🧠  KI-Coach"),
                                          ("history", "🗂  Historie"), ("settings", "⚙  Einstellungen")]):
            b = ctk.CTkButton(sb, text=label, anchor="w", fg_color="transparent", height=38,
                              text_color=("gray10", "gray90"), hover_color=("gray75", "gray25"),
                              command=lambda k=key: self.show(k))
            b.grid(row=3 + i, column=0, padx=12, pady=2, sticky="ew")
            self.nav_buttons[key] = b

        self.progress = ctk.CTkProgressBar(sb)
        self.progress.set(0)
        self.progress.grid(row=11, column=0, padx=20, pady=(8, 4), sticky="ew")
        self.status = ctk.CTkLabel(sb, text="Bereit.", wraplength=220, justify="left", anchor="w",
                                   font=ctk.CTkFont(size=12))
        self.status.grid(row=12, column=0, padx=20, pady=(0, 6), sticky="ew")
        ctk.CTkLabel(sb, text="🔒 Keine Verbindung zu Autodarts –\nalle Werte trägst du selbst ein.",
                     text_color=GREY, font=ctk.CTkFont(size=11), justify="left").grid(
            row=13, column=0, padx=20, pady=(0, 16), sticky="w")

    def show(self, key):
        for k, p in self.pages.items():
            p.grid_forget()
            self.nav_buttons[k].configure(fg_color="transparent")
        self.pages[key].grid(row=0, column=0, sticky="nsew")
        self.nav_buttons[key].configure(fg_color=("gray75", "gray25"))
        if key == "dashboard":
            self.after(30, self._draw_chart)

    def _title(self, parent, text, sub=None):
        ctk.CTkLabel(parent, text=text, font=ctk.CTkFont(size=22, weight="bold")).pack(anchor="w")
        if sub:
            ctk.CTkLabel(parent, text=sub, text_color=GREY, justify="left").pack(anchor="w", pady=(0, 10))

    # -------------------------------------------------------- Eintragen
    def _build_entry(self):
        page = ctk.CTkScrollableFrame(self.content, fg_color="transparent")
        self.entry_title = ctk.CTkLabel(page, text="Session eintragen", font=ctk.CTkFont(size=22, weight="bold"))
        self.entry_title.pack(anchor="w")
        ctk.CTkLabel(page, text="Trag die Werte aus der Match-Übersicht in Autodarts ein. Leere Felder sind okay – "
                                "je mehr du einträgst, desto genauer wird die Analyse.\n"
                                "Kommazahlen gehen mit Komma oder Punkt (54,3 oder 54.3).",
                     text_color=GREY, justify="left").pack(anchor="w", pady=(0, 10))

        top = ctk.CTkFrame(page)
        top.pack(fill="x", pady=(0, 10))
        ctk.CTkLabel(top, text="Datum").grid(row=0, column=0, padx=14, pady=12, sticky="w")
        self.date_entry = ctk.CTkEntry(top, width=130)
        self.date_entry.grid(row=0, column=1, padx=(0, 20), pady=12, sticky="w")
        ctk.CTkLabel(top, text="Modus").grid(row=0, column=2, padx=(0, 10), pady=12, sticky="w")
        self.mode_var = ctk.StringVar(value=MODES[0])
        ctk.CTkOptionMenu(top, variable=self.mode_var, values=MODES, width=210).grid(row=0, column=3, pady=12)
        ctk.CTkLabel(top, text="Gegner / Bot-Level").grid(row=0, column=4, padx=(20, 10), pady=12, sticky="w")
        self.opponent_entry = ctk.CTkEntry(top, width=160, placeholder_text="z. B. Bot Level 6")
        self.opponent_entry.grid(row=0, column=5, padx=(0, 14), pady=12, sticky="w")

        self.field_entries: dict[str, ctk.CTkEntry] = {}
        for group, title in (("match", "Match-Werte (501 / X01)"), ("training", "Trainingsspiele (optional)")):
            box = ctk.CTkFrame(page)
            box.pack(fill="x", pady=(0, 10))
            ctk.CTkLabel(box, text=title, font=ctk.CTkFont(size=16, weight="bold")).grid(
                row=0, column=0, columnspan=6, padx=14, pady=(10, 4), sticky="w")
            for c in range(3):
                box.grid_columnconfigure(c * 2 + 1, weight=1)
            for i, (key, label, _rng, hint) in enumerate(ENTRY_FIELDS[group]):
                r, c = 1 + i // 3, (i % 3) * 2
                ctk.CTkLabel(box, text=label, anchor="w").grid(row=r, column=c, padx=(14, 8), pady=5, sticky="w")
                e = ctk.CTkEntry(box, width=120, placeholder_text=hint)
                e.grid(row=r, column=c + 1, padx=(0, 14), pady=5, sticky="w")
                self.field_entries[key] = e
            ctk.CTkLabel(box, text="").grid(row=99, column=0, pady=2)

        notes_box = ctk.CTkFrame(page)
        notes_box.pack(fill="x", pady=(0, 10))
        ctk.CTkLabel(notes_box, text="Notizen (optional)", font=ctk.CTkFont(size=16, weight="bold")).pack(
            anchor="w", padx=14, pady=(10, 0))
        ctk.CTkLabel(notes_box, text="z. B. „D16 lief gut, auf D20 oft knapp drunter, nach 30 Min. müde, "
                                     "nervös bei Matchdarts“", text_color=GREY).pack(anchor="w", padx=14)
        self.notes_box = ctk.CTkTextbox(notes_box, height=80)
        self.notes_box.pack(fill="x", padx=14, pady=(4, 12))

        btns = ctk.CTkFrame(page, fg_color="transparent")
        btns.pack(fill="x", pady=(0, 20))
        self.save_analyze_btn = ctk.CTkButton(btns, text="Speichern & KI-Analyse starten", height=42,
                                              fg_color=ACCENT, hover_color=ACCENT_HOVER, text_color="#1a1a1a",
                                              font=ctk.CTkFont(size=14, weight="bold"),
                                              command=lambda: self.on_save_entry(analyze=True))
        self.save_analyze_btn.pack(side="left")
        ctk.CTkButton(btns, text="Nur speichern", height=42, command=lambda: self.on_save_entry(False)).pack(
            side="left", padx=10)
        ctk.CTkButton(btns, text="Felder leeren", height=42, fg_color="transparent", border_width=1,
                      command=self.new_entry).pack(side="left")
        self._clear_form()
        return page

    def _clear_form(self):
        self.editing_id = None
        self.entry_title.configure(text="Session eintragen")
        self.date_entry.delete(0, "end")
        self.date_entry.insert(0, dt.date.today().strftime("%d.%m.%Y"))
        self.mode_var.set(MODES[0])
        self.opponent_entry.delete(0, "end")
        for e in self.field_entries.values():
            e.delete(0, "end")
        self.notes_box.delete("1.0", "end")

    def new_entry(self):
        self._clear_form()
        self.show("entry")

    def _edit_session(self, s: dict):
        self._clear_form()
        self.editing_id = s["id"]
        self.entry_title.configure(text=f"Session vom {de_date(s['date'])} bearbeiten")
        self.date_entry.delete(0, "end")
        self.date_entry.insert(0, de_date(s["date"]))
        mode, _, opp = s["mode"].partition(" · ")
        self.mode_var.set(mode if mode in MODES else "Sonstiges")
        self.opponent_entry.insert(0, opp)
        for k, v in s["entry"].items():
            if k in self.field_entries:
                self.field_entries[k].insert(0, fmt(v))
        self.notes_box.insert("1.0", s["notes"])
        self.show("entry")

    def on_save_entry(self, analyze: bool):
        if self.busy:
            return
        try:
            date_iso = parse_date(self.date_entry.get())
            entry = validate_entry({k: e.get() for k, e in self.field_entries.items()})
        except EntryError as e:
            messagebox.showwarning(APP_NAME, str(e))
            return
        mode = self.mode_var.get()
        opp = self.opponent_entry.get().strip()
        if opp:
            mode = f"{mode} · {opp}"
        notes = self.notes_box.get("1.0", "end").strip()
        metrics = session_metrics(entry)
        if self.editing_id:
            sid = self.editing_id
            self.storage.update(sid, date_iso, mode, entry, metrics, notes)
        else:
            sid = self.storage.add(date_iso, mode, entry, metrics, notes)
        self._clear_form()
        self.reload(sid)
        self.set_status(f"Session vom {de_date(date_iso)} gespeichert.")
        if analyze:
            self.on_analyze()
        else:
            self.show("dashboard")

    # --------------------------------------------------------- Dashboard
    def _build_dashboard(self):
        page = ctk.CTkScrollableFrame(self.content, fg_color="transparent")
        self._title(page, "Dashboard", "Werte der ausgewählten Session und Veränderung zur Session davor")
        self.dash_info = ctk.CTkLabel(page, text="", text_color=GREY, justify="left")
        self.dash_info.pack(anchor="w", pady=(0, 8))
        self.cards_frame = ctk.CTkFrame(page, fg_color="transparent")
        self.cards_frame.pack(fill="x")
        for c in range(4):
            self.cards_frame.grid_columnconfigure(c, weight=1, uniform="cards")

        head = ctk.CTkFrame(page, fg_color="transparent")
        head.pack(fill="x", pady=(18, 6))
        ctk.CTkLabel(head, text="Verlauf", font=ctk.CTkFont(size=16, weight="bold")).pack(side="left")
        self.chart_var = ctk.StringVar(value=METRIC_INDEX["average"][1])
        ctk.CTkOptionMenu(head, variable=self.chart_var, values=[d[1] for d in METRIC_DEFS], width=280,
                          command=lambda _: self._draw_chart()).pack(side="left", padx=12)
        chart_frame = ctk.CTkFrame(page)
        chart_frame.pack(fill="x")
        self.chart = tk.Canvas(chart_frame, height=240, highlightthickness=0, bd=0)
        self.chart.pack(fill="x", padx=10, pady=10)
        self.chart.bind("<Configure>", lambda _e: self._draw_chart())

        ctk.CTkLabel(page, text="Scoring-Verteilung (pro Leg)",
                     font=ctk.CTkFont(size=16, weight="bold")).pack(anchor="w", pady=(18, 6))
        self.dist_frame = ctk.CTkFrame(page)
        self.dist_frame.pack(fill="x")
        return page

    def _render_dashboard(self):
        for w in self.cards_frame.winfo_children():
            w.destroy()
        for w in self.dist_frame.winfo_children():
            w.destroy()
        s = self.current
        if not s:
            self.dash_info.configure(text="Noch keine Sessions – klicke links auf „Neue Session eintragen“.")
            return
        prev = self._previous_of(s)
        m = s["metrics"]
        rows = {r["key"]: r for r in compare(m, prev["metrics"] if prev else None)}
        info = f"Session vom {de_date(s['date'])}  ·  {s['mode']}"
        info += f"\nverglichen mit {de_date(prev['date'])}" if prev else "\nerste Session (noch kein Vergleich)"
        self.dash_info.configure(text=info)
        keys = [k for k in CARD_KEYS if k in m]
        if not keys:
            ctk.CTkLabel(self.cards_frame, text="Für diese Session wurden keine vergleichbaren Werte eingetragen.",
                         text_color=GREY).grid(row=0, column=0, columnspan=4, sticky="w")
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

        dist = [("60+", "plus60_per_leg"), ("100+", "plus100_per_leg"), ("140+", "plus140_per_leg"),
                ("170+", "plus170_per_leg"), ("180", "t180_per_leg")]
        vals = [(lbl, m.get(k)) for lbl, k in dist if m.get(k) is not None]
        if not vals:
            ctk.CTkLabel(self.dist_frame, text="Trag „Legs gespielt“ und die 60+/100+/140+/180-Anzahlen ein, "
                                               "dann erscheint hier deine Scoring-Verteilung.",
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

    def _draw_chart(self):
        c = self.chart
        dark = ctk.get_appearance_mode() == "Dark"
        bg, fg, grid = ("#2b2b2b", "#dcdcdc", "#3d3d3d") if dark else ("#dbdbdb", "#222222", "#c4c4c4")
        c.configure(bg=bg)
        c.delete("all")
        w, h = max(c.winfo_width(), 200), int(c.cget("height"))
        key = next((d[0] for d in METRIC_DEFS if d[1] == self.chart_var.get()), "average")
        unit = METRIC_INDEX[key][3]
        pts = [(s["date"], s["metrics"][key]) for s in reversed(self.sessions) if key in s["metrics"]]
        if len(pts) < 2:
            c.create_text(w / 2, h / 2, fill=GREY, font=("Segoe UI", 11),
                          text="Ab zwei Sessions mit diesem Wert erscheint hier dein Verlauf.")
            return
        pts = pts[-40:]
        vals = [v for _, v in pts]
        lo, hi = min(vals), max(vals)
        pad = (hi - lo) * 0.15 or 1.0
        lo, hi = lo - pad, hi + pad
        left, right, top, bottom = 56, w - 16, 14, h - 30
        for i in range(5):
            y = top + (bottom - top) * i / 4
            c.create_line(left, y, right, y, fill=grid)
            c.create_text(left - 8, y, text=fmt(hi - (hi - lo) * i / 4), fill=GREY, anchor="e",
                          font=("Segoe UI", 9))

        def xy(i, v):
            x = left + (right - left) * i / (len(pts) - 1)
            return x, bottom - (v - lo) / (hi - lo) * (bottom - top)

        coords = [xy(i, v) for i, (_, v) in enumerate(pts)]
        if len(coords) >= 5:  # gleitender Schnitt über 5 Sessions
            ma = []
            for i in range(len(vals)):
                win = vals[max(0, i - 4):i + 1]
                ma.append(xy(i, sum(win) / len(win)))
            c.create_line(*[p for xy_ in ma for p in xy_], fill=GREY, width=2, dash=(4, 3), smooth=True)
        c.create_line(*[p for xy_ in coords for p in xy_], fill=ACCENT, width=3)
        step = max(1, len(pts) // 8)
        for i, ((d, v), (x, y)) in enumerate(zip(pts, coords)):
            c.create_oval(x - 4, y - 4, x + 4, y + 4, fill=ACCENT, outline=bg, width=2)
            if i % step == 0 or i == len(pts) - 1:
                c.create_text(x, bottom + 14, text=de_date(d)[:6], fill=GREY, font=("Segoe UI", 9))
        lx, ly = coords[-1]
        c.create_text(lx - 6, ly - 12, text=fmt(vals[-1], unit), fill=fg, anchor="e",
                      font=("Segoe UI", 10, "bold"))
        if len(coords) >= 5:
            c.create_text(right, top, text="- - Schnitt der letzten 5", fill=GREY, anchor="ne", font=("Segoe UI", 9))

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
        ctk.CTkLabel(bar, text="Ausgewählte Session vergleichen mit:").pack(side="left")
        self.compare_var = ctk.StringVar(value="vorherige Session")
        self.compare_menu = ctk.CTkOptionMenu(bar, variable=self.compare_var, values=["vorherige Session"],
                                              command=lambda _: self._render_progress(), width=300)
        self.compare_menu.pack(side="left", padx=10)

        self.better_frame = ctk.CTkScrollableFrame(page, label_text="▲ Fortschritte", label_text_color=GREEN)
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
        cur = self.current
        if not cur:
            self.same_label.configure(text="Noch keine Sessions vorhanden.")
            return
        older = self._older_than(cur)
        options = ["vorherige Session"]
        if len(older) >= 2:
            options.append("Schnitt aller früheren Sessions")
        if len(older) >= 6:
            options.append("Schnitt letzte 5 vs. die 5 davor")
        if older:
            options.append("erste Session")
        options += [f"{de_date(s['date'])} – {s['mode']} (#{s['id']})" for s in older]
        self.compare_menu.configure(values=options)
        choice = self.compare_var.get()
        if choice not in options:
            choice = "vorherige Session"
            self.compare_var.set(choice)
        if not older:
            self.same_label.configure(text="Ab der zweiten Session werden hier Veränderungen angezeigt.")
            return

        cur_metrics, cur_label = cur["metrics"], f"Session vom {de_date(cur['date'])}"
        if choice == "vorherige Session":
            ref, ref_label = older[0]["metrics"], f"Session vom {de_date(older[0]['date'])}"
        elif choice.startswith("Schnitt aller"):
            ref, ref_label = average_of([s["metrics"] for s in older]), f"Schnitt aus {len(older)} früheren Sessions"
        elif choice.startswith("Schnitt letzte 5"):
            upto = [cur] + older
            cur_metrics = average_of([s["metrics"] for s in upto[:5]])
            ref = average_of([s["metrics"] for s in upto[5:10]])
            cur_label, ref_label = "Schnitt der letzten 5 Sessions", "Schnitt der 5 Sessions davor"
        elif choice == "erste Session":
            ref, ref_label = older[-1]["metrics"], f"erster Session ({de_date(older[-1]['date'])})"
        else:
            sid = int(choice.rsplit("#", 1)[1].rstrip(")"))
            s = next(x for x in older if x["id"] == sid)
            ref, ref_label = s["metrics"], f"Session vom {de_date(s['date'])}"

        same = []
        for r in compare(cur_metrics, ref):
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
        self.same_label.configure(text=f"Vergleich: {cur_label} mit {ref_label}."
                                       + (f"\nUnverändert: {', '.join(same)}" if same else ""))

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
        text = (self.current or {}).get("coach_text")
        if not text:
            messagebox.showinfo(APP_NAME, "Es gibt noch keine Analyse zum Speichern.")
            return
        name = f"Coach_Analyse_{self.current['date']}.txt"
        path = filedialog.asksaveasfilename(initialdir=DATA_DIR, initialfile=name, defaultextension=".txt",
                                            filetypes=[("Textdatei", "*.txt"), ("Markdown", "*.md")])
        if path:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text)
            self.set_status(f"Gespeichert: {path}")

    def on_analyze(self):
        if self.busy:
            return
        if not self.current:
            messagebox.showinfo(APP_NAME, "Bitte zuerst eine Session eintragen.")
            self.show("entry")
            return
        if not is_configured(self.settings):
            self.show("settings")
            messagebox.showwarning(APP_NAME, "Für den KI-Coach bitte zuerst den Claude API-Key eintragen "
                                             "und speichern.")
            return
        s = self.current
        older = self._older_than(s)
        prev = older[0] if older else None
        upto = [s] + older
        trend = {}
        if len(upto) >= 6:
            trend = {"schnitt_letzte_5": average_of([x["metrics"] for x in upto[:5]]),
                     "schnitt_5_davor": average_of([x["metrics"] for x in upto[5:10]])}
        payload = build_payload(self.settings.get("player_name", ""), s,
                                compare(s["metrics"], prev["metrics"] if prev else None), trend, older[:60])
        self.show("coach")
        self._set_coach_text("", formatted=False)
        self.progress.configure(mode="indeterminate")
        self.progress.start()
        sid = s["id"]

        def job():
            text = run_coach(self.settings["anthropic_api_key"], self.settings.get("claude_model"), payload,
                             lambda t: self.queue.put(("coach_text", t)))
            self.storage.set_coach_text(sid, text)
            return text

        def done(_text):
            self._stop_progress(1)
            self.reload(sid)
            self.set_status("Analyse fertig.")

        self.set_status("Claude analysiert deine Daten …")
        self._run_bg(job, done, on_error=lambda: self._stop_progress(0))

    def _stop_progress(self, value):
        self.progress.stop()
        self.progress.configure(mode="determinate")
        self.progress.set(value)

    # ----------------------------------------------------------- History
    def _build_history(self):
        page = ctk.CTkFrame(self.content, fg_color="transparent")
        page.grid_columnconfigure(0, weight=1)
        page.grid_rowconfigure(1, weight=1)
        head = ctk.CTkFrame(page, fg_color="transparent")
        head.grid(row=0, column=0, sticky="ew")
        self._title(head, "Historie", f"Alle Sessions werden lokal gespeichert in:\n{DATA_DIR}")
        self.hist_frame = ctk.CTkScrollableFrame(page)
        self.hist_frame.grid(row=1, column=0, sticky="nsew")
        return page

    def _render_history(self):
        f = self.hist_frame
        for w in f.winfo_children():
            w.destroy()
        cols = ["Datum", "Modus", "Average", "First-9", "Checkout", "Analyse", "", "", ""]
        for c, h in enumerate(cols):
            f.grid_columnconfigure(c, weight=1 if c < 6 else 0)
            ctk.CTkLabel(f, text=h, font=ctk.CTkFont(weight="bold"), text_color=GREY).grid(
                row=0, column=c, padx=8, pady=4, sticky="w")
        if not self.sessions:
            ctk.CTkLabel(f, text="Noch keine Sessions gespeichert.", text_color=GREY).grid(
                row=1, column=0, columnspan=5, sticky="w", padx=8)
        for r, s in enumerate(self.sessions, start=1):
            m = s["metrics"]
            shown = self.current and s["id"] == self.current["id"]
            vals = [de_date(s["date"]) + ("  ◀" if shown else ""), s["mode"], fmt(m.get("average")),
                    fmt(m.get("first9")), fmt(m.get("checkout_pct"), "%"), "✓" if s["coach_text"] else "–"]
            for c, v in enumerate(vals):
                ctk.CTkLabel(f, text=v, font=ctk.CTkFont(weight="bold") if shown else None).grid(
                    row=r, column=c, padx=8, pady=2, sticky="w")
            ctk.CTkButton(f, text="Anzeigen", width=84, command=lambda s=s: self._select(s["id"])).grid(
                row=r, column=6, padx=3, pady=2)
            ctk.CTkButton(f, text="Bearbeiten", width=90, fg_color="transparent", border_width=1,
                          command=lambda s=s: self._edit_session(s)).grid(row=r, column=7, padx=3, pady=2)
            ctk.CTkButton(f, text="Löschen", width=76, fg_color=RED, hover_color="#b3373b",
                          command=lambda s=s: self._delete(s)).grid(row=r, column=8, padx=3, pady=2)

    def _select(self, sid):
        self.reload(sid)
        self.show("dashboard")

    def _delete(self, s):
        if messagebox.askyesno(APP_NAME, f"Session vom {de_date(s['date'])} wirklich löschen?"):
            self.storage.delete(s["id"])
            self.reload()

    # ---------------------------------------------------------- Settings
    def _build_settings(self):
        page = ctk.CTkScrollableFrame(self.content, fg_color="transparent")
        self._title(page, "Einstellungen", "Der API-Key wird mit Windows-DPAPI verschlüsselt gespeichert "
                                           "(nur dein Windows-Konto kann ihn lesen).")
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

        ctk.CTkLabel(form, text="Claude (Anthropic)", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=0, column=0, columnspan=2, padx=14, pady=(12, 0), sticky="w")
        row(1, "anthropic_api_key", "API-Key", show="•", hint="Beginnt mit sk-ant-…  (console.anthropic.com → API Keys)")
        row(3, "claude_model", "Modell", hint="Standard: claude-opus-5-5")
        ctk.CTkLabel(form, text="Allgemein", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=5, column=0, columnspan=2, padx=14, pady=(18, 0), sticky="w")
        row(6, "player_name", "Dein Name (optional)", hint="Damit der Coach dich persönlich ansprechen kann")

        self.show_secret = ctk.CTkCheckBox(form, text="API-Key anzeigen", command=lambda: self.entries[
            "anthropic_api_key"].configure(show="" if self.show_secret.get() else "•"))
        self.show_secret.grid(row=8, column=1, padx=14, pady=(12, 0), sticky="w")
        ctk.CTkLabel(form, text="Darstellung", anchor="w").grid(row=9, column=0, padx=14, pady=(12, 0), sticky="w")
        self.appearance = ctk.CTkSegmentedButton(form, values=["dark", "light", "system"],
                                                 command=self._set_appearance)
        self.appearance.set(self.settings.get("appearance", "dark"))
        self.appearance.grid(row=9, column=1, padx=14, pady=(12, 0), sticky="w")

        btns = ctk.CTkFrame(form, fg_color="transparent")
        btns.grid(row=10, column=0, columnspan=2, padx=14, pady=16, sticky="w")
        ctk.CTkButton(btns, text="Speichern", fg_color=ACCENT, text_color="#1a1a1a", hover_color=ACCENT_HOVER,
                      command=self.on_save_settings).pack(side="left")
        ctk.CTkButton(btns, text="Datenordner öffnen", fg_color="transparent", border_width=1,
                      command=self._open_data_dir).pack(side="left", padx=10)
        ctk.CTkButton(btns, text="API-Key besorgen", fg_color="transparent", border_width=1,
                      command=lambda: webbrowser.open("https://console.anthropic.com/settings/keys")).pack(side="left")

        ctk.CTkLabel(page, text="Datenschutz: Das Programm verbindet sich nicht mit Autodarts. Für die KI-Analyse "
                                "werden nur deine eingetragenen Werte und Notizen an die Claude API gesendet.",
                     text_color=GREY, wraplength=800, justify="left").pack(anchor="w", pady=(10, 0))
        return page

    def _set_appearance(self, value):
        ctk.set_appearance_mode(value)
        self.after(50, self._draw_chart)

    def _open_data_dir(self):
        try:
            os.startfile(DATA_DIR)  # type: ignore[attr-defined]
        except Exception:
            webbrowser.open("file://" + DATA_DIR)

    def on_save_settings(self):
        s = dict(self.settings)
        for k, e in self.entries.items():
            s[k] = e.get().strip()
        s["claude_model"] = s.get("claude_model") or "claude-opus-5-5"
        s["appearance"] = self.appearance.get()
        try:
            save_settings(s)
        except Exception as e:
            messagebox.showerror(APP_NAME, f"Speichern fehlgeschlagen:\n{e}")
            return
        self.settings = s
        self.set_status("Einstellungen gespeichert.")
        messagebox.showinfo(APP_NAME, "Einstellungen gespeichert.")

    # ------------------------------------------------------------ Helpers
    def _older_than(self, s: dict) -> list[dict]:
        idx = next(i for i, x in enumerate(self.sessions) if x["id"] == s["id"])
        return self.sessions[idx + 1:]

    def _previous_of(self, s: dict):
        older = self._older_than(s)
        return older[0] if older else None

    def reload(self, select_id=None):
        self.sessions = self.storage.list()
        keep = select_id or (self.current["id"] if self.current else None)
        self.current = next((s for s in self.sessions if s["id"] == keep), None) or \
            (self.sessions[0] if self.sessions else None)
        self._render_dashboard()
        self._draw_chart()
        self.compare_var.set("vorherige Session")
        self._render_progress()
        self._render_history()
        if self.current and self.current.get("coach_text"):
            self._set_coach_text(self.current["coach_text"])
        elif self.current:
            self._set_coach_text(f"Für die Session vom {de_date(self.current['date'])} gibt es noch keine "
                                 "KI-Analyse. Klicke links auf „KI-Analyse starten“.")
        else:
            self._set_coach_text("Noch keine Analyse. Trag zuerst eine Session ein.")

    def _run_bg(self, job, on_done, on_error=None):
        self.busy = True
        for b in (self.main_btn, self.analyze_btn, self.save_analyze_btn):
            b.configure(state="disabled")

        def worker():
            try:
                self.queue.put(("done", on_done, job()))
            except CoachError as e:
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
                if item[0] == "coach_text":
                    self._append_coach(item[1])
                elif item[0] == "done":
                    self._finish_bg()
                    item[1](item[2])
                elif item[0] == "error":
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
        for b in (self.main_btn, self.analyze_btn, self.save_analyze_btn):
            b.configure(state="normal")

    def set_status(self, text):
        self.status.configure(text=text)

    def _selftest_finish(self):
        """Build-Test: alle Seiten anzeigen, Diagramm zeichnen, Ergebnis-Datei schreiben, beenden."""
        try:
            for k in self.pages:
                self.show(k)
                self.update()
            self._draw_chart()
            with open(os.path.join(DATA_DIR, "selftest_ok.txt"), "w", encoding="utf-8") as f:
                f.write("OK")
        finally:
            self.destroy()
