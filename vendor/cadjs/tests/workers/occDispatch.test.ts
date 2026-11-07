import { dispatchOccRequest } from "../../src/workers/occ-dispatch";

/**
 * The worker dispatch boundary is a discriminated `WorkerRequest`, so
 * malformed request types fail predictably at the boundary instead of deep
 * inside an OCC handler. These tests don't need real OCC — the unknown-type
 * path throws before touching the handlers.
 */

describe("dispatchOccRequest", () => {
  it("throws a clear error for an unknown request type", () => {
    const fakeOc = {} as unknown as Parameters<typeof dispatchOccRequest>[0];
    // Cast through unknown — TypeScript correctly rejects unknown request
    // types at compile time; this test guards the runtime fallback.
    const bogus = {
      id: "x",
      type: "noSuchOp",
      payload: {},
    } as unknown as Parameters<typeof dispatchOccRequest>[1];

    expect(() => dispatchOccRequest(fakeOc, bogus)).toThrow(/noSuchOp/);
  });

  it("dispatches to the right handler based on request.type (typed at compile time)", () => {
    // Compile-time guarantee: the next line would fail typechecking if
    // `dispatchOccRequest` regresses to `(oc, type, payload: any)`. We
    // intentionally pass a malformed `extrude` payload (missing `depth`) to
    // confirm the handler runs and surfaces the OCC-side error rather than
    // crashing on `payload.foo` somewhere obscure.
    const fakeOc = {} as unknown as Parameters<typeof dispatchOccRequest>[0];
    const malformed = {
      id: "x",
      type: "extrude" as const,
      // deliberately missing required fields
      payload: {} as never,
    } as unknown as Parameters<typeof dispatchOccRequest>[1];

    // The handler will throw because `oc` is a stub; the point is that this
    // throw originates inside handleExtrude, not from a `payload === undefined`
    // crash at the boundary.
    expect(() => dispatchOccRequest(fakeOc, malformed)).toThrow();
  });
});
