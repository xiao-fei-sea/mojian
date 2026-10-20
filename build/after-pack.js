/**
 * electron-builder 的 afterPack 钩子。
 *
 * 背景：electron-builder 自带的 rcedit 依赖 winCodeSign 压缩包，而该压缩包含有
 * macOS 符号链接，在 Windows 上解压会因缺少权限而失败（exit status 2），
 * 导致整个打包流程中断。因此 package.json 中设置了 win.signAndEditExecutable=false
 * 跳过它，改由本钩子在打包完成后自行调用 rcedit 写入图标与版本信息。
 *
 * rcedit 从 electron-builder 的本地缓存中查找（任意一个已解压完的 winCodeSign 目录），
 * 找不到时给出提示并跳过，不影响安装包生成。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** 在 electron-builder 缓存里查找可用的 rcedit-x64.exe */
function findRcedit() {
  const base = process.env.LOCALAPPDATA;
  if (!base) return null;
  const cache = path.join(base, 'electron-builder', 'Cache', 'winCodeSign');
  if (!fs.existsSync(cache)) return null;
  for (const dir of fs.readdirSync(cache)) {
    const file = path.join(cache, dir, 'rcedit-x64.exe');
    if (fs.existsSync(file)) return file;
  }
  return null;
}

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const projectDir = context.packager.projectDir;
  const appInfo = context.packager.appInfo;
  const exePath = path.join(context.appOutDir, `${appInfo.productFilename}.exe`);
  const iconPath = path.join(projectDir, 'build', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    console.warn(`[after-pack] 未找到可执行文件：${exePath}`);
    return;
  }

  const rcedit = findRcedit();
  if (!rcedit) {
    console.warn('[after-pack] 未找到 rcedit-x64.exe，跳过图标与版本信息写入');
    return;
  }

  const args = [
    exePath,
    '--set-icon', iconPath,
    '--set-version-string', 'FileDescription', appInfo.description || appInfo.productName,
    '--set-version-string', 'ProductName', appInfo.productName,
    '--set-version-string', 'CompanyName', appInfo.companyName || '',
    '--set-file-version', appInfo.version,
    '--set-product-version', appInfo.version
  ];

  console.log(`[after-pack] 写入图标与版本信息：${exePath}`);
  execFileSync(rcedit, args, { stdio: 'inherit' });
};
