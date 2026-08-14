// `import "server-only"` is a build-time assertion, not runtime behaviour: the
// real package throws unless the bundler resolved it under the "react-server"
// condition, which is how Next.js keeps server modules out of client bundles.
//
// Vitest runs plain Node with no such condition, so every server module we
// import in a unit test would throw on its first line. Next.js itself swaps in
// an empty module on the server; we do the same here (see vitest.config.ts).
//
// This does NOT weaken the guarantee — the boundary is enforced by the Next
// build, and a client component importing a server module still fails there.
export {};
