import assert from "node:assert/strict";
import test from "node:test";
import { WorkflowTransitionError } from "../src/errors.mjs";
import { assertSignerTurn, transitionWorkflow } from "../src/workflow.mjs";

test("executa a sequência nominal e incrementa versão", () => {
  const at = new Date("2026-07-11T12:00:00Z");
  let workflow = { status: "received", version: 0, currentSignerIndex: 0 };
  for (const status of ["frozen", "awaiting_signer", "signing", "validating", "completed"]) {
    workflow = transitionWorkflow(workflow, status, at);
  }
  assert.equal(workflow.status, "completed");
  assert.equal(workflow.version, 5);
});

test("permite múltiplos signatários somente em ordem", () => {
  const workflow = { status: "awaiting_signer", currentSignerIndex: 1 };
  assert.equal(assertSignerTurn(workflow, 1), true);
  assert.throws(() => assertSignerTurn(workflow, 0), /out of sequence/);
});

test("bloqueia transições terminais ou fora de ordem", () => {
  assert.throws(() => transitionWorkflow({ status: "received" }, "completed"), WorkflowTransitionError);
  assert.throws(() => transitionWorkflow({ status: "completed" }, "signing"), WorkflowTransitionError);
});
