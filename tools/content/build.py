#!/usr/bin/env python3
"""Content build: for every published lesson in content/course.yml run extract -> verify -> labs check, then write the
files the web app loads from apps/web/public/content/. Any failure stops the build with a non-zero exit.

Usage: python3 -I tools/content/build.py            (run from the repository root)
Then:  node tools/content/engine_check.mjs content/build/*.items.json   (differential test in the browser engine)
"""
import json
import subprocess
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).parent
BUILD = ROOT / "content" / "build"
PUBLIC = ROOT / "apps" / "web" / "public" / "content"


def sh(*args) -> None:
    r = subprocess.run([sys.executable, "-I", *map(str, args)], capture_output=True, text=True)
    sys.stdout.write(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        sys.exit(r.returncode)


def main() -> int:
    course = yaml.safe_load((ROOT / "content" / "course.yml").read_text(encoding="utf-8"))
    BUILD.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    manifest = {"course": course["course"], "lessons": []}
    concepts: dict[str, dict] = {}
    for les in course["lessons"]:
        entry = {k: les[k] for k in ("id", "number", "status", "title")}
        if les["status"] == "published":
            ldir = ROOT / "content" / "lessons" / les["id"]
            lj = BUILD / f"{les['id'][:2]}.json"
            sh(HERE / "extract.py", ldir, lj)
            sh(HERE / "verify.py", ldir, lj)
            sh(HERE / "check_labs.py", ldir, lj, BUILD)
            doc = json.loads(lj.read_text(encoding="utf-8"))
            labs = yaml.safe_load((ldir / "labs.yml").read_text(encoding="utf-8"))
            labs["chapters"] = {str(k): v for k, v in labs["chapters"].items()}
            out = PUBLIC / les["id"]
            out.mkdir(parents=True, exist_ok=True)
            blocks_meta = (yaml.safe_load((ldir / "blocks.yml").read_text(encoding="utf-8")) or {}).get("blocks", {}) if (ldir / "blocks.yml").exists() else {}
            doc["block_meta"] = blocks_meta
            (out / "lesson.json").write_text(json.dumps(doc, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            (out / "labs.json").write_text(json.dumps(labs, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
            for chno, ch in labs["chapters"].items():
                for kind in ("predictions", "quizzes"):
                    for it in ch.get(kind, []):
                        concepts.setdefault(it["tag"], {"tag": it["tag"], "lessons": set(), "items": 0})
                        concepts[it["tag"]]["lessons"].add(les["id"])
                        concepts[it["tag"]]["items"] += 1
            entry["chapters"] = [{"n": c["n"], "id": c["id"], "title": c["title"]} for c in doc["chapters"]]
            entry["path"] = f"content/{les['id']}"
        manifest["lessons"].append(entry)
    (PUBLIC / "course.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    cl = sorted(({**v, "lessons": sorted(v["lessons"])} for v in concepts.values()), key=lambda v: v["tag"])
    (PUBLIC / "concepts.json").write_text(json.dumps(cl, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"content build ok: {sum(1 for l in course['lessons'] if l['status']=='published')} published lesson(s), {len(cl)} concept tags -> {PUBLIC}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
