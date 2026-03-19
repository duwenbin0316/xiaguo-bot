const express = require('express');
const axios = require('axios');

const app = express();
app.use(express.json());

// ============ 配置 ============
const APP_ID = process.env.APP_ID;
const APP_SECRET = process.env.APP_SECRET;
const PPLX_API_KEY = process.env.PPLX_API_KEY;

if (!APP_ID || !APP_SECRET || !PPLX_API_KEY) {
  console.error('请设置环境变量: APP_ID, APP_SECRET, PPLX_API_KEY');
  process.exit(1);
}

// 虾果的 bot open_id（启动后会自动获取）
let BOT_OPEN_ID = '';

// ============ 虾果人设 Prompt ============
const SYSTEM_PROMPT = `你是"虾果 🦐"，一个飞书群的AI助手。

基本设定：
- 名字：虾果
- 性格：活泼、接地气、有点幽默，但在股票和科技资讯上认真靠谱
- 群成员：斌果（杜文斌）、宇果（李宇）、冲果（期待），都是老铁
- 说话风格：轻松随意，像朋友聊天，不要太正式，言简意赅
- 每条消息以"🦐"开头

关注领域：
- NBA湖人/詹姆斯战报
- 美股：RKLB/NVDA/AAPL/TSLA/GOOGL
- AI科技：Anthropic/Perplexity/OpenAI/Gemini/Grok/Manus/Cursor
- 科技前沿新闻

注意事项：
- 回复要简短，不要长篇大论
- 可以开玩笑但不要过分
- 涉及股票和新闻要准确
- 如果不确定的信息，坦诚说不知道`;

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
  tokenExpiry = Date.now() + (res.data.expire - 300) * 1000;
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

// ============ 调用 Perplexity API ============
async function askPerplexity(userMessage) {
  try {
    const res = await axios.post('https://api.perplexity.ai/chat/completions', {
      model: 'sonar',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      max_tokens: 500,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${PPLX_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });
    
    const reply = res.data.choices[0].message.content;
    console.log(`[PPLX] 回复: ${reply.substring(0, 80)}...`);
    return reply;
  } catch (e) {
    console.error('[PPLX] 调用失败:', e.response?.data || e.message);
    return '🦐 虾果脑子短路了，等会再试试...';
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

// ============ 消息去重 ============
const processedMessages = new Set();
function isDuplicate(messageId) {
  if (processedMessages.has(messageId)) return true;
  processedMessages.add(messageId);
  if (processedMessages.size > 1000) {
    const first = processedMessages.values().next().value;
    processedMessages.delete(first);
  }
  return false;
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
    console.log(`[Event] 收到消息: type=${msgType}, from=${sender.sender_id?.open_id}`);
    
    if (msgType === 'text') {
      let content;
      try {
        content = JSON.parse(msg.content);
      } catch (e) {
        return;
      }
      
      const text = content.text || '';
      const mentions = msg.mentions || [];
      const mentionedBot = mentions.some(m => m.id?.open_id === BOT_OPEN_ID);
      
      // 去掉 @部分，提取纯文本
      let cleanText = text;
      mentions.forEach(m => {
        cleanText = cleanText.replace(m.key || '', '').trim();
      });
      
      console.log(`[Event] 消息内容: ${cleanText}, @虾果: ${mentionedBot}`);
      
      // 只有 @虾果 或消息包含"虾果"才回复
      if (mentionedBot || /虾果/.test(text)) {
        // 调用 Perplexity API 生成回复
        const reply = await askPerplexity(cleanText);
        await replyMessage(msg.message_id, reply);
      }
    }
  }
}

// ============ 路由 ============

// 健康检查
app.get('/', (req, res) => {
  res.json({ status: 'ok', bot: '虾果 🦐', ai: 'Perplexity Sonar', message: '虾果在线中...' });
});

// 飞书事件回调
app.post('/webhook/event', async (req, res) => {
  const body = req.body;
  
  // URL 验证
  if (body.type === 'url_verification') {
    console.log('[Verify] 飞书URL验证请求');
    return res.json({ challenge: body.challenge });
  }
  
  // 事件回调 v2
  if (body.schema === '2.0') {
    console.log(`[Event] 收到事件: ${body.header?.event_type}`);
    res.json({ code: 0 });
    try {
      await handleEvent(body);
    } catch (e) {
      console.error('[Event] 处理事件失败:', e.message);
    }
    return;
  }
  
  res.json({ code: 0 });
});

// ============ 启动 ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🦐 虾果机器人服务已启动，端口: ${PORT}`);
  console.log(`🧠 AI引擎: Perplexity Sonar`);
  await getTenantToken();
  await getBotInfo();
});
