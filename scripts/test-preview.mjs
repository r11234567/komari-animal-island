import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const PORT = 4173;
const DIST_DIR = path.join(PROJECT_ROOT, 'dist');
const ARTIFACT_DIR = 'C:\\Users\\yuqiujiang\\.gemini\\antigravity\\brain\\0db22aaf-dbd3-4c61-8dbe-398f6c40a41f';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

// 简易静态服务器 + 模拟 Komari API 及 Connect-RPC PasswordLoginService
let userLoggedIn = false;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = url.pathname;

  if (pathname === '/api/me') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ username: userLoggedIn ? '森友岛主' : 'Guest', logged_in: userLoggedIn }));
    return;
  }

  // 模拟 Connect-RPC PasswordLoginService.BeginPasswordLogin
  if (pathname === '/komari.credential.v1.PasswordLoginService/BeginPasswordLogin' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(chunk); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const isProto = req.headers['content-type']?.includes('application/proto') || !req.headers['content-type']?.includes('application/json');
      const isTotp = raw.toString('utf8').includes('totp');

      if (isProto) {
        res.writeHead(200, { 'Content-Type': 'application/proto' });
        const hex = isTotp
          ? '12250a0b6e61746976653a746f74701216e8baabe4bbbde9aa8ce8af81e599a82028544f545029'
          : '12290a106e61746976653a656d61696c5f6f74701215e982aee7aeb1e9809ae79fa5e9aa8ce8af81e7a081';
        res.end(Buffer.from(hex, 'hex'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        authenticated: false,
        providers: isTotp
          ? [{ id: 'native:totp', displayName: '身份验证器 (TOTP)', kind: 1 }]
          : [{ id: 'native:email_otp', displayName: '邮箱通知验证码', kind: 2 }],
        expiresAt: new Date(Date.now() + 180000).toISOString(),
      }));
    });
    return;
  }

  // 模拟 Connect-RPC PasswordLoginService.BeginLoginVerification
  if (pathname === '/komari.credential.v1.PasswordLoginService/BeginLoginVerification' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(chunk); });
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const isProto = req.headers['content-type']?.includes('application/proto') || !req.headers['content-type']?.includes('application/json');
      const isTotp = raw.toString('utf8').includes('totp');

      if (isProto) {
        res.writeHead(200, { 'Content-Type': 'application/proto' });
        const hex = isTotp
          ? '0a176d6f636b5f6368616c6c656e67655f746f74705f3132331a036f7470222a0a130a066c656e67746812091100000000000018400a130a066469676974731209110000000000001840'
          : '0a126d6f636b5f6368616c6c656e67655f3132331a036f747022730a130a066c656e67746812091100000000000020400a190a0763686172736574120e1a0c616c7068616e756d657269630a1c0a066d6574686f6412121a106e6f74696669636174696f6e5f6f74700a230a0b64657374696e6174696f6e12141a12796f752a2a2a406578616d706c652e636f6d';
        res.end(Buffer.from(hex, 'hex'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        challengeId: 'challenge_mock_' + Date.now(),
        expiresAt: new Date(Date.now() + 180000).toISOString(),
        promptType: 'otp',
        prompt: isTotp ? {
          digits: 6,
          method: 'totp',
        } : {
          length: 8,
          charset: 'alphanumeric',
          kind: 'email',
          address: 'you***@example.com',
          cooldown: 60,
        },
      }));
    });
    return;
  }

  // 模拟 Connect-RPC PasswordLoginService.CompletePasswordLogin
  if (pathname === '/komari.credential.v1.PasswordLoginService/CompletePasswordLogin' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (chunk) => { chunks.push(chunk); });
    req.on('end', () => {
      userLoggedIn = true;
      const isProto = req.headers['content-type']?.includes('application/proto') || !req.headers['content-type']?.includes('application/json');
      if (isProto) {
        res.writeHead(200, {
          'Content-Type': 'application/proto',
          'Set-Cookie': 'session_token=valid_token_mock; Path=/; HttpOnly',
        });
        res.end(Buffer.from('0801', 'hex'));
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'session_token=valid_token_mock; Path=/; HttpOnly',
      });
      res.end(JSON.stringify({ authenticated: true }));
    });
    return;
  }

  // 模拟 Connect-RPC PasswordLoginService.CancelPasswordLogin
  if (pathname === '/komari.credential.v1.PasswordLoginService/CancelPasswordLogin' && req.method === 'POST') {
    const isProto = req.headers['content-type']?.includes('application/proto') || !req.headers['content-type']?.includes('application/json');
    if (isProto) {
      res.writeHead(200, { 'Content-Type': 'application/proto' });
      res.end(Buffer.alloc(0));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({}));
    return;
  }

  // 模拟传统 /api/login 回退
  if (pathname === '/api/login' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data['2fa_code'] && !data['code']) {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Use the two-step password login flow' }));
          return;
        }
        userLoggedIn = true;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'success',
          data: { 'set-cookie': { session_token: 'valid_session_token_12345' } },
        }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invalid JSON' }));
      }
    });
    return;
  }

  if (pathname === '/' || !pathname.includes('.')) {
    pathname = '/index.html';
  }

  const filePath = path.join(DIST_DIR, pathname);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  } else {
    const indexHtml = path.join(DIST_DIR, 'index.html');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(indexHtml).pipe(res);
  }
});

server.listen(PORT, async () => {
  console.log(`Server running at http://localhost:${PORT}`);

  try {
    const browser = await puppeteer.launch({
      executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // 1. 打开首页
    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1200));

    // 截图 1：首页概览
    const shot1 = path.join(ARTIFACT_DIR, 'screenshot-1-homepage.png');
    await page.screenshot({ path: shot1, fullPage: false });
    console.log('Saved:', shot1);

    // 1.1 滚动到服务器列表，查看卡片视图中的 GPU 与显存展示（Singapore 节点有 GPU/显存，Japan 节点无 GPU 则不展示）
    await page.evaluate(() => {
      document.querySelector('.server-section')?.scrollIntoView({ behavior: 'instant', block: 'start' });
    });
    await new Promise((r) => setTimeout(r, 400));
    const shot6 = path.join(ARTIFACT_DIR, 'screenshot-6-gpu-card.png');
    await page.screenshot({ path: shot6, fullPage: false });
    console.log('Saved:', shot6);

    // 1.2 点击切换到列表视图
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.filters label'));
      const listLabel = labels.find((l) => l.textContent.includes('列表'));
      listLabel?.click();
    });
    await new Promise((r) => setTimeout(r, 400));
    const shot7 = path.join(ARTIFACT_DIR, 'screenshot-7-gpu-list.png');
    await page.screenshot({ path: shot7, fullPage: false });
    console.log('Saved:', shot7);

    // 1.3 切回卡片视图并点击 Singapore 节点的“查看详情”按钮
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('.filters label'));
      const cardLabel = labels.find((l) => l.textContent.includes('卡片'));
      cardLabel?.click();
    });
    await new Promise((r) => setTimeout(r, 400));

    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.km-node-card'));
      const sgCard = cards.find((c) => c.textContent.includes('Singapore'));
      const detailBtn = sgCard?.querySelector('button');
      detailBtn?.click();
    });
    await page.waitForSelector('.detail-modal');
    await new Promise((r) => setTimeout(r, 600));

    // 截图 8：节点详情模态框中的 GPU / 显存 / 温度展示
    const shot8 = path.join(ARTIFACT_DIR, 'screenshot-8-gpu-modal.png');
    await page.screenshot({ path: shot8, fullPage: false });
    console.log('Saved:', shot8);

    // 关闭详情弹窗
    await page.evaluate(() => {
      const closeBtn = document.querySelector('.detail-modal button');
      closeBtn?.click();
    });
    await new Promise((r) => setTimeout(r, 500));
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise((r) => setTimeout(r, 300));

    // 2. 点击“岛民”按钮弹出登录模态框
    const residentBtn = await page.waitForSelector('.resident-btn');
    await residentBtn.click();
    await page.waitForSelector('.km-login-dialog');
    await new Promise((r) => setTimeout(r, 600));

    // 截图 2：登录模态框 - 通行密码第一步（账号与密码）
    const shot2 = path.join(ARTIFACT_DIR, 'screenshot-2-tab-password.png');
    await page.screenshot({ path: shot2, fullPage: false });
    console.log('Saved:', shot2);

    // 2.1 提交账号密码，触发一次性通知 OTP 验证码流程（后端自动发送邮件验证码）
    await page.type('input[placeholder="请输入账号"]', 'admin');
    await page.type('input[placeholder="请输入密码"]', 'admin123');
    const submitBtn = await page.waitForSelector('.km-login-dialog button[type="submit"]');
    await submitBtn.click();

    // 等待通知验证码两步验证面板自动展开（8位字母数字组合，自动发送至 you***@example.com，含60秒重新发送倒计时）
    await page.waitForSelector('.two-factor-step-panel');
    await new Promise((r) => setTimeout(r, 600));

    // 截图 2b：一次性通知 OTP 验证码面板
    const shot2b = path.join(ARTIFACT_DIR, 'screenshot-2b-tab-password-2fa.png');
    await page.screenshot({ path: shot2b, fullPage: false });
    console.log('Saved:', shot2b);

    // 2.2 测试场景二：未配置通知渠道，后端仅要求 TOTP（身份验证器6位动态码）
    // 点击“返回修改账号密码”
    const backBtn = await page.evaluateHandle(() => {
      const btns = Array.from(document.querySelectorAll('.two-factor-actions button'));
      return btns.find((b) => b.textContent.includes('返回修改'));
    });
    if (backBtn) {
      await backBtn.click();
      await new Promise((r) => setTimeout(r, 500));

      // 输入 admin_totp，后端根据规范返回 native:totp
      const userInput = await page.waitForSelector('input[placeholder="请输入账号"]');
      await userInput.click({ clickCount: 3 });
      await userInput.press('Backspace');
      await userInput.type('admin_totp');

      const passInput = await page.waitForSelector('input[placeholder="请输入密码"]');
      await passInput.click({ clickCount: 3 });
      await passInput.press('Backspace');
      await passInput.type('admin123');

      const submitBtn2 = await page.waitForSelector('.km-login-dialog button[type="submit"]');
      await submitBtn2.click();

      await page.waitForSelector('.two-factor-step-panel');
      await new Promise((r) => setTimeout(r, 600));

      // 截图 2c：后端要求 TOTP 时，前端呈现 6 位纯数字输入，无重发按钮
      const shot2c = path.join(ARTIFACT_DIR, 'screenshot-2c-tab-password-totp.png');
      await page.screenshot({ path: shot2c, fullPage: false });
      console.log('Saved:', shot2c);
    }

    // 3. 点击切换到“通行密钥”Tab
    const passkeyTab = await page.evaluateHandle(() => {
      const tabs = Array.from(document.querySelectorAll('.login-tabs [role="tab"], .login-tabs .animal-tabs__item, .login-tabs button'));
      return tabs.find((el) => el.textContent.includes('通行密钥'));
    });
    if (passkeyTab) {
      await passkeyTab.click();
      await new Promise((r) => setTimeout(r, 400));
    }

    // 截图 3：登录模态框 - 通行密钥 Tab
    const shot3 = path.join(ARTIFACT_DIR, 'screenshot-3-tab-passkey.png');
    await page.screenshot({ path: shot3, fullPage: false });
    console.log('Saved:', shot3);

    // 4. 点击切换到“GitHub 登录”Tab
    const oauthTab = await page.evaluateHandle(() => {
      const tabs = Array.from(document.querySelectorAll('.login-tabs [role="tab"], .login-tabs .animal-tabs__item, .login-tabs button'));
      return tabs.find((el) => el.textContent.includes('登录') && !el.textContent.includes('通行'));
    });
    if (oauthTab) {
      await oauthTab.click();
      await new Promise((r) => setTimeout(r, 400));
    }

    // 截图 4：登录模态框 - OAuth / GitHub Tab
    const shot4 = path.join(ARTIFACT_DIR, 'screenshot-4-tab-oauth.png');
    await page.screenshot({ path: shot4, fullPage: false });
    console.log('Saved:', shot4);

    // 5. 模拟已登录状态（写入有效 JWT）并刷新
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const exp = Math.floor(Date.now() / 1000) + 86400 * 365;
    const payload = Buffer.from(JSON.stringify({ username: '森友岛主', exp, sub: 'island-admin' })).toString('base64url');
    const fakeJwt = `${header}.${payload}.mockSignature`;

    await page.evaluate((jwt) => {
      localStorage.setItem('token', jwt);
    }, fakeJwt);

    await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 1200));

    // 截图 5：登录后状态 - 顶栏“岛民”按钮显示为已登录（在线绿点 + 用户名）
    const shot5 = path.join(ARTIFACT_DIR, 'screenshot-5-logged-in-header.png');
    await page.screenshot({ path: shot5, fullPage: false });
    console.log('Saved:', shot5);

    // 6. 点击已登录的“岛民”按钮，验证是否跳转到 /admin/dashboard 而非弹出框
    const loggedInBtn = await page.waitForSelector('.resident-btn--logged-in');
    await loggedInBtn.click();
    await new Promise((r) => setTimeout(r, 600));

    const currentUrl = page.url();
    const hasModal = await page.evaluate(() => {
      const modal = document.querySelector('.km-login-dialog');
      return modal && modal.offsetParent !== null;
    });

    console.log('Post-click URL:', currentUrl);
    console.log('Modal shown (should be false/falsy):', Boolean(hasModal));

    await browser.close();
    server.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during preview test:', err);
    server.close();
    process.exit(1);
  }
});
