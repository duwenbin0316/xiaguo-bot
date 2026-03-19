const express = require('express');
const crypto = require('crypto');
const axios = require('axios');

const app = express();
app.use(express.json());

// ============ 配置 ============
const APP_ID = process.env.APP_ID || 'cli_a92018d83c3a9bcc';
const APP_SECRET = process.env.APP_SECRET || 'xPVAAf7AbQbMkU3KkRRINgW3n7GgMuYi';
const ENCRYPT_KEY = process.env.ENCRYPT_KEY || ''; // 飞书应用里设置的 Encrypt Key（可选）
const VERIFICATION_TOKEN = process.env.VERIFICATION_TOKEN || ''; // 飞书应用里的 Verification Token

// 虾果的 bot open_id（启动后会自动获取）
let BOT_OPEN_ID = '';

// ============ Token 管理 ============
let tenantToken = '';
let tokenExpiry = 0;

async function getTenantToken() {
  if (tenantToken && Date.now() < tokenExpiry) return tenantToken;
  
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: APP_ID,
    app_secret: APP_SECRET
  });
  
  tenantToken = res.data.tenant_access_token;
  tokenExpiry = Date.now() + (res.data.expire - 300) * 1000; // 提前5分钟刷新
  console.log('[Token] 获取 tenant_access_token 成功');
  return tenantToken;
}

// ============ 获取机器人信息 ============
async function getBotInfo() {
  try {
    const token = await getTenantToken();
    const res = await axios.get('https://open.feishu.cn/open-apis/bot/v3/info', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.data.code === 0) {
      BOT_OPEN_ID = res.data.bot.open_id;
      console.log(`[Bot] 虾果 open_id: ${BOT_OPEN_ID}`);
    }
  } catch (e) {
    console.error('[Bot] 获取机器人信息失败:', e.message);
  }
}

// ============ 回复消息 ============
async function replyMessage(messageId, text) {
  const token = await getTenantToken();
  try {
    await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
      {
        msg_type: 'text',
        content: JSON.stringify({ text })
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    console.log(`[Reply] 回复成功: ${text.substring(0, 50)}...`);
  } catch (e) {
    console.error('[Reply] 回复失败:', e.response?.data || e.message);
  }
}

// ============ 发送消息到聊天 ============
async function sendMessage(chatId, text) {
  const token = await getTenantToken();
  try {
    await axios.post(
      `https://open.feishu.cn/open-apis/im/v1/messages`,
      {
        receive_id: chatId,
        msg_type: 'text',
        content: JSON.stringify({ text })
      },
      { 
        headers: { Authorization: `Bearer ${token}` },
        params: { receive_id_type: 'chat_id' }
      }
    );
    console.log(`[Send] 发送成功: ${text.substring(0, 50)}...`);
  } catch (e) {
    console.error('[Send] 发送失败:', e.response?.data || e.message);
  }
}

// ============ 消息去重 ============
const processedMessages = new Set();
function isDuplicate(messageId) {
  if (processedMessages.has(messageId)) return true;
  processedMessages.add(messageId);
  // 保留最近1000条
  if (processedMessages.size > 1000) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
  }
  return false;
}

// ============ 虾果回复逻辑 ============
function generateReply(text) {
  const lowerText = text.toLowerCase();
  
  // 打招呼
  if (/^(hi|hello|你好|嗨|在吗|虾果)$/i.test(text.trim())) {
    const greetings = [
      '🦐 在呢在呢，有啥事说',
      '🦐 虾果在线，随时待命',
      '🦐 来了来了，说吧老铁',
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // 股票相关
  if (/rklb|nvda|tsla|aapl|googl|股票|美股|大盘/i.test(text)) {
    return '🦐 收到，股票相关的信息我会在每天早9点的美股日报里详细播报，有急事的话直接跟斌果说，让他安排我查';
  }

  // 湖人/NBA
  if (/湖人|lakers|詹姆斯|lebron|nba|比赛|战报/i.test(text)) {
    return '🦐 湖人相关的我都会在快报里推送，比赛预测、战报一条龙服务～';
  }

  // AI相关
  if (/openai|anthropic|claude|gpt|gemini|grok|perplexity|ai|人工智能|大模型/i.test(text)) {
    return '🦐 AI动态我每天盯着呢，有大新闻会第一时间推到群里';
  }

  // 问虾果是谁
  if (/你是谁|介绍一下|什么是虾果|虾果是什么/i.test(text)) {
    return '🦐 我是虾果，这个群的AI小助手！斌果一手调教出来的，背后是 Perplexity Computer 驱动。每天给大家播报美股、AI新闻、湖人战报，有事随时cue我～';
  }

  // 默认：被@但不确定意图
  return null;
}

// ============ 事件处理 ============
async function handleEvent(event) {
  const eventType = event.header?.event_type;
  
  if (eventType === 'im.message.receive_v1') {
    const msg = event.event?.message;
    const sender = event.event?.sender;
    
    if (!msg || !sender) return;
    
    // 忽略机器人自己的消息
    if (sender.sender_id?.open_id === BOT_OPEN_ID) return;
    
    // 消息去重
    if (isDuplicate(msg.message_id)) return;
    
    const msgType = msg.message_type;
    const chatId = msg.chat_id;
    
    console.log(`[Event] 收到消息: type=${msgType}, chat_id=${chatId}`);
    
    if (msgType === 'text') {
      let content;
      try {
        content = JSON.parse(msg.content);
      } catch (e) {
        return;
      }
      
      const text = content.text || '';
      console.log(`[Event] 消息内容: ${text}`);
      
      // 检查是否 @了虾果
      const mentions = msg.mentions || [];
      const mentionedBot = mentions.some(m => m.id?.open_id === BOT_OPEN_ID);
      
      // 去掉 @部分，提取纯文本
      let cleanText = text;
      mentions.forEach(m => {
        cleanText = cleanText.replace(m.key || '', '').trim();
      });
      
      if (mentionedBot || /虾果/.test(text)) {
        const reply = generateReply(cleanText);
        if (reply) {
          await replyMessage(msg.message_id, reply);
        } else {
          // 兜底回复
          await replyMessage(msg.message_id, '🦐 收到收到，这个我得想想，等我查查再回你～');
        }
      }
    }
  }
}

// ============ 路由 ============

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: '虾果 🦐', message: '虾果在线中...' });
});

// 飞书事件回调
app.post('/webhook/event', async (req, res) => {
  const body = req.body;
  
  // URL 验证（飞书配置回调时的验证请求）
  if (body.type === 'url_verification') {
    console.log('[Verify] 飞书URL验证请求');
    return res.json({ challenge: body.challenge });
  }
  
  // 事件回调 v2
  if (body.schema === '2.0') {
    console.log(`[Event] 收到事件: ${body.header?.event_type}`);
    // 先返回200，再异步处理
    res.json({ code: 0 });
    try {
      await handleEvent(body);
    } catch (e) {
      console.error('[Event] 处理事件失败:', e.message);
    }
    return;
  }
  
  // 兜底
  res.json({ code: 0 });
});

// ============ 启动 ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🦐 虾果机器人服务已启动，端口: ${PORT}`);
  await getTenantToken();
  await getBotInfo();
});
