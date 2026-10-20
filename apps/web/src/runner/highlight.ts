/** A small Python tokenizer for the editor overlay. It only colours text; it never changes it. */
const KEYWORDS = new Set(['False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield']);
const BUILTINS = new Set(['print', 'len', 'range', 'int', 'float', 'str', 'list', 'dict', 'set', 'tuple', 'bool', 'type', 'input', 'open', 'sum', 'min', 'max', 'sorted', 'enumerate', 'zip', 'map', 'filter', 'abs', 'round', 'isinstance', 'any', 'all', 'reversed', 'id']);

export interface Tok { cls: string; text: string }

export function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  const re = /(#[^\n]*)|("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|[rRbBfF]{0,2}"(?:\\.|[^"\\\n])*"?|[rRbBfF]{0,2}'(?:\\.|[^'\\\n])*'?)|(\b\d[\d_]*(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?j?\b|\b0[xX][0-9a-fA-F_]+\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g;
  let m: RegExpExecArray | null;
  let prevWord = '';
  while ((m = re.exec(src))) {
    if (m[1]) out.push({ cls: 'tok-com', text: m[1] });
    else if (m[2]) out.push({ cls: 'tok-str', text: m[2] });
    else if (m[3]) out.push({ cls: 'tok-num', text: m[3] });
    else if (m[4]) {
      const w = m[4];
      if (KEYWORDS.has(w)) out.push({ cls: 'tok-kw', text: w });
      else if (prevWord === 'def' || prevWord === 'class' || BUILTINS.has(w)) out.push({ cls: 'tok-fn', text: w });
      else out.push({ cls: '', text: w });
      prevWord = w;
      continue;
    } else out.push({ cls: '', text: m[5] });
    if (m[5] && /\S/.test(m[5])) prevWord = '';
  }
  return out;
}
