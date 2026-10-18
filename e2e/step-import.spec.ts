function cubeStlBytes(half: number): Uint8Array {
  const v = [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ].map(
    (p3) =>
      [p3[0]! * half, p3[1]! * half, p3[2]! * half] as [number, number, number],
  );
  const faces = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [2, 3, 7],
    [2, 7, 6],
    [1, 5, 6],
    [1, 6, 2],
    [0, 4, 7],
    [0, 7, 3],
  ];
  const buf = new ArrayBuffer(84 + faces.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, faces.length, true);
  let o = 84;
  for (const f of faces) {
    const [a, b, c] = f.map((i) => v[i]!) as [
      [number, number, number],
      [number, number, number],
      [number, number, number],
    ];
    const u: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const w: [number, number, number] = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n: [number, number, number] = [
      u[1] * w[2] - u[2] * w[1],
      u[2] * w[0] - u[0] * w[2],
      u[0] * w[1] - u[1] * w[0],
    ];
    dv.setFloat32(o, n[0], true);
    dv.setFloat32(o + 4, n[1], true);
    dv.setFloat32(o + 8, n[2], true);
    o += 12;
    for (const idx of [a, b, c]) {
      dv.setFloat32(o, idx[0], true);
      dv.setFloat32(o + 4, idx[1], true);
      dv.setFloat32(o + 8, idx[2], true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
    o += 2;
  }
  return new Uint8Array(buf);
}
import { test, expect } from "@playwright/test";
import { loadAppReady } from "./helpers";

test("STL round-trip: insert synthetic cube as history body", async ({
  page,
}) => {
  page.on("console", (m) => console.log("PAGE:", m.text().slice(0, 300)));
  await loadAppReady(page);
  const result = await page.evaluate(
    async (byteArr) => {
      const g = window.__cadDebug?.scadgen;
      if (!g) return { error: "no scadgen hook" } as never;
      g.configureSync();
      const box = g.box(0.04, 0.03, 0.02);
      await g.idle();
      let insertBytes = byteArr;
      let stlFromScene = false;
      let lastExportErr: string | null = null;
      let stepOk: number | null = null;
      let stepErr: string | null = null;
      for (let i = 0; i < 20; i++) {
        const fresh = window.__cadDebug?.scadgen;
        if (fresh && (window.__cadDebug?.getElements().length ?? 0) >= 1) {
          try {
            const b = await fresh.exportSceneStl();
            if (b.length > 84) {
              insertBytes = Array.from(b);
              stlFromScene = true;
              break;
            }
          } catch (err) {
            lastExportErr = err instanceof Error ? err.message : String(err);
            try {
              const sp = await fresh.exportSceneStep();
              stepOk = sp.length;
            } catch (err2) {
              stepErr = err2 instanceof Error ? err2.message : String(err2);
            }
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const inserted = g.insertStl(insertBytes);
      const rep = await g.idle();
      for (let i = 0; i < 60; i++) {
        if ((window.__cadDebug?.getElements().length ?? 0) >= 2) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      const st = g.states();
      return {
        box,
        inserted,
        insertedState: st[inserted]?.featureStatus,
        insertedReport: rep[inserted],
        boxState: st[box]?.featureStatus,
        geom: g.geom(inserted),
        nElements: window.__cadDebug?.getElements().length ?? 0,
        ids: window.__cadDebug?.getElements().map((e) => e.nodeId) ?? [],
        authored: g.authoredIds(),
        stepOk,
        stepErr,
        stlFromScene,
        lastExportErr,
      };
    },
    Array.from(cubeStlBytes(0.01)),
  );
  console.log("IMPORT RESULT:", JSON.stringify(result));
  if ("error" in result) throw new Error((result as { error: string }).error);
  expect(result.boxState).toBe("OK");
  expect(result.insertedState).toBe("OK");
  expect(result.geom?.vertices).toBeGreaterThan(0);
  expect(result.nElements).toBeGreaterThanOrEqual(2);
  expect(result.stlFromScene).toBe(true);
});
