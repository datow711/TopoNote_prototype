#!/usr/bin/env python3
"""Create a manually-triggered, single-file TopoNote baseline backup.

The default archive contains tracked repository files, local AudioUploads, any
files placed in backup-inputs, and a Git bundle.  A live Supabase dump is
optional and requires TOPONOTE_SUPABASE_DB_URL plus pg_dump on PATH.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path
from typing import Iterable


EXCLUDED_DIR_NAMES = {
    ".agents",
    ".claude",
    ".codex",
    ".codex-tmp-supabase",
    ".git",
    ".npm-cache",
    ".pytest_cache",
    ".venv",
    "backups",
    "node_modules",
    "test-results",
    "__pycache__",
}

SENSITIVE_FILE_NAMES = {
    ".clasp.json",
    ".env",
    "credentials.json",
    "service-account.json",
    "token.json",
}

SENSITIVE_SUFFIXES = {
    ".key",
    ".pem",
    ".p12",
    ".pfx",
}

ALREADY_COMPRESSED_SUFFIXES = {
    ".3gp",
    ".aac",
    ".caf",
    ".flac",
    ".gif",
    ".jpeg",
    ".jpg",
    ".m4a",
    ".mp3",
    ".mp4",
    ".ogg",
    ".opus",
    ".pdf",
    ".png",
    ".webm",
    ".xlsx",
    ".zip",
}


def utc_now() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


def local_timestamp(value: dt.datetime) -> str:
    return value.astimezone().strftime("%Y%m%d_%H%M%S")


def resolve_path(path: Path) -> Path:
    return path.expanduser().resolve()


def is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
        return True
    except ValueError:
        return False


def is_sensitive_path(path: Path) -> bool:
    for part in path.parts:
        lower = part.lower()
        if lower in SENSITIVE_FILE_NAMES:
            return True
        if lower.startswith(".env."):
            return True
        if Path(lower).suffix in SENSITIVE_SUFFIXES:
            return True
        if lower.endswith("-credentials.json") or lower.endswith("_credentials.json"):
            return True
    return False


def should_skip_file(path: Path, source_root: Path, output_dir: Path) -> str | None:
    resolved = resolve_path(path)
    if is_within(resolved, output_dir):
        return "output directory"
    if is_sensitive_path(resolved.relative_to(source_root) if is_within(resolved, source_root) else resolved):
        return "possible secret or local credential"
    return None


def iter_files(root: Path, source_root: Path, output_dir: Path) -> Iterable[Path]:
    if root.is_file():
        reason = should_skip_file(root, source_root, output_dir)
        if reason is None:
            yield root
        return

    if not root.exists():
        return

    for current, directories, filenames in os.walk(root):
        current_path = Path(current)
        directories[:] = [
            name
            for name in directories
            if name not in EXCLUDED_DIR_NAMES
            and not is_within(resolve_path(current_path / name), output_dir)
        ]
        for filename in filenames:
            path = current_path / filename
            reason = should_skip_file(path, source_root, output_dir)
            if reason is None:
                yield path


def run_command(args: list[str], cwd: Path, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        args,
        cwd=str(cwd),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        check=False,
    )


def git_text(source_root: Path, args: list[str]) -> str:
    if not (source_root / ".git").exists():
        return ""
    result = run_command(["git", *args], source_root)
    if result.returncode != 0:
        return ""
    return result.stdout.strip()


def tracked_files(source_root: Path) -> list[Path]:
    if not (source_root / ".git").exists():
        return []
    result = run_command(["git", "ls-files", "-z"], source_root)
    if result.returncode != 0:
        return []
    return [source_root / item for item in result.stdout.split("\0") if item]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def redact_connection_string(value: str) -> str:
    return re.sub(r"(://[^:/@]+:)[^@]+(@)", r"\1***\2", value)


def archive_entry_name(prefix: str, path: Path, base: Path) -> str:
    relative = path.relative_to(base).as_posix()
    return f"{prefix.rstrip('/')}/{relative}" if prefix else relative


def add_file_candidate(
    candidates: dict[str, Path],
    omissions: list[dict[str, str]],
    path: Path,
    entry_name: str,
    source_root: Path,
    output_dir: Path,
) -> None:
    resolved = resolve_path(path)
    if not resolved.exists() or not resolved.is_file():
        omissions.append({"path": str(path), "reason": "not found"})
        return
    reason = should_skip_file(resolved, source_root, output_dir)
    if reason:
        omissions.append({"path": str(path), "reason": reason})
        return
    if entry_name in candidates:
        if resolve_path(candidates[entry_name]) != resolved:
            omissions.append({"path": str(path), "reason": f"archive path collision: {entry_name}"})
        return
    for existing_entry, existing_path in candidates.items():
        if resolve_path(existing_path) == resolved:
            omissions.append(
                {"path": str(path), "reason": f"already included as {existing_entry}"}
            )
            return
    candidates[entry_name] = resolved


def add_directory_candidates(
    candidates: dict[str, Path],
    omissions: list[dict[str, str]],
    root: Path,
    prefix: str,
    source_root: Path,
    output_dir: Path,
) -> None:
    resolved = resolve_path(root)
    if not resolved.exists():
        omissions.append({"path": str(root), "reason": "not found"})
        return
    for path in iter_files(resolved, source_root, output_dir):
        add_file_candidate(
            candidates,
            omissions,
            path,
            archive_entry_name(prefix, path, resolved),
            source_root,
            output_dir,
        )


def create_git_bundle(source_root: Path, staging_dir: Path, omissions: list[dict[str, str]]) -> Path | None:
    if not (source_root / ".git").exists():
        omissions.append({"path": ".git", "reason": "Git repository not found; no bundle created"})
        return None
    bundle = staging_dir / "repository.git.bundle"
    result = run_command(["git", "bundle", "create", str(bundle), "--all"], source_root, timeout=300)
    if result.returncode != 0 or not bundle.exists():
        omissions.append({"path": ".git", "reason": "git bundle creation failed"})
        return None
    return bundle


def export_supabase(
    source_root: Path,
    staging_dir: Path,
    db_url: str | None,
    require_supabase: bool,
    omissions: list[dict[str, str]],
) -> dict[str, object]:
    result: dict[str, object] = {
        "status": "not_requested",
        "tool": "pg_dump",
        "connection_string": "not recorded",
        "files": [],
    }
    if not db_url:
        result["status"] = "skipped"
        result["reason"] = "TOPONOTE_SUPABASE_DB_URL was not provided"
        omissions.append({"path": "supabase/live", "reason": str(result["reason"])})
        if require_supabase:
            raise RuntimeError("需要 Supabase 匯出，但未設定 TOPONOTE_SUPABASE_DB_URL")
        return result

    pg_dump = shutil.which("pg_dump")
    if not pg_dump:
        result["status"] = "skipped"
        result["reason"] = "pg_dump was not found on PATH"
        omissions.append({"path": "supabase/live", "reason": str(result["reason"])})
        if require_supabase:
            raise RuntimeError("需要 Supabase 匯出，但找不到 pg_dump")
        return result

    live_dir = staging_dir / "supabase" / "live"
    live_dir.mkdir(parents=True, exist_ok=True)
    dump_path = live_dir / "supabase.custom.dump"
    schema_path = live_dir / "schema.sql"
    commands = [
        (["--format=custom", f"--file={dump_path}", "--no-owner", "--no-privileges"], dump_path),
        (["--schema-only", f"--file={schema_path}", "--no-owner", "--no-privileges"], schema_path),
    ]
    errors: list[str] = []
    exported: list[str] = []
    for options, expected in commands:
        try:
            completed = run_command([pg_dump, *options, db_url], source_root, timeout=900)
        except subprocess.TimeoutExpired:
            errors.append(f"timeout: {' '.join(options[:1])}")
            continue
        if completed.returncode != 0 or not expected.exists():
            error_text = (completed.stderr or "pg_dump failed").strip()
            errors.append(redact_connection_string(error_text)[-1000:])
            continue
        exported.append(str(expected.relative_to(staging_dir).as_posix()))

    result["connection_string"] = redact_connection_string(db_url)
    result["files"] = exported
    if errors:
        result["status"] = "failed"
        result["errors"] = errors
        if require_supabase:
            raise RuntimeError("Supabase pg_dump 失敗：" + " | ".join(errors))
    else:
        result["status"] = "exported"
    return result


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="建立 TopoNote 單一 ZIP 基線備份；預設包含 Git 追蹤檔、AudioUploads 與 backup-inputs。"
    )
    parser.add_argument(
        "--source-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="專案根目錄；一般使用時不需指定。",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=None,
        help="ZIP 輸出資料夾；未指定時使用專案根目錄下的 backups。可指定 Google Drive 同步資料夾。",
    )
    parser.add_argument(
        "--include-path",
        action="append",
        type=Path,
        default=[],
        help="額外加入一個檔案或資料夾；可重複指定，適合加入 Google Sheet／Drive 匯出檔。",
    )
    parser.add_argument(
        "--include-untracked",
        action="store_true",
        help="加入工作區中非 Git 追蹤檔案；仍會排除快取、輸出資料夾與疑似 secret。",
    )
    parser.add_argument(
        "--supabase-db-url",
        default=None,
        help="Supabase PostgreSQL 連線字串；建議使用 TOPONOTE_SUPABASE_DB_URL 環境變數。",
    )
    parser.add_argument(
        "--require-supabase",
        action="store_true",
        help="要求成功產生 Supabase dump；缺少 pg_dump／連線字串／匯出失敗時以錯誤結束。",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    source_root = resolve_path(args.source_root)
    output_dir = resolve_path(args.output_dir or source_root / "backups")
    output_dir.mkdir(parents=True, exist_ok=True)

    if not source_root.exists():
        parser.error(f"找不到 source root: {source_root}")

    created_at = utc_now()
    archive_name = f"TopoNote_baseline_backup_{local_timestamp(created_at)}.zip"
    archive_path = output_dir / archive_name
    candidates: dict[str, Path] = {}
    omissions: list[dict[str, str]] = []

    for path in tracked_files(source_root):
        if path.exists():
            try:
                relative = path.relative_to(source_root).as_posix()
            except ValueError:
                relative = path.name
            add_file_candidate(candidates, omissions, path, f"repo/{relative}", source_root, output_dir)
        else:
            omissions.append({"path": str(path), "reason": "tracked file is missing"})

    local_audio = source_root / "AudioUploads"
    if local_audio.exists():
        add_directory_candidates(candidates, omissions, local_audio, "local/AudioUploads", source_root, output_dir)
    else:
        omissions.append({"path": "AudioUploads", "reason": "local audio directory not found"})

    default_input_dir = source_root / "backup-inputs"
    if default_input_dir.exists():
        add_directory_candidates(candidates, omissions, default_input_dir, "external/backup-inputs", source_root, output_dir)

    if args.include_untracked:
        for path in iter_files(source_root, source_root, output_dir):
            try:
                relative = path.relative_to(source_root).as_posix()
            except ValueError:
                continue
            add_file_candidate(
                candidates,
                omissions,
                path,
                f"workspace-untracked/{relative}",
                source_root,
                output_dir,
            )

    for include_path in args.include_path:
        resolved = resolve_path(include_path)
        prefix = f"external/{resolved.name}"
        if resolved.is_dir():
            add_directory_candidates(candidates, omissions, resolved, prefix, source_root, output_dir)
        else:
            add_file_candidate(candidates, omissions, resolved, f"{prefix}/{resolved.name}", source_root, output_dir)

    with tempfile.TemporaryDirectory(prefix="toponote-baseline-") as temp_name:
        staging_dir = Path(temp_name)
        bundle = create_git_bundle(source_root, staging_dir, omissions)
        if bundle:
            candidates["repository/repository.git.bundle"] = bundle

        db_url = args.supabase_db_url or os.environ.get("TOPONOTE_SUPABASE_DB_URL")
        try:
            supabase_status = export_supabase(
                source_root,
                staging_dir,
                db_url,
                args.require_supabase,
                omissions,
            )
        except RuntimeError as error:
            print(f"錯誤：{error}", file=sys.stderr)
            return 2

        for generated in staging_dir.rglob("*"):
            if generated.is_file() and generated.name != "repository.git.bundle":
                relative = generated.relative_to(staging_dir).as_posix()
                candidates[f"generated/{relative}"] = generated

        file_records: list[dict[str, object]] = []
        for entry_name in sorted(candidates):
            path = candidates[entry_name]
            file_records.append(
                {
                    "archive_path": entry_name,
                    "source_path": str(path),
                    "size_bytes": path.stat().st_size,
                    "sha256": sha256_file(path),
                }
            )

        manifest: dict[str, object] = {
            "format": "toponote-baseline-backup",
            "format_version": 1,
            "created_at_utc": created_at.isoformat(),
            "created_at_local": created_at.astimezone().isoformat(),
            "archive_name": archive_name,
            "source_root": str(source_root),
            "host": platform.node(),
            "platform": platform.platform(),
            "git": {
                "branch": git_text(source_root, ["branch", "--show-current"]),
                "head": git_text(source_root, ["rev-parse", "HEAD"]),
                "status_short": git_text(source_root, ["status", "--short", "--branch"]),
            },
            "scope": {
                "tracked_repository_files": True,
                "git_bundle": bundle is not None,
                "local_audio_uploads": local_audio.exists(),
                "default_external_directory": default_input_dir.exists(),
                "include_untracked": args.include_untracked,
                "extra_include_paths": [str(resolve_path(item)) for item in args.include_path],
            },
            "supabase": supabase_status,
            "excluded_directory_names": sorted(EXCLUDED_DIR_NAMES),
            "omitted": omissions,
            "files": file_records,
            "notes": [
                "This archive is a baseline package, not a continuously running backup.",
                "Google Sheets and production Drive files are included only when exported or supplied via backup-inputs/include-path.",
                "No service-role key, webhook secret, local clasp config, or environment credential is intentionally archived.",
            ],
        }

        manifest_path = staging_dir / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

        with zipfile.ZipFile(
            archive_path,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
            compresslevel=6,
        ) as archive:
            for entry_name in sorted(candidates):
                source_path = candidates[entry_name]
                compression = (
                    zipfile.ZIP_STORED
                    if source_path.suffix.lower() in ALREADY_COMPRESSED_SUFFIXES
                    else zipfile.ZIP_DEFLATED
                )
                archive.write(source_path, entry_name, compress_type=compression)
            archive.write(manifest_path, "backup/manifest.json")

    with zipfile.ZipFile(archive_path, mode="r") as archive:
        damaged_entry = archive.testzip()
        if damaged_entry:
            print(f"錯誤：ZIP 驗證失敗，損壞項目：{damaged_entry}", file=sys.stderr)
            return 1
        manifest_in_archive = json.loads(archive.read("backup/manifest.json").decode("utf-8"))

    source_bytes = sum(int(item["size_bytes"]) for item in manifest_in_archive["files"])
    print(f"已建立基線備份：{archive_path}")
    print(f"檔案數：{len(manifest_in_archive['files'])}，原始大小：{source_bytes:,} bytes")
    print(f"排除／未納入項目：{len(manifest_in_archive['omitted'])}；詳見 ZIP 內的 backup/manifest.json")
    print(f"Supabase 匯出狀態：{manifest_in_archive['supabase']['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
