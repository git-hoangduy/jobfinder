const cheerio = require('cheerio');
const { http, clean, toISO, parseWhen, sleep } = require('../util');

// LinkedIn "guest" API (không cần đăng nhập). Mỗi lần trả ~10 job.
// f_TPR=r2592000: chỉ lấy job đăng trong 30 ngày gần nhất. f_WT=2: remote.
const MAX_ITEMS = 50;

async function list(keyword, { remote = false } = {}) {
  const jobs = [];
  const seen = new Set();
  for (let start = 0; start < MAX_ITEMS; start += 10) {
    const qs = new URLSearchParams({
      keywords: keyword,
      location: remote ? 'Vietnam' : 'Ho Chi Minh City, Vietnam',
      f_TPR: 'r2592000',
      start: String(start),
    });
    if (remote) qs.set('f_WT', '2');
    const html = await http('https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?' + qs, { retries: 0 });
    const $ = cheerio.load(html);
    const cards = $('.base-card, .job-search-card');
    let fresh = 0;
    cards.each((_, el) => {
      const x = $(el);
      const urn = x.attr('data-entity-urn') || x.find('[data-entity-urn]').attr('data-entity-urn') || '';
      const id = (urn.match(/(\d+)$/) || [])[1];
      if (!id || seen.has(id)) return;
      seen.add(id);
      fresh++;
      const time = x.find('time').first();
      jobs.push({
        source: 'linkedin',
        sourceId: id,
        title: clean(x.find('.base-search-card__title').text()),
        company: clean(x.find('.base-search-card__subtitle').text()),
        logo: x.find('img').attr('data-delayed-url') || '',
        url: 'https://www.linkedin.com/jobs/view/' + id,
        salary: clean(x.find('.job-search-card__salary-info').text()),
        location: clean(x.find('.job-search-card__location').text()),
        workMode: remote ? 'Remote' : '',
        tags: [],
        postedAt: toISO(time.attr('datetime')) || parseWhen(time.text()),
        updatedAt: toISO(time.attr('datetime')) || parseWhen(time.text()),
        deadline: null,
        needDetail: true,
        lazyDetail: true, // chỉ lấy mô tả khi mở popup (LinkedIn chặn nếu gọi nhiều)
      });
    });
    if (!fresh || cards.length < 10) break;
    await sleep(1500);
  }
  return jobs;
}

// Trang chi tiết guest: mô tả + cấp bậc
async function detail(job) {
  const html = await http('https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/' + job.sourceId, { retries: 0 });
  const $ = cheerio.load(html);
  const out = { description: $('.show-more-less-html__markup').html() || $('.description__text').html() || '' };
  $('.description__job-criteria-item').each((_, li) => {
    const k = clean($(li).find('h3').text());
    const v = clean($(li).find('span').text());
    if (/seniority|cấp bậc/i.test(k)) out.level = v;
  });
  if (/closed|no longer accepting|không còn nhận/i.test($('body').text())) {
    out.gone = true;
    out.reason = 'Tin đã ngừng nhận hồ sơ';
  }
  return out;
}

module.exports = { list, detail };
