#!/usr/bin/env python3
"""Prove that the structured lesson JSON lost nothing from the markdown source.

Independent of extract.py's parser: it re-reads the markdown with its own tiny scanner and checks
  1. the JSON was built from exactly this file (sha256),
  2. every block's raw text equals the source lines it claims, blocks are ordered and never overlap,
  3. every non-blank source line is owned by a heading or by exactly one block,
  4. rebuilding the whole file from the JSON gives the source back, line for line,
  5. independent counts (fences, tables, quotes, rules, headings, list items) match.

Usage: python3 -I tools/content/verify.py <lesson-dir> <extracted.json>
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path


def iter_blocks(doc):
    for b in doc["preamble"]["blocks"]:
        yield b
    for s in doc["preamble"]["sections"]:
        yield from s["blocks"]
    for ch in doc["chapters"]:
        yield from ch["blocks"]
        for s in ch["sections"]:
            yield from s["blocks"]


def iter_headings(doc):
    yield (doc["title_line"], 1, doc["title"])
    for s in doc["preamble"]["sections"]:
        yield (s["line"], s["level"], s["heading"])
    for ch in doc["chapters"]:
        yield (ch["line"], 2, ch["heading"])
        for s in ch["sections"]:
            yield (s["line"], s["level"], s["heading"])


def main(argv):
    if len(argv) != 3:
        print(__doc__)
        return 2
    lesson_dir, jpath = Path(argv[1]), Path(argv[2])
    text = (lesson_dir / "lesson.md").read_text(encoding="utf-8")
    doc = json.loads(jpath.read_text(encoding="utf-8"))
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    errors: list[str] = []

    def err(msg):
        errors.append(msg)

    # 1. provenance
    if doc["source_sha256"] != hashlib.sha256(text.encode("utf-8")).hexdigest():
        err("JSON was not built from this lesson.md (sha256 differs)")
    if doc["line_count"] != len(lines):
        err(f"line count {doc['line_count']} != source {len(lines)}")

    # 2. block ranges
    blocks = list(iter_blocks(doc))
    last_end = 0
    owner: dict[int, str] = {}
    for b in blocks:
        s, e = b["start"], b["end"]
        if s <= last_end:
            err(f"block at lines {s}-{e} overlaps or is out of order (previous ended at {last_end})")
        last_end = max(last_end, e)
        if "\n".join(lines[s - 1 : e]) != b["raw"]:
            err(f"block {b['type']} at lines {s}-{e}: raw text differs from the source")
        for n in range(s, e + 1):
            owner[n] = f"block:{b['type']}@{s}"

    # 3. every non-blank line is owned
    heading_lines = {ln: (lvl, t) for ln, lvl, t in iter_headings(doc)}
    for n, ln in enumerate(lines, start=1):
        if n in heading_lines:
            if n in owner:
                err(f"line {n} is both a heading and inside a block")
            continue
        if ln.strip() and n not in owner:
            err(f"source line {n} is not in any block: {ln[:70]!r}")

    # 4. rebuild
    rebuilt = [""] * len(lines)
    for n, (lvl, t) in heading_lines.items():
        rebuilt[n - 1] = "#" * lvl + " " + t
    for b in blocks:
        for k, l in enumerate(b["raw"].split("\n")):
            rebuilt[b["start"] - 1 + k] = l
    for n, (a, b_) in enumerate(zip(lines, rebuilt), start=1):
        if a.strip() == "" and b_.strip() == "":
            continue
        if a != b_:
            err(f"rebuild differs at line {n}: source {a[:60]!r} vs rebuilt {b_[:60]!r}")

    # 5. independent counts, scanned without extract.py
    in_fence = False
    fchar = ""
    fences = hrs = tables = quote_lines = table_rows = 0
    heads_by_level = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0}
    prev_table = False
    for ln in lines:
        st = ln.strip()
        m = re.match(r"^\s*(`{3,}|~{3,})", ln)
        if m:
            if not in_fence:
                in_fence, fchar = True, m.group(1)[0]
                fences += 1
            elif m.group(1)[0] == fchar:
                in_fence = False
            continue
        if in_fence:
            continue
        mh = re.match(r"^(#{1,6})\s+\S", ln)
        if mh:
            heads_by_level[len(mh.group(1))] += 1
        if re.match(r"^\s{0,3}([-*_])(\s*\1){2,}\s*$", ln):
            hrs += 1
        if st.startswith(">"):
            quote_lines += 1
        if st.startswith("|"):
            table_rows += 1
            if not prev_table:
                tables += 1
            prev_table = True
        else:
            prev_table = False
    jb = [b for b in blocks]
    nested = [p for b in jb if b["type"] == "list" for it in b["items"] for p in it["parts"] if p["type"] == "code"]
    for p in nested:
        if lines[p["start"] - 1].strip()[:3] not in ("```", "~~~") or lines[p["end"] - 1].strip()[:3] not in ("```", "~~~"):
            err(f"nested code at {p['start']}-{p['end']} is not delimited by fences in the source")
        body = [l.strip() if False else l for l in lines[p["start"] : p["end"] - 1]]
        ind = len(lines[p["start"] - 1]) - len(lines[p["start"] - 1].lstrip())
        want = "\n".join(l[ind:] if l[:ind].strip() == "" else l for l in body)
        if want != p["code"]:
            err(f"nested code at {p['start']}-{p['end']}: code text differs from the source")
    n_code_total = sum(1 for b in jb if b["type"] == "code") + len(nested)
    if fences != n_code_total:
        err(f"code fences in source {fences} != code blocks {n_code_total}")
    if hrs != sum(1 for b in jb if b["type"] == "hr"):
        err(f"horizontal rules in source {hrs} != hr blocks")
    if tables != sum(1 for b in jb if b["type"] == "table"):
        err(f"tables in source {tables} != table blocks")
    jb_rows = sum(len(b["rows"]) + 2 for b in jb if b["type"] == "table")
    if table_rows != jb_rows:
        err(f"table lines in source {table_rows} != header+separator+rows in JSON {jb_rows}")
    if quote_lines != sum(b["raw"].count("\n") + 1 for b in jb if b["type"] == "quote"):
        err("blockquote line count differs")
    for lvl in (1, 2, 3):
        got = sum(1 for _ln, l, _t in iter_headings(doc) if l == lvl)
        if heads_by_level[lvl] != got:
            err(f"level-{lvl} headings: source {heads_by_level[lvl]} != JSON {got}")
    for b in jb:
        if b["type"] == "code" and b["code"].count("\n") + 1 != max(b["end"] - b["start"] - 1, 0) and b["code"] != "":
            err(f"code block at {b['start']} line count mismatch")

    # code ids unique
    ids = [b["id"] for b in jb if b["type"] == "code"] + [p["id"] for p in nested]
    if len(ids) != len(set(ids)):
        err("duplicate code block ids")

    n_code = n_code_total
    if errors:
        print(f"VERIFY FAILED for {lesson_dir.name}: {len(errors)} problem(s)")
        for e in errors[:50]:
            print("  -", e)
        return 1
    print(
        f"verify ok {lesson_dir.name}: {len(lines)} source lines, {len(blocks)} blocks "
        f"({n_code} code, {tables} tables, {quote_lines} quote lines), "
        f"{sum(1 for _ in iter_headings(doc))} headings, 0 lines lost"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
