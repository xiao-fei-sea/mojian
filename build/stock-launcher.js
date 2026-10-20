/**
 * 打包收尾：把启动器换回 Electron 原版二进制。
 *
 * 背景：Windows「智能应用控制」(Smart App Control) 按文件哈希信誉决定放行哪些程序。
 * electron-packager 会用 rcedit 改写 electron.exe（写入图标、版本信息），
 * 哈希一变、又没有代码签名，就会被「智能应用控制」拦下、完全无法启动。
 * 原版 electron.exe 的哈希是有信誉的，可以正常启动；而且窗口/任务栏图标由
 * 主进程 BrowserWindow 的 icon 指定，运行时的图标不受影响。
 * 代价：资源管理器里 .exe 文件本身显示的是 Electron 默认图标。
 * 若希望 exe 也带自定义图标，只能给应用做代码签名，或关闭「智能应用控制」。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const stock = path.join(__dirname, '..', 'node_modules', 'electron', 'dist', 'electron.exe');
const target = path.join(__dirname, '..', 'dist', 'MoJian-win32-x64', 'MoJian.exe');

if (!fs.existsSync(stock)) {
  console.error(`未找到原版 Electron：${stock}`);
  process.exit(1);
}
if (!fs.existsSync(target)) {
  console.error(`未找到打包产物：${target}`);
  process.exit(1);
}

fs.copyFileSync(stock, target);
console.log('已把启动器换回 Electron 原版二进制（避免被智能应用控制拦截）');
