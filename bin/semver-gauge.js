#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mainCli, check, checkWorkspaces, RULES, readCommitsFile, UsageError, splitList } from '../src/index.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
mainCli({
  name: 'semver-gauge', version: pkg.version, configKey: 'semverGauge', rules: RULES,
  tagline: 'check the version bump matches the changes and the CHANGELOG has an entry',
  usage: 'Usage: semver-gauge [dir] [options]',
  help: `Version
      --base <ref>          Git ref of the last release (default: latest v* tag reachable from HEAD)
      --base-version <v>    Last released version (default: from the tag name or package.json at --base)
      --version-override <v> Check this version instead of package.json "version"
      --commits <file>      Read commit messages from a file (separated by lines of "---") instead of git
      --require-bump        Fail (version-not-bumped) when releasable commits exist but the version is unchanged
      --unknown-as <level>  Treat non-conventional commits as patch | minor | major (default: ignore)
      --no-tag-check        Don't check whether a git tag for the version already exists
Sources and API
      --source <s>          auto (default: changesets if .changeset/ has entries, else commits) | commits | changesets
      --api <file.d.ts>     Diff this declaration file against --base; removed/changed exports need a major bump
      --api-base <file>     Use this file as the previous .d.ts instead of reading it from git
Monorepo
      --workspaces          Check each workspace package on its own (tags <name>@x.y.z, commits under its folder)
      --include-private     Also check private workspace packages
Changelog
      --changelog <file>    Changelog path (default: CHANGELOG.md, HISTORY.md, CHANGES.md)
      --changelog-only      Only check the changelog entry, not the bump
      --no-changelog        Skip changelog checks
`,
  options: { base: { type: 'string' }, 'base-version': { type: 'string' }, 'version-override': { type: 'string' }, commits: { type: 'string' }, 'require-bump': { type: 'boolean' }, 'unknown-as': { type: 'string' }, 'no-tag-check': { type: 'boolean' }, changelog: { type: 'string' }, 'changelog-only': { type: 'boolean' }, 'no-changelog': { type: 'boolean' }, source: { type: 'string' }, api: { type: 'string' }, 'api-base': { type: 'string' }, workspaces: { type: 'boolean' }, 'include-private': { type: 'boolean' } },
  run: async ({ dir, values: o, config, configFile }) => {
    if (o['unknown-as'] && !['patch', 'minor', 'major'].includes(o['unknown-as'])) throw new UsageError(`Invalid --unknown-as: ${o['unknown-as']}`);
    if (o.source && !['auto', 'commits', 'changesets'].includes(o.source)) throw new UsageError(`Invalid --source: ${o.source}`);
    const fn = (o.workspaces || config.workspaces) ? checkWorkspaces : check;
    return fn(dir, {
      source: o.source || config.source, api: o.api || config.api, apiBase: o['api-base'] ? readFileSync(resolve(o['api-base']), 'utf8') : undefined, includePrivate: o['include-private'],
      base: o.base ?? config.base, baseVersion: o['base-version'], version: o['version-override'],
      commits: o.commits ? readCommitsFile(resolve(o.commits)) : undefined,
      requireBump: o['require-bump'] || config.requireBump, unknownAs: o['unknown-as'] || config.unknownAs,
      checkTag: !o['no-tag-check'], changelog: o['no-changelog'] ? false : (o.changelog || config.changelog), changelogOnly: o['changelog-only'], toolVersion: pkg.version,
    }, config, configFile);
  },
});
