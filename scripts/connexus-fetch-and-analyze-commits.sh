#!/usr/bin/env bash
# Fetch Connexus GitHub repos (zip + shallow clone) and collect commits in ticket date window.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WORKDIR="/tmp/connexus-repos-$(date +%Y%m%d-%H%M%S)"
ZIPS_DIR="$WORKDIR/zips"
EXTRACT_DIR="$WORKDIR/extracted"
GIT_DIR="$WORKDIR/git"
OUTPUT_DIR="$ROOT_DIR/tmp"
COMMITS_OUT="$OUTPUT_DIR/connexus-sprint34-commit-ids.json"
MANIFEST_OUT="$OUTPUT_DIR/connexus-sprint34-repo-fetch-manifest.json"

# Date window from connexus-sprint34-done.csv (min created → max updated/resolution)
SINCE="2026-01-09T00:00:00+05:30"
UNTIL="2026-07-02T23:59:59+05:30"

mkdir -p "$ZIPS_DIR" "$EXTRACT_DIR" "$GIT_DIR" "$OUTPUT_DIR"

clone_repo_for_commits() {
  local full="$1"
  local clone_path="$2"
  local branch="$3"
  rm -rf "$clone_path"
  mkdir -p "$(dirname "$clone_path")"

  if git clone --quiet --branch "$branch" --single-branch --shallow-since="$SINCE" \
    "https://x-access-token:${GITHUB_TOKEN}@github.com/${full}.git" \
    "$clone_path" 2>/dev/null; then
    echo "shallow-since"
    return 0
  fi

  if git clone --quiet --branch "$branch" --single-branch --depth=5000 \
    "https://x-access-token:${GITHUB_TOKEN}@github.com/${full}.git" \
    "$clone_path" 2>/dev/null; then
    echo "depth-5000"
    return 0
  fi

  if git clone --quiet --branch "$branch" --single-branch \
    "https://x-access-token:${GITHUB_TOKEN}@github.com/${full}.git" \
    "$clone_path" 2>/dev/null; then
    echo "full"
    return 0
  fi

  echo "failed"
  return 1
}

fetch_commits_via_api() {
  local full="$1"
  local out_file="$2"
  local branch="$3"
  local since_utc until_utc page=1
  since_utc=$(python3 - <<PY
from datetime import datetime
from zoneinfo import ZoneInfo
dt = datetime.fromisoformat("$SINCE")
print(dt.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ'))
PY
)
  until_utc=$(python3 - <<PY
from datetime import datetime
from zoneinfo import ZoneInfo
dt = datetime.fromisoformat("$UNTIL")
print(dt.astimezone(ZoneInfo('UTC')).strftime('%Y-%m-%dT%H:%M:%SZ'))
PY
)
  : > "$out_file"
  while true; do
    resp_headers=$(mktemp)
    body_file=$(mktemp)
    if ! curl -fsSL -D "$resp_headers" \
      -H "Authorization: Bearer $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${full}/commits?sha=${branch}&since=${since_utc}&until=${until_utc}&per_page=100&page=${page}" \
      -o "$body_file"; then
      rm -f "$resp_headers" "$body_file"
      break
    fi
    python3 - <<PY >> "$out_file"
import json
with open("$body_file") as f:
    data = json.load(f)
if not isinstance(data, list) or not data:
    raise SystemExit(0)
for c in data:
    sha = c.get("sha")
    if sha:
        print(sha)
PY
    count=$(python3 - <<PY
import json
with open("$body_file") as f:
    data = json.load(f)
print(len(data) if isinstance(data, list) else 0)
PY
)
    if [[ "$count" -lt 100 ]] || ! grep -qi '^link:.*rel="next"' "$resp_headers"; then
      rm -f "$resp_headers" "$body_file"
      break
    fi
    rm -f "$resp_headers" "$body_file"
    page=$((page + 1))
  done
  sort -u -o "$out_file" "$out_file"
}

echo "==> Resolving GitHub token and repo list..."
eval "$(bash "$ROOT_DIR/scripts/connexus-github-env.sh")"

echo "==> Workdir: $WORKDIR"
echo "==> Primary branch (from DB): $PRIMARY_BRANCH"
echo "==> Commit window: $SINCE → $UNTIL"

manifest='{"workdir":"'"$WORKDIR"'","since":"'"$SINCE"'","until":"'"$UNTIL"'","primaryBranch":"'"$PRIMARY_BRANCH"'","repos":['
first_repo=true

for full in $REPOS; do
  name="${full##*/}"
  echo ""
  echo "==> Processing $full"

  # Default branch
  default_branch=$(curl -fsSL \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$full" | python3 -c "import sys,json; print(json.load(sys.stdin).get('default_branch','main'))")

  echo "    github default branch: $default_branch"
  echo "    primary branch (analysis): $PRIMARY_BRANCH"

  # --- ZIP download + extract + delete (primary branch) ---
  zip_path="$ZIPS_DIR/${name}.zip"
  if ! curl -fsSL \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/$full/zipball/$PRIMARY_BRANCH" \
    -o "$zip_path"; then
    echo "    WARN: zip for branch $PRIMARY_BRANCH failed — repo may not have that branch"
    zip_path=""
  fi

  repo_extract="$EXTRACT_DIR/$name"
  mkdir -p "$repo_extract"
  if [[ -n "$zip_path" && -f "$zip_path" ]]; then
    unzip -q -o "$zip_path" -d "$repo_extract"
    rm -f "$zip_path"

  # GitHub zipballs unpack to owner-repo-sha/ — flatten one level
  inner=$(find "$repo_extract" -mindepth 1 -maxdepth 1 -type d | head -1)
  if [[ -n "$inner" && "$inner" != "$repo_extract" ]]; then
    shopt -s dotglob
    mv "$inner"/* "$repo_extract/" 2>/dev/null || true
    rmdir "$inner" 2>/dev/null || true
    shopt -u dotglob
  fi
  fi

  # --- Clone for git history on primary branch only ---
  clone_path="$GIT_DIR/$name"
  commits_file="$WORKDIR/${name}-commits.txt"
  clone_method="none"

  if clone_method=$(clone_repo_for_commits "$full" "$clone_path" "$PRIMARY_BRANCH"); then
    (
      cd "$clone_path"
      git log "$PRIMARY_BRANCH" --since="$SINCE" --until="$UNTIL" --format='%H'
    ) | sort -u > "$commits_file"
  else
    echo "    clone on branch $PRIMARY_BRANCH failed — falling back to GitHub commits API"
    clone_method="api"
    fetch_commits_via_api "$full" "$commits_file" "$PRIMARY_BRANCH"
  fi

  commit_count=$(wc -l < "$commits_file" | tr -d ' ')
  echo "    clone method: $clone_method"
  echo "    commits in window: $commit_count"

  # Manifest entry
  if [[ "$first_repo" == true ]]; then first_repo=false; else manifest+=','; fi
  manifest+='{"repo":"'"$full"'","name":"'"$name"'","githubDefaultBranch":"'"$default_branch"'","primaryBranch":"'"$PRIMARY_BRANCH"'","extractedPath":"'"$repo_extract"'","gitPath":"'"$clone_path"'","cloneMethod":"'"$clone_method"'","commitsFile":"'"$commits_file"'","commitCount":'"$commit_count"'}'
done

manifest+='],"note":"Zipballs and git log scoped to toolchain primaryDefaultBranch from DB."}'

# Write manifest
echo "$manifest" | python3 -m json.tool > "$MANIFEST_OUT"

# Build commits JSON from per-repo commit files
python3 - <<PY
import json, os, glob

workdir = "$WORKDIR"
since = "$SINCE"
until = "$UNTIL"
primary_branch = "$PRIMARY_BRANCH"
repos = "$REPOS".split()

out = {"since": since, "until": until, "primaryBranch": primary_branch, "workdir": workdir, "repos": [], "allCommitIds": []}
all_ids = set()

for full in repos:
    name = full.split("/")[-1]
    commits_file = os.path.join(workdir, f"{name}-commits.txt")
    ids = []
    if os.path.isfile(commits_file):
        with open(commits_file) as f:
            ids = [line.strip() for line in f if line.strip()]
    all_ids.update(ids)
    out["repos"].append({"repo": full, "commitCount": len(ids), "commitIds": ids})

out["totalCommits"] = len(all_ids)
out["allCommitIds"] = sorted(all_ids)

with open("$COMMITS_OUT", "w") as f:
    json.dump(out, f, indent=2)

plain_out = "$OUTPUT_DIR/connexus-sprint34-commit-ids.txt"
with open(plain_out, "w") as f:
    for cid in out["allCommitIds"]:
        f.write(cid + "\n")

print(json.dumps({"output": "$COMMITS_OUT", "plainText": plain_out, "manifest": "$MANIFEST_OUT", "totalCommits": out["totalCommits"], "repos": len(out["repos"])}, indent=2))
PY

echo ""
echo "==> Done."
echo "    Manifest: $MANIFEST_OUT"
echo "    Commits:  $COMMITS_OUT"
echo "    Workdir:  $WORKDIR (outside AIDOS)"
