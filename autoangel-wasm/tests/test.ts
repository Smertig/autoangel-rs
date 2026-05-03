import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  EcmModel,
  ElementsConfig,
  ElementsData,
  PackageConfig,
  PckBuilder,
  PckPackage,
  SmdModel,
  Skin,
  decodeDds,
  decodeTga,
  parseAnimation,
  parseBmd,
  parseGfx,
  parseSkeleton,
  type FileEntry,
} from "../pkg-node/autoangel.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../..");

const CONFIG_TEXT = readFileSync(
  resolve(root, "autoangel-core/resources/known_configs/PW_1.2.6_v7.cfg"),
  "utf-8"
);
const ELEMENTS_V7 = readFileSync(
  resolve(root, "test_data/elements/elements_v7.data")
);
const CONFIGS_PCK = readFileSync(
  resolve(root, "test_data/packages/configs.pck")
);

// --- ElementsConfig ---

describe("ElementsConfig", () => {
  it("parses config from text", () => {
    using config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    assert.equal(config.listCount, 119);
  });

  it("returns config name", () => {
    using config = ElementsConfig.parse(CONFIG_TEXT, "pw");
    // Config parsed from string without file name has no name
    assert.equal(config.name, undefined);
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
    const config = ElementsConfig.parse(CONFIG_TEXT, "pw"); // consumed by parse
    using data = await ElementsData.parse(ELEMENTS_V7, config);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
  });

  it("parses with auto config", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    assert.equal(data.version, 7);
    assert.equal(data.listCount, 119);
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
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    assert.equal(list.caption, "WEAPON_MAJOR_TYPE");
    assert.equal(list.entryCount, 7);
  });

  it("returns field names", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    assert.deepEqual(list.fieldNames(), ["ID", "Name"]);
  });

  it("rejects out of bounds index", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    assert.throws(() => data.getList(99999));
  });
});

// --- Entry access ---

describe("ElementsDataEntry", () => {
  it("reads field values", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    using entry = await list.getEntry(1);
    const id = await entry.getField("ID");
    assert.equal(id, 5);
    assert.deepEqual(entry.keys(), ["ID", "Name"]);
  });

  it("rejects unknown field name", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    using entry = await list.getEntry(0);
    await assert.rejects(() => entry.getField("nonexistent_field"));
  });

  it("rejects out of bounds entry", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    await assert.rejects(() => list.getEntry(99999));
  });

  it("converts to string", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using list = data.getList(1);
    using entry = await list.getEntry(0);
    const s = entry.toString();
    assert.ok(s.length > 0);
  });
});

// --- Find entry ---

describe("findEntry", () => {
  it("finds entry by ID", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    using entry = (await data.findEntry(10))!;
    assert.notEqual(entry, undefined);
    const id = await entry.getField("ID");
    assert.equal(id, 10);
  });

  it("returns undefined for missing ID", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    assert.equal(await data.findEntry(999999), undefined);
  });
});

// --- Roundtrip ---

describe("roundtrip", () => {
  it("save_bytes reproduces original data", async () => {
    using data = await ElementsData.parse(ELEMENTS_V7);
    const saved = await data.saveBytes();
    assert.deepEqual(Buffer.from(saved), ELEMENTS_V7);
  });
});

// --- PackageConfig ---

describe("PackageConfig", () => {
  it("has correct defaults", () => {
    using config = new PackageConfig();
    assert.equal(config.key1, 0xa8937462);
    assert.equal(config.key2, 0x59374231);
    assert.equal(config.guard1, 0xfdfdfeee);
    assert.equal(config.guard2, 0xf00dbeef);
  });

  it("accepts custom keys", () => {
    using config = PackageConfig.withKeys(
      0x11111111,
      0x22222222,
      0x33333333,
      0x44444444
    );
    assert.equal(config.key1, 0x11111111);
    assert.equal(config.key2, 0x22222222);
    assert.equal(config.guard1, 0x33333333);
    assert.equal(config.guard2, 0x44444444);
  });
});

// --- PckPackage ---

describe("PckPackage", () => {
  it("parses package", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    assert.ok(pkg.fileCount > 0);
  });

  it("lists files", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    assert.equal(files.length, pkg.fileCount);
  });

  it("reads file content", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    const content = await pkg.getFile(files[0]);
    assert.notEqual(content, undefined);
    assert.ok(content!.length > 0);
  });

  it("returns undefined for missing file", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    assert.equal(await pkg.getFile("nonexistent/path.txt"), undefined);
  });

  it("finds files by prefix", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const all = pkg.findPrefix("");
    assert.equal(all.length, pkg.fileCount);
  });

  it("rejects empty bytes", async () => {
    await assert.rejects(() => PckPackage.parse(new Uint8Array([])));
  });

  it("scan entries returns metadata and hashes", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();
    const entries: { path: string; size: number; compressedSize: number; hash: number }[] = [];

    await pkg.scanEntries({
      paths,
      intervalMs: 0,
      onChunk: (chunk: FileEntry[]) => {
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
  });

  it("scan entries hashes are consistent", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();

    const collect = async () => {
      const entries: { path: string; hash: number }[] = [];
      await pkg.scanEntries({
        paths,
        intervalMs: 0,
        onChunk: (chunk: FileEntry[]) => {
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
  });

  it("scan entries paths match file list", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const fileList = pkg.fileList();
    const scannedPaths: string[] = [];

    await pkg.scanEntries({
      paths: fileList,
      intervalMs: 0,
      onChunk: (chunk: FileEntry[]) => {
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
  });

  it("scan entries onChunk cancellation", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const paths = pkg.fileList();
    let chunkCount = 0;

    await assert.rejects(() =>
      pkg.scanEntries({
        paths,
        intervalMs: 0,
        onChunk: (_chunk: FileEntry[]) => {
          chunkCount++;
          if (chunkCount >= 2) {
            throw new Error("cancelled");
          }
        },
      })
    );

    assert.ok(chunkCount >= 2);
  });

  it("rejects wrong guards", async () => {
    const config = PackageConfig.withKeys( // consumed by parse
      0xa8937462,
      0x59374231,
      0x11111111,
      0x22222222
    );
    await assert.rejects(() => PckPackage.parse(CONFIGS_PCK, config));
  });
});

// --- Dump elements (gold-based) ---

describe("dump elements", () => {
  const elementsDir = resolve(root, "test_data/elements");
  const dataFiles = readdirSync(elementsDir)
    .filter((f: string) => f.endsWith(".data"))
    .sort();

  for (const file of dataFiles) {
    it(`dumps ${file}`, async () => {
      const bytes = readFileSync(resolve(elementsDir, file));
      using data = await ElementsData.parse(bytes);

      let out = `version = ${data.version}, ${data.listCount} lists:\n`;
      for (let li = 0; li < data.listCount; li++) {
        using list = data.getList(li);
        out += `  ${list.caption} (${list.entryCount} entries)\n`;
        for (let ei = 0; ei < list.entryCount; ei++) {
          using entry = await list.getEntry(ei);
          out += `    [${ei}] ${entry.toString()}\n`;
        }
      }

      const goldPath = resolve(elementsDir, `${file}.txt`);
      const tmpPath = resolve(elementsDir, `${file}.tmp.txt`);
      const gold = readFileSync(goldPath, "utf-8");

      if (out !== gold) {
        writeFileSync(tmpPath, out, "utf-8");
        assert.fail(
          `Gold mismatch for ${file} — diff ${file}.txt vs ${file}.tmp.txt`
        );
      }
    });
  }
});

// --- PckBuilder ---

describe("PckBuilder", () => {
  it("creates empty package", async () => {
    using builder = new PckBuilder();
    assert.equal(builder.fileCount, 0);
    assert.deepEqual(builder.fileList(), []);

    const bytes = builder.toBytes();
    using pkg = await PckPackage.parse(bytes);
    assert.equal(pkg.fileCount, 0);
  });

  it("from-scratch roundtrip", async () => {
    using builder = new PckBuilder();
    builder.addFile("configs\\test.ini", new TextEncoder().encode("[Test]\nkey=value"));
    builder.addFile("configs\\other.ini", new TextEncoder().encode("[Other]\nfoo=bar"));

    assert.equal(builder.fileCount, 2);
    const list = builder.fileList();
    assert.equal(list.length, 2);
    assert.ok(list.includes("configs\\test.ini"));
    assert.ok(list.includes("configs\\other.ini"));

    const bytes = builder.toBytes();
    using pkg = await PckPackage.parse(bytes);
    assert.equal(pkg.fileCount, 2);

    const content = await pkg.getFile("configs\\test.ini");
    assert.deepEqual(content, new TextEncoder().encode("[Test]\nkey=value"));
  });

  it("normalizes paths", () => {
    using builder = new PckBuilder();
    builder.addFile("Textures/Foo.DDS", new Uint8Array([1, 2, 3]));
    assert.deepEqual(builder.fileList(), ["textures\\foo.dds"]);
  });

  it("removes files", () => {
    using builder = new PckBuilder();
    builder.addFile("data\\a.txt", new Uint8Array([1]));
    assert.equal(builder.removeFile("data\\a.txt"), true);
    assert.equal(builder.removeFile("data\\a.txt"), false);
    assert.equal(builder.fileCount, 0);
  });

  it("from existing package", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const originalCount = pkg.fileCount;
    const originalFiles = pkg.fileList();

    using builder = PckBuilder.fromPackage(pkg);
    assert.equal(builder.fileCount, originalCount);

    builder.addFile("configs\\added.txt", new TextEncoder().encode("added"));
    assert.equal(builder.fileCount, originalCount + 1);

    const bytes = builder.toBytes();
    using rebuilt = await PckPackage.parse(bytes);

    assert.equal(rebuilt.fileCount, originalCount + 1);
    const addedContent = await rebuilt.getFile("configs\\added.txt");
    assert.deepEqual(addedContent, new TextEncoder().encode("added"));

    // Original files still intact
    for (const path of originalFiles) {
      const original = await pkg.getFile(path);
      const rebuiltContent = await rebuilt.getFile(path);
      assert.deepEqual(rebuiltContent, original, `Content mismatch: ${path}`);
    }
  });

  it("package remains usable after fromPackage", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const files = pkg.fileList();
    const firstContent = await pkg.getFile(files[0]);

    using _builder = PckBuilder.fromPackage(pkg);

    // Original still works
    assert.deepEqual(pkg.fileList(), files);
    assert.deepEqual(await pkg.getFile(files[0]), firstContent);
  });

  it("toBuilder method works", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    using builder = pkg.toBuilder();
    assert.equal(builder.fileCount, pkg.fileCount);
  });

  it("remove from existing package", async () => {
    using pkg = await PckPackage.parse(CONFIGS_PCK);
    const originalFiles = pkg.fileList();
    assert.ok(originalFiles.length > 0);

    using builder = PckBuilder.fromPackage(pkg);
    assert.equal(builder.removeFile(originalFiles[0]), true);
    assert.equal(builder.removeFile(originalFiles[0]), false);
    assert.equal(builder.fileCount, originalFiles.length - 1);
  });
});

// --- Dump packages (gold-based) ---

describe("dump packages", () => {
  const packagesDir = resolve(root, "test_data/packages");
  const pckFiles = readdirSync(packagesDir)
    .filter((f: string) => f.endsWith(".pck"))
    .sort();

  for (const file of pckFiles) {
    it(`dumps ${file}`, async () => {
      const bytes = readFileSync(resolve(packagesDir, file));
      using pkg = await PckPackage.parse(bytes);
      const paths = pkg.fileList();
      const entries: { path: string; size: number; compressedSize: number; hash: number }[] = [];

      await pkg.scanEntries({
        paths,
        intervalMs: 0,
        onChunk: (chunk: FileEntry[]) => {
          for (const e of chunk) {
            entries.push({
              path: e.path,
              size: e.size,
              compressedSize: e.compressedSize,
              hash: e.hash,
            });
            e.free();
          }
        },
      });

      let out = `${entries.length} files:\n`;
      for (const e of entries) {
        const hash = (e.hash >>> 0).toString(16).toUpperCase().padStart(8, "0");
        out += `  ${e.path} (size=${e.size}, compressed=${e.compressedSize}, hash=0x${hash})\n`;
      }

      const goldPath = resolve(packagesDir, `${file}.txt`);
      const tmpPath = resolve(packagesDir, `${file}.tmp.txt`);
      const gold = readFileSync(goldPath, "utf-8");

      if (out !== gold) {
        writeFileSync(tmpPath, out, "utf-8");
        assert.fail(
          `Gold mismatch for ${file} — diff ${file}.txt vs ${file}.tmp.txt`
        );
      }
    });
  }
});

// --- EcmModel ---

const CARNIVORE_ECM = readFileSync(resolve(root, "test_data/models/carnivore_plant/carnivore_plant.ecm"));
const FALLEN_ECM = readFileSync(resolve(root, "test_data/models/fallen_general/fallen_general.ecm"));

describe("EcmModel", () => {
  it("parses carnivore_plant ECM", () => {
    using ecm = EcmModel.parse(CARNIVORE_ECM);
    assert.equal(ecm.version, 21);
    assert.equal(ecm.skinModelPath, "carnivore_plant.SMD");
    assert.deepEqual(ecm.additionalSkins, ["carnivore_plant.SKI"]);
    assert.equal(ecm.boneScaleCount, 0);
    assert.equal(ecm.newBoneScale, false);
    assert.equal(ecm.scaleBaseBone, undefined);
    assert.equal(ecm.childCount, 0);
  });

  it("parses fallen_general ECM with child models", () => {
    using ecm = EcmModel.parse(FALLEN_ECM);
    assert.equal(ecm.version, 21);
    assert.equal(ecm.skinModelPath, "fallen_general.SMD");
    assert.deepEqual(ecm.additionalSkins, ["fallen_general.ski"]);
    assert.equal(ecm.boneScaleCount, 0);
    assert.equal(ecm.childCount, 2);
  });

  it("returns default playback speed", () => {
    using ecm = EcmModel.parse(CARNIVORE_ECM);
    assert.equal(ecm.defPlaySpeed, 1.0);
  });

  it("rejects empty bytes", () => {
    assert.throws(() => EcmModel.parse(new Uint8Array([])));
  });
});

describe("EcmModel getEvent", () => {
  it("returns the GFX event at (0, 0) with expected field values", () => {
    using ecm = EcmModel.parse(FALLEN_ECM);
    // Action 0 event 0 is EventType=100 GFX per core's parse_fallen_general_events test.
    const ev = ecm.getEvent(0, 0);
    assert.ok(ev, "event should exist");
    // Exact values from the fallen_general fixture (ECM v21).
    assert.equal(ev.event_type, 100);
    assert.equal(ev.start_time, 0);
    assert.equal(ev.time_span, -1);
    assert.equal(ev.once, false);
    assert.equal(ev.bind_parent, true);
    assert.equal(ev.use_model_alpha, false);
    assert.equal(ev.fade_out, 1);
    assert.equal(ev.hook_yaw, 0);
    assert.equal(ev.hook_pitch, 0);
    assert.equal(ev.hook_rot, 0);
    assert.equal(ev.hook_name, "");
    // hook_offset is [f32; 3] — y ≈ 0.2, others 0.
    assert.equal(ev.hook_offset.length, 3);
    assert.equal(ev.hook_offset[0], 0);
    assert.ok(Math.abs(ev.hook_offset[1] - 0.2) < 1e-5);
    assert.equal(ev.hook_offset[2], 0);
    // GFX-only fields populated; sound-only fields absent.
    assert.ok(ev.gfx_scale !== undefined && Math.abs(ev.gfx_scale - 0.8) < 1e-2);
    assert.equal(ev.gfx_speed, 1.0);
    assert.equal(ev.volume, undefined);
    assert.equal(ev.min_dist, undefined);
    assert.equal(ev.max_dist, undefined);
    assert.equal(ev.force_2d, undefined);
    assert.equal(ev.is_loop, undefined);
    // fx_file_path is a non-empty GBK-decoded string (contains CJK chars).
    assert.equal(typeof ev.fx_file_path, "string");
    assert.ok(ev.fx_file_path.endsWith(".gfx"));
  });

  it("returns the Sound event at (3, 0) with expected field values", () => {
    using ecm = EcmModel.parse(FALLEN_ECM);
    // Action 3 event 0 is EventType=101 Sound per core's parse_fallen_general_events test.
    const ev = ecm.getEvent(3, 0);
    assert.ok(ev, "event should exist");
    assert.equal(ev.event_type, 101);
    assert.equal(ev.volume, 100);
    assert.equal(ev.min_dist, 5.0);
    assert.equal(ev.max_dist, 25.0);
    assert.equal(ev.force_2d, false);
    assert.equal(ev.is_loop, false);
    // GFX-only fields absent for Sound events.
    assert.equal(ev.gfx_scale, undefined);
    assert.equal(ev.gfx_speed, undefined);
  });

  it("returns undefined for out-of-bounds indices", () => {
    using ecm = EcmModel.parse(FALLEN_ECM);
    assert.equal(ecm.getEvent(99, 99), undefined);
    assert.equal(ecm.getEvent(0, 99), undefined);
  });
});

describe("EcmModel getChild", () => {
  it("returns child-model entries with expected field values", () => {
    using ecm = EcmModel.parse(FALLEN_ECM);
    assert.equal(ecm.childCount, 2);

    const c0 = ecm.getChild(0);
    assert.ok(c0, "child 0 should exist");
    assert.equal(c0.name, "wq_l");
    assert.equal(c0.hh_name, "HH_lefthandweapon");
    assert.equal(c0.cc_name, "CC_weapon");
    assert.equal(typeof c0.path, "string");

    const c1 = ecm.getChild(1);
    assert.ok(c1, "child 1 should exist");
    assert.equal(c1.name, "wq_r");
    assert.equal(c1.hh_name, "HH_righthandweapon");
  });

  it("returns undefined for out-of-bounds index", () => {
    using ecm = EcmModel.parse(CARNIVORE_ECM);
    assert.equal(ecm.getChild(999), undefined);
  });
});

describe("EcmModel getBoneScale", () => {
  it("returns undefined when there are no bone scales", () => {
    // fallen_general and carnivore_plant both have boneScaleCount == 0.
    using ecm = EcmModel.parse(FALLEN_ECM);
    assert.equal(ecm.boneScaleCount, 0);
    assert.equal(ecm.getBoneScale(0), undefined);
  });

  it("returns undefined for out-of-bounds index", () => {
    using ecm = EcmModel.parse(CARNIVORE_ECM);
    assert.equal(ecm.getBoneScale(999), undefined);
  });
});

// --- SmdModel ---

const CARNIVORE_SMD = readFileSync(resolve(root, "test_data/models/carnivore_plant/carnivore_plant.smd"));
const FALLEN_SMD = readFileSync(resolve(root, "test_data/models/fallen_general/fallen_general.smd"));

describe("SmdModel", () => {
  it("parses carnivore_plant SMD", () => {
    using smd = SmdModel.parse(CARNIVORE_SMD);
    assert.equal(smd.version, 5);
    assert.equal(smd.skinPaths.length, 1);
    assert.ok(smd.skeletonPath.endsWith(".bon"));
    // v5 < 8, so no tcks_dir in file
    assert.equal(smd.tcksDir, undefined);
  });

  it("parses fallen_general SMD", () => {
    using smd = SmdModel.parse(FALLEN_SMD);
    assert.equal(smd.version, 5);
    assert.equal(smd.skinPaths.length, 0);
    assert.ok(smd.skeletonPath.endsWith(".bon"));
  });

  it("rejects empty bytes", () => {
    assert.throws(() => SmdModel.parse(new Uint8Array([])));
  });

  it("rejects truncated file", () => {
    assert.throws(() => SmdModel.parse(new Uint8Array(20)));
  });
});

// --- Skeleton (BON) ---

const CARNIVORE_BON = readFileSync(resolve(root, "test_data/models/carnivore_plant/\u82b1\u82de\u98df\u4eba\u82b1_b.bon"));
const FALLEN_BON = readFileSync(resolve(root, "test_data/models/fallen_general/\u5175\u6b87\u5c06\u519b.bon"));

describe("Skeleton", () => {
  it("parses carnivore_plant skeleton", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    assert.equal(skel.bones.length, 26);
  });

  it("parses fallen_general skeleton", () => {
    const skel = parseSkeleton(FALLEN_BON);
    assert.equal(skel.bones.length, 33);
  });

  it("returns bone names", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    const name = skel.bones[0].name;
    assert.equal(typeof name, "string");
    assert.ok(name.length > 0);
  });

  it("root bone has parent -1", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    assert.equal(skel.bones[0].parent, -1);
  });

  it("non-root bone has valid parent", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    // Find a non-root bone
    let found = false;
    for (let i = 1; i < skel.bones.length; i++) {
      const p = skel.bones[i].parent;
      if (p >= 0) {
        assert.ok(p < skel.bones.length);
        found = true;
        break;
      }
    }
    assert.ok(found, "expected at least one non-root bone");
  });

  it("returns relative transform as 16 floats", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    const m = skel.bones[0].mat_relative;
    assert.equal(m.length, 16);
  });

  it("returns init transform as 16 floats", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    const m = skel.bones[0].mat_bone_init;
    assert.equal(m.length, 16);
  });

  it("is_flipped is boolean on every bone", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    for (const bone of skel.bones) {
      assert.equal(typeof bone.is_flipped, "boolean");
    }
  });

  it("exposes hooks as array", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    // Matches the core Rust test: carnivore has 3 hooks, fallen_general has 5.
    assert.ok(Array.isArray(skel.hooks));
    assert.equal(skel.hooks.length, 3);
    const h = skel.hooks[0];
    assert.equal(typeof h.name, "string");
    assert.ok(h.name.length > 0);
    assert.equal(typeof h.hook_type, "number");
    assert.equal(typeof h.bone_index, "number");
    assert.equal(h.transform.length, 16);
  });

  it("version is a number", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    assert.equal(typeof skel.version, "number");
  });

  it("exposes embedded animation for BON v<6", () => {
    const skel = parseSkeleton(CARNIVORE_BON);
    assert.ok(skel.embedded_animation, "embedded_animation present");
    const anim = skel.embedded_animation!;
    assert.equal(anim.anim_start, 0);
    assert.equal(anim.anim_end, 407);
    assert.equal(anim.anim_fps, 15);
    assert.equal(anim.bone_tracks.length, 26);
    const bt0 = anim.bone_tracks[0];
    assert.equal(bt0.bone_id, 0);
    assert.equal(bt0.position.frame_rate, 15);
  });

  it("fallen_general has 5 hooks with HH_* names", () => {
    const skel = parseSkeleton(FALLEN_BON);
    assert.equal(skel.hooks.length, 5);
    // All fallen_general hooks are HH_* attachment points (weapon hands etc.).
    const hooks = skel.hooks.map((h) => h.name);
    assert.ok(hooks.some((n) => n.startsWith("HH_")), `expected HH_* hook, got ${hooks.join(",")}`);
  });

  it("rejects empty bytes", () => {
    assert.throws(() => parseSkeleton(new Uint8Array([])));
  });

  it("rejects bad magic", () => {
    assert.throws(() => parseSkeleton(new Uint8Array(100)));
  });
});

// --- BMD ---

const BMD_V4 = readFileSync(resolve(root, "test_data/models/bmd/v4_litmodel_268.bmd"));
const BMD_V5 = readFileSync(resolve(root, "test_data/models/bmd/v5_litmodel_5647.bmd"));
const BMD_V6 = readFileSync(resolve(root, "test_data/models/bmd/v6_litmodel_669.bmd"));

describe("parseBmd", () => {
  for (const [label, bytes, meshVersion] of [
    ["V4", BMD_V4, 0x10000004],
    ["V5", BMD_V5, 0x10000005],
    ["V6", BMD_V6, 0x10000006],
  ] as const) {
    it(`parses ${label} fixture`, () => {
      const m = parseBmd(new Uint8Array(bytes));
      assert.equal(m.version, 0x10000002);
      assert.equal(m.meshes.length, 1);
      const mesh = m.meshes[0];
      assert.equal(mesh.version, meshVersion);
      assert.ok(mesh.texture_map.length > 0, "texture path non-empty");
      assert.ok(mesh.positions.length > 0, "non-empty positions");
      assert.equal(mesh.indices.length % 3, 0);
    });
  }
});

// --- Skin (SKI) ---

const CARNIVORE_SKI = readFileSync(resolve(root, "test_data/models/carnivore_plant/carnivore_plant.ski"));
const FALLEN_SKI = readFileSync(resolve(root, "test_data/models/fallen_general/fallen_general.ski"));

describe("Skin", () => {
  it("parses carnivore_plant skin", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    assert.equal(skin.skinMeshCount, 2);
    assert.equal(skin.rigidMeshCount, 0);
    assert.equal(skin.textures.length, 2);
  });

  it("parses fallen_general skin", () => {
    using skin = Skin.parse(FALLEN_SKI);
    assert.equal(skin.skinMeshCount, 2);
    assert.equal(skin.textures.length, 2);
  });

  it("returns skin mesh positions as flat float array", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const pos = skin.skinMeshPositions(0);
    assert.notEqual(pos, undefined);
    assert.ok(pos instanceof Float32Array);
    assert.equal(pos!.length % 3, 0);
    assert.ok(pos!.length > 0);
  });

  it("returns skin mesh normals", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const normals = skin.skinMeshNormals(0);
    assert.notEqual(normals, undefined);
    assert.ok(normals instanceof Float32Array);
    assert.equal(normals!.length % 3, 0);
  });

  it("returns skin mesh UVs", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const uvs = skin.skinMeshUvs(0);
    assert.notEqual(uvs, undefined);
    assert.ok(uvs instanceof Float32Array);
    assert.equal(uvs!.length % 2, 0);
  });

  it("returns skin mesh indices", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const idx = skin.skinMeshIndices(0);
    assert.notEqual(idx, undefined);
    assert.ok(idx instanceof Uint16Array);
    assert.equal(idx!.length % 3, 0, "triangle indices should be multiple of 3");
    assert.ok(idx!.length > 0);
  });

  it("returns bone weights with 4 components per vertex", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const weights = skin.skinMeshBoneWeights(0);
    const pos = skin.skinMeshPositions(0);
    assert.notEqual(weights, undefined);
    assert.ok(weights instanceof Float32Array);
    const vertCount = pos!.length / 3;
    assert.equal(weights!.length, vertCount * 4);
  });

  it("bone weights sum to ~1.0 per vertex", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const weights = skin.skinMeshBoneWeights(0)!;
    for (let v = 0; v < weights.length / 4; v++) {
      const sum = weights[v*4] + weights[v*4+1] + weights[v*4+2] + weights[v*4+3];
      assert.ok(Math.abs(sum - 1.0) < 0.01, `vertex ${v} weights sum to ${sum}`);
    }
  });

  it("bone weights w3 is non-negative", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const weights = skin.skinMeshBoneWeights(0)!;
    for (let v = 0; v < weights.length / 4; v++) {
      assert.ok(weights[v*4+3] >= 0, `vertex ${v} w3 = ${weights[v*4+3]}`);
    }
  });

  it("returns bone indices with 4 components per vertex", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const bi = skin.skinMeshBoneIndices(0);
    const pos = skin.skinMeshPositions(0);
    assert.notEqual(bi, undefined);
    assert.ok(bi instanceof Uint8Array);
    const vertCount = pos!.length / 3;
    assert.equal(bi!.length, vertCount * 4);
  });

  it("returns mesh name", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const name = skin.skinMeshName(0);
    assert.equal(typeof name, "string");
  });

  it("returns texture and material indices", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const texIdx = skin.skinMeshTextureIndex(0);
    const matIdx = skin.skinMeshMaterialIndex(0);
    assert.equal(typeof texIdx, "number");
    assert.equal(typeof matIdx, "number");
  });

  it("returns undefined for out-of-bounds mesh", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    assert.equal(skin.skinMeshPositions(9999), undefined);
    assert.equal(skin.rigidMeshPositions(9999), undefined);
  });

  it("vertex count is consistent across attributes", () => {
    using skin = Skin.parse(CARNIVORE_SKI);
    const pos = skin.skinMeshPositions(0)!;
    const normals = skin.skinMeshNormals(0)!;
    const uvs = skin.skinMeshUvs(0)!;
    const vertCount = pos.length / 3;
    assert.equal(normals.length, vertCount * 3);
    assert.equal(uvs.length, vertCount * 2);
  });

  it("rejects empty bytes", () => {
    assert.throws(() => Skin.parse(new Uint8Array([])));
  });

  it("rejects bad magic", () => {
    assert.throws(() => Skin.parse(new Uint8Array(110)));
  });
});

// --- Animation (STCK) ---

const STCK_V1_STATIC = readFileSync(resolve(root, "test_data/models/stck_v1_static.stck"));
const STCK_V1_ANIM = readFileSync(resolve(root, "test_data/models/stck_v1_animated.stck"));
const STCK_V2_STATIC = readFileSync(resolve(root, "test_data/models/stck_v2_static.stck"));
const STCK_V2_ANIM = readFileSync(resolve(root, "test_data/models/stck_v2_animated.stck"));

describe("Animation", () => {
  it("parses V1 static track set", () => {
    const ts = parseAnimation(STCK_V1_STATIC);
    assert.equal(ts.anim_fps, 15);
    assert.equal(ts.bone_tracks.length, 1);
    // 1 key × 3 floats
    assert.equal(ts.bone_tracks[0].position.keys.length, 3);
    // 1 key × 4 floats
    assert.equal(ts.bone_tracks[0].rotation.keys.length, 4);
    // V1 has no frame IDs
    assert.equal(ts.bone_tracks[0].position.key_frame_ids, undefined);
    assert.equal(ts.bone_tracks[0].rotation.key_frame_ids, undefined);
  });

  it("parses V1 animated track set", () => {
    const ts = parseAnimation(STCK_V1_ANIM);
    assert.equal(ts.anim_fps, 15);
    assert.equal(ts.anim_end, 70);
    assert.equal(ts.bone_tracks.length, 5);

    // Position keys are multiples of 3
    for (const bt of ts.bone_tracks) {
      assert.equal(bt.position.keys.length % 3, 0);
      assert.equal(bt.rotation.keys.length % 4, 0);
    }

    // At least one track has more than 1 key
    assert.ok(ts.bone_tracks[1].position.keys.length > 3);
  });

  it("parses V2 static track set", () => {
    const ts = parseAnimation(STCK_V2_STATIC);
    assert.equal(ts.bone_tracks.length, 1);
  });

  it("parses V2 animated track set", () => {
    const ts = parseAnimation(STCK_V2_ANIM);
    assert.equal(ts.anim_fps, 30);
    assert.equal(ts.anim_end, 100);
    assert.equal(ts.bone_tracks.length, 25);

    // Rotation keys are always 4 floats per key (even after no-w decompression)
    for (const bt of ts.bone_tracks) {
      assert.equal(bt.rotation.keys.length % 4, 0);
    }
  });

  it("exposes per-track frame rates", () => {
    const ts = parseAnimation(STCK_V1_ANIM);
    const bt = ts.bone_tracks[0];
    assert.equal(typeof bt.position.frame_rate, "number");
    assert.ok(bt.position.frame_rate > 0);
    assert.equal(typeof bt.rotation.frame_rate, "number");
    assert.ok(bt.rotation.frame_rate > 0);
  });

  it("exposes bone IDs", () => {
    const ts = parseAnimation(STCK_V1_ANIM);
    for (const bt of ts.bone_tracks) {
      assert.equal(typeof bt.bone_id, "number");
      assert.ok(bt.bone_id >= 0);
    }
  });

  it("V2 compressed tracks have frame IDs", () => {
    const ts = parseAnimation(STCK_V2_ANIM);
    // At least one track should have frame IDs (compressed)
    let foundFrameIds = false;
    for (const bt of ts.bone_tracks) {
      const posIds = bt.position.key_frame_ids;
      const rotIds = bt.rotation.key_frame_ids;
      if (posIds || rotIds) {
        foundFrameIds = true;
        if (posIds) {
          assert.equal(posIds.length, bt.position.keys.length / 3);
        }
        if (rotIds) {
          assert.equal(rotIds.length, bt.rotation.keys.length / 4);
        }
      }
    }
    assert.ok(foundFrameIds, "V2 animated file should have at least one compressed track");
  });

  it("exposes track length in ms", () => {
    const ts = parseAnimation(STCK_V2_ANIM);
    const bt = ts.bone_tracks[0];
    assert.equal(typeof bt.position.track_length_ms, "number");
    assert.equal(typeof bt.rotation.track_length_ms, "number");
  });

  it("rejects empty bytes", () => {
    assert.throws(() => parseAnimation(new Uint8Array([])));
  });

  it("rejects bad magic", () => {
    assert.throws(() => parseAnimation(new Uint8Array(30)));
  });
});

// --- Image decoding ---

// Build a minimal 2x2 uncompressed RGBA DDS (B8G8R8A8_UNORM)
function makeDds2x2(): Uint8Array {
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
function makeTga2x2(): Uint8Array {
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

// --- GFX gold tests ---
//
// Shared with the Python binding: each `test_data/gfx/*.gfx.json` golden
// is produced by `scripts/update_gfx_goldens.py` via the Python walker,
// and the WASM test compares against the same file. Any divergence means
// one of the two bindings is exposing the data differently.

// tsify emits `undefined` for `Option::None`; the Python walker that
// produces the golden emits `null`. Normalize so both sides agree —
// JSON's data model has `null` but no `undefined`.
function normalizeUndefined(v: unknown): unknown {
  if (v === undefined) return null;
  if (Array.isArray(v)) return v.map(normalizeUndefined);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = normalizeUndefined(val);
    }
    return out;
  }
  return v;
}

describe("parseGfx (gold)", () => {
  const gfxDir = resolve(root, "test_data/gfx");
  const fixtures = readdirSync(gfxDir)
    .filter((f: string) => f.endsWith(".gfx"))
    .sort();

  for (const fixture of fixtures) {
    it(`matches ${fixture}.json`, () => {
      const gfx = parseGfx(readFileSync(resolve(gfxDir, fixture)));
      const golden = JSON.parse(
        readFileSync(resolve(gfxDir, `${fixture}.json`), "utf-8")
      );
      assert.deepStrictEqual(normalizeUndefined(gfx), golden);
    });
  }
});
