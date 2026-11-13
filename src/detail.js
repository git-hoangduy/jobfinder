const cheerio = require('cheerio');
const { http, toISO, clean } = require('./util');

function decodeIfEscaped(s) {
  if (!s) return '';
  if (!/</.test(s) && /&lt;/.test(s)) return cheerio.load('<div>' + s + '</div>')('div').text();
  return s;
}

function findJobPosting($) {
  let found = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    let raw = $(el).html() || '';
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      try {
        data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        return;
      }
    }
    const arr = [].concat(data['@graph'] || data);
    found = arr.find((o) => o && (o['@type'] === 'JobPosting' || (Array.isArray(o['@type']) && o['@type'].includes('JobPosting'))));
  });
  return found;
}

function salaryText(bs) {
  if (!bs) return '';
  const v = bs.value || {};
  if (typeof v.value === 'string' && v.value) return v.value;
  const min = v.minValue, max = v.maxValue;
  if (!min && !max && !v.value) return '';
  const cur = bs.currency || '';
  const fmt = (n) => (+n >= 1e6 ? (+n / 1e6).toLocaleString('vi-VN') + ' triệu' : (+n).toLocaleString('vi-VN'));
  if (min && max) return `${fmt(min)} - ${fmt(max)} ${cur === 'VND' ? '' : cur}`.trim();
  return `${fmt(min || max || v.value)} ${cur === 'VND' ? '' : cur}`.trim();
}

// Lấy chi tiết từ trang job: mô tả, yêu cầu, hạn nộp...
// Trả về { gone: true } nếu trang không còn / đã hết hạn.
async function fetchDetail(job) {
  if (job.source === 'linkedin') return require('./sources/linkedin').detail(job);
  let html;
  try {
    html = await http(job.url, { retries: 1 });
  } catch (e) {
    if (e.status === 404 || e.status === 410) return { gone: true, reason: 'Trang tin không còn tồn tại' };
    throw e;
  }
  const $ = cheerio.load(html);
  const jp = findJobPosting($);
  const out = {};
  if (jp) {
    out.description = decodeIfEscaped(jp.description);
    if (jp.qualifications) out.requirements = decodeIfEscaped(jp.qualifications);
    if (jp.experienceRequirements && typeof jp.experienceRequirements === 'object') {
      const mo = jp.experienceRequirements.monthsOfExperience;
      if (mo != null && !isNaN(mo)) out.expYears = Math.round(+mo / 12);
    }
    out.deadline = toISO(jp.validThrough);
    out.postedAt = toISO(jp.datePosted);
    const sal = salaryText(jp.baseSalary);
    if (sal) out.salaryDetail = sal;
    const locs = [].concat(jp.jobLocation || []).map((l) => l && l.address).filter(Boolean);
    const addr = locs
      .map((a) => (typeof a === 'string' ? a : [a.streetAddress, a.addressLocality, a.addressRegion].filter((x) => x && x !== 'Not Available').join(', ')))
      .filter(Boolean);
    if (addr.length) out.address = [...new Set(addr)].join(' | ');
    if (/TELECOMMUTE/i.test(jp.jobLocationType || '')) out.workMode = 'Remote';
  }

  // Fallback theo từng trang khi JSON-LD thiếu mô tả
  if (!out.description || out.description.length < 80) {
    const sections = [
      '.job-description', '.job-detail__information-detail', '#section-job-description', '.detail-row.reset-bullet',
      '.job-content', '[class*="JobDetail"] section', '.paragraph',
    ];
    const parts = [];
    for (const sel of sections) {
      $(sel).each((_, e) => {
        const h = $(e).html();
        if (h && clean($(e).text()).length > 40) parts.push(h);
      });
      if (parts.length) break;
    }
    if (parts.length) out.description = parts.join('<hr>');
  }

  if (out.deadline && new Date(out.deadline) < new Date()) {
    out.gone = true;
    out.reason = 'Đã quá hạn nộp hồ sơ';
  }
  return out;
}

module.exports = { fetchDetail };
