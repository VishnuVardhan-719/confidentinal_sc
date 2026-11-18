import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
function load(file) {
  const source = fs.readFileSync(file, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const sandbox = { exports: {}, crypto: globalThis.crypto };
  vm.runInNewContext(output, sandbox, { filename: file });
  return sandbox.exports;
}
(async () => {
  const base = "C:/Users/Yashwanth/fe2-d/src/modules/clinical/";
  const m = load(base + "draft-machine.ts");
  let s = m.initDraftState({ consultationId: "synthetic", content: {}, version: 1, savedAt: null });
  s = m.draftReducer(s, { type: "edit", content: { assessment: "synthetic" } });
  s = m.draftReducer(s, { type: "save_requested" });
  s = m.draftReducer(s, { type: "save_failed", requestId: 1, code: "forbidden" });
  assert.equal(m.shouldAutosave(s), false);
  s = m.draftReducer(s, { type: "connectivity_changed", online: false });
  s = m.draftReducer(s, { type: "connectivity_changed", online: true });
  assert.equal(m.shouldAutosave(s), true);
  console.log("CONFIRMED: forbidden autosave is re-enabled after reconnect");
  s = m.draftReducer(s, { type: "save_requested" });
  s = m.draftReducer(s, { type: "save_failed", requestId: 2, code: "conflict" });
  const reviewedEditSeq = s.editSeq;
  s = m.draftReducer(s, { type: "edit", content: { assessment: "new synthetic edit" } });
  s = m.draftReducer(s, { type: "conflict_resolved", resolution: "keep_local", reviewedEditSeq, server: { version: 2, savedAt: null, content: {} } });
  assert.equal(s.conflict, null);
  assert.equal(m.shouldAutosave(s), true);
  console.log("CONFIRMED: stale keep_local decision clears conflict and permits autosave");
  const f = load(base + "finalize-flow.ts");
  const record = { status: "final", currentVersion: 2, versions: [{ version: 2, content: { assessment: "different synthetic content" } }], amendments: [{ previousVersion: 1, reason: "correction", reasonText: "synthetic correction" }] };
  const input = { baseVersion: 1, reason: "correction", reasonText: "synthetic correction", content: { assessment: "intended synthetic content" } };
  const result = await f.amendWithRecovery({ amend: async () => ({ ok: false, error: { code: "unavailable" } }), getConsultation: async () => ({ ok: true, data: record }) }, "synthetic", input, "intent");
  assert.equal(result.kind, "signed");
  console.log("CONFIRMED: matching amendment reason accepts different signed content as this intent");
})().catch(e => { console.error(e); process.exitCode = 1; });
