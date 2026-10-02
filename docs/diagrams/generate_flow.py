#!/usr/bin/env python3
"""Builds the Cooler Calls page-flow board as an Excalidraw scene.

Shows how a lead travels through the product: outside channels -> ingestion ->
database -> the screens Denise, her techs and her bookkeeper actually use, with the
one continuous demo story numbered 1-9 along the way.

Run:   python3 docs/diagrams/generate_flow.py
Open:  https://excalidraw.com -> Menu -> Open (or drag the .excalidraw file in)
"""
import json
import os
import random

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "cooler-calls-page-flow.excalidraw")
random.seed(7)

MONO = 3          # Cascadia
CHARW = 0.605     # width of one Cascadia char relative to font size
LH = 1.25
INK = "#1e1e1e"
MUTED = "#5c6372"

# palette: one hue per role so the board reads at a glance
CHANNEL = "#ffec99"   # outside world
PIPE    = "#d0bfff"   # ingestion + AI
DATA    = "#bac8ff"   # database
OWNER   = "#a5d8ff"   # Denise's screens
PUBLIC  = "#b2f2bb"   # customer-facing, no login
TECH    = "#ffd8a8"   # tech view
BOOKS   = "#eebefa"   # bookkeeper
GOLD    = "#e8590c"   # the demo story arrows
GREY    = "#e9ecef"


class Scene:
    def __init__(self):
        self.els = []
        self.n = 0
        self.nodes = {}

    def uid(self):
        self.n += 1
        return f"n{self.n}-{random.randrange(1 << 30):x}"

    def _base(self, type_, x, y, w, h, **kw):
        el = dict(
            id=self.uid(), type=type_, x=x, y=y, width=w, height=h, angle=0,
            strokeColor=INK, backgroundColor="transparent", fillStyle="solid",
            strokeWidth=2, strokeStyle="solid", roughness=1, opacity=100,
            groupIds=[], frameId=None, roundness=None,
            seed=random.randrange(1, 2 ** 31), version=1,
            versionNonce=random.randrange(1, 2 ** 31), isDeleted=False,
            boundElements=[], updated=1759000000000, link=None, locked=False,
        )
        el.update(kw)
        self.els.append(el)
        return el

    def text(self, x, y, s, size=14, color=INK, align="left", bold_box=None):
        w = max((len(line) for line in s.split("\n")), default=0) * size * CHARW
        h = len(s.split("\n")) * size * LH
        return self._base(
            "text", x, y, w, h, strokeColor=color, text=s, originalText=s,
            fontSize=size, fontFamily=MONO, textAlign=align, verticalAlign="top",
            containerId=None, autoResize=True, lineHeight=LH,
        )

    def box(self, key, x, y, w, title, lines=(), fill=OWNER, h=None, dashed=False, title_size=15, body_size=12):
        """A screen / component card. Returns its rect."""
        body = "\n".join(lines)
        h = h or (18 + title_size * LH + (len(lines) * body_size * LH if lines else 0) + 16)
        rect = self._base(
            "rectangle", x, y, w, h, backgroundColor=fill, fillStyle="solid",
            roundness={"type": 3}, strokeStyle="dashed" if dashed else "solid",
            strokeWidth=1 if dashed else 2,
        )
        self.text(x + 14, y + 12, title, size=title_size)
        if lines:
            self.text(x + 14, y + 12 + title_size * LH + 4, body, size=body_size, color=MUTED)
        self.nodes[key] = dict(x=x, y=y, w=w, h=h)
        return rect

    def label(self, x, y, s, size=12, color=MUTED):
        return self.text(x, y, s, size=size, color=color)

    # ---- geometry helpers -------------------------------------------------
    def port(self, key, side):
        b = self.nodes[key]
        return {
            "l": (b["x"], b["y"] + b["h"] / 2),
            "r": (b["x"] + b["w"], b["y"] + b["h"] / 2),
            "t": (b["x"] + b["w"] / 2, b["y"]),
            "b": (b["x"] + b["w"] / 2, b["y"] + b["h"]),
        }[side]

    def arrow(self, a, b, text=None, color=MUTED, step=None, dashed=False, bend=None, sides=("r", "l"), gap=6):
        (x1, y1) = self.port(a, sides[0]) if isinstance(a, str) else a
        (x2, y2) = self.port(b, sides[1]) if isinstance(b, str) else b
        # nudge off the box edge so the arrow doesn't touch the stroke
        if sides[0] == "r": x1 += gap
        if sides[0] == "l": x1 -= gap
        if sides[0] == "b": y1 += gap
        if sides[0] == "t": y1 -= gap
        if sides[1] == "l": x2 -= gap
        if sides[1] == "r": x2 += gap
        if sides[1] == "t": y2 -= gap
        if sides[1] == "b": y2 += gap

        pts = [[0, 0]]
        if bend == "h":            # horizontal, then vertical
            pts += [[x2 - x1, 0], [x2 - x1, y2 - y1]]
        elif bend == "v":          # vertical, then horizontal
            pts += [[0, y2 - y1], [x2 - x1, y2 - y1]]
        else:
            pts += [[x2 - x1, y2 - y1]]

        stroke = GOLD if step else color
        self._base(
            "arrow", x1, y1, abs(x2 - x1), abs(y2 - y1), points=pts,
            strokeColor=stroke, strokeWidth=2 if step else 1.5,
            strokeStyle="dashed" if dashed else "solid",
            roundness={"type": 2}, startBinding=None, endBinding=None,
            startArrowhead=None, endArrowhead="arrow", elbowed=False,
        )
        if text or step:
            mx, my = (x1 + x2) / 2, (y1 + y2) / 2
            if bend == "h":
                mx, my = x2, (y1 + y2) / 2
            elif bend == "v":
                mx, my = (x1 + x2) / 2, y2
            caption = f"{step}  {text}" if (step and text) else (text or str(step))
            w = len(caption) * 12 * CHARW
            if abs(y2 - y1) > abs(x2 - x1):          # mostly vertical: sit beside the line
                self.text(mx + 10, my - 8, caption, size=12, color=GOLD if step else MUTED)
            else:
                self.text(mx - w / 2, my - 20, caption, size=12, color=GOLD if step else MUTED)

    def badge(self, x, y, n):
        self._base("ellipse", x, y, 26, 26, backgroundColor=GOLD, strokeColor=GOLD)
        self.text(x + 8, y + 5, str(n), size=14, color="#ffffff")

    def dump(self, path):
        scene = {
            "type": "excalidraw", "version": 2,
            "source": "cooler-calls docs/diagrams/generate_flow.py",
            "elements": self.els,
            "appState": {"viewBackgroundColor": "#ffffff", "gridSize": None},
            "files": {},
        }
        with open(path, "w") as f:
            json.dump(scene, f, indent=1)
        return len(self.els)


s = Scene()

# ============================================================ title
s.text(40, 30, "Cooler Calls — page flow", size=30)
s.text(40, 72, "How a lead travels from the outside world to a finished job. Orange = the demo story, 1-9.", size=14, color=MUTED)

# ============================================================ legend
lx = 40
for name, col in [("outside", CHANNEL), ("pipeline + AI", PIPE), ("database", DATA),
                  ("owner screens", OWNER), ("public, no login", PUBLIC),
                  ("tech", TECH), ("bookkeeper", BOOKS)]:
    s._base("rectangle", lx, 104, 14, 14, backgroundColor=col, roundness={"type": 3}, strokeWidth=1)
    s.text(lx + 20, 103, name, size=12, color=MUTED)
    lx += 24 + len(name) * 12 * CHARW + 22

Y0 = 170

# ============================================================ column 1 — channels
s.text(40, Y0 - 34, "1. IT COMES IN", size=13, color=MUTED)
s.box("ch_call", 40, Y0, 210, "Phone call", ["office line rings", "her cell"], CHANNEL)
s.box("ch_sms", 40, Y0 + 110, 210, "Text message", ["repeat customers,", "referrals"], CHANNEL)
s.box("ch_form", 40, Y0 + 220, 210, "Website form", ["goes to an", "email inbox"], CHANNEL)
s.box("ch_email", 40, Y0 + 330, 210, "Email", ["service@ inbox"], CHANNEL)
s.box("ch_note", 40, Y0 + 425, 210, "Her notebook", ["typed in by hand"], CHANNEL)

# ============================================================ column 2 — entry points
s.text(330, Y0 - 34, "2. ENTRY POINT", size=13, color=MUTED)
s.box("ep_dialer", 330, Y0, 250, "/dialer", ["inbound ring UI,", "missed call -> lead"], OWNER)
s.box("ep_sms", 330, Y0 + 110, 250, "POST /api/webhooks", ["twilio/sms  (signed)"], PIPE)
s.box("ep_form", 330, Y0 + 205, 250, "/request", ["public page ->", "POST /api/public/request"], PUBLIC)
s.box("ep_gmail", 330, Y0 + 315, 250, "GET /api/gmail/sync", ["OAuth mailbox pull"], PIPE)
s.box("ep_new", 330, Y0 + 410, 250, "/jobs/new", ["paste a message,", "parser fills the form"], OWNER)

for a, b in [("ch_call", "ep_dialer"), ("ch_sms", "ep_sms"), ("ch_form", "ep_form"),
             ("ch_email", "ep_gmail"), ("ch_note", "ep_new")]:
    s.arrow(a, b)

# ============================================================ column 3 — pipeline
s.text(660, Y0 - 34, "3. ONE PIPELINE", size=13, color=MUTED)
s.box("pipe", 660, Y0 + 60, 290, "ingestMessage()", [
    "1  store the raw message",
    "2  extract  (Groq -> zod)",
    "   fallback: rule parser",
    "3  match customer",
    "   phone / email / fuzzy name",
    "4  create job  or attach",
    "5  apply intent",
    "   yes -> approved",
    "   no  -> lost",
    "6  write Activity",
], PIPE)

s.box("calls", 660, Y0 + 330, 290, "call pipeline", [
    "record mic -> Whisper",
    "-> extract -> field diff",
    "-> apply to the job",
], PIPE)

for a in ["ep_dialer", "ep_sms", "ep_form", "ep_gmail"]:
    s.arrow(a, "pipe", bend="h")
s.arrow("ep_dialer", "calls", bend="h")

# ============================================================ column 4 — database
s.text(1030, Y0 - 34, "4. ONE RECORD", size=13, color=MUTED)
s.box("db", 1030, Y0 + 150, 250, "Database", [
    "Customer / Site / Equipment",
    "Job  (stage machine)",
    "Message / Call / Quote",
    "Tech / Activity / User",
], DATA, h=150)
s.arrow("pipe", "db", sides=("r", "l"))
s.arrow("calls", "db", bend="h", sides=("r", "l"))
s.arrow("ep_new", "db", bend="h", sides=("r", "b"))

# ============================================================ column 5 — the screens
s.text(1380, Y0 - 34, "5. WHAT SHE OPENS", size=13, color=MUTED)
s.box("today", 1380, Y0 + 120, 300, "/  Today", [
    "the call list, rules-built",
    "urgent first, reason + waited",
    "Call  Text  Email  Contacted",
    "Move to next stage",
], OWNER, h=130)
s.arrow("db", "today", sides=("r", "l"))

s.box("inbox", 1380, Y0 - 10, 300, "/inbox", [
    "every channel, threaded",
    "accept / edit / not a lead",
], OWNER)
s.arrow("db", "inbox", bend="v", sides=("t", "l"))

s.box("jobs", 1380, Y0 + 290, 300, "/jobs", ["kanban by stage + list", "drag to move"], OWNER)
s.box("job", 1380, Y0 + 385, 300, "/jobs/[id]", ["timeline, quotes, calls,", "messages, schedule"], OWNER)
s.box("cust", 1380, Y0 + 490, 300, "/customers/[id]", ["sites, equipment, history"], OWNER)
s.arrow("today", "jobs", sides=("b", "t"))
s.arrow("jobs", "job", sides=("b", "t"))
s.arrow("job", "cust", sides=("b", "t"))

# ============================================================ column 6 — money + dispatch
s.text(1760, Y0 - 34, "6. MONEY + DISPATCH", size=13, color=MUTED)
s.box("quote", 1760, Y0 + 290, 290, "/quotes/[id]", [
    "line items from a price list",
    "totals computed server-side",
    "print  /  PDF  /  send",
], OWNER)
s.box("pub", 1760, Y0 + 420, 290, "/q/[token]", [
    "the customer, no login",
    "Accept  or  Decline  (once)",
], PUBLIC)
s.box("sched", 1760, Y0 + 540, 290, "/schedule", [
    "week board, lane per tech",
    "drag to book, warns on clash",
], OWNER)
s.arrow("job", "quote", sides=("r", "l"))
s.arrow("quote", "pub", sides=("b", "t"), text="send")


# ============================================================ column 7 — outcomes
s.text(2140, Y0 - 34, "7. IT GETS DONE", size=13, color=MUTED)
s.box("login", 2140, Y0 + 10, 270, "/login", [
    "pick a user, no password",
    "owner      -> Today",
    "bookkeeper -> Reports",
    "tech       -> Tech view",
    "enforced server-side",
], GREY)
s.box("reports", 2140, Y0 + 170, 270, "/reports", [
    "pipeline, sources, win rate",
    "first response, revenue",
    "jobs per tech  +  CSV",
], BOOKS)
# the same database, drawn again so the board has no long lines across it
s.box("db2", 2140, Y0 + 330, 270, "Database  (same)", ["every screen reads", "and writes here"], DATA)
s.box("tech", 2140, Y0 + 460, 270, "/tech", [
    "phone-first, own jobs only",
    "On my way  ->  texts customer",
    "Mark done  + notes, photo",
], TECH)
s.arrow("login", "today", sides=("l", "t"), dashed=True, text="owner")
s.arrow("db2", "reports", sides=("t", "b"), dashed=True)
s.arrow("tech", "db2", sides=("t", "b"), dashed=True, text="done")
s.arrow("sched", "tech", sides=("r", "l"), text="assign")
s.arrow("pub", "db2", sides=("r", "l"), dashed=True, text="accept")

# ============================================================ the demo story, numbered
story = [
    (286, Y0 + 228, 1),   # email/form arrives
    (960, Y0 + 180, 2),   # pipeline -> db
    (1300, Y0 + 205, 3),  # db -> today
    (1345, Y0 + 180, 4),  # today -> call
    (1700, Y0 + 350, 5),  # job -> quote
    (2065, Y0 + 400, 6),  # quote -> public page
    (1700, Y0 + 520, 7),  # approved -> schedule
    (2080, Y0 + 560, 8),  # schedule -> tech
    (2290, Y0 + 300, 9),  # done -> reports
]
for x, y, n in story:
    s.badge(x, y, n)

# ============================================================ story key
s.box("key", 40, Y0 + 560, 560, "The two-minute demo", [
    "1  email lands in the Inbox, becomes an urgent lead",
    "2  pipeline writes customer + job + activity",
    "3  it is top of Today, in red, with a suggested next step",
    "4  Call from the row -> dialer -> transcript -> apply the diff",
    "5  build the quote on the job, send it",
    "6  customer accepts at the public link -> job approved",
    "7  drag it onto a tech's slot on the schedule",
    "8  tech marks it done from the phone",
    "9  reports and the week's revenue move",
], GREY)

n = s.dump(OUT)
print(f"wrote {OUT}  ({n} elements)")
