const { CATEGORIES, SOURCES, MAX_PAGES, DETAIL_CONCURRENCY } = require('./config');
const { norm, pool, sleep } = require('./util');
const { fetchDetail } = require('./detail');
const store = require('./store');

const sources = {
  vietnamworks: require('./sources/vietnamworks'),
  topdev: require('./sources/topdev'),
  topcv: require('./sources/topcv'),
  itviec: require('./sources/itviec'),
  careerviet: require('./sources/careerviet'),
  careerlink: require('./sources/careerlink'),
  linkedin: require('./sources/linkedin'),
};

const status = { running: false, phase: '', done: 0, total: 0, message: 'Chưa chạy', errors: [] };

const RE_REMOTE = /(remote|tu xa|work from home|wfh|lam viec online|lam online)/;
const RE_HYBRID = /(hybrid|linh hoat)/;
const RE_HCM = /(ho chi minh|hcm|sai gon|saigon)/;

// Nhóm lập trình (useTags) so khớp cả tag kỹ năng; các nhóm khác chỉ so khớp tiêu đề cho chính xác
function classify(job) {
  const t = norm(job.title);
  const withTags = norm(job.title + ' ' + (job.tags || []).join(' '));
  return CATEGORIES.filter((c) => c.match.test(c.useTags ? withTags : t) && !(c.exclude && c.exclude.test(t))).map((c) => c.id);
}

function workModeOf(job) {
  const t = norm([job.title, job.workMode, job.location].join(' '));
  if (RE_REMOTE.test(t)) return 'remote';
  if (RE_HYBRID.test(t)) return 'hybrid';
  return 'office';
}

function locationOk(job, cats) {
  const loc = norm(job.location + ' ' + (job.address || ''));
  if (!job.location || RE_HCM.test(loc)) return true;
  const remoteOk = cats.some((id) => CATEGORIES.find((c) => c.id === id).anywhereIfRemote);
  return remoteOk && job.workModeNorm === 'remote';
}

// Tạo danh sách "tác vụ" theo từng nguồn; mỗi nguồn chạy tuần tự (lịch sự với server), các nguồn chạy song song
function buildTasks() {
  const bySource = {};
  const add = (src, key, fn) => {
    bySource[src] = bySource[src] || new Map();
    if (!bySource[src].has(key)) bySource[src].set(key, fn);
  };
  for (const c of CATEGORIES) {
    const hcmOnly = !c.anywhereIfRemote;
    for (const kw of c.keywords) {
      add('vietnamworks', kw + hcmOnly, () => sources.vietnamworks.list(kw, { hcmOnly }));
      add('topdev', kw + hcmOnly, () => sources.topdev.list(kw, { hcmOnly }));
      for (const s of ['topcv', 'careerviet', 'careerlink']) add(s, kw, () => paged(s, kw));
      add('linkedin', kw, () => sources.linkedin.list(kw));
      if (c.anywhereIfRemote) add('linkedin', kw + '|remote', () => sources.linkedin.list(kw, { remote: true }));
    }
    for (const slug of c.itviec || []) add('itviec', slug, () => sources.itviec.list(slug));
  }
  return Object.entries(bySource).map(([src, m]) => ({ src, fns: [...m.values()] }));
}

async function paged(src, kw) {
  const all = [];
  const ids = new Set();
  let pageSize = 0;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const r = await sources[src].list(kw, { page });
    const fresh = r.filter((j) => !ids.has(j.sourceId));
    fresh.forEach((j) => ids.add(j.sourceId));
    all.push(...fresh);
    if (page === 1) pageSize = r.length;
    // trang chưa đầy (hoặc toàn job trùng) => đã hết kết quả
    if (!fresh.length || r.length < Math.max(pageSize, 15)) break;
    await sleep(500);
  }
  return all;
}

const DETAIL_KEYS = new Set(['description', 'requirements', 'benefits']);
function merge(old, job, now) {
  const out = { ...(old || {}) };
  for (const [k, v] of Object.entries(job)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (old && old.detailAt && DETAIL_KEYS.has(k)) continue;
    out[k] = v;
  }
  out.tags = job.tags || []; // tag luôn lấy theo lần đọc mới nhất
  out.categories = job.categories;
  out.firstSeen = old?.firstSeen || now;
  out.lastSeen = now;
  return out;
}

// includeLazy: lấy chi tiết cho cả nguồn "lazy" (LinkedIn) – dùng cho bản web tĩnh không có server
async function refresh({ includeLazy = false } = {}) {
  if (status.running) return status;
  Object.assign(status, { running: true, phase: 'list', done: 0, total: 0, message: 'Đang thu thập danh sách việc làm...', errors: [], startedAt: new Date().toISOString() });
  const db = store.load();
  const now = new Date().toISOString();
  const prevRefresh = db.lastRefresh;
  const removed = [];
  try {
    // 1) Thu thập danh sách
    const groups = buildTasks();
    status.total = groups.reduce((n, g) => n + g.fns.length, 0);
    const raw = [];
    const failedSources = new Set();
    await Promise.all(
      groups.map(async (g) => {
        let failStreak = 0;
        for (const fn of g.fns) {
          // Nguồn lỗi liên tiếp 3 lần -> tạm bỏ qua trong lượt này (job cũ của nguồn vẫn được giữ)
          if (failStreak >= 3) {
            status.done++;
            continue;
          }
          try {
            raw.push(...(await fn()));
            failStreak = 0;
          } catch (e) {
            failStreak++;
            // không kết nối được (mạng chặn / timeout) -> bỏ qua nguồn ngay, không chờ thêm
            if (/timeout|aborted|Không kết nối|ECONN|ENOTFOUND|fetch failed/i.test(e.message)) failStreak = 3;
            failedSources.add(g.src);
            status.errors.push(`${SOURCES[g.src].name}: ${e.message}`);
            if (failStreak === 3) status.errors.push(`${SOURCES[g.src].name}: lỗi liên tiếp, tạm bỏ qua nguồn này trong lượt làm mới`);
          }
          status.done++;
          status.message = `Đang đọc danh sách (${status.done}/${status.total})...`;
          await sleep(400);
        }
      })
    );

    // 2) Phân loại + lọc địa điểm + gộp vào kho
    const seen = new Set();
    let kept = 0;
    for (const j of raw) {
      const cats = classify(j);
      if (!cats.length) continue;
      j.workModeNorm = workModeOf(j);
      if (!locationOk(j, cats)) continue;
      const id = j.source + ':' + j.sourceId;
      if (seen.has(id)) {
        // cùng job xuất hiện ở nhiều từ khóa -> gộp nhóm
        db.jobs[id].categories = [...new Set([...db.jobs[id].categories, ...cats])];
        continue;
      }
      seen.add(id);
      db.jobs[id] = merge(db.jobs[id], { ...j, id, categories: cats }, now);
      kept++;
    }

    // 3) Loại job không còn (không xuất hiện nữa ở nguồn chạy thành công) hoặc đã hết hạn
    const nowD = new Date();
    for (const [id, j] of Object.entries(db.jobs)) {
      let reason = null;
      if (!seen.has(id) && !failedSources.has(j.source)) reason = 'Không còn hiển thị trên trang tuyển dụng';
      else if (j.deadline && new Date(j.deadline) < nowD) reason = 'Đã quá hạn nộp hồ sơ';
      if (reason) {
        removed.push({ id, title: j.title, company: j.company, source: j.source, reason, at: now });
        delete db.jobs[id];
      }
    }
    store.save(db);

    // 4) Lấy chi tiết (mô tả + hạn nộp) cho job mới / chưa có chi tiết
    const need = Object.values(db.jobs).filter((j) => j.needDetail && (includeLazy || !j.lazyDetail) && !j.detailAt);
    Object.assign(status, { phase: 'detail', done: 0, total: need.length, message: `Đang lấy chi tiết ${need.length} việc làm mới...` });
    let sinceSave = 0;
    await pool(need, DETAIL_CONCURRENCY, async (j) => {
      try {
        const d = await fetchDetail(j);
        applyDetail(db, j.id, d, removed, now);
      } catch (e) {
        j.detailError = e.message;
      }
      status.done++;
      status.message = `Đang lấy chi tiết (${status.done}/${status.total})...`;
      if (++sinceSave >= 25) {
        sinceSave = 0;
        store.save(db);
      }
      await sleep(250);
    });

    db.removed = [...removed, ...(db.removed || [])].slice(0, 300);
    db.lastRefresh = {
      startedAt: status.startedAt,
      finishedAt: new Date().toISOString(),
      previousAt: prevRefresh?.startedAt || null,
      found: kept,
      added: Object.values(db.jobs).filter((j) => j.firstSeen === now).length,
      removed: removed.length,
      errors: status.errors,
    };
    store.save(db);
    Object.assign(status, {
      running: false,
      phase: 'done',
      message: `Xong: ${Object.keys(db.jobs).length} việc làm, +${db.lastRefresh.added} mới, -${removed.length} đã loại bỏ`,
    });
  } catch (e) {
    console.error(e);
    store.save(db);
    Object.assign(status, { running: false, phase: 'error', message: 'Lỗi: ' + e.message });
  }
  return status;
}

function applyDetail(db, id, d, removedList, now = new Date().toISOString()) {
  const j = db.jobs[id];
  if (!j) return null;
  if (d.gone) {
    removedList.push({ id, title: j.title, company: j.company, source: j.source, reason: d.reason, at: now });
    delete db.jobs[id];
    return { gone: true, reason: d.reason };
  }
  if (d.description && d.description.length > (j.description || '').length * 0.8) {
    j.description = d.description;
    if (d.requirements) j.requirements = d.requirements;
    // mô tả từ JSON-LD thường đã gồm cả yêu cầu/quyền lợi
    if (j.source === 'vietnamworks' && d.description.length > 600) j.requirements = d.requirements || j.requirements;
  }
  if (d.deadline && !(j.source === 'vietnamworks' && j.deadline)) j.deadline = d.deadline;
  if (d.postedAt && !j.postedAt) j.postedAt = d.postedAt;
  if (d.address && !j.address) j.address = d.address;
  if (d.salaryDetail && /đăng nhập|thương lượng|thoả thuận|thỏa thuận|cạnh tranh/i.test(j.salary || '')) j.salaryDetail = d.salaryDetail;
  if (d.expYears != null && j.expYears == null) j.expYears = d.expYears;
  if (d.level && !j.level) j.level = d.level;
  if (d.workMode === 'Remote') j.workModeNorm = 'remote';
  j.detailAt = new Date().toISOString();
  delete j.detailError;
  return j;
}

// Lấy chi tiết theo yêu cầu khi mở popup
async function detailOnDemand(id) {
  const db = store.load();
  const j = db.jobs[id];
  if (!j) return null;
  if (j.detailAt || !j.needDetail) return j;
  const removed = [];
  const d = await fetchDetail(j);
  const r = applyDetail(db, id, d, removed);
  if (removed.length) db.removed = [...removed, ...(db.removed || [])].slice(0, 300);
  store.save(db);
  return r;
}

module.exports = { refresh, status, detailOnDemand, RE_REMOTE };
