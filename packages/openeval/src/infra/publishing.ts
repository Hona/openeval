const withheld = "[withheld from public export]";
const privateKey =
  /^(?:authorization|proxyauthorization|cookie|setcookie|apikey|accesstoken|refreshtoken|clientsecret|password|secret|token|credentials|credential|privatekey)$/i;
const providerState =
  /^(?:providerState|providerResultState|providerContext|resultState)$/;
const patterns = [
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9_+\/.=-]{8,}/gi,
  /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /((?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\s*["']?\s*[:=]\s*["']?)[^\s"',;<>]{8,}/gi,
  /(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
];
const credentialMatch = (rule: number, value: string) => {
  if (rule !== 0) return true;
  const [scheme, token] = value.split(/\s+/, 2);
  if (scheme.toLowerCase() === "bearer")
    return token.length >= 16 || /[\d_+/.=-]/.test(token);
  // Syntax grammars contain "basic entity.other..."; Basic auth is base64(user:password).
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(token)) return false;
  const decoded = Buffer.from(token, "base64");
  return (
    decoded.toString("base64").replace(/=+$/, "") ===
      token.replace(/=+$/, "") &&
    /^[^\u0000-\u001f\u007f\ufffd]*:[^\u0000-\u001f\u007f\ufffd]*$/u.test(
      decoded.toString("utf8"),
    )
  );
};
/** Filter before paging/preview generation. Nothing here edits the retained evidence. */
export class Publication {
  readonly redactions: Record<string, number> = {};
  private readonly secrets: string[];
  constructor(secrets: readonly string[]) {
    const values = new Set<string>();
    for (const secret of secrets.filter((value) => value.length >= 6)) {
      for (const value of [secret, encodeURIComponent(secret)]) {
        values.add(value);
        // A quoted preview or truncated tool output must not expose key fragments.
        if (value.length > 16)
          for (let i = 0; i <= value.length - 16; i++)
            values.add(value.slice(i, i + 16));
      }
    }
    this.secrets = [...values].sort((a, b) => b.length - a.length);
  }
  omit(reason: string) {
    this.redactions[reason] = (this.redactions[reason] ?? 0) + 1;
    return withheld;
  }
  text(value: string, depth = 0): string {
    if (depth > 100)
      throw new Error("Public data exceeds the supported nesting depth");
    let text = value;
    for (const secret of this.secrets)
      if (text.includes(secret)) {
        this.omit("known-credential");
        text = text.replaceAll(secret, withheld);
      }
    for (const [rule, pattern] of patterns.entries())
      text = text.replace(pattern, (value) => {
        if (!credentialMatch(rule, value)) return value;
        this.omit("credential-pattern");
        return withheld;
      });
    text = text.replace(/\b[A-Za-z]:[\\/][^\s"'<>`]*/g, () => {
      this.omit("host-path");
      return "[local path]";
    });
    text = text.replace(/\/(?:Users|home)\/[^\s/"'<>]+/g, () => {
      this.omit("host-path");
      return "/[home]";
    });
    // Tool outputs often contain serialized JSON; filter its fields before publishing it.
    if (/^\s*[\[{]/.test(text)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return text;
      }
      const filtered = this.json(parsed, depth + 1);
      if (JSON.stringify(parsed) !== JSON.stringify(filtered))
        return JSON.stringify(filtered, null, 2);
    }
    return text;
  }
  json<T>(value: T, depth = 0): T {
    const visit = (item: unknown, depth: number): unknown => {
      if (depth > 100)
        throw new Error("Public data exceeds the supported nesting depth");
      if (typeof item === "string") return this.text(item, depth + 1);
      if (typeof item === "number" && !Number.isFinite(item))
        throw new Error("Public data contains a non-finite number");
      if (Array.isArray(item))
        return item.map((entry) => visit(entry, depth + 1));
      if (!item || typeof item !== "object") return item;
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, entry] of Object.entries(item)) {
        if (entry === undefined) continue;
        if (providerState.test(key)) {
          this.omit("provider-state");
          continue;
        }
        if (privateKey.test(key.replaceAll(/[-_]/g, ""))) {
          this.omit("credential-field");
          result[key] = withheld;
          continue;
        }
        result[this.text(key, depth + 1)] = visit(entry, depth + 1);
      }
      return result;
    };
    return visit(value, depth) as T;
  }
  assertClean(text: string) {
    if (this.secrets.some((secret) => text.includes(secret)))
      throw new Error(
        "Publication blocked: a known credential or credential fragment remains",
      );
    for (const [rule, pattern] of patterns.slice(0, 4).entries()) {
      pattern.lastIndex = 0;
      if (
        [...text.matchAll(pattern)].some(([value]) =>
          credentialMatch(rule, value),
        )
      )
        throw new Error("Publication blocked: a credential pattern remains");
    }
  }
}
