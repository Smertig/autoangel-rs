import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const {
  ElementsConfig,
  ElementsData,
  PackageConfig,
  PckPackage,
  decodeDds,
  decodeTga,
} = await import("../pkg-node/autoangel.js");

const CONFIG_TEXT = readFileSync(
  resolve(root, "autoangel-core/resources/known_configs/PW_1.2.6_v7.cfg"),
  "utf-8"
);
const ELEMENTS_V7 = readFileSync(
  resolve(root, "tests/test_data/elements/elements_v7.data")
);
const CONFIGS_PCK = readFileSync(
  resolve(root, "tests/test_data/packages/configs.pck")
);

// --- ElementsConfig ---

describe("ElementsConfig", () => {
  it("parses config from text", () => {
    const config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    assert.equal(config.listCount, 119);
    config.free();
  });

  it("returns config name", () => {
    const config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    // Config parsed from string without file name has no name
    assert.equal(config.name, undefined);
    config.free();
  });

  it("rejects unknown game dialect", () => {
    assert.throws(() => ElementsConfig.parse(CONFIG_TEXT, "unknown_game"));
  });

  it("rejects bad config content", () => {
    assert.throws(() => ElementsConfig.parse("garbage content", "pw"));
  });
});

// --- ElementsData ---

describe("ElementsData", () => {
  it("parses with explicit config", async () => {
    const config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    const data = await ElementsData.parse(ELEMENTS_V7, config);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
    data.free();
  });

  it("parses with auto config", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
    data.free();
  });

  it("rejects empty bytes", async () => {
    await assert.rejects(() => ElementsData.parse(new Uint8Array([])));
  });

  it("rejects truncated data", async () => {
    await assert.rejects(() =>
      ElementsData.parse(new Uint8Array([0x07, 0x00]))
    );
  });

  it("rejects invalid header", async () => {
    await assert.rejects(() =>
      ElementsData.parse(new Uint8Array([0x07, 0x00, 0x00, 0x00]))
    );
  });

  it("rejects data with no bundled config", async () => {
    // version=9999 (0x270F), unknown=0x3000
    await assert.rejects(() =>
      ElementsData.parse(new Uint8Array([0x0f, 0x27, 0x00, 0x30]))
    );
  });
});

// --- List access ---

describe("ElementsDataList", () => {
  it("accesses list by index", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    assert.equal(list.caption, "WEAPON_MAJOR_TYPE");
    assert.equal(list.entryCount, 7);
    list.free();
    data.free();
  });

  it("returns field names", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    assert.deepEqual(list.fieldNames(), ["ID", "Name"]);
    list.free();
    data.free();
  });

  it("rejects out of bounds index", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    assert.throws(() => data.getList(99999));
    data.free();
  });
});

// --- Entry access ---

describe("ElementsDataEntry", () => {
  it("reads field values", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = await list.getEntry(1);
    const id = await entry.getField("ID");
    assert.equal(id, 5);
    assert.deepEqual(entry.keys(), ["ID", "Name"]);
    entry.free();
    list.free();
    data.free();
  });

  it("rejects unknown field name", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = await list.getEntry(0);
    await assert.rejects(() => entry.getField("nonexistent_field"));
    entry.free();
    list.free();
    data.free();
  });

  it("rejects out of bounds entry", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    await assert.rejects(() => list.getEntry(99999));
    list.free();
    data.free();
  });

  it("converts to string", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = await list.getEntry(0);
    const s = entry.toString();
    assert.ok(s.length > 0);
    entry.free();
    list.free();
    data.free();
  });
});

// --- Find entry ---

describe("findEntry", () => {
  it("finds entry by ID", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const entry = await data.findEntry(10);
    assert.notEqual(entry, undefined);
    const id = await entry.getField("ID");
    assert.equal(id, 10);
    entry.free();
    data.free();
  });

  it("returns undefined for missing ID", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    assert.equal(await data.findEntry(999999), undefined);
    data.free();
  });
});

// --- Roundtrip ---

describe("roundtrip", () => {
  it("save_bytes reproduces original data", async () => {
    const data = await ElementsData.parse(ELEMENTS_V7);
    const saved = await data.saveBytes();
    assert.deepEqual(Buffer.from(saved), ELEMENTS_V7);
    data.free();
  });
});

// --- PackageConfig ---

describe("PackageConfig", () => {
  it("has correct defaults", () => {
    const config = new PackageConfig();
    assert.equal(config.key1, 0xa8937462);
    assert.equal(config.key2, 0x59374231);
    assert.equal(config.guard1, 0xfdfdfeee);
    assert.equal(config.guard2, 0xf00dbeef);
    config.free();
  });

  it("accepts custom keys", () => {
    const config = PackageConfig.withKeys(
      0x11111111,
      0x22222222,
      0x33333333,
      0x44444444
    );
    assert.equal(config.key1, 0x11111111);
    assert.equal(config.key2, 0x22222222);
    assert.equal(config.guard1, 0x33333333);
    assert.equal(config.guard2, 0x44444444);
    config.free();
  });
});

// --- PckPackage ---

describe("PckPackage", () => {
  it("parses package", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    assert.ok(pkg.fileCount > 0);
    pkg.free();
  });

  it("lists files", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    assert.equal(files.length, pkg.fileCount);
    pkg.free();
  });

  it("reads file content", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    const content = await pkg.getFile(files[0]);
    assert.notEqual(content, undefined);
    assert.ok(content.length > 0);
    pkg.free();
  });

  it("returns undefined for missing file", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    assert.equal(await pkg.getFile("nonexistent/path.txt"), undefined);
    pkg.free();
  });

  it("finds files by prefix", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const all = pkg.findPrefix("");
    assert.equal(all.length, pkg.fileCount);
    pkg.free();
  });

  it("rejects empty bytes", async () => {
    await assert.rejects(() => PckPackage.parse(new Uint8Array([])));
  });

  it("scan entries returns metadata and hashes", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();
    const entries = [];

    await pkg.scanEntries({
      paths,
      intervalMs: 0,
      onChunk: (chunk) => {
        for (const entry of chunk) {
          entries.push({
            path: entry.path,
            size: entry.size,
            compressedSize: entry.compressedSize,
            hash: entry.hash,
          });
          entry.free();
        }
      },
    });

    assert.equal(entries.length, pkg.fileCount);
    for (const entry of entries) {
      assert.equal(typeof entry.path, "string");
      assert.ok(entry.path.length > 0);
      assert.equal(typeof entry.size, "number");
      assert.ok(entry.size >= 0);
      assert.equal(typeof entry.compressedSize, "number");
      assert.ok(entry.compressedSize >= 0);
      assert.ok(entry.compressedSize <= entry.size || entry.size === 0);
      assert.equal(typeof entry.hash, "number");
    }

    pkg.free();
  });

  it("scan entries hashes are consistent", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();

    const collect = async () => {
      const entries = [];
      await pkg.scanEntries({
        paths,
        intervalMs: 0,
        onChunk: (chunk) => {
          for (const entry of chunk) {
            entries.push({ path: entry.path, hash: entry.hash });
            entry.free();
          }
        },
      });
      return entries;
    };

    const entries1 = await collect();
    const entries2 = await collect();

    for (let i = 0; i < entries1.length; i++) {
      assert.equal(entries1[i].hash, entries2[i].hash);
    }

    pkg.free();
  });

  it("scan entries paths match file list", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const fileList = pkg.fileList();
    const scannedPaths = [];

    await pkg.scanEntries({
      paths: fileList,
      intervalMs: 0,
      onChunk: (chunk) => {
        for (const entry of chunk) {
          scannedPaths.push(entry.path);
          entry.free();
        }
      },
    });

    assert.equal(scannedPaths.length, fileList.length);
    for (let i = 0; i < scannedPaths.length; i++) {
      assert.equal(scannedPaths[i], fileList[i]);
    }

    pkg.free();
  });

  it("scan entries onChunk cancellation", async () => {
    const pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();
    let chunkCount = 0;

    await assert.rejects(() =>
      pkg.scanEntries({
        paths,
        intervalMs: 0,
        onChunk: (_chunk) => {
          chunkCount++;
          if (chunkCount >= 2) {
            throw new Error("cancelled");
          }
        },
      })
    );

    assert.ok(chunkCount >= 2);
    pkg.free();
  });

  it("rejects wrong guards", async () => {
    const config = PackageConfig.withKeys(
      0xa8937462,
      0x59374231,
      0x11111111,
      0x22222222
    );
    await assert.rejects(() => PckPackage.parse(CONFIGS_PCK, config));
  });
});

// --- Image decoding ---

// Build a minimal 2x2 uncompressed RGBA DDS (B8G8R8A8_UNORM)
function makeDds2x2() {
  const buf = new ArrayBuffer(128 + 16); // header + 2x2x4 bytes
  const view = new DataView(buf);
  view.setUint32(0, 0x20534444, true);   // magic "DDS "
  view.setUint32(4, 124, true);          // header size
  view.setUint32(8, 0x1007, true);       // flags: CAPS|HEIGHT|WIDTH|PIXELFORMAT
  view.setUint32(12, 2, true);           // height
  view.setUint32(16, 2, true);           // width
  // pixel format at offset 76
  view.setUint32(76, 32, true);          // pfSize
  view.setUint32(80, 0x41, true);        // pfFlags: RGB|ALPHAPIXELS
  view.setUint32(88, 32, true);          // rgbBitCount
  view.setUint32(92, 0x00FF0000, true);  // rMask
  view.setUint32(96, 0x0000FF00, true);  // gMask
  view.setUint32(100, 0x000000FF, true); // bMask
  view.setUint32(104, 0xFF000000, true); // aMask
  view.setUint32(108, 0x1000, true);     // caps: TEXTURE
  // pixel data: 4 BGRA pixels (red, green, blue, white)
  const pixels = new Uint8Array(buf, 128);
  pixels.set([0,0,255,255, 0,255,0,255, 255,0,0,255, 255,255,255,255]);
  return new Uint8Array(buf);
}

// Build a minimal 2x2 uncompressed TGA (24-bit BGR, bottom-to-top)
function makeTga2x2() {
  const header = new Uint8Array(18);
  header[2] = 2;        // image type: uncompressed true-color
  header[12] = 2;       // width low byte
  header[14] = 2;       // height low byte
  header[16] = 24;      // bpp
  // pixel data: 4 BGR pixels (bottom row first)
  const pixels = new Uint8Array([255,0,0, 0,255,0, 0,0,255, 255,255,255]);
  const buf = new Uint8Array(18 + 12);
  buf.set(header);
  buf.set(pixels, 18);
  return buf;
}

describe("decodeDds", () => {
  it("decodes uncompressed BGRA DDS", () => {
    const dds = makeDds2x2();
    const img = decodeDds(dds);
    assert.equal(img.width, 2);
    assert.equal(img.height, 2);
    const rgba = img.intoRgba();
    assert.equal(rgba.length, 2 * 2 * 4);
  });

  it("rejects empty bytes", () => {
    assert.throws(() => decodeDds(new Uint8Array([])));
  });

  it("rejects truncated file", () => {
    assert.throws(() => decodeDds(new Uint8Array([0x44, 0x44, 0x53, 0x20])));
  });
});

describe("decodeTga", () => {
  it("decodes uncompressed TGA", () => {
    const tga = makeTga2x2();
    const img = decodeTga(tga);
    assert.equal(img.width, 2);
    assert.equal(img.height, 2);
    const rgba = img.intoRgba();
    assert.equal(rgba.length, 2 * 2 * 4);
  });

  it("rejects empty bytes", () => {
    assert.throws(() => decodeTga(new Uint8Array([])));
  });
});
