const cheerio = require('cheerio');
const { http, slugify, clean, parseWhen } = require('../util');

const absolute = (u) => (u && u.startsWith('/') ? 'https://careerviet.vn' + u : u);

async function list(keyword, { page = 1 } = {}) {
  const url = `https://careerviet.vn/viec-lam/${slugify(keyword)}-tai-ho-chi-minh-kl8${page > 1 ? '-trang-' + page : ''}-vi.html`;
  const html = await http(url);
  const $ = cheerio.load(html);
  const jobs = [];
  $('.job-item').each((_, el) => {
    const x = $(el);
    const a = x.find('a.job_link').filter((i, e) => clean($(e).text())).first();
    let href = a.attr('href') || '';
    if (!href) return;
    if (href.startsWith('/')) href = 'https://careerviet.vn' + href;
    const idm = href.match(/\.([0-9A-F]{6,})\.html/i);
    const text = clean(x.text());
    const remain = text.match(/chỉ còn:?\s*(\d+)\s*ngày/i);
    const updated = text.match(/Cập nhật:?\s*(\d{1,2}-\d{1,2}-\d{4})/i);
    let deadline = null;
    if (remain) {
      const d = new Date();
      d.setDate(d.getDate() + +remain[1]);
      d.setHours(23, 59, 0, 0);
      deadline = d.toISOString();
    }
    jobs.push({
      source: 'careerviet',
      sourceId: idm ? idm[1] : href,
      title: clean(a.text()),
      company: clean(x.find('a.company-name').first().text()),
      logo: absolute(x.find('img').attr('data-src') || x.find('img').attr('src') || ''),
      url: href,
      salary: clean(x.find('.salary p, .salary').first().text()).replace(/^Lương:?\s*/i, '') || 'Cạnh tranh',
      location: clean(x.find('.location li, .location').first().text()),
      tags: [],
      postedAt: null,
      updatedAt: updated ? parseWhen(updated[1]) : null,
      deadline,
      needDetail: true,
    });
  });
  return jobs;
}

module.exports = { list, paged: true };
