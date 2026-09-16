"use client";

import React, { useRef, useEffect, useState } from "react";
import { Move, ZoomIn, ZoomOut, Grid, Maximize, RotateCcw } from "lucide-react";

interface FisheyeDewarpCanvasProps {
  videoElement: HTMLVideoElement | null;
  className?: string;
  onClose?: () => void;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 a_position;
  varying vec2 v_uv;
  void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D u_texture;
  uniform vec2 u_resolution;
  uniform float u_yaw;   // -PI to PI
  uniform float u_pitch; // -PI/2 to PI/2
  uniform float u_zoom;  // 1.0 to 4.0
  uniform int u_mode;    // 0: Single PTZ, 1: Quad Split
  varying vec2 v_uv;

  #define PI 3.14159265359

  vec2 dewarp(vec2 uv, float yaw, float pitch, float zoom) {
    // Convert UV to normalized device coords [-1, 1]
    vec2 p = (uv - 0.5) * 2.0;
    p.x *= (u_resolution.x / u_resolution.y);

    // Ray direction in camera space
    vec3 ray = normalize(vec3(p.x, -p.y, zoom));

    // Pitch rotation (around X)
    float cp = cos(pitch);
    float sp = sin(pitch);
    mat3 rotX = mat3(
      1.0, 0.0, 0.0,
      0.0, cp, -sp,
      0.0, sp, cp
    );

    // Yaw rotation (around Y)
    float cy = cos(yaw);
    float sy = sin(yaw);
    mat3 rotY = mat3(
      cy, 0.0, sy,
      0.0, 1.0, 0.0,
      -sy, 0.0, cy
    );

    vec3 dir = rotY * (rotX * ray);

    // Map 3D ray to fisheye circle (equidistant model)
    float r = atan(sqrt(dir.x * dir.x + dir.y * dir.y), dir.z) / (PI * 0.5);
    float phi = atan(dir.y, dir.x);

    vec2 fishUv = vec2(
      0.5 + r * 0.5 * cos(phi),
      0.5 + r * 0.5 * sin(phi)
    );

    return fishUv;
  }

  void main() {
    if (u_mode == 0) {
      // Single Rectilinear PTZ
      vec2 tc = dewarp(v_uv, u_yaw, u_pitch, u_zoom);
      if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
        gl_FragColor = vec4(0.05, 0.05, 0.05, 1.0);
      } else {
        gl_FragColor = texture2D(u_texture, tc);
      }
    } else {
      // Quad Split (4 views: N, E, S, W)
      vec2 qUv = fract(v_uv * 2.0);
      float qYaw = 0.0;
      if (v_uv.x < 0.5 && v_uv.y >= 0.5) qYaw = 0.0;           // Top-Left (North)
      else if (v_uv.x >= 0.5 && v_uv.y >= 0.5) qYaw = PI * 0.5; // Top-Right (East)
      else if (v_uv.x < 0.5 && v_uv.y < 0.5) qYaw = PI;         // Bottom-Left (South)
      else qYaw = -PI * 0.5;                                     // Bottom-Right (West)

      vec2 tc = dewarp(qUv, qYaw, 0.2, 1.8);
      if (tc.x < 0.0 || tc.x > 1.0 || tc.y < 0.0 || tc.y > 1.0) {
        gl_FragColor = vec4(0.08, 0.08, 0.08, 1.0);
      } else {
        gl_FragColor = texture2D(u_texture, tc);
      }
    }
  }
`;

export function FisheyeDewarpCanvas({
  videoElement,
  className = "",
  onClose,
}: FisheyeDewarpCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [yaw, setYaw] = useState(0);
  const [pitch, setPitch] = useState(0);
  const [zoom, setZoom] = useState(1.8);
  const [isQuad, setIsQuad] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoElement) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Compile shaders
    const createShader = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      return shader;
    };

    const vert = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const frag = createShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vert || !frag) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.useProgram(program);

    // Full screen quad
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    // Texture setup
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uRes = gl.getUniformLocation(program, "u_resolution");
    const uYaw = gl.getUniformLocation(program, "u_yaw");
    const uPitch = gl.getUniformLocation(program, "u_pitch");
    const uZoom = gl.getUniformLocation(program, "u_zoom");
    const uMode = gl.getUniformLocation(program, "u_mode");

    let animId: number;

    const render = () => {
      if (videoElement.readyState >= videoElement.HAVE_CURRENT_DATA) {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          videoElement
        );

        gl.uniform2f(uRes, canvas.width, canvas.height);
        gl.uniform1f(uYaw, yaw);
        gl.uniform1f(uPitch, pitch);
        gl.uniform1f(uZoom, zoom);
        gl.uniform1i(uMode, isQuad ? 1 : 0);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
    };
  }, [videoElement, yaw, pitch, zoom, isQuad]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || isQuad) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setYaw((prev) => prev - dx * 0.005);
    setPitch((prev) => Math.max(-1.4, Math.min(1.4, prev + dy * 0.005)));
  };

  const handleMouseUp = () => setIsDragging(false);

  return (
    <div
      className={`relative w-full h-full bg-black overflow-hidden select-none ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <canvas
        ref={canvasRef}
        width={960}
        height={540}
        className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
      />

      {/* Floating Toolbar */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 bg-neutral-900/90 backdrop-blur-md px-2 py-1 rounded-md border border-neutral-700 text-xs text-white">
        <span className="font-semibold text-sky-400 text-[11px] flex items-center gap-1">
          <Move className="w-3 h-3" />
          360° Dewarp
        </span>
        <div className="h-3 w-px bg-neutral-700 mx-1" />
        <button
          onClick={() => setIsQuad((prev) => !prev)}
          className={`px-1.5 py-0.5 rounded text-[11px] font-medium flex items-center gap-1 transition ${
            isQuad ? "bg-sky-600 text-white" : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
          }`}
          title="Toggle Quad-Split View"
        >
          <Grid className="w-3 h-3" />
          {isQuad ? "Quad Split" : "Virtual PTZ"}
        </button>

        {!isQuad && (
          <>
            <button
              onClick={() => setZoom((z) => Math.min(4.0, z + 0.3))}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-300"
              title="Zoom In"
            >
              <ZoomIn className="w-3 h-3" />
            </button>
            <button
              onClick={() => setZoom((z) => Math.max(1.0, z - 0.3))}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-300"
              title="Zoom Out"
            >
              <ZoomOut className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                setYaw(0);
                setPitch(0);
                setZoom(1.8);
              }}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-400 hover:text-white"
              title="Reset View"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </>
        )}

        {onClose && (
          <button
            onClick={onClose}
            className="ml-1 text-neutral-400 hover:text-white px-1 font-bold text-xs"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}
