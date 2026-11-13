const cheerio = require('cheerio');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Một số trang (vd TopCV) chặn fetch của Node theo "dấu vân tay" TLS nhưng cho curl qua.
// -> Khi gặp 403 với GET thì thử lại bằng curl (có sẵn trên Windows 10+).
const { execFile } = require('child_process');
function curlGet(url) {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['-s', '-L', '--compressed', '--max-time', '25', '-A', UA, '-H', 'Accept-Language: vi-VN,vi;q=0.9', '-w', '\n__STATUS__%{http_code}', url],
      { maxBuffer: 30 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        if (err) return reject(err);
        const i = stdout.lastIndexOf('\n__STATUS__');
        const status = +stdout.slice(i + 11);
        if (status === 404 || status === 410) return reject(Object.assign(new Error('HTTP ' + status), { status }));
        if (status >= 400) return reject(new Error('HTTP ' + status + ' (curl) ' + url));
        resolve(stdout.slice(0, i));
      }
    );
  });
}
const preferCurl = new Set(); // host đã từng bị 403 -> dùng curl luôn

// Giãn cách request theo từng trang để không bị chặn (HTTP 429)
const HOST_GAP = { 'www.topcv.vn': 4000, 'itviec.com': 2000, 'www.careerlink.vn': 1500, 'careerviet.vn': 1000, 'www.linkedin.com': 2500 };
const nextAt = {};
async function throttle(host) {
  const gap = HOST_GAP[host] ?? 300;
  const now = Date.now();
  const t = Math.max(now, nextAt[host] || 0);
  nextAt[host] = t + gap;
  if (t > now) await sleep(t - now);
}

async function httpOnce(url, opts, host, isGet) {
  await throttle(host);
  if (isGet && preferCurl.has(host)) {
    const txt = await curlGet(url);
    return opts.json ? JSON.parse(txt) : txt;
  }
  try {
    return await httpFetch(url, opts);
  } catch (e) {
    if (isGet && /HTTP 403|fetch failed/.test(e.message)) {
      preferCurl.add(host);
      await sleep(800);
      const txt = await curlGet(url);
      return opts.json ? JSON.parse(txt) : txt;
    }
    throw e;
  }
}

async function http(url, opts = {}) {
  const host = new URL(url).host;
  const isGet = !opts.method || opts.method === 'GET';
  try {
    return await httpOnce(url, opts, host, isGet);
  } catch (e) {
    if (/HTTP 429/.test(e.message)) {
      // bị giới hạn tần suất -> chờ rồi thử lại 1 lần
      nextAt[host] = Date.now() + 15000;
      return await httpOnce(url, opts, host, isGet);
    }
    if (/Command failed/.test(e.message)) throw new Error('Không kết nối được ' + host);
    throw e;
  }
}

async function httpFetch(url, { method = 'GET', body, json = false, headers = {}, retries = 1 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
          Accept: json ? 'application/json' : 'text/html,application/xhtml+xml,*/*',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        redirect: 'follow',
        signal: AbortSignal.timeout(25000),
      });
      if (res.status === 404 || res.status === 410) {
        const e = new Error('HTTP ' + res.status);
        e.status = res.status;
        throw e;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      return json ? await res.json() : await res.text();
    } catch (e) {
      lastErr = e;
      if (e.status === 404 || e.status === 410 || /HTTP 403/.test(e.message)) throw e;
      if (i < retries) await sleep(1200 * (i + 1));
    }
  }
  throw lastErr;
}

// Bỏ dấu tiếng Việt + chữ thường, dùng để so khớp từ khóa
function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function slugify(s) {
  return norm(s)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// "Đăng 6 ngày trước", "Posted 17 hours ago", "một giờ trước", "16-10-2026", "13/11/2026", "hôm nay"
function parseWhen(text, now = new Date()) {
  if (!text) return null;
  const t = norm(text);
  let m = t.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], 12).toISOString();
  m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).toISOString();
  if (/hom nay|today|vua xong|just now|moments? ago/.test(t)) return now.toISOString();
  if (/hom qua|yesterday/.test(t)) return new Date(now - 864e5).toISOString();
  m = t.match(/(\d+|mot|an?)\s*(giay|second|phut|minute|gio|tieng|hour|ngay|day|tuan|week|thang|month|nam|year)/);
  if (m) {
    const n = /^\d+$/.test(m[1]) ? +m[1] : 1;
    const unit = {
      giay: 1e3, second: 1e3, phut: 6e4, minute: 6e4, gio: 36e5, tieng: 36e5, hour: 36e5,
      ngay: 864e5, day: 864e5, tuan: 6048e5, week: 6048e5, thang: 2592e6, month: 2592e6, nam: 31536e6, year: 31536e6,
    }[m[2]];
    return new Date(now - n * unit).toISOString();
  }
  return null;
}

function toISO(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d) ? null : d.toISOString();
}

// Làm sạch HTML mô tả công việc (chống XSS khi hiển thị trong popup)
const ALLOWED = new Set(['p', 'br', 'ul', 'ol', 'li', 'strong', 'b', 'em', 'i', 'u', 'h2', 'h3', 'h4', 'h5', 'div', 'span', 'a', 'table', 'tr', 'td', 'th', 'tbody', 'thead']);
function sanitize(html) {
  if (!html) return '';
  const $ = cheerio.load('<div id="__root">' + html + '</div>', null, false);
  $('script,style,iframe,object,embed,form,input,button,img,svg,link,meta,noscript').remove();
  $('#__root *').each((_, el) => {
    const tag = el.tagName && el.tagName.toLowerCase();
    if (!ALLOWED.has(tag)) {
      $(el).replaceWith($(el).contents());
      return;
    }
    const href = tag === 'a' ? $(el).attr('href') : null;
    for (const name of Object.keys(el.attribs || {})) $(el).removeAttr(name);
    if (href && /^https?:\/\//i.test(href)) $(el).attr({ href, target: '_blank', rel: 'noopener noreferrer' });
  });
  return ($('#__root').html() || '').replace(/(<br\s*\/?>\s*){3,}/g, '<br><br>').trim();
}

// Chạy song song có giới hạn
async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        out[idx] = await fn(items[idx], idx);
      } catch (e) {
        out[idx] = { error: e };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { http, norm, slugify, clean, parseWhen, toISO, sanitize, pool, sleep };
