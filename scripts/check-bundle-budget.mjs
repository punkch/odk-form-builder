#!/usr/bin/env node
/**
 * CI gate: keeps the render-blocking JS critical path small and free of the
 * ODK Web Forms preview engine.
 *
 *   pnpm check:bundle          # run against the already-built dist/
 *
 * Parses dist/index.html for the entry `<script type="module" src>` plus
 * every `<link rel="modulepreload">` — the set of JS the browser fetches
 * before first paint/interactivity — resolves each against dist/, and:
 *
 *   1. FAILS if any of those files contains the string "OdkWebForm". The
 *      @getodk/web-forms preview engine is intentionally lazy-loaded (only
 *      needed once a form is opened) and must never end up in the eagerly
 *      preloaded set — that would make first paint wait on a multi-MB engine.
 *   2. FAILS if the summed raw byte size of those files exceeds BUDGET_BYTES.
 *
 * Exits 1 on either failure, 2 on a missing dist/ (run `pnpm build` first).
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const distDir = join(root, 'dist')
const indexHtml = join(distDir, 'index.html')

// Baseline measured from a fresh `pnpm build` on 2026-07-29: 589,998 bytes
// (~576 KB) across the entry script + 16 modulepreload chunks (after the
// Dexie default backend moved to a lazy chunk). Budget is pinned ~15% above
// that, rounded up to a clean number. Raising this is a deliberate act — do
// it in the same PR that grows the render-blocking critical path, with a
// note on what justified the growth.
const BUDGET_BYTES = 680_000

// Component name exported by @getodk/web-forms — survives minification today
// because the library ships prebuilt with its public names intact. If web-forms
// ever renames/mangles it this check goes silently green, leaving only the
// byte budget above as the backstop — re-verify the marker on every web-forms
// version bump (grep the new dist for it).
const MARKER = 'OdkWebForm'

if (!existsSync(indexHtml)) {
  console.error(`✘ ${indexHtml} not found — run pnpm build first`)
  process.exit(2)
}

const html = readFileSync(indexHtml, 'utf8')

/** Extract every `attr="value"` match for a given tag/attr pair, in document order. */
const extractHrefs = (pattern) => {
  const hrefs = []
  let m
  while ((m = pattern.exec(html))) hrefs.push(m[1])
  return hrefs
}

const entryScripts = extractHrefs(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"[^>]*>/g)
const modulePreloads = extractHrefs(/<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"[^>]*>/g)

if (entryScripts.length === 0) {
  console.error('✘ no <script type="module" src> entry found in dist/index.html')
  process.exit(2)
}

// Hrefs are absolute (optionally under a deploy base path, e.g. "/form-forge/
// assets/…") — resolve against dist/ via the "assets/" segment so the check
// works regardless of BASE_PATH.
const resolveAsset = (href) => {
  const path = href.split('/assets/')[1]
  if (!path) {
    console.error(`✘ could not resolve "${href}" to a dist/assets/ file`)
    process.exit(2)
  }
  return join(distDir, 'assets', path)
}

const files = [...new Set([...entryScripts, ...modulePreloads])].map((href) => ({
  href,
  path: resolveAsset(href),
}))

let failures = 0
let total = 0

console.log('Critical-path JS (entry + modulepreload):')
for (const { href, path } of files) {
  const contents = readFileSync(path, 'utf8')
  const size = statSync(path).size
  total += size
  const hasMarker = contents.includes(MARKER)
  if (hasMarker) failures++
  const flag = hasMarker ? `  ✘ contains "${MARKER}"` : ''
  console.log(`  ${String(size).padStart(9)} B  ${href}${flag}`)
}

console.log(`\nTotal: ${total} B vs budget ${BUDGET_BYTES} B`)

if (failures > 0) {
  console.error(`\n✘ ${failures} critical-path file(s) contain "${MARKER}" — the web-forms preview engine must stay lazy-loaded, never render-blocking`)
}

if (total > BUDGET_BYTES) {
  failures++
  console.error(`✘ critical-path JS is ${total - BUDGET_BYTES} B over budget (${total} B > ${BUDGET_BYTES} B)`)
}

if (failures === 0) console.log('\n✔ bundle budget OK')

process.exit(failures === 0 ? 0 : 1)
