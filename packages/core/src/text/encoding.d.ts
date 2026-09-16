/**
 * The WHATWG encoding globals, declared narrowly. `core` compiles against
 * `lib: ["ES2022"]` with no DOM or Node types (invariant 1), which leaves
 * TextEncoder/TextDecoder undeclared even though every host this package
 * runs in — browsers, Web Workers, Node ≥ 11, Capacitor's WebView — has them.
 * These are the only globals `core` is allowed beyond ES2022; keep the
 * surface to what `text/` actually calls.
 */
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean });
  decode(input?: Uint8Array | ArrayBuffer): string;
}
