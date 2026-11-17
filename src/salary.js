// Chọn mức lương đầy đủ nhất cho 1 job:
// 1) lương ở danh sách nếu có con số  2) lương trong dữ liệu chi tiết (JSON-LD)
// 3) lương ghi trong tiêu đề  4) lương ghi trong mô tả/quyền lợi (ghi chú "theo mô tả")
// 5) nếu không có con số: dùng chữ mô tả (Thương lượng / Cạnh tranh...)
const { clean } = require('./util');

const hasNum = (s) => /\d/.test(s || '');
const VAGUE_OK = /(thương lượng|thoả thuận|thỏa thuận|cạnh tranh|negotiable|competitive|đăng nhập)/i;

const NUM = '\\d{1,3}(?:[.,]\\d{3})*(?:[.,]\\d+)?';
const UNIT = '(?:triệu|trieu|tr\\b|m\\b|million|mil\\b|usd|\\$|vnđ|vnd|đ\\b|k\\b)';
// "15 - 20 triệu", "15tr-18tr", "1,000 - 1,500 USD", "$1000 - $2000"
const RE_RANGE = new RegExp(`\\$?\\s*${NUM}\\s*${UNIT}?\\s*(?:-|–|~|đến|tới|to)\\s*\\$?\\s*${NUM}\\s*${UNIT}`, 'i');
const RE_RANGE_DOLLAR = new RegExp(`\\$\\s*${NUM}\\s*(?:-|–|~|to)\\s*\\$?\\s*${NUM}`, 'i');
// "up to 50M", "lên đến 30 triệu", "từ 12 triệu", "upto $3000"
const RE_SINGLE = new RegExp(
  `(?:up ?to|upto|lên (?:đến|tới)|tối đa|khởi điểm(?: từ)?|từ|from|trên|above|over)\\s*:?\\s*\\$?\\s*${NUM}\\s*${UNIT}`,
  'i'
);
// Phải có ngữ cảnh lương ở gần
const RE_CONTEXT = /(lương|luong|thu nhập|thu nhap|salary|income|compensation|package|gross|net\b|offer)/i;

function fromText(text) {
  if (!text) return '';
  const t = clean(String(text).replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&amp;/g, ' '));
  // quét từng đoạn có từ khóa lương
  const re = /(lương|luong|thu nhập|thu nhap|salary|income|compensation|package)/gi;
  let m;
  while ((m = re.exec(t))) {
    const win = t.slice(m.index, m.index + 90);
    if (/tháng lương|lương tháng 1[2-9]|1[2-9]th|month salary|review|tăng lương|xét lương|% ?(of )?salary/i.test(win.slice(0, 40))) continue;
    const hit = win.match(RE_RANGE) || win.match(RE_RANGE_DOLLAR) || win.match(RE_SINGLE);
    if (hit && !/%/.test(hit[0])) return tidy(hit[0]);
  }
  // không có từ khóa đứng trước: chấp nhận khoảng lương có đơn vị tiền rõ ràng + ngữ cảnh lương ở sau
  const hit = t.match(RE_RANGE);
  if (hit && RE_CONTEXT.test(t.slice(hit.index, hit.index + hit[0].length + 30)) && /triệu|tr\b|usd|\$|vnd|vnđ/i.test(hit[0])) return tidy(hit[0]);
  return '';
}

function tidy(s) {
  s = clean(s).replace(/^(up ?to|upto)/i, 'Lên đến').replace(/^from/i, 'Từ').replace(/\s*(-|–|~)\s*/g, ' - ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function pickSalary(j) {
  if (hasNum(j.salary)) return { salary: j.salary, salaryNote: '' };
  if (hasNum(j.salaryDetail)) return { salary: j.salaryDetail, salaryNote: '' };
  const t = fromText(j.title);
  if (t) return { salary: t, salaryNote: 'theo tiêu đề' };
  const d = fromText([j.description, j.benefits, j.requirements].filter(Boolean).join(' . '));
  if (d) return { salary: d, salaryNote: 'theo mô tả' };
  const vague = [j.salary, j.salaryDetail].find((s) => s && VAGUE_OK.test(s)) || '';
  return { salary: vague === 'Không ghi' ? '' : vague, salaryNote: '' };
}

module.exports = { pickSalary, fromText };
