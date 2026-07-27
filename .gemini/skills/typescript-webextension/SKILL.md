---
name: typescript-webextension
description: TypeScript language, tooling, and typing practices for Manifest V3 Chrome extensions. Use when writing or reviewing TypeScript, configuring tsconfig/bundlers, typing chrome.* APIs, or structuring typed messages between extension contexts.
---

# TypeScript for Web Extensions (`typescript-webextension`)

Chrome extensions **can and should** be written in TypeScript. Ship **bundled JavaScript** only (MV3 CSP forbids remote/eval code). TypeScript is compile-time; the store/runtime loads the build output.

## Tooling baseline

- `typescript` + `@types/chrome` for `chrome.*` typings.
- Bundler: **Vite**, **esbuild**, or **webpack** with separate entry points for:
  - service worker (background)
  - content script(s)
  - popup / options UI
- `tsconfig.json`: `"strict": true`, `"noImplicitAny": true`, `"skipLibCheck": true`.
- Target modern Chromium (`ES2022` / `"module": "ESNext"`) then let the bundler emit browser-ready chunks.
- Do not point `manifest.json` at `.ts` sources; point at built `.js` under `dist/` (or equivalent).

## Language rules

- No `any`. Prefer `unknown` + narrowing at boundaries (messages, `storage`, DOM).
- Prefer `readonly` / `as const` / discriminated unions for state and message protocols.
- Exhaustive `switch` on union tags (`never` check in default).
- Avoid `enum`; prefer string-literal unions.
- Keep pure domain/parsers free of `chrome` and `Document` types so unit tests run in Node.

## Typing Chrome APIs

```ts
// package: @types/chrome — global chrome namespace
chrome.runtime.sendMessage({ type: "EXTRACT_START" } as const);
```

- Wrap callback APIs in `Promise` helpers when useful; check `chrome.runtime.lastError`.
- Type `chrome.storage` payloads with explicit interfaces; validate on read.

## Cross-context messages

Normative protocol: `docs/reference/extension-messaging-protocol.md`.

Define a single tagged union; validate at every receiver:

```ts
type ExtensionMessage =
  | { type: "EXTRACT_START"; protocolVersion: 1 }
  | { type: "EXTRACT_PROGRESS"; protocolVersion: 1; jobId: string; progress: ExtractProgress }
  | { type: "EXTRACT_SUCCEEDED"; protocolVersion: 1; jobId: string; shopCount: number; collectionCount: number }
  | { type: "EXTRACT_FAILED"; protocolVersion: 1; code: string; message: string; retryStep: "extract" | "import" | "none" };

function isExtensionMessage(value: unknown): value is ExtensionMessage {
  // narrow on typeof / type tag / field shapes — never trust sender
  ...
}
```

## Forbidden

- `eval`, `new Function`, loading remote scripts
- Untyped `sendMessage` / `onMessage` payloads
- Sharing mutable objects across worker / content / popup without cloning/serializing
