import path from 'path'
import { z } from 'zod'
import chalk from 'chalk'
import fs from 'fs-extra'
import prompts from 'prompts'
import { execa } from 'execa'
import { Command } from 'commander'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const PROFILE_SCHEMA = z.object({
  extends: z.string().optional(),
  taps: z.array(z.string()).optional(),
  brews: z.array(z.string()).optional(),
  casks: z.array(z.string()).optional(),
  mas: z.array(z.object({ name: z.string(), id: z.string() })).optional(),
  home_dirs: z.array(z.string()).optional(),
  macos_settings: z.array(z.object({
    domain: z.string(),
    key: z.string(),
    value: z.any(),
    type: z.enum(['bool', 'string', 'int', 'float'])
  })).optional(),
  hooks: z.object({
    'pre-run': z.array(z.string()).optional(),
    'post-run': z.array(z.string()).optional(),
    'on-change': z.array(z.string()).optional()
  }).optional(),
  secrets: z.record(z.object({
    manager: z.enum(['doppler']),
    key: z.string()
  })).optional()
})

type Profile = z.infer<typeof PROFILE_SCHEMA>

const CONFIG_PATH = path.resolve(__dirname, '../config/profiles.json')
const DOTFILES_SRC = path.resolve(__dirname, '../dotfiles')

async function loadProfiles() {
  const data = await fs.readJson(CONFIG_PATH)
  return z.record(PROFILE_SCHEMA).parse(data)
}

function mergeProfiles(base: Profile, override: Profile): Profile {
  return {
    taps: [...(base.taps || []), ...(override.taps || [])],
    brews: [...(base.brews || []), ...(override.brews || [])],
    casks: [...(base.casks || []), ...(override.casks || [])],
    mas: [...(base.mas || []), ...(override.mas || [])],
    home_dirs: [...(base.home_dirs || []), ...(override.home_dirs || [])],
    macos_settings: [...(base.macos_settings || []), ...(override.macos_settings || [])],
    hooks: {
      'pre-run': [...(base.hooks?.['pre-run'] || []), ...(override.hooks?.['pre-run'] || [])],
      'post-run': [...(base.hooks?.['post-run'] || []), ...(override.hooks?.['post-run'] || [])],
      'on-change': [...(base.hooks?.['on-change'] || []), ...(override.hooks?.['on-change'] || [])]
    },
    secrets: { ...(base.secrets || {}), ...(override.secrets || {}) }
  }
}

const program = new Command()

program
  .name('macmuffin')
  .description('A modular, interactive dotfile and machine setup framework.')
  .version('0.1.0')

program
  .command('sync')
  .description('Sync your machine with a profile')
  .option('-p, --profile <name>', 'The profile to use (e.g., personal, work)')
  .action(async (options) => {
    const profiles = await loadProfiles()
    let profileName = options.profile

    if (!profileName) {
      const response = await prompts({
        type: 'select',
        name: 'profile',
        message: 'Which profile would you like to sync?',
        choices: Object.keys(profiles).filter(p => p !== 'base').map(p => ({ title: p, value: p }))
      })
      profileName = response.profile
    }

    if (!profileName || !profiles[profileName]) {
      console.error(chalk.red(`Profile "${profileName}" not found.`))
      process.exit(1)
    }

    const baseProfile = profiles.base || {}
    const selectedProfile = profiles[profileName]
    const finalProfile = mergeProfiles(baseProfile, selectedProfile)
    let hasChanges = false

    console.log(chalk.blue(`🐶 Syncing with profile: ${chalk.bold(profileName)}`))

    // Execute Hooks: pre-run
    if (finalProfile.hooks?.['pre-run']) {
      for (const hook of finalProfile.hooks['pre-run']) {
        console.log(chalk.gray(`Running pre-run hook: ${hook}`))
        await execa('bash', ['-c', hook], { stdio: 'inherit' })
      }
    }

    // Module: Home Dirs
    if (finalProfile.home_dirs) {
      console.log(chalk.cyan('📂 Ensuring home folder structure...'))
      for (const dir of finalProfile.home_dirs) {
        const expandedPath = dir.replace('~', process.env.HOME || '')
        if (!await fs.pathExists(expandedPath)) {
          await fs.ensureDir(expandedPath)
          hasChanges = true
        }
      }
    }

    // Module: Package Manager (Taps)
    if (finalProfile.taps) {
      console.log(chalk.cyan('🍺 Tapping Homebrew repositories...'))
      const { stdout: existingTaps } = await execa('brew', ['tap'])
      const tapList = existingTaps.split('\n')
      for (const tap of finalProfile.taps) {
        if (!tapList.includes(tap)) {
          console.log(chalk.gray(`Tapping ${tap}...`))
          try {
            await execa('brew', ['tap', tap], { stdio: 'inherit' })
            hasChanges = true
          } catch (e) {
            console.warn(chalk.yellow(`Could not tap ${tap}: ${e.message}`))
          }
        }
      }
    }

    // Module: Package Manager (Brews)
    if (finalProfile.brews) {
      console.log(chalk.cyan('🍺 Installing/Updating Homebrew formulas...'))
      const { stdout: installedBrews } = await execa('brew', ['list', '--formula'])
      const installedList = installedBrews.split('\n')
      const { stdout: outdatedBrewsJson } = await execa('brew', ['outdated', '--json'])
      const outdatedList = JSON.parse(outdatedBrewsJson).formulae.map((f: any) => f.name)

      const toInstall = finalProfile.brews.filter(b => !installedList.includes(b))
      const toUpgrade = finalProfile.brews.filter(b => installedList.includes(b) && outdatedList.includes(b))

      if (toInstall.length > 0) {
        console.log(chalk.gray(`Installing ${toInstall.length} formulas...`))
        try {
          await execa('brew', ['install', ...toInstall], { stdio: 'inherit' })
          hasChanges = true
        } catch (e) {
          console.warn(chalk.yellow(`Brew install issue: ${e.message}`))
        }
      }

      if (toUpgrade.length > 0) {
        console.log(chalk.gray(`Upgrading ${toUpgrade.length} formulas...`))
        try {
          await execa('brew', ['upgrade', ...toUpgrade], { stdio: 'inherit' })
          hasChanges = true
        } catch (e) {
          console.warn(chalk.yellow(`Brew upgrade issue: ${e.message}`))
        }
      }
    }

    // Module: Package Manager (Casks)
    if (finalProfile.casks) {
      console.log(chalk.cyan('🍺 Installing/Updating Homebrew casks...'))
      const { stdout: installedCasks } = await execa('brew', ['list', '--cask'])
      const installedList = installedCasks.split('\n')
      const { stdout: outdatedCasksJson } = await execa('brew', ['outdated', '--cask', '--json'])
      const outdatedList = JSON.parse(outdatedCasksJson).casks.map((c: any) => c.token)

      const toInstall = finalProfile.casks.filter(c => !installedList.includes(c))
      const toUpgrade = finalProfile.casks.filter(c => installedList.includes(c) && outdatedList.includes(c))

      if (toInstall.length > 0) {
        console.log(chalk.gray(`Installing ${toInstall.length} casks...`))
        try {
          await execa('brew', ['install', '--cask', ...toInstall], { stdio: 'inherit' })
          hasChanges = true
        } catch (e) {
          console.warn(chalk.yellow(`Cask install issue: ${e.message}`))
        }
      }

      if (toUpgrade.length > 0) {
        console.log(chalk.gray(`Upgrading ${toUpgrade.length} casks...`))
        try {
          await execa('brew', ['upgrade', '--cask', ...toUpgrade], { stdio: 'inherit' })
          hasChanges = true
        } catch (e) {
          console.warn(chalk.yellow(`Cask upgrade issue: ${e.message}`))
        }
      }
    }

    const isMac = process.platform === 'darwin'

    // Module: Package Manager (MAS)
    if (finalProfile.mas) {
      console.log(chalk.cyan('🍎 Installing Mac App Store apps...'))
      if (!isMac) {
        console.log(chalk.yellow('[Skipping] Mac App Store apps can only be installed on macOS.'))
      } else {
        for (const app of finalProfile.mas) {
          console.log(chalk.gray(`Installing ${app.name}...`))
          try {
            await execa('mas', ['install', app.id], { stdio: 'inherit' })
            hasChanges = true
          } catch (e) {
            console.warn(chalk.yellow(`Could not install ${app.name}: ${e.message}`))
          }
        }
      }
    }

    // Module: Secrets (Doppler) & SSH Management
    if (finalProfile.secrets) {
      console.log(chalk.cyan('🔐 Fetching secrets from Doppler...'))
      for (const [name, secret] of Object.entries(finalProfile.secrets)) {
        if (name === 'ssh_key') {
          console.log(chalk.gray(`Setting up SSH key for ${profileName}...`))
          try {
            const { stdout: secretValue } = await execa('doppler', ['secrets', 'get', secret.key, '--plain', '--project', 'dotfiles', '--config', profileName])
            const sshPath = path.join(process.env.HOME!, '.ssh', `id_rsa_${profileName}`)
            await fs.ensureDir(path.dirname(sshPath))
            
            // Check if key already exists and matches
            let shouldWrite = true
            if (await fs.pathExists(sshPath)) {
              const currentVal = await fs.readFile(sshPath, 'utf8')
              if (currentVal === secretValue) shouldWrite = false
            }

            if (shouldWrite) {
              await fs.writeFile(sshPath, secretValue, { mode: 0o600 })
              console.log(chalk.green(`✓ SSH key saved to ${sshPath}`))
              hasChanges = true
            } else {
              console.log(chalk.gray('✓ SSH key is already up to date.'))
            }
          } catch (e) {
            console.warn(chalk.yellow(`Could not fetch SSH key: ${e.message}`))
          }
        }
      }
    }

    // Module: Dotfile Symlinking
    if (await fs.pathExists(DOTFILES_SRC)) {
      console.log(chalk.cyan('🔗 Symlinking dotfiles...'))
      const files = await fs.readdir(DOTFILES_SRC)
      for (const file of files) {
        if (file === '.git' || file === '.DS_Store' || file === '.gitkeep') continue
        const src = path.join(DOTFILES_SRC, file)
        const dest = path.join(process.env.HOME!, `.${file}`)
        
        let shouldLink = true
        try {
          const stats = await fs.lstat(dest)
          if (stats.isSymbolicLink()) {
            const target = await fs.readlink(dest)
            if (target === src) shouldLink = false
          }
        } catch (e) {}

        if (shouldLink) {
          console.log(chalk.gray(`Linking .${file} -> ${dest}`))
          await fs.remove(dest).catch(() => {})
          await fs.ensureSymlink(src, dest)
          hasChanges = true
        }
      }
    }

    // Module: OSX Settings
    if (finalProfile.macos_settings) {
      console.log(chalk.cyan('🖥️ Applying macOS settings...'))
      if (!isMac) {
        console.log(chalk.yellow('[Skipping] macOS settings can only be applied on macOS.'))
      } else {
        for (const setting of finalProfile.macos_settings) {
          try {
            // We could check current value using `defaults read`, but for now we just write.
            // writing is mostly idempotent anyway.
            const args = ['write', setting.domain, setting.key, `-${setting.type}`, String(setting.value)]
            await execa('defaults', args, { stdio: 'inherit' })
            hasChanges = true
          } catch (e) {
            console.warn(chalk.yellow(`Could not apply setting ${setting.key}: ${e.message}`))
          }
        }
      }
    }

    // Execute Hooks: on-change
    if (hasChanges && finalProfile.hooks?.['on-change']) {
      console.log(chalk.blue('🔄 Changes detected. Running on-change hooks...'))
      for (const hook of finalProfile.hooks['on-change']) {
        console.log(chalk.gray(`Running on-change hook: ${hook}`))
        await execa('bash', ['-c', hook], { stdio: 'inherit' })
      }
    }

    // Execute Hooks: post-run
    if (finalProfile.hooks?.['post-run']) {
      for (const hook of finalProfile.hooks['post-run']) {
        console.log(chalk.gray(`Running post-run hook: ${hook}`))
        await execa('bash', ['-c', hook], { stdio: 'inherit' })
      }
    }

    console.log(chalk.green(`✨ Macmuffin sync complete for profile: ${profileName}`))

    // Post-Sync Git Flow
    const { pushChanges } = await prompts({
      type: 'confirm',
      name: 'pushChanges',
      message: 'Would you like to stage, commit, and push any changes to your configuration repo?',
      initial: true
    })

    if (pushChanges) {
      try {
        await execa('git', ['add', '.'], { stdio: 'inherit' })
        const { commitMsg } = await prompts({
          type: 'text',
          name: 'commitMsg',
          message: 'Commit message:',
          initial: `macmuffin sync: ${profileName} update`
        })
        await execa('git', ['commit', '-m', commitMsg], { stdio: 'inherit' })
        await execa('git', ['push', 'origin', 'HEAD'], { stdio: 'inherit' })
        console.log(chalk.green('🚀 Changes pushed successfully!'))
      } catch (e) {
        console.log(chalk.yellow('⚠️ No changes to commit or push failed.'))
      }
    }
  })

program.parse()
