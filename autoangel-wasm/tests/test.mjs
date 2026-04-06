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
  it("parses with explicit config", () => {
    const config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    const data = ElementsData.parse(ELEMENTS_V7, config);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
    data.free();
  });

  it("parses with auto config", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
    data.free();
  });

  it("rejects empty bytes", () => {
    assert.throws(() => ElementsData.parse(new Uint8Array([])));
  });

  it("rejects truncated data", () => {
    assert.throws(() => ElementsData.parse(new Uint8Array([0x07, 0x00])));
  });

  it("rejects invalid header", () => {
    assert.throws(() =>
      ElementsData.parse(new Uint8Array([0x07, 0x00, 0x00, 0x00]))
    );
  });

  it("rejects data with no bundled config", () => {
    // version=9999 (0x270F), unknown=0x3000
    assert.throws(() =>
      ElementsData.parse(new Uint8Array([0x0f, 0x27, 0x00, 0x30]))
    );
  });
});

// --- List access ---

describe("ElementsDataList", () => {
  it("accesses list by index", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    assert.equal(list.caption, "WEAPON_MAJOR_TYPE");
    assert.equal(list.entryCount, 7);
    list.free();
    data.free();
  });

  it("returns field names", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    assert.deepEqual(list.fieldNames(), ["ID", "Name"]);
    list.free();
    data.free();
  });

  it("rejects out of bounds index", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    assert.throws(() => data.getList(99999));
    data.free();
  });
});

// --- Entry access ---

describe("ElementsDataEntry", () => {
  it("reads field values", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = list.getEntry(1);
    assert.equal(entry.getField("ID"), 5);
    assert.deepEqual(entry.keys(), ["ID", "Name"]);
    entry.free();
    list.free();
    data.free();
  });

  it("rejects unknown field name", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = list.getEntry(0);
    assert.throws(() => entry.getField("nonexistent_field"));
    entry.free();
    list.free();
    data.free();
  });

  it("rejects out of bounds entry", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    assert.throws(() => list.getEntry(99999));
    list.free();
    data.free();
  });

  it("converts to string", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const list = data.getList(1);
    const entry = list.getEntry(0);
    const s = entry.toString();
    assert.ok(s.length > 0);
    entry.free();
    list.free();
    data.free();
  });
});

// --- Find entry ---

describe("findEntry", () => {
  it("finds entry by ID", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const entry = data.findEntry(10);
    assert.notEqual(entry, undefined);
    assert.equal(entry.getField("ID"), 10);
    entry.free();
    data.free();
  });

  it("returns undefined for missing ID", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    assert.equal(data.findEntry(999999), undefined);
    data.free();
  });
});

// --- Roundtrip ---

describe("roundtrip", () => {
  it("save_bytes reproduces original data", () => {
    const data = ElementsData.parse(ELEMENTS_V7);
    const saved = data.saveBytes();
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
  it("parses package", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    assert.ok(pkg.fileCount > 0);
    pkg.free();
  });

  it("lists files", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    assert.equal(files.length, pkg.fileCount);
    pkg.free();
  });

  it("reads file content", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    const content = pkg.getFile(files[0]);
    assert.notEqual(content, undefined);
    assert.ok(content.length > 0);
    pkg.free();
  });

  it("returns undefined for missing file", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    assert.equal(pkg.getFile("nonexistent/path.txt"), undefined);
    pkg.free();
  });

  it("finds files by prefix", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const all = pkg.findPrefix("");
    assert.equal(all.length, pkg.fileCount);
    pkg.free();
  });

  it("rejects empty bytes", () => {
    assert.throws(() => PckPackage.parse(new Uint8Array([])));
  });

  it("returns file entries with metadata and hashes", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const entries = pkg.fileEntries();
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
      entry.free();
    }

    pkg.free();
  });

  it("file entries hashes are consistent", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const entries1 = pkg.fileEntries();
    const entries2 = pkg.fileEntries();

    for (let i = 0; i < entries1.length; i++) {
      assert.equal(entries1[i].hash, entries2[i].hash);
      entries1[i].free();
      entries2[i].free();
    }

    pkg.free();
  });

  it("file entries paths match file list", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const fileList = pkg.fileList();
    const entries = pkg.fileEntries();
    assert.equal(entries.length, fileList.length);

    for (let i = 0; i < entries.length; i++) {
      assert.equal(entries[i].path, fileList[i]);
      entries[i].free();
    }

    pkg.free();
  });

  it("file entries with progress callback", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    const collected = [];

    const entries = pkg.fileEntries({
      onProgress: (path, index, total) => {
        collected.push({ path, index, total });
      },
    });

    assert.equal(collected.length, pkg.fileCount);
    for (let i = 0; i < collected.length; i++) {
      assert.equal(collected[i].index, i);
      assert.equal(collected[i].total, pkg.fileCount);
      assert.equal(collected[i].path, entries[i].path);
      entries[i].free();
    }

    pkg.free();
  });

  it("file entries progress cancellation", () => {
    const pkg = PckPackage.parse(CONFIGS_PCK);
    let callCount = 0;

    assert.throws(() => {
      pkg.fileEntries({
        onProgress: (_path, _index, _total) => {
          callCount++;
          if (callCount >= 2) {
            throw new Error("cancelled");
          }
        },
      });
    });

    assert.equal(callCount, 2);
    pkg.free();
  });

  it("rejects wrong guards", () => {
    const config = PackageConfig.withKeys(
      0xa8937462,
      0x59374231,
      0x11111111,
      0x22222222
    );
    assert.throws(() => PckPackage.parse(CONFIGS_PCK, config));
  });
});
