# 本机密钥存储边界与复验

`electron/secret-vault.js` 是供 Electron 主进程和普通 Node 本机客户端共用的同步模块。默认使用 Windows DPAPI `CurrentUser`；不是 Base64 编码代替加密，不依赖 Electron `safeStorage`，也不提供 Linux 明文降级。此文件说明模块契约，不代表调用方迁移、配置界面和真实凭据已经验收。

## 导出契约

```js
const { protectString, unprotectString, createVault } = require('./electron/secret-vault');
const record = protectString(secret, purpose);
const secretAgain = unprotectString(record, purpose);
const vault = createVault(absoluteFilePath);
```

- `protectString(text, purpose)` 返回严格的 `{version: 1, algorithm: 'dpapi-current-user', ciphertext: '<base64>'}`。
- `unprotectString(record, purpose)` 返回字符串。记录多余字段、版本/算法错误、非规范 Base64、损坏密文及用途不符均拒绝。
- `createVault(file, {protect?, unprotect?})` 要求绝对路径。两个注入函数必须成对、同步；仅用于隔离测试，生产入口不得向用户开放保护器选择。
- `vault.get(name)` 返回字符串；缺项返回 `null`。`set(name, value)` 成功返回 `true`。`remove(name)` 返回原来是否存在。`has(name)` 仅检查有效记录是否存在，不保证它一定能解密。
- `vault.status()` 返回 `{version: 1, algorithm, available, count, names}`；`names` 是排序后的逻辑项名，不是密钥值。不含明文、密文或供应商响应。第一次调用以新生成的合成值在内存做一次保护/解保护探针并缓存 `available`；不解密已有项。该缓存不是以后每次操作都必定成功的保证；`get/set` 失败仍会拒绝。
- 所有公开失败统一抛 `Error('Secret storage operation failed')`，`code === 'SECRET_VAULT_ERROR'`；不附底层异常、`cause`、stdout 或 stderr。调用方应显示固定的本地错误，不记录提交的密钥或供应商原始响应。

密钥文本为非空有效 UTF-8 字符串，最多 16,384 字节，不做数字转换或修剪。`purpose` 为非空字符串，最多 512 UTF-8 字节；该字符串参与 SHA-256 派生的 DPAPI 可选熵，解密必须完全相同。逻辑项名最长 80 个 ASCII 字符，首字符为字母/数字，其余仅字母、数字、点、下划线、冒号、短横线；拒绝 `__proto__`、`prototype`、`constructor`。每项固定用途为 `dafeiyu-vault-v1:` 加逻辑项名，复制到另一个项名不能解密。最多 64 项，文件最多 1 MiB。

文件结构只有版本、算法、逻辑项名和密文记录：

```json
{
  "version": 1,
  "algorithm": "dpapi-current-user",
  "entries": {
    "provider.key": {
      "version": 1,
      "algorithm": "dpapi-current-user",
      "ciphertext": "<DPAPI 密文的 Base64 表示，并非密钥的 Base64>"
    }
  }
}
```

## 实现与失败行为

preview.11补充：应用入口用 `platform-security.js` 对私有目录和bridge目录施加并核验当前用户/SYSTEM的真实NTFS ACL，已有合规权限只读核验，失败拒绝启动；这不改变DPAPI的同账户安全边界。新增有界 `protectString.batch` / `unprotectString.batch` 内部批处理（1–64项）用于记忆分块，每项仍绑定原用途、保留原密文格式；不提供密钥导出界面。当前原生与性能结果以包根目录 `验收记录-preview11.md` 为准，末尾2026-11-01计数仅为历史模块复验。

使用 Windows 系统目录中的 Windows PowerShell 和固定脚本，调用 `System.Security.Cryptography.ProtectedData`。操作数据只经子进程 stdin 传递，不拼入命令行或环境变量；禁用 profile、隐藏窗口、不使用 shell 展开，也不把主进程供应商环境变量转发给子进程。子进程 stdout 是内部数据管道，不能由调用方改为日志。

仅把密文 JSON 写入目标同目录的独占临时文件，刷新文件后以 rename 替换目标；失败时不删除旧目标，尽力清理本次独占的临时文件。拒绝读取符号链接或非普通文件。没有跨进程写锁：多个写者同时修改可能覆盖彼此的更新，主进程应作为唯一写者，其他本机客户端只读；原子替换只保证完整文件可见，不保证并发事务或断电后的目录持久性。Windows 的 `0600` mode 不是 NTFS ACL 配置，部署方仍须把文件放在合适的用户目录并管理目录访问权限。

DPAPI 不可用、PowerShell 被禁用、用户配置文件未加载、超时、记录损坏、文件不可写或用途不符时均失败关闭；没有明文、Base64 或机器级加密的后备路径。`remove` 只是删除引用，不能宣称 SSD、备份或已删除文件中的旧密文已被安全擦除。

## 安全边界

微软将 `CurrentUser` 定义为仅当前用户上下文的线程能够解密；`LocalMachine` 则允许同机进程访问，所以这里明确不采用后者。[Microsoft DataProtectionScope](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.dataprotectionscope?view=windowsdesktop-9.0)

DPAPI 是 Windows 提供的数据保护服务，依赖用户凭据与配置文件。用户配置文件不可用时可能无法解密；非 Windows 不支持该 API。[Microsoft ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata?view=windowsdesktop-9.0)

由上述用户范围可知：此方案保护磁盘静态密钥，不隔离同一登录用户下的其他程序；拥有相同用户权限并取得密文和用途的进程仍可解密。它不防管理员/调试器、注入代码、已失陷进程、内存转储或供应商请求时的运行内存读取。用途字符串用于上下文绑定，不是第二个秘密。JavaScript 字符串不可可靠擦除，GC 和进程退出也不应被描述为内存安全擦除。模块不缓存解密后的值，但调用方拿到值后的生命周期仍由调用方负责。

迁移旧明文是调用方的独立事务：只有新加密项成功写入并核验后，才考虑移除旧位置；必须单独处理备份、日志、导出包及错误路径。这里的合成测试没有读取、迁移或验证任何真实用户密钥，也没有调用外部模型。

## 测试与证据分层

在项目根目录运行：

```powershell
node --test tests/secret-vault.test.cjs
node tests/secret-vault-native.cjs --run
```

单元测试使用内存 Map 与随机不透明 token 的假保护器，明确不是加密实现；它验证契约、用途绑定调用、输入限制、磁盘内容、原子写失败与错误脱敏，并在隔离 VM 检查命令行/环境不携带合成秘密。不能把这些测试等同于真实 DPAPI 可用。

原生测试仅在 Windows 显式 `--run` 时执行，现场生成随机合成 canary，使用 `runtime-tests/vault-native-*` 独占临时目录，验证真实 CurrentUser 加解密、Unicode/换行、错用途、密文损坏、跨逻辑项复制拒绝、元信息状态和磁盘不含明文。终端只输出每项通过状态，不输出 canary 或密文。最后验证路径归属并删除自己的临时目录。原生测试通过不等于不同 Windows 用户隔离、运行内存安全、真实供应商登录或整应用配置迁移已经验收。

2026-11-01 本机复验：隔离单元测试 17/17；真实 Windows DPAPI 合成测试 11/11，`cleaned: true`。未读取真实密钥，未启动 Electron 或监听端口，未请求既有运行实例。
