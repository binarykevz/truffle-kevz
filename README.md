# 🧪 Truffle Agent v2 — KevLang Edition

A fully autonomous, self-modifying Telegram bot written entirely in **KevLang** — a chemistry-themed domain-specific language that transpiles to TypeScript.

> Every molecule of code is a `.kev` recipe. Nothing looks like TypeScript. Everything runs on Bun.

## 🧬 What is KevLang?

KevLang is a custom DSL where programming concepts are expressed through chemistry and food-science terminology.

| Symbol | Kev Name | TypeScript Equivalent |
|--------|----------|----------------------|
| `⚛` | Atom | `const` |
| `⚛ name ← value` | Mutable Atom | `let` |
| `→` | Reaction | `async function` |
| `⇌` | Equilibrium | `if` |
| `⇌⥀` | Cycling | `while` |
| `↯` | Activation Energy | `await` |
| `⟲` | Catalyst | `return` |
| `🔬` | Microscope | `console.log` |
| `🛡️` | Shield | `try` |
| `🩹` | Bandage | `catch` |
| `🔥` | Combustion | `throw` |
| `🧲` | Bond | `import` |
| `⬅` | Absorption | `from` |
| `⚗` | Solution | `const obj = {}` |
| `🧬` | DNA Strand | `const arr = []` |
| `H₂O` | Universal Solvent | `ctx` (Grammy context) |
| `∅` | Void | `null` |
| `#` | Annotation | `//` comment |

## 🚀 Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Turso URLs, Telegram bot token, and owner ID
```

### 3. Synthesize (compile) KevLang → TypeScript

```bash
bun run synthesize
```

This compiles all `src/*.kev` files into `src/generated/*.ts`.

### 4. Run the bot

```bash
bun start
```

Or with PM2 for 24/7 operation:

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

## 🧪 Example: A KevLang Reaction

```kev
# 🧪 A simple molecular recipe
🧲 { Bot } ⬅ "grammy"

→ greet(H₂O) {
    ⚛ name ← H₂O.from.first_name
    🔬 "Catalyzing greeting for " + name
    🛡️ {
        ↯ H₂O.reply("🧪 Welcome to the lab, " + name + "!")
    } 🩹 (e) {
        🔬 "⚠️ Reaction failed: " + e.message
    }
    ⟲ ∅
}

⚛ bot ← new Bot(process.env.BOT_TOKEN)
⚡ /start → greet
↯ bot.start()
```

Transpiles to:

```typescript
// ⚗ SYNTHESIZED from example.kev
import { Bot } from "grammy";

async function greet(ctx) {
    let name = ctx.from.first_name;
    console.log("Catalyzing greeting for " + name);
    try {
        await ctx.reply("🧪 Welcome to the lab, " + name + "!");
    } catch (e) {
        console.log("⚠️ Reaction failed: " + e.message);
    }
    return null;
}

const bot = new Bot(process.env.BOT_TOKEN);
bot.command("/start", greet);
await bot.start();
```

## 📦 Features

- 🎵 **Music playback** via Truffle-Music API with HD thumbnails
- 📄 **File conversion** (PDF, DOCX, images, audio, video, archives)
- 🧠 **ReAct agent** with LLM tool calling
- 🔧 **Self-modifying** — owner can add/edit/delete features via Telegram
- 🍪 **YouTube cookie management** stored in Turso
- 👥 **User & group access control** with Turso persistence
- 💾 **Multi-database architecture** (Main / Commands / Memory)
- ⚡ **LRU caching** for LLM, commands, config, and conversions

## 🛠️ Development

### Adding a new feature in KevLang

Create `src/myfeature.kev`:

```kev
# 🧪 My new molecular feature
🧲 { getConfig } ⬅ "./generated/db"

→ myFeature(input) {
    ⚛ key ← ↯ getConfig("api_key")
    ⇌ !key {
        🔥 new Error("api_key missing")
    }
    ⟲ "Result: " + input
}
```

Then import it from another `.kev` file:

```kev
🧲 { myFeature } ⬅ "./generated/myfeature"
```

### The synthesis pipeline

```
.kev files  →  lexer.ts (tokens)  →  transpiler.ts (TS code)  →  Bun runs .ts
```

The `src/generated/` directory is gitignored — it is regenerated on every build.

## 📜 License

MIT
