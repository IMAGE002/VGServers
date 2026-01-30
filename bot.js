// ============================================
// TELEGRAM BOT - COMPLETE NODE.JS VERSION
// ============================================
// Version: 7.0 - DIRECT INVOICE OPENING (openInvoice)
// Invoice opens as popup in Mini App - NO chat redirect!

const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const cors = require('cors');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const fs = require('fs').promises;
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEB_APP_URL = process.env.WEB_APP_URL;
const HTTP_PORT = process.env.PORT || 3000;

// Telegram Group Logging Configuration
const LOG_CHAT_ID = process.env.LOG_CHAT_ID;
const SYSTEM_LOG_TOPIC_ID = 6;      // System monitoring, ping, power status
const TRANSACTION_LOG_TOPIC_ID = 3;  // Payments, refunds, transactions

// CRITICAL: Your Telegram User ID for admin commands
const ADMIN_IDS = [123456789]; // REPLACE WITH YOUR TELEGRAM USER ID

// Monitoring Configuration
const PING_CHECK_INTERVAL = 30000;
const PING_SPIKE_THRESHOLD = 100;
const PING_HISTORY_SIZE = 10;
const STATUS_UPDATE_INTERVAL = 3600000;

// ============================================
// PRODUCT CATALOG - MATCHES WEBAPP (13 products)
// ============================================

const PRODUCTS = {
  package_tiny: {
    id: "package_tiny",
    stars: 1,
    coins: 10,
    title: "Tiny Package",
    description: "10 Void Coins"
  },
  package_mini: {
    id: "package_mini",
    stars: 25,
    coins: 250,
    title: "Mini Package",
    description: "250 Void Coins"
  },
  package_small: {
    id: "package_small",
    stars: 50,
    coins: 500,
    title: "Small Package",
    description: "500 Void Coins"
  },
  package_bit: {
    id: "package_bit",
    stars: 75,
    coins: 750,
    title: "Bit Package",
    description: "750 Void Coins"
  },
  package_medium: {
    id: "package_medium",
    stars: 100,
    coins: 1000,
    title: "Medium Package",
    description: "1000 Void Coins"
  },
  package_biggermedium: {
    id: "package_biggermedium",
    stars: 250,
    coins: 2500,
    title: "Bigger Medium Package",
    description: "2500 Void Coins"
  },
  package_moderate: {
    id: "package_moderate",
    stars: 500,
    coins: 5000,
    title: "Moderate Package",
    description: "5000 Void Coins"
  },
  package_large: {
    id: "package_large",
    stars: 750,
    coins: 7500,
    title: "Large Package",
    description: "7500 Void Coins"
  },
  package_superlarge: {
    id: "package_superlarge",
    stars: 1000,
    coins: 10000,
    title: "Super Large Package",
    description: "10000 Void Coins"
  },
  package_huge: {
    id: "package_huge",
    stars: 2500,
    coins: 25000,
    title: "Huge Package",
    description: "25000 Void Coins"
  },
  package_xlsize: {
    id: "package_xlsize",
    stars: 5000,
    coins: 50000,
    title: "XL Package",
    description: "50000 Void Coins"
  },
  package_mega: {
    id: "package_mega",
    stars: 7500,
    coins: 75000,
    title: "Mega Package",
    description: "75000 Void Coins"
  },
  package_giant: {
    id: "package_giant",
    stars: 10000,
    coins: 100000,
    title: "Giant Package",
    description: "100000 Void Coins"
  }
};

// ============================================
// GLOBAL STATE
// ============================================

const STATE = {
  userSessions: new Map(),
  pingHistory: [],
  lastPowerStatus: null,
  serverStartTime: Date.now(),
  isMonitoring: false,
  monitoringInterval: null,
  statusUpdateInterval: null,
  pendingPayments: new Map() // Track payment_id -> {userId, productId, timestamp}
};

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const app = express();

// ============================================
// EXPRESS MIDDLEWARE
// ============================================

app.use(cors({
  origin: '*', // Allow all origins (you can restrict this to your domain)
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// ============================================
// SYSTEM MONITORING FUNCTIONS
// ============================================

function getPowerSource() {
  const platform = os.platform();
  
  if (platform === 'win32') {
    return 'AC Power (Windows Desktop/Laptop)';
  } else if (platform === 'darwin') {
    return 'AC Power (macOS)';
  } else if (platform === 'linux') {
    try {
      const hostname = os.hostname().toLowerCase();
      
      if (hostname.includes('heroku')) return 'Heroku Cloud';
      if (hostname.includes('aws') || hostname.includes('ec2')) return 'AWS Cloud';
      if (hostname.includes('azure')) return 'Azure Cloud';
      if (hostname.includes('google') || hostname.includes('gcp')) return 'Google Cloud';
      if (hostname.includes('digital')) return 'DigitalOcean';
      if (hostname.includes('linode')) return 'Linode';
      
      return 'Linux Server/VPS';
    } catch (error) {
      return 'Linux Server';
    }
  } else {
    return `${platform} System`;
  }
}

function getSystemInfo() {
  const uptime = os.uptime();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsagePercent = ((usedMem / totalMem) * 100).toFixed(2);
  
  const cpus = os.cpus();
  const cpuModel = cpus[0].model;
  const cpuCount = cpus.length;
  
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  const seconds = Math.floor(uptime % 60);
  const uptimeStr = `${days}d ${hours}h ${minutes}m ${seconds}s`;
  
  return {
    platform: os.platform(),
    hostname: os.hostname(),
    uptime: uptimeStr,
    uptimeSeconds: uptime,
    totalMemory: (totalMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    freeMemory: (freeMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    usedMemory: (usedMem / 1024 / 1024 / 1024).toFixed(2) + ' GB',
    memoryUsage: memUsagePercent + '%',
    cpuModel: cpuModel,
    cpuCores: cpuCount,
    architecture: os.arch(),
    nodeVersion: process.version,
    powerSource: getPowerSource()
  };
}

async function pingHost(host = 'google.com') {
  const platform = os.platform();
  const pingCommand = platform === 'win32' 
    ? `ping -n 1 ${host}` 
    : `ping -c 1 ${host}`;
  
  try {
    const startTime = Date.now();
    await execPromise(pingCommand);
    const pingTime = Date.now() - startTime;
    return { success: true, time: pingTime, host };
  } catch (error) {
    return { success: false, time: null, host, error: error.message };
  }
}

async function checkNetworkPing() {
  const hosts = ['google.com', 'cloudflare.com', '1.1.1.1'];
  const results = await Promise.all(hosts.map(host => pingHost(host)));
  
  const successfulPings = results.filter(r => r.success);
  const avgPing = successfulPings.length > 0
    ? Math.round(successfulPings.reduce((sum, r) => sum + r.time, 0) / successfulPings.length)
    : null;
  
  return {
    average: avgPing,
    results: results,
    timestamp: Date.now()
  };
}

function detectPingSpike(currentPing) {
  if (STATE.pingHistory.length < 3) return false;
  
  const recentPings = STATE.pingHistory.slice(-5);
  const avgRecentPing = recentPings.reduce((sum, p) => sum + p, 0) / recentPings.length;
  
  const spike = currentPing - avgRecentPing;
  return spike > PING_SPIKE_THRESHOLD;
}

// ============================================
// LOGGING FUNCTIONS
// ============================================

async function sendSystemLog(message, options = {}) {
  try {
    await bot.sendMessage(LOG_CHAT_ID, message, {
      message_thread_id: SYSTEM_LOG_TOPIC_ID,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
  } catch (error) {
    console.error('Error sending system log to Telegram:', error);
  }
}

async function sendTransactionLog(message, options = {}) {
  try {
    await bot.sendMessage(LOG_CHAT_ID, message, {
      message_thread_id: TRANSACTION_LOG_TOPIC_ID,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...options
    });
  } catch (error) {
    console.error('Error sending transaction log to Telegram:', error);
  }
}

async function sendLog(message, options = {}) {
  return sendSystemLog(message, options);
}

function formatSystemInfo(info) {
  return `
🖥 <b>SYSTEM INFORMATION</b>

<b>Power Source:</b> ${info.powerSource}
<b>Platform:</b> ${info.platform} (${info.architecture})
<b>Hostname:</b> ${info.hostname}
<b>Node Version:</b> ${info.nodeVersion}

💻 <b>CPU:</b>
- Model: ${info.cpuModel}
- Cores: ${info.cpuCores}

💾 <b>Memory:</b>
- Total: ${info.totalMemory}
- Used: ${info.usedMemory} (${info.memoryUsage})
- Free: ${info.freeMemory}

⏱ <b>Uptime:</b> ${info.uptime}
  `.trim();
}

function formatPingInfo(pingData) {
  const { average, results } = pingData;
  
  let message = `\n🌐 <b>NETWORK PING:</b>\n`;
  
  results.forEach(r => {
    if (r.success) {
      message += `• ${r.host}: ${r.time}ms ✅\n`;
    } else {
      message += `• ${r.host}: FAILED ❌\n`;
    }
  });
  
  if (average !== null) {
    message += `\n<b>Average:</b> ${average}ms`;
  } else {
    message += `\n<b>Status:</b> All pings failed`;
  }
  
  return message;
}

async function sendPowerOnNotification() {
  const info = getSystemInfo();
  const pingData = await checkNetworkPing();
  
  const message = `
⚡️ <b>POWER IS ON!</b>
━━━━━━━━━━━━━━━━━━━━

${formatSystemInfo(info)}

${formatPingInfo(pingData)}

🕐 <b>Timestamp:</b> ${new Date().toLocaleString()}
🔋 <b>Status:</b> Bot is now online and monitoring
  `.trim();
  
  await sendSystemLog(message);
}

async function sendPingSpikeAlert(currentPing, avgPing, spike) {
  const message = `
⚠️ <b>PING SPIKE DETECTED!</b>
━━━━━━━━━━━━━━━━━━━━

📊 <b>Current Ping:</b> ${currentPing}ms
📈 <b>Average Ping:</b> ${Math.round(avgPing)}ms
🔺 <b>Spike:</b> +${Math.round(spike)}ms

🕐 <b>Time:</b> ${new Date().toLocaleString()}
  `.trim();
  
  await sendSystemLog(message);
}

async function sendPowerStatusChange(newStatus) {
  const message = `
🔄 <b>POWER STATUS CHANGE</b>
━━━━━━━━━━━━━━━━━━━━

<b>New Status:</b> ${newStatus}
<b>Previous:</b> ${STATE.lastPowerStatus || 'Unknown'}

🕐 <b>Time:</b> ${new Date().toLocaleString()}
  `.trim();
  
  await sendSystemLog(message);
}

async function sendStatusUpdate() {
  const info = getSystemInfo();
  const pingData = await checkNetworkPing();
  
  const botUptime = Date.now() - STATE.serverStartTime;
  const botDays = Math.floor(botUptime / 86400000);
  const botHours = Math.floor((botUptime % 86400000) / 3600000);
  const botMinutes = Math.floor((botUptime % 3600000) / 60000);
  
  const message = `
📊 <b>STATUS UPDATE</b>
━━━━━━━━━━━━━━━━━━━━

${formatSystemInfo(info)}

${formatPingInfo(pingData)}

🤖 <b>Bot Uptime:</b> ${botDays}d ${botHours}h ${botMinutes}m

🕐 <b>Timestamp:</b> ${new Date().toLocaleString()}
  `.trim();
  
  await sendSystemLog(message);
}

async function sendErrorLog(error, context = '') {
  const message = `
❌ <b>ERROR OCCURRED</b>
━━━━━━━━━━━━━━━━━━━━

<b>Context:</b> ${context}
<b>Error:</b> ${error.message}

<b>Stack:</b>
<code>${error.stack?.substring(0, 500) || 'No stack trace'}</code>

🕐 <b>Time:</b> ${new Date().toLocaleString()}
  `.trim();
  
  await sendSystemLog(message);
}

// ============================================
// TRANSACTION LOGGING
// ============================================

async function logTransactionToChannel(userId, username, payment, product, status = 'success') {
  try {
    const user = username ? `@${username}` : `User ID: ${userId}`;
    const timestamp = new Date().toISOString();
    
    let message = '';
    
    if (status === 'success') {
      message = `
✅ <b>PAYMENT SUCCESSFUL</b>
━━━━━━━━━━━━━━━━━━━━

👤 <b>User:</b> ${user}
🆔 <b>User ID:</b> <code>${userId}</code>
📦 <b>Product:</b> ${product.title}
💎 <b>Product ID:</b> <code>${product.id}</code>
⭐ <b>Stars Paid:</b> ${product.stars}
🪙 <b>Coins Delivered:</b> ${product.coins}
💳 <b>Charge ID:</b> <code>${payment.telegram_payment_charge_id}</code>
🔗 <b>Provider Charge ID:</b> <code>${payment.provider_payment_charge_id}</code>
📅 <b>Date:</b> ${timestamp}

<b>Method:</b> openInvoice (Direct Popup)
<b>Status:</b> Coins added via Cloud Storage
`;
    } else if (status === 'failed') {
      message = `
❌ <b>PAYMENT FAILED</b>
━━━━━━━━━━━━━━━━━━━━

👤 <b>User:</b> ${user}
🆔 <b>User ID:</b> <code>${userId}</code>
📦 <b>Product:</b> ${product.title}
💎 <b>Product ID:</b> <code>${product.id}</code>
⭐ <b>Stars:</b> ${product.stars}
🪙 <b>Coins:</b> ${product.coins}
📅 <b>Date:</b> ${timestamp}

<b>Status:</b> Payment processing error - NO CHARGE MADE
`;
    } else if (status === 'pre_checkout') {
      message = `
⏳ <b>PAYMENT INITIATED</b>
━━━━━━━━━━━━━━━━━━━━

👤 <b>User:</b> ${user}
🆔 <b>User ID:</b> <code>${userId}</code>
📦 <b>Product:</b> ${product.title}
💎 <b>Product ID:</b> <code>${product.id}</code>
⭐ <b>Stars:</b> ${product.stars}
🪙 <b>Coins:</b> ${product.coins}
📅 <b>Date:</b> ${timestamp}

<b>Method:</b> openInvoice (Direct Popup)
<b>Status:</b> Pre-checkout approved, awaiting payment
`;
    }
    
    await sendTransactionLog(message);
    console.log('📊 Transaction logged to channel (Topic 3)');
    
  } catch (error) {
    console.error('❌ Error logging to channel:', error);
  }
}

// ============================================
// DATABASE FUNCTIONS
// ============================================

async function savePaymentRecord(userId, chargeId, productId, spentStars, coinsDelivered, createdAt) {
  try {
    let payments = [];
    try {
      const data = await fs.readFile('payments.json', 'utf8');
      payments = JSON.parse(data);
    } catch (e) {
      // File doesn't exist yet
    }
    
    const payment = {
      id: payments.length + 1,
      userId,
      chargeId,
      productId,
      spentStars,
      coinsDelivered,
      createdAt,
      timestamp: new Date().toISOString(),
      refunded: false
    };
    
    payments.push(payment);
    await fs.writeFile('payments.json', JSON.stringify(payments, null, 2));
    
    console.log('💾 Payment saved to database:', payment.id);
    
  } catch (error) {
    console.error('❌ Error saving payment:', error);
  }
}

async function addCoinsViaCloudStorage(userId, coins) {
  try {
    console.log(`💰 Adding ${coins} coins to user ${userId} via Cloud Storage`);
    
    // Send success message with button to open app
    await bot.sendMessage(userId,
      `✅ <b>Payment Successful!</b>\n\n` +
      `${coins} 🪙 Void Coins have been added to your account!\n\n` +
      `Open the app to see your new balance.`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            {
              text: '🎮 Open App & Collect Coins',
              web_app: { url: `${WEB_APP_URL}?coins=${coins}&uid=${userId}&t=${Date.now()}` }
            }
          ]]
        }
      }
    );
    
    return true;
    
  } catch (error) {
    console.error('❌ Error sending coin notification:', error);
    return false;
  }
}

function logFailedDelivery(userId, chargeId, error) {
  const logEntry = {
    userId,
    chargeId,
    error: error.toString(),
    timestamp: new Date().toISOString()
  };
  
  require('fs').appendFileSync('failed_deliveries.log', JSON.stringify(logEntry) + '\n');
  
  sendTransactionLog(`
🚨 <b>DELIVERY FAILED</b>

👤 <b>User ID:</b> <code>${userId}</code>
💳 <b>Charge ID:</b> <code>${chargeId}</code>
❌ <b>Error:</b> ${error.toString()}
📅 <b>Time:</b> ${new Date().toISOString()}

⚠️ <b>ACTION REQUIRED:</b> Manual refund may be needed!
Use: <code>/refund ${chargeId}</code>
`);
  
  console.error(`🚨 FAILED DELIVERY: User ${userId}, Charge ${chargeId}, Error: ${error}`);
}

// ============================================
// HTTP ENDPOINTS
// ============================================

// Health check endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    service: 'Void Gift Bot - Invoice API',
    version: '7.0',
    uptime: Math.floor((Date.now() - STATE.serverStartTime) / 1000),
    features: ['openInvoice', 'cloudStorage', 'monitoring']
  });
});

// Create invoice link endpoint
app.post('/create-invoice', async (req, res) => {
  try {
    const { userId, productId } = req.body;
    
    console.log(`📱 Invoice request received:`, { userId, productId });
    
    if (!userId || !productId) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        error: 'Missing userId or productId',
        received: { userId, productId }
      });
    }
    
    const product = PRODUCTS[productId];
    
    if (!product) {
      console.log('❌ Invalid product:', productId);
      return res.status(400).json({ 
        error: 'Invalid product',
        productId: productId,
        availableProducts: Object.keys(PRODUCTS)
      });
    }
    
    console.log(`✅ Creating invoice for ${product.title} (${product.stars} stars)`);
    
    // Create invoice link using Bot API
    const invoiceLink = await bot.createInvoiceLink(
      product.title,                    // title
      product.description,              // description
      JSON.stringify({                  // payload
        product_id: productId,
        user_id: userId,
        timestamp: Date.now()
      }),
      '',                               // provider_token (empty for Stars)
      'XTR',                           // currency (Telegram Stars)
      [{
        label: `${product.coins} Void Coins`,
        amount: product.stars
      }],
      {
        need_name: false,
        need_phone_number: false,
        need_email: false,
        need_shipping_address: false,
        is_flexible: false
      }
    );
    
    console.log(`✅ Invoice link created successfully`);
    console.log(`🔗 Link: ${invoiceLink}`);
    
    // Log invoice creation
    await sendTransactionLog(`
📝 <b>INVOICE CREATED</b>

👤 <b>User ID:</b> <code>${userId}</code>
📦 <b>Product:</b> ${product.title}
💎 <b>Product ID:</b> <code>${productId}</code>
⭐ <b>Stars:</b> ${product.stars}
🪙 <b>Coins:</b> ${product.coins}
🔗 <b>Method:</b> openInvoice API
📅 <b>Time:</b> ${new Date().toISOString()}
`);
    
    res.json({ 
      success: true,
      invoiceLink: invoiceLink,
      product: {
        id: product.id,
        title: product.title,
        stars: product.stars,
        coins: product.coins
      }
    });
    
  } catch (error) {
    console.error('❌ Error creating invoice link:', error);
    await sendErrorLog(error, 'Create Invoice Link Endpoint');
    
    res.status(500).json({ 
      error: 'Failed to create invoice',
      message: error.message
    });
  }
});

// ============================================
// REFUND SYSTEM
// ============================================

bot.onText(/\/refund (.+)/, async (msg, match) => {
  const adminId = msg.from.id;
  
  if (!ADMIN_IDS.includes(adminId)) {
    return bot.sendMessage(msg.chat.id, '❌ Unauthorized. Admin only.');
  }
  
  const chargeId = match[1].trim();
  
  try {
    const data = await fs.readFile('payments.json', 'utf8');
    const payments = JSON.parse(data);
    
    const payment = payments.find(p => p.chargeId === chargeId);
    
    if (!payment) {
      return bot.sendMessage(msg.chat.id, `❌ Payment not found: ${chargeId}`);
    }
    
    if (payment.refunded) {
      return bot.sendMessage(msg.chat.id, `⚠️ Already refunded: ${chargeId}`);
    }
    
    const refunded = await bot.refundStarPayment(payment.userId, chargeId);
    
    if (refunded) {
      payment.refunded = true;
      payment.refundedAt = new Date().toISOString();
      await fs.writeFile('payments.json', JSON.stringify(payments, null, 2));
      
      await sendTransactionLog(`
💸 <b>REFUND PROCESSED</b>

👤 <b>User ID:</b> <code>${payment.userId}</code>
💳 <b>Charge ID:</b> <code>${chargeId}</code>
⭐ <b>Stars Refunded:</b> ${payment.spentStars}
🪙 <b>Coins Delivered (lost):</b> ${payment.coinsDelivered}
📅 <b>Refund Date:</b> ${new Date().toISOString()}
👨‍💼 <b>Processed by:</b> ${msg.from.username || msg.from.id}
`);
      
      await bot.sendMessage(msg.chat.id, `✅ Refund successful!\n\nUser: ${payment.userId}\nStars: ${payment.spentStars}`);
      
      await bot.sendMessage(payment.userId, 
        `💸 Your payment has been refunded!\n\n` +
        `Stars refunded: ${payment.spentStars}\n` +
        `Reason: Manual refund by admin`
      );
      
    } else {
      await bot.sendMessage(msg.chat.id, `❌ Refund failed. Check logs.`);
    }
    
  } catch (error) {
    console.error('❌ Refund error:', error);
    await bot.sendMessage(msg.chat.id, `❌ Error: ${error.message}`);
  }
});

// ============================================
// PAYMENT HANDLERS
// ============================================

// Handle pre-checkout query (user clicked PAY button)
async function handlePreCheckoutQuery(query) {
  try {
    const payload = JSON.parse(query.invoice_payload);
    const productId = payload.product_id;
    const userId = payload.user_id;
    
    console.log(`💳 Pre-checkout query from user ${query.from.id}`);
    console.log(`📦 Product ID: ${productId}`);
    console.log(`💰 Amount: ${query.total_amount} Stars`);
    
    const product = PRODUCTS[productId];
    
    if (!product) {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Invalid product. Please contact support.'
      });
      console.log('❌ Invalid product ID in pre-checkout');
      return;
    }
    
    // Verify amount matches
    if (query.total_amount !== product.stars) {
      await bot.answerPreCheckoutQuery(query.id, false, {
        error_message: 'Price mismatch. Please contact support.'
      });
      
      console.log(`⚠️ FRAUD ALERT: Price mismatch!`);
      console.log(`Expected: ${product.stars}, Got: ${query.total_amount}`);
      
      await sendTransactionLog(
        `⚠️ <b>FRAUD ALERT:</b> Price mismatch\n` +
        `User: ${query.from.id} (@${query.from.username || 'no_username'})\n` +
        `Product: ${productId}\n` +
        `Expected: ${product.stars} stars\n` +
        `Received: ${query.total_amount} stars`
      );
      return;
    }
    
    // Store pending payment info
    STATE.pendingPayments.set(query.id, {
      userId: userId,
      productId: productId,
      timestamp: Date.now()
    });
    
    // Log pre-checkout
    await logTransactionToChannel(
      query.from.id,
      query.from.username,
      null,
      product,
      'pre_checkout'
    );
    
    // Approve payment
    await bot.answerPreCheckoutQuery(query.id, true);
    console.log(`✅ Pre-checkout approved for user ${query.from.id}`);
    
  } catch (error) {
    console.error('❌ Error in pre-checkout:', error);
    await sendErrorLog(error, 'Pre-checkout Handler');
    
    // Decline payment with error message
    await bot.answerPreCheckoutQuery(query.id, false, {
      error_message: 'An error occurred. Please try again later.'
    });
  }
}

// Handle successful payment
async function handleSuccessfulPayment(msg) {
  const payment = msg.successful_payment;
  const userId = msg.from.id;
  const userInfo = msg.from;
  
  console.log(`🎉 PAYMENT SUCCESSFUL!`);
  console.log(`👤 User: ${userId} (@${userInfo.username || 'no_username'})`);
  console.log(`💰 Amount: ${payment.total_amount} stars`);
  console.log(`💳 Charge ID: ${payment.telegram_payment_charge_id}`);
  
  try {
    // Parse payload to get product info
    const payload = JSON.parse(payment.invoice_payload);
    const productId = payload.product_id;
    const product = PRODUCTS[productId];
    
    if (!product) {
      throw new Error(`Invalid product ID: ${productId}`);
    }
    
    // Verify amount
    if (payment.total_amount !== product.stars) {
      throw new Error(
        `Amount mismatch: Expected ${product.stars}, got ${payment.total_amount}`
      );
    }
    
    console.log(`📦 Product: ${product.title}`);
    console.log(`🪙 Coins to deliver: ${product.coins}`);
    
    // Save to database
    await savePaymentRecord(
      userId,
      payment.telegram_payment_charge_id,
      productId,
      product.stars,
      product.coins,
      Date.now()
    );
    
    // Deliver coins via Cloud Storage notification
    const delivered = await addCoinsViaCloudStorage(userId, product.coins);
    
    if (!delivered) {
      throw new Error('Failed to send coin notification');
    }
    
    // Log successful transaction
    await logTransactionToChannel(
      userId,
      userInfo.username,
      payment,
      product,
      'success'
    );
    
    console.log(`✅ Payment processed successfully!`);
    console.log(`💰 ${product.coins} coins notification sent to user ${userId}`);
    
  } catch (error) {
    console.error('❌ CRITICAL ERROR processing payment:', error);
    await sendErrorLog(error, `Successful Payment - Charge: ${payment.telegram_payment_charge_id}`);
    
    // Notify user of error
    await bot.sendMessage(msg.chat.id,
      `⚠️ <b>Payment Received - Processing Issue</b>\n\n` +
      `Your payment was successful, but there was an error delivering your coins. ` +
      `Don't worry - our team will resolve this shortly!\n\n` +
      `<b>Payment Details:</b>\n` +
      `Charge ID: <code>${payment.telegram_payment_charge_id}</code>\n` +
      `Amount: ${payment.total_amount} ⭐\n\n` +
      `Please contact support with the Charge ID above if your coins don't arrive within 24 hours.`,
      { 
        parse_mode: 'HTML'
      }
    );
    
    // Log failed delivery for manual intervention
    logFailedDelivery(
      userId,
      payment.telegram_payment_charge_id,
      error
    );
  }
}

// ============================================
// MONITORING LOOP
// ============================================

async function monitoringLoop() {
  if (!STATE.isMonitoring) return;
  
  try {
    const pingData = await checkNetworkPing();
    
    if (pingData.average !== null) {
      STATE.pingHistory.push(pingData.average);
      if (STATE.pingHistory.length > PING_HISTORY_SIZE) {
        STATE.pingHistory.shift();
      }
      
      if (STATE.pingHistory.length >= 3) {
        const recentPings = STATE.pingHistory.slice(0, -1);
        const avgRecent = recentPings.reduce((a, b) => a + b, 0) / recentPings.length;
        const spike = pingData.average - avgRecent;
        
        if (spike > PING_SPIKE_THRESHOLD) {
          await sendPingSpikeAlert(pingData.average, avgRecent, spike);
        }
      }
    }
    
    const currentPowerSource = getPowerSource();
    if (STATE.lastPowerStatus && STATE.lastPowerStatus !== currentPowerSource) {
      await sendPowerStatusChange(currentPowerSource);
    }
    STATE.lastPowerStatus = currentPowerSource;
    
  } catch (error) {
    console.error('Monitoring error:', error);
    await sendErrorLog(error, 'Monitoring Loop');
  }
}

async function startMonitoring() {
  if (STATE.isMonitoring) return;
  
  STATE.isMonitoring = true;
  STATE.lastPowerStatus = getPowerSource();
  
  await sendPowerOnNotification();
  
  STATE.monitoringInterval = setInterval(monitoringLoop, PING_CHECK_INTERVAL);
  STATE.statusUpdateInterval = setInterval(sendStatusUpdate, STATUS_UPDATE_INTERVAL);
  
  console.log('✅ Monitoring started - sending logs to Telegram group');
}

function stopMonitoring() {
  STATE.isMonitoring = false;
  
  if (STATE.monitoringInterval) {
    clearInterval(STATE.monitoringInterval);
    STATE.monitoringInterval = null;
  }
  
  if (STATE.statusUpdateInterval) {
    clearInterval(STATE.statusUpdateInterval);
    STATE.statusUpdateInterval = null;
  }
  
  console.log('⏸ Monitoring stopped');
}

// ============================================
// BOT COMMANDS
// ============================================

bot.onText(/\/start$/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  
  STATE.userSessions.set(chatId, {
    userId: user.id,
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    lastActive: Date.now()
  });
  
  await bot.sendMessage(chatId, 
    `👋 <b>Welcome to Void Gift!</b>\n\n` +
    `🎮 Play the spin wheel\n` +
    `🎁 Win amazing prizes\n` +
    `💰 Purchase coins with Telegram Stars\n` +
    `📦 Build your collection\n\n` +
    `Click the button below to start playing:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '🎮 Open Mini App',
            web_app: { url: WEB_APP_URL }
          }
        ]]
      }
    }
  );
});

bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;
  
  try {
    const info = getSystemInfo();
    const pingData = await checkNetworkPing();
    
    const message = formatSystemInfo(info) + '\n\n' + formatPingInfo(pingData);
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error getting stats: ' + error.message);
  }
});

bot.onText(/\/ping/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, '🔍 Checking network...');
  
  try {
    const pingData = await checkNetworkPing();
    const message = '🌐 <b>Network Status</b>\n\n' + formatPingInfo(pingData);
    
    await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error checking ping: ' + error.message);
  }
});

bot.onText(/\/monitor (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const action = match[1];
  
  if (action === 'start') {
    if (STATE.isMonitoring) {
      await bot.sendMessage(chatId, '⚠️ Monitoring is already running');
    } else {
      await startMonitoring();
      await bot.sendMessage(chatId, '✅ Monitoring started - logs will be sent to the group');
    }
  } else if (action === 'stop') {
    if (!STATE.isMonitoring) {
      await bot.sendMessage(chatId, '⚠️ Monitoring is not running');
    } else {
      stopMonitoring();
      await bot.sendMessage(chatId, '⏸ Monitoring stopped');
    }
  } else if (action === 'status') {
    const status = STATE.isMonitoring ? '✅ Running' : '⏸ Stopped';
    const uptime = Date.now() - STATE.serverStartTime;
    const minutes = Math.floor(uptime / 60000);
    const lastPing = STATE.pingHistory[STATE.pingHistory.length - 1] || 'N/A';
    
    await bot.sendMessage(chatId,
      `📊 <b>Monitoring Status:</b> ${status}\n` +
      `⏱ <b>Bot Uptime:</b> ${minutes} minutes\n` +
      `📈 <b>Ping History:</b> ${STATE.pingHistory.length} readings\n` +
      `🌐 <b>Last Ping:</b> ${lastPing}ms`,
      { parse_mode: 'HTML' }
    );
  }
});

bot.onText(/\/update/, async (msg) => {
  const chatId = msg.chat.id;
  
  await bot.sendMessage(chatId, '📊 Sending status update to logs...');
  
  try {
    await sendStatusUpdate();
    await bot.sendMessage(chatId, '✅ Status update sent to group');
  } catch (error) {
    await bot.sendMessage(chatId, '❌ Error: ' + error.message);
  }
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  
  const helpText = `
🤖 <b>Bot Commands:</b>

<b>Game Commands:</b>
/start - Open the mini app
/stats - View system & network statistics

<b>Monitoring Commands:</b>
/ping - Check network ping
/monitor start - Start monitoring
/monitor stop - Stop monitoring
/monitor status - Check monitoring status
/update - Send status update to logs

<b>Admin Commands:</b>
/refund [charge_id] - Refund a payment

<b>Payment System (NEW!):</b>
✅ Direct invoice opening with openInvoice()
✅ Invoice appears as popup in Mini App
✅ NO chat redirect needed
✅ Stays in Mini App during payment
✅ Automatic coin delivery via Cloud Storage
✅ 13 coin packages available
✅ Transaction logging
✅ Refund support

<b>How Payments Work:</b>
1. User clicks "Purchase" in Mini App
2. Invoice popup appears INSTANTLY
3. User pays with Stars (stays in app!)
4. Coins auto-added via Cloud Storage
5. Balance updates immediately!

<b>Technical:</b>
- 🌐 HTTP Server: Port ${HTTP_PORT}
- 🔗 Endpoint: POST /create-invoice
- 📱 Method: Telegram.WebApp.openInvoice()
- ☁️ Storage: CloudStorage API
- 📊 Logging: Enabled

<b>Features:</b>
- 🔋 Power status monitoring
- 🌐 Network ping tracking
- ⚠️ Automatic spike detection
- 📊 Regular status updates
- 📝 Detailed transaction logs
- 💰 Secure Star payments
- 💸 Admin refund system
  `.trim();
  
  await bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
});

// ============================================
// EVENT LISTENERS
// ============================================

bot.on('pre_checkout_query', handlePreCheckoutQuery);
bot.on('successful_payment', handleSuccessfulPayment);

// ============================================
// ERROR HANDLING
// ============================================

process.on('uncaughtException', async (error) => {
  console.error('Uncaught Exception:', error);
  await sendErrorLog(error, 'Uncaught Exception');
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  await sendErrorLog(new Error(String(reason)), 'Unhandled Rejection');
});

// ============================================
// PERIODIC TASKS
// ============================================

setInterval(() => {
  const now = Date.now();
  const dayInMs = 24 * 60 * 60 * 1000;
  
  for (const [chatId, session] of STATE.userSessions.entries()) {
    if (now - session.lastActive > dayInMs) {
      STATE.userSessions.delete(chatId);
    }
  }
}, 60 * 60 * 1000);

// ============================================
// STARTUP
// ============================================

async function startBot() {
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🚀 VOID GIFT BOT - PAYMENT SYSTEM V7.0');
  console.log('═══════════════════════════════════════════');
  console.log('');
  console.log('✅ Bot started successfully!');
  console.log('🌐 Web App URL:', WEB_APP_URL);
  console.log('💰 Payment System: Telegram Stars (openInvoice)');
  console.log('📦 Available Packages: 13');
  console.log('📝 Transaction Logging: Enabled');
  console.log('💸 Refund System: Active');
  console.log('');
  console.log('🆕 NEW PAYMENT FLOW:');
  console.log('   1. User clicks Purchase in Mini App');
  console.log('   2. WebApp calls POST /create-invoice');
  console.log('   3. Bot creates invoice link');
  console.log('   4. WebApp opens invoice with openInvoice()');
  console.log('   5. Invoice appears as POPUP in Mini App');
  console.log('   6. User pays (STAYS IN APP!)');
  console.log('   7. Coins auto-delivered via Cloud Storage');
  console.log('   ✨ NO chat redirect - seamless UX!');
  console.log('');
  
  // Start HTTP server
  app.listen(HTTP_PORT, () => {
    console.log(`🌐 HTTP Server running on port ${HTTP_PORT}`);
    console.log(`🔗 Invoice endpoint: POST http://localhost:${HTTP_PORT}/create-invoice`);
    console.log('');
  });
  
  // Start monitoring
  await startMonitoring();
  
  console.log('✅ System monitoring enabled');
  console.log('📊 Logs will be sent to Telegram group');
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('🎮 BOT IS READY - Waiting for requests...');
  console.log('═══════════════════════════════════════════');
  console.log('');
}

startBot().catch(error => {
  console.error('❌ Failed to start bot:', error);
  process.exit(1);
});
