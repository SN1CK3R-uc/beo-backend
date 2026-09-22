import fs from 'node:fs';
import path from 'node:path';

const STORAGE_DIR = path.resolve('storage', 'pdfs');

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

export interface StoredFile {
  key: string;    // relative path used in DB
  fullPath: string;
}

export const storage = {
  /**
   * Save a Buffer under a unique key. Returns the key and absolute path.
   */
  save(key: string, buffer: Buffer): StoredFile {
    const fullPath = path.join(STORAGE_DIR, key);
    fs.writeFileSync(fullPath, buffer);
    return { key, fullPath };
  },

  /**
   * Get the absolute path for a stored key.
   */
  resolve(key: string): string {
    return path.join(STORAGE_DIR, key);
  },

  /**
   * Delete a stored file.
   */
  remove(key: string): void {
    const fullPath = this.resolve(key);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  },
};