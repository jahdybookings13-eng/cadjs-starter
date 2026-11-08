export interface ImportAsset {
  assetId: string;
  format: "stl" | "step" | "iges" | "3mf";
  name: string;
  bytes: Uint8Array;
}

const registry = new Map<string, ImportAsset>();

export function registerImportAsset(
  assetId: string,
  format: "stl" | "step" | "iges" | "3mf",
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

export function allImportAssets(): ImportAsset[] {
  return [...registry.values()];
}

export function restoreImportAsset(asset: ImportAsset): void {
  registry.set(asset.assetId, asset);
}

export function clearImportAssets(): void {
  registry.clear();
}
