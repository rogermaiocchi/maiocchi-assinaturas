export class PkiConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = "PkiConfigurationError";
  }
}

export class PkiProviderError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "PkiProviderError";
    this.status = status;
    this.code = code;
  }
}

export class WorkflowTransitionError extends Error {
  constructor(from, to) {
    super(`Invalid workflow transition: ${from} -> ${to}`);
    this.name = "WorkflowTransitionError";
  }
}
