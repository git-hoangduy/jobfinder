// Đọc số năm kinh nghiệm yêu cầu trong mô tả (khi trang nguồn không có trường kinh nghiệm riêng)
// VD: "ít nhất 2 năm kinh nghiệm", "3+ years of experience", "Kinh nghiệm: 1-2 năm" -> lấy số nhỏ nhất
const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
const PATTERNS = [
  /(\d{1,2})\s*\+?\s*(?:(?:-|–|~|đến|to)\s*\d{1,2}\s*)?(?:năm|years?|yrs?)\s*(?:trở lên\s*)?(?:of\s+)?(?:kinh nghiệm|experience|kn\b|relevant|working|hands-on|professional|in\b|with\b)/i,
  /(?:ít nhất|tối thiểu|trên|từ|at least|minimum|min\.?|over|more than)\s*(\d{1,2})\s*(?:\+\s*)?(?:năm|years?)/i,
  /kinh nghiệm[^.;\n]{0,25}?(\d{1,2})\s*(?:\+\s*)?năm/i,
  /experience[^.;\n]{0,20}?(\d{1,2})\s*\+?\s*years?/i,
];
function expFromText(...parts) {
  const t = strip(parts.join(' . '));
  const found = [];
  for (const re of PATTERNS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(t))) { const n = +m[1]; if (n >= 0 && n <= 15) found.push(n); }
  }
  return found.length ? Math.min(...found) : null;
}
module.exports = { expFromText };
