# Changelog

All notable changes to this project are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Unreleased

_Nothing pending. The published tarball matches this repository._

## 1.0.1 — 2026-10-21

- **Fix: the `zh` dictionary was Traditional, not Simplified.** DSH treats `zh`
  as Simplified and the `dsh-zh-hant` pack converts `zh` → Traditional with
  OpenCC, so a Traditional table made the conversion a no-op on this namespace
  instead of the reverse of the table. The dialog read 新增工作**區** /
  工作**區**名**稱** / 建立失**敗** / **關**閉 / **將**建立**於** where it
  should read 新增工作**区** / 工作**区**名**称** / 建立失**败** / **关**闭 /
  **将**建立**于**. The table is now Simplified, and the `cn → tw` round trip
  reproduces the old Traditional string exactly, 12/12 keys.
- Embed the marketplace screenshots in the README so the plugin page shows
  them. The public plugin page renders the README's images, not
  `screenshots.json`.

## 1.0.0 — 2026-10-19

First public release.

- Name-based workspace creation for the web UI: owns both directory-flow holes
  (the sidebar header's folder+ button and the composer's "choose workspace"),
  replacing the native picker with a "name your workspace" dialog.
- On submit it creates the directory and registers the workspace, then hands
  the path back so the host adopts it and opens a new session.
- The parent directory comes from the workspace registry rather than
  `process.cwd()`, which is `/` when `dsh web` is started by launchd — and the
  root is explicitly refused.
- Shadows the native picker with a lower slot priority instead of competing
  for the slot.
