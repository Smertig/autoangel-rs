// Re-export all public types from the wasm-pack generated bindings.
export type {
  DecodedImage,
  EcmModel,
  ElementsConfig,
  ElementsData,
  ElementsDataEntry,
  ElementsDataList,
  FileEntry,
  PackageConfig,
  PckPackage,
  Skeleton,
  SmdModel,
  WasmSkin,
  InitInput,
  InitOutput,
  SyncInitInput,
} from '../../../autoangel-wasm/pkg/autoangel.d.ts';

export { decodeDds, decodeTga, init, initSync } from '../../../autoangel-wasm/pkg/autoangel.d.ts';

/**
 * Shape of the autoangel WASM module when loaded via dynamic import.
 * Matches the named exports produced by wasm-pack for --target web.
 */
export interface AutoangelModule {
  // Lifecycle
  default: (
    module_or_path?: import('../../../autoangel-wasm/pkg/autoangel.d.ts').InitInput | Promise<import('../../../autoangel-wasm/pkg/autoangel.d.ts').InitInput>
  ) => Promise<import('../../../autoangel-wasm/pkg/autoangel.d.ts').InitOutput>;
  init: () => void;
  initSync: (
    module: { module: import('../../../autoangel-wasm/pkg/autoangel.d.ts').SyncInitInput } | import('../../../autoangel-wasm/pkg/autoangel.d.ts').SyncInitInput
  ) => import('../../../autoangel-wasm/pkg/autoangel.d.ts').InitOutput;

  // Image decoding
  decodeDds: (bytes: Uint8Array) => import('../../../autoangel-wasm/pkg/autoangel.d.ts').DecodedImage;
  decodeTga: (bytes: Uint8Array) => import('../../../autoangel-wasm/pkg/autoangel.d.ts').DecodedImage;

  // PCK
  PackageConfig: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').PackageConfig;
  PckPackage: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').PckPackage;

  // Elements
  ElementsConfig: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').ElementsConfig;
  ElementsData: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').ElementsData;

  // 3D model types
  EcmModel: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').EcmModel;
  SmdModel: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').SmdModel;
  WasmSkin: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').WasmSkin;
  Skeleton: typeof import('../../../autoangel-wasm/pkg/autoangel.d.ts').Skeleton;
}
