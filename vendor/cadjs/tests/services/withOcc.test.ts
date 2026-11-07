import { withOcc } from "../../src/services/occ-facade";

/**
 * Every OCC builder allocation must be paired with a `.delete()` even when
 * the body throws. `withOcc` enforces that pattern; this test simulates a
 * throw-path leak across representative builder call sites
 * (`BRepBuilderAPI_Sewing`, `TopTools_ListOfShape_1`).
 */

interface FakeOccObj {
  deleted: boolean;
  delete: () => void;
}

function makeFake(): FakeOccObj {
  const obj: FakeOccObj = {
    deleted: false,
    delete: () => {
      obj.deleted = true;
    },
  };
  return obj;
}

describe("withOcc", () => {
  it("returns body's value on the success path and disposes the object", () => {
    let captured: FakeOccObj | null = null;
    const result = withOcc(
      () => {
        const o = makeFake();
        captured = o;
        return o;
      },
      (o) => {
        expect(o.deleted).toBe(false);
        return 42;
      },
    );

    expect(result).toBe(42);
    expect(captured!.deleted).toBe(true);
  });

  it("disposes the object even when body throws", () => {
    let captured: FakeOccObj | null = null;
    expect(() =>
      withOcc(
        () => {
          const o = makeFake();
          captured = o;
          return o;
        },
        () => {
          throw new Error("body exploded");
        },
      ),
    ).toThrow("body exploded");

    expect(captured!.deleted).toBe(true);
  });

  it("does not call delete twice if body returns normally and finally runs", () => {
    const fake = makeFake();
    let deleteCalls = 0;
    fake.delete = () => {
      deleteCalls++;
      fake.deleted = true;
    };

    withOcc(
      () => fake,
      () => undefined,
    );

    expect(deleteCalls).toBe(1);
  });

  it("nests cleanly: outer object is disposed last (LIFO)", () => {
    const order: string[] = [];
    const outer: FakeOccObj = {
      deleted: false,
      delete: () => {
        order.push("outer");
        outer.deleted = true;
      },
    };
    const inner: FakeOccObj = {
      deleted: false,
      delete: () => {
        order.push("inner");
        inner.deleted = true;
      },
    };

    withOcc(
      () => outer,
      () =>
        withOcc(
          () => inner,
          () => "done",
        ),
    );

    expect(order).toEqual(["inner", "outer"]);
  });

  it("propagates make() throw without leaking (nothing was allocated)", () => {
    let bodyRan = false;
    expect(() =>
      withOcc<FakeOccObj, void>(
        () => {
          throw new Error("make failed");
        },
        () => {
          bodyRan = true;
        },
      ),
    ).toThrow("make failed");

    expect(bodyRan).toBe(false);
  });
});
