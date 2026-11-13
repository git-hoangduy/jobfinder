const cheerio = require('cheerio');
const { http, slugify, clean, parseWhen } = require('../util');

async function list(keyword, { page = 1 } = {}) {
  const url = `https://www.topcv.vn/tim-viec-lam-${slugify(keyword)}-tai-ho-chi-minh-kl2${page > 1 ? '?page=' + page : ''}`;
  const html = await http(url);
  const $ = cheerio.load(html);
  const jobs = [];
  $('.job-item-search-result').each((_, el) => {
    const x = $(el);
    const a = x.find('h3.title a').first();
    const href = (a.attr('href') || '').split('?')[0];
    if (!href) return;
    const labels = x.find('.info label, .label-content label').map((i, l) => clean($(l).text())).get();
    const allText = clean(x.text());
    const expLabel = labels.find((l) => /năm|kinh nghiệm|Không yêu cầu/i.test(l)) || '';
    const whenMatch = allText.match(/(Đăng|Cập nhật)[^.]*?(trước|hôm nay|hôm qua)/i);
    const m = expLabel.match(/(\d+)/);
    jobs.push({
      source: 'topcv',
      sourceId: x.attr('data-job-id') || href,
      title: clean(a.text()),
      company: clean(x.find('.company-name').first().text()),
      logo: x.find('.avatar img').attr('data-src') || x.find('.avatar img').attr('src') || '',
      url: href,
      salary: clean(x.find('.title-salary').first().text()) || 'Thoả thuận',
      location: clean(x.find('.city-text').first().text()),
      tags: [],
      postedAt: null,
      updatedAt: whenMatch ? parseWhen(whenMatch[0]) : null,
      deadline: null,
      experience: expLabel,
      expYears: /không yêu cầu|dưới 1/i.test(expLabel) ? 0 : m ? +m[1] : null,
      needDetail: true,
    });
  });
  return jobs;
}

module.exports = { list, paged: true };
