import { scanJavaDir } from "./jts-java-scan.mjs";

/** The adapter boundary: JTS type -> host type. Unmapped types pass through verbatim. */
const TS_TYPES = {
  void: "void",
  boolean: "boolean",
  int: "number",
  double: "number",
  Coordinate: "Coordinate",
  "Coordinate[]": "Coordinate[]",
  Envelope: "Envelope",
  Geometry: "Geometry",
  Polygon: "Polygon",
  LinearRing: "LinearRing",
  LineString: "LineString",
  "List<Double>": "number[]",
};

const RS_TYPES = {
  void: "()",
  boolean: "bool",
  int: "i32",
  double: "f64",
  Coordinate: "Coord<f64>",
  "Coordinate[]": "&[Coord<f64>]",
  Envelope: "Rect<f64>",
  Geometry: "Geometry<f64>",
  Polygon: "Polygon<f64>",
  LinearRing: "LineString<f64>",
  LineString: "LineString<f64>",
  "List<Double>": "Vec<f64>",
};

export function tsType(javaType) {
  if (javaType === null) return TS_TYPES.void;
  return TS_TYPES[javaType] ?? javaType;
}

export function rsType(javaType) {
  if (javaType === null) return RS_TYPES.void;
  return RS_TYPES[javaType] ?? javaType;
}

/**
 * An unchanged-name-rule mechanical case conversion. The acronym rule runs first so that a
 * run of capitals followed by a capitalised word splits between them:
 * `isCCWCoordinates` -> `is_ccw_coordinates`, not `is_ccwcoordinates`. A trailing
 * acronym has no following lowercase and is left whole (`selfAddDD` ->
 * `self_add_dd`).
 */
export function toSnake(name) {
  return name
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function pluralise(name) {
  return name.endsWith("s") ? name : `${name}s`;
}

/** `Coordinate[]` -> `Coordinates`; `double` -> `Double`; `DD` -> `DD`. */
function typeSuffix(javaType) {
  const base = javaType.endsWith("[]") ? pluralise(javaType.slice(0, -2)) : javaType;
  return base[0].toUpperCase() + base.slice(1);
}

function nullaryError() {
  return new Error("cannot derive an overload suffix from a nullary member — a first parameter is required");
}

export function overloadSuffix(paramTypes) {
  if (paramTypes.length === 0) throw nullaryError();
  return typeSuffix(paramTypes[0]);
}

/**
 * The factory/getter rule: a two-member group split into exactly one static and one
 * instance member is a factory/getter pair, not an overload set. Both keep
 * the bare JTS name; they collide in neither TypeScript nor Rust.
 */
function isFactoryGetterPair(group) {
  if (group.length !== 2) return false;
  return group.filter((m) => m.modifiers.includes("static")).length === 1;
}

/**
 * The ported name of a single member, and the only place suffixes are decided.
 *
 * The overload-suffix rule: append the PascalCase name of the first parameter's Java type.
 * Extended 2026-07-26 for DD.java, where `selfAdd(double)` and
 * `selfAdd(double,double)` share a first parameter type — when the first type
 * does not disambiguate, every parameter type is appended in order. The factory/getter rule
 * still exempts a factory/getter pair from suffixing entirely.
 *
 * Constructors are outside the overload-suffix rule altogether: both emitters name them
 * structurally (`constructor` in TypeScript, `new` in Rust) and never consult
 * this name. DD.java has five `DD` constructors including a nullary one, which
 * the rule cannot suffix at all.
 */
export function portedName(member, members) {
  if (member.isConstructor) return member.memberName;
  // Scoped by class, not just by file: InteriorPointArea.java has three
  // unrelated `process` methods in three classes, and they must stay unsuffixed.
  const overloads = members.filter(
    (m) => m.file === member.file && m.className === member.className && m.memberName === member.memberName,
  );
  if (overloads.length <= 1 || isFactoryGetterPair(overloads)) return member.memberName;
  if (member.paramTypes.length === 0) throw nullaryError();
  const firstTypes = overloads.map((m) => m.paramTypes[0] ?? "");
  const firstDisambiguates = new Set(firstTypes).size === overloads.length;
  const types = firstDisambiguates ? member.paramTypes.slice(0, 1) : member.paramTypes;
  return member.memberName + types.map(typeSuffix).join("");
}

export function resolveNames(members) {
  const names = new Map();
  for (const member of members) {
    const base = portedName(member, members);
    names.set(member, { ts: base, rs: toSnake(base) });
  }
  return names;
}

/** Static factories named getInteriorPoint collide across modules — a human decision. */
function needsDeviateNote(member) {
  return member.modifiers.includes("static") && member.memberName === "getInteriorPoint";
}

/** Java parameter names are carried across verbatim; the unchanged-name rule forbids renames. */
function paramName(member, index) {
  const name = member.paramNames[index];
  return name === "" ? `arg${index}` : name;
}

function emitJavadocTs(member, indent) {
  const anchor = `${indent}/** @jts ${member.signature} */`;
  if (member.javadoc.length === 0) return [anchor];
  const body = member.javadoc.map((line) => `${indent}${line.startsWith("/**") ? line : ` ${line}`}`);
  return [...body.slice(0, -1), `${indent} * @jts ${member.signature}`, `${indent} */`];
}

export function emitTs(members) {
  const names = resolveNames(members);
  const byClass = new Map();
  for (const member of members) {
    if (!byClass.has(member.className)) byClass.set(member.className, []);
    byClass.get(member.className).push(member);
  }
  const lines = ["// Generated by scripts/jts-sync.mjs scaffold --lang ts. Review before committing.", ""];
  for (const [className, group] of byClass) {
    lines.push(`export class ${className.split(".").at(-1)} {`);
    for (const member of group) {
      lines.push(...emitJavadocTs(member, "  "));
      if (needsDeviateNote(member)) lines.push(`  // TODO(@jts-deviate): module-level name collides across modules`);
      const params = member.paramTypes.map((t, i) => `${paramName(member, i)}: ${tsType(t)}`).join(", ");
      const returns = member.isConstructor ? "" : `: ${tsType(member.returnType)}`;
      const name = member.isConstructor ? "constructor" : names.get(member).ts;
      lines.push(`  ${name}(${params})${returns} {`);
      lines.push(`    throw new Error("not ported");`);
      lines.push("  }");
      lines.push("");
    }
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

export function emitRs(members) {
  const names = resolveNames(members);
  const byClass = new Map();
  for (const member of members) {
    if (!byClass.has(member.className)) byClass.set(member.className, []);
    byClass.get(member.className).push(member);
  }
  const lines = ["// Generated by scripts/jts-sync.mjs scaffold --lang rs. Review before committing.", ""];
  for (const [className, group] of byClass) {
    const structName = className.split(".").at(-1);
    lines.push(`pub struct ${structName} {}`);
    lines.push("");
    lines.push(`impl ${structName} {`);
    for (const member of group) {
      for (const line of member.javadoc) lines.push(`    /// ${line.replace(/^\/\*\*|\*\/$|^\*\s?/, "").trim()}`);
      lines.push(`    /// @jts ${member.signature}`);
      if (needsDeviateNote(member)) lines.push(`    // TODO(@jts-deviate): module-level name collides across modules`);
      // A constructor becomes `new`, which takes no receiver. Joining receiver and
      // parameters as one list keeps a nullary method from ending in a stray `, `.
      const receiver = member.modifiers.includes("static") || member.isConstructor ? [] : ["&mut self"];
      const params = member.paramTypes.map((t, i) => `${toSnake(paramName(member, i))}: ${rsType(t)}`);
      const returns = member.isConstructor || member.returnType === "void" ? "" : ` -> ${rsType(member.returnType)}`;
      const name = member.isConstructor ? "new" : names.get(member).rs;
      lines.push(`    fn ${name}(${[...receiver, ...params].join(", ")})${returns} {`);
      lines.push("        todo!()");
      lines.push("    }");
      lines.push("");
    }
    lines.push("}");
    lines.push("");
  }
  return lines.join("\n");
}

export function scaffold(root, lang, file) {
  const members = scanJavaDir(root).filter((m) => file === undefined || m.file === file);
  if (members.length === 0) throw new Error(`no members found${file === undefined ? "" : ` in ${file}`}`);
  return lang === "ts" ? emitTs(members) : emitRs(members);
}
