#!/usr/bin/env python3
"""Authoring-time tool: (re)generate src/data/bnf.ts from official NHSBSA BNF open
data.

Source: NHSBSA "BNF Code Information (current year)" on the NHSBSA Open Data Portal,
published under the Open Government Licence v3.0. We derive, from the classification
CSV:
  - generic names  = distinct BNF chemical substances
  - drug classes   = distinct BNF sections + paragraphs
  - body systems   = BNF chapters (drug chapters 01–15 only)

The committed artefact is the generated TS file — this script is NOT run at runtime
and is not a build step. Re-run it to refresh against a newer BNF release.

Side effects, monitoring and routes are NOT in this dataset (BNF monograph text is
proprietary), so they stay as curated controlled vocabularies, embedded below and
clearly marked in the output.

Usage:  python3 scripts/fetch-bnf.py
Requires: network access (no API key / login — NHSBSA CKAN open data).
"""
import csv
import io
import json
import os
import re
import urllib.request

CKAN = "https://opendata.nhsbsa.net/api/3/action/package_show?id=bnf-code-information-current-year"
DATASET_PAGE = "https://opendata.nhsbsa.net/dataset/bnf-code-information-current-year"
RETRIEVED_ON = "2026-06-24"
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(REPO_ROOT, "src", "data", "bnf.ts")

DRUG_CHAPTERS = {f"{i:02d}" for i in range(1, 16)}  # 01–15 = the therapeutic drug chapters

# Curated controlled vocabularies — no free BNF source for these (monograph content).
ADMIN_ROUTES = [
    "Oral", "IV", "IM", "Subcutaneous", "Topical", "Inhaled", "Nebulised", "Rectal",
    "Sublingual", "Buccal", "Intranasal", "Transdermal", "Ophthalmic",
]
SIDE_EFFECTS = [
    "Nausea", "Vomiting", "Diarrhoea", "Constipation", "Abdominal pain", "Indigestion",
    "Loss of appetite", "Dry mouth", "Headache", "Dizziness", "Drowsiness", "Fatigue",
    "Insomnia", "Confusion", "Tremor", "Blurred vision", "Tinnitus", "Rash", "Itching",
    "Photosensitivity", "Weight gain", "Weight loss", "Hypotension", "Hypertension",
    "Bradycardia", "Tachycardia", "Palpitations", "Dry cough", "Bronchospasm",
    "Bleeding", "Bruising", "Anaemia", "Hypoglycaemia", "Hyperglycaemia", "Hypokalaemia",
    "Hyperkalaemia", "Hyponatraemia", "Oedema", "Muscle pain", "Respiratory depression",
    "Angioedema", "Anaphylaxis", "QT prolongation", "Renal impairment", "Hepatotoxicity",
]
MONITORING = [
    "Blood pressure", "Heart rate", "Respiratory rate", "Oxygen saturation", "Temperature",
    "Blood glucose", "HbA1c", "Full blood count (FBC)", "Urea & electrolytes (U&Es)",
    "Liver function tests (LFTs)", "Renal function (eGFR)", "INR", "Therapeutic drug level",
    "Digoxin level", "Lithium level", "Gentamicin level", "Vancomycin level", "Potassium",
    "Sodium", "Thyroid function tests (TFTs)", "Weight", "Fluid balance", "Peak flow",
    "ECG", "Signs of bleeding", "Pain score", "Sedation level",
]


def latest_csv_resource():
    meta = json.load(urllib.request.urlopen(CKAN, timeout=60))
    csvs = [r for r in meta["result"]["resources"] if (r.get("format") or "").upper() == "CSV"]
    csvs.sort(key=lambda r: r.get("name", ""))  # names sort by YYYYMM
    return csvs[-1]


def noisy_chemical(name: str) -> bool:
    low = name.lower()
    if not low:
        return True
    if re.search(r"\bbnf \d", low):  # "Proprietary compound preparation BNF 0101010"
        return True
    if low.startswith(("other ", "sundry", "dummy", "various")):
        return True
    if "proprietary compound preparation" in low:
        return True
    return False


def main():
    res = latest_csv_resource()
    version = res["name"]
    print("Latest BNF release:", version)
    print("Downloading:", res["url"])
    raw = urllib.request.urlopen(res["url"], timeout=240).read().decode("utf-8")

    chemicals, classes, systems = set(), set(), set()
    rows = 0
    for row in csv.DictReader(io.StringIO(raw)):
        rows += 1
        if row["BNF_CHAPTER_CODE"] not in DRUG_CHAPTERS:
            continue
        if row["BNF_CHAPTER"].strip():
            systems.add(row["BNF_CHAPTER"].strip())
        if row["BNF_SECTION"].strip():
            classes.add(row["BNF_SECTION"].strip())
        if row["BNF_PARAGRAPH"].strip():
            classes.add(row["BNF_PARAGRAPH"].strip())
        chem = row["BNF_CHEMICAL_SUBSTANCE"].strip()
        if chem and not noisy_chemical(chem):
            chemicals.add(chem)

    generic_names = sorted(chemicals)
    drug_classes = sorted(classes)
    body_systems = sorted(systems)
    print(f"rows={rows}  generic_names={len(generic_names)}  "
          f"drug_classes={len(drug_classes)}  body_systems={len(body_systems)}")
    assert len(generic_names) > 1000, "too few generic names — source may have changed"
    assert len(drug_classes) > 100, "too few drug classes — source may have changed"
    assert len(body_systems) == 15, f"expected 15 drug chapters, got {len(body_systems)}"

    def arr(name, items, comment):
        # `readonly string[]` (not `as const`) — these lists are large; a literal
        # tuple type would needlessly bloat/slow the compiler. Consumers only need
        # a string list.
        lines = [f"/** {comment} */", f"export const {name}: readonly string[] = ["]
        lines += [f"  {json.dumps(x, ensure_ascii=False)}," for x in items]
        lines.append("];")
        return "\n".join(lines)

    out = []
    out.append("// AUTO-GENERATED — do not edit by hand.")
    out.append("// Real UK medicines vocabulary from NHSBSA BNF open data (Open Government")
    out.append("// Licence v3.0): generic names = BNF chemical substances; drug classes = BNF")
    out.append("// sections + paragraphs; body systems = BNF chapters (drug chapters 01–15).")
    out.append("// Regenerate via scripts/fetch-bnf.py (downloads the latest BNF Code Information).")
    out.append("//")
    out.append("// Side effects, monitoring and routes are NOT in that dataset (BNF monograph")
    out.append("// text is proprietary) — they remain curated controlled vocabularies below.")
    out.append("// Every form field still accepts free text; these only power suggestions.")
    out.append("")
    out.append("export interface BnfSource {")
    out.append("  title: string;")
    out.append("  publisher: string;")
    out.append("  licence: string;")
    out.append("  url: string;")
    out.append("  version: string;")
    out.append("  retrievedOn: string;")
    out.append("}")
    out.append("")
    out.append("/** Provenance for the real (names / classes / systems) value sets. */")
    out.append("export const BNF_SOURCE: BnfSource = {")
    out.append(f"  title: {json.dumps('BNF Code Information (current year)')},")
    out.append(f"  publisher: {json.dumps('NHS Business Services Authority (NHSBSA)')},")
    out.append(f"  licence: {json.dumps('Open Government Licence v3.0')},")
    out.append(f"  url: {json.dumps(DATASET_PAGE)},")
    out.append(f"  version: {json.dumps(version)},")
    out.append(f"  retrievedOn: {json.dumps(RETRIEVED_ON)},")
    out.append("};")
    out.append("")
    out.append(arr("GENERIC_NAMES", generic_names, "Generic names — BNF chemical substances (NHSBSA, real)."))
    out.append("")
    out.append(arr("DRUG_CLASSES", drug_classes, "Drug classes — BNF sections + paragraphs (NHSBSA, real)."))
    out.append("")
    out.append(arr("BODY_SYSTEMS", body_systems, "Body systems — BNF chapters 01–15 (NHSBSA, real)."))
    out.append("")
    out.append(arr("ADMIN_ROUTES", ADMIN_ROUTES, "Administration routes — curated controlled vocabulary."))
    out.append("")
    out.append(arr("SIDE_EFFECTS", SIDE_EFFECTS, "Common side effects — curated (no free BNF source)."))
    out.append("")
    out.append(arr("MONITORING", MONITORING, "Common monitoring parameters — curated (no free BNF source)."))
    out.append("")

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(out))
    print("Wrote", OUT)


if __name__ == "__main__":
    main()
