"""Tests for the content pipeline: the verifier must pass on good output and fail on every kind of loss."""
import copy, json, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LESSON = ROOT / "content/lessons/01-objects-and-data-structures"
sys.path.insert(0, str(Path(__file__).parent))
import extract  # noqa: E402


def run_verify(lesson_dir, doc):
    with tempfile.TemporaryDirectory() as t:
        p = Path(t) / "x.json"
        p.write_text(json.dumps(doc), encoding="utf-8")
        r = subprocess.run([sys.executable, "-I", str(Path(__file__).parent / "verify.py"), str(lesson_dir), str(p)],
                           capture_output=True, text=True)
        return r.returncode, r.stdout


def good():
    text = (LESSON / "lesson.md").read_text(encoding="utf-8")
    doc = extract.extract(text, LESSON.name)
    extract.assign_code_ids(doc)
    return doc


class Pipeline(unittest.TestCase):
    def test_good(self):
        rc, out = run_verify(LESSON, good())
        self.assertEqual(rc, 0, out)
        self.assertIn("0 lines lost", out)

    def test_dropped_block_detected(self):
        d = good()
        del d["chapters"][2]["sections"][1]["blocks"][0]
        rc, out = run_verify(LESSON, d)
        self.assertEqual(rc, 1)
        self.assertIn("not in any block", out)

    def test_altered_text_detected(self):
        d = good()
        b = d["chapters"][0]["sections"][1]["blocks"][0]
        b["raw"] = b["raw"] + " extra"
        rc, out = run_verify(LESSON, d)
        self.assertEqual(rc, 1)

    def test_dropped_chapter_detected(self):
        d = good()
        d["chapters"].pop(4)
        rc, _ = run_verify(LESSON, d)
        self.assertEqual(rc, 1)

    def test_edited_source_detected(self):
        d = good()
        with tempfile.TemporaryDirectory() as t:
            (Path(t) / "lesson.md").write_text((LESSON / "lesson.md").read_text(encoding="utf-8") + "\nNew line\n", encoding="utf-8")
            rc, out = run_verify(Path(t), d)
        self.assertEqual(rc, 1)
        self.assertIn("sha256", out)

    def test_nested_code_is_runnable_part(self):
        d = good()
        ids = [p["id"] for s in d["chapters"][1]["sections"] if s["id"] == "2.9"
               for b in s["blocks"] if b["type"] == "list"
               for it in b["items"] for p in it["parts"] if p["type"] == "code"]
        self.assertEqual(ids, ["2.9#1"])

    def test_headings_inside_code_are_not_headings(self):
        d = good()
        titles = [s["title"] for c in d["chapters"] for s in c["sections"]]
        self.assertNotIn("2nd_place = \"Ali\"    # SyntaxError: starts with digit", titles)
        self.assertEqual(len(d["chapters"]), 11)


if __name__ == "__main__":
    unittest.main()
