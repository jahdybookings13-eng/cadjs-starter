// Headless WebXR fake. Loaded via page.addInitScript BEFORE any app script runs.
// It satisfies exactly the surface three.js r174 WebXRManager +
// src/components/vr/useVRSession.ts touch. The fake XRWebGLLayer owns a real
// FBO in the app's WebGL2 context and blits it to the canvas after every XR
// frame, so the visible <canvas> shows what the headset would show and
// Playwright screenshots are the in-VR view (right eye drawn last).
(() => {
  if (window.__VRFK_INSTALLED) return;
  window.__VRFK_INSTALLED = true;

  // ---- make gl.makeXRCompatible() always succeed ----
  for (const P of [
    window.WebGL2RenderingContext && window.WebGL2RenderingContext.prototype,
    window.WebGLRenderingContext && window.WebGLRenderingContext.prototype,
  ]) {
    if (P)
      P.makeXRCompatible = function () {
        return Promise.resolve();
      };
  }

  // ---- linear algebra (column-major Float32Array 4x4) ----
  const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
  const qconj = (q) => [-q[0], -q[1], -q[2], q[3]];
  const qnorm = (q) => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  const qFromEulerXYZ = ([x, y, z]) => {
    const c = (a) => Math.cos(a / 2),
      s = (a) => Math.sin(a / 2);
    return qnorm(
      qmul(qmul([s(x), 0, 0, c(x)], [0, s(y), 0, c(y)]), [0, 0, s(z), c(z)]),
    );
  };
  const TR = (p, q) => {
    const [x, y, z, w] = q;
    const x2 = x + x,
      y2 = y + y,
      z2 = z + z;
    const xx = x * x2,
      xy = x * y2,
      xz = x * z2;
    const yy = y * y2,
      yz = y * z2,
      zz = z * z2;
    const wx = w * x2,
      wy = w * y2,
      wz = w * z2;
    return new Float32Array([
      1 - (yy + zz),
      xy + wz,
      xz - wy,
      0,
      xy - wz,
      1 - (xx + zz),
      yz + wx,
      0,
      xz + wy,
      yz - wx,
      1 - (xx + yy),
      0,
      p[0],
      p[1],
      p[2],
      1,
    ]);
  };
  const m4mul = (a, b) => {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        o[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
    return o;
  };
  const m4rigidInv = (m) => {
    const tx = m[12],
      ty = m[13],
      tz = m[14];
    return new Float32Array([
      m[0],
      m[4],
      m[8],
      0,
      m[1],
      m[5],
      m[9],
      0,
      m[2],
      m[6],
      m[10],
      0,
      -(m[0] * tx + m[1] * ty + m[2] * tz),
      -(m[4] * tx + m[5] * ty + m[6] * tz),
      -(m[8] * tx + m[9] * ty + m[10] * tz),
      1,
    ]);
  };
  const m4ToPQ = (m) => {
    const m00 = m[0],
      m10 = m[1],
      m20 = m[2];
    const m01 = m[4],
      m11 = m[5],
      m21 = m[6];
    const m02 = m[8],
      m12 = m[9],
      m22 = m[10];
    const tr = m00 + m11 + m22;
    let q;
    if (tr > 0) {
      const s = Math.sqrt(tr + 1) * 2;
      q = [(m21 - m12) / s, (m02 - m20) / s, (m10 - m01) / s, 0.25 * s];
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      q = [0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s];
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      q = [(m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s];
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      q = [(m02 + m20) / s, (m12 + m21) / s, (m21 - m12) / s, 0.25 * s];
    }
    return { position: [m[12], m[13], m[14]], quaternion: qnorm(q) };
  };
  const mat4Perspective = (fovY, aspect, near, far) => {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (far + near) * nf,
      -1,
      0,
      0,
      2 * far * near * nf,
      0,
    ]);
  };
  const D2R = Math.PI / 180;

  // ---- force three's XRWebGLLayer path (Chromium ships a native XRWebGLBinding) ----
  try {
    Object.defineProperty(window, "XRWebGLBinding", {
      value: function XRWebGLBindingStub() {},
      configurable: true,
    });
  } catch (e) {
    console.warn("VRFK: could not stub XRWebGLBinding", e);
  }

  // ---- WebXR classes ----
  class XRSpace {
    constructor(id) {
      this.__id = id;
    }
  }
  class XRRigidTransform {
    constructor(position = {}, orientation = {}) {
      this.position = {
        x: position.x || 0,
        y: position.y || 0,
        z: position.z || 0,
        w: position.w ?? 1,
      };
      this.orientation = {
        x: orientation.x || 0,
        y: orientation.y || 0,
        z: orientation.z || 0,
        w: orientation.w ?? 1,
      };
      this.__pq = {
        position: [this.position.x, this.position.y, this.position.z],
        quaternion: [
          this.orientation.x,
          this.orientation.y,
          this.orientation.z,
          this.orientation.w,
        ],
      };
    }
    get matrix() {
      return TR(this.__pq.position, this.__pq.quaternion);
    }
    get inverse() {
      const q = qconj(this.__pq.quaternion);
      const R = TR([0, 0, 0], this.__pq.quaternion);
      const p = m4rigidInv(R);
      return new XRRigidTransform(
        { x: p[12], y: p[13], z: p[14] },
        { x: q[0], y: q[1], z: q[2], w: q[3] },
      );
    }
  }
  class XRPose {
    constructor(pq) {
      this.transform = new XRRigidTransform(
        { x: pq.position[0], y: pq.position[1], z: pq.position[2] },
        {
          x: pq.quaternion[0],
          y: pq.quaternion[1],
          z: pq.quaternion[2],
          w: pq.quaternion[3],
        },
      );
      this.emulatedPosition = true;
    }
  }
  const makeButton = () => ({ pressed: false, touched: false, value: 0 });
  const makeHand = (side) => ({
    side,
    ray: {
      position: [side === "left" ? -0.35 : 0.35, 1.15, -0.1],
      quaternion: [0, 0, 0, 1],
    },
    grip: {
      position: [side === "left" ? -0.35 : 0.35, 1.05, 0.05],
      quaternion: [0, 0, 0, 1],
    },
    buttons: [makeButton(), makeButton(), makeButton(), makeButton()],
    axes: [0, 0, 0, 0],
    targetRaySpace: new XRSpace(side + "-ray"),
    gripSpace: new XRSpace(side + "-grip"),
  });

  const V = {
    head: { position: [0, 1.6, 2.4], quaternion: [0, 0, 0, 1] },
    hands: { left: makeHand("left"), right: makeHand("right") },
    ipd: 0.064,
  };

  const SPACE_POSE = new Map([
    [V.head, () => V.head],
    [V.hands.left.targetRaySpace, () => V.hands.left.ray],
    [V.hands.left.gripSpace, () => V.hands.left.grip],
    [V.hands.right.targetRaySpace, () => V.hands.right.ray],
    [V.hands.right.gripSpace, () => V.hands.right.grip],
  ]);

  class XRInputSource {
    constructor(side) {
      const h = V.hands[side];
      this.handedness = side;
      this.targetRayMode = "tracked-pointer";
      this.targetRaySpace = h.targetRaySpace;
      this.gripSpace = h.gripSpace;
      this.gamepad = {
        connected: true,
        mapping: "standardxr",
        buttons: h.buttons,
        axes: h.axes,
        timestamp: 0,
      };
    }
  }

  class XRWebGLLayer {
    constructor(session, gl, init) {
      this.antialias = !!init.antialias;
      this.ignoreDepthValues = false;
      this.fixedFoveation = 0;
      const cv = gl.canvas;
      const w = Math.max(640, Math.floor(cv.clientWidth || 1280));
      const h = Math.max(480, Math.floor(cv.clientHeight || 720));
      this.framebufferWidth = w;
      this.framebufferHeight = h;
      this.__gl = gl;
      this.__fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.__fb);
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA8,
        w,
        h,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        null,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_2D,
        tex,
        0,
      );
      const rb = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, w, h);
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        gl.DEPTH_STENCIL_ATTACHMENT,
        gl.RENDERBUFFER,
        rb,
      );
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      this.framebuffer = this.__fb;
      this.session = session;
    }
    getViewport(view) {
      void view;
      return {
        x: 0,
        y: 0,
        width: this.framebufferWidth,
        height: this.framebufferHeight,
        scale: 1.0,
      };
    }
    __present() {
      const gl = this.__gl,
        W = this.framebufferWidth,
        H = this.framebufferHeight;
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.__fb);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
      gl.blitFramebuffer(
        0,
        0,
        W,
        H,
        0,
        0,
        W,
        H,
        gl.COLOR_BUFFER_BIT,
        gl.NEAREST,
      );
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    }
    destroy() {
      this.__gl.deleteFramebuffer(this.__fb);
    }
  }

  class XRSession {
    constructor(mode, options) {
      this.mode = mode;
      this.environmentBlendMode = "opaque";
      this.visibilityState = "visible";
      this.enabledFeatures = [
        ...((options && options.requiredFeatures) || []),
        ...((options && options.optionalFeatures) || []),
      ];
      this.depthUsage = "local";
      this.renderState = {
        baseLayer: null,
        layers: null,
        depthNear: 0.01,
        depthFar: 1000,
      };
      this.inputSources = [
        new XRInputSource("left"),
        new XRInputSource("right"),
      ];
      this.__listeners = new Map();
      this.__rafs = new Map();
      this.__rafId = 1;
      this.ended = false;
      this.__refSpaces = new Map();
    }
    addEventListener(type, fn) {
      if (!this.__listeners.has(type)) this.__listeners.set(type, new Set());
      this.__listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      (this.__listeners.get(type) || new Set()).delete(fn);
    }
    dispatchEvent(evt) {
      evt.session = this;
      evt.target = this;
      evt.type &&
        (this.__listeners.get(evt.type) || new Set()).forEach((fn) => {
          try {
            fn(evt);
          } catch (e) {
            setTimeout(() => {
              throw e;
            }, 0);
          }
        });
    }
    updateRenderState(partial) {
      Object.assign(this.renderState, partial);
      return Promise.resolve();
    }
    requestReferenceSpace(type) {
      const space = new XRSpace("ref-" + type);
      space.__pq = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };
      SPACE_POSE.set(space, () => space.__pq);
      this.__refSpaces.set(type, space);
      return Promise.resolve(space);
    }
    requestAnimationFrame(cb) {
      if (this.ended) return 0;
      const id = this.__rafId++;
      const handle = requestAnimationFrame((t) => {
        this.__rafs.delete(id);
        if (this.ended) return;
        const frame = new XRFrame(this, t);
        cb(t, frame);
        if (
          this.renderState.baseLayer &&
          this.renderState.baseLayer.__present
        ) {
          this.renderState.baseLayer.__present();
        }
      });
      this.__rafs.set(id, handle);
      return id;
    }
    cancelAnimationFrame(id) {
      const h = this.__rafs.get(id);
      if (h !== undefined) cancelAnimationFrame(h);
      this.__rafs.delete(id);
    }
    end() {
      if (this.ended) return Promise.resolve();
      this.ended = true;
      for (const [id] of this.__rafs) this.cancelAnimationFrame(id);
      if (this.renderState.baseLayer && this.renderState.baseLayer.destroy) {
        this.renderState.baseLayer.destroy();
      }
      this.dispatchEvent({ type: "end" });
      return Promise.resolve();
    }
  }
  window.XRSession = XRSession;
  window.XRWebGLLayer = XRWebGLLayer;
  window.XRSpace = XRSpace;
  window.XRRigidTransform = XRRigidTransform;
  window.XRPose = XRPose;

  class XRFrame {
    constructor(session, time) {
      this.session = session;
      this.predictedDisplayTime = time;
    }
    __pose(space, ref) {
      const g = SPACE_POSE.get(space);
      const rg = SPACE_POSE.get(ref);
      if (!g || !rg) return null;
      const m = m4mul(
        m4rigidInv(TR(rg().position, rg().quaternion)),
        TR(g().position, g().quaternion),
      );
      return new XRPose(m4ToPQ(m));
    }
    getPose(space, baseSpace) {
      return this.__pose(space, baseSpace);
    }
    getViewerPose(ref) {
      const head = this.__pose(V.head, ref);
      const eyeBase = head.transform.__pq;
      const views = ["left", "right"].map((eye) => {
        const dx = (eye === "left" ? -1 : 1) * (V.ipd / 2);
        const p = m4mul(
          TR(eyeBase.position, eyeBase.quaternion),
          TR([dx, 0, 0], [0, 0, 0, 1]),
        );
        const pq = m4ToPQ(p);
        const cv =
          ref && ref.__canvas ? ref.__canvas : document.querySelector("canvas");
        const w = (cv && cv.width) || 1280;
        const h = (cv && cv.height) || 720;
        return {
          eye,
          transform: new XRRigidTransform(
            { x: pq.position[0], y: pq.position[1], z: pq.position[2] },
            {
              x: pq.quaternion[0],
              y: pq.quaternion[1],
              z: pq.quaternion[2],
              w: pq.quaternion[3],
            },
          ),
          projectionMatrix: mat4Perspective(90 * D2R, w / h, 0.01, 300),
          requestViewport: null,
          viewport: { x: 0, y: 0, width: w / 2, height: h },
        };
      });
      return { views, transform: head.transform, emulatedPosition: true };
    }
  }

  // ---- navigator.xr ----
  let current = null;
  const xr = {
    isSessionSupported: (mode) => Promise.resolve(mode === "immersive-vr"),
    requestSession: (mode, options) => {
      current = new XRSession(mode, options);
      const s = current;
      setTimeout(() => {
        s.dispatchEvent({
          type: "inputsourceschange",
          added: s.inputSources,
          removed: [],
        });
      }, 0);
      return Promise.resolve(s);
    },
    addEventListener() {},
    removeEventListener() {},
    __current: () => current,
  };
  Object.defineProperty(window.navigator, "xr", {
    configurable: true,
    get: () => xr,
  });

  // ---- pose helpers for the control API ----
  const setPose = (obj, o) => {
    if (o.position) obj.position = o.position.slice();
    if (o.quaternion) obj.quaternion = qnorm(o.quaternion.slice());
    else if (o.euler) obj.quaternion = qFromEulerXYZ(o.euler);
    else if (o.eulerDeg)
      obj.quaternion = qFromEulerXYZ(o.eulerDeg.map((d) => d * D2R));
  };
  const qFromLookDir = (pos, target) => {
    const d = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
    const l = Math.hypot(...d) || 1;
    d[0] /= l;
    d[1] /= l;
    d[2] /= l;
    const z = [-d[0], -d[1], -d[2]];
    let up = [0, 1, 0];
    if (Math.abs(z[1]) > 0.99) up = [0, 0, -1];
    const cr = (a, b) => [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
    let x = cr(up, z);
    const xl = Math.hypot(...x) || 1;
    x = x.map((v) => v / xl);
    const y = cr(z, x);
    const m = [
      x[0],
      x[1],
      x[2],
      0,
      y[0],
      y[1],
      y[2],
      0,
      z[0],
      z[1],
      z[2],
      0,
      0,
      0,
      0,
      1,
    ];
    return m4ToPQ(m).quaternion;
  };

  // ---- control API ----

  window.__vr = {
    sessionActive: () => !!current && !current.ended,
    frame: (n = 1) =>
      new Promise((res) => {
        let k = n;
        const t = () => ((k -= 1) <= 0 ? res() : requestAnimationFrame(t));
        requestAnimationFrame(t);
      }),
    setHead(o) {
      setPose(V.head, o);
      return this;
    },
    lookDown(pitchDeg = -55) {
      V.head.quaternion = qFromEulerXYZ([pitchDeg * D2R, V.headYawRad || 0, 0]);
      return this;
    },
    lookUp(pitchDeg = 8) {
      V.head.quaternion = qFromEulerXYZ([pitchDeg * D2R, V.headYawRad || 0, 0]);
      return this;
    },
    lookYaw(yawDeg = 0) {
      V.head.quaternion = qFromEulerXYZ([0, yawDeg * D2R, 0]);
      return this;
    },
    setHand(side, o = {}) {
      const h = V.hands[side];
      if (o.ray) setPose(h.ray, o.ray);
      if (o.grip) setPose(h.grip, o.grip);
      if (o.position) {
        setPose(h.ray, {
          position: o.position,
          quaternion:
            o.quaternion ||
            (o.euler && qFromEulerXYZ(o.euler)) ||
            (o.eulerDeg && qFromEulerXYZ(o.eulerDeg.map((d) => d * D2R))),
        });
      }
      return this;
    },
    pointAt(side, target, origin) {
      const h = V.hands[side];
      const pos = origin || h.ray.position;
      h.ray.position = pos.slice();
      h.ray.quaternion = qFromLookDir(pos, target);
      h.grip.position = [pos[0], pos[1] - 0.1, pos[2] + 0.15];
      h.grip.quaternion = h.ray.quaternion.slice();
      return this;
    },
    press(side, button, pressed = true, value) {
      const b = V.hands[side].buttons[button];
      b.pressed = pressed;
      b.value = value ?? (pressed ? 1 : 0);
      b.touched = true;
      return this;
    },
    axes(side, values) {
      V.hands[side].axes = values.slice(0, 4);
      return this;
    },
    reset() {
      V.head.position = [0, 1.6, 2.4];
      V.head.quaternion = [0, 0, 0, 1];
      for (const side of ["left", "right"]) {
        const h = V.hands[side];
        h.ray = {
          position: [side === "left" ? -0.35 : 0.35, 1.15, -0.1],
          quaternion: [0, 0, 0, 1],
        };
        h.grip = {
          position: [side === "left" ? -0.35 : 0.35, 1.05, 0.05],
          quaternion: [0, 0, 0, 1],
        };
        for (const b of h.buttons) Object.assign(b, makeButton());
        h.axes.splice(0, 4, 0, 0, 0, 0);
      }
      return this;
    },
    endSession: () => (current ? current.end() : Promise.resolve()),
    enableDebug: () => {
      window.__cadjs?.configureCadjs({ debug: true });
      return !!window.__cadjs;
    },
    // Belt hover (buildVRControls/useVRSession): left-hand grip sits near the
    // ring at segment i's angle; selection = L3 (buttons[2]/[3]).
    beltSeg(i, total = 8, radius = 0.2, y = 0.86) {
      const a = (i / total) * Math.PI * 2;
      const p = [
        V.head.position[0] + Math.cos(a) * radius,
        y,
        V.head.position[2] - Math.sin(a) * radius,
      ];
      const h = V.hands.left;
      h.grip.position = p;
      h.grip.quaternion = [0, 0, 0, 1];
      h.ray.position = [p[0], p[1] + 0.15, p[2]];
      h.ray.quaternion = [0, 0, 0, 1];
      return p;
    },
    mode: () => window.__cadDebug?.getMode?.() ?? null,
    selection: () => {
      const base = window.__cadDebug?.getSelectionContext?.() ?? {
        kind: "none",
        ids: [],
        position: null,
      };
      const sub = window.__vrMechanics?.subSelection?.();
      if (sub)
        return {
          ...base,
          kind: sub.kind,
          ids: [sub.id],
          position: sub.position,
          normal: sub.normal ?? null,
        };
      return base;
    },
    subSelection: () => window.__vrMechanics?.subSelection?.() ?? null,
    debugRaycast: () => window.__vrMechanics?.debugRaycast?.() ?? null,
    hoverBeam: () => window.__vrMechanics?.hoverBeam?.() ?? null,
    selectBeam: () => window.__vrMechanics?.selectBeam?.() ?? null,
    spawnBox: (size = 0.12) =>
      window.__cadDebug?.scadgen?.box?.(size, size, size) ?? null,
    selectFirst: () => {
      const els = window.__cadDebug?.getElements?.() ?? [];
      if (!els[0])
        return {
          kind: "none",
          ids: [],
          position: null,
          reason: "no elements",
        };
      window.__cadDebug?.selectElement?.(els[0].nodeId);
      return (
        window.__cadDebug?.getSelectionContext?.() ?? {
          kind: "body",
          ids: [els[0].nodeId],
          position: els[0].position ?? null,
        }
      );
    },
    triad: () => window.__vrMechanics?.state?.() ?? null,
    spawnFree: (position = [0, 1.5, 1.8], plane = "XY") =>
      window.__vrMechanics?.spawnFree?.(position, plane) ?? null,
    spawnTriad: (position = [0, 1.5, 1.8], plane = "XY") =>
      window.__vrMechanics?.spawnTriad?.(position, plane) ?? null,
    spawnDesk: () => window.__vrMechanics?.spawnDesk?.() ?? null,
    attachToFace: (point = [0, 0, 0], normal = [0, 0, 1], plane = "XY") =>
      window.__vrMechanics?.attachToFace?.(point, normal, plane) ?? null,
    moveTriad: (position = [0, 1.5, 1.8]) =>
      window.__vrMechanics?.move?.(position) ?? null,
    rotateTriad: (orientation = [0, 0, 0, 1]) =>
      window.__vrMechanics?.rotate?.(orientation) ?? null,
    selectPlane: (plane = "XY") =>
      window.__vrMechanics?.selectPlane?.(plane) ?? null,
    clearTriad: () => window.__vrMechanics?.clear?.() ?? null,
    beamState: () => window.__vrMechanics?.beamState?.() ?? null,
    setBeamDistance: (distance = 1) =>
      window.__vrMechanics?.setBeamDistance?.(distance) ?? null,
    elements: () => window.__cadDebug?.getElements?.()?.length ?? 0,
    info() {
      const layer = current && current.renderState.baseLayer;
      return {
        active: !!current && !current.ended,
        fb: layer ? [layer.framebufferWidth, layer.framebufferHeight] : null,
        canvas: (() => {
          const c = document.querySelector("canvas");
          return c ? [c.width, c.height] : null;
        })(),
        head: JSON.parse(JSON.stringify(V.head)),
        hands: JSON.parse(JSON.stringify(V.hands)),
      };
    },
  };
})();
