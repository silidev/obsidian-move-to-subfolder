#!/usr/bin/env node

/**
 * Generic GitHub release script for Obsidian plugins.
 * 
 * Reads project-specific settings from `release.config.json` (or uses defaults).
 * 
 * Automates:
 * 1. Build & validation commands (if configured)
 * 2. Uncommitted changes check (git status --porcelain)
 * 3. Reading version from manifest file (e.g. manifest.json)
 * 4. Duplicate tag check (ensures version is not already released)
 * 5. Extracting release notes from changelog (e.g. README.md or CHANGELOG.md)
 * 6. Pushing unpushed commits to origin
 * 7. Creating and pushing git tag
 * 8. Creating GitHub Release via GitHub API
 * 9. Uploading required & optional release assets
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const DEFAULT_CONFIG = {
  validateCmd: null,
  buildCmd: null,
  manifestPath: 'manifest.json',
  changelogPath: 'README.md',
  assets: ['manifest.json', 'main.js'],
  optionalAssets: ['styles.css'],
  gitRemote: 'origin'
};

function loadConfig() {
  const configFile = path.resolve('release.config.json');
  if (fs.existsSync(configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      console.log('⚙️  Loaded configuration from release.config.json');
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (e) {
      console.error(`❌ Failed to parse release.config.json: ${e.message}`);
      process.exit(1);
    }
  }
  console.log('⚙️  No release.config.json found; using default plugin settings.');
  return { ...DEFAULT_CONFIG };
}

function exec(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts }).trim();
}

function getGitHubToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN.trim();
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN.trim();

  // Retrieve token from Git Credential Manager
  try {
    const creds = execSync('git credential fill', {
      input: 'protocol=https\nhost=github.com\n',
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    const match = creds.match(/password=(.+)/);
    if (match && match[1]) {
      return match[1].trim();
    }
  } catch (e) {
    // ignore
  }

  return null;
}

function getRepoInfo(remote = 'origin') {
  const url = exec(`git remote get-url ${remote}`);
  const match = url.match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/);
  if (!match) {
    throw new Error(`Unable to determine GitHub owner/repo from remote URL: "${url}"`);
  }
  return { owner: match[1], repo: match[2] };
}

function extractChangelog(version, changelogPath) {
  if (!fs.existsSync(changelogPath)) return version;
  const content = fs.readFileSync(changelogPath, 'utf8');
  const escaped = version.replace(/\./g, '\\.');
  const regex = new RegExp(`(?:^|\\n)(#{2,3}\\s+\\[?v?${escaped}\\]?[^\\n]*[\\s\\S]*?)(?=(?:\\n#{2,3}\\s+)|$)`);
  const match = content.match(regex);
  if (match) {
    return match[1].trim();
  }
  return version;
}

async function main() {
  console.log('🚀 Starting release process...\n');
  const config = loadConfig();

  // 1. Run build command if configured
  if (config.buildCmd) {
    console.log(`🔨 Running build command: "${config.buildCmd}"...`);
    try {
      exec(config.buildCmd);
      console.log('✅ Build completed successfully.\n');
    } catch (err) {
      console.error('❌ Build failed:');
      console.error(err.stderr || err.stdout || err.message);
      process.exit(1);
    }
  }

  // 2. Run validation / syntax check if configured
  if (config.validateCmd) {
    console.log(`🔍 Running validation: "${config.validateCmd}"...`);
    try {
      exec(config.validateCmd);
      console.log('✅ Validation passed.\n');
    } catch (err) {
      console.error('❌ Validation check failed:');
      console.error(err.stderr || err.stdout || err.message);
      process.exit(1);
    }
  }

  // 3. Git working tree check
  const status = exec('git status --porcelain');
  if (status) {
    console.error('❌ Working tree has uncommitted changes. Please commit or stash first:\n');
    console.error(status);
    process.exit(1);
  }

  // 4. Read manifest file
  const manifestPath = path.resolve(config.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    console.error(`❌ Manifest file not found at: ${manifestPath}`);
    process.exit(1);
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    console.error(`❌ Failed to parse manifest file (${config.manifestPath}): ${e.message}`);
    process.exit(1);
  }

  const version = manifest.version;
  if (!version) {
    console.error(`❌ "version" field missing in ${config.manifestPath}.`);
    process.exit(1);
  }
  console.log(`📦 Target version: ${version}`);

  // 5. Verify required assets exist before proceeding
  const missingRequired = (config.assets || []).filter(file => !fs.existsSync(path.resolve(file)));
  if (missingRequired.length > 0) {
    console.error(`❌ Missing required release asset(s): ${missingRequired.join(', ')}`);
    process.exit(1);
  }

  // 6. Check if tag already exists locally or remotely
  const remote = config.gitRemote || 'origin';
  const localTag = exec(`git tag -l ${version}`);
  if (localTag === version) {
    console.error(`❌ Git tag "${version}" already exists locally. Bump version in ${config.manifestPath} first.`);
    process.exit(1);
  }

  const remoteTag = exec(`git ls-remote --tags ${remote} refs/tags/${version}`);
  if (remoteTag) {
    console.error(`❌ Git tag "${version}" already exists on remote "${remote}". Bump version in ${config.manifestPath} first.`);
    process.exit(1);
  }

  // 7. Check GitHub token
  const token = getGitHubToken();
  if (!token) {
    console.error('❌ Could not retrieve GitHub token.');
    console.error('   Please set GITHUB_TOKEN environment variable or configure git credentials.');
    process.exit(1);
  }

  const { owner, repo } = getRepoInfo(remote);
  console.log(`📁 GitHub repo: ${owner}/${repo}`);

  // 8. Push any unpushed commits
  try {
    console.log(`⬆️  Pushing commits to ${remote}...`);
    exec(`git push ${remote} HEAD`);
    console.log('✅ Git branch up to date.');
  } catch (err) {
    console.warn('⚠️  Could not push branch: ' + (err.stderr || err.message));
  }

  // 9. Create and push tag
  console.log(`🏷️  Creating git tag "${version}"...`);
  exec(`git tag ${version}`);
  console.log(`⬆️  Pushing tag "${version}" to ${remote}...`);
  exec(`git push ${remote} ${version}`);
  console.log('✅ Tag pushed.\n');

  // 10. Extract changelog
  const changelogPath = path.resolve(config.changelogPath);
  const changelog = extractChangelog(version, changelogPath);
  console.log('📝 Release notes:');
  console.log('--------------------------------------------------');
  console.log(changelog);
  console.log('--------------------------------------------------\n');

  // 11. Create GitHub Release
  console.log('🌐 Creating release on GitHub...');
  const createRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'GenericObsidianPluginReleaseScript'
    },
    body: JSON.stringify({
      tag_name: version,
      name: version,
      body: changelog,
      draft: false,
      prerelease: false
    })
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    console.error(`❌ Failed to create GitHub release (${createRes.status}): ${errText}`);
    process.exit(1);
  }

  const releaseData = await createRes.json();
  console.log(`✅ Release created: ${releaseData.html_url}\n`);

  // 12. Upload assets (required + optional)
  const uploadBaseUrl = releaseData.upload_url.replace(/\{\?name,label\}/, '');
  const filesToUpload = [...(config.assets || [])];
  for (const opt of (config.optionalAssets || [])) {
    if (fs.existsSync(path.resolve(opt)) && !filesToUpload.includes(opt)) {
      filesToUpload.push(opt);
    }
  }

  for (const file of filesToUpload) {
    const filePath = path.resolve(file);
    const fileBytes = fs.readFileSync(filePath);
    console.log(`📤 Uploading ${file}...`);
    const uploadRes = await fetch(`${uploadBaseUrl}?name=${encodeURIComponent(file)}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'GenericObsidianPluginReleaseScript'
      },
      body: fileBytes
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error(`❌ Failed to upload asset ${file} (${uploadRes.status}): ${errText}`);
    } else {
      console.log(`✅ ${file} uploaded.`);
    }
  }

  console.log(`\n🎉 Successfully released ${version}!`);
  console.log(`🔗 Release URL: ${releaseData.html_url}`);
}

main().catch(err => {
  console.error('❌ Unexpected error:', err);
  process.exit(1);
});
