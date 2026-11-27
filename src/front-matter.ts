/**
 * Front matter and sections of a hub page (moved from Spark Hall's lib/team-work.mjs and
 * business-plans.mjs so the readers run without Spark Hall). A small YAML subset (YAML 1.2 compatible): `key: value`,
 * nested maps by indentation, block lists (`- item`, `- key: value` maps), flow lists `[a, b]`, double-quoted (JSON
 * escapes) and single-quoted strings, literal (`|`) and folded (`>`) blocks, numbers, true/false/null, full-line `#`
 * comments. Rejected with a message: anchors, tags, flow maps, plain strings containing ": " or " #", tabs.
 * Pure – no file reads.
 */

export type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };
export type Meta = Record<string, YamlValue>;

/** Splits `---` front matter from the body. `yaml` is null when there is none. */
export function splitFrontMatter(text: string): { yaml: string | null; body: string } {
  const m = String(text).match(/^\uFEFF?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!m) return { yaml: null, body: String(text) };
  return { yaml: m[1], body: String(text).slice(m[0].length) };
}

/** One scalar or flow list. Throws Error(`${where}…`) on unsupported input. */
export function parseScalar(raw: string, where = ''): YamlValue {
  const s = raw.trim();
  const fail = (msg: string): never => {
    throw new Error(`${where}${msg}`);
  };
  if (s.startsWith('"')) {
    if (!/^"(?:[^"\\]|\\.)*"$/.test(s)) fail(`unterminated or invalid double-quoted string: ${s}`);
    return JSON.parse(s) as string;
  }
  if (s.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/.test(s)) fail(`unterminated single-quoted string: ${s}`);
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (s.startsWith('[')) {
    if (!s.endsWith(']')) fail(`unterminated flow list: ${s}`);
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    const items: string[] = [];
    let cur = '';
    let q: string | null = null;
    for (let i = 0; i < inner.length; i++) {
      const ch = inner[i];
      if (q) {
        cur += ch;
        if (ch === '\\' && q === '"') cur += inner[++i] ?? '';
        else if (ch === q) q = null;
      } else if (ch === '"' || ch === "'") {
        q = ch;
        cur += ch;
      } else if (ch === ',') {
        items.push(cur);
        cur = '';
      } else if (ch === '[' || ch === '{') fail(`nested flow collections are not supported: ${s}`);
      else cur += ch;
    }
    items.push(cur);
    return items.map((x) => {
      const v = parseScalar(x, where);
      if (typeof v === 'string' && /[\]}]/.test(x) && !/^\s*["']/.test(x)) fail(`quote list items containing brackets: ${x.trim()}`);
      return v;
    });
  }
  if (s.startsWith('{')) fail(`flow maps are not supported – use indented "key: value" lines`);
  if (s === '' || s === '~' || s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^[&*!|>%@`]/.test(s)) fail(`a plain value cannot start with "${s[0]}" – quote it: ${s}`);
  if (/:\s|:$/.test(s) || /\s#/.test(s)) fail(`quote values containing ": " or " #": ${s}`);
  return s;
}

interface Line {
  n: number;
  blank?: boolean;
  indent: number;
  text: string;
  raw: string;
}

/** Parses the YAML subset into plain objects. Throws Error("line N: …") on unsupported or invalid input. */
export function parseYaml(src: string | null | undefined): Meta {
  const raw = String(src ?? '').replace(/\r\n?/g, '\n').split('\n');
  const lines: Line[] = [];
  raw.forEach((text, n) => {
    if (!text.trim() || /^\s*#/.test(text)) {
      lines.push({ n: n + 1, blank: true, indent: 0, text, raw: text });
      return;
    }
    if (/^\s*\t/.test(text)) throw new Error(`line ${n + 1}: tabs are not allowed for indentation`);
    lines.push({ n: n + 1, indent: (text.match(/^ */) as RegExpMatchArray)[0].length, text: text.trim(), raw: text });
  });
  let i = 0;
  const skip = (): void => {
    while (i < lines.length && lines[i].blank) i++;
  };

  function block(indent: number): YamlValue {
    skip();
    if (i >= lines.length) return null;
    return lines[i].text.startsWith('- ') || lines[i].text === '-' ? seq(lines[i].indent) : map(indent);
  }

  function blockScalar(style: string, parentIndent: number): string {
    const buf: (Line | null)[] = [];
    let min = Infinity;
    for (; i < lines.length; i++) {
      const l = lines[i];
      if (!l.blank && l.indent <= parentIndent) break;
      if (l.blank) buf.push(null);
      else {
        min = Math.min(min, l.indent);
        buf.push(l);
      }
    }
    while (buf.length && buf[buf.length - 1] === null) buf.pop();
    const texts = buf.map((l) => (l === null ? '' : l.raw.slice(min)));
    const keep = !style.endsWith('-');
    if (style.startsWith('|')) return texts.join('\n') + (keep && texts.length ? '\n' : '');
    const paras = texts.join('\n').split(/\n{2,}/).map((p) => p.split('\n').join(' '));
    return paras.join('\n') + (keep && texts.length ? '\n' : '');
  }

  function value(rest: string, l: Line, ownIndent: number): YamlValue {
    if (/^[|>]-?$/.test(rest)) {
      i++;
      return blockScalar(rest, ownIndent);
    }
    if (rest !== '') {
      i++;
      return parseScalar(rest, `line ${l.n}: `);
    }
    i++;
    skip();
    if (i < lines.length && (lines[i].indent > ownIndent || (lines[i].indent === ownIndent && lines[i].text.startsWith('- ')))) {
      return block(lines[i].indent);
    }
    return null;
  }

  function map(indent: number): Meta {
    const obj: Meta = {};
    for (skip(); i < lines.length; skip()) {
      const l = lines[i];
      if (l.indent < indent) break;
      if (l.indent > indent) throw new Error(`line ${l.n}: unexpected indentation`);
      if (l.text.startsWith('- ')) break;
      const kv = l.text.match(/^([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
      if (!kv) throw new Error(`line ${l.n}: expected "key: value", got: ${l.text}`);
      if (Object.prototype.hasOwnProperty.call(obj, kv[1])) throw new Error(`line ${l.n}: duplicate key "${kv[1]}"`);
      obj[kv[1]] = value((kv[2] ?? '').trim(), l, indent);
    }
    return obj;
  }

  function seq(indent: number): YamlValue[] {
    const arr: YamlValue[] = [];
    for (skip(); i < lines.length; skip()) {
      const l = lines[i];
      if (l.indent !== indent || !(l.text.startsWith('- ') || l.text === '-')) {
        if (l.indent > indent) throw new Error(`line ${l.n}: unexpected indentation`);
        break;
      }
      const rest = l.text === '-' ? '' : l.text.slice(2).trim();
      if (rest === '') {
        i++;
        arr.push(block(indent + 1));
      } else if (/^[A-Za-z_][\w-]*:(\s|$)/.test(rest) && !/^["'[]/.test(rest)) {
        // "- key: value" starts a map whose keys sit at indent + 2
        const childIndent = indent + 2;
        lines[i] = { ...l, indent: childIndent, text: rest, raw: ' '.repeat(childIndent) + rest };
        arr.push(map(childIndent));
      } else {
        i++;
        arr.push(parseScalar(rest, `line ${l.n}: `));
      }
    }
    return arr;
  }

  skip();
  if (i >= lines.length) return {};
  if (lines[i].indent !== 0) throw new Error(`line ${lines[i].n}: the front matter must start at column 0`);
  const out = map(0);
  skip();
  if (i < lines.length) throw new Error(`line ${lines[i].n}: could not parse: ${lines[i].text}`);
  return out;
}

export interface ParsedDoc {
  meta: Meta;
  body: string;
  /** The parse error, or null; `meta` is {} when there is no front matter or it does not parse. */
  error: string | null;
}

/** Parses front matter + body; `meta` is {} when there is none or it does not parse (the error is returned). */
export function parseDoc(text: string): ParsedDoc {
  const { yaml, body } = splitFrontMatter(text);
  if (yaml == null) return { meta: {}, body, error: null };
  try {
    return { meta: parseYaml(yaml) || {}, body, error: null };
  } catch (e) {
    return { meta: {}, body, error: (e as Error).message };
  }
}

export interface DocSection {
  title: string;
  body: string;
}

/** Splits a Markdown body into its `##` sections: [{ title, body }] (text before the first `##` is dropped). */
export function splitSections(body: string): DocSection[] {
  const out: DocSection[] = [];
  let cur: DocSection | null = null;
  let fence = false;
  for (const line of String(body).replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const h = !fence && line.match(/^##\s+(.+?)\s*#*\s*$/);
    if (h) {
      cur = { title: h[1], body: '' };
      out.push(cur);
    } else if (cur) cur.body += `${line}\n`;
  }
  return out.map((s) => ({ ...s, body: s.body.trim() }));
}
