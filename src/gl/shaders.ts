/**
 * WebGL2 着色器:实例化管状网格 + 裁剪平面 + Blinn-Phong 光照。
 */

export const VERT_SRC = `#version 300 es
precision highp float;

layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
// 实例属性
layout(location=2) in float iAngle;   // 绕 z 轴旋转角
layout(location=3) in vec3 iColor;
layout(location=4) in float iFlags;   // 0 正常 1 压入(红) 2 悬空(黄)

uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uModel;
uniform bool uUseInstance;
uniform vec3 uNodeColor;

out vec3 vNormal;
out vec3 vWorldPos;
out vec3 vColor;
out float vFlags;

void main() {
  vec3 pos = aPosition;
  vec3 nrm = aNormal;
  vec3 col = uNodeColor;
  float flags = 0.0;
  if (uUseInstance) {
    float c = cos(iAngle), s = sin(iAngle);
    pos = vec3(c*pos.x - s*pos.y, s*pos.x + c*pos.y, pos.z);
    nrm = vec3(c*nrm.x - s*nrm.y, s*nrm.x + c*nrm.y, nrm.z);
    col = iColor;
    flags = iFlags;
  }
  vec4 wp = uModel * vec4(pos, 1.0);
  vWorldPos = wp.xyz;
  vNormal = mat3(uModel) * nrm;
  vColor = col;
  vFlags = flags;
  gl_Position = uProj * uView * wp;
}
`;

export const FRAG_SRC = `#version 300 es
precision highp float;

in vec3 vNormal;
in vec3 vWorldPos;
in vec3 vColor;
in float vFlags;

uniform vec3 uLightDir;
uniform vec3 uEye;
uniform bool uClipEnabled;
uniform float uClipZ;      // 保留 z <= uClipZ
uniform vec3 uBaseColor;

out vec4 fragColor;

void main() {
  if (uClipEnabled && vWorldPos.z > uClipZ) discard;

  vec3 base = vColor;
  if (vFlags > 1.5) base = vec3(1.0, 0.85, 0.1);       // 悬空:黄
  else if (vFlags > 0.5) base = vec3(1.0, 0.15, 0.1);  // 压入:红

  vec3 N = normalize(vNormal);
  vec3 L = normalize(-uLightDir);
  float diff = max(dot(N, L), 0.0);
  vec3 V = normalize(uEye - vWorldPos);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), 32.0) * 0.35;
  float ambient = 0.38;
  vec3 color = base * (ambient + 0.85 * diff) + vec3(spec);
  fragColor = vec4(color, 1.0);
}
`;

export function compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error('shader compile: ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compileShader(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compileShader(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('program link: ' + gl.getProgramInfoLog(prog));
  }
  return prog;
}
