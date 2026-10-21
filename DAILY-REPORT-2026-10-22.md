# 工作日报与接续清单：2026-10-22

## 今日工作结果

订阅后端已从本地准备推进至云端接口可访问阶段。`syncSubscription` 与 `revenueCatWebhook` 已部署到用户指定的 Firebase 项目 `calm-courage-co`，区域为 `us-central1`，运行时为 Node.js 22。订阅功能保持关闭，真实购买和权限同步全流程尚未完成。

1. **确认 Firebase 部署访问**：处理 CLI 登录凭据失效问题，用户重新认证后验证了账号对目标项目的访问；按 lockfile 安装 Functions 依赖并完成语法检查。
2. **配置服务端密钥**：用户创建并在本机保存 RevenueCat API v1 Secret Key；将 API Key 和 webhook 共享密钥分别写入 Secret Manager，均绑定版本 1。真实密钥没有写入仓库。
3. **部署两个订阅接口**：使用项目专属环境配置，保持订阅和 sandbox 关闭、商品映射为空。函数创建成功后，定位到公开调用 IAM 设置被拒绝的问题。
4. **解决外部访问 403**：用户在 Cloud Run 为两个服务开启 Allow public access；随后只读确认两个服务就绪、`invokerIamDisabled=true`，外部请求已进入应用鉴权逻辑。未修改组织策略。
5. **完成基础验证**：本地 85 项模拟测试全部通过；云端 7 项基础鉴权和关闭状态检查全部通过。测试没有启用订阅或修改 Firestore 数据。
6. **更新交接文档**：更新 [BILLING-TESTING.md](BILLING-TESTING.md) 与 [BILLING.md](BILLING.md)，记录部署状态、访问配置、验证范围和后续工作。今天没有修改订阅业务逻辑。

## 当前云端配置

| 项目 | 当前值 |
| --- | --- |
| Firebase 项目 | `calm-courage-co`（用户明确指定） |
| 区域 / 运行时 | `us-central1` / Node.js 22 |
| `BILLING_ENABLED` | `false` |
| `REVENUECAT_ALLOW_SANDBOX` | `false` |
| `REVENUECAT_PRODUCT_PLANS` | `{}` |
| `REVENUECAT_ENTITLEMENT_ID` | `premium`，仍需与 RevenueCat 商品配置核对 |
| `REVENUECAT_SECRET_API_KEY` | Secret Manager，版本 1，密钥值不记录 |
| `REVENUECAT_WEBHOOK_SECRET` | Secret Manager，版本 1，密钥值不记录 |
| Cloud Run 公开访问 | 仅上述两个服务已开启，应用内鉴权保留 |

接口地址：

- `syncSubscription`：`https://us-central1-calm-courage-co.cloudfunctions.net/syncSubscription`
- `revenueCatWebhook`：`https://us-central1-calm-courage-co.cloudfunctions.net/revenueCatWebhook`

`syncSubscription` 是 Firebase callable，客户端应使用 Firebase Functions SDK 调用。
Webhook 通过 `Authorization: Bearer <共享密钥>` 鉴权；当前订阅关闭，合法事件会返回 503，暂不将其当作已完成的真实投递链路。

## 今天实际完成的验证

| 在线请求 | 实际结果 |
| --- | --- |
| callable，无登录令牌 | HTTP 401，`UNAUTHENTICATED` |
| callable，无效登录令牌 | HTTP 401，`UNAUTHENTICATED` |
| webhook，GET | HTTP 405 |
| webhook，POST，无 Authorization | HTTP 401 |
| webhook，POST，错误 Bearer | HTTP 401 |
| webhook，正确 Bearer、缺少事件字段 | HTTP 400 |
| webhook，正确 Bearer、合法 TEST 事件结构 | HTTP 503，符合订阅关闭预期 |

本地回归命令已运行，85/85 通过；这些测试使用模拟 SDK、HTTP 和数据库：

```powershell
node --test tests/subscription-safety.test.cjs tests/revenuecat.test.cjs tests/store-purchases.test.cjs tests/subscription-presentation.test.cjs
```

尚未验证：真实已登录用户的邮箱验证分支、RevenueCat API Key 的真实查询能力、Firestore 客户端规则、订阅写入、商店购买、Dashboard webhook 投递，以及续订、退款等生命周期行为。
真实账号验证、RevenueCat 查询和 Firestore 权限验证的专用本地脚本尚未编写，不能视为已有可运行工具。

## 下次继续的步骤

### 先完成不依赖商店账号的验证

1. **编写本地在线验证脚本**。先实现只验证身份、不启用订阅的调用方式。使用本机保存的专用测试账号登录，密码和令牌不进入源码、命令行参数、日志或聊天。
2. **准备真实测试账号并验证 callable**。分别使用邮箱未验证和已验证的测试账号；预期前者为 `permission-denied`，后者在当前关闭状态下为 `failed-precondition`。账号邮箱验证后刷新登录令牌。客户端指定他人 UID 的完整同步行为需在后续启用的隔离测试环境中验证。
3. **验证 RevenueCat API Key**。由本地服务端脚本直接查询测试用户，确认认证和响应结构；保持云端订阅关闭，不因查询成功授予付费权限。API Key 目前只完成格式检查和 Secret 上传，尚未验证真实 API 响应。
4. **核对和验证 Firestore rules**。先核对已部署规则与仓库规则；今天没有部署规则。用客户端 SDK 对专用测试资料验证：本人可读、他人不可读、订阅字段不可修改、`billingSyncState` 不可读写。不要用 Admin SDK 或控制台编辑结果代替规则验证；测试写入若意外成功，应记录缺陷并清理测试数据。

### 商店账号就绪后完成购买链路

5. **向上级确认账号与测试环境**。取得 Apple Developer / App Store Connect、Google Play Console 及相关 Google Cloud 权限。也可以先完成一个商店平台。启用 sandbox 前，确认使用独立测试 Firebase 项目；当前项目名称本身不能证明测试与生产已隔离。
6. **完成 RevenueCat 商店配置**。Apple 上传内购 `.p8`、Key ID 和 Issuer ID；Google 上传具备 Play 权限的服务账号 JSON。创建或导入真实月订阅商品，绑定 `premium` entitlement 和 Default offering，核对恢复购买策略。
7. **填写商品映射并准备原生测试构建**。填写精确商品 ID 和公开 SDK Key，在独立测试项目中启用后端订阅与 sandbox，再为内部原生构建开启购买功能。Expo Go 可验证登录和页面体验；当前订阅页在 Expo Go 会提前停止，不会调用 `syncSubscription`，不能用它验证真实内购。
8. **配置并验证真实 webhook**。Dashboard 填写测试项目实际 webhook URL 和 Bearer，共享密钥与该项目 Secret Manager 一致，筛选 Sandbox 事件。若换用独立测试项目，需要在该项目重新配置密钥、部署并使用新 URL。
9. **完成全流程及上线前复核**。验证购买、恢复、续订、取消、到期、退款、失败重试、重复与乱序事件，以及 Firestore 状态变化。上线前复核旧 `activateSubscription` 入口；今天只部署了两个新函数，没有更新旧入口或 `clearSubscription`。

## 接续时保留的注意事项

- 本机 `functions/.env.calm-courage-co`、`.secret.local` 和根目录 `.env` 被 Git 忽略；从 GitHub 拉取代码不会获取真实本地配置。云端 Secret 已独立保存。
- 后续 Firebase CLI 部署可能再次尝试授予 `allUsers` 并报 IAM 错误；需核对实际函数状态、Cloud Run 访问设置与 HTTP 响应。首次 CLI 返回错误后，公开访问问题已由用户手动处理并验证。
- 不要为继续基础验证而打开付费功能或替换为虚假密钥。

下次可直接使用以下接续说明：

> 阅读 DAILY-REPORT-2026-10-22.md 和 BILLING-TESTING.md，继续订阅后端验证。两个接口已部署至 calm-courage-co，公开访问已开启，订阅和 sandbox 均关闭，两项 Secret 版本 1 已绑定；85 项本地模拟测试和 7 项在线基础检查已通过。先编写本地在线验证脚本，完成真实测试账号鉴权、RevenueCat 查询和 Firestore 客户端权限验证，不开启购买功能，也不输出任何密钥。
