export interface ImportAsset {
  assetId: string;
  format: "stl" | "step";
  name: string;
  bytes: Uint8Array;
}

const registry = new Map<string, ImportAsset>();

export function registerImportAsset(
  assetId: string,
  format: "stl" | "step",
  name: string,
  bytes: Uint8Array,
): ImportAsset {
  const asset = { assetId, format, name, bytes };
  registry.set(assetId, asset);
  return asset;
}

export function getImportAsset(assetId: string): ImportAsset | undefined {
  return registry.get(assetId);
}
