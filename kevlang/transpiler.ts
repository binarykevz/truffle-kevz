import { tokenize, Token } from "./lexer";

export function transpile(source: string, filename: string = "unknown.kev", isInner: boolean = false): string {
    const tokens = tokenize(source);
    const out: string[] = [];
    let i = 0;

    if (!isInner) {
        out.push(`// ⚗ SYNTHESIZED from ${filename} — do not edit by hand`);
        out.push(`// 🧪 Generated at ${new Date().toISOString()}`);
        out.push("");
    }

    while (i < tokens.length) {
        const t = tokens[i];

        // --- Import (Bond): 🧲 { A, B } ⬅ "path" ---
        if (t.type === "BOND") {
            i++;
            const parts: string[] = ["import"];
            while (i < tokens.length && tokens[i].type !== "ABSORB" && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                const tk = tokens[i];
                if (tk.type === "PUNCT" && (tk.value === "{" || tk.value === "}" || tk.value === ",")) {
                    parts.push(tk.value);
                } else if (tk.type === "IDENT" || tk.type === "OPERATOR") {
                    parts.push(tk.value);
                } else {
                    parts.push(tk.value);
                }
                i++;
            }
            if (tokens[i]?.type === "ABSORB") {
                parts.push("from");
                i++;
                while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                    parts.push(tokens[i].value);
                    i++;
                }
            }
            out.push(parts.join(" ") + ";");
            continue;
        }

        // --- Mutable Atom: ⚛ name ← expr ---
        // --- Destructuring: ⚛ { a, b } ← expr ---
        // --- Destructuring: ⚛ [a, b] ← expr ---
        if (t.type === "ATOM") {
            const next = tokens[i + 1];
            const nextNext = tokens[i + 2];

            // Pattern 1: ⚛ IDENT ← expr  →  let name = expr
            if (next?.type === "IDENT" && nextNext?.type === "MUT_ATOM") {
                i++;
                const name = tokens[i].value;
                i += 2; // skip name and ←
                const expr = readUntilEOL(tokens, i);
                out.push(`let ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            // Pattern 2: ⚛ { ... } ← expr  →  let { ... } = expr
            if (next?.value === "{" && nextNext?.type !== undefined) {
                i++; // skip ⚛
                const block = readBracedBlock(tokens, i);
                i = block.endIdx;
                // Expect ← after the block
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++; // skip ←
                    const expr = readUntilEOL(tokens, i);
                    out.push(`let {${rewriteInner(block.body)}} = ${expr};`);
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                // If no ←, treat as immutable object: const { ... } = expr
                // This shouldn't happen but handle gracefully
                out.push(`const {${rewriteInner(block.body)}} = {};`);
                continue;
            }

            // Pattern 3: ⚛ [ ... ] ← expr  →  let [ ... ] = expr
            if (next?.value === "[" && nextNext?.type !== undefined) {
                i++; // skip ⚛
                const block = readBracketedBlock(tokens, i);
                i = block.endIdx;
                // Expect ← after the block
                while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
                if (tokens[i]?.type === "MUT_ATOM") {
                    i++; // skip ←
                    const expr = readUntilEOL(tokens, i);
                    out.push(`let [${rewriteInner(block.body)}] = ${expr};`);
                    i = skipPastEOL(tokens, i);
                    continue;
                }
                out.push(`const [${rewriteInner(block.body)}] = [];`);
                continue;
            }

            // Pattern 4: ⚛ IDENT = expr  →  const name = expr (immutable)
            if (next?.type === "IDENT" && nextNext?.type === "OPERATOR" && nextNext.value === "=") {
                i++;
                const name = tokens[i].value;
                i += 2; // skip name and =
                const expr = readUntilEOL(tokens, i);
                out.push(`const ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }
        }

        // --- Immutable Atom: ⚛ name = expr ---
        if (t.type === "ATOM" && tokens[i + 1]?.type === "IDENT" && tokens[i + 2]?.type === "OPERATOR" && tokens[i + 2].value === "=") {
            i++;
            const name = tokens[i].value;
            i += 2;
            const expr = readUntilEOL(tokens, i);
            out.push(`const ${name} = ${expr};`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Solution (object/variable): ⚗ name { ... } | ⚗ name ← value | ⚗ name = value ---
        if (t.type === "SOLUTION") {
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;

            // Pattern A: ⚗ name ← value  →  let name = value
            if (tokens[i]?.type === "MUT_ATOM") {
                i++; // skip ←
                const expr = readUntilEOL(tokens, i);
                out.push(`let ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            // Pattern B: ⚗ name = value  →  const name = value
            if (tokens[i]?.type === "OPERATOR" && tokens[i].value === "=") {
                i++; // skip =
                const expr = readUntilEOL(tokens, i);
                out.push(`const ${name} = ${expr};`);
                i = skipPastEOL(tokens, i);
                continue;
            }

            // Pattern C: ⚗ name { ... }  →  const name = { ... }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`const ${name} = {${rewriteInner(body)}};`);
            continue;
        }

        // --- DNA strand (array): 🧬 name [ ... ] ---
        if (t.type === "DNA") {
            i++;
            const name = tokens[i]?.type === "IDENT" ? tokens[i].value : "_";
            if (tokens[i]?.type === "IDENT") i++;
            if (tokens[i]?.value === "[") {
                const block = readBracketedBlock(tokens, i);
                out.push(`const ${name} = [${rewriteInner(block.body)}];`);
                i = block.endIdx;
            } else {
                out.push(`const ${name} = [];`);
            }
            continue;
        }

        // --- Reaction (async function): → name(params) { body } ---
        if (t.type === "REACTION" && tokens[i + 1]?.type === "IDENT") {
            i++;
            const name = tokens[i].value;
            i++;
            let params = "";
            if (tokens[i]?.value === "(") {
                const block = readParenBlock(tokens, i);
                params = rewriteInner(block.body);
                i = block.endIdx;
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`async function ${name}(${params}) {${rewriteInner(body)}}`);
            continue;
        }

        // --- Cycling (while): ⇌⥀ condition { body } ---
        if (t.type === "CYCLING") {
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{") {
                    cond += emitToken(tokens[i]) + " ";
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`while (${cond.trim()}) {${rewriteInner(body)}}`);
            continue;
        }

        // --- Equilibrium (if): ⇌ condition { body } ---
        if (t.type === "EQUILIBRIUM") {
            i++;
            let cond = "";
            if (tokens[i]?.value === "(") {
                const p = readParenBlock(tokens, i);
                cond = rewriteInner(p.body);
                i = p.endIdx;
            } else {
                while (i < tokens.length && tokens[i].value !== "{") {
                    cond += emitToken(tokens[i]) + " ";
                    i++;
                }
            }
            let body = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                body = block.body;
                i = block.endIdx;
            }
            out.push(`if (${cond.trim()}) {${rewriteInner(body)}}`);
            continue;
        }

        // --- Microscope: 🔬 expr ---
        if (t.type === "MICROSCOPE") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`console.log(${expr});`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Energy (event binding): ⚡ event → handler ---
        if (t.type === "ENERGY") {
            i++;
            let event = "";
            while (i < tokens.length && tokens[i].type !== "REACTION" && tokens[i].type !== "NEWLINE") {
                event += tokens[i].value;
                i++;
            }
            if (tokens[i]?.type === "REACTION") i++;
            let handler = "";
            while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
                handler += emitToken(tokens[i]) + " ";
                i++;
            }
            out.push(`bot.command(${JSON.stringify(event.trim())}, ${handler.trim()});`);
            continue;
        }

        // --- Activation (await): ↯ ---
        if (t.type === "ACTIVATE") {
            out.push("await");
            i++;
            continue;
        }

        // --- Catalyst (return): ⟲ expr ---
        if (t.type === "CATALYST") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`return ${expr};`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Combustion (throw): 🔥 expr ---
        if (t.type === "COMBUSTION") {
            i++;
            const expr = readUntilEOL(tokens, i);
            out.push(`throw ${expr};`);
            i = skipPastEOL(tokens, i);
            continue;
        }

        // --- Shield/Bandage (try/catch): 🛡️ { } 🩹 (e) { } ---
        if (t.type === "SHIELD") {
            i++;
            let tryBody = "";
            if (tokens[i]?.value === "{") {
                const block = readBracedBlock(tokens, i);
                tryBody = block.body;
                i = block.endIdx;
            }
            let catchVar = "e";
            let catchBody = "";
            while (i < tokens.length && tokens[i].type === "NEWLINE") i++;
            if (tokens[i]?.type === "BANDAGE") {
                i++;
                if (tokens[i]?.value === "(") {
                    const p = readParenBlock(tokens, i);
                    catchVar = p.body.trim() || "e";
                    i = p.endIdx;
                }
                if (tokens[i]?.value === "{") {
                    const block = readBracedBlock(tokens, i);
                    catchBody = block.body;
                    i = block.endIdx;
                }
            }
            out.push(`try {${rewriteInner(tryBody)}} catch (${catchVar}) {${rewriteInner(catchBody)}}`);
            continue;
        }

        // --- Void ---
        if (t.type === "VOID") {
            out.push("null");
            i++;
            continue;
        }

        // --- Universal Solvent: H₂O → ctx ---
        if (t.type === "SOLVENT") {
            out.push("ctx");
            i++;
            continue;
        }

        // --- export modifier ---
        if (t.type === "IDENT" && t.value === "export") {
            out.push("export");
            i++;
            continue;
        }

// --- Void ---
        if (t.type === "VOID") {
            out.push("null");
            i++;
            continue;
        }

        // --- Universal Solvent: H₂O → ctx ---
        if (t.type === "SOLVENT") {
            out.push("ctx");
            i++;
            continue;
        }

        // --- export modifier ---
        if (t.type === "IDENT" && t.value === "export") {
            out.push("export");
            i++;
            continue;
        }

        // ⬇️ INSERT THIS BLOCK HERE ⬇️
        // --- Safety net: stray ← becomes assignment ---
        if (t.type === "MUT_ATOM") {
            // If we hit a ← that wasn't part of a recognized pattern,
            // treat it as an assignment operator
            out.push("=");
            i++;
            continue;
        }
        // ⬆️ END INSERT ⬆️

        // --- Pass-through ---
        out.push(emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : ""));
        i++;
    }

    return out.join("\n");
}

        // --- Pass-through ---
        out.push(emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : ""));
        i++;
    }

    return out.join("\n");
}

function emitToken(t: Token): string {
    if (t.type === "SOLVENT") return "ctx";
    if (t.type === "VOID") return "null";
    return t.value;
}

function needsSpace(a: Token, b: Token | undefined): boolean {
    if (!b) return false;
    if (a.type === "NEWLINE" || b.type === "NEWLINE") return false;
    if (a.type === "PUNCT" && /[(){}\[\],.;:]/.test(a.value)) return false;
    if (b.type === "PUNCT" && /[(){}\[\],.;:]/.test(b.value)) return false;
    if (a.type === "PUNCT" || b.type === "PUNCT") return false;
    return true;
}

function readUntilEOL(tokens: Token[], start: number): string {
    let out = "";
    let i = start;
    while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") {
        out += emitToken(tokens[i]) + " ";
        i++;
    }
    return out.trim();
}

function skipPastEOL(tokens: Token[], start: number): number {
    let i = start;
    while (i < tokens.length && tokens[i].type !== "NEWLINE" && tokens[i].type !== "EOF") i++;
    if (tokens[i]?.type === "NEWLINE") i++;
    return i;
}

function readBracedBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "{") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "{") depth++;
        else if (t.value === "}") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body, endIdx: i };
}

function readBracketedBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "[") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "[") depth++;
        else if (t.value === "]") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body, endIdx: i };
}

function readParenBlock(tokens: Token[], start: number): { body: string; endIdx: number } {
    if (tokens[start]?.value !== "(") return { body: "", endIdx: start };
    let depth = 1;
    let i = start + 1;
    let body = "";
    while (i < tokens.length && depth > 0) {
        const t = tokens[i];
        if (t.value === "(") depth++;
        else if (t.value === ")") {
            depth--;
            if (depth === 0) { i++; break; }
        }
        body += emitToken(t) + (needsSpace(t, tokens[i + 1]) ? " " : "");
        i++;
    }
    return { body, endIdx: i };
}

function rewriteInner(body: string): string {
    return transpile(body, "inner", true);
}
