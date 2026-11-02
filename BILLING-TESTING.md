# 订阅测试配置与验证

2026-11-02 接续：已实现并完整运行本地在线验证脚本及账号准备/清理命令，**45/45 项在线检查通过**。真实账号邮箱状态分支、RevenueCat v1 查询和 Firestore 客户端权限已验证，测试账号与 Firebase 测试资料已清理；云端订阅和 sandbox 继续关闭。参见 [BILLING-ONLINE.md](BILLING-ONLINE.md) 和 [本次日报](DAILY-REPORT-2026-11-02.md)。以下 2026-10-22 在线结果为历史结果。

已有 RevenueCat 项目，商店账号及商品尚待配置。
2026-10-22 已确认部署目标为 `calm-courage-co`，Firebase CLI 登录和项目访问已验证。
`REVENUECAT_WEBHOOK_SECRET` 和 `REVENUECAT_SECRET_API_KEY` 均已创建于该项目的 Secret Manager，版本 1 已启用；密钥值不记录在本文。
本机 `functions/.env.calm-courage-co` 已准备，订阅与 sandbox 均关闭、商品映射为空。
两个函数已创建，均为 `ACTIVE` / `nodejs22`。首次部署在设置公开调用 IAM 权限时失败，随后用户在 Cloud Run 为这两个服务开启了 Allow public access，平台层 HTTP 403 已解除。
2026-10-22 已确认两个服务就绪、`invokerIamDisabled=true`，并完成 7 项在线基础鉴权及关闭状态检查，全部通过。2026-11-02 已补充 RevenueCat 实际查询及客户端权限检查；真实订阅写入和购买全流程仍未验证。
本文件补充 [BILLING.md](BILLING.md)，不改变现有同步业务逻辑。

## 1. 独立环境和原生构建准备（2026-11-02）

### 已核实及尚缺的信息

| 项目 | 现状 / 下一步 |
| --- | --- |
| 独立测试 Firebase 项目 | `calm-courage-test` 已确认 ACTIVE、Email/Password 已启用；Standard / Native 模式的 `(default)` 数据库已创建于 `us-central1`，仓库 rules 及空索引配置已部署并核对一致；Web App 已注册，独立本地 Firebase 配置已保存。 |
| 测试平台 | 用户已确认 iOS、Android 两个平台；先逐步准备 Firebase 测试项目。 |
| 商店 App 标识 | 当前 iOS / Android 均为 `com.calmcourage.app`；待核对商店 App，不自行更名。 |
| Expo/EAS 关联 | `app.json` 尚无 `extra.eas.projectId`；等待确认 EAS 所属账号/组织及目标项目。 |
| 原生构建 | 已有 `development-device` 真机开发 profile；签名、设备和测试商店权限尚未确认，本次未发起构建。 |
| 商店和 RevenueCat 权限 | 尚未获得可操作范围确认；现有工具没有连接这些控制台。 |

向负责人转发 [权限确认稿](BILLING-ACCESS-REQUEST.md)，回填平台、独立 Firebase 项目、商店 App、RevenueCat App 和 EAS 项目信息。隔离项目未确认前，继续保持当前云端与客户端购买关闭。

本地已新增 `billing-test` 别名和被 Git 忽略的 `functions/.env.calm-courage-test`，订阅、sandbox 都为 false，商品映射为空。默认项目仍为 `calm-courage-co`，根目录 `.env` 尚未切换；后续针对测试项目的命令必须明确指定 `--project calm-courage-test`。用户已启用 Email/Password 并创建数据库；已执行 `deploy --only firestore:rules,firestore:indexes --project calm-courage-test --non-interactive`，规则编译及部署成功，随后独立读取已发布 rules 与仓库核对一致，复合索引为 0。

Web App 已注册，真实配置已保存到被 Git 忽略的 `.env.billing-test.local`，6 个 Firebase 字段齐全，客户端购买开关均 false，公开 RevenueCat SDK Key 留空。根目录 `.env` 保留原项目；验证脚本通过 `BILLING_VERIFY_ENV_FILE=.env.billing-test.local` 显式选择测试配置，要求使用 `functions/.secret.calm-courage-test.local`。具体运行方式见 [BILLING-ONLINE.md](BILLING-ONLINE.md)。

用户了解费用后已启用 Blaze，已只读核实 `billingEnabled=true`。两个测试函数已部署为 ACTIVE / Node.js 22 / `us-central1`，订阅和 sandbox 均 false、映射为空、Secret 版本均为 1、无常驻实例配置；镜像已设 1 天自动清理。构建缺失的 `roles/cloudbuild.builds.builder` 仅在该测试项目补齐，未修改组织策略。

用户明确授权后，仅将测试项目的 `syncsubscription`、`revenuecatwebhook` 配置为公开入口：`invokerIamDisabled=true`，未添加 `allUsers` 绑定或修改组织策略；Firebase 鉴权、webhook Bearer 校验保留。独立测试项目于北京时间 15:37:48–15:38:04 完成在线验证 **45/45 通过**，15:38:22 清理两个专用 Auth 账号、4 个文档及本地账号密码，无临时 ADC 文件遗留。RevenueCat 保留一个无订阅测试 customer。测试报告已单独归档至 `.billing-verification/calm-courage-test/`；两项目订阅和 sandbox 均继续关闭。下一步逐项确认商店账号权限。

用户先了解费用、随后自行启用 Blaze；本次没有替用户绑定结算账户。费用说明基于 2026-11-02 官方价格：

- 本项目使用第二代函数，执行资源按 Cloud Run 计费；`us-central1` 请求计费模式有每月 200 万请求、18 万 vCPU 秒及 36 万 GiB 秒免费额度，按结算账号跨项目汇总，超出部分另计。[Cloud Run 价格](https://cloud.google.com/run/pricing)
- Standard Firestore 有每日 5 万读取、2 万写入和 1 GiB 存储等免费额度；本次少量测试远低于这些读写量。[Firebase 价格](https://firebase.google.com/pricing)
- 部署的 Cloud Build 构建与 Artifact Registry 镜像存储需单独核算；镜像存储免费额度 0.5 GiB 按结算账号共享，重复部署保留镜像会增加用量。[Cloud Build](https://cloud.google.com/build/pricing)、[Artifact Registry](https://cloud.google.com/artifact-registry/pricing)
- Secret Manager 每结算账号有 6 个活跃版本、每月 1 万次访问免费额度；测试项目与原项目可能共享额度。[Secret Manager](https://cloud.google.com/secret-manager/pricing)
- 可先以 US$5/月作为轻量测试的预算目标示例，不是实际报价、账单承诺或费用封顶。实际还取决于构建次数、执行时长、镜像、网络、日志及其他项目已占用的免费额度。此预算不包含 Apple/Google、RevenueCat 或 Expo/EAS 的独立收费。
- 预算提醒不暂停服务；Cloud Functions 另有 Preview 服务级 spend cap，但报告和执行有延迟，可产生超额费用，也不能覆盖整个项目的所有服务。[Spend cap 说明](https://firebase.google.com/docs/projects/billing/spend-caps)

### Apple 路径

1. 核对 App Store Connect App 的 Bundle ID；由具备相应权限的负责人准备自动续订商品和 sandbox 测试账号。
2. 内购密钥由 **Account Holder 或 Admin** 在 Users and Access → Integrations → In-App Purchase 创建；将 `.p8`、Key ID、Issuer ID 安全配置到对应 RevenueCat App。[Apple 内购密钥说明](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/generate-keys-for-in-app-purchases)
3. 内购验证用的 In-App Purchase Key 与导入商品所用的 App Store Connect API Key 是不同配置。当前 React Native Purchases 版本需要正确的内购密钥；以 RevenueCat 的凭据验证通过为完成标准。[RevenueCat Apple 凭据类型](https://www.revenuecat.com/docs/store-configuration/app-store/service-credentials-index)、[内购密钥配置](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration)

### Google 路径

1. 核对 Play Console App 的 package，确认有测试轨道、商品/base plan 和测试人员管理权限；相关 Cloud 项目的负责人准备所需 API、服务账号及 Play 授权，并将 JSON 上传至对应 RevenueCat App。服务账号在 Cloud 中存在不代表已经获准访问 Play App。[RevenueCat Google Play 凭据配置](https://www.revenuecat.com/docs/service-credentials/creating-play-service-credentials)
2. 将测试设备上的 Google 账号加入 **license testers**；使用测试轨道时还要完成该轨道的测试加入流程。测试轨道成员资格本身不保证免费购买，Google 明确要求 license tester 才能使用不扣款的测试支付方式。[Google Play Billing 测试说明](https://developer.android.com/google/play/billing/test)
3. 原生构建的 package 必须匹配 Play App。验收记录中分别保存测试轨道资格、license tester 状态及测试付款提示，不将一个替代另一个。

### 原生构建的执行顺序

1. 负责人确认 EAS 项目后再关联已有项目，核对生成的 `extra.eas.projectId`。当前未关联状态会阻止 EAS 构建，不在本阶段自动创建或绑定未知组织项目。[Expo 项目关联说明](https://docs.expo.dev/accounts/programmatic-access/)
2. 先配置明确指向独立测试 Firebase 项目的构建环境，并保持两个客户端购买开关 false；此时的真机包仅检查登录、页面和原生依赖，不能验收购买。
3. 现有 `scripts/sync-eas-env.mjs` **不传参数会同步 development、preview、production 三个环境**。准备测试配置时必须明确指定目标环境，并先核对本机 `.env` 的项目；本次没有运行同步。公开 SDK Key 也要与所选 RevenueCat App 一致。
4. 签名与设备就绪后，现有 `development-device` 可用于真机开发构建；默认 `development` 的 iOS 配置是 simulator。需要 Play 测试轨道或 TestFlight 时，再按所选分发渠道准备对应 store 构建 profile。不要将 Expo 内部分发、Play 测试轨道与 TestFlight 混为同一种分发渠道。[Expo 构建 profile](https://docs.expo.dev/build/eas-json/)、[内部分发](https://docs.expo.dev/build/internal-distribution/)
5. 独立环境、商店凭据和商品全部核对后，再在该测试环境另行启用 sandbox、订阅与内部构建购买开关，按下文执行购买和 webhook 验收。当前 `calm-courage-co` 继续关闭。

## 2. 配置 RevenueCat（现在进行）

### 商品、entitlement 和 offering

1. 在 RevenueCat 项目中添加实际使用的 App Store / Google Play App，配置对应商店的验证凭据及服务端通知。可以先完成一个平台。
2. 在对应商店创建或确认自动续订月订阅，再导入 RevenueCat。先配置月付；只有实际开通年付时才加入年付映射。价格与试用优惠在商店配置。
3. 创建 entitlement，Identifier 为 `premium`（已有其他 Identifier 时也可沿用，但后端必须一致），将商品绑定到它。
4. 创建 offering，例如 `default`，加入 Monthly package 并绑定对应平台商品，将该 offering 设为 Default。客户端读取的是 `offerings.current`。
5. 在 Project settings → General 将 Restore Behavior 设为 **Keep with original App User ID**；若单独设置了 sandbox 行为，也保持相同策略。本项目购买前绑定已验证家长的 Firebase UID。

映射使用实际商品 ID，不能填 entitlement、offering 或 package ID：

```dotenv
REVENUECAT_ENTITLEMENT_ID=premium
REVENUECAT_PRODUCT_PLANS={"app_store:REPLACE_WITH_REAL_IOS_PRODUCT_ID":"monthly","play_store:REPLACE_WITH_REAL_ANDROID_PRODUCT_AND_BASE_PLAN_ID":"monthly"}
```

上述 ID 只是占位示例，不可原样部署。仅测试一个平台时删除另一个条目；Android 使用 RevenueCat 实际返回的完整 ID（可能包含 `:base-plan`）。

### 密钥与本地文件

| 配置 | 来源与保存位置 |
| --- | --- |
| `REVENUECAT_SECRET_API_KEY` | RevenueCat → API keys，创建供当前 REST API v1 `GET /v1/subscribers/{uid}` 使用的 Secret Key。先在本机 `functions/.secret.local` 填写，部署时写入 Secret Manager。不要误用仅适用于 v2 的 Key。 |
| `REVENUECAT_WEBHOOK_SECRET` | 本机生成的随机共享 token，已保存在 `functions/.secret.local`；Dashboard 的 Authorization 填完整的 `Bearer <token>`。文件中只保存 token，不含 `Bearer `。 |
| `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | 对应 Apple App 的公开 SDK Key（`appl_`），仅在根目录 `.env` 填写。 |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | 对应 Google App 的公开 SDK Key（`goog_`），仅在根目录 `.env` 填写。 |

`functions/.env.local` 已准备 entitlement 和空商品映射，填写真实 ID 后保存。保持 `BILLING_ENABLED=false`，直到开始隔离测试。
其中 `REVENUECAT_ALLOW_SANDBOX=true` 仅用于本地测试；`.env.local` 和 `.secret.local` 都不会配置云端部署。
根目录 `.env` 如需增加 SDK Key，可参考 `.env.example` 末尾，暂时保持 `EXPO_PUBLIC_ENABLE_STORE_PURCHASES=false`。Expo Go 与 RevenueCat Test Store Key 不适用于当前实现。

本地文件被 Git 忽略。不要提交密钥，也不要将密钥发到聊天中。生成 token 只是本地准备，尚未在 RevenueCat Dashboard 配置。

### Webhook 配置

RevenueCat → Integrations → Webhooks：准备测试配置，选择 **Sandbox**、本次测试的 App 和所有相关订阅事件，Authorization 使用上述完整 Bearer 值。
当前 webhook URL 为 `https://us-central1-calm-courage-co.cloudfunctions.net/revenueCatWebhook`。
订阅功能仍关闭，合法事件会返回 503 并触发 RevenueCat 重试；开始真实同步测试前再启用相应投递，避免将关闭状态误判为集成完成。
当前代码验证 Authorization header；Dashboard 可选的 HMAC signing secret 是另一种机制，不能拿它替代本项目的 Bearer token。

第 2 步完成条件：商店凭据已验证、实际商品已绑定 `premium`、Default offering 有对应 package、本地填入 API/SDK Key 和真实映射、恢复策略已配置。
Webhook 地址与真实投递验证留到第 3、4 步。

## 3. 部署后端（接口已部署，订阅保持关闭）

当前授权的部署项目为 `calm-courage-co`。两个 Secret 和函数创建已完成，云端确认 `BILLING_ENABLED=false`、`REVENUECAT_ALLOW_SANDBOX=false`、商品映射为 `{}`；未部署 Firestore rules。

### 当前部署结果与访问配置

| 函数 | 区域 / 运行时 | URL | 当前外部访问 |
| --- | --- | --- | --- |
| `syncSubscription` | `us-central1` / Node.js 22 | `https://us-central1-calm-courage-co.cloudfunctions.net/syncSubscription` | 已到达应用层；未登录 / 无效 Firebase 令牌均为 HTTP 401。 |
| `revenueCatWebhook` | `us-central1` / Node.js 22 | `https://us-central1-calm-courage-co.cloudfunctions.net/revenueCatWebhook` | 已到达应用层；方法、Bearer 和事件结构检查符合预期；订阅关闭时合法事件返回 HTTP 503。 |

首次部署失败位置是为底层 Cloud Run 服务授予 `allUsers` 调用权限：

```text
Failed to set the IAM Policy on the Service .../services/syncsubscription
Failed to set the IAM Policy on the Service .../services/revenuecatwebhook
One or more users named in the policy do not belong to a permitted customer,
perhaps due to an organization policy.
```

此错误与组织的 Domain Restricted Sharing 限制一致。有效 Invoker 组织策略的只读查询曾返回 HTTP 500。
随后用户在 Cloud Run 控制台为两个服务设置 Allow public access；只读核对确认它们的 `invokerIamDisabled` 均为 `true`，服务就绪，外部请求已到达应用代码。

Google 官方支持在组织允许时，仅为指定 Cloud Run 服务设置 **Allow public access**（关闭该服务的 Invoker IAM 检查），同时保留业务代码中的 Firebase / webhook Bearer 校验。
本次未修改组织策略，业务代码中的鉴权仍保留。此设置只应用于上述两个服务。

已由用户在控制台完成的设置，对应服务级命令如下，供后续维护参考：

```powershell
gcloud run services update syncsubscription --project calm-courage-co --region us-central1 --no-invoker-iam-check
gcloud run services update revenuecatwebhook --project calm-courage-co --region us-central1 --no-invoker-iam-check
```

若组织强制启用 Invoker IAM 检查，则应由管理员确定批准的调用方式，不尝试绕过该限制。
后续通过 Firebase CLI 更新代码时，若再次出现 `allUsers` IAM 设置错误，应核对服务实际就绪状态和 Allow public access 设置，再验证接口；不要仅凭部署日志推断外部可访问性。

官方说明：[Cloud Run 公开访问与组织限制](https://docs.cloud.google.com/run/docs/authenticating/public)。

以下保留完整部署流程供后续操作。

### 商店凭据尚未就绪时，先部署接口

缺少 Apple 内购 `.p8` 或 Google Play 服务账号 JSON，不阻止部署 `syncSubscription` 和 `revenueCatWebhook`。
这两项商店凭据上传到 RevenueCat，不由本仓库的 Functions 直接读取。
现在可以先部署关闭订阅功能的后端，获得实际 webhook URL 并验证接口鉴权；真实购买及其 Firestore 同步留到商店配置完成后。

此路径仍需要：

- 明确的测试 Firebase 项目和 CLI 登录账号，具备 Functions、关联部署服务及 Secret Manager 所需权限。
- 项目已开通 Blaze 计费计划；本流程不自动升级计费计划。
- 云端存在 `REVENUECAT_SECRET_API_KEY` 和 `REVENUECAT_WEBHOOK_SECRET` 的可访问 Secret 版本。现有代码始终绑定它们，`BILLING_ENABLED=false` 不会取消部署时的 Secret 要求。
  RevenueCat 服务端 Key 在其项目内创建，与 Apple/Google 商店凭据不同；本机 `.secret.local` 不会自动上传到 Secret Manager。

先部署时，下面第 1 项改用：

```dotenv
BILLING_ENABLED=false
REVENUECAT_ENTITLEMENT_ID=premium
REVENUECAT_PRODUCT_PLANS={}
REVENUECAT_ALLOW_SANDBOX=false
```

然后执行第 2 项的 Secret 配置和两个函数的部署，URL 配置到 RevenueCat 后再验证：

| 验证请求 | 关闭订阅功能时的预期 |
| --- | --- |
| Callable 未登录 / 邮箱未验证 | 分别拒绝为 `unauthenticated` / `permission-denied`。 |
| Callable 已验证用户 | `failed-precondition`，不会查询 RevenueCat 或更新 Firestore。 |
| Webhook 非 POST / 缺失或错误 Bearer | 分别为 HTTP 405 / 401。 |
| Webhook 正确 Bearer、缺失必要事件字段 | HTTP 400。 |
| Webhook 正确 Bearer、包含合法事件结构 | HTTP 503，因为订阅功能关闭；不会同步数据库。若在 RevenueCat 发送此类事件，会被视为失败并触发重试。 |

因此此阶段不能声称 webhook 的成功投递处理、RevenueCat 查询或订阅写入已通过。商店配置就绪后，再按以下完整测试配置启用并重新部署。
若 Firebase 权限仍未开通，则云端部署仍然受阻，本地测试和配置准备可以继续。

### 完整订阅测试配置与部署命令

1. 创建 `functions/.env.<TEST_PROJECT_ID>`，填写以下测试参数，不要复制密钥到这个文件：

   ```dotenv
   BILLING_ENABLED=true
   REVENUECAT_ENTITLEMENT_ID=premium
   REVENUECAT_PRODUCT_PLANS={"app_store:REPLACE_WITH_REAL_IOS_PRODUCT_ID":"monthly"}
   REVENUECAT_ALLOW_SANDBOX=true
   ```

   按第 2 步替换商品映射；云端不会读取 `.env.local`。仅在独立测试项目开启 sandbox。

2. 在 PowerShell 设置明确的测试项目 ID，再交互输入本机保存的两项密钥：

   ```powershell
   $billingTestProject = 'REPLACE_WITH_TEST_PROJECT_ID'
   npx firebase-tools functions:secrets:set REVENUECAT_SECRET_API_KEY --project $billingTestProject
   npx firebase-tools functions:secrets:set REVENUECAT_WEBHOOK_SECRET --project $billingTestProject
   npm run functions:install
   npx firebase-tools deploy --only "functions:syncSubscription,functions:revenueCatWebhook" --project $billingTestProject
   ```

   Secret Manager 的权限及真实写入必须等 Firebase 项目权限具备后再完成。不要把 Key 放到命令行参数中。

3. 若测试项目尚未部署本仓库的 Firestore rules，部署并验证它们：

   ```powershell
   npx firebase-tools deploy --only firestore:rules --project $billingTestProject
   ```

4. 将实际 webhook URL 保存到 RevenueCat 测试 webhook 配置。测试客户端 Firebase 配置必须指向同一测试项目，Functions region 为 `us-central1`。
   开始真机测试时，仅在内部原生构建开启 `EXPO_PUBLIC_ENABLE_STORE_PURCHASES=true`。

## 4. 验证（本地与在线基础检查通过，购买全流程待执行）

### 2026-11-02 保持订阅关闭的在线验证

已在 `calm-courage-co` 完整运行脚本，verify 45/45 通过：云端关闭状态及已部署规则 3 项、真实账号 callable 3 项、RevenueCat 查询 1 项、webhook 5 项、两个账号各 16 项 Firestore 客户端权限，以及资料基线不变检查 1 项。专用账号和 Firebase 测试文档均已清理，RevenueCat 留有一个无订阅测试 customer。

本地回归现为 96/96 通过（含新增在线脚本的 11 项安全测试）。这些本地测试使用模拟边界，在线结果另由真实脚本取得。账号的邮箱已验证标记由 Admin 设置，未测试真实邮箱验证链接；仍未启用订阅或验证真实购买/权益同步及 Dashboard 投递。

### 2026-10-22 在线基础检查

已对上述实际云端 URL 执行 **7/7 项检查，全部通过**：

| 请求 | 实际结果 |
| --- | --- |
| `syncSubscription`，无登录令牌 | HTTP 401，`UNAUTHENTICATED`。 |
| `syncSubscription`，无效 Bearer 令牌 | HTTP 401，`UNAUTHENTICATED`。 |
| webhook，GET | HTTP 405。 |
| webhook，POST，无 Authorization | HTTP 401。 |
| webhook，POST，错误 Bearer | HTTP 401。 |
| webhook，正确 Bearer、缺少事件字段 | HTTP 400。 |
| webhook，正确 Bearer、合法 TEST 事件结构 | HTTP 503，符合 `BILLING_ENABLED=false` 的关闭状态。 |

另外只读核对了云端两个服务的就绪状态、订阅与 sandbox 关闭配置，以及 Secret 版本 1 绑定。
测试没有启用订阅或修改 Firestore 数据，没有从 RevenueCat Dashboard 发起真实投递。
截至 2026-10-22，邮箱未验证 / 已验证用户的分支、实际 RevenueCat API 查询、Firestore rules 和购买全流程均未验证；其中前三项已于 2026-11-02 补充通过，真实购买及续订/退款全流程仍待执行。

### 本地回归与后续全流程验证

本地回归命令不需要 Firebase 权限：

```powershell
node --test tests/subscription-safety.test.cjs tests/revenuecat.test.cjs tests/store-purchases.test.cjs tests/subscription-presentation.test.cjs
```

本次运行 **85/85 通过**；SDK、HTTP 和数据库使用模拟实现。此结果不能证明真实 API Key、Firestore rules、部署 IAM 或 webhook 投递已经可用。

| 在线验证 | 操作与预期 |
| --- | --- |
| 身份校验 | 调用 `syncSubscription`：未登录拒绝；邮箱未验证拒绝；已验证账号只同步自身 UID；客户端传入他人 UID 不改变同步对象。 |
| RevenueCat 查询 | 测试用户先有 `parents/{uid}`，并通过该 UID 初始化原生 SDK；执行 sandbox 购买后，确认 RevenueCat 原始 App User ID 等于该 UID，商品与 entitlement 匹配。 |
| Firestore 更新 | 同步成功后，`parents/{uid}` 的计划、平台、到期时间来自 API；`billingSyncState/{uid}` 更新。API 查询失败时保留原有记录，不因失败授予访问。 |
| Firestore 权限 | 使用客户端 SDK 验证：可以读取本人资料；修改本人订阅字段失败；读取他人资料失败；读取或写入 `billingSyncState` 均失败。不要用 Admin SDK 证明规则有效。 |
| Webhook 鉴权 | 无 Authorization 或错误 Bearer 返回 401；非 POST 返回 405；合法鉴权但缺少事件结构返回 400。 |
| Webhook 真实同步 | Dashboard 测试事件用于确认投递；另以真实 sandbox 购买、续订、取消、到期验证数据库变更。返回 200 的测试事件本身不代表付费权限已更新。 |
| 重试与顺序 | 查询/写入失败返回 503；恢复后在 Dashboard Retry 成功；旧 API 快照或重复快照不覆盖新状态。 |
| 取消与退款 | 取消自动续订保留已付费周期访问；到期或退款后撤销访问。跨 Firebase 账号恢复不能继承原账号订阅。 |

## 官方参考

- [RevenueCat API Keys](https://www.revenuecat.com/docs/projects/authentication)
- [RevenueCat API v1](https://www.revenuecat.com/docs/api-v1)
- [RevenueCat Offerings](https://www.revenuecat.com/docs/offerings/overview)
- [RevenueCat Restore Behavior](https://www.revenuecat.com/docs/projects/restore-behavior)
- [RevenueCat Webhooks](https://www.revenuecat.com/docs/integrations/webhooks)
- [Firebase 环境变量与 Secret Manager](https://firebase.google.com/docs/functions/config-env)
