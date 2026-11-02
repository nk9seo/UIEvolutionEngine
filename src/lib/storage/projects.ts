import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { PROJECTS_DIR } from "@/lib/config";
import type { Project, ProjectSummary } from "@/lib/types";

/**
 * File-based project store. Each project lives in data/projects/<id>/ with a
 * project.json document and one directory per version. Versions are append-only.
 */

const ID_RE = /^p_[a-z0-9]{6,32}$/;

export function newProjectId(): string {
  return `p_${Date.now().toString(36)}${crypto.randomBytes(4).toString("hex")}`;
}

export function isProjectId(id: string): boolean {
  return ID_RE.test(id);
}

export function projectDir(id: string): string {
  if (!isProjectId(id)) throw new Error("Invalid project id");
  return path.join(PROJECTS_DIR, id);
}

export function versionDir(id: string, version: number): string {
  if (!Number.isInteger(version) || version < 1) throw new Error("Invalid version");
  return path.join(projectDir(id), "versions", `v${version}`);
}

/**
 * Resolves a project-relative path and refuses anything outside the project
 * directory (path traversal, absolute paths, symlink tricks via "..").
 */
export function resolveInProject(id: string, relative: string): string {
  const root = projectDir(id);
  if (path.isAbsolute(relative) || relative.includes("\0")) throw new Error("Invalid path");
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error("Path escapes project directory");
  return resolved;
}

export function relativeToProject(id: string, absolute: string): string {
  return path.relative(projectDir(id), absolute).split(path.sep).join("/");
}

async function atomicWrite(file: string, data: string | Buffer) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(3).toString("hex")}.tmp`;
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

export async function writeProjectFile(id: string, relative: string, data: string | Buffer) {
  await atomicWrite(resolveInProject(id, relative), data);
}

export async function readProject(id: string): Promise<Project | null> {
  try {
    const raw = await fs.readFile(path.join(projectDir(id), "project.json"), "utf8");
    return JSON.parse(raw) as Project;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

// Serialize read-modify-write per project so concurrent step updates never clobber each other.
const g = globalThis as unknown as { __uieeLocks?: Map<string, Promise<unknown>> };
const locks = (g.__uieeLocks ??= new Map());

export async function updateProject(id: string, mutate: (p: Project) => void | Promise<void>): Promise<Project> {
  const prev = locks.get(id) ?? Promise.resolve();
  const next = prev.then(async () => {
    const project = await readProject(id);
    if (!project) throw new Error(`Project ${id} not found`);
    await mutate(project);
    project.updatedAt = new Date().toISOString();
    await atomicWrite(path.join(projectDir(id), "project.json"), JSON.stringify(project, null, 2));
    return project;
  });
  locks.set(id, next.catch(() => undefined));
  return next;
}

export async function createProject(project: Project): Promise<void> {
  const dir = projectDir(project.id);
  await fs.mkdir(dir, { recursive: true });
  await atomicWrite(path.join(dir, "project.json"), JSON.stringify(project, null, 2));
}

export async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const out: ProjectSummary[] = [];
  for (const name of entries) {
    if (!isProjectId(name)) continue;
    const p = await readProject(name).catch(() => null);
    if (!p) continue;
    out.push({
      id: p.id,
      name: p.name,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      platform: p.platform,
      versions: p.versions.length,
      status: p.job?.status,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
