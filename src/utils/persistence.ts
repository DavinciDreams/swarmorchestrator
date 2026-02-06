/**
 * Robust Persistence Utility
 *
 * Local file-based storage for all persistent state.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface PersistenceConfig {
  /** Base directory for local file storage */
  localStorageDir?: string;
  /** Whether to log storage events */
  verbose?: boolean;
}

const DEFAULT_CONFIG: Required<PersistenceConfig> = {
  localStorageDir: path.join(process.cwd(), ".memory"),
  verbose: true,
};

export class PersistenceManager {
  private config: Required<PersistenceConfig>;

  constructor(config?: PersistenceConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    // Ensure local storage directory exists
    fs.mkdirSync(this.config.localStorageDir, { recursive: true });
  }

  /**
   * Store data to local file storage
   */
  async store(
    namespace: string,
    key: string,
    data: Record<string, unknown>,
    tags?: string[]
  ): Promise<{ success: boolean; backend: "local"; error?: string }> {
    try {
      await this.storeLocal(namespace, key, data, tags);
      return { success: true, backend: "local" };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[Persistence] Local store failed: ${msg}`);
      return { success: false, backend: "local", error: msg };
    }
  }

  /**
   * Retrieve data from local file storage
   */
  async retrieve(
    namespace: string,
    key: string
  ): Promise<{ success: boolean; data?: Record<string, unknown>; backend: "local"; error?: string }> {
    try {
      const data = await this.retrieveLocal(namespace, key);
      return { success: true, data, backend: "local" };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, backend: "local", error: msg };
    }
  }

  /**
   * Store data to local file system
   */
  private async storeLocal(
    namespace: string,
    key: string,
    data: Record<string, unknown>,
    tags?: string[]
  ): Promise<void> {
    const namespaceDir = path.join(this.config.localStorageDir, namespace);
    fs.mkdirSync(namespaceDir, { recursive: true });

    const filePath = path.join(namespaceDir, `${this.sanitizeKey(key)}.json`);
    const payload = {
      key,
      namespace,
      value: data,
      tags,
      timestamp: new Date().toISOString(),
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");

    // Update index file
    await this.updateLocalIndex(namespace, key, tags);
  }

  /**
   * Retrieve data from local file system
   */
  private async retrieveLocal(namespace: string, key: string): Promise<Record<string, unknown>> {
    const filePath = path.join(
      this.config.localStorageDir,
      namespace,
      `${this.sanitizeKey(key)}.json`
    );

    if (!fs.existsSync(filePath)) {
      throw new Error(`Key not found: ${key} in namespace ${namespace}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");
    const payload = JSON.parse(content);
    return payload.value || payload;
  }

  /**
   * List all keys in a namespace
   */
  async list(namespace: string): Promise<{ keys: string[]; backend: "local" }> {
    const namespaceDir = path.join(this.config.localStorageDir, namespace);
    if (!fs.existsSync(namespaceDir)) {
      return { keys: [], backend: "local" };
    }

    const files = fs.readdirSync(namespaceDir).filter((f) => f.endsWith(".json") && f !== "_index.json");
    const keys = files.map((f) => path.basename(f, ".json"));
    return { keys, backend: "local" };
  }

  /**
   * Update local index for fast lookups
   */
  private async updateLocalIndex(namespace: string, key: string, tags?: string[]): Promise<void> {
    const indexPath = path.join(this.config.localStorageDir, namespace, "_index.json");
    let index: Record<string, { key: string; tags?: string[]; updated: string }> = {};

    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, "utf-8"));
      } catch {
        // Index corrupted, start fresh
      }
    }

    index[key] = {
      key,
      tags,
      updated: new Date().toISOString(),
    };

    fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
  }

  /**
   * Sanitize key for use as filename
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9-_]/g, "_");
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    backend: "local";
    localStorageDir: string;
    namespaces: Array<{ name: string; keyCount: number }>;
  }> {
    const namespaces: Array<{ name: string; keyCount: number }> = [];

    if (fs.existsSync(this.config.localStorageDir)) {
      const dirs = fs
        .readdirSync(this.config.localStorageDir, { withFileTypes: true })
        .filter((d) => d.isDirectory());

      for (const dir of dirs) {
        const files = fs
          .readdirSync(path.join(this.config.localStorageDir, dir.name))
          .filter((f) => f.endsWith(".json") && f !== "_index.json");
        namespaces.push({ name: dir.name, keyCount: files.length });
      }
    }

    return {
      backend: "local",
      localStorageDir: this.config.localStorageDir,
      namespaces,
    };
  }
}

// Singleton instance
let defaultManager: PersistenceManager | null = null;

/**
 * Get the default persistence manager
 */
export function getDefaultPersistenceManager(): PersistenceManager {
  if (!defaultManager) {
    defaultManager = new PersistenceManager();
  }
  return defaultManager;
}

/**
 * Convenience function for storing data
 */
export async function persistData(
  namespace: string,
  key: string,
  data: Record<string, unknown>,
  tags?: string[]
): Promise<void> {
  const manager = getDefaultPersistenceManager();
  const result = await manager.store(namespace, key, data, tags);
  if (!result.success) {
    throw new Error(`Failed to persist data: ${result.error}`);
  }
}

/**
 * Convenience function for retrieving data
 */
export async function retrieveData(
  namespace: string,
  key: string
): Promise<Record<string, unknown> | null> {
  const manager = getDefaultPersistenceManager();
  const result = await manager.retrieve(namespace, key);
  return result.success ? result.data || null : null;
}
