const cheerio = require('cheerio');
const { http, slugify, clean, parseWhen } = require('../util');

// CareerLink tìm toàn quốc -> lọc địa điểm ở bước sau
async function list(keyword, { page = 1 } = {}) {
  const url = `https://www.careerlink.vn/viec-lam/k/${slugify(keyword)}${page > 1 ? '?page=' + page : ''}`;
  const html = await http(url);
  const $ = cheerio.load(html);
  const jobs = [];
  $('[class*="__card"]').each((_, el) => {
    const x = $(el);
    const a = x.find('a[class*="jobLink"]').first();
    let href = a.attr('href') || '';
    const idm = href.match(/\/(\d{5,})(\?|$)/);
    if (!idm) return;
    if (href.startsWith('/')) href = 'https://www.careerlink.vn' + href;
    const ts = x.find('[class*="__timestamp"]').first().parent().find('time').first().text() || x.find('time').first().text();
    jobs.push({
      source: 'careerlink',
      sourceId: idm[1],
      title: clean(x.find('[class*="__name"]').first().text() || a.attr('title') || a.text()),
      company: clean(x.find('a[class*="__company"]').first().text()),
      logo: x.find('img').attr('src') || '',
      url: href.split('?')[0],
      salary: clean(x.find('[class*="__salary"]').first().text()).split('|')[0].trim() || 'Thương lượng',
      location: x
        .find('a[href*="/tim-viec-lam-tai/"]')
        .map((i, e) => clean($(e).text()))
        .get()
        .join(', '),
      level: clean(x.find('[class*="__careerLevel"]').first().text()),
      tags: [],
      postedAt: null,
      updatedAt: parseWhen(ts),
      deadline: null,
      needDetail: true,
    });
  });
  // Mỗi card có thể bị lặp do layout mobile/desktop
  const seen = new Set();
  return jobs.filter((j) => !seen.has(j.sourceId) && seen.add(j.sourceId));
}

module.exports = { list, paged: true };
