/**
 * WebGL2 渲染器:实例化螺旋管 + 普通网格,轨道相机,横切平面。
 */

import { mat4Identity, mat4LookAt, mat4Perspective, Mat4, Vec3 } from '../core/geometry';
import { createProgram, FRAG_SRC, VERT_SRC } from './shaders';
import { TubeMesh } from './helixMesh';

export interface InstanceData {
  /** 绕 z 旋转角 rad */
  angle: number;
  color: [number, number, number];
  /** 0 正常 1 压入 2 悬空 */
  flag: number;
}

export interface InstancedTubeNode {
  kind: 'instanced';
  mesh: TubeMesh;
  instances: InstanceData[];
  /** 平移(如成缆线芯的节圆偏移) */
  offset?: Vec3;
}

export interface MeshNode {
  kind: 'mesh';
  mesh: TubeMesh;
  color: [number, number, number];
  offset?: Vec3;
  doubleSide?: boolean;
}

export type SceneNode = InstancedTubeNode | MeshNode;

interface GpuMesh {
  vao: WebGLVertexArrayObject;
  indexCount: number;
  instanceCount: number;
}

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private nodes: { node: SceneNode; gpu: GpuMesh }[] = [];
  private proj: Mat4 = mat4Identity();
  private view: Mat4 = mat4Identity();

  // 相机
  yaw = 0.6;
  pitch = 0.35;
  distance = 200;
  target: Vec3 = [0, 0, 0];

  clipEnabled = false;
  clipZ = 0;

  private uProj: WebGLUniformLocation;
  private uView: WebGLUniformLocation;
  private uModel: WebGLUniformLocation;
  private uUseInstance: WebGLUniformLocation;
  private uLightDir: WebGLUniformLocation;
  private uEye: WebGLUniformLocation;
  private uClipEnabled: WebGLUniformLocation;
  private uClipZ: WebGLUniformLocation;
  private uNodeColor: WebGLUniformLocation;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true });
    if (!gl) throw new Error('WebGL2 不可用');
    this.gl = gl;
    this.prog = createProgram(gl, VERT_SRC, FRAG_SRC);
    gl.useProgram(this.prog);
    const u = (n: string) => gl.getUniformLocation(this.prog, n)!;
    this.uProj = u('uProj'); this.uView = u('uView'); this.uModel = u('uModel');
    this.uUseInstance = u('uUseInstance'); this.uLightDir = u('uLightDir');
    this.uEye = u('uEye'); this.uClipEnabled = u('uClipEnabled'); this.uClipZ = u('uClipZ');
    this.uNodeColor = u('uNodeColor');
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    this.attachControls();
  }

  setScene(nodes: SceneNode[]): void {
    // 释放旧资源从简(数量小)
    this.nodes = nodes.map((node) => ({ node, gpu: this.upload(node) }));
  }

  private upload(node: SceneNode): GpuMesh {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);

    const mesh = node.mesh;
    const posBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

    const nrmBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, nrmBuf);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

    const idx = gl.createBuffer()!;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idx);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

    let instanceCount = 0;
    if (node.kind === 'instanced') {
      instanceCount = node.instances.length;
      const n = instanceCount;
      const angles = new Float32Array(n);
      const colors = new Float32Array(n * 3);
      const flags = new Float32Array(n);
      node.instances.forEach((inst, i) => {
        angles[i] = inst.angle;
        colors.set(inst.color, i * 3);
        flags[i] = inst.flag;
      });
      const angleBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, angleBuf);
      gl.bufferData(gl.ARRAY_BUFFER, angles, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(2, 1);

      const colorBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, colorBuf);
      gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(3);
      gl.vertexAttribPointer(3, 3, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(3, 1);

      const flagBuf = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, flagBuf);
      gl.bufferData(gl.ARRAY_BUFFER, flags, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(4);
      gl.vertexAttribPointer(4, 1, gl.FLOAT, false, 0, 0);
      gl.vertexAttribDivisor(4, 1);
    }
    gl.bindVertexArray(null);
    return { vao, indexCount: mesh.indices.length, instanceCount };
  }

  resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  render(): void {
    this.resize();
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0.1, 0.11, 0.13, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    this.proj = mat4Perspective((40 * Math.PI) / 180, aspect, 0.5, 10000);
    const eye: Vec3 = [
      this.target[0] + this.distance * Math.cos(this.pitch) * Math.cos(this.yaw),
      this.target[1] + this.distance * Math.cos(this.pitch) * Math.sin(this.yaw),
      this.target[2] + this.distance * Math.sin(this.pitch),
    ];
    this.view = mat4LookAt(eye, this.target, [0, 0, 1]);

    gl.uniformMatrix4fv(this.uProj, false, this.proj);
    gl.uniformMatrix4fv(this.uView, false, this.view);
    gl.uniform3f(this.uLightDir, -0.4, -0.5, -0.75);
    gl.uniform3f(this.uEye, eye[0], eye[1], eye[2]);
    gl.uniform1i(this.uClipEnabled, this.clipEnabled ? 1 : 0);
    gl.uniform1f(this.uClipZ, this.clipZ);

    for (const { node, gpu } of this.nodes) {
      const model = mat4Identity();
      const off = node.offset ?? [0, 0, 0];
      model[12] = off[0]; model[13] = off[1]; model[14] = off[2];
      gl.uniformMatrix4fv(this.uModel, false, model);
      gl.uniform1i(this.uUseInstance, node.kind === 'instanced' ? 1 : 0);
      if (node.kind === 'mesh') gl.uniform3f(this.uNodeColor, node.color[0], node.color[1], node.color[2]);
      if (node.kind === 'mesh' && node.doubleSide) gl.disable(gl.CULL_FACE);
      else gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(gpu.vao);
      if (node.kind === 'instanced') {
        gl.drawElementsInstanced(gl.TRIANGLES, gpu.indexCount, gl.UNSIGNED_INT, 0, gpu.instanceCount);
      } else {
        gl.drawElements(gl.TRIANGLES, gpu.indexCount, gl.UNSIGNED_INT, 0);
      }
    }
    gl.bindVertexArray(null);
  }

  private attachControls(): void {
    let dragging = false;
    let lastX = 0, lastY = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      this.yaw += dx * 0.008;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch + dy * 0.008));
      this.render();
    });
    this.canvas.addEventListener('pointerup', () => (dragging = false));
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.distance *= e.deltaY > 0 ? 1.1 : 0.9;
      this.distance = Math.max(5, Math.min(5000, this.distance));
      this.render();
    }, { passive: false });
  }
}
