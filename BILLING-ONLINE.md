# 保持订阅关闭的本地在线验证

2026-11-02 已实现 `scripts/verify-billing-online.cjs`。脚本不部署规则、函数或配置，不启用订阅、sandbox 或客户端购买，不授予付费权限。它会创建专用 Auth 账号和无权益的 Firestore 测试资料；客户端权限测试只操作这些资料。

## 准备本机配置与身份

使用 Node.js 22 或以上，先按 lockfile 安装根目录和 Functions 依赖：

```powershell
npm ci
npm ci --prefix functions
```

根目录 `.env` 的 Firebase Web 配置必须指向待验证项目；购买开关保持 `false` 或未设置。`functions/.env.<项目 ID>` 必须明确包含：

```dotenv
BILLING_ENABLED=false
REVENUECAT_ALLOW_SANDBOX=false
REVENUECAT_PRODUCT_PLANS={}
```

`functions/.secret.local` 使用原有 `REVENUECAT_SECRET_API_KEY` 和 `REVENUECAT_WEBHOOK_SECRET`，不需要重新生成。不要将密码、令牌、服务端密钥放入命令行参数、报告或聊天。

隔离测试项目 `calm-courage-test` 使用 `.env.billing-test.local` 和 `functions/.secret.calm-courage-test.local`。通过下面的变量显式选择测试配置，避免覆盖根目录 `.env`：

```powershell
$env:BILLING_VERIFY_ENV_FILE = '.env.billing-test.local'
```

指定独立环境文件后，脚本要求存在对应 `functions/.secret.<项目 ID>.local`，不会回退到原项目的 webhook 密钥。测试环境使用独立生成的 webhook secret；RevenueCat 服务端 Key 仍来自已验证的现有 RevenueCat 项目。所有本地凭据文件均被 Git 忽略。恢复默认配置时，移除该环境变量即可。

默认使用 Firebase Admin SDK 的 Application Default Credentials。已有本机 ADC 可直接运行；也可将 `GOOGLE_APPLICATION_CREDENTIALS` 指向本机安全保存的服务账号文件。需要读取函数配置、读取 Rules release/ruleset、管理测试 Auth 用户和操作测试 Firestore 文档的权限。不要把凭据文件放进仓库。客户端断言使用独立的 Firebase 客户端 SDK 和测试用户令牌，不使用 Admin 绕过规则。

如需复用本机已登录的 Firebase CLI，可选择适配器（无需新建服务账号密钥）：

```powershell
npx firebase-tools login --reauth
# 设置为本机已经安装/缓存的 firebase-tools 包目录，目录中应有 package.json 和 lib/auth.js。
$env:BILLING_VERIFY_FIREBASE_TOOLS_DIR = '<本机 firebase-tools 包的绝对路径>'
```

该适配器读取 CLI 内部账号接口，升级 CLI 后需重新验证兼容性。未设置此变量时始终使用已有 ADC。选择 CLI 时，在被 Git 忽略的 `.billing-verification/` 中生成临时 ADC 文件，供 Auth 和 Admin Firestore 共用，退出时移除并恢复原环境变量；不使用 CLI 自带的刷新实现。若进程被强制终止，重启前删除残留的 `cli-adc-*.json` 临时凭据。令牌及远端响应正文不会输出到日志。

## 执行顺序

```powershell
npm run billing:online
npm run billing:online:prepare
npm run billing:online:verify
# 完成验证后清理，或在 prepare 部分失败后恢复：
npm run billing:online:cleanup
```

| 命令 | 行为及通过标准 |
| --- | --- |
| `billing:online` | 只读核对两个已部署函数均 ACTIVE，订阅和 sandbox 为 false、商品映射为空；读取当前默认数据库的已发布规则，与 `firestore.rules` 对比（忽略 CRLF 和首尾空白）。不一致时停止，不自动部署。 |
| `billing:online:prepare` | 重复预检查，再生成两个随机专用账号及 `parents`、`billingSyncState` 测试文档。资料均无付费权益。凭据提前保存，支持部分失败后的清理；已有 manifest 时拒绝覆盖。 |
| `billing:online:verify` | 重复预检查、登录后强制刷新 ID token；已验证账号 callable 为 `failed-precondition`，未验证账号为 `permission-denied`，未登录为 `unauthenticated`。随后分别检查 RevenueCat、webhook、Firestore，任一阶段失败均以非零状态退出并保存结果。 |
| `billing:online:cleanup` | 只删除 manifest 中的随机测试身份和带匹配标记的测试文档，不遍历其他用户资料；移除本地账号密码。无需云端预检查通过。 |

账号使用 `billing_probe_<随机 ID>_*@billing-test.invalid`；已验证账号由 Admin 设置 `emailVerified=true`，验证的是云端真实身份及令牌分支，**不证明真实邮箱收信、点击验证链接流程已通过**。不发送邮件。若需邮箱交互验收，后续另用可控邮箱完成。

每次客户端登录使用内存持久化，并强制刷新令牌，结束时登出。账号密码与运行结果保存在 `.billing-verification/`（已被 Git 忽略）；密码不输出到终端。保留账号可重复验证，完成后应运行 cleanup。若清理失败，保留 manifest 重试，不要直接删除目录丢失恢复信息。

## 在线断言范围

- RevenueCat 使用现有 v1 查询函数访问专用 UID，检查 HTTP 成功、响应结构、原始身份及空订阅/entitlement，不写 Firebase 权益。[官方将该 GET 定义为 Get or Create Customer](https://www.revenuecat.com/docs/api-v1/customers)，因此可能留下一个无订阅的测试 customer；cleanup 不调用 RevenueCat 删除接口。
- Webhook 检查 GET 405、缺失/错误 Bearer 401、缺失事件 400，以及正确 Bearer 的 TEST 事件 503。此结果不等于 RevenueCat Dashboard 投递已验收。
- 两个账号分别用客户端 SDK 验证本人现有资料可读、另一专用账号的现有资料不可读、12 个订阅字段的更新被拒、现有 `billingSyncState` 不可读写。只接受精确的 `permission-denied`，网络失败不能算通过。
- 每次订阅字段探测都实际改变字段，但探测值不会产生有效付费权益。若写入意外成功或出现结果不明的错误，会读取专用资料、恢复基线并报失败。Admin 仅用于准备、核对、恢复和清理；允许/拒绝结果均来自客户端 SDK。
- 本阶段不验证启用后的同步、客户端提交他人 UID 时的真实同步结果、购买、恢复、续订或退款。不更改商店商品或 offering。

## 本次执行状态（2026-11-02）

用户重新完成 Firebase CLI 浏览器授权后，已在 `calm-courage-co` 完整执行 preflight、prepare、verify、cleanup。在线 verify **45/45 通过**（包含 3 项预检查），运行时间为北京时间 14:00:07–14:00:29；清理于 14:00:53 完成。

| 验证 | 实际结果 |
| --- | --- |
| 云端配置及规则 | 两函数 ACTIVE，订阅和 sandbox 均 false，映射为空；已部署 rules 与仓库一致。 |
| Callable | 已验证账号 `failed-precondition`，未验证账号 `permission-denied`，未登录 `unauthenticated`。 |
| RevenueCat | 真实 v1 查询成功，返回身份与专用 UID 匹配，entitlement / subscription 均为空。 |
| Webhook | 方法、Bearer、结构与关闭状态共 5 项通过，合法 TEST 事件返回 503。 |
| Firestore | 两个账号分别完成 16 项客户端断言：本人可读、他人不可读、12 个订阅字段不可更新、私有同步状态不可读写。测试资料最终与基线一致，无误写。 |
| 清理 | 两个专用 Auth 账号、4 个测试文档和本地账号密码均已清理；无临时 ADC 文件遗留。RevenueCat 保留一个无订阅的测试 customer。 |

上述原项目验证期间没有部署或更改其云端配置，也未进行购买、权益同步或 Dashboard webhook 投递。新增隔离检查后，本地测试 **96/96 通过**，相关脚本及测试 ESLint 通过。脱敏 JSON 结果按项目保存在本机 `.billing-verification/<项目 ID>/`。

### 后续独立测试项目进展

用户新建 `calm-courage-test` 并启用 Blaze 后，两个测试函数已部署 ACTIVE，订阅/sandbox false、映射为空；使用项目专属 webhook secret，Secret 版本均为 1。验证脚本新增环境选择与密钥隔离检查，当前本地测试 96/96、相关 ESLint 通过。

用户明确授权后，仅将测试项目 `syncsubscription`、`revenuecatwebhook` 两个服务配置为公开入口，保留 Firebase 身份校验和 webhook Bearer 校验。两服务 `invokerIamDisabled=true`、无 `allUsers` 绑定、`minInstances=0`；未登录外部请求到达应用后返回 HTTP 401。未修改组织策略。

独立测试项目重新 prepare 后，在线 verify 于北京时间 **15:37:48–15:38:04 完成，45/45 通过**，覆盖上表同样的关闭状态断言。15:38:22 cleanup 完成：两个测试 Auth 账号、4 个文档及本地账号密码均删除，无临时 ADC 文件遗留。RevenueCat 另保留一个无订阅测试 customer。测试报告在 `.billing-verification/calm-courage-test/`，原项目历史报告在 `.billing-verification/calm-courage-co/`。两项目订阅/sandbox 仍关闭；商店购买、启用后的同步和 Dashboard 投递未验证。

账号准备方式依据 [Firebase Admin 用户管理](https://firebase.google.com/docs/auth/admin/manage-users)；规则核对使用 [Firebase Rules REST API](https://firebase.google.com/docs/reference/rules/rest)。
