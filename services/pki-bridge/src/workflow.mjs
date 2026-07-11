import { WorkflowTransitionError } from "./errors.mjs";

export const workflowTransitions = Object.freeze({
  received: new Set(["frozen", "cancelled", "failed"]),
  frozen: new Set(["awaiting_signer", "cancelled", "failed"]),
  awaiting_signer: new Set(["signing", "cancelled", "expired"]),
  signing: new Set(["awaiting_signer", "validating", "failed"]),
  validating: new Set(["completed", "failed"]),
  completed: new Set(),
  cancelled: new Set(),
  expired: new Set(),
  failed: new Set(),
});

export function transitionWorkflow(workflow, nextStatus, at = new Date()) {
  const allowed = workflowTransitions[workflow.status];
  if (!allowed?.has(nextStatus)) throw new WorkflowTransitionError(workflow.status, nextStatus);
  return {
    ...workflow,
    status: nextStatus,
    version: (workflow.version || 0) + 1,
    updatedAt: at.toISOString(),
  };
}

export function assertSignerTurn(workflow, signerIndex) {
  if (workflow.status !== "awaiting_signer") throw new WorkflowTransitionError(workflow.status, "signing");
  if (!Number.isInteger(signerIndex) || signerIndex !== workflow.currentSignerIndex) {
    throw new RangeError("signer is out of sequence");
  }
  return true;
}
