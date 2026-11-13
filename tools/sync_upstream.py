"""Merge upstream without overwriting Lingxi changes; publish only after CI passes.

The workflow runs `prepare`, validates the candidate, then runs `publish` with
the write token. Importable functions allow the Git behavior to be tested using
temporary local repositories without GitHub credentials or network access.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

UPSTREAM_URL = "https://github.com/hubooooooo/agent-workshop.git"
DESTINATION_URL = "https://github.com/buu206/lingxi.git"
PROTECTED_PATHS = (".github/", ".gitattributes", ".gitmodules", "tools/sync_upstream.py")


class SyncStopped(RuntimeError):
    """The repository needs a human-reviewed merge instead of an automatic one."""


def git(repo: Path, *args: str, check: bool = True, env: dict | None = None):
    result = subprocess.run(
        ["git", "-c", "core.hooksPath=/dev/null", *args], cwd=repo,
        text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        env={**os.environ, "GIT_TERMINAL_PROMPT": "0", **(env or {})},
    )
    if check and result.returncode:
        raise SyncStopped(f"git {args[0]} failed: {result.stderr.strip()}")
    return result


def state_path(repo: Path) -> Path:
    return Path(git(repo, "rev-parse", "--absolute-git-dir").stdout.strip()) / "lingxi-sync.json"


def require_clean(repo: Path) -> None:
    if git(repo, "status", "--porcelain", "--untracked-files=no").stdout:
        raise SyncStopped("Tracked files have uncommitted changes; refusing to overwrite them.")


def ancestor(repo: Path, older: str, newer: str) -> bool:
    result = git(repo, "merge-base", "--is-ancestor", older, newer, check=False)
    if result.returncode not in (0, 1):
        raise SyncStopped(result.stderr.strip())
    return result.returncode == 0


def require_reviewed_automation(repo: Path, older: str, newer: str) -> None:
    paths = git(repo, "diff", "--name-only", "--no-renames", "-z", older, newer).stdout.split("\0")
    blocked = [p for p in paths if any(p == guard or p.startswith(guard) for guard in PROTECTED_PATHS)]
    if blocked:
        raise SyncStopped("Upstream changes automation or Git configuration; review manually: " + ", ".join(blocked))


def prepare(repo: Path, upstream_url: str = UPSTREAM_URL) -> dict:
    require_clean(repo)
    # Never leave state from an earlier attempt available to `publish`.
    state_path(repo).unlink(missing_ok=True)
    base = git(repo, "rev-parse", "HEAD").stdout.strip()
    git(repo, "fetch", "--no-tags", "--no-recurse-submodules", upstream_url, "refs/heads/main")
    upstream = git(repo, "rev-parse", "FETCH_HEAD").stdout.strip()
    if ancestor(repo, upstream, base):
        return {"changed": False, "base": base, "upstream": upstream}
    merge_base = git(repo, "merge-base", base, upstream).stdout.strip()
    require_reviewed_automation(repo, merge_base, upstream)
    merged = git(repo, "merge", "--no-ff", "--no-commit", upstream, check=False)
    if merged.returncode:
        conflicts = git(repo, "diff", "--name-only", "--diff-filter=U").stdout.strip()
        if git(repo, "rev-parse", "--verify", "--quiet", "MERGE_HEAD", check=False).returncode == 0:
            git(repo, "merge", "--abort")
        raise SyncStopped("Upstream merge needs manual resolution; main was not published.\n" + (conflicts or merged.stderr.strip()))
    git(repo, "commit", "-m", f"chore: sync upstream agent-workshop {upstream[:12]}")
    state = {"changed": True, "base": base, "upstream": upstream}
    state_path(repo).write_text(json.dumps(state), encoding="utf-8")
    return state


def package_candidate(repo: Path, output_dir: Path) -> None:
    require_clean(repo)
    path = state_path(repo)
    if not path.is_file():
        raise SyncStopped("No prepared candidate to package.")
    state = json.loads(path.read_text(encoding="utf-8"))
    state["candidate"] = git(repo, "rev-parse", "HEAD").stdout.strip()
    output_dir.mkdir(parents=True, exist_ok=True)
    # Only Git objects are transferred. No working-tree scripts are executed by
    # the publishing job, and the trusted base already exists in its checkout.
    git(repo, "bundle", "create", str(output_dir / "candidate.bundle"), "HEAD", "^" + state["base"])
    (output_dir / "manifest.json").write_text(json.dumps(state), encoding="utf-8")


def read_candidate(repo: Path, artifact_dir: Path, upstream_url: str = UPSTREAM_URL) -> dict:
    require_clean(repo)
    manifest = artifact_dir / "manifest.json"
    bundle = artifact_dir / "candidate.bundle"
    if any(p.is_symlink() or not p.is_file() for p in (manifest, bundle)):
        raise SyncStopped("Missing or invalid candidate artifact.")
    if manifest.stat().st_size > 4096:
        raise SyncStopped("Invalid candidate manifest size.")
    state = json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(state, dict) or any(
        not isinstance(state.get(key), str) or not re.fullmatch(r"[0-9a-f]{40}", state[key])
        for key in ("base", "upstream", "candidate")
    ):
        raise SyncStopped("Candidate manifest must contain exact Git commit IDs.")
    if state["base"] != git(repo, "rev-parse", "HEAD").stdout.strip():
        raise SyncStopped("Candidate base differs from the trusted workflow checkout.")
    git(repo, "bundle", "verify", str(bundle))
    git(repo, "fetch", "--no-tags", "--no-recurse-submodules", str(bundle), "HEAD:refs/lingxi/sync-candidate")
    if git(repo, "rev-parse", "refs/lingxi/sync-candidate").stdout.strip() != state["candidate"]:
        raise SyncStopped("Bundle head does not match the candidate manifest.")
    git(repo, "fetch", "--no-tags", "--no-recurse-submodules", upstream_url, "refs/heads/main")
    if not ancestor(repo, state["upstream"], "FETCH_HEAD"):
        raise SyncStopped("Candidate upstream revision is not in the current upstream main history.")
    return state


def publish(repo: Path, destination_url: str = DESTINATION_URL, env: dict | None = None,
            state: dict | None = None) -> str:
    path = state_path(repo)
    from_local_state = state is None
    if state is None:
        if not path.is_file():
            raise SyncStopped("No prepared candidate; run prepare and all validation steps first.")
        state = json.loads(path.read_text(encoding="utf-8"))
    require_clean(repo)
    head = state.get("candidate") or git(repo, "rev-parse", "HEAD").stdout.strip()
    if not ancestor(repo, state["base"], head) or not ancestor(repo, state["upstream"], head):
        raise SyncStopped("Candidate no longer preserves both Lingxi and upstream history.")
    require_reviewed_automation(repo, state["base"], head)
    remote = git(repo, "ls-remote", destination_url, "refs/heads/main", env=env).stdout.split()
    if not remote or remote[0] != state["base"]:
        raise SyncStopped("GitHub main changed during validation; retry from the latest main. Nothing was pushed.")
    # No force option: a concurrent push after the check is rejected by Git too.
    git(repo, "-c", "credential.helper=", "-c",
        'credential.helper=!f() { echo username=x-access-token; echo "password=$GH_TOKEN"; }; f',
        "push", destination_url, f"{head}:refs/heads/main", env=env)
    if from_local_state:
        path.unlink()
    return head


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=("prepare", "bundle", "publish"))
    parser.add_argument("--artifact-dir", type=Path)
    args = parser.parse_args()
    if os.getenv("GITHUB_REPOSITORY") != "buu206/lingxi" or os.getenv("GITHUB_REF") != "refs/heads/main":
        parser.error("Automatic synchronization is restricted to buu206/lingxi on main.")
    repo = Path.cwd()
    try:
        if args.operation == "prepare":
            state = prepare(repo)
            if output := os.getenv("GITHUB_OUTPUT"):
                with open(output, "a", encoding="utf-8") as stream:
                    stream.write(f"changed={str(state['changed']).lower()}\n")
            message = f"Prepared upstream `{state['upstream'][:12]}` for validation." if state["changed"] else "Already up to date with upstream; no changes published."
        elif args.operation == "bundle":
            if args.artifact_dir is None:
                parser.error("bundle requires --artifact-dir")
            package_candidate(repo, args.artifact_dir.resolve())
            message = "Packaged the validated candidate for the isolated publishing job."
        else:
            if not os.getenv("GH_TOKEN"):
                raise SyncStopped("The publish step requires GITHUB_TOKEN via GH_TOKEN.")
            if args.artifact_dir is None:
                parser.error("publish requires --artifact-dir from the validation job")
            candidate = read_candidate(repo, args.artifact_dir.resolve())
            message = f"Published validated upstream update: `{publish(repo, state=candidate)}`."
        print(message)
        if summary := os.getenv("GITHUB_STEP_SUMMARY"):
            with open(summary, "a", encoding="utf-8") as stream:
                stream.write(message + "\n")
        return 0
    except (SyncStopped, OSError, ValueError) as exc:
        print(f"Synchronization stopped: {exc}")
        if summary := os.getenv("GITHUB_STEP_SUMMARY"):
            with open(summary, "a", encoding="utf-8") as stream:
                stream.write(f"Synchronization stopped; GitHub main was not overwritten.\n\n```text\n{exc}\n```\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
