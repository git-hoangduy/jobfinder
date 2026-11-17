// Chuyển dữ liệu thô trong kho thành dữ liệu hiển thị (dùng chung cho server và bản web tĩnh)
const { CATEGORIES, SOURCES } = require('./config');
const { norm, sanitize } = require('./util');
const { pickSalary } = require('./salary');
const { isEnglish } = require('./translate');
const { expFromText } = require('./experience');

const RE_REMOTE = /(remote|tu xa|work from home|wfh|lam viec online|lam online)/;
const RE_SENIOR = /(senior|\bsr\b|\blead\b|leader|truong nhom|truong phong|pho phong|manager|quan ly|\bhead\b|principal|architect|giam doc|director|chief|\bcto\b|expert|chuyen gia|giam sat)/;
// "được đào tạo" một mình thường nằm ở phần quyền lợi -> không tính; chỉ tính các cụm rõ nghĩa
const RE_ENTRY_TITLE = /(fresher|intern|thuc tap|tts\b|moi tot nghiep|khong yeu cau kinh nghiem|khong can kinh nghiem|chua co kinh nghiem|dao tao)/;
const RE_ENTRY = /(khong yeu cau kinh nghiem|chua co kinh nghiem|khong can kinh nghiem|khong yeu cau kn|chua co kn|se duoc dao tao (tu dau|nghiep vu|bai ban)|duoc dao tao (tu dau|bai ban tu dau)|dao tao tu dau|huong dan tu dau|cam tay chi viec|sinh vien moi ra truong|moi tot nghiep|entry level|no experience required)/;
const SOURCE_ORDER = Object.keys(SOURCES);

function decorate(j) {
  // Không có trường kinh nghiệm -> thử đọc từ mô tả
  let expYears = j.expYears;
  let experience = j.experience;
  if (expYears == null && !experience) {
    const e = expFromText(j.requirements, j.description);
    if (e != null) {
      expYears = e;
      experience = `${e} năm (theo mô tả)`;
    }
  }
  j = { ...j, expYears, experience };
  const title = norm(j.title);
  const textAll = norm([j.title, j.experience, j.level, j.description, j.requirements].join(' ').replace(/<[^>]+>/g, ' '));
  const senior = RE_SENIOR.test(title) || /(truong|quan ly|giam doc|manager)/.test(norm(j.level));
  const entry =
    RE_ENTRY_TITLE.test(title) || j.expYears === 0 || /khong yeu cau|duoi 1 nam/.test(norm(j.experience)) || (RE_ENTRY.test(textAll) && !(j.expYears >= 2));
  const remote = j.workModeNorm === 'remote' || RE_REMOTE.test(norm(j.title + ' ' + (j.workMode || '')));
  return {
    id: j.id,
    source: j.source,
    title: j.title,
    company: j.company,
    logo: j.logo,
    url: j.url,
    ...pickSalary(j), // salary + salaryNote ("theo mô tả"...)
    location: j.location,
    address: j.address,
    tags: j.tags || [],
    highlights: j.highlights || [],
    workMode: remote ? 'remote' : j.workModeNorm || 'office',
    categories: j.categories,
    postedAt: j.postedAt,
    updatedAt: j.updatedAt || j.postedAt,
    deadline: j.deadline,
    experience: j.experience || (j.expYears != null ? (j.expYears === 0 ? 'Không yêu cầu' : j.expYears + ' năm') : ''),
    expYears: j.expYears,
    level: j.level,
    senior,
    entry,
    firstSeen: j.firstSeen,
    shortDesc: !!j.shortDesc || j.source === 'vietnamworks',
    lang: isEnglish([j.description, j.requirements].join(' ')) ? 'en' : 'vi',
  };
}

// Phần chi tiết cho popup (đã làm sạch HTML)
const detailOf = (j) => ({
  description: sanitize(j.description),
  requirements: sanitize(j.requirements),
  benefits: sanitize(j.benefits),
  address: j.address || '',
  // bản dịch tiếng Việt (nếu đã dịch lúc thu thập)
  trans: j.trans
    ? { description: sanitize(j.trans.description), requirements: sanitize(j.trans.requirements), benefits: sanitize(j.trans.benefits) }
    : null,
});

// Gộp job trùng (cùng tiêu đề + công ty) đăng trên nhiều trang
function dedupe(list) {
  const key = (j) =>
    norm(j.title).replace(/[^a-z0-9]/g, '') +
    '|' +
    norm(j.company).replace(/(cong ty|tnhh|co phan|\bcp\b|jsc|ltd|company|limited|viet nam|vietnam|[^a-z0-9])/g, '');
  const map = new Map();
  for (const j of list.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))) {
    const k = key(j);
    const p = map.get(k);
    if (!p) {
      map.set(k, { ...j, alsoOn: [] });
      continue;
    }
    // cùng nguồn đăng 2 lần -> chỉ giữ 1 link
    if (j.source !== p.source && !p.alsoOn.some((a) => a.source === j.source)) p.alsoOn.push({ source: j.source, url: j.url, id: j.id });
    p.categories = [...new Set([...p.categories, ...j.categories])];
    if (!p.deadline && j.deadline) p.deadline = j.deadline;
    if ((j.updatedAt || '') > (p.updatedAt || '')) p.updatedAt = j.updatedAt;
    if (j.firstSeen < p.firstSeen) p.firstSeen = j.firstSeen;
    p.entry = p.entry || j.entry;
    if (j.workMode === 'remote') p.workMode = 'remote';
    if (p.detail && j.detail && (j.detail.description || '').length > (p.detail.description || '').length) p.detail = j.detail;
  }
  return [...map.values()];
}

// withDetail: nhúng luôn mô tả vào từng job (dùng cho bản web tĩnh, không có server)
function buildPayload(db, { withDetail = false } = {}) {
  const now = new Date();
  const jobs = dedupe(
    Object.values(db.jobs)
      .filter((j) => !j.deadline || new Date(j.deadline) >= now)
      .map((j) => (withDetail ? { ...decorate(j), detail: detailOf(j) } : decorate(j)))
  );
  return {
    jobs,
    lastRefresh: db.lastRefresh,
    removed: (db.removed || []).slice(0, 100),
    categories: CATEGORIES.map(({ id, name, color, entry, web }) => ({ id, name, color, entry, web: !!web })),
    sources: SOURCES,
  };
}

module.exports = { decorate, detailOf, dedupe, buildPayload, RE_REMOTE };
