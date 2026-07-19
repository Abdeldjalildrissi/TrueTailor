import type { AIProvider, StructuredRequest } from "@/lib/ai/types";

/**
 * Test double for the runtime AI provider (tests only — never shipped).
 * Mirrors real provider behavior by validating its canned output against the
 * request's Zod schema, so pipeline tests exercise the same contract.
 */
export class FakeProvider implements AIProvider {
  readonly name = "anthropic" as const;
  public calls: { system: string; user: string; schemaName: string }[] = [];

  constructor(private readonly respond: (request: { user: string }) => unknown) {}

  async generateStructured<T>(request: StructuredRequest<T>): Promise<T> {
    this.calls.push({ system: request.system, user: request.user, schemaName: request.schemaName });
    const raw = this.respond({ user: request.user });
    return request.schema.parse(raw);
  }
}

/** A provider that always fails, for error-path tests. */
export class FailingProvider implements AIProvider {
  readonly name = "anthropic" as const;

  constructor(private readonly error: Error) {}

  async generateStructured<T>(): Promise<T> {
    throw this.error;
  }
}
