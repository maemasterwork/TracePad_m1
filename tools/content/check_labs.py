#!/usr/bin/env python3
"""Validate a lesson's labs and blocks against real CPython, and write the reference items for the engine check.

Checks
  - labs.yml matches labs.schema.json; ids unique; quiz answers in range; HTML limited to a safe inline set;
  - every prediction's stored answer equals what CPython prints (whitespace-collapsed, or line-trimmed when exact);
  - every exercise solution passes ALL its tests, and the starter fails at least one;
  - every runnable code block in lesson.md runs in CPython (blocks.yml says which need earlier blocks, which are
    non-deterministic, which are skipped, and what stdin to feed).
Output: <out-dir>/<lesson>.items.json  (every snippet to run, with CPython's stdout) used by engine_check.mjs.

Usage: python3 -I tools/content/check_labs.py <lesson-dir> <lesson.json> <out-dir>
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from html.parser import HTMLParser
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

HERE = Path(__file__).parent
ALLOWED_TAGS = {"code", "em", "strong", "br", "b", "i", "sub", "sup"}
TIMEOUT = 15
PREFIX_MARK = "\u0001TRACEPAD-MARK\u0001"


def collapse(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip()


def norm(s: str) -> str:
    return "\n".join(l.rstrip() for l in s.replace("\r", "").split("\n")).rstrip()


class _Check(HTMLParser):
    def __init__(self):
        super().__init__()
        self.bad: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag not in ALLOWED_TAGS:
            self.bad.append(f"<{tag}>")
        elif attrs:
            self.bad.append(f"<{tag}> with attributes")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)


def html_problems(text: str) -> list[str]:
    p = _Check()
    p.feed(text)
    return p.bad


def run_cpython(code: str, stdin: str = "", prelude: str = "") -> dict:
    """Run code in a fresh interpreter in a fresh temp dir. The prelude runs first in the same namespace, silenced."""
    if prelude:
        program = (
            "import contextlib, io\n_g = {'__name__': '__main__'}\n"
            f"with contextlib.redirect_stdout(io.StringIO()):\n    exec(compile({prelude!r}, '<prelude>', 'exec'), _g)\n"
            f"exec(compile({code!r}, '<user>', 'exec'), _g)\n"
        )
    else:
        program = code
    with tempfile.TemporaryDirectory() as t:
        try:
            r = subprocess.run([sys.executable, "-I", "-c", program], cwd=t, input=stdin, capture_output=True,
                               text=True, timeout=TIMEOUT)
            return {"ok": r.returncode == 0, "stdout": r.stdout, "stderr_last": (r.stderr.strip().split("\n") or [""])[-1]}
        except subprocess.TimeoutExpired:
            return {"ok": False, "stdout": "", "stderr_last": "TIMEOUT"}


def apply_test(ex: dict, user_code: str, tc: dict) -> str:
    c = user_code
    if tc.get("set") is not None:
        flags = re.M if "m" in ex.get("param", {}).get("flags", "") else 0
        if "i" in ex.get("param", {}).get("flags", ""):
            flags |= re.I
        pat = re.compile(ex["param"]["pattern"], flags)
        c = pat.sub(lambda _m: tc["set"], c, count=1)
    if tc.get("post"):
        c += f"\nprint({PREFIX_MARK!r})\n" + tc["post"] + "\n"
    return c


def after_mark(out: str, tc: dict) -> str:
    if not tc.get("post"):
        return out
    i = out.rfind(PREFIX_MARK + "\n")
    return out[i + len(PREFIX_MARK) + 1:] if i >= 0 else out


def walk_texts(obj, path=""):
    """Yield (path, text) for every learner-visible text object {en, fa}."""
    if isinstance(obj, dict):
        if "en" in obj and isinstance(obj["en"], str):
            yield path, obj
            return
        for k, v in obj.items():
            yield from walk_texts(v, f"{path}/{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_texts(v, f"{path}/{i}")


def collect_blocks(doc: dict) -> dict[str, dict]:
    blocks: dict[str, dict] = {}

    def add(b):
        blocks[b["id"]] = b

    def walk(bs):
        for b in bs:
            if b["type"] == "code":
                add(b)
            elif b["type"] == "list":
                for it in b["items"]:
                    for p in it["parts"]:
                        if p["type"] == "code":
                            add(p)

    walk(doc["preamble"]["blocks"])
    for s in doc["preamble"]["sections"]:
        walk(s["blocks"])
    for c in doc["chapters"]:
        walk(c["blocks"])
        for s in c["sections"]:
            walk(s["blocks"])
    return blocks


def main(argv):
    if len(argv) != 4:
        print(__doc__)
        return 2
    lesson_dir, lesson_json, out_dir = Path(argv[1]), Path(argv[2]), Path(argv[3])
    errors: list[str] = []
    doc = json.loads(lesson_json.read_text(encoding="utf-8"))
    labs = yaml.safe_load((lesson_dir / "labs.yml").read_text(encoding="utf-8"))
    labs["chapters"] = {str(k): v for k, v in (labs.get("chapters") or {}).items()}  # YAML reads 1: as an int key
    schema = json.loads((HERE / "labs.schema.json").read_text(encoding="utf-8"))
    for e in sorted(Draft202012Validator(schema).iter_errors(labs), key=lambda e: list(e.path)):
        errors.append("schema: /" + "/".join(map(str, e.path)) + ": " + e.message[:160])
    if errors:
        return report(errors)

    chapter_nos = {c["n"] for c in doc["chapters"]}
    items: list[dict] = []
    missing_fa = 0
    total_text = 0

    for ch, c in labs["chapters"].items():
        ch = int(ch)
        if ch not in chapter_nos:
            errors.append(f"chapter {ch}: no such chapter in lesson.md")
        for kind in ("predictions", "quizzes", "exercises"):
            ids = [x["id"] for x in c.get(kind, [])]
            if len(ids) != len(set(ids)):
                errors.append(f"chapter {ch} {kind}: duplicate ids")
        for path, t in walk_texts(c, f"/{ch}"):
            total_text += 1
            if "fa" not in t:
                missing_fa += 1
            for lang in ("en", "fa"):
                if lang in t:
                    for bad in html_problems(t[lang]):
                        errors.append(f"{path} ({lang}): disallowed HTML {bad}")
        for q in c.get("quizzes", []):
            if q["correct"] >= len(q["options"]):
                errors.append(f"chapter {ch} quiz {q['id']}: correct index out of range")
        # predictions
        for p in c.get("predictions", []):
            r = run_cpython(p["code"])
            iid = f"pred:{ch}:{p['id']}"
            if not r["ok"]:
                errors.append(f"{iid}: code fails in CPython: {r['stderr_last']}")
                continue
            same = (norm(r["stdout"]) == norm(p["answer"])) if p.get("exact") else (collapse(r["stdout"]) == collapse(p["answer"]))
            if not same and not p.get("nondeterministic"):
                errors.append(f"{iid}: stored answer {p['answer']!r} != CPython {r['stdout']!r}")
            items.append({"id": iid, "kind": "prediction", "code": p["code"], "stdin": "", "prelude": "",
                          "nondeterministic": bool(p.get("nondeterministic")), "cpython": r})
        # exercises
        for e in c.get("exercises", []):
            base = f"ex:{ch}:{e['id']}"
            if "param" in e:
                try:
                    re.compile(e["param"]["pattern"])
                except re.error as ex_:
                    errors.append(f"{base}: bad param pattern: {ex_}")
                    continue
            elif any("set" in t for t in e["tests"]):
                errors.append(f"{base}: tests use 'set' but the exercise has no param pattern")
                continue
            sol_pass = True
            for i, tc in enumerate(e["tests"]):
                code = apply_test(e, e["solution"], tc)
                if "param" in e and tc.get("set") is not None and code == e["solution"] and tc["set"] not in e["solution"]:
                    errors.append(f"{base} test {i}: param pattern did not match the solution")
                r = run_cpython(code)
                got = norm(after_mark(r["stdout"], tc))
                if not r["ok"] or got != norm(tc["out"]):
                    sol_pass = False
                    errors.append(f"{base} test {i}: solution does not pass (want {tc['out']!r}, got {got!r}; {r['stderr_last']})")
                items.append({"id": f"{base}:solution:{i}", "kind": "exercise-solution", "code": code, "stdin": "",
                              "prelude": "", "nondeterministic": False, "cpython": r, "marker": PREFIX_MARK if tc.get("post") else ""})
            starter_fails = False
            for i, tc in enumerate(e["tests"]):
                code = apply_test(e, e["starter"], tc)
                r = run_cpython(code)
                got = norm(after_mark(r["stdout"], tc))
                if not r["ok"] or got != norm(tc["out"]):
                    starter_fails = True
                items.append({"id": f"{base}:starter:{i}", "kind": "exercise-starter", "code": code, "stdin": "",
                              "prelude": "", "nondeterministic": False, "cpython": r, "marker": PREFIX_MARK if tc.get("post") else ""})
            if not starter_fails:
                errors.append(f"{base}: the starter already passes every test")

    # code blocks in the lesson
    sidecar = {}
    bp = lesson_dir / "blocks.yml"
    if bp.exists():
        sidecar = (yaml.safe_load(bp.read_text(encoding="utf-8")) or {}).get("blocks", {}) or {}
    blocks = collect_blocks(doc)
    for bid in sidecar:
        if bid not in blocks:
            errors.append(f"blocks.yml: unknown block id {bid}")
    n_blocks = n_skipped = 0
    for bid, b in blocks.items():
        meta = sidecar.get(bid, {})
        if b["lang"] != "python":
            continue
        if meta.get("skip"):
            n_skipped += 1
            continue
        prelude = "\n".join(blocks[a]["code"] for a in meta.get("after", []) if a in blocks)
        for a in meta.get("after", []):
            if a not in blocks:
                errors.append(f"blocks.yml: {bid} depends on unknown block {a}")
        r = run_cpython(b["code"], stdin=meta.get("stdin", ""), prelude=prelude)
        if not r["ok"]:
            errors.append(f"block {bid}: fails in CPython: {r['stderr_last']}")
        if not meta.get("nondeterministic"):
            r2 = run_cpython(b["code"], stdin=meta.get("stdin", ""), prelude=prelude)
            if r2["stdout"] != r["stdout"]:
                errors.append(f"block {bid}: output differs between two runs; mark it nondeterministic in blocks.yml")
        n_blocks += 1
        items.append({"id": f"block:{bid}", "kind": "block", "code": b["code"], "stdin": meta.get("stdin", ""),
                      "prelude": prelude, "nondeterministic": bool(meta.get("nondeterministic")), "cpython": r})

    if errors:
        return report(errors)
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"{lesson_dir.name}.items.json").write_text(
        json.dumps({"python": sys.version.split()[0], "items": items}, ensure_ascii=False, indent=1), encoding="utf-8")
    n_pred = sum(1 for i in items if i["kind"] == "prediction")
    n_ex = len({i["id"].rsplit(":", 2)[0] for i in items if i["kind"].startswith("exercise")})
    print(f"labs ok {lesson_dir.name}: {n_pred} predictions, {sum(len(c.get('quizzes', [])) for c in labs['chapters'].values())} quizzes, "
          f"{n_ex} exercises (solutions pass all tests, starters fail), {n_blocks} runnable blocks ({n_skipped} skipped); "
          f"{missing_fa}/{total_text} texts lack a Persian translation; CPython {sys.version.split()[0]}")
    return 0


def report(errors):
    print(f"LABS CHECK FAILED: {len(errors)} problem(s)")
    for e in errors[:60]:
        print("  -", e)
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
