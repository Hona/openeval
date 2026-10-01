const EXPORT = /export\s+const\s+criteria\s*=\s*/;

/** Reads judge.ts's `export const criteria = { … }` as data, without executing the judge.
 * Only object, array, string, number, and boolean literals are accepted.
 */
export async function readCodeCriteria(file: string): Promise<unknown> {
  const transpiler = new Bun.Transpiler({ loader: "ts" }),
    source = transpiler.transformSync(await Bun.file(file).text()),
    start = EXPORT.exec(source);
  if (start)
    return new LiteralParser(source, start.index + start[0].length).value();
  if (transpiler.scan(source).exports.includes("criteria"))
    throw new Error(
      "Declare judge.ts criteria as `export const criteria = { … }`",
    );
  return undefined;
}

class LiteralParser {
  constructor(
    private source: string,
    private index: number,
  ) {}
  private fail(): never {
    throw new Error(
      "judge.ts criteria must be a literal object of names and categories",
    );
  }
  private space() {
    for (;;) {
      const rest = this.source.slice(this.index);
      const skipped = /^(?:\s+|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/.exec(rest);
      if (!skipped) return;
      this.index += skipped[0].length;
    }
  }
  private peek() {
    this.space();
    return this.source[this.index];
  }
  private take(token: string) {
    if (this.peek() !== token) this.fail();
    this.index++;
  }
  value(): unknown {
    const next = this.peek();
    if (next === "{") return this.object();
    if (next === "[") return this.array();
    if (next === '"' || next === "'" || next === "`") return this.string();
    const literal =
      /^(?:true|false|-?\d+(?:\.\d+)?)(?![\w$])/.exec(
        this.source.slice(this.index),
      )?.[0];
    if (!literal) this.fail();
    this.index += literal.length;
    return literal === "true" ? true : literal === "false" ? false : Number(literal);
  }
  private object() {
    this.take("{");
    const value: Record<string, unknown> = {};
    while (this.peek() !== "}") {
      const key =
        this.peek() === '"' || this.peek() === "'"
          ? this.string()
          : this.identifier();
      this.take(":");
      value[key] = this.value();
      if (this.peek() !== ",") break;
      this.index++;
    }
    this.take("}");
    return value;
  }
  private array() {
    this.take("[");
    const value: unknown[] = [];
    while (this.peek() !== "]") {
      value.push(this.value());
      if (this.peek() !== ",") break;
      this.index++;
    }
    this.take("]");
    return value;
  }
  private identifier() {
    const name = /^[A-Za-z_$][\w$]*/.exec(this.source.slice(this.index))?.[0];
    if (!name) this.fail();
    this.index += name.length;
    return name;
  }
  private string() {
    const quote = this.source[this.index]!;
    let value = "";
    for (this.index++; this.index < this.source.length; this.index++) {
      const char = this.source[this.index]!;
      if (char === quote) {
        this.index++;
        return value;
      }
      if (quote === "`" && char === "$" && this.source[this.index + 1] === "{")
        this.fail();
      if (char === "\\") {
        const escaped = this.source[++this.index]!;
        value +=
          { n: "\n", t: "\t", r: "\r", "0": "\0" }[escaped] ?? escaped;
        continue;
      }
      value += char;
    }
    this.fail();
  }
}
