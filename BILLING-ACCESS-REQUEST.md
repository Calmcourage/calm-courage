# 订阅测试权限与独立环境确认稿

供向负责人确认；本文件是待发送草稿，尚未发送，也不代表权限已获批。当前订阅保持关闭。

## 已核实的项目现状（2026-11-02）

- `calm-courage-co` 的关闭状态在线验证 45/45 通过，当前订阅和 sandbox 均为 false；默认本地项目保留此设置。
- 用户新建并提供独立 Firebase 测试项目 `calm-courage-test`；Email/Password、Standard / Native 模式的 `(default)` 数据库、Web App 及独立本地配置已就绪。用户已启用 Blaze，两个测试函数已部署 ACTIVE，订阅和 sandbox 仍关闭；测试项目 Secret 版本 1 已绑定，镜像 1 天清理。经用户明确授权，仅两个测试服务配置公开入口，应用鉴权保留；该项目在线验证 45/45 通过，专用 Firebase 账号和数据已清理。现有 RevenueCat 项目及服务端 Key 被复用，商店与 RevenueCat 测试范围仍待确认。
- iOS Bundle ID 和 Android package 当前均为 `com.calmcourage.app`，需要与实际商店 App 核对。不要未经商店确认直接改包名。
- 本地 `app.json` 尚未记录 `extra.eas.projectId`；已有 `development-device` 真机开发构建配置，但尚未进行 EAS 项目关联、签名核对或构建。
- RevenueCat 服务端 v1 Key 的真实查询已通过；Apple/Google 商店验证凭据、真实商品及商品映射仍待配置。服务端 Key 不代替商店凭据。

请确认下列信息，以便安排商店 sandbox 验证。可以先完成一个平台。

| 待确认事项 | 需要负责人提供的结果 |
| --- | --- |
| 独立测试环境 | 独立测试 Firebase 项目 ID、负责人、与生产隔离的确认；关联的 RevenueCat 测试 App、Webhook 和 Expo/EAS 测试构建配置。当前 `calm-courage-co` 名称不足以证明隔离。 |
| Apple | Apple Developer 团队及 App Store Connect 中目标 App 的访问，创建/配置订阅、管理 sandbox 测试账号、签名和内部测试构建所需权限；明确谁负责提供内购验证凭据。 |
| Google | 目标 Play Console App、订阅及 base plan、内部测试轨道和 license tester 的管理权限；相关 Google Cloud 项目及服务账号授权由谁完成。 |
| RevenueCat | 目标项目与 App 的配置权限；商店凭据上传负责人、商品绑定、`premium` entitlement、Default offering、恢复策略和测试 webhook 的负责人。 |
| 测试设备与范围 | 先测试 iOS 或 Android、可用设备、测试账号负责人和验收时间。 |

请通过批准的凭据管理方式配置 Apple `.p8` / Key ID / Issuer ID 和 Google 服务账号 JSON，不在聊天或此文件中回传私钥。

确认隔离环境并完成商店配置后，再单独安排开启该测试项目的订阅及 sandbox，以及内部原生构建中的购买开关。验收覆盖购买、恢复、续订、取消、到期、退款、失败重试、重复和乱序 webhook，以及 Firestore 权益状态。当前阶段不执行这些开启动作。

## 请负责人回填

| 信息 | 回复 |
| --- | --- |
| 测试平台 | 用户已确认 iOS、Android 两个平台；先逐步准备 Firebase 测试项目 |
| 独立测试 Firebase 项目 ID、负责人及隔离确认 | 用户新建并提供 `calm-courage-test`；访问及 ACTIVE 已核实，基础服务初始化中；负责人待填写 |
| 商店 App 是否使用 `com.calmcourage.app`，及可操作的权限范围 | 待确认 |
| RevenueCat 目标项目/App，及商店凭据配置负责人 | 待确认 |
| Expo/EAS 所属账号或组织、现有项目 ID、签名负责人 | 待确认 |
| 可用测试设备与测试账号负责人 | 待确认 |

只需回复标识和权限状态，不在此表填写私钥、账号密码或访问令牌。下一步执行顺序见 [BILLING-TESTING.md](BILLING-TESTING.md#1-独立环境和原生构建准备2026-11-02)。
