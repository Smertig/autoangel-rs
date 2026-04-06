// --- DDS constants ---

const DDS_MAGIC = 0x20534444; // "DDS "
const DDPF_FOURCC = 0x4;
const DDPF_RGB = 0x40;
const DDPF_ALPHAPIXELS = 0x1;
const FOURCC_DXT1 = 0x31545844;
const FOURCC_DXT3 = 0x33545844;
const FOURCC_DXT5 = 0x35545844;

const DDS_HEADER_SIZE = 128;

// --- DDS parser ---

/**
 * Parse a DDS file header and return format info + a view into the raw data.
 * @param {Uint8Array} buf - The full DDS file bytes
 * @returns {{ width: number, height: number, format: string|null, blockSize: number, data: Uint8Array }}
 */
export function parseDDS(buf) {
  if (buf.byteLength < DDS_HEADER_SIZE) {
    throw new Error('DDS file too small for header');
  }

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const magic = view.getUint32(0, true);
  if (magic !== DDS_MAGIC) {
    throw new Error(`Not a DDS file (magic: 0x${magic.toString(16)})`);
  }

  const height = view.getUint32(12, true);
  const width = view.getUint32(16, true);
  const pfFlags = view.getUint32(80, true);
  const fourCC = view.getUint32(84, true);

  const data = new Uint8Array(buf.buffer, buf.byteOffset + DDS_HEADER_SIZE, buf.byteLength - DDS_HEADER_SIZE);

  // Compressed formats (BC1/BC2/BC3)
  if (pfFlags & DDPF_FOURCC) {
    let format = null;
    let blockSize = 0;

    switch (fourCC) {
      case FOURCC_DXT1:
        format = 'dxt1';
        blockSize = 8;
        break;
      case FOURCC_DXT3:
        format = 'dxt3';
        blockSize = 16;
        break;
      case FOURCC_DXT5:
        format = 'dxt5';
        blockSize = 16;
        break;
    }

    return { width, height, format, blockSize, data };
  }

  // Uncompressed RGB/RGBA formats
  if (pfFlags & DDPF_RGB) {
    const rgbBitCount = view.getUint32(88, true);
    const rMask = view.getUint32(92, true);

    let format = null;
    let blockSize = 0;

    if (rgbBitCount === 32 && rMask === 0x00FF0000) {
      format = 'bgra';
      blockSize = 4;
    } else if (rgbBitCount === 32 && rMask === 0x000000FF) {
      format = 'rgba';
      blockSize = 4;
    } else if (rgbBitCount === 24 && rMask === 0x00FF0000) {
      format = 'bgr';
      blockSize = 3;
    }

    return { width, height, format, blockSize, data };
  }

  // Unknown / unsupported
  return { width, height, format: null, blockSize: 0, data };
}

// --- TextureRenderer (WebGL2 + S3TC) ---

const VERT_SRC = `#version 300 es
const vec2 QUAD[4] = vec2[4](
  vec2(-1, -1), vec2(1, -1), vec2(-1, 1), vec2(1, 1)
);
out vec2 vUV;
void main() {
  vec2 p = QUAD[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  vUV = p * 0.5 + 0.5;
  vUV.y = 1.0 - vUV.y;
}`;

const FRAG_SRC = `#version 300 es
precision mediump float;
in vec2 vUV;
uniform sampler2D uTex;
out vec4 color;
void main() {
  color = texture(uTex, vUV);
}`;

export class TextureRenderer {
  /**
   * Create a TextureRenderer on the given canvas.
   * Returns null if WebGL2 or the S3TC extension is unavailable.
   * @param {HTMLCanvasElement} canvas
   * @returns {TextureRenderer|null}
   */
  static create(canvas) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) return null;

    const s3tc = gl.getExtension('WEBGL_compressed_texture_s3tc');
    if (!s3tc) return null;

    return new TextureRenderer(gl, s3tc);
  }

  /** @private */
  constructor(gl, s3tc) {
    this.gl = gl;
    this.s3tc = s3tc;

    // Compile shaders
    const vs = this._compileShader(gl.VERTEX_SHADER, VERT_SRC);
    const fs = this._compileShader(gl.FRAGMENT_SHADER, FRAG_SRC);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(this.program);
      gl.deleteProgram(this.program);
      throw new Error('Shader link failed: ' + info);
    }

    gl.deleteShader(vs);
    gl.deleteShader(fs);

    this.vao = gl.createVertexArray();
  }

  /**
   * Upload compressed DDS data and render to the canvas.
   * @param {{ width: number, height: number, format: string, blockSize: number, data: Uint8Array }} dds
   */
  uploadCompressed(dds) {
    const { gl, s3tc } = this;

    const formatMap = {
      dxt1: s3tc.COMPRESSED_RGBA_S3TC_DXT1_EXT,
      dxt3: s3tc.COMPRESSED_RGBA_S3TC_DXT3_EXT,
      dxt5: s3tc.COMPRESSED_RGBA_S3TC_DXT5_EXT,
    };
    const internalFormat = formatMap[dds.format];
    if (internalFormat === undefined) {
      throw new Error(`Unsupported compressed format: ${dds.format}`);
    }

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.compressedTexImage2D(
      gl.TEXTURE_2D, 0, internalFormat,
      dds.width, dds.height, 0, dds.data,
    );

    this._draw(dds.width, dds.height);

    gl.deleteTexture(tex);
  }

  /**
   * Upload uncompressed RGBA ImageData and render to the canvas.
   * @param {ImageData} imageData
   */
  uploadImageData(imageData) {
    const { gl } = this;

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA,
      imageData.width, imageData.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, imageData.data,
    );

    this._draw(imageData.width, imageData.height);

    gl.deleteTexture(tex);
  }

  /** @private */
  _draw(width, height) {
    const { gl } = this;
    const canvas = gl.canvas;

    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);

    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /** Clean up WebGL resources and release the context. */
  dispose() {
    const { gl } = this;
    if (this.program) {
      gl.deleteProgram(this.program);
      this.program = null;
    }
    if (this.vao) {
      gl.deleteVertexArray(this.vao);
      this.vao = null;
    }
    const lc = gl.getExtension('WEBGL_lose_context');
    if (lc) lc.loseContext();
  }

  /** @private */
  _compileShader(type, source) {
    const { gl } = this;
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error('Shader compile failed: ' + info);
    }
    return shader;
  }
}

/**
 * Convenience: parse a DDS buffer and render it to a new canvas.
 * Returns { canvas, width, height } or null if the format is unsupported
 * or WebGL2 is unavailable.
 * @param {Uint8Array} buf - Full DDS file bytes
 * @returns {{ canvas: HTMLCanvasElement, width: number, height: number }|null}
 */
export function renderDDSToCanvas(buf) {
  const dds = parseDDS(buf);
  const { width, height, format } = dds;

  if (!format) return null;

  // Compressed formats — use WebGL2
  if (format === 'dxt1' || format === 'dxt3' || format === 'dxt5') {
    const canvas = document.createElement('canvas');
    const renderer = TextureRenderer.create(canvas);
    if (!renderer) return null;

    renderer.uploadCompressed(dds);

    // Read back to a 2D canvas so pixels survive WebGL context disposal
    const canvas2d = document.createElement('canvas');
    canvas2d.width = width;
    canvas2d.height = height;
    canvas2d.getContext('2d').drawImage(canvas, 0, 0);

    renderer.dispose();

    return { canvas: canvas2d, width, height };
  }

  // Uncompressed formats — swizzle to RGBA on CPU, draw with 2D canvas
  if (format === 'rgba' || format === 'bgra' || format === 'bgr') {
    const pixelCount = width * height;
    const pixels = new Uint8ClampedArray(pixelCount * 4);
    const src = dds.data;

    if (format === 'rgba') {
      pixels.set(src.subarray(0, pixelCount * 4));
    } else if (format === 'bgra') {
      for (let i = 0; i < pixelCount; i++) {
        const si = i * 4;
        const di = i * 4;
        pixels[di]     = src[si + 2]; // R <- B
        pixels[di + 1] = src[si + 1]; // G
        pixels[di + 2] = src[si];     // B <- R
        pixels[di + 3] = src[si + 3]; // A
      }
    } else if (format === 'bgr') {
      for (let i = 0; i < pixelCount; i++) {
        const si = i * 3;
        const di = i * 4;
        pixels[di]     = src[si + 2]; // R <- B
        pixels[di + 1] = src[si + 1]; // G
        pixels[di + 2] = src[si];     // B <- R
        pixels[di + 3] = 255;         // A
      }
    }

    const imageData = new ImageData(pixels, width, height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.putImageData(imageData, 0, 0);

    return { canvas, width, height };
  }

  return null;
}
