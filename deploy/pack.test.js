// deploy.sh's packing and checking steps (deploy/pack.sh), run here without a server: what goes into the
// tarball, REVISION and /etc/count-dracula/env, and when the private checkouts in EXTENSION_REPOS stop a deploy
// (v2.2 §11). The checkouts are throwaway git repos holding a copy of the fixture Extension.
import { describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const root = join(import.meta.dir, '..')
const settings = {
  PUBLIC_HOST: 'count-dracula.example.com',
  GOOGLE_CLIENT_ID: 'id.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'secret',
  OPERATOR_EMAILS: 'operator@count-dracula.example.com',
  OPERATOR_CONTACT: 'privacy@count-dracula.example.com',
  SMTP_HOST: 'smtp.example.com',
  LXC_IP: '192.0.2.31', // in local.env, never sent to the server
  FIXTURE_TOKEN: 'fixture-secret',
}
const coreEnv = [
  'PUBLIC_HOST=count-dracula.example.com',
  'GOOGLE_CLIENT_ID=id.apps.googleusercontent.com',
  'GOOGLE_CLIENT_SECRET=secret',
  'OPERATOR_EMAILS=operator@count-dracula.example.com',
  'OPERATOR_CONTACT=privacy@count-dracula.example.com',
  'SMTP_HOST=smtp.example.com',
]

// Runs a few lines of bash with deploy/pack.sh sourced, from the repo root, as deploy.sh does.
async function bash(script, env = {}) {
  const proc = Bun.spawn(['bash', '-euo', 'pipefail', '-c', `source deploy/pack.sh\n${script}`], {
    cwd: root,
    env: { PATH: `${dirname(process.execPath)}:${process.env.PATH}`, HOME: process.env.HOME, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited])
  return { out, err, code }
}

async function git(dir, ...args) {
  const proc = Bun.spawn(['git', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' })
  const [out, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
  if (code !== 0) throw new Error(`git ${args.join(' ')} failed`)
  return out.trim()
}

// A private checkout with the fixture Extension at fixture/, committed. Returns its path and commit.
async function checkout(files = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'count-dracula-private-'))
  cpSync(join(root, 'test/fixture-extension'), join(dir, 'fixture'), { recursive: true })
  mkdirSync(join(dir, 'test'))
  writeFileSync(join(dir, 'test/helper.js'), 'export const helper = 1\n') // no index.js: not an Extension
  for (const [path, text] of Object.entries(files)) writeFileSync(join(dir, path), text)
  await git(dir, 'init', '-q')
  await git(dir, 'add', '.')
  await git(dir, 'commit', '-q', '-m', 'private')
  return { dir, commit: await git(dir, 'rev-parse', 'HEAD') }
}

async function pack(env) {
  const stage = mkdtempSync(join(tmpdir(), 'count-dracula-stage-'))
  const result = await bash(`pack_app ${stage}`, env)
  const listing = Bun.spawnSync(['tar', '-tzf', join(stage, 'app.tgz')]).stdout.toString().split('\n').filter(Boolean)
  const read = (name) => readFileSync(join(stage, name), 'utf8')
  return { ...result, listing, env: read('env'), revision: read('REVISION') }
}

const coreCommit = () => git(root, 'rev-parse', 'HEAD')

describe('deploy/pack.sh pack_app (the tarball, REVISION and the env file)', () => {
  test('with EXTENSION_REPOS unset: the core alone, no test files, and only the listed keys', async () => {
    const packed = await pack(settings)

    expect(packed.code).toBe(0)
    const tops = new Set(packed.listing.map((path) => path.replace(/^\.\//, '').split('/')[0]))
    expect([...tops].sort()).toEqual(['deploy', 'kiosk', 'package.json', 'public', 'server', 'shared'])
    expect(packed.listing).toContain('server/main.js')
    expect(packed.listing.filter((path) => path.endsWith('.test.js'))).toEqual([])
    expect(packed.env).toBe(`${coreEnv.join('\n')}\n`)
    expect(packed.revision).toBe(`${await coreCommit()}\n`)
  })

  test("with a checkout of the fixture: extensions/fixture/ without its tests, EXTENSIONS and FIXTURE_* in env, both commits in REVISION", async () => {
    const repo = await checkout()

    const packed = await pack({ ...settings, EXTENSION_REPOS: repo.dir })

    expect(packed.code).toBe(0)
    const shipped = packed.listing.filter((path) => path.startsWith('extensions/')).filter((path) => !path.endsWith('/'))
    expect(shipped.sort()).toEqual(['extensions/fixture/index.js', 'extensions/fixture/public/index.html', 'extensions/fixture/public/page.js', 'extensions/fixture/public/slots.js'])
    expect(packed.listing).toContain('server/main.js')
    expect(packed.env).toBe(`${[...coreEnv, 'EXTENSIONS=/opt/count-dracula/extensions/fixture/index.js', 'FIXTURE_TOKEN=fixture-secret'].join('\n')}\n`)
    expect(packed.revision).toBe(`${await coreCommit()}\n${repo.commit} ${repo.dir}\n`)
  })
})

describe('deploy/pack.sh check_extension_repos (before the tests, the version and the tarball)', () => {
  test('a clean checkout of the fixture is fine, and so is EXTENSION_REPOS unset', async () => {
    const repo = await checkout()

    expect((await bash('check_extension_repos', { EXTENSION_REPOS: repo.dir })).code).toBe(0)
    expect((await bash('check_extension_repos')).code).toBe(0)
  })

  test('a dirty checkout is refused, as is an uncommitted new file', async () => {
    const edited = await checkout()
    writeFileSync(join(edited.dir, 'fixture/index.js'), '// edited\n', { flag: 'a' })
    const added = await checkout()
    writeFileSync(join(added.dir, 'fixture/new.js'), 'export {}\n')

    for (const repo of [edited, added]) {
      const { err, code } = await bash('check_extension_repos', { EXTENSION_REPOS: repo.dir })
      expect(code).not.toBe(0)
      expect(err).toContain(`${repo.dir} has uncommitted changes`)
    }
  })

  test("refuses a path that isn't a checkout, one with no Extension, a name the core can't load, and a name twice", async () => {
    const plain = mkdtempSync(join(tmpdir(), 'count-dracula-plain-'))
    const empty = await checkout()
    await git(empty.dir, 'rm', '-q', '-r', 'fixture')
    await git(empty.dir, 'commit', '-q', '-m', 'none')
    const badName = await checkout()
    await git(badName.dir, 'mv', 'fixture', 'Fix_ture')
    await git(badName.dir, 'commit', '-q', '-m', 'renamed')
    const [one, two] = [await checkout(), await checkout()]

    for (const [repos, says] of [
      [plain, 'is not a git checkout'],
      [empty.dir, 'has no Extension'],
      [badName.dir, 'Fix_ture'],
      [`${one.dir} ${two.dir}`, 'fixture is in two checkouts'],
    ]) {
      const { err, code } = await bash('check_extension_repos', { EXTENSION_REPOS: repos })
      expect(code).not.toBe(0)
      expect(err).toContain(says)
    }
  })
})

describe('deploy/pack.sh tests_pass (each checkout runs its own bun test)', () => {
  test("the fixture checkout's tests run, and pass", async () => {
    const repo = await checkout()

    const { code } = await bash(`tests_pass ${repo.dir}`)

    expect(code).toBe(0)
  })

  test('a failing test stops the deploy, and names the test', async () => {
    const repo = await checkout({ 'fixture/b.test.js': "import { expect, test } from 'bun:test'\ntest('a private test that fails', () => expect(1).toBe(2))\n" })

    const { err, code } = await bash(`tests_pass ${repo.dir}`)

    expect(code).not.toBe(0)
    expect(err).toContain('(fail) a private test that fails')
  })
})
