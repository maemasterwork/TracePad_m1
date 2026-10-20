#!/usr/bin/env python3
"""Parse a lesson markdown file into structured JSON.

Every block keeps its exact source line range and raw text, so tools/content/verify.py can prove that no source
line was lost or altered. The markdown itself is never edited: it is the source of truth.

Usage: python3 -I tools/content/extract.py <lesson-dir> <out.json>
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
from pathlib import Path

FENCE = re.compile(r"^(\s*)(```+|~~~+)\s*([A-Za-z0-9_+-]*)\s*(.*)$")
HR = re.compile(r"^\s{0,3}([-*_])(\s*\1){2,}\s*$")
ATX = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
CHECK_ITEM = re.compile(r"^\[( |x|X)\]\s+(.*)$")
TABLE_SEP = re.compile(r"^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$")
CHAPTER = re.compile(r"^(\d+)\.\s+(.+)$")
NUMBERED = re.compile(r"^(\d+(?:\.\d+)*)\s+(.+)$")


def slugify(text: str) -> str:
    """GitHub-style heading slug (matches the anchors used in the lesson's own table of contents)."""
    text = re.sub(r"[`*_]", "", text).strip().lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    return re.sub(r"\s+", "-", text)


def split_row(line: str) -> list[str]:
    s = line.strip()
    if s.startswith("|"):
        s = s[1:]
    if s.endswith("|") and not s.endswith("\\|"):
        s = s[:-1]
    cells, cur, i = [], "", 0
    in_code = False
    while i < len(s):
        ch = s[i]
        if ch == "`":
            in_code = not in_code
        if ch == "\\" and i + 1 < len(s) and s[i + 1] == "|":
            cur += "|"
            i += 2
            continue
        if ch == "|" and not in_code:
            cells.append(cur.strip())
            cur = ""
        else:
            cur += ch
        i += 1
    cells.append(cur.strip())
    return cells



def parse_list_items(lines: list[str], i: int, j: int, base_indent: int) -> list[dict]:
    """Split list lines[i..j] into top-level items. Each item is a list of parts: markdown text or nested code."""
    segs: list[tuple[int, int]] = []
    for k in range(i, j + 1):
        mi = LIST_ITEM.match(lines[k])
        if mi and len(mi.group(1)) == base_indent:
            if segs:
                segs[-1] = (segs[-1][0], k - 1)
            segs.append((k, j))
    items = []
    for a, b in segs:
        parts: list[dict] = []
        text_lines: list[str] = []
        k = a
        first = True
        while k <= b:
            ln = lines[k]
            fm = FENCE.match(ln) if not first else None
            if fm:
                fchar, flen = fm.group(2)[0], len(fm.group(2))
                e = k + 1
                while e <= b:
                    mm = FENCE.match(lines[e])
                    if mm and mm.group(2)[0] == fchar and len(mm.group(2)) >= flen and not mm.group(3) and not mm.group(4):
                        break
                    e += 1
                if e > b:
                    raise ValueError(f"unclosed code fence in list item at line {k + 1}")
                if text_lines:
                    parts.append({"type": "text", "md": "\n".join(text_lines).strip("\n")})
                    text_lines = []
                ind = len(fm.group(1))
                code = "\n".join(l[ind:] if l[:ind].strip() == "" else l for l in lines[k + 1 : e])
                parts.append({"type": "code", "lang": (fm.group(3) or "").lower(), "info": fm.group(4).strip(),
                              "code": code, "start": k + 1, "end": e + 1})
                k = e + 1
                continue
            if first:
                mi = LIST_ITEM.match(ln)
                text_lines.append(mi.group(3))
                first = False
            else:
                text_lines.append(ln.strip() if ln.strip() else "")
            k += 1
        if text_lines:
            parts.append({"type": "text", "md": "\n".join(text_lines).strip("\n")})
        items.append({"parts": parts})
    return items


def parse_blocks(lines: list[str], lo: int, hi: int) -> list[dict]:
    """Parse lines[lo:hi] (0-based, hi exclusive) into blocks. Heading lines must already be excluded."""
    blocks: list[dict] = []
    i = lo

    def add(kind: str, start: int, end: int, **extra):
        raw = "\n".join(lines[start : end + 1])
        blocks.append({"type": kind, "start": start + 1, "end": end + 1, "raw": raw, **extra})

    def starts_block(idx: int) -> bool:
        ln = lines[idx]
        return bool(
            FENCE.match(ln)
            or HR.match(ln)
            or ln.lstrip().startswith(">")
            or ln.lstrip().startswith("|")
            or LIST_ITEM.match(ln)
        )

    while i < hi:
        ln = lines[i]
        if not ln.strip():
            i += 1
            continue
        m = FENCE.match(ln)
        if m:
            fence_char = m.group(2)[0]
            fence_len = len(m.group(2))
            j = i + 1
            while j < hi:
                mm = FENCE.match(lines[j])
                if mm and mm.group(2)[0] == fence_char and len(mm.group(2)) >= fence_len and not mm.group(3) and not mm.group(4):
                    break
                j += 1
            if j >= hi:
                raise ValueError(f"unclosed code fence opened at line {i + 1}")
            indent = len(m.group(1))
            code_lines = [l[indent:] if l[:indent].strip() == "" else l for l in lines[i + 1 : j]]
            add("code", i, j, lang=(m.group(3) or "").lower(), info=m.group(4).strip(), code="\n".join(code_lines))
            i = j + 1
            continue
        if HR.match(ln):
            add("hr", i, i)
            i += 1
            continue
        if ln.lstrip().startswith(">"):
            j = i
            while j + 1 < hi and lines[j + 1].lstrip().startswith(">"):
                j += 1
            add("quote", i, j)
            i = j + 1
            continue
        if ln.lstrip().startswith("|") and i + 1 < hi and TABLE_SEP.match(lines[i + 1]):
            j = i + 1
            while j + 1 < hi and lines[j + 1].lstrip().startswith("|"):
                j += 1
            header = split_row(lines[i])
            sep = split_row(lines[i + 1])
            align = [
                "center" if c.startswith(":") and c.endswith(":") else "right" if c.endswith(":") else "left"
                for c in sep
            ]
            rows = [split_row(l) for l in lines[i + 2 : j + 1]]
            add("table", i, j, header=header, align=align, rows=rows)
            i = j + 1
            continue
        if LIST_ITEM.match(ln):
            first = LIST_ITEM.match(ln)
            ordered = first.group(2)[0].isdigit()
            j = i
            while j + 1 < hi:
                nxt = lines[j + 1]
                if not nxt.strip():
                    # a blank line continues the list only when an item or an indented line follows
                    k = j + 2
                    while k < hi and not lines[k].strip():
                        k += 1
                    if k < hi and (LIST_ITEM.match(lines[k]) or lines[k].startswith("  ")) and not FENCE.match(lines[k]):
                        j = k - 1
                        continue
                    break
                if FENCE.match(nxt) and not nxt.startswith(" "):
                    break
                if HR.match(nxt) or nxt.lstrip().startswith(("|", ">")) and not nxt.startswith(" "):
                    break
                j += 1
            items = parse_list_items(lines, i, j, len(first.group(1)))
            first_texts = [it["parts"][0]["md"] if it["parts"] and it["parts"][0]["type"] == "text" else "" for it in items]
            checks = [CHECK_ITEM.match(t) for t in first_texts]
            if items and all(checks) and all(len(it["parts"]) == 1 for it in items):
                add(
                    "checklist",
                    i,
                    j,
                    items=[{"checked": c.group(1).lower() == "x", "text": c.group(2)} for c in checks],
                )
            else:
                add("list", i, j, ordered=ordered, items=items)
            i = j + 1
            continue
        # paragraph: runs until a blank line or the start of another block
        j = i
        while j + 1 < hi and lines[j + 1].strip() and not starts_block(j + 1):
            j += 1
        add("paragraph", i, j)
        i = j + 1
    return blocks


def scan_headings(lines: list[str]) -> list[tuple[int, int, str]]:
    """(line_index, level, text) for ATX headings outside code fences."""
    out, in_fence, fchar, flen = [], False, "", 0
    for idx, ln in enumerate(lines):
        m = FENCE.match(ln)
        if m:
            ch, n = m.group(2)[0], len(m.group(2))
            if not in_fence:
                in_fence, fchar, flen = True, ch, n
            elif ch == fchar and n >= flen and not m.group(3) and not m.group(4):
                in_fence = False
            continue
        if in_fence:
            continue
        h = ATX.match(ln)
        if h:
            out.append((idx, len(h.group(1)), h.group(2)))
    return out


def extract(text: str, lesson_id: str) -> dict:
    lines = text.split("\n")
    if lines and lines[-1] == "":
        lines = lines[:-1]
    heads = scan_headings(lines)
    if not heads or heads[0][1] != 1:
        raise ValueError("lesson must start with a level-1 heading")
    title = heads[0][2]

    # Chapter boundaries: '## N. Title'. Any other '##' before the first chapter belongs to the preamble.
    chapter_idx = [(i, CHAPTER.match(t)) for i, lvl, t in heads if lvl == 2 and CHAPTER.match(t)]
    first_chapter_line = chapter_idx[0][0] if chapter_idx else len(lines)

    def sections_for(lo: int, hi: int, chapter_no: int | None, heading_filter) -> tuple[list[dict], list[dict]]:
        """Split lines[lo:hi] by headings accepted by heading_filter. Returns (lead_blocks, sections)."""
        hs = [(i, lvl, t) for i, lvl, t in heads if lo <= i < hi and heading_filter(lvl)]
        lead_end = hs[0][0] if hs else hi
        lead = parse_blocks(lines, lo, lead_end)
        secs = []
        for n, (i, lvl, t) in enumerate(hs):
            end = hs[n + 1][0] if n + 1 < len(hs) else hi
            num = NUMBERED.match(t)
            if num:
                sid, stitle = num.group(1), num.group(2)
            else:
                short = re.split(r"\s+[\u2013\u2014-]\s+|\s*\(", t)[0]  # "Part C – Coding (10 points)" -> "Part C"
                sid, stitle = (f"{chapter_no}-{slugify(short)}" if chapter_no else slugify(short)), t
            secs.append({"id": sid, "title": stitle, "level": lvl, "heading": t, "line": i + 1,
                         "blocks": parse_blocks(lines, i + 1, end)})
        return lead, secs

    # Preamble: from line 2 (after the title) to the first chapter.
    pre_lead, pre_secs = sections_for(1, first_chapter_line, None, lambda lvl: lvl == 2)
    preamble = {"blocks": pre_lead, "sections": pre_secs}

    chapters = []
    for n, (i, m) in enumerate(chapter_idx):
        end = chapter_idx[n + 1][0] if n + 1 < len(chapter_idx) else len(lines)
        no = int(m.group(1))
        lead, secs = sections_for(i + 1, end, no, lambda lvl: lvl == 3)
        chapters.append({
            "n": no,
            "id": f"{no}-{slugify(m.group(2))}",
            "title": m.group(2),
            "line": i + 1,
            "heading": heads_text(heads, i),
            "blocks": lead,
            "sections": secs,
        })
    return {
        "id": lesson_id,
        "title": title,
        "title_line": heads[0][0] + 1,
        "line_count": len(lines),
        "source_sha256": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        "preamble": preamble,
        "chapters": chapters,
    }


def heads_text(heads, idx):
    for i, _lvl, t in heads:
        if i == idx:
            return t
    raise KeyError(idx)


def assign_code_ids(doc: dict) -> None:
    """Stable ids for code blocks: '<section id>#<n>' (n counts python-or-not code blocks in that section)."""
    def walk(section_id: str, blocks: list[dict]):
        n = 0
        for b in blocks:
            if b["type"] == "code":
                n += 1
                b["id"] = f"{section_id}#{n}"
            elif b["type"] == "list":
                for it in b["items"]:
                    for part in it["parts"]:
                        if part["type"] == "code":
                            n += 1
                            part["id"] = f"{section_id}#{n}"
    walk("pre", doc["preamble"]["blocks"])
    for s in doc["preamble"]["sections"]:
        walk(s["id"], s["blocks"])
    for ch in doc["chapters"]:
        walk(f"{ch['n']}.0", ch["blocks"])
        for s in ch["sections"]:
            walk(s["id"], s["blocks"])


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    lesson_dir, out = Path(argv[1]), Path(argv[2])
    md = (lesson_dir / "lesson.md").read_text(encoding="utf-8")
    doc = extract(md, lesson_dir.name)
    assign_code_ids(doc)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    n_blocks = sum(len(c["blocks"]) + sum(len(s["blocks"]) for s in c["sections"]) for c in doc["chapters"])
    print(f"extracted {lesson_dir.name}: {len(doc['chapters'])} chapters, {n_blocks} blocks -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
