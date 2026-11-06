// ecad/scene.ts — the 3D side of the virtual ECAD world.
//
// Turns catalog parts into procedural three.js models (PCB slabs, pin
// headers, chips, USB ports, LED domes, servo bodies, screen glass with a
// live CanvasTexture) and keeps them in sync with EcadSim state every frame:
// LEDs glow, servos rotate, screens repaint, buzzer bodies pulse.
//
// Browser-only (uses document.createElement for screen canvases). All pure
// logic lives in catalog/sim/runtime, which are node-testable.

import * as THREE from "three";
import {
  getPart,
  type BoardPart,
  type DisplayPart,
  type EcadPart,
  type PeripheralPart,
} from "./catalog";
import {
  CharGridBuffer,
  ColorBuffer,
  MonoBuffer,
  SevenSegDriver,
} from "./displays";
import type { EcadSim } from "./sim";

const GOLD = 0xd4af37;
const DARK_CHIP = 0x1a1a1a;

function std(
  color: number | string,
  opts: Partial<THREE.MeshStandardMaterialParameters> = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.65,
    metalness: 0.1,
    ...opts,
  });
}

function box(w: number, h: number, d: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, h), mat); // CAD y-up: (w, depth, h)
  return m;
}

/** Pin header: row of gold pins standing up from the board edge. */
function pinRow(pitch: number, count: number): THREE.Group {
  const g = new THREE.Group();
  const mat = std(GOLD, { metalness: 0.7, roughness: 0.35 });
  for (let i = 0; i < count; i++) {
    const pin = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.4, 0.6), mat);
    pin.position.set(i * pitch, 1.2, 0);
    g.add(pin);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Board builders
// ---------------------------------------------------------------------------

function buildBoard(part: BoardPart): THREE.Group {
  const g = new THREE.Group();
  const { w, h, t } = part.size;
  const pcb = box(w, h, t, std(part.pcbColor));
  pcb.position.y = -t / 2; // origin = top surface
  g.add(pcb);

  // chips
  const chipMat = std(DARK_CHIP, { roughness: 0.4 });
  for (const chip of part.chips) {
    const c = box(chip.w, chip.h, 1.6, chipMat);
    c.position.set(chip.x, 0.8, chip.y);
    g.add(c);
  }

  // USB
  if (part.usb) {
    const usb = box(
      part.usb.w,
      part.usb.h,
      4.5,
      std(0x9a9a9a, { metalness: 0.75, roughness: 0.3 }),
    );
    const edge = part.usb.edge;
    const off = part.size.h / 2 - 3;
    if (edge === "top") usb.position.set(0, 2.2, off);
    else if (edge === "bottom") usb.position.set(0, 2.2, -off);
    else if (edge === "left") usb.position.set(-part.size.w / 2 + 3, 2.2, 0);
    else usb.position.set(part.size.w / 2 - 3, 2.2, 0);
    g.add(usb);
  }

  // headers
  for (const header of part.headers) {
    const row = pinRow(header.pitch, header.pins.length);
    const halfLen = ((header.pins.length - 1) * header.pitch) / 2;
    if (header.edge === "right") {
      row.rotation.y = 0;
      row.position.set(w / 2 - header.pitch / 2 - 1, 0, header.start + halfLen);
    } else if (header.edge === "left") {
      row.rotation.y = 0;
      row.position.set(
        -w / 2 + header.pitch / 2 + 1,
        0,
        header.start + halfLen,
      );
    } else if (header.edge === "top") {
      row.rotation.y = Math.PI / 2;
      row.position.set(header.start + halfLen, 0, h / 2 - header.pitch / 2 - 1);
    } else {
      row.rotation.y = Math.PI / 2;
      row.position.set(
        header.start + halfLen,
        0,
        -h / 2 + header.pitch / 2 + 1,
      );
    }
    g.add(row);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Display builders
// ---------------------------------------------------------------------------

interface ScreenState {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  blit: (boardInst: string) => boolean;
}

function monoBlitter(
  buffer: MonoBuffer,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
): (b: string) => boolean {
  const img = ctx.createImageData(buffer.w, buffer.h);
  return (boardInst: string) => {
    void boardInst;
    if (!buffer.dirty) return false;
    buffer.dirty = false;
    const data = img.data;
    for (let i = 0; i < buffer.w * buffer.h; i++) {
      const on = ((buffer.bits[i >> 3] ?? 0) >> (i & 7)) & 1;
      const v = on ? 255 : 8;
      data[i * 4] = on ? 180 : 8; // OLED blue-ish white
      data[i * 4 + 1] = on ? 200 : 10;
      data[i * 4 + 2] = v;
      data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    texture.needsUpdate = true;
    return true;
  };
}

function colorBlitter(
  buffer: ColorBuffer,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  texture: THREE.CanvasTexture,
): (b: string) => boolean {
  const img = ctx.createImageData(buffer.w, buffer.h);
  return (boardInst: string) => {
    void boardInst;
    if (!buffer.dirty) return false;
    buffer.dirty = false;
    img.data.set(buffer.rgba);
    ctx.putImageData(img, 0, 0);
    texture.needsUpdate = true;
    return true;
  };
}

function lcdBlitter(
  grid: CharGridBuffer,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
): (b: string) => boolean {
  return (boardInst: string) => {
    void boardInst;
    if (!grid.dirty) return false;
    grid.dirty = false;
    ctx.fillStyle = "#0a5c2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#c8ffd4";
    ctx.font = `${Math.floor(canvas.height / (grid.rows * 1.6))}px monospace`;
    ctx.textBaseline = "top";
    for (let r = 0; r < grid.rows; r++)
      ctx.fillText(grid.line(r), 6, 4 + r * (canvas.height / grid.rows));
    texture.needsUpdate = true;
    return true;
  };
}

function sevenSegBlitter(
  seg: SevenSegDriver,
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  texture: THREE.CanvasTexture,
): (b: string) => boolean {
  return (boardInst: string) => {
    void boardInst;
    if (!seg.dirty) return false;
    seg.dirty = false;
    ctx.fillStyle = "#111";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ff3030";
    ctx.font = `bold ${Math.floor(canvas.height * 0.8)}px monospace`;
    ctx.textBaseline = "middle";
    const text = seg.digits.map((d) => d ?? " ").join("");
    ctx.fillText(text, canvas.width * 0.08, canvas.height * 0.55);
    if (seg.showColon)
      (ctx.fillRect(canvas.width * 0.48, canvas.height * 0.25, 4, 4),
        ctx.fillRect(canvas.width * 0.48, canvas.height * 0.65, 4, 4));
    texture.needsUpdate = true;
    return true;
  };
}

function buildDisplay(part: DisplayPart): {
  group: THREE.Group;
  screen: ScreenState;
} {
  const g = new THREE.Group();
  const { w, h, t } = part.size;
  const pcb = box(w, h, t, std(part.pcbColor));
  pcb.position.y = -t / 2;
  g.add(pcb);

  const canvas = document.createElement("canvas");
  canvas.width = Math.min(part.res.w, 256);
  canvas.height = Math.min(part.res.h, 256);
  const ctx = canvas.getContext("2d")!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const screenMat = new THREE.MeshBasicMaterial({ map: texture });
  const glassW = Math.max(part.glass.w, 4);
  const glassH = Math.max(part.glass.h, 3);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(glassW, glassH),
    screenMat,
  );
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(part.glass.x, 0.05, part.glass.y);
  g.add(screen);

  // pin header for the module
  const row = pinRow(2.54, part.pins.length);
  row.rotation.y = Math.PI / 2;
  row.position.set(0, 0, -h / 2 + 2.54);
  g.add(row);

  const blitters: Record<string, (boardInst: string) => boolean> = {};
  return {
    group: g,
    screen: {
      canvas,
      ctx,
      texture,
      blit: (boardInst: string) => {
        const list = blitters[boardInst];
        return list ? list(boardInst) : false;
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Peripheral builders
// ---------------------------------------------------------------------------

interface PeripheralRefs {
  ledMats: THREE.MeshStandardMaterial[];
  servoHorn?: THREE.Object3D;
  buttonCap?: THREE.Object3D;
  buzzerBody?: THREE.Object3D;
}

function buildPeripheral(part: PeripheralPart): {
  group: THREE.Group;
  refs: PeripheralRefs;
} {
  const g = new THREE.Group();
  const refs: PeripheralRefs = { ledMats: [] };
  if (part.kind === "led" || part.kind === "rgbled") {
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(part.color),
      emissive: new THREE.Color(part.kind === "rgbled" ? 0x000000 : part.color),
      emissiveIntensity: 0,
      roughness: 0.3,
    });
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(
        part.size.w / 2,
        16,
        12,
        0,
        Math.PI * 2,
        0,
        Math.PI / 2,
      ),
      mat,
    );
    dome.position.y = 0;
    g.add(dome);
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(part.size.w / 2, part.size.w / 2, 1.5, 16),
      mat,
    );
    base.position.y = 0.7;
    g.add(base);
    const legMat = std(0xaaaaaa, { metalness: 0.6 });
    for (const i of [0, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3, 0.5), legMat);
      leg.position.set(i === 0 ? -1.2 : 1.2, -1.5, 0);
      g.add(leg);
    }
    refs.ledMats.push(mat);
  } else if (part.kind === "buzzer") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        part.size.w / 2,
        part.size.w / 2,
        part.size.t,
        20,
      ),
      std(0x111111),
    );
    body.position.y = part.size.t / 2;
    g.add(body);
    const hole = new THREE.Mesh(
      new THREE.CylinderGeometry(1.5, 1.5, 0.6, 10),
      std(0x000000),
    );
    hole.position.y = part.size.t + 0.1;
    g.add(hole);
    refs.buzzerBody = body;
  } else if (part.kind === "servo") {
    const body = box(
      part.size.w,
      part.size.h,
      part.size.t - 6,
      std(part.color),
    );
    body.position.y = (part.size.t - 6) / 2;
    g.add(body);
    const mount = box(part.size.w + 4, part.size.h + 2, 2.5, std(0x224488));
    mount.position.y = part.size.t - 6 + 1.25;
    g.add(mount);
    const hornGroup = new THREE.Group();
    const horn = box(18, 2.5, 3, std(0xffffff));
    horn.position.set(7, 0, 0);
    hornGroup.add(horn);
    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 4, 12),
      std(0xffffff),
    );
    hornGroup.add(hub);
    hornGroup.position.y = part.size.t + 0.5;
    g.add(hornGroup);
    refs.servoHorn = hornGroup;
  } else if (part.kind === "button") {
    const body = box(part.size.w, part.size.h, part.size.t, std(0x222222));
    body.position.y = part.size.t / 2;
    g.add(body);
    const cap = new THREE.Mesh(
      new THREE.CylinderGeometry(part.size.w / 2.6, part.size.w / 2.6, 2, 14),
      std(part.color),
    );
    cap.position.y = part.size.t + 1;
    g.add(cap);
    refs.buttonCap = cap;
  } else if (part.kind === "pot") {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(
        part.size.w / 2,
        part.size.w / 2,
        part.size.t,
        16,
      ),
      std(0x2a2a2a),
    );
    body.position.y = part.size.t / 2;
    g.add(body);
    const knob = new THREE.Mesh(
      new THREE.CylinderGeometry(part.size.w / 3, part.size.w / 3, 4, 12),
      std(part.color),
    );
    knob.position.y = part.size.t + 2;
    g.add(knob);
    refs.buttonCap = knob; // reuse: rotates with pot value
  }
  return { group: g, refs };
}

// ---------------------------------------------------------------------------
// Layer
// ---------------------------------------------------------------------------

interface PartObject {
  instId: string;
  group: THREE.Group;
  kind: EcadPart["category"];
  screen?: ScreenState;
  refs?: PeripheralRefs;
  ledColor: THREE.Color;
}

export class EcadLayer {
  readonly group = new THREE.Group();
  private objects = new Map<string, PartObject>();
  private highlighted: string | null = null;

  constructor(readonly sim: EcadSim) {
    this.group.name = "scadgen-ecad";
  }

  /** Build the 3D model for a placed instance (called after sim.insert). */
  add(instId: string): THREE.Group | null {
    if (this.objects.has(instId)) return null;
    const inst = this.sim.instances.get(instId);
    const part = this.sim.partOf(instId);
    if (!inst || !part) return null;
    let obj: PartObject;
    if (part.category === "board") {
      obj = {
        instId,
        group: buildBoard(part),
        kind: "board",
        ledColor: new THREE.Color(0xffffff),
      };
    } else if (part.category === "display") {
      const built = buildDisplay(part);
      obj = {
        instId,
        group: built.group,
        kind: "display",
        screen: built.screen,
        ledColor: new THREE.Color(0xffffff),
      };
    } else {
      const built = buildPeripheral(part);
      obj = {
        instId,
        group: built.group,
        kind: "peripheral",
        refs: built.refs,
        ledColor: new THREE.Color(part.color),
      };
    }
    obj.group.position.set(inst.position.x, inst.position.y, inst.position.z);
    obj.group.rotation.y = inst.rotation;
    this.group.add(obj.group);
    this.objects.set(instId, obj);
    return obj.group;
  }

  remove(instId: string): boolean {
    const obj = this.objects.get(instId);
    if (!obj) return false;
    this.group.remove(obj.group);
    obj.screen?.texture.dispose();
    this.objects.delete(instId);
    return true;
  }

  get(instId: string): THREE.Group | undefined {
    return this.objects.get(instId)?.group;
  }

  highlight(instId: string | null): void {
    if (this.highlighted && this.highlighted !== instId) {
      const prev = this.objects.get(this.highlighted);
      prev?.group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.material && !Array.isArray(mesh.material)) {
          const mat = mesh.material as THREE.MeshStandardMaterial;
          if (
            mat.emissive &&
            !this.objects.get(this.highlighted!)?.refs?.ledMats.includes(mat)
          )
            mat.emissiveIntensity = 0;
        }
      });
    }
    this.highlighted = instId;
    if (!instId) return;
    const obj = this.objects.get(instId);
    obj?.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.material && !Array.isArray(mesh.material)) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat.emissive && !obj.refs?.ledMats.includes(mat))
          mat.emissiveIntensity = 0.35;
      }
    });
  }

  selected(): string | null {
    return this.highlighted;
  }

  /**
   * Per-frame sync: LEDs, servos, screens, buzzer pulse. `dtMs` also steps
   * hex-tier emulators (virtual-tier runtimes self-schedule on the clock).
   */
  update(dtMs: number): void {
    this.sim.tick(dtMs);
    for (const [instId, obj] of this.objects) {
      const inst = this.sim.instances.get(instId);
      if (inst) {
        obj.group.position.set(
          inst.position.x,
          inst.position.y,
          inst.position.z,
        );
        obj.group.rotation.y = inst.rotation;
      }
      if (obj.kind === "display") {
        for (const [boardId] of this.sim.instances) {
          const bound = this.sim.displayOf(boardId);
          if (bound && bound.instId === instId && obj.screen)
            obj.screen.blit(boardId);
        }
      } else if (obj.kind === "peripheral" && obj.refs) {
        const part = this.sim.partOf(instId);
        if (!part || part.category !== "peripheral") continue;
        if (part.kind === "led" || part.kind === "rgbled") {
          const level = this.sim.ledLevel(instId);
          for (const mat of obj.refs.ledMats) {
            mat.emissive.copy(obj.ledColor);
            mat.emissiveIntensity = level * 1.6;
            mat.color.copy(obj.ledColor).multiplyScalar(0.35 + 0.65 * level);
          }
        } else if (part.kind === "servo" && obj.refs.servoHorn) {
          obj.refs.servoHorn.rotation.y =
            (-this.sim.servoAngle(instId) * Math.PI) / 180;
        } else if (part.kind === "buzzer" && obj.refs.buzzerBody) {
          const f = this.sim.buzzerTone(instId);
          const t = performance.now();
          const pulse = f ? 1 + 0.06 * Math.sin((t / 1000) * f * 0.05) : 1;
          obj.refs.buzzerBody.scale.setScalar(pulse);
        } else if (part.kind === "button" && obj.refs.buttonCap) {
          obj.refs.buttonCap.position.y =
            part.size.t + (this.isPressed(instId) ? 0.2 : 1);
        }
      }
    }
  }

  private isPressed(instId: string): boolean {
    // a button is "pressed" when its board-side pin reads 0 (pullup pressed)
    for (const w of this.sim.wiresFor(instId)) {
      const boardEnd = w.from.inst === instId ? w.to : w.from;
      const bound = this.sim.displayOf(boardEnd.inst);
      void bound;
      const st = (
        this.sim as unknown as {
          pinState: Map<string, Map<string, { digital: 0 | 1 }>>;
        }
      ).pinState
        .get(boardEnd.inst)
        ?.get(boardEnd.pin);
      if (st && st.digital === 0) return true;
    }
    return false;
  }

  dispose(): void {
    for (const [, obj] of this.objects) {
      obj.screen?.texture.dispose();
      this.group.remove(obj.group);
    }
    this.objects.clear();
  }
}
