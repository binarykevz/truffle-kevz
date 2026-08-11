export type TokenType =
    | "ATOM" | "MUT_ATOM" | "SOLUTION" | "DNA" | "REACTION"
    | "EQUILIBRIUM" | "CYCLING" | "MICROSCOPE" | "ENERGY"
    | "BOND" | "SOLVENT" | "ACTIVATE" | "CATALYST"
    | "CULTURE" | "COMPOUND" | "COMBUSTION" | "SHIELD" | "BANDAGE"
    | "VOID" | "ABSORB"
    | "IDENT" | "STRING" | "NUMBER" | "OPERATOR" | "PUNCT"
    | "NEWLINE" | "EOF";

export interface Token {
    type: TokenType;
    value: string;
    line: number;
    col: number;
}

const KEYWORDS: Record<string, TokenType> = {
    "⚛": "ATOM",
    "←": "MUT_ATOM",
    "⚗": "SOLUTION",
    "🧬": "DNA",
    "→": "REACTION",
    "⇌⥀": "CYCLING",
    "⇌": "EQUILIBRIUM",
    "🔬": "MICROSCOPE",
    "⚡": "ENERGY",
    "🧲": "BOND",
    "H₂O": "SOLVENT",
    "↯": "ACTIVATE",
    "⟲": "CATALYST",
    "🧫": "CULTURE",
    "💊": "COMPOUND",
    "🔥": "COMBUSTION",
    "🛡️": "SHIELD",
    "🩹": "BANDAGE",
    "∅": "VOID",
    "⬅": "ABSORB",
};

// Sort keywords longest-first to match ⇌⥀ before ⇌, 🛡️ before 🛡
const SORTED_KEYWORDS = Object.entries(KEYWORDS).sort((a, b) => b[0].length - a[0].length);

export function tokenize(source: string): Token[] {
    const tokens: Token[] = [];
    let line = 1;
    let col = 1;
    let i = 0;

    while (i < source.length) {
        const ch = source[i];

        if (ch === "\n") {
            tokens.push({ type: "NEWLINE", value: "\n", line, col });
            line++; col = 1; i++; continue;
        }

        if (/\s/.test(ch)) { i++; col++; continue; }

        // Comments: # to end of line
        if (ch === "#") {
            while (i < source.length && source[i] !== "\n") i++;
            continue;
        }

        // Try keywords (sorted longest-first)
        let matched = false;
        for (const [sym, type] of SORTED_KEYWORDS) {
            if (source.slice(i, i + sym.length) === sym) {
                tokens.push({ type, value: sym, line, col });
                i += sym.length;
                col += [...sym].length;
                matched = true;
                break;
            }
        }
        if (matched) continue;

        // Strings
        if (ch === '"' || ch === "'" || ch === "`") {
            const quote = ch;
            let str = ch;
            i++; col++;
            while (i < source.length && source[i] !== quote) {
                if (source[i] === "\\" && i + 1 < source.length) {
                    str += source[i++]; col++;
                }
                str += source[i++]; col++;
            }
            if (i < source.length) { str += source[i++]; col++; }
            tokens.push({ type: "STRING", value: str, line, col });
            continue;
        }

        // Numbers
        if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(source[i + 1] || ""))) {
            let num = "";
            while (i < source.length && /[0-9._eE+\-xXa-fA-F]/.test(source[i])) {
                num += source[i++]; col++;
            }
            tokens.push({ type: "NUMBER", value: num, line, col });
            continue;
        }

        // Identifiers (unicode-friendly)
        if (/[\p{L}\p{N}_$]/u.test(ch)) {
            let id = "";
            while (i < source.length && /[\p{L}\p{N}_$]/u.test(source[i])) {
                id += source[i++]; col++;
            }
            tokens.push({ type: "IDENT", value: id, line, col });
            continue;
        }

        // Operators
        if (/[=+\-*/%<>!&|^~?:]/.test(ch)) {
            let op = ch;
            i++; col++;
            while (i < source.length && /[=+\-*/%<>!&|^~?:]/.test(source[i]) && op.length < 4) {
                op += source[i++]; col++;
            }
            tokens.push({ type: "OPERATOR", value: op, line, col });
            continue;
        }

        // Punctuation
        if (/[(){}\[\],.;]/.test(ch)) {
            tokens.push({ type: "PUNCT", value: ch, line, col });
            i++; col++;
            continue;
        }

        // Unknown — pass through
        tokens.push({ type: "PUNCT", value: ch, line, col });
        i++; col++;
    }

    tokens.push({ type: "EOF", value: "", line, col });
    return tokens;
}
