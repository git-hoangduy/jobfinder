// Dịch mô tả job tiếng Anh -> tiếng Việt (chạy lúc thu thập, kết quả lưu sẵn)
// Dùng endpoint dịch miễn phí của Google (client=gtx). Nếu bị giới hạn (429) thì dừng,
// lần thu thập sau dịch tiếp. Trên web vẫn có dự phòng: dịch trên trình duyệt / Google Translate.
const cheerio = require('cheerio');
const { sleep } = require('./util');

const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gi;
const EN_WORDS = /\b(the|and|with|you|your|for|of|to|in|our|will|experience|team|work|skills)\b/gi;

function plain(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
}

// Tiếng Anh: gần như không có chữ có dấu tiếng Việt + nhiều từ tiếng Anh thông dụng
function isEnglish(html) {
  const t = plain(html);
  const letters = (t.match(/[a-zà-ỹ]/gi) || []).length;
  if (letters < 80) return false;
  const vi = (t.match(VI_CHARS) || []).length;
  const en = (t.match(EN_WORDS) || []).length;
  return vi / letters < 0.01 && en >= 8;
}

async function gtx(lines) {
  const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=vi&dt=t', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: 'q=' + encodeURIComponent(lines.join('\n')),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw Object.assign(new Error('Dịch: HTTP ' + res.status), { status: res.status });
  const data = await res.json();
  const out = (data[0] || []).map((x) => x[0]).join('').split('\n');
  if (out.length !== lines.length) throw new Error('Dịch: số dòng không khớp');
  return out;
}

// Dịch HTML: giữ nguyên thẻ, chỉ thay nội dung chữ
async function translateHtml(html) {
  if (!html || !html.trim()) return '';
  const $ = cheerio.load('<div id="__r">' + html + '</div>', null, false);
  const nodes = [];
  const walk = (el) => {
    for (const c of el.children || []) {
      if (c.type === 'text') {
        const s = c.data.replace(/\s+/g, ' ').trim();
        if (/[a-z]{2,}/i.test(s)) nodes.push(c);
      } else if (c.children) walk(c);
    }
  };
  walk($('#__r')[0]);
  // gom thành từng lô ~3500 ký tự
  let batch = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const out = await gtx(batch.map((n) => n.data.replace(/\s+/g, ' ').trim()));
    batch.forEach((n, i) => {
      const lead = /^\s/.test(n.data) ? ' ' : '';
      const trail = /\s$/.test(n.data) ? ' ' : '';
      n.data = lead + out[i].trim() + trail;
    });
    batch = [];
    size = 0;
    await sleep(800);
  };
  for (const n of nodes) {
    const len = n.data.length;
    if (size + len > 3500) await flush();
    batch.push(n);
    size += len;
  }
  await flush();
  return $('#__r').html();
}

async function translateJob(j) {
  const out = {};
  for (const k of ['description', 'requirements', 'benefits']) {
    if (j[k] && isEnglish(j[k])) out[k] = await translateHtml(j[k]);
  }
  return out;
}

module.exports = { isEnglish, translateHtml, translateJob };
