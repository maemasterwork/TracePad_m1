"""Tracepad runner: executes learner code inside Pyodide (real CPython) and optionally traces it.

The same file is loaded by the browser worker and by tools/content/engine_check.mjs (the CI differential test),
so what is tested is what ships. Everything returned is plain JSON-able data.

Public entry points:
    run(code, stdin="", trace=False, cwd=None, input_provider=None, max_output=1_000_000, max_steps=1500)
"""
import builtins
import os
import sys
import traceback

USER_FILE = "<user>"
_MAX_EVENTS = 200_000  # line events allowed while tracing before we stop (protects against endless loops)


class _Capture:
    """File-like object that records output events in order and enforces an output size cap."""

    def __init__(self, stream, events, limit):
        self.stream, self.events, self.limit, self.size, self.cut = stream, events, limit, 0, False

    def write(self, text):
        if not isinstance(text, str):
            raise TypeError(f"write() argument must be str, not {type(text).__name__}")
        if self.cut:
            return len(text)
        if self.size + len(text) > self.limit:
            text = text[: max(self.limit - self.size, 0)]
            self.cut = True
            self.events.append(["err" if self.stream == "err" else "out", text])
            self.events.append(["note", "output limit reached; the rest was dropped"])
            self.size = self.limit
            return len(text)
        self.size += len(text)
        if text:
            if self.events and self.events[-1][0] == self.stream:
                self.events[-1][1] += text
            else:
                self.events.append([self.stream, text])
        return len(text)

    def flush(self):
        pass

    def isatty(self):
        return False

    encoding = "utf-8"


class _OutputLimit(BaseException):
    pass


class _TraceLimit(BaseException):
    pass


def _user_frames(tb):
    """Traceback entries that belong to the learner's file, as (line, name)."""
    out = []
    for fs in traceback.extract_tb(tb):
        if fs.filename == USER_FILE:
            out.append((fs.lineno, fs.name))
    return out


def _format_error(exc, source_lines):
    """CPython-style traceback limited to the learner's own frames, plus structured fields for the error coach."""
    tb = exc.__traceback__
    frames = _user_frames(tb)
    line = None
    col = None
    if isinstance(exc, SyntaxError):
        line = exc.lineno
        col = exc.offset
        lines = ["Traceback (most recent call last):"] if False else []
        text = (exc.text or "").rstrip("\n")
        lines.append(f'  File "{USER_FILE}", line {exc.lineno}')
        if text:
            lines.append("    " + text.strip())
        lines.append(f"{type(exc).__name__}: {exc.msg}")
        tb_text = "\n".join(lines)
    else:
        if frames:
            line = frames[-1][0]
        lines = ["Traceback (most recent call last):"]
        for fs in traceback.extract_tb(tb):
            if fs.filename != USER_FILE:
                continue
            lines.append(f'  File "{USER_FILE}", line {fs.lineno}, in {fs.name}')
            if 1 <= fs.lineno <= len(source_lines):
                lines.append("    " + source_lines[fs.lineno - 1].strip())
        lines.append("".join(traceback.format_exception_only(type(exc), exc)).rstrip("\n"))
        tb_text = "\n".join(lines)
    return {
        "type": type(exc).__name__,
        "message": str(exc),
        "line": line,
        "col": col,
        "frames": [{"line": ln, "name": nm} for ln, nm in frames],
        "traceback": tb_text,
    }


# ----------------------------------------------------------------------------- tracing

_PRIMS = (int, float, complex, bool, str, bytes, type(None))


class _Tracer:
    """Records one snapshot per executed line of the learner's code, using sys.settrace.

    A snapshot has the call stack (frames with their variables) and the heap objects those variables reach.
    Variables hold either {"p": text} (an immutable value shown inline) or {"r": n} (a reference to heap object n).
    Heap object ids are small integers that stay stable for the whole run. `gone` lists objects that were
    reachable in the previous step and are no longer reachable from any name (garbage in the learner's model).
    """

    MAX_ITEMS = 30  # items shown per container
    MAX_HEAP = 150  # heap objects per snapshot
    MAX_DEPTH = 6

    def __init__(self, max_steps, stdout_cap):
        self.steps = []
        self.max_steps = max_steps
        self.ids = {}
        self.keep = []  # keeps traced objects alive so id() values are never reused during the run
        self.events = 0
        self.truncated = False
        self.prev_heap = set()
        self.cap = stdout_cap

    # -- value encoding
    def _prim(self, v):
        if isinstance(v, str):
            r = repr(v)
            return r if len(r) <= 80 else r[:77] + "..."
        if isinstance(v, bytes):
            r = repr(v)
            return r if len(r) <= 80 else r[:77] + "..."
        return repr(v)

    def _ref(self, v, heap, depth):
        if isinstance(v, _PRIMS):
            return {"p": self._prim(v), "t": type(v).__name__}
        key = id(v)
        if key not in self.ids:
            self.ids[key] = len(self.ids) + 1
            self.keep.append(v)
        n = self.ids[key]
        if n in heap or len(heap) >= self.MAX_HEAP:
            return {"r": n}
        heap[n] = None  # reserve the slot to stop cycles
        heap[n] = self._describe(v, heap, depth)
        return {"r": n}

    def _items(self, it, heap, depth):
        out = []
        for k, x in enumerate(it):
            if k >= self.MAX_ITEMS:
                out.append({"more": True})
                break
            out.append(self._ref(x, heap, depth + 1) if depth < self.MAX_DEPTH else {"p": "...", "t": "str"})
        return out

    def _describe(self, v, heap, depth):
        t = type(v).__name__
        try:
            if isinstance(v, (list, tuple, set, frozenset)):
                src = v
                if isinstance(v, (set, frozenset)):
                    try:
                        src = sorted(v, key=repr)
                    except Exception:
                        src = list(v)
                return {"kind": t, "type": t, "items": self._items(src, heap, depth)}
            if isinstance(v, dict):
                pairs = []
                for k, (kk, vv) in enumerate(v.items()):
                    if k >= self.MAX_ITEMS:
                        pairs.append({"more": True})
                        break
                    pairs.append({"k": self._ref(kk, heap, depth + 1), "v": self._ref(vv, heap, depth + 1)})
                return {"kind": "dict", "type": t, "pairs": pairs}
            if callable(v) and hasattr(v, "__code__"):
                return {"kind": "function", "type": "function", "name": getattr(v, "__name__", "?")}
            if isinstance(v, type):
                return {"kind": "class", "type": "class", "name": v.__name__}
            if hasattr(v, "__dict__") and not isinstance(v, type):
                attrs = []
                for k, (kk, vv) in enumerate(vars(v).items()):
                    if k >= self.MAX_ITEMS:
                        attrs.append({"more": True})
                        break
                    attrs.append({"name": kk, "v": self._ref(vv, heap, depth + 1)})
                return {"kind": "instance", "type": t, "attrs": attrs}
        except Exception:
            pass
        r = repr(v)
        return {"kind": "other", "type": t, "repr": r if len(r) <= 80 else r[:77] + "..."}

    def _visible(self, name, value):
        if name.startswith("__") and name.endswith("__"):
            return False
        if isinstance(value, type(sys)):  # modules are not interesting in the diagram
            return False
        return True

    def snapshot(self, frame, event):
        heap = {}
        frames = []
        chain = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == USER_FILE:
                chain.append(f)
            f = f.f_back
        chain.reverse()
        for fr in chain:
            is_mod = fr.f_code.co_name == "<module>"
            local = fr.f_globals if is_mod else fr.f_locals
            variables = []
            for name, value in list(local.items()):
                if not self._visible(name, value):
                    continue
                variables.append({"name": name, "v": self._ref(value, heap, 0)})
            frames.append({"name": "Global" if is_mod else fr.f_code.co_name, "line": fr.f_lineno, "vars": variables})
        cur = set(heap.keys())
        gone = sorted(self.prev_heap - cur)
        self.prev_heap = cur
        return {"line": frame.f_lineno, "event": event, "depth": len(frames), "frames": frames, "heap": heap, "gone": gone}

    # -- sys.settrace protocol
    def global_trace(self, frame, event, arg):
        if frame.f_code.co_filename != USER_FILE:
            return None
        return self.local_trace

    def local_trace(self, frame, event, arg):
        self.events += 1
        if self.events > _MAX_EVENTS:
            raise _TraceLimit()
        if event in ("line", "return", "exception") and not self.truncated:
            if len(self.steps) >= self.max_steps:
                self.truncated = True
            else:
                try:
                    snap = self.snapshot(frame, event)
                    if event == "return":
                        snap["returned"] = self._prim(arg) if isinstance(arg, _PRIMS) else type(arg).__name__
                    if event == "exception":
                        snap["exception"] = type(arg[1]).__name__ + ": " + str(arg[1])
                    self.steps.append(snap)
                except _TraceLimit:
                    raise
                except Exception:
                    pass
        return self.local_trace


# ----------------------------------------------------------------------------- run

def run(code, stdin="", trace=False, cwd=None, input_provider=None, max_output=1_000_000, max_steps=1500, prelude=""):
    """Execute `code` as the module __main__. Returns a dict (see keys at the bottom).

    `prelude` is code from earlier in the lesson that this snippet depends on; it runs first in the same namespace
    with its output discarded and is never traced."""
    events = []
    out = _Capture("out", events, max_output)
    err = _Capture("err", events, max_output)
    queue = stdin.split("\n") if stdin else []
    if queue and queue[-1] == "":
        queue.pop()
    inputs_used = []

    def fake_input(prompt=""):
        if prompt is not None and str(prompt) != "":
            out.write(str(prompt))
        if queue:
            line = queue.pop(0)
        elif input_provider is not None:
            got = input_provider(str(prompt))
            if got is None:
                raise EOFError("EOF when reading a line")
            line = str(got)
        else:
            raise EOFError("EOF when reading a line")
        inputs_used.append(line)
        events.append(["in", line])
        return line

    old = (sys.stdout, sys.stderr, builtins.input, os.getcwd())
    if cwd:
        os.makedirs(cwd, exist_ok=True)
        os.chdir(cwd)
    sys.stdout, sys.stderr, builtins.input = out, err, fake_input
    glb = {"__name__": "__main__", "__builtins__": builtins, "__file__": USER_FILE}  # one namespace for prelude + code
    source_lines = code.split("\n")
    tracer = _Tracer(max_steps, max_output) if trace else None
    error = None
    exit_code = 0
    try:
        try:
            if prelude:
                saved = (sys.stdout, sys.stderr)
                sys.stdout = sys.stderr = _Capture("out", [], max_output)
                try:
                    exec(compile(prelude, "<prelude>", "exec"), glb)
                finally:
                    sys.stdout, sys.stderr = saved
            compiled = compile(code, USER_FILE, "exec")
            if tracer:
                sys.settrace(tracer.global_trace)
            try:
                exec(compiled, glb)
            finally:
                if tracer:
                    sys.settrace(None)
        except SystemExit as e:
            exit_code = e.code if isinstance(e.code, int) else (0 if e.code is None else 1)
            if e.code not in (None, 0) and not isinstance(e.code, int):
                err.write(str(e.code) + "\n")
        except _TraceLimit:
            error = {"type": "TraceLimit", "message": "The program ran too many steps to trace. Try a smaller example.",
                     "line": None, "col": None, "frames": [], "traceback": ""}
        except KeyboardInterrupt:
            error = {"type": "KeyboardInterrupt", "message": "Stopped.", "line": None, "col": None, "frames": [],
                     "traceback": "KeyboardInterrupt"}
        except BaseException as e:  # noqa: BLE001 - we must report every learner error
            error = _format_error(e, source_lines)
            err.write(error["traceback"] + "\n")
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr, builtins.input = old[0], old[1], old[2]
        os.chdir(old[3])
    result = {
        "ok": error is None and exit_code == 0,
        "exit_code": exit_code,
        "stdout": "".join(t for k, t in events if k == "out"),
        "stderr": "".join(t for k, t in events if k == "err"),
        "events": events,
        "error": error,
    }
    if tracer:
        result["steps"] = tracer.steps
        result["truncated"] = tracer.truncated
    return result
