const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

if (process.platform !== 'darwin') process.exit(0)

const electronPath = require('electron')
const plistPath = path.join(path.dirname(electronPath), '..', 'Info.plist')
const icnsSource = path.join(__dirname, '..', 'resources', 'icon.icns')
const icnsDest = path.join(path.dirname(electronPath), '..', 'Resources', 'electron.icns')

if (!fs.existsSync(plistPath)) {
  console.log('Electron plist not found, skipping icon patch')
  process.exit(0)
}

try {
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleDisplayName 'Agents Space'" "${plistPath}"`)
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleName 'Agents Space'" "${plistPath}"`)
  execSync(`/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier com.agentspace.app" "${plistPath}"`)
  fs.copyFileSync(icnsSource, icnsDest)
  // Re-register with Launch Services to bust dock cache
  const appPath = path.join(path.dirname(electronPath), '..', '..')
  execSync(`/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "${appPath}"`)
  console.log('Patched Electron.app with custom icon, name, and bundle ID')
} catch (e) {
  console.warn('Failed to patch Electron.app:', e.message)
}
