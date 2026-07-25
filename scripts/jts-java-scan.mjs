import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ALGORITHM_DIR = "upstream/jts/algorithm";
const MODIFIERS = new Set(["public", "private", "protected", "static", "final", "abstract", "synchronized"]);
const CLASS_HEADER = /(?:^|\s)(?:class|interface|enum)\s+(\w+)/;

/**
 * Removes `//` and block comments, leaving every newline in place so that
 * line numbers in the stripped text still refer to the original source.
 */
export function stripComments(src) {
  let out = "";
  let inLine = false;
  let inBlock = false;
  let inString = false;
  let inChar = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const d = src[i + 1];
    if (inLine) {
      if (c === "\n") {
        inLine = false;
        out += c;
      }
      continue;
    }
    if (inBlock) {
      if (c === "*" && d === "/") {
        inBlock = false;
        i++;
      } else if (c === "\n") {
        out += c;
      }
      continue;
    }
    if (inString || inChar) {
      out += c;
      if (c === "\\") {
        out += d ?? "";
        i++;
      } else if (inString && c === '"') {
        inString = false;
      } else if (inChar && c === "'") {
        inChar = false;
      }
      continue;
    }
    if (c === "/" && d === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (c === "/" && d === "*") {
      inBlock = true;
      i++;
      continue;
    }
    if (c === '"') inString = true;
    if (c === "'") inChar = true;
    out += c;
  }
  return out;
}

/** Splits a parameter list on top-level commas, tolerating generics such as `List<Double>`. */
function splitParams(text) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const c of text) {
    if (c === "<" || c === "(") depth++;
    else if (c === ">" || c === ")") depth--;
    if (c === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += c;
  }
  if (current.trim() !== "") parts.push(current);
  return parts;
}

/** `Coordinate[] pts` -> `{ type: "Coordinate[]", name: "pts" }`; `final double y` -> `{ type: "double", name: "y" }`. */
function parseParam(param) {
  const tokens = param
    .trim()
    .split(/\s+/)
    .filter((t) => t !== "final");
  if (tokens.length < 2) return { type: (tokens[0] ?? "").replace(/\s+/g, ""), name: "" };
  const name = tokens.at(-1);
  let type = tokens.slice(0, -1).join(" ");
  if (name.endsWith("[]")) type += "[]"; // `Coordinate pts[]` style
  return { type: type.replace(/\s+/g, ""), name: name.replace(/\[\]$/, "") };
}

/**
 * Parses an accumulated declaration header. Returns null when the header is not
 * a member declaration (a class header, a bare expression, a stray fragment).
 */
function parseDeclaration(header) {
  if (CLASS_HEADER.test(header)) return null;
  const open = header.indexOf("(");
  const close = header.lastIndexOf(")");
  if (open === -1 || close < open) return null;
  const before = header.slice(0, open).trim();
  const tokens = before.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  const memberName = tokens.at(-1);
  if (!/^\w+$/.test(memberName)) return null;
  const qualifiers = tokens.slice(0, -1);
  const modifiers = qualifiers.filter((t) => MODIFIERS.has(t));
  // Every declaration in the tracked files starts with an access or `static` modifier.
  if (modifiers.length === 0) return null;
  const typeTokens = qualifiers.filter((t) => !MODIFIERS.has(t));
  const returnType = typeTokens.length > 0 ? typeTokens.join(" ").replace(/\s+/g, "") : null;
  const params = splitParams(header.slice(open + 1, close))
    .map(parseParam)
    .filter((p) => p.type !== "");
  return {
    memberName,
    modifiers,
    returnType,
    isConstructor: returnType === null,
    paramTypes: params.map((p) => p.type),
    paramNames: params.map((p) => p.name),
  };
}

/** Collects the `/** … *\/` block immediately above `line` (1-based), skipping blank lines. */
function javadocAbove(rawLines, line) {
  let i = line - 2;
  while (i >= 0 && rawLines[i].trim() === "") i--;
  if (i < 0 || rawLines[i].trim() !== "*/") return [];
  const end = i;
  while (i >= 0 && !rawLines[i].trim().startsWith("/**")) {
    if (rawLines[i].trim().startsWith("/*") && !rawLines[i].trim().startsWith("/**")) return [];
    i--;
  }
  if (i < 0) return [];
  return rawLines.slice(i, end + 1).map((l) => l.trim());
}

export function scanMembers(src, fileName) {
  const rawLines = src.split("\n");
  const stripped = stripComments(src);
  const members = [];
  const classStack = []; // { name, depth }
  const openMembers = []; // { member, depth }
  let depth = 0;
  let header = "";
  let headerLine = 1;
  let line = 1;

  const resetHeader = () => {
    header = "";
    headerLine = line;
  };

  for (let i = 0; i < stripped.length; i++) {
    const c = stripped[i];
    if (c === "\n") {
      line++;
      if (header.trim() === "") headerLine = line;
      else header += " ";
      continue;
    }
    if (c === ";") {
      resetHeader();
      continue;
    }
    if (c === "{") {
      const text = header.trim().replace(/\s+/g, " ");
      depth++;
      const classMatch = CLASS_HEADER.exec(text);
      if (classMatch) {
        classStack.push({ name: classMatch[1], depth });
      } else if (classStack.length > 0 && depth === classStack.at(-1).depth + 1) {
        const parsed = parseDeclaration(text);
        if (parsed) {
          const className = classStack.map((s) => s.name).join(".");
          const member = {
            file: fileName,
            className,
            ...parsed,
            signature: `${className}#${parsed.memberName}(${parsed.paramTypes.join(",")})`,
            startLine: headerLine,
            endLine: line,
            javadoc: javadocAbove(rawLines, headerLine),
          };
          members.push(member);
          openMembers.push({ member, depth });
        }
      }
      resetHeader();
      continue;
    }
    if (c === "}") {
      if (openMembers.length > 0 && openMembers.at(-1).depth === depth) {
        openMembers.pop().member.endLine = line;
      }
      if (classStack.length > 0 && classStack.at(-1).depth === depth) classStack.pop();
      depth--;
      resetHeader();
      continue;
    }
    header += c;
  }
  return members;
}

export function scanJavaDir(root) {
  const dir = join(root, ALGORITHM_DIR);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".java"))
    .sort();
  const members = [];
  for (const file of files) members.push(...scanMembers(readFileSync(join(dir, file), "utf8"), file));
  return members;
}

export function findEnclosingMember(members, file, line) {
  let best = null;
  for (const m of members) {
    if (m.file !== file) continue;
    if (line < m.startLine || line > m.endLine) continue;
    if (best === null || m.startLine > best.startLine) best = m;
  }
  return best;
}
