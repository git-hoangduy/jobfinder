const cheerio = require('cheerio');
const { http, clean, parseWhen } = require('../util');

// ITviec chỉ hỗ trợ tìm theo slug kỹ năng: /it-jobs/{slug}/ho-chi-minh-hcm
async function list(slug) {
  const html = await http(`https://itviec.com/it-jobs/${encodeURIComponent(slug)}/ho-chi-minh-hcm`);
  const $ = cheerio.load(html);
  const jobs = [];
  $('.job-card').each((_, el) => {
    const x = $(el);
    const id = x.attr('data-search--job-selection-job-slug-value');
    const a = x.find('h3 a').first();
    if (!id || !a.length) return;
    const company = x
      .find('a.text-rich-grey')
      .filter((i, e) => ($(e).attr('class') || '').trim() === 'text-rich-grey')
      .first()
      .text();
    const mode = clean(x.find('div.text-rich-grey.flex-shrink-0').first().text());
    jobs.push({
      source: 'itviec',
      sourceId: id,
      title: clean(a.text()),
      company: clean(company),
      logo: x.find('img').attr('data-src') || x.find('source').attr('data-srcset') || '',
      url: 'https://itviec.com/it-jobs/' + id,
      salary: /sign in/i.test(x.text()) ? 'Đăng nhập ITviec để xem' : clean(x.find('.salary-text, .text-success').first().text()) || 'Thương lượng',
      location: clean(x.find('div.text-truncate.text-nowrap').first().text()),
      workMode: mode,
      tags: x.find('a.itag').map((i, t) => clean($(t).text())).get(),
      highlights: x.find('li').map((i, t) => clean($(t).text())).get(),
      postedAt: null,
      updatedAt: parseWhen(clean(x.find('span.small-text').first().text())),
      deadline: null,
      needDetail: true,
    });
  });
  return jobs;
}

module.exports = { list };
