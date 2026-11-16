#!/usr/bin/env bash
# Publishes _site/ to the gh-pages branch (used by .github/workflows/pages.yml).
#   deploy.sh publish <branch>   default branch -> site root, others -> preview/<slug>/
#   deploy.sh remove  <branch>   delete preview/<slug>/
set -euo pipefail
cmd="$1"; branch="$2"
default="${DEFAULT_BRANCH:-main}"
slug="$(echo "$branch" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+|-+$//g')"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

git worktree remove --force pages >/dev/null 2>&1 || true
rm -rf pages
git worktree prune
if git ls-remote --exit-code --heads origin gh-pages >/dev/null 2>&1; then
  git fetch --depth=1 origin gh-pages
  git worktree add --detach pages FETCH_HEAD
else
  git worktree add --detach pages
  (cd pages && git checkout --orphan gh-pages && git rm -rfq . && git clean -fdxq)
fi

if [ "$cmd" = "publish" ]; then
  if [ "$branch" = "$default" ]; then
    find pages -mindepth 1 -maxdepth 1 ! -name .git ! -name preview -exec rm -rf {} +
    cp -R _site/. pages/
    target=""
  else
    rm -rf "pages/preview/$slug"
    mkdir -p "pages/preview/$slug"
    cp -R _site/. "pages/preview/$slug/"
    date -u +"%Y-%m-%d %H:%M UTC · ${GITHUB_SHA:0:7}" > "pages/preview/$slug/.deployed"
    target="preview/$slug/"
  fi
elif [ "$cmd" = "remove" ]; then
  rm -rf "pages/preview/$slug"
  target=""
else
  echo "unknown command $cmd" >&2; exit 1
fi

node scripts/preview-index.mjs pages/preview
touch pages/.nojekyll

cd pages
git add -A
if git diff --cached --quiet; then
  echo "Nothing changed."
else
  git commit -qm "$cmd $branch @ ${GITHUB_SHA:-local}"
  git push origin HEAD:gh-pages
fi

owner="${GITHUB_REPOSITORY%%/*}"; repo="${GITHUB_REPOSITORY##*/}"
url="https://$(echo "$owner" | tr '[:upper:]' '[:lower:]').github.io/$repo/$target"
echo "url=$url" >> "${GITHUB_OUTPUT:-/dev/null}"
if [ "$cmd" = "publish" ]; then
  {
    echo "### 🚀 Deployed \`$branch\`"
    echo ""
    echo "$url"
    for d in ../_site/*/; do
      a="$(basename "$d")"
      echo "- [$a]($url$a/)"
    done
  } >> "${GITHUB_STEP_SUMMARY:-/dev/null}"
fi
