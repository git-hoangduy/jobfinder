const { http, parseWhen, clean } = require('../util');

const FIELDS =
  'id,title,detail_url,salary,addresses,refreshed,published,company,skills_arr,job_types_str,content,requirements,responsibilities,benefits,experiences_str,job_levels_str';

async function list(keyword, { hcmOnly = true } = {}) {
  const data = [];
  for (let page = 1; page <= 4; page++) {
    const qs = new URLSearchParams({
      'fields[job]': FIELDS,
      'fields[company]': 'display_name,image_logo',
      keyword,
      page: String(page),
      page_size: '50',
      locale: 'vi_VN',
      ordering: 'newest_job',
    });
    if (hcmOnly) qs.set('region_ids', '79');
    const res = await http('https://api.topdev.vn/td/v2/jobs?' + qs, { json: true });
    data.push(...(res.data || []));
    if (page >= (res.meta?.last_page || 1)) break;
  }
  return data.map((d) => {
    const s = d.salary || {};
    let salary = s.value && !/\*/.test(s.value) ? s.value : '';
    if (!salary) salary = s.is_negotiable === '1' ? 'Thương lượng' : 'Đăng nhập TopDev để xem';
    const benefits = Array.isArray(d.benefits)
      ? '<ul>' + d.benefits.map((b) => '<li>' + (b.value || b.name || b) + '</li>').join('') + '</ul>'
      : d.benefits || '';
    const exp = d.experiences_str || '';
    const m = exp.match(/(\d+)/);
    return {
      source: 'topdev',
      sourceId: String(d.id),
      title: clean(d.title),
      company: clean(d.company?.display_name),
      logo: d.company?.image_logo || '',
      url: d.detail_url,
      salary,
      location: d.addresses?.address_region_list || '',
      address: (d.addresses?.full_addresses || []).join(' | '),
      tags: d.skills_arr || [],
      workMode: d.job_types_str || '',
      postedAt: parseWhen(d.published?.date),
      updatedAt: parseWhen(d.refreshed?.date) || parseWhen(d.published?.date),
      deadline: null,
      level: d.job_levels_str || '',
      experience: exp,
      expYears: /khong|no exp/i.test(exp) ? 0 : m ? +m[1] : null,
      description: [d.content, d.responsibilities].filter(Boolean).join('<br>'),
      requirements: d.requirements || '',
      benefits,
      // API đã có đủ mô tả; trang web topdev.vn thường chặn kết nối tự động
      needDetail: false,
    };
  });
}

module.exports = { list };
