// Interactive MuJoCo physics for the twin scenes (MuJoCo 3.15 WASM, single-threaded).
// Drag any movable body (furniture, props, doors, drawers) with a spring; sliders set door and drawer joints.
import loadMujoco from './mujoco.js';

const THREE = window.THREE;
let mjPromise = null;
const getMj = () => (mjPromise ||= loadMujoco());
const bundles = {};
const fetchBundle = url => (bundles[url] ||= fetch(url).then(r => { if (!r.ok) throw new Error('scene ' + r.status); return r.json(); }));
const HIDE_ALWAYS = /^ceiling/i;
const OVERHEAD = /^(lighting|ventilation|pendant|daylight|airdiffuser|truss)/i;

export class PhysicsView {
  constructor(box, opts) {
    this.box = box; this.opts = opts; this.alive = true; this.paused = false; this.hideOver = true;
    this.canvas = box.querySelector('canvas'); this.hov = box.querySelector('.twin-hover');
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2)); r.outputEncoding = THREE.sRGBEncoding;
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(40, 1.6, 0.05, 200);
    const c = this.controls = new THREE.OrbitControls(this.camera, this.canvas);
    c.enableDamping = true; c.maxPolarAngle = Math.PI * 0.49;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6b6156, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.75); sun.position.set(4, 10, 6); this.scene.add(sun);
    this.root = new THREE.Group(); this.root.rotation.x = -Math.PI / 2;
    const [cx, cy, fz] = opts.frame; this.root.position.set(-cx, -fz, cy); this.scene.add(this.root);
    this.root.updateMatrixWorld(true);
    opts.setBg && opts.setBg(this.scene);
    // drag visuals
    const accent = new THREE.Color(opts.accent || '#d9481f');
    this.dragLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: accent, depthTest: false }));
    this.dragDot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 12), new THREE.MeshBasicMaterial({ color: accent, depthTest: false }));
    this.dragLine.renderOrder = this.dragDot.renderOrder = 10; this.dragLine.visible = this.dragDot.visible = false;
    this.scene.add(this.dragLine, this.dragDot);
    this.hiMat = new THREE.MeshStandardMaterial({ color: accent.clone().convertSRGBToLinear(), roughness: 0.7, metalness: 0, flatShading: true, emissive: accent.clone().convertSRGBToLinear(), emissiveIntensity: 0.15 });
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(box); this.resize();
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2(); this.pending = null; this.drag = null; this.hoverBody = -1;
    this.onDown = e => this.pointerDown(e); this.onMove = e => this.pointerMove(e); this.onUp = e => this.pointerUp(e);
    this.onLeave = () => { this.pending = null; if (!this.drag) this.setHover(-1); };
    box.addEventListener('pointerdown', this.onDown, true);   // capture: runs before OrbitControls
    window.addEventListener('pointermove', this.onMove); window.addEventListener('pointerup', this.onUp);
    this.canvas.addEventListener('pointerleave', this.onLeave);
    this.loop = this.loop.bind(this); this.raf = requestAnimationFrame(this.loop);
  }
  status(s) { this.opts.onStatus && this.opts.onStatus(s); }
  async load() {
    this.status('Starting the physics engine…');
    const mj = this.mj = await getMj(); if (!this.alive) return;
    this.status('Loading the scene…');
    const B = await fetchBundle(this.opts.bundle); if (!this.alive) return;
    this.status('Building the scene…');
    await new Promise(r => setTimeout(r, 30));
    const vfs = this.vfs = new mj.MjVFS(); const enc = new TextEncoder();
    for (const [k, v] of Object.entries(B.files)) vfs.addBuffer(k, enc.encode(v));
    const m = this.model = mj.MjModel.from_xml_string(B.xml, vfs); this.data = new mj.MjData(m);
    mj.mj_forward(m, this.data);
    this.NEVER = mj.mjtSleepPolicy.mjSLEEP_NEVER.value;
    this.policy0 = Int32Array.from(m.tree_sleep_policy);
    const OB = mj.mjtObj.mjOBJ_BODY.value, OM = mj.mjtObj.mjOBJ_MESH.value, OJ = mj.mjtObj.mjOBJ_JOINT.value;
    this.bodyName = b => mj.mj_id2name(m, OB, b) || 'body ' + b;
    // geometry per mesh, one THREE.Mesh per visual geom
    const geoCache = {}, matCache = {}; this.meshes = [];
    const MV = m.mesh_vert, MF = m.mesh_face, VA = m.mesh_vertadr, VN = m.mesh_vertnum, FA = m.mesh_faceadr, FN = m.mesh_facenum;
    const GG = m.geom_group, GT = m.geom_type, GD = m.geom_dataid, GM = m.geom_matid, GB = m.geom_bodyid, MR = m.mat_rgba, GR = m.geom_rgba;
    for (let g = 0; g < m.ngeom; g++) {
      if (GG[g] !== 2 || GT[g] !== 7) continue;
      const mid = GD[g], mname = mj.mj_id2name(m, OM, mid) || '';
      if (HIDE_ALWAYS.test(mname)) continue;
      let geo = geoCache[mid];
      if (!geo) {
        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(MV.subarray(3 * VA[mid], 3 * (VA[mid] + VN[mid]))), 3));
        geo.setIndex(new THREE.BufferAttribute(Uint32Array.from(MF.subarray(3 * FA[mid], 3 * (FA[mid] + FN[mid]))), 1));
        geo.computeBoundingSphere(); geoCache[mid] = geo;
      }
      const src = GM[g] >= 0 ? MR.subarray(4 * GM[g], 4 * GM[g] + 4) : GR.subarray(4 * g, 4 * g + 4);
      const key = Array.from(src).map(v => v.toFixed(3)).join(',');
      const mat = matCache[key] ||= new THREE.MeshStandardMaterial({ color: new THREE.Color(src[0], src[1], src[2]).convertSRGBToLinear(), roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false;
      mesh.userData = { g, body: GB[g], mat, over: OVERHEAD.test(mname) };
      this.root.add(mesh); this.meshes.push(mesh);
    }
    // articulated joints (hinge = 3, slide = 2)
    this.joints = [];
    for (let j = 0; j < m.njnt; j++) {
      const t = m.jnt_type[j]; if (t !== 2 && t !== 3) continue;
      this.joints.push({ j, name: mj.mj_id2name(m, OJ, j) || 'joint ' + j, hinge: t === 3, adr: m.jnt_qposadr[j], dof: m.jnt_dofadr[j], lo: m.jnt_range[2 * j], hi: m.jnt_range[2 * j + 1], tree: m.body_treeid[m.jnt_bodyid[j]] });
    }
    this.applyVisibility(); this.syncMeshes(); this.frame();
    this.status('ready');
  }
  applyVisibility() { if (this.meshes) for (const o of this.meshes) o.visible = !(this.hideOver && o.userData.over); }
  setHideOver(v) { this.hideOver = v; this.applyVisibility(); }
  frame() {
    const box = new THREE.Box3(); this.scene.updateMatrixWorld(true);
    for (const o of this.meshes) if (o.visible) box.expandByObject(o);
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3()), d = Math.max(s.x, s.z);
    this.controls.target.set(c.x, 0.4, c.z); this.camera.position.set(c.x + d * 0.35, d * 0.95, c.z + d * 0.75); this.controls.update();
  }
  resize() { const w = this.box.clientWidth, h = this.box.clientHeight; if (!w || !h) return; this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
  movable(b) { return b > 0 && this.model.body_weldid[b] !== 0; }
  wake(tree, on) { const p = this.model.tree_sleep_policy; p[tree] = on ? this.NEVER : this.policy0[tree]; }
  // ---------- pointer ----------
  hit(e) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray.intersectObjects(this.meshes.filter(o => o.visible), false)[0] || null;
  }
  toMj(v) { return this.root.worldToLocal(v.clone()); }
  pointerDown(e) {
    if (!this.model || e.button !== 0 || e.target !== this.canvas) return;
    const h = this.hit(e); if (!h) return;
    const b = h.object.userData.body; if (!this.movable(b)) return;
    // root body of the moving part: the body that owns the joint chain up to the weld
    this.controls.enabled = false; e.preventDefault(); e.stopPropagation();
    try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    const d = this.data, pW = this.toMj(h.point);
    const xp = d.xpos, xm = d.xmat, i3 = 3 * b, i9 = 9 * b;
    const rel = [pW.x - xp[i3], pW.y - xp[i3 + 1], pW.z - xp[i3 + 2]];
    const local = [0, 1, 2].map(k => xm[i9 + k] * rel[0] + xm[i9 + 3 + k] * rel[1] + xm[i9 + 6 + k] * rel[2]);
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    const normal = e.shiftKey ? camDir.clone().negate() : new THREE.Vector3(0, 1, 0);
    this.drag = { b, tree: this.model.body_treeid[b], local, plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, h.point), target: pW, prev: null, id: e.pointerId };
    this.wake(this.drag.tree, true); this.setHover(b);
  }
  pointerMove(e) {
    if (this.drag) {
      const r = this.canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(this.ndc, this.camera);
      const p = new THREE.Vector3(); if (this.ray.ray.intersectPlane(this.drag.plane, p)) this.drag.target = this.toMj(p);
      return;
    }
    if (e.target === this.canvas) this.pending = e;
  }
  pointerUp() {
    if (!this.drag) return;
    const b = this.drag.b, x = this.data.xfrc_applied; for (let k = 0; k < 6; k++) x[6 * b + k] = 0;
    this.wake(this.drag.tree, false); this.drag = null; this.controls.enabled = true;
    this.dragLine.visible = this.dragDot.visible = false; this.setHover(-1);
  }
  setHover(b) {
    if (b === this.hoverBody) return;
    for (const o of this.meshes) if (o.userData.body === this.hoverBody) o.material = o.userData.mat;
    this.hoverBody = b;
    if (b >= 0 && this.movable(b)) for (const o of this.meshes) if (o.userData.body === b) o.material = this.hiMat;
  }
  pickHover() {
    if (!this.pending || this.drag) return;
    const h = this.hit(this.pending); this.pending = null;
    if (!h) { this.setHover(-1); this.hov.hidden = true; return; }
    const b = h.object.userData.body, mv = this.movable(b);
    this.setHover(mv ? b : -1);
    this.hov.textContent = mv ? `${this.bodyName(b)} · drag to move · ${(+this.model.body_subtreemass[b]).toFixed(1)} kg` : `${this.bodyName(b) === 'world' ? 'Fixed geometry' : this.bodyName(b)} · fixed`;
    this.hov.hidden = false;
  }
  applyDragForce(dt) {
    const D = this.drag, d = this.data, m = this.model, b = D.b;
    const xp = d.xpos, xm = d.xmat, i3 = 3 * b, i9 = 9 * b, L = D.local;
    const p = [0, 1, 2].map(k => xp[i3 + k] + xm[i9 + 3 * k] * L[0] + xm[i9 + 3 * k + 1] * L[1] + xm[i9 + 3 * k + 2] * L[2]);
    const v = D.prev ? p.map((x, k) => (x - D.prev[k]) / dt) : [0, 0, 0]; D.prev = p;
    const M = Math.max(1, m.body_subtreemass[b]), K = 80, C = 2 * Math.sqrt(K) * 0.9;
    const T = [D.target.x, D.target.y, D.target.z];
    let F = p.map((x, k) => M * (K * (T[k] - x) - C * v[k]));
    const n = Math.hypot(...F), cap = M * 120 + 60; if (n > cap) F = F.map(f => f * cap / n);
    const c = d.xipos, r = [p[0] - c[i3], p[1] - c[i3 + 1], p[2] - c[i3 + 2]];
    const tq = [r[1] * F[2] - r[2] * F[1], r[2] * F[0] - r[0] * F[2], r[0] * F[1] - r[1] * F[0]];
    const x = d.xfrc_applied; for (let k = 0; k < 3; k++) { x[6 * b + k] = F[k]; x[6 * b + 3 + k] = tq[k]; }
    D.p = p;
  }
  // ---------- joints ----------
  jointValue(J) { return this.data.qpos[J.adr]; }
  setJoint(J, v, done) {
    this.wake(J.tree, true);
    this.data.qpos[J.adr] = v; this.data.qvel[J.dof] = 0; this.mj.mj_forward(this.model, this.data);
    if (done) { clearTimeout(J.t); J.t = setTimeout(() => this.wake(J.tree, false), 600); }
  }
  // ---------- run ----------
  setPaused(p) { this.paused = p; this.last = null; }
  reset() {
    if (!this.model) return;
    if (this.drag) this.pointerUp();
    this.mj.mj_resetData(this.model, this.data); this.mj.mj_forward(this.model, this.data);
    this.model.tree_sleep_policy.set(this.policy0);
  }
  syncMeshes() {
    const P = this.data.geom_xpos, R = this.data.geom_xmat;
    for (const o of this.meshes) {
      const g = o.userData.g, i = 3 * g, j = 9 * g;
      o.matrix.set(R[j], R[j + 1], R[j + 2], P[i], R[j + 3], R[j + 4], R[j + 5], P[i + 1], R[j + 6], R[j + 7], R[j + 8], P[i + 2], 0, 0, 0, 1);
      o.matrixWorldNeedsUpdate = true;
    }
  }
  loop(now) {
    if (!this.alive) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.model && !this.paused) {
      const ts = this.model.opt.timestep;
      if (this.last == null) this.last = now;
      let n = Math.min(Math.round((now - this.last) / 1000 / ts), 15);
      if (n > 0) this.last += n * ts * 1000; if (now - this.last > 100) this.last = now;
      for (let k = 0; k < n; k++) { if (this.drag) this.applyDragForce(ts); this.mj.mj_step(this.model, this.data); }
      this.syncMeshes();
    }
    if (this.drag && this.drag.p) {
      const a = this.root.localToWorld(new THREE.Vector3(...this.drag.p)), t = this.root.localToWorld(this.drag.target.clone());
      this.dragLine.geometry.setFromPoints([a, t]); this.dragDot.position.copy(t); this.dragLine.visible = this.dragDot.visible = true;
    }
    this.controls.update(); if (this.model) this.pickHover();
    this.renderer.render(this.scene, this.camera);
    if (this.opts.onFrame && this.model) this.opts.onFrame(this);
  }
  destroy() {
    this.alive = false; cancelAnimationFrame(this.raf); this.ro.disconnect();
    this.box.removeEventListener('pointerdown', this.onDown, true);
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.controls.dispose(); this.renderer.dispose(); this.renderer.forceContextLoss();
    try { this.data && this.data.delete(); this.model && this.model.delete(); this.vfs && this.vfs.delete(); } catch (_) {}
  }
}
