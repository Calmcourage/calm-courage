# 订阅测试配置与验证

当前从第 2 步开始：已有 RevenueCat 项目，尚未配置商品和 API Key。
Firebase 项目选择和权限确认暂缓，因此尚未部署或做在线端到端验证。
本文件补充 [BILLING.md](BILLING.md)，不改变现有同步业务逻辑。

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

### Webhook 配置先准备，部署后保存 URL

RevenueCat → Integrations → Webhooks：准备测试配置，选择 **Sandbox**、本次测试的 App 和所有相关订阅事件，Authorization 使用上述完整 Bearer 值。
等第 3 步部署成功后，填写 CLI 输出的 `revenueCatWebhook` HTTPS URL；当前没有可用地址，不填虚构地址。
当前代码验证 Authorization header；Dashboard 可选的 HMAC signing secret 是另一种机制，不能拿它替代本项目的 Bearer token。

第 2 步完成条件：商店凭据已验证、实际商品已绑定 `premium`、Default offering 有对应 package、本地填入 API/SDK Key 和真实映射、恢复策略已配置。
Webhook 地址与真实投递验证留到第 3、4 步。

## 3. 部署测试后端（等待 Firebase 权限）

以下是权限恢复后的操作说明，本次尚未执行。先确认独立测试项目及其 Functions、Secret Manager、Firestore 部署权限，避免使用当前默认项目。

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

## 4. 验证（本地通过，在线待执行）

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
