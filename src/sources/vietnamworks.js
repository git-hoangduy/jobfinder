const { http, toISO, clean } = require('../util');

const HCM_CITY_ID = '29';

const MAX_PAGES = 4; // 4 x 50 = tối đa 200 job / từ khóa

async function list(keyword, { hcmOnly = true } = {}) {
  const data = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = {
      userId: 0,
      query: keyword,
      filter: hcmOnly ? [{ field: 'workingLocations.cityId', value: HCM_CITY_ID }] : [],
      ranges: [],
      order: [],
      hitsPerPage: 50,
      page,
    };
    const res = await http('https://ms.vietnamworks.com/job-search/v1.0/search', { method: 'POST', body, json: true });
    data.push(...(res.data || []));
    if (page + 1 >= (res.meta?.nbPages || 0)) break;
  }
  return data.map((d) => {
    const locs = (d.workingLocations || []).map((w) => w.cityNameVI || w.cityName).filter(Boolean);
    const benefits = Array.isArray(d.benefits)
      ? '<ul>' + d.benefits.map((b) => '<li>' + clean(b.benefitValue || b.benefitName || '') + '</li>').join('') + '</ul>'
      : '';
    return {
      source: 'vietnamworks',
      sourceId: String(d.jobId),
      title: clean(d.jobTitle),
      company: clean(d.companyName),
      logo: d.companyLogo || '',
      url: d.jobUrl || `https://www.vietnamworks.com/${d.alias}-${d.jobId}-jv`,
      salary: d.prettySalary || (d.salaryMin ? `${d.salaryMin} - ${d.salaryMax}` : 'Thương lượng'),
      location: [...new Set(locs)].join(', '),
      address: (d.workingLocations || []).map((w) => w.address).filter(Boolean).join(' | '),
      tags: (d.skills || []).map((s) => s.skillName).filter(Boolean).slice(0, 8),
      postedAt: toISO(d.approvedOn) || toISO(d.createdOn),
      updatedAt: toISO(d.onlineOn) || toISO(d.approvedOn),
      deadline: toISO(d.expiredOn),
      level: d.jobLevelVI || d.jobLevel || '',
      experience: d.yearsOfExperience > 0 ? `${d.yearsOfExperience} năm` : '',
      expYears: d.yearsOfExperience > 0 ? d.yearsOfExperience : null,
      // API chỉ trả mô tả rút gọn; trang chi tiết dựng bằng JS nên không đọc được thêm
      description: d.jobDescription || '',
      requirements: d.jobRequirement || '',
      benefits,
      shortDesc: true,
      needDetail: false,
    };
  });
}

module.exports = { list };
