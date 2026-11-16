#!/usr/bin/env python3
"""Збирає js/questions.js із source.txt + відволікачів (d1,d2) + нових питань (n1,n2).
Запуск:  python3 tools/build.py
"""
import re, json, sys, os
from collections import Counter
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from d1 import D1
from d2 import D2
from n1 import N1
from n2 import N2

TOPICS = [
 ("tzi",    "Технічні засоби інформаційної безпеки (ТЗІ)"),
 ("crypto", "Криптографічний захист інформації"),
 ("kszi",   "Комплексні системи захисту інформації (КСЗІ)"),
 ("net",    "Комп'ютерні мережі та ІТ в кібербезпеці"),
 ("netsec", "Мережева безпека та захист ІКС"),
 ("os",     "Безпека операційних систем"),
 ("swsec",  "Безпека програмного забезпечення та Web Security"),
 ("inc",    "Управління інцидентами та кібератаки"),
 ("risk",   "Управління ризиками кібербезпеки та політики ІБ"),
 ("law",    "Законодавча та нормативно-правова база кібербезпеки"),
]
def norm(s): return s.replace("’", "'").replace("ʼ", "'").strip()
KEY = {norm(n): k for k, n in TOPICS}

# Питання-дублікати за змістом: в симуляторі потрапляє максимум одне з групи
DUP_GROUPS = [(7,1),(8,5),(4,9),(12,17),(32,103),(40,105),(42,52),(47,83),(25,136),
              (21,139),(50,60),(87,57),(125,68),(86,130),(24,138),(37,157),(22,56)]
DUP_GROUPS = [g for g in DUP_GROUPS if g not in [(22,56),(24,138)]]  # різні за змістом
gid = {}
for i, g in enumerate(DUP_GROUPS):
    for n in g: gid[n] = "g%d" % i

D = {**D1, **D2}
text = open(os.path.join(HERE, "source.txt"), encoding="utf-8").read().splitlines()
orig, i = [], 0
rx = re.compile(r"^\s*(\d+)\.\s*\((.+?)\)\s*:\s*(.*)$")
while i < len(text):
    m = rx.match(text[i])
    if m:
        n, cat, q = int(m.group(1)), norm(m.group(2)), m.group(3).strip()
        j = i + 1
        while j < len(text) and not text[j].strip(): j += 1
        ans = text[j].strip()
        orig.append((n, cat, q, ans)); i = j + 1
    else:
        i += 1

problems = []
out = []
for n, cat, q, ans in orig:
    if cat not in KEY: problems.append("невідома категорія: %s" % cat); continue
    if n not in D: problems.append("немає відволікачів для #%d" % n); continue
    w = list(D[n])
    if len(w) != 3 or len(set(w + [ans])) != 4: problems.append("некоректні варіанти #%d" % n)
    o = {"id": "o%d" % n, "t": KEY[cat], "q": q, "a": [ans] + w}
    if n in gid: o["g"] = gid[n]
    out.append(o)
extra = [x for x in D if x not in {o[0] for o in orig}]
if extra: problems.append("зайві відволікачі: %s" % extra)

for k, row in enumerate(N1 + N2, 1):
    t, q, c, *w = row
    if t not in dict(TOPICS) or len(w) != 3 or len(set(w + [c])) != 4: problems.append("некоректне нове питання #%d: %s" % (k, q[:40]))
    out.append({"id": "n%d" % k, "t": t, "q": q, "a": [c] + w})

if problems:
    print("ПРОБЛЕМИ:"); [print(" -", p) for p in problems]; sys.exit(1)

# статистика «правильна найдовша»
def stats(items):
    lo = sh = tie = 0
    ratio = []
    for o in items:
        L = [len(x) for x in o["a"]]
        if L[0] > max(L[1:]): lo += 1
        if L[0] < min(L[1:]): sh += 1
        ratio.append(L[0] / (sum(L[1:]) / 3))
    n = len(items)
    return "найдовша: %.0f%%  найкоротша: %.0f%%  сер. відношення довжин: %.2f" % (100*lo/n, 100*sh/n, sum(ratio)/n)
print("Усього питань:", len(out), "(оригінальних %d, нових %d)" % (len(orig), len(out)-len(orig)))
print("Усі:        ", stats(out))
print("Оригінальні:", stats([o for o in out if o["id"][0]=="o"]))
print("Нові:       ", stats([o for o in out if o["id"][0]=="n"]))
print("За темами:", dict(Counter(o["t"] for o in out)))

os.makedirs(os.path.join(HERE, "..", "js"), exist_ok=True)
with open(os.path.join(HERE, "..", "js", "questions.js"), "w", encoding="utf-8") as f:
    f.write("// Згенеровано tools/build.py — не редагуйте вручну\n")
    f.write("window.TOPICS = " + json.dumps([{"key": k, "name": n} for k, n in TOPICS], ensure_ascii=False, indent=1) + ";\n")
    f.write("window.QUESTIONS = " + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("OK -> js/questions.js")
