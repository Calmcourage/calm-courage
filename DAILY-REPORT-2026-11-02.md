# 工作日报与接续清单：2026-11-02

依据 [2026-10-22 日报](DAILY-REPORT-2026-10-22.md) 完成本地在线验证，并准备独立测试环境。向新建的 `calm-courage-test` 部署了 Firestore rules、空索引及两个订阅函数；用户明确授权后，仅为这两个测试服务配置公开入口，测试项目在线验证 45/45 通过并完成清理。订阅和 sandbox 仍关闭，未配置商店商品或发起购买。

## 已完成

- 新增 `scripts/verify-billing-online.cjs` 和四个 npm 命令，覆盖只读预检查、专用账号准备、在线验证及清理。使用本地保管的凭据，拒绝命令行传入密码或令牌。
- 云端预检查核对两个函数的 ACTIVE 状态、订阅/sandbox 关闭、空商品映射，以及已部署 Firestore rules 与仓库一致；不满足时停止，不自动部署。
- 实现并运行账号准备：创建两个随机专用 Auth 身份及无付费权益的测试文档，验证后已清理。已验证状态由 Admin 设置，测试真实登录令牌分支，不代表邮箱链接交互验证。
- 实现真实账号 callable、RevenueCat v1 响应、webhook 关闭状态及 Firestore 客户端规则检查。权限探测误写时恢复专用数据并报失败；提供限定身份与标记的清理命令。
- 新增 [在线验证运行说明](BILLING-ONLINE.md) 和 [待转发的权限确认稿](BILLING-ACCESS-REQUEST.md)，没有向他人发送消息。
- 修正 CLI 凭据适配：使用临时 ADC 支持 Auth 和 Admin Firestore，退出清理凭据文件；增加无网络初始化回归测试。
- 当前本地测试 96/96 通过，新增脚本与测试的 ESLint 检查通过。原项目和独立测试项目各自在线 verify 45/45 通过，结果按项目分别归档。正常退出后没有遗留临时 ADC 文件。

## 本次在线验证结果

用户重新完成 Firebase CLI 浏览器授权后，登录问题已解除。在 `calm-courage-co` 完整执行 preflight、prepare、verify、cleanup；在线 verify 于北京时间 14:00:07–14:00:29 完成，45 项检查全部通过（含 3 项预检查）。

| 检查 | 真实结果 |
| --- | --- |
| 云端开关 | 两函数 ACTIVE，`BILLING_ENABLED=false`、`REVENUECAT_ALLOW_SANDBOX=false`、商品映射 `{}`。 |
| Firestore rules | 当前已部署规则与仓库一致；本次未部署规则。 |
| 邮箱已验证账号 | 刷新真实 ID token 后，callable 返回 `failed-precondition`。 |
| 邮箱未验证账号 | 刷新真实 ID token 后，callable 返回 `permission-denied`。 |
| 未登录 | callable 返回 `unauthenticated`。 |
| RevenueCat | 真实 v1 查询认证成功，响应身份与专用 UID 一致，订阅和 entitlement 为空。 |
| Webhook | GET 405、缺失/错误 Bearer 401、缺少事件 400、合法 TEST 事件 503。 |
| Firestore 客户端权限 | 两账号各 16 项通过：本人可读、他人不可读、12 个订阅字段不可更新、`billingSyncState` 不可读写。所有测试资料与基线一致，无意外写入。 |
| 清理 | 14:00:53 清理完成：两个 Auth 账号、4 个测试文档和本地账号密码已删除；临时 ADC 文件数为 0。RevenueCat 留有一个无订阅测试 customer。 |

上述表格为原项目 `calm-courage-co` 的结果。随后独立测试项目 `calm-courage-test` 于北京时间 **15:37:48–15:38:04** 同样完成 **45/45** 检查，包含相同的邮箱状态、RevenueCat、webhook 和客户端权限断言。15:38:22 清理完成：两个 Auth 账号、4 个测试文档和本地账号密码已删除，临时 ADC 文件数为 0；RevenueCat 另留一个无订阅测试 customer。

本地和两项目云端订阅/sandbox 均保持关闭，映射为空；客户端购买开关未启用。脱敏结果按项目保存于本机 `.billing-verification/calm-courage-co/` 和 `.billing-verification/calm-courage-test/`，不含账号密码或令牌。没有修改已有用户资料，也没有发起购买或真实权益写入。

## 下一步

1. 按用户要求逐项确认商店权限，先核对能否登录 App Store Connect 并看到目标 App，再处理 Google Play Console。独立 Firebase 测试项目已就绪；[权限确认稿](BILLING-ACCESS-REQUEST.md) 尚未发送，商店权限未确认。
2. 在确认的隔离环境中配置商店凭据、真实商品、`premium` entitlement、Default offering、恢复策略和精确商品映射。
3. 环境与商店配置就绪后，另行安排原生测试构建及 sandbox 购买、恢复、续订、取消、到期、退款和 webhook 全流程验收。当前项目订阅继续关闭。

本次尚未验证真实邮箱收信/验证链接交互、启用后的 UID 隔离同步、购买到 Firestore 的权益写入、Dashboard webhook 实际投递和商店生命周期事件。

## 下一阶段准备经过（以下按时间记录）

- 已只读核对当前 Firebase 身份可见项目，结果仅有 `calm-courage-co`；尚无已确认且可访问的独立测试项目。此结果不代表组织中不存在其他项目。
- 已核对本地原生配置：两个平台标识均为 `com.calmcourage.app`，`app.json` 尚无 EAS 项目 ID；已有真机开发 profile，但未执行关联、签名配置或原生构建。
- 更新 [权限确认稿](BILLING-ACCESS-REQUEST.md)，加入实际缺口和负责人回填表；在 [BILLING-TESTING.md](BILLING-TESTING.md) 补充 Apple/Google 凭据类型、license tester 和原生构建的执行顺序，并注明现有环境同步脚本默认覆盖三个 EAS 环境，测试时必须明确指定目标。
- 等待确认优先平台、独立测试 Firebase 项目及商店/RevenueCat/EAS 权限后，再配置真实商品和原生测试构建。尚未向任何人发送确认稿，也未创建云资源、修改商店或 EAS 配置；订阅继续关闭。
- 用户确认两个平台都做，要求逐步操作；当前先协助查找或准备独立 Firebase 项目 ID，后续再处理商店和 EAS。
- 原生构建前只读检查：TypeScript 无错误；`expo install --check` 报告 25 个依赖与 SDK 57 当前推荐版本不一致，尚未修改依赖或 lockfile，留待原生构建准备时处理。
- 用户新建并提供 `calm-courage-test`。北京时间 14:20 只读确认项目 ACTIVE、当前身份可访问，Web App 数量为 0，Authentication 配置 404，Firestore API 未启用。
- 新增本地 `billing-test` 别名及 `functions/.env.calm-courage-test`，订阅和 sandbox 均关闭，商品映射为空。默认项目与根目录 `.env` 保留原设置；没有在新项目部署或启用云服务。按用户要求逐项配置，下一步是新项目 Authentication 的 Email/Password。
- 用户启用 Email/Password 后，北京时间 14:27 只读确认 Authentication HTTP 200、邮箱登录启用且要求密码；Web App 仍为 0，Firestore API 仍未启用。下一步指导用户创建 Standard edition 的 `(default)` 数据库，地区 `us-central1`，初始安全规则选生产模式；尚未创建数据库或部署规则，订阅继续关闭。
- 用户创建数据库后，北京时间 14:32 核实 `calm-courage-test` 的 `(default)` 数据库为 Standard / FIRESTORE_NATIVE，地区 `us-central1`。随后仅向该测试项目部署 Firestore rules 和索引配置，编译及部署均成功；14:33 独立读取已发布 rules 与仓库一致，复合索引为 0。没有写入业务资料或更改原项目。下一步注册 Firebase Web App，当前 Web App 数量仍为 0；订阅继续关闭。
- 用户注册 Web App 后，北京时间 14:52 确认该项目有 1 个 Web App，通过 Management API 读取配置并保存至 `.env.billing-test.local`（被 Git 忽略，未打印配置值）。已检查 6 个 Firebase 字段齐全、客户端和测试后端购买均关闭；根目录 `.env` 仍指向原项目。未启动测试应用或改动 EAS 配置。
- 同次只读核对 Cloud Billing，`calm-courage-test` 的 `billingEnabled=false`。下一步由用户在控制台启用部署 Cloud Functions 所需的 Blaze 按量计费计划；本次没有绑定结算账户、启用计费或部署 Functions，应用内订阅继续关闭。
- 用户要求先了解计费再决定是否升级，目前尚未确认启用 Blaze。已查阅官方价格：小量函数执行、Firestore 读写及 Secret Manager 有免费额度，但构建、镜像存储、网络及超额用量仍可能收费，不能保证账单为零。预算提醒不会自动停止服务；Cloud Functions 的服务级 spend cap 目前为 Preview，有执行延迟且不覆盖整个项目费用。等待用户了解费用后决定，当前不绑定结算账户、不部署测试 Functions。

## Blaze 启用后的部署与在线验证

- 用户随后确认已启用 Blaze；已只读核实 `calm-courage-test` 的 `billingEnabled=true`。
- 本机生成独立测试 webhook secret，保存于被 Git 忽略的 `functions/.secret.calm-courage-test.local`；RevenueCat 服务端 Key 使用已验证的现有 RevenueCat 项目 Key。两项已上传到测试项目 Secret Manager，均绑定版本 1，本机/云端一致，未打印密钥。
- 在线脚本支持 `BILLING_VERIFY_ENV_FILE=.env.billing-test.local`。显式环境必须使用对应项目的 Secret 文件，禁止回退到原项目 webhook secret。新增配置隔离测试，完整本地回归 96/96 和相关 ESLint 均通过。
- 首次构建因默认构建服务账号缺少权限失败；核对失败状态及 IAM 后，仅在测试项目给该账号补齐官方要求的 `roles/cloudbuild.builds.builder`。没有授予 Owner/Editor 或修改组织策略。
- 重试部署成功：`syncSubscription`、`revenueCatWebhook` 均 ACTIVE / Node.js 22 / `us-central1`。独立读取配置确认订阅 false、sandbox false、映射 `{}`，Secret 版本为 1，`minInstances=0`。
- 为测试项目 `gcf-artifacts` 设置并核实 1 天（86400 秒）自动清理；此项减少镜像积累，不是账单费用封顶。本次未创建预算或服务级 spend cap。
- 首轮测试通过 3 项预检查后，被私有 Cloud Run 入口 HTTP 403 阻止。公开访问操作当时因缺少明确授权被自动审批拒绝；停止该操作并清理首轮测试账号和数据。
- 用户随后明确回复“授权这两个测试服务公开访问”。授权范围仅为 `calm-courage-test` 的 `syncsubscription`、`revenuecatwebhook`；Firebase 身份和 webhook Bearer 校验保留，订阅和 sandbox 继续关闭。
- Cloud Run v2 更新返回 revision 配置冲突；`allUsers` IAM 绑定被组织域限制拒绝，未添加绑定或修改组织策略。最终使用官方 Cloud Run v1 服务更新接口，保留原服务 spec/template，只设置服务注解 `run.googleapis.com/invoker-iam-disabled=true`。独立读取确认两服务 `invokerIamDisabled=true`、ACTIVE、`minInstances=0`，未登录外部 POST 均由应用返回 HTTP 401。[官方公开访问说明](https://docs.cloud.google.com/run/docs/authenticating/public)、[服务更新接口](https://docs.cloud.google.com/run/docs/reference/rest/v1/namespaces.services/replaceService)。
- 重新准备专用账号后，测试项目在线 verify 45/45 通过，随后 cleanup 成功。原项目及测试项目成功记录分别归档在 `.billing-verification/calm-courage-co/`、`.billing-verification/calm-courage-test/`，报告均含对应 `projectId`。

当前公开入口和关闭状态在线验证已完成。下一步逐项确认 Apple、Google 商店账号权限；商店凭据、商品、entitlement、offering、映射和原生购买全流程仍待后续。现有 RevenueCat 项目及服务端查询 Key 被复用，不能将 Firebase 隔离等同于商店与 RevenueCat 全面隔离。启用后的函数运行身份 Firestore 写入权限也仍需实际同步验证。
