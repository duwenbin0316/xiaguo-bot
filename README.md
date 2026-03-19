# 虾果 🦐 飞书自动回复机器人

## 一键部署到 Railway（免费）

### 第一步：部署服务

1. 注册 [Railway](https://railway.app/) 账号（GitHub 登录即可）
2. 点击 **New Project** → **Deploy from GitHub repo**
3. 把这个文件夹推到你的 GitHub 仓库，或者直接用 Railway CLI 部署
4. 设置环境变量：
   - `APP_ID` = `cli_a92018d83c3a9bcc`
   - `APP_SECRET` = `xPVAAf7AbQbMkU3KkRRINgW3n7GgMuYi`
5. 部署成功后会得到一个公网地址，类似：`https://xiaguo-bot-xxxxx.up.railway.app`

### 第二步：配置飞书应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app)，进入你的机器人应用
2. 左侧菜单 → **事件订阅**
3. 请求地址填：`https://你的railway地址/webhook/event`
4. 添加事件：`im.message.receive_v1`（接收消息）
5. 左侧菜单 → **权限管理**，开启以下权限：
   - `im:message` — 获取与发送单聊、群组消息
   - `im:message.group_at_msg` — 接收群聊中@机器人消息
   - `im:message:send_as_bot` — 以机器人身份发送消息
6. 发布应用版本

### 第三步：测试

在飞书群里 @虾果 说句话，看看有没有自动回复！
