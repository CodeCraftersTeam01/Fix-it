# Multi-Error Queue, Fingerprinting & setInterval Flood Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable FixIt to gracefully handle multiple simultaneous errors across different files with a tabbed/carousel HUD, prevent redundant AI calls via error fingerprinting, and throttle runaway `setInterval` / API 404 polling loops.

**Architecture:** 
1. `flood_guard.rs` in Rust tracks rolling hit frequencies and generates SHA256/hash fingerprints per error. It suppresses repeated AI queries when an unhandled error fires in rapid polling loops (>2 calls in 5s) while updating an incremental hit counter.
2. `src-tauri/src/lib.rs` maintains an active errors collection by `file_path`, automatically clearing individual file errors upon `fixit-file-valid` events.
3. The Floating HUD (`FloatingHud.tsx`) renders horizontal pills/tabs when `activeErrors.length > 1`, allowing developers to toggle between broken files, and displays a prominent warning badge if a rapid interval loop is detected.

**Tech Stack:** Rust (Tauri v2, std::collections, std::time), React/TypeScript (Tailwind CSS, Lucide icons, Vitest).

---

## Global Constraints
- Zero AI token waste on identical un-fixed errors or rapid `setInterval` loops.
- Memory safe: prune stale error records older than 60 seconds.
- Multi-error tabs must stay compact, cozy, and within the HUD width constraint (horizontal scroll with smooth pill buttons).
- Adhere to Git identity commit ratio (60% Lanvry / 40% CS-Orion).

## Review Focus
1. Rapid `setInterval(..., 500)` loop: Must only make 1 AI request, throttling subsequent duplicate hits while incrementing `hit_count`.
2. Resolution of 1 of 3 errors: Saving file A must remove file A from tabs while keeping files B and C active in the HUD.
3. Clearing last error: Saving the final remaining broken file must immediately transition the HUD to Standby mode.
4. Error fingerprint stability: Whitespace differences in raw logs must not create duplicate fingerprint entries for the same file and line.
5. Tab switching: Switching tabs must update the `ErrorGuideCard` immediately without re-triggering AI animations.

---

### Task 1: Error Fingerprinting & Flood Guard (`src-tauri/src/flood_guard.rs`)

**Files:**
- Create: `src-tauri/src/flood_guard.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: unit tests in `src-tauri/src/flood_guard.rs`

**Interfaces:**
- Produces:
  ```rust
  #[derive(Debug, Clone, PartialEq)]
  pub enum FloodAction {
      ProcessFresh,
      LoopThrottled { hit_count: u32 },
      CachedOrIgnored,
  }

  pub struct FloodGuard {
      entries: HashMap<String, ErrorHistory>,
  }

  impl FloodGuard {
      pub fn new() -> Self;
      pub fn evaluate(&mut self, file: &str, line: Option<usize>, err_type: &str, msg: &str) -> FloodAction;
      pub fn reset_file(&mut self, file: &str);
  }
  ```

- [ ] **Step 1: Write unit tests for flood evaluation and file reset**
  - Test fresh error returns `ProcessFresh`.
  - Test second occurrence within 5s returns `LoopThrottled` with `hit_count = 2`.
  - Test rapid burst (>5 occurrences) increments hit count without returning `ProcessFresh`.
  - Test `reset_file` clears history so subsequent error returns `ProcessFresh`.

- [ ] **Step 2: Run test to verify it fails**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml flood_guard`
  Expected: FAIL.

- [ ] **Step 3: Implement `flood_guard.rs`**
  Generate fingerprint `hash(file + line + err_type + normalized_msg)`. Track timestamps and counts in a rolling window.

- [ ] **Step 4: Run test to verify it passes**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml flood_guard`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src-tauri/src/flood_guard.rs src-tauri/src/lib.rs
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(runtime): add error fingerprinting and setInterval flood guard"
  ```

---

### Task 2: Multi-Error Registry in Rust Core (`src-tauri/src/lib.rs`)

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Test: unit tests in `src-tauri/src/lib.rs`

**Interfaces:**
- Produces events:
  - `fixit-error-detected`: payload `{ error, explanation, hit_count, is_looping }`
  - `fixit-error-resolved`: payload `{ file_path }`
  - `fixit-errors-sync`: payload `Vec<ActiveErrorItem>`

- [ ] **Step 1: Write unit tests in `lib.rs` for multi-error state management**
  - Adding errors for file A and file B keeps both in registry.
  - Resolving file A leaves file B in registry.
  - Duplicate error updates hit count without re-querying AI client.

- [ ] **Step 2: Implement multi-error registry & integrate `FloodGuard`**
  - Integrate `FloodGuard` into `setup_background_service` and loopback listener.
  - On `fixit-file-valid`: call `flood_guard.reset_file()` and emit `fixit-error-resolved`.

- [ ] **Step 3: Verify cargo test**
  Run: `cargo test --manifest-path src-tauri/Cargo.toml`
  Expected: PASS.

- [ ] **Step 4: Commit**
  ```bash
  git add src-tauri/src/lib.rs
  git -c user.name="Lanvry" -c user.email="wardilanang46@gmail.com" commit --author="Lanvry <wardilanang46@gmail.com>" -m "feat(runtime): integrate multi-error registry and flood guard into Tauri event flow"
  ```

---

### Task 3: Multi-Error Tabs, Navigation & Loop Badge in Floating HUD (`src/`)

**Files:**
- Modify: `src/types.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/FloatingHud.tsx`
- Test: `src/components/__tests__/FloatingHud.test.tsx`

**Interfaces:**
- `ActiveErrorItem`:
  ```typescript
  export interface ActiveErrorItem {
    id: string;
    error: CodeError;
    explanation: FixExplanation;
    hit_count: number;
    is_looping: boolean;
    timestamp: number;
  }
  ```

- [ ] **Step 1: Write failing vitest tests in `FloatingHud.test.tsx`**
  - Test renders multiple tabs when `activeErrors.length > 1`.
  - Test clicking tab switches displayed error.
  - Test renders `Loop/Interval Terdeteksi` badge when `is_looping` is true.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm test -- --run`
  Expected: FAIL.

- [ ] **Step 3: Implement multi-error tabs and loop badge in `FloatingHud.tsx` and `App.tsx`**
  - Manage `activeErrors` array in `App.tsx`.
  - Render cozy horizontal tab bar in `FloatingHud.tsx` with file name and line badge.
  - Display alert pill if `is_looping` with `hit_count` (e.g. `⚡ Loop / setInterval Terdeteksi ({hit_count}x)`).

- [ ] **Step 4: Run test to verify it passes**
  Run: `npm test -- --run`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/types.ts src/App.tsx src/components/FloatingHud.tsx src/components/__tests__/FloatingHud.test.tsx
  git -c user.name="CS-Orion" -c user.email="codingsolver0@gmail.com" commit --author="CS-Orion <codingsolver0@gmail.com>" -m "feat(hud): add multi-error tab navigation and setInterval loop badge"
  ```

---

### Task 4: Release Build, Deployment & Live Verification

- [ ] **Step 1: Run full test suite**
  `cargo test --manifest-path src-tauri/Cargo.toml && npm test -- --run`
- [ ] **Step 2: Build release application bundle**
  `npx tauri build --bundles app`
- [ ] **Step 3: Deploy to `/Applications/FixIt.app` and restart process**
- [ ] **Step 4: Verify with synthetic multi-error loopback request**
- [ ] **Step 5: Push commits to GitHub and update Graphify**

