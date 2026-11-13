"""Exercise real Git merges and publication against isolated local repositories."""
import json
import subprocess
from pathlib import Path

import pytest

from tools.sync_upstream import SyncStopped, package_candidate, prepare, publish, read_candidate, state_path


def git(repo: Path, *args: str) -> str:
    return subprocess.run(
        ["git", *args], cwd=repo, check=True, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ).stdout.strip()


def commit(repo: Path, path: str, content: str) -> str:
    target = repo / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    git(repo, "add", path)
    git(repo, "commit", "-m", f"Update {path}")
    return git(repo, "rev-parse", "HEAD")


@pytest.fixture
def repos(tmp_path, monkeypatch):
    monkeypatch.delenv("GH_TOKEN", raising=False)
    # Isolate Git identity and hooks from both the workstation and CI runner.
    monkeypatch.setenv("GIT_CONFIG_GLOBAL", str(tmp_path / "no-global-config"))
    monkeypatch.setenv("GIT_CONFIG_NOSYSTEM", "1")
    monkeypatch.setenv("GIT_AUTHOR_NAME", "Sync Test")
    monkeypatch.setenv("GIT_AUTHOR_EMAIL", "sync-test@example.invalid")
    monkeypatch.setenv("GIT_COMMITTER_NAME", "Sync Test")
    monkeypatch.setenv("GIT_COMMITTER_EMAIL", "sync-test@example.invalid")
    upstream = tmp_path / "upstream"
    upstream.mkdir()
    git(upstream, "init", "-b", "main")
    commit(upstream, "engine.txt", "original engine\n")
    local = tmp_path / "lingxi"
    git(tmp_path, "clone", str(upstream), str(local))
    commit(local, "brand.txt", "Lingxi blue cloud\n")
    remote = tmp_path / "remote.git"
    git(tmp_path, "clone", "--bare", str(local), str(remote))
    return upstream, local, remote


def test_no_update_does_not_create_a_commit_or_publish_state(repos):
    upstream, local, remote = repos
    before = git(local, "rev-parse", "HEAD")
    result = prepare(local, str(upstream))
    assert result["changed"] is False
    assert git(local, "rev-parse", "HEAD") == before
    assert not state_path(local).exists()
    with pytest.raises(SyncStopped, match="No prepared candidate"):
        publish(local, str(remote))


def test_sync_preserves_brand_and_both_histories(repos):
    upstream, local, remote = repos
    previous = git(local, "rev-parse", "HEAD")
    update = commit(upstream, "engine.txt", "upstream bug fix\n")
    result = prepare(local, str(upstream))
    assert result["changed"] is True
    assert (local / "brand.txt").read_text() == "Lingxi blue cloud\n"
    assert (local / "engine.txt").read_text() == "upstream bug fix\n"
    assert git(remote, "rev-parse", "main") == previous  # validation has not run yet
    # A frontend rebuild is a separate commit above the merge.
    commit(local, "blueprint/web/static/index.html", "rebuilt assets\n")
    published = publish(local, str(remote))
    assert git(remote, "rev-parse", "main") == published
    git(remote, "merge-base", "--is-ancestor", previous, published)
    git(remote, "merge-base", "--is-ancestor", update, published)
    assert not state_path(local).exists()


def test_conflict_aborts_without_touching_remote_or_lingxi_changes(repos):
    upstream, local, remote = repos
    before = commit(local, "engine.txt", "Lingxi engine customization\n")
    remote_before = git(remote, "rev-parse", "main")
    commit(upstream, "engine.txt", "different upstream engine\n")
    with pytest.raises(SyncStopped, match="manual resolution"):
        prepare(local, str(upstream))
    assert git(local, "rev-parse", "HEAD") == before
    assert (local / "engine.txt").read_text() == "Lingxi engine customization\n"
    assert git(local, "status", "--porcelain") == ""
    assert git(remote, "rev-parse", "main") == remote_before
    assert not state_path(local).exists()


@pytest.mark.parametrize("path", [".github/workflows/other.yml", ".gitattributes", "tools/sync_upstream.py"])
def test_upstream_automation_changes_require_review(repos, path):
    upstream, local, remote = repos
    previous = git(local, "rev-parse", "HEAD")
    commit(upstream, path, "new automation\n")
    with pytest.raises(SyncStopped, match="review manually"):
        prepare(local, str(upstream))
    assert git(local, "rev-parse", "HEAD") == previous
    assert git(remote, "rev-parse", "main") == previous


def test_main_advancing_during_validation_prevents_push(repos, tmp_path):
    upstream, local, remote = repos
    commit(upstream, "engine.txt", "upstream improvement\n")
    prepare(local, str(upstream))
    other = tmp_path / "other-clone"
    git(tmp_path, "clone", str(remote), str(other))
    newer = commit(other, "brand.txt", "newer Lingxi design\n")
    git(other, "push", "origin", "main")
    with pytest.raises(SyncStopped, match="main changed"):
        publish(local, str(remote))
    assert git(remote, "rev-parse", "main") == newer


def test_uncommitted_files_cannot_be_published(repos):
    upstream, local, remote = repos
    before = git(remote, "rev-parse", "main")
    commit(upstream, "engine.txt", "new upstream engine\n")
    prepare(local, str(upstream))
    (local / "brand.txt").write_text("unfinished rebuild\n")
    with pytest.raises(SyncStopped, match="uncommitted changes"):
        publish(local, str(remote))
    assert git(remote, "rev-parse", "main") == before


def test_automation_cannot_change_between_prepare_and_publish(repos):
    upstream, local, remote = repos
    before = git(remote, "rev-parse", "main")
    commit(upstream, "engine.txt", "new engine\n")
    prepare(local, str(upstream))
    commit(local, ".github/workflows/unexpected.yml", "unexpected workflow\n")
    with pytest.raises(SyncStopped, match="review manually"):
        publish(local, str(remote))
    assert git(remote, "rev-parse", "main") == before


def test_older_prepared_state_is_invalidated_before_new_attempt(repos):
    upstream, local, remote = repos
    commit(upstream, "engine.txt", "first upstream update\n")
    prepare(local, str(upstream))
    assert state_path(local).exists()
    assert prepare(local, str(upstream))["changed"] is False
    assert not state_path(local).exists()


def test_bundle_publishes_from_trusted_checkout_without_executing_candidate(repos, tmp_path):
    upstream, local, remote = repos
    trusted = tmp_path / "trusted-publisher"
    git(tmp_path, "clone", str(remote), str(trusted))
    base = git(trusted, "rev-parse", "HEAD")
    commit(upstream, "engine.txt", "upstream update to validate\n")
    prepare(local, str(upstream))
    commit(local, "blueprint/web/static/index.html", "rebuilt blue UI\n")
    artifact = tmp_path / "artifact"
    package_candidate(local, artifact)
    state = read_candidate(trusted, artifact, str(upstream))
    assert git(trusted, "rev-parse", "HEAD") == base
    assert (trusted / "engine.txt").read_text() == "original engine\n"
    result = publish(trusted, str(remote), state=state)
    assert git(remote, "rev-parse", "main") == result
    assert result == git(local, "rev-parse", "HEAD")
    assert git(trusted, "rev-parse", "HEAD") == base


@pytest.mark.parametrize("key,value,error", [
    ("base", "0" * 40, "trusted workflow checkout"),
    ("candidate", "0" * 40, "Bundle head"),
    ("upstream", "--upload-pack=untrusted", "exact Git commit IDs"),
])
def test_candidate_artifact_validation(repos, tmp_path, key, value, error):
    upstream, local, remote = repos
    trusted = tmp_path / "trusted-publisher"
    git(tmp_path, "clone", str(remote), str(trusted))
    before = git(remote, "rev-parse", "main")
    commit(upstream, "engine.txt", "upstream update\n")
    prepare(local, str(upstream))
    artifact = tmp_path / "artifact"
    package_candidate(local, artifact)
    manifest = artifact / "manifest.json"
    state = json.loads(manifest.read_text())
    state[key] = value
    manifest.write_text(json.dumps(state))
    with pytest.raises(SyncStopped, match=error):
        read_candidate(trusted, artifact, str(upstream))
    assert git(remote, "rev-parse", "main") == before


def test_workflow_isolates_write_token_from_upstream_code():
    import yaml
    workflow = Path(__file__).resolve().parents[1] / ".github/workflows/sync-upstream.yml"
    doc = yaml.load(workflow.read_text(), Loader=yaml.BaseLoader)
    assert doc["permissions"] == {"contents": "read"}
    assert "workflow_dispatch" in doc["on"] and "schedule" in doc["on"]
    validation = doc["jobs"]["validate"]
    assert "permissions" not in validation
    assert all("GH_TOKEN" not in step.get("env", {}) for step in validation["steps"])
    publisher = doc["jobs"]["publish"]
    assert publisher["needs"] == "validate"
    assert publisher["permissions"] == {"contents": "write"}
    assert publisher["steps"][0]["with"]["ref"] == "${{ github.sha }}"
    assert publisher["steps"][0]["with"]["persist-credentials"] == "false"
    commands = [step["run"] for step in publisher["steps"] if "run" in step]
    assert len(commands) == 1 and "sync_upstream.py publish" in commands[0]
    assert commands[0].startswith("python3 -I ")
