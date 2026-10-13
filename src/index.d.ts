export * from './core.js';
import type { Report, Config, Rule } from './core.js';
export const RULES: Record<string, Rule>;
export interface CheckOptions { base?: string; baseVersion?: string; version?: string; commits?: { sha?: string | null; message: string }[]; changelog?: string | false; changelogOnly?: boolean; requireBump?: boolean; unknownAs?: 'patch' | 'minor' | 'major'; checkTag?: boolean; types?: Record<string, 'major' | 'minor' | 'patch' | 'none'>; now?: Date }
export function check(dir: string, opts?: CheckOptions, config?: Config, configFile?: string): Report & { info: { version: string; baseRef: string | null; baseVersion: string | null; required: string; actual: string | null; expected: string | null; commits: number; changelog: string } };
export function parse(v: string): { major: number; minor: number; patch: number; pre: string[]; build: string; raw: string } | null;
export function valid(v: string): boolean;
export function compare(a: string, b: string): -1 | 0 | 1;
export function diff(from: string, to: string): 'none' | 'patch' | 'minor' | 'major' | 'prerelease' | 'downgrade';
export function inc(v: string, level: 'major' | 'minor' | 'patch'): string;
export function parseCommit(message: string): { conventional: boolean; type: string | null; scope: string | null; breaking: boolean; subject: string; header: string; body: string };
export function commitLevel(c: ReturnType<typeof parseCommit>, types?: Record<string, string>): string;
export function parseChangelog(text: string): { version: string | null; unreleased: boolean; title: string; line: number; date: string | null; text: string }[];
export function readCommitsFile(file: string): { sha: null; message: string }[];
