import * as fs from 'fs';
import * as path from 'path';

const STORAGE_ROOT = path.join(process.cwd(), 'storage');

export const STORAGE_PATHS = {
  root: STORAGE_ROOT,
  renders: path.join(STORAGE_ROOT, 'renders'),
  jobs: path.join(STORAGE_ROOT, 'jobs'),
  metadata: path.join(STORAGE_ROOT, 'metadata.json'),
  jobsFile: path.join(STORAGE_ROOT, 'jobs.json'),
};

export function ensureStorageDirs(): void {
  const dirs = [STORAGE_PATHS.root, STORAGE_PATHS.renders, STORAGE_PATHS.jobs];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function ensureJobDir(jobId: string): string {
  const jobDir = path.join(STORAGE_PATHS.jobs, jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }
  return jobDir;
}

export function getRenderPath(jobId: string): string {
  return path.join(STORAGE_PATHS.renders, `${jobId}.mp4`);
}

export function cleanupJobDir(jobId: string): void {
  const jobDir = path.join(STORAGE_PATHS.jobs, jobId);
  if (fs.existsSync(jobDir)) {
    fs.rmSync(jobDir, { recursive: true, force: true });
  }
}

export function writeFileSync(filePath: string, data: string | Buffer): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, data);
}

export function readJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

export function writeJsonFile<T>(filePath: string, data: T): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2));
}
