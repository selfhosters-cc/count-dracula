# deploy.sh's packing step, sourced by it (and by deploy/pack.test.js, which runs it without a server).
# Run from the repo root, with deploy/local.env already sourced.

APP=/opt/count-dracula # where the server unpacks the tarball
ENV_KEYS=(PUBLIC_HOST GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET OPERATOR_EMAILS OPERATOR_CONTACT)
# Passed on when set: Continue with email stays hidden until SMTP_HOST and EMAIL_FROM are (SMTP_PORT defaults to 25;
# SMTP_USER and SMTP_PASS log in to a mail service over TLS), with PUBLIC_HOST above. TRUSTED_PROXIES is only for
# a proxy on a public address: the shared Caddy is on the LAN, which the app trusts already.
OPTIONAL_ENV_KEYS=(SMTP_HOST SMTP_PORT SMTP_USER SMTP_PASS EMAIL_FROM TRUSTED_PROXIES)

# EXTENSION_REPOS (optional, v2.2 §11): private checkouts, separated by spaces. Unset, a deploy ships the core alone.
read -ra EXTENSION_CHECKOUTS <<<"${EXTENSION_REPOS:-}"

# A checkout's Extensions: each top-level folder with an entry module (index.js), named after the folder.
extensions_in() {
  local dir
  for dir in "$1"/*/; do
    if [[ -f $dir/index.js ]]; then basename "$dir"; fi
  done
}

# Refuses (prints why, and fails) unless each checkout is a clean git checkout of at least one Extension, each
# named as the core's loader allows and in only one checkout: what ships is exactly a commit.
check_extension_repos() {
  local repo name names
  local -A seen=()
  for repo in "${EXTENSION_CHECKOUTS[@]}"; do
    if ! [[ $(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) -ef $repo ]]; then
      echo "!! EXTENSION_REPOS: $repo is not a git checkout" >&2
      return 1
    fi
    if [[ -n $(git -C "$repo" status --porcelain) ]]; then
      echo "!! EXTENSION_REPOS: $repo has uncommitted changes: commit them first" >&2
      return 1
    fi
    names=$(extensions_in "$repo")
    if [[ -z $names ]]; then
      echo "!! EXTENSION_REPOS: $repo has no Extension (a top-level folder with an index.js)" >&2
      return 1
    fi
    for name in $names; do
      if ! [[ $name =~ ^[a-z][a-z0-9]*$ ]]; then
        echo "!! EXTENSION_REPOS: $repo/$name: an Extension's name is lower-case letters and digits" >&2
        return 1
      fi
      if [[ -n ${seen[$name]:-} ]]; then
        echo "!! EXTENSION_REPOS: $name is in two checkouts, ${seen[$name]} and $repo" >&2
        return 1
      fi
      seen[$name]=$repo
    done
  done
}

# Runs the bun test of the checkout at $1 (the core's is "."); on a failure, prints the failing tests and fails.
# Every test starts a real server: on a busy machine one can pass Bun's 5 s without anything being wrong, so 20 s
# keeps a real hang failing without a slow run blocking a deploy.
tests_pass() {
  local tests
  if ! tests=$(cd "$1" && bun test --timeout 20000 2>&1); then
    grep -E '^\(fail\)' <<<"$tests" >&2 || true
    return 1
  fi
}

# Writes app.tgz, REVISION and env into the directory $1.
pack_app() {
  local stage=$1 tree repo name prefix key
  local entries=() prefixes=() more=()
  local -A sent=()
  tree=$(mktemp -d)
  git rev-parse HEAD >"$stage/REVISION"
  # Each Extension's folder, as its checkout's commit has it, at extensions/<name>/; REVISION gets each commit.
  for repo in "${EXTENSION_CHECKOUTS[@]}"; do
    for name in $(extensions_in "$repo"); do
      mkdir -p "$tree/extensions"
      git -C "$repo" archive HEAD "$name" | tar -x -C "$tree/extensions"
      entries+=("$APP/extensions/$name/index.js")
      prefixes+=("${name^^}_")
    done
    printf '%s %s\n' "$(git -C "$repo" rev-parse HEAD)" "$repo" >>"$stage/REVISION"
  done
  if ((${#entries[@]})); then more=(-C "$tree" extensions); fi
  tar -czf "$stage/app.tgz" --exclude='*.test.js' server shared public kiosk package.json deploy/loadtest.js deploy/redelete.js deploy/access-request.js deploy/import-past-counts.js "${more[@]}"
  rm -rf "$tree"
  # The service's private settings: only these keys, from local.env, never anything else in it; with Extensions,
  # EXTENSIONS (their entry modules) and each one's own <NAME>_* keys.
  sent[EXTENSION_REPOS]=1
  {
    for key in "${ENV_KEYS[@]}" "${OPTIONAL_ENV_KEYS[@]}"; do env_line "$key" "${!key:-}"; done
    if ((${#entries[@]})); then env_line EXTENSIONS "$(IFS=,; echo "${entries[*]}")"; fi
    for prefix in "${prefixes[@]}"; do
      for key in $(compgen -v "$prefix" || true); do env_line "$key" "${!key}"; done
    done
  } >"$stage/env"
}

# One line of the env file, KEY=value: none for an empty value or a key already written (pack_app's sent).
env_line() {
  [[ -n $2 && -z ${sent[$1]:-} ]] || return 0
  [[ $2 != *$'\n'* ]] || { echo "!! $1 has a line break" >&2; return 1; }
  sent[$1]=1
  printf '%s=%s\n' "$1" "$2"
}
