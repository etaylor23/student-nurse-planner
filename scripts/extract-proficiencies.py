#!/usr/bin/env python3
"""Authoring-time tool: (re)generate src/data/seed/proficiencies.ts from the
official NMC 'Standards of proficiency for registered nurses' (2024 update) PDF.

The committed artefact is the generated TS file — this script is NOT run at
runtime and is not a build step. Re-run it only if the NMC republishes the
document.

Usage:  python3 scripts/extract-proficiencies.py
Requires:  pip install pypdf   (already present in this dev environment)

Granularity = individual proficiency statements. Platform items keep codes like
"1.1"; annexe items are prefixed "A"/"B". The few 3rd/4th-level sub-bullets
(Annexe A section 4, Annexe B section 1) are folded verbatim into their X.Y
parent's statement text. The script prints per-group counts and asserts the
known totals so a re-paginated document fails loudly rather than silently.
"""
import io
import json
import os
import re
import sys
import urllib.request

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("pypdf is required: pip install pypdf")

SOURCE_URL = (
    "https://www.nmc.org.uk/globalassets/sitedocuments/standards/2024/"
    "printer-friendly/standards-of-proficiency-for-nurses-print_friendly.pdf"
)
RETRIEVED_ON = "2026-06-22"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO_ROOT, "src", "data", "seed", "proficiencies.ts")

# Page ranges in the 2024 print-friendly PDF (0-based).
PLATFORM_PAGES = range(8, 23)
ANNEXE_A_PAGES = range(24, 27)
ANNEXE_B_PAGES = range(28, 35)

PLATFORM_TITLES = {
    1: "Being an accountable professional",
    2: "Promoting health and preventing ill health",
    3: "Assessing needs and planning care",
    4: "Providing and evaluating care",
    5: "Leading and managing nursing care and working in teams",
    6: "Improving safety and quality of care",
    7: "Coordinating care",
}
ANNEXE_A_TITLE = "Annexe A: Communication and relationship management skills"
PART1 = "Annexe B Part 1: Procedures for assessing people’s needs for person-centred care"
PART2 = "Annexe B Part 2: Procedures for the planning, provision and management of person-centred nursing care"
ANNEXE_A_DESC = (
    "The communication and relationship management skills that a newly registered "
    "nurse must be able to demonstrate to meet the proficiency outcomes outlined in "
    "the main body of this document."
)
ANNEXE_B_DESC = (
    "The nursing procedures that a newly registered nurse must be able to demonstrate "
    "to meet the proficiency outcomes outlined in the main body of this document."
)
EXPECTED = {"P1": 20, "P2": 12, "P3": 16, "P4": 18, "P5": 12, "P6": 12, "P7": 13,
            "Annexe A": 32, "Annexe B": 84}


def clean_join(lines):
    out = ""
    for ln in lines:
        ln = ln.rstrip()
        if not ln:
            continue
        if not out:
            out = ln
        elif out.endswith("-"):
            out = out + ln          # person-\ncentred -> person-centred
        else:
            out = out + " " + ln
    return re.sub(r"\s+", " ", out).strip()


def is_pagenum(s):
    return re.fullmatch(r"\d+", s.strip()) is not None


def main():
    print("Downloading:", SOURCE_URL)
    data = urllib.request.urlopen(SOURCE_URL, timeout=60).read()
    reader = PdfReader(io.BytesIO(data))
    pages = [p.extract_text() or "" for p in reader.pages]

    def lines_of(idxs):
        res = []
        for i in idxs:
            res.extend(pages[i].splitlines())
        return res

    items = []
    desc = {}

    # ---- Platforms: capture intro descriptions, then N.M statements ----
    plat_lines = lines_of(PLATFORM_PAGES)
    n = 0
    while n < len(plat_lines):
        m = re.fullmatch(r"Platform (\d)", plat_lines[n].strip())
        if m:
            p = int(m.group(1))
            if str(p) not in desc:  # only the first (header) occurrence, not the footer
                k, buf = n + 1, []
                while k < len(plat_lines) and plat_lines[k].strip() != "Outcomes":
                    buf.append(plat_lines[k]); k += 1
                joined = clean_join(buf)
                title = PLATFORM_TITLES[p]
                if joined.startswith(title):
                    joined = joined[len(title):].strip()
                desc[str(p)] = joined
        n += 1

    def collect_platform(lines):
        cur = None
        order = len(items)
        for raw in lines:
            s = raw.strip()
            if not s or is_pagenum(s):
                continue
            if re.fullmatch(r"Platform \d", s) or s == "Outcomes" \
               or s.startswith("At the point of registration"):
                if cur:
                    p = int(cur[0].split(".")[0])
                    items.append(dict(id="prof_" + cur[0], code=cur[0],
                                      statement=clean_join(cur[1]), platform=p,
                                      platformTitle=PLATFORM_TITLES[p], annexe="NONE",
                                      orderIndex=len(items)))
                    cur = None
                continue
            m = re.match(r"^(\d+\.\d+)\s+(.*)", s)
            if m:
                if cur:
                    p = int(cur[0].split(".")[0])
                    items.append(dict(id="prof_" + cur[0], code=cur[0],
                                      statement=clean_join(cur[1]), platform=p,
                                      platformTitle=PLATFORM_TITLES[p], annexe="NONE",
                                      orderIndex=len(items)))
                cur = [m.group(1), [m.group(2)]]
            elif cur is not None:
                cur[1].append(s)
        if cur:
            p = int(cur[0].split(".")[0])
            items.append(dict(id="prof_" + cur[0], code=cur[0],
                              statement=clean_join(cur[1]), platform=p,
                              platformTitle=PLATFORM_TITLES[p], annexe="NONE",
                              orderIndex=len(items)))

    collect_platform(plat_lines)

    # ---- Annexes: X.Y items, fold deeper bullets verbatim ----
    def collect_annexe(lines, prefix, annexe, title_for):
        cur = None

        def flush():
            nonlocal cur
            if cur:
                items.append(dict(id="prof_" + prefix + cur[0], code=prefix + cur[0],
                                  statement=clean_join(cur[1]), platform=0,
                                  platformTitle=title_for(cur[0]), annexe=annexe,
                                  orderIndex=len(items)))
                cur = None

        for raw in lines:
            s = raw.strip()
            if not s or is_pagenum(s):
                continue
            if re.fullmatch(r"Annexe [AB]", s) or s.startswith("At the point of registration") \
               or s.startswith("Part 1:") or s.startswith("Part 2:"):
                flush(); continue
            m_deep = re.match(r"^(\d+\.\d+\.\d+(?:\.\d+)?)\s+(.*)", s)
            m_xy = re.match(r"^(\d+\.\d+)\s+(.*)", s)
            m_sec = re.match(r"^(\d+)\.\s+(.*)", s)
            if m_deep:
                if cur is not None:
                    cur[1].append(m_deep.group(1) + " " + m_deep.group(2))
            elif m_xy:
                flush(); cur = [m_xy.group(1), [m_xy.group(2)]]
            elif m_sec:
                flush()
            elif cur is not None:
                cur[1].append(s)
        flush()

    collect_annexe(lines_of(ANNEXE_A_PAGES), "A", "A", lambda xy: ANNEXE_A_TITLE)
    collect_annexe(lines_of(ANNEXE_B_PAGES), "B", "B",
                   lambda xy: PART1 if int(xy.split(".")[0]) <= 2 else PART2)

    # ---- Verify counts ----
    from collections import defaultdict
    groups = defaultdict(int)
    for it in items:
        key = f"P{it['platform']}" if it["annexe"] == "NONE" else f"Annexe {it['annexe']}"
        groups[key] += 1
    print("Counts:", dict(groups), "total", len(items))
    for k, v in EXPECTED.items():
        assert groups.get(k) == v, f"{k}: expected {v}, got {groups.get(k)} — document may have been re-paginated"

    # ---- Emit TS ----
    def js(x):
        return json.dumps(x, ensure_ascii=False)

    out = []
    out.append("// AUTO-GENERATED — do not edit by hand.")
    out.append("// Source: NMC 'Standards of proficiency for registered nurses' (2024 update).")
    out.append("// Regenerate via scripts/extract-proficiencies.py (authoring-time only).")
    out.append("// Granularity: individual proficiency statements. Platform items use codes")
    out.append("// like \"1.1\"; annexe items are prefixed \"A\"/\"B\". The few 3rd/4th-level")
    out.append("// sub-bullets in Annexe A s.4 and Annexe B s.1 are folded into their parent's")
    out.append(f"// statement text, verbatim. {len(items)} statements total.")
    out.append('import type { Proficiency } from "../../domain/types";')
    out.append("")
    out.append("/** Provenance for the seeded proficiency master list — surfaced in the UI. */")
    out.append("export interface ProficiencySource {")
    out.append("  title: string;")
    out.append("  author: string;")
    out.append("  edition: string;")
    out.append("  url: string;")
    out.append("  retrievedOn: string;")
    out.append("}")
    out.append("")
    out.append("export const PROFICIENCY_SOURCE: ProficiencySource = {")
    out.append(f"  title: {js('Standards of proficiency for registered nurses')},")
    out.append(f"  author: {js('Nursing and Midwifery Council (NMC)')},")
    out.append(f"  edition: {js('2024 update')},")
    out.append(f"  url: {js(SOURCE_URL)},")
    out.append(f"  retrievedOn: {js(RETRIEVED_ON)},")
    out.append("};")
    out.append("")
    out.append("/** Short framing text per platform / annexe (official intro), for headers. */")
    out.append("export const PLATFORM_DESCRIPTIONS: Record<string, string> = {")
    for p in range(1, 8):
        out.append(f"  {js(str(p))}: {js(desc[str(p)])},")
    out.append(f"  {js('A')}: {js(ANNEXE_A_DESC)},")
    out.append(f"  {js('B')}: {js(ANNEXE_B_DESC)},")
    out.append("};")
    out.append("")
    out.append("export const seedProficiencies: Proficiency[] = [")
    for it in items:
        out.append("  {")
        out.append(f"    id: {js(it['id'])},")
        out.append(f"    code: {js(it['code'])},")
        out.append(f"    platform: {it['platform']},")
        out.append(f"    platformTitle: {js(it['platformTitle'])},")
        out.append(f"    annexe: {js(it['annexe'])},")
        out.append(f"    orderIndex: {it['orderIndex']},")
        out.append(f"    statement: {js(it['statement'])},")
        out.append("  },")
    out.append("];")
    out.append("")

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
