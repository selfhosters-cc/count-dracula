// Every deploy is a release (deploy/deploy.sh): the patch number goes up by one, so a page's version (its footer,
// the door's ☰, /operator) says which release it was loaded from. Rewrites package.json and prints the new version:
//   bun deploy/bump-version.js package.json
const path = process.argv[2]
if (!path) {
  console.error('Usage: bun deploy/bump-version.js package.json')
  process.exit(2)
}
const pkg = await Bun.file(path).json()
const [major, minor, patch] = String(pkg.version).split('.').map(Number)
if (![major, minor, patch].every(Number.isInteger)) {
  console.error(`!! package.json's version isn't major.minor.patch: ${pkg.version}`)
  process.exit(1)
}
pkg.version = `${major}.${minor}.${patch + 1}`
await Bun.write(path, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(pkg.version)
