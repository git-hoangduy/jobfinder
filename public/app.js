(() => {
  const $ = (s) => document.querySelector(s);
  // static = bản GitHub Pages (không có server): đọc data.json, nút Làm mới gọi GitHub Actions
  const CFG = window.JF_CONFIG || { static: false };

  // ---- Lưu trên trình duyệt ----
  const ls = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };
  const viewed = new Set(ls.get('jf_viewed', []));
  const saved = new Set(ls.get('jf_saved', []));
  const hidden = new Set(ls.get('jf_hidden', []));
  const saveSet = (k, s) => ls.set(k, [...s]);

  const state = {
    jobs: [], categories: [], sources: {}, lastRefresh: null, removed: [],
    cat: '', q: '', source: '', sort: 'fit', page: 1, pageSize: ls.get('jf_pageSize', 20),
  };

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();
  const safeUrl = (u) => (/^https?:\/\//i.test(u || '') ? u : '#');
  const isToday = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();
  const daysLeft = (iso) => (iso ? Math.ceil((new Date(iso) - new Date()) / 864e5) : null);
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : '—');
  function ago(iso) {
    if (!iso) return '';
    const s = (Date.now() - new Date(iso)) / 1000;
    if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' phút trước';
    if (s < 86400) return Math.round(s / 3600) + ' giờ trước';
    if (s < 86400 * 30) return Math.round(s / 86400) + ' ngày trước';
    return fmtDate(iso);
  }
  const catById = (id) => state.categories.find((c) => c.id === id) || { name: id, color: '#999' };
  const srcInfo = (id) => state.sources[id] || { name: id, color: '#666' };
  const isNewFound = (j) => state.lastRefresh?.previousAt && j.firstSeen && j.firstSeen >= state.lastRefresh.startedAt;

  // ---- Phù hợp với tôi ----
  function fits(j) {
    if (j.senior) return false;
    const onlyEntryCats = j.categories.every((c) => catById(c).entry);
    if (onlyEntryCats && j.expYears != null && j.expYears >= 2 && !j.entry) return false;
    return true;
  }
  function score(j) {
    let s = 0;
    if (isToday(j.updatedAt)) s += 40;
    if (isNewFound(j)) s += 20;
    if (j.entry) s += 15;
    if (j.workMode === 'remote') s += 18;
    else if (j.workMode === 'hybrid') s += 8;
    if (j.categories.includes('php')) s += 15;
    if (j.senior) s -= 40;
    s -= Math.min(j.updatedAt ? (Date.now() - new Date(j.updatedAt)) / 864e5 : 30, 30);
    return s;
  }

  function filtered(ignoreCat = false) {
    const q = norm(state.q).trim();
    const f = Object.fromEntries(['fFit', 'fEntry', 'fRemote', 'fToday', 'fSaved', 'fHidden'].map((id) => [id, $('#' + id).checked]));
    return state.jobs.filter((j) => {
      if (!ignoreCat && state.cat && !j.categories.includes(state.cat)) return false;
      if (state.source && j.source !== state.source && !(j.alsoOn || []).some((a) => a.source === state.source)) return false;
      if (f.fHidden !== hidden.has(j.id)) return false; // "Đã ẩn" = chỉ xem job đã ẩn
      if (f.fFit && !fits(j)) return false;
      if (f.fEntry && !j.entry) return false;
      if (f.fRemote && j.workMode !== 'remote') return false;
      if (f.fToday && !isToday(j.updatedAt)) return false;
      if (f.fSaved && !saved.has(j.id)) return false;
      if (q) {
        const hay = norm([j.title, j.company, j.location, (j.tags || []).join(' '), j.experience].join(' '));
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  }

  function sorted(list) {
    const by = {
      fit: (a, b) => score(b) - score(a),
      updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''),
      deadline: (a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'),
      found: (a, b) => (b.firstSeen || '').localeCompare(a.firstSeen || ''),
    }[state.sort];
    return list.sort(by);
  }

  // ---- Render ----
  function logoHtml(j) {
    const letter = esc((j.company || '?').replace(/^(công ty|cty)\s*(tnhh|cổ phần|cp)?\s*/i, '').trim().charAt(0).toUpperCase() || '?');
    const ph = (h) => `<div class="logo-ph" style="background:${srcInfo(j.source).color}" ${h ? 'hidden' : ''}>${letter}</div>`;
    if (!/^https?:\/\//.test(j.logo || '')) return ph(false);
    return `<img class="logo" loading="lazy" referrerpolicy="no-referrer" src="${esc(j.logo)}" alt="" onerror="this.hidden=true;this.nextElementSibling.hidden=false">${ph(true)}`;
  }

  function badges(j, withDeadline = false) {
    const b = [];
    if (isToday(j.updatedAt)) b.push('<span class="badge b-today">Mới cập nhật hôm nay</span>');
    if (isNewFound(j)) b.push('<span class="badge b-new">MỚI</span>');
    if (j.entry) b.push('<span class="badge b-entry">Không yêu cầu KN / Đào tạo</span>');
    if (j.workMode === 'remote') b.push('<span class="badge b-remote">Remote</span>');
    if (j.workMode === 'hybrid') b.push('<span class="badge">Hybrid</span>');
    if (j.senior) b.push('<span class="badge">Senior/Lead</span>');
    const d = daysLeft(j.deadline);
    if (withDeadline && d != null) b.push(`<span class="badge ${d <= 3 ? 'b-urgent' : ''}">Còn ${Math.max(d, 0)} ngày</span>`);
    return b.join('');
  }

  const srcLinks = (j) =>
    [{ source: j.source, url: j.url }, ...(j.alsoOn || [])]
      .map((s) => `<a class="src" style="background:${srcInfo(s.source).color}" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">${esc(srcInfo(s.source).name)}</a>`)
      .join('');

  function rowHtml(j) {
    const d = daysLeft(j.deadline);
    const sub = [
      esc(j.company),
      esc(j.location || ''),
      j.salary ? `<span class="salary">${esc(j.salary)}</span>` : '',
      j.experience ? 'KN: ' + esc(j.experience) : '',
    ].filter(Boolean).join(' · ');
    return `<article class="job ${viewed.has(j.id) ? 'viewed' : ''} ${hidden.has(j.id) ? 'is-hidden' : ''}" data-id="${esc(j.id)}">
      ${logoHtml(j)}
      <div class="body">
        <h3 class="title">${esc(j.title)}</h3>
        <div class="sub">${sub}</div>
        <div class="badges">${badges(j)}</div>
      </div>
      <div class="side">
        <div class="acts">
          <button class="icon-btn ${saved.has(j.id) ? 'on' : ''}" data-act="save" title="Lưu">${saved.has(j.id) ? '★' : '☆'}</button>
          <button class="icon-btn" data-act="hide" title="${hidden.has(j.id) ? 'Bỏ ẩn' : 'Ẩn job này'}">${hidden.has(j.id) ? '↺' : '✕'}</button>
        </div>
        <div>${d != null ? `<span class="badge ${d <= 3 ? 'b-urgent' : ''}">Còn ${Math.max(d, 0)} ngày</span>` : ''}</div>
        <div>${ago(j.updatedAt || j.firstSeen)}</div>
        <div class="srcs">${srcLinks(j)}</div>
      </div>
    </article>`;
  }

  function renderTabs() {
    const base = filtered(true);
    const n = (id) => base.filter((j) => j.categories.includes(id)).length;
    $('#catTabs').innerHTML =
      `<button class="tab ${!state.cat ? 'on' : ''}" data-cat="">Tất cả <b>${base.length}</b></button>` +
      state.categories.map((c) => `<button class="tab ${state.cat === c.id ? 'on' : ''}" data-cat="${c.id}">${esc(c.name.split(' (')[0])} <b>${n(c.id)}</b></button>`).join('');
  }

  function renderPager(total) {
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    const p = state.page;
    const nums = new Set([1, pages, p - 2, p - 1, p, p + 1, p + 2].filter((x) => x >= 1 && x <= pages));
    let html = `<button data-page="${p - 1}" ${p === 1 ? 'disabled' : ''}>‹</button>`;
    let prev = 0;
    for (const x of [...nums].sort((a, b) => a - b)) {
      if (x - prev > 1) html += '<span class="dots">…</span>';
      html += `<button data-page="${x}" class="${x === p ? 'on' : ''}">${x}</button>`;
      prev = x;
    }
    html += `<button data-page="${p + 1}" ${p === pages ? 'disabled' : ''}>›</button>`;
    html += `<select id="pageSize">${[20, 50, 100].map((s) => `<option value="${s}" ${s === state.pageSize ? 'selected' : ''}>${s} / trang</option>`).join('')}</select>`;
    $('#pager').innerHTML = total ? html : '';
  }

  function render() {
    renderTabs();
    const list = sorted(filtered());
    renderPager(list.length);
    const start = (state.page - 1) * state.pageSize;
    $('#list').innerHTML = list.slice(start, start + state.pageSize).map(rowHtml).join('');
    $('#empty').hidden = list.length > 0;
    const today = list.filter((j) => isToday(j.updatedAt)).length;
    const urgent = list.filter((j) => { const d = daysLeft(j.deadline); return d != null && d <= 3; }).length;
    $('#summary').innerHTML = `<b>${list.length}</b> việc làm · <b>${today}</b> cập nhật hôm nay · <b>${urgent}</b> sắp hết hạn (≤ 3 ngày)` +
      (list.length ? ` · trang ${state.page}/${Math.ceil(list.length / state.pageSize)}` : '');
  }

  function renderStatic() {
    const lr = state.lastRefresh;
    $('#refreshInfo').textContent = lr
      ? `Làm mới lần cuối ${fmtDateTime(lr.finishedAt)} · +${lr.added} mới · −${lr.removed} đã loại bỏ`
      : 'Chưa có dữ liệu – bấm Làm mới';
    const errs = lr?.errors || [];
    $('#errorsBox').hidden = !errs.length;
    $('#errorsBox').innerHTML = errs.length
      ? `<details><summary>${errs.length} lỗi khi tải ở lần làm mới trước (job của nguồn lỗi vẫn được giữ)</summary><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></details>`
      : '';
    const counts = {};
    state.jobs.forEach((j) => [j.source, ...(j.alsoOn || []).map((a) => a.source)].forEach((s) => (counts[s] = (counts[s] || 0) + 1)));
    $('#source').innerHTML = '<option value="">Tất cả nguồn</option>' +
      Object.entries(state.sources).map(([id, s]) => `<option value="${id}" ${state.source === id ? 'selected' : ''}>${esc(s.name)} (${counts[id] || 0})</option>`).join('');
    $('#removedCount').textContent = state.removed.length;
    $('#removedList').innerHTML = state.removed.slice(0, 80)
      .map((r) => `<li><b>${esc(r.title)}</b> – ${esc(r.company || '')} · ${esc(srcInfo(r.source).name)} · ${esc(r.reason)} (${fmtDate(r.at)})</li>`)
      .join('') || '<li>Chưa có</li>';
  }

  // ---- Popup ----
  async function openModal(id) {
    const j = state.jobs.find((x) => x.id === id);
    if (!j) return;
    viewed.add(id);
    saveSet('jf_viewed', viewed);
    document.querySelector(`.job[data-id="${CSS.escape(id)}"]`)?.classList.add('viewed');
    $('#modal').hidden = false;
    document.body.style.overflow = 'hidden';
    if (CFG.static) return paintModal(j, j.detail || {});
    paintModal(j, null);
    try {
      const d = await fetch('/api/jobs/' + encodeURIComponent(id) + '/detail').then((r) => r.json());
      if ($('#modal').hidden || $('#modal').dataset.id !== id) return;
      if (d.gone) {
        paintModal(j, d);
        state.jobs = state.jobs.filter((x) => x.id !== id);
        render();
        return;
      }
      Object.assign(j, { deadline: d.deadline || j.deadline, salary: d.salary || j.salary, experience: d.experience || j.experience, level: d.level || j.level });
      paintModal(j, d);
    } catch (e) {
      paintModal(j, { error: e.message });
    }
  }

  function paintModal(j, d) {
    $('#modal').dataset.id = j.id;
    const dl = daysLeft(j.deadline);
    const grid = [
      ['Lương', j.salary || 'Không ghi'],
      ['Địa điểm', j.location || '—'],
      ['Hình thức', { remote: 'Remote', hybrid: 'Hybrid', office: 'Tại văn phòng' }[j.workMode] || '—'],
      ['Kinh nghiệm', j.experience || 'Không ghi'],
      ['Cấp bậc', j.level || '—'],
      ['Hạn nộp', j.deadline ? `${fmtDate(j.deadline)} (còn ${Math.max(dl, 0)} ngày)` : 'Không ghi'],
      ['Cập nhật', j.updatedAt ? ago(j.updatedAt) : '—'],
      ['Nhóm', j.categories.map((c) => catById(c).name.split(' (')[0]).join(', ')],
    ].map(([k, v]) => `<div><small>${k}</small>${esc(v)}</div>`).join('');
    let body;
    if (!d) body = '<div class="skeleton" style="width:60%"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton" style="width:80%"></div>';
    else if (d.gone) body = `<div class="notice">Tin không còn khả dụng: <b>${esc(d.reason)}</b>. Đã loại khỏi danh sách.</div>`;
    else if (d.error) body = `<div class="notice">Không tải được mô tả (${esc(d.error)}). Hãy mở trang gốc.</div>`;
    else {
      const sec = (t, h) => (h && h.replace(/<[^>]+>/g, '').trim() ? `<div class="m-section"><h3>${t}</h3><div class="m-content">${h}</div></div>` : '');
      const hl = (j.highlights || []).length ? sec('Điểm nổi bật', '<ul>' + j.highlights.map((h) => `<li>${esc(h)}</li>`).join('') + '</ul>') : '';
      body = hl + (sec('Mô tả công việc', d.description) + sec('Yêu cầu', d.requirements) + sec('Quyền lợi', d.benefits) ||
        '<p style="color:var(--muted)">Chưa lấy được mô tả chi tiết của tin này. Bấm nút bên dưới để xem tin gốc.</p>') +
        (j.shortDesc ? `<p style="color:var(--muted)">Mô tả rút gọn – bấm "Đến ${esc(srcInfo(j.source).name)}" để xem đầy đủ.</p>` : '') +
        (d.address ? sec('Địa chỉ', esc(d.address)) : '') +
        (d.detailError ? `<p style="color:var(--muted)">Chưa tải được bản đầy đủ (${esc(d.detailError)}).</p>` : '');
    }
    const links = [{ source: j.source, url: j.url }, ...(j.alsoOn || [])]
      .map((s, i) => `<a class="btn ${i ? 'btn-ghost' : 'btn-primary'}" href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener">Đến ${esc(srcInfo(s.source).name)} ↗</a>`)
      .join('');
    $('#modalBody').innerHTML = `
      <div class="m-head">${logoHtml(j)}<div>
        <h2 id="mTitle">${esc(j.title)}</h2>
        <div class="sub">${esc(j.company)}</div>
        <div class="badges">${badges(j)}</div>
      </div></div>
      <div class="m-scroll"><div class="m-grid">${grid}</div>${body}</div>
      <div class="m-foot">
        <button class="btn btn-ghost" data-act="save-modal">${saved.has(j.id) ? '★ Đã lưu' : '☆ Lưu'}</button>
        ${links}
      </div>`;
  }

  function closeModal() {
    $('#modal').hidden = true;
    $('#modal').dataset.id = '';
    document.body.style.overflow = '';
  }

  // ---- Làm mới ----
  let polling;
  function setBusy(on) {
    $('#refreshBtn').disabled = on;
    $('#refreshBtn span').textContent = on ? 'Đang làm mới...' : 'Làm mới';
    $('#progress').hidden = !on;
  }
  function watchRefresh() {
    setBusy(true);
    clearInterval(polling);
    polling = setInterval(async () => {
      const s = await fetch('/api/status').then((r) => r.json()).catch(() => null);
      if (!s) return;
      const pct = s.total ? (s.done / s.total) * 100 : 3;
      $('#progressBar').style.width = (s.phase === 'detail' ? 50 + pct / 2 : pct / 2) + '%';
      $('#refreshInfo').textContent = s.message;
      if (!s.running) {
        clearInterval(polling);
        setBusy(false);
        await load();
        toast(s.message);
      }
    }, 1500);
  }

  let toastT;
  function toast(msg) {
    $('#toast').textContent = msg;
    $('#toast').hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => ($('#toast').hidden = true), 5000);
  }

  async function load() {
    const url = CFG.static ? 'data.json?t=' + Date.now() : '/api/jobs';
    const d = await fetch(url, { cache: 'no-store' }).then((r) => r.json());
    Object.assign(state, { jobs: d.jobs, categories: d.categories, sources: d.sources, lastRefresh: d.lastRefresh, removed: d.removed || [] });
    renderStatic();
    render();
    if (d.status?.running) watchRefresh();
  }

  // ---- Bản GitHub Pages: Làm mới = chạy workflow trên GitHub Actions ----
  const GH = 'https://api.github.com/repos/' + CFG.repo + '/actions/workflows/' + (CFG.workflow || 'crawl.yml');
  const ghToken = () => ls.get('jf_gh_token', '');
  const ghHeaders = () => ({ Accept: 'application/vnd.github+json', ...(ghToken() ? { Authorization: 'Bearer ' + ghToken() } : {}) });

  function askToken(message = '') {
    $('#modal').hidden = false;
    $('#modal').dataset.id = '';
    $('#modalBody').innerHTML = `
      <div class="m-head"><div><h2 id="mTitle">Kết nối nút Làm mới với GitHub</h2>
        <div class="sub">Chỉ cần làm 1 lần trên mỗi thiết bị. Token chỉ lưu trong trình duyệt này.</div></div></div>
      <div class="m-scroll m-content">
        ${message ? `<div class="notice">${esc(message)}</div>` : ''}
        <ol>
          <li>Mở <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → tạo Fine-grained token</a></li>
          <li><b>Token name</b>: jobfinder · <b>Expiration</b>: chọn dài (vd 1 năm)</li>
          <li><b>Repository access</b>: Only select repositories → chọn <b>${esc(CFG.repo)}</b></li>
          <li><b>Permissions</b> → Repository permissions → <b>Actions</b>: <b>Read and write</b></li>
          <li>Bấm <b>Generate token</b>, copy và dán vào ô dưới.</li>
        </ol>
        <input id="tokenInput" type="password" placeholder="github_pat_..." style="width:100%;height:38px;border:1px solid var(--line);border-radius:8px;padding:0 10px;font:inherit">
      </div>
      <div class="m-foot">
        <button class="btn btn-ghost" data-close>Huỷ</button>
        <button class="btn btn-primary" id="tokenSave">Lưu & làm mới</button>
      </div>`;
    $('#tokenSave').onclick = () => {
      const v = $('#tokenInput').value.trim();
      if (!v) return;
      ls.set('jf_gh_token', v);
      closeModal();
      ghRefresh();
    };
  }

  async function latestRun() {
    const r = await fetch(GH + '/runs?per_page=1', { headers: ghHeaders(), cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).workflow_runs?.[0] || null;
  }

  async function ghRefresh() {
    if (!ghToken()) return askToken();
    setBusy(true);
    $('#refreshInfo').textContent = 'Đang gửi yêu cầu tới GitHub...';
    const r = await fetch(GH + '/dispatches', {
      method: 'POST',
      headers: { ...ghHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: CFG.branch || 'main' }),
    }).catch(() => null);
    if (!r || r.status === 401 || r.status === 403 || r.status === 404) {
      setBusy(false);
      if (r && r.status !== 404) ls.set('jf_gh_token', '');
      return askToken(r ? `GitHub từ chối (HTTP ${r.status}). Token sai, hết hạn hoặc thiếu quyền Actions: Read and write.` : 'Không kết nối được GitHub.');
    }
    watchGithub(Date.now());
  }

  let ghTimer;
  function watchGithub(since) {
    setBusy(true);
    clearInterval(ghTimer);
    const tick = async () => {
      const run = await latestRun().catch(() => null);
      const started = run && new Date(run.created_at).getTime() >= since - 60000;
      if (!started) {
        $('#refreshInfo').textContent = 'Đang chờ GitHub khởi động...';
        return;
      }
      const mins = (Date.now() - new Date(run.run_started_at || run.created_at)) / 60000;
      $('#progressBar').style.width = Math.min(95, (mins / 9) * 100) + '%';
      if (run.status !== 'completed') {
        $('#refreshInfo').innerHTML = `GitHub đang thu thập việc làm... ${Math.floor(mins)} phút (thường mất 6–10 phút, bạn có thể đóng trang, lát quay lại). <a href="${esc(run.html_url)}" target="_blank" rel="noopener">Xem tiến trình</a>`;
        return;
      }
      clearInterval(ghTimer);
      if (run.conclusion === 'success') {
        $('#refreshInfo').textContent = 'Xong, đang tải dữ liệu mới...';
        setTimeout(async () => { setBusy(false); await load(); toast('Đã cập nhật việc làm mới'); }, 15000);
      } else {
        setBusy(false);
        renderStatic();
        toast('Lượt thu thập trên GitHub bị lỗi: ' + run.conclusion);
      }
    };
    tick();
    ghTimer = setInterval(tick, 15000);
  }

  // Mở trang khi GitHub đang chạy (theo lịch hoặc vừa bấm trên máy khác) -> hiện tiến trình
  async function checkRunningOnGithub() {
    const run = await latestRun().catch(() => null);
    if (run && run.status !== 'completed') watchGithub(new Date(run.created_at).getTime());
  }

  // ---- Sự kiện ----
  const resetAndRender = () => { state.page = 1; render(); };
  $('#refreshBtn').addEventListener('click', async () => {
    if (CFG.static) return ghRefresh();
    await fetch('/api/refresh', { method: 'POST' });
    watchRefresh();
  });
  let qT;
  $('#q').addEventListener('input', (e) => { clearTimeout(qT); qT = setTimeout(() => { state.q = e.target.value; resetAndRender(); }, 150); });
  $('#catTabs').addEventListener('click', (e) => {
    const t = e.target.closest('[data-cat]');
    if (t) { state.cat = t.dataset.cat; resetAndRender(); }
  });
  document.querySelectorAll('.filters input').forEach((i) => i.addEventListener('change', resetAndRender));
  $('#source').addEventListener('change', (e) => { state.source = e.target.value; resetAndRender(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; resetAndRender(); });
  $('#pager').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-page]');
    if (!b || b.disabled) return;
    state.page = +b.dataset.page;
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  $('#pager').addEventListener('change', (e) => {
    if (e.target.id !== 'pageSize') return;
    state.pageSize = +e.target.value;
    ls.set('jf_pageSize', state.pageSize);
    resetAndRender();
  });

  $('#list').addEventListener('click', (e) => {
    const card = e.target.closest('.job');
    if (!card || e.target.closest('a')) return;
    const id = card.dataset.id;
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') {
      saved.has(id) ? saved.delete(id) : saved.add(id);
      saveSet('jf_saved', saved);
      render();
    } else if (act === 'hide') {
      hidden.has(id) ? hidden.delete(id) : hidden.add(id);
      saveSet('jf_hidden', hidden);
      render();
      toast(hidden.has(id) ? 'Đã ẩn. Tick "Đã ẩn" để xem lại.' : 'Đã bỏ ẩn.');
    } else openModal(id);
  });

  $('#modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return closeModal();
    if (e.target.closest('[data-act="save-modal"]')) {
      const id = $('#modal').dataset.id;
      saved.has(id) ? saved.delete(id) : saved.add(id);
      saveSet('jf_saved', saved);
      e.target.textContent = saved.has(id) ? '★ Đã lưu' : '☆ Lưu';
      render();
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  load()
    .then(() => CFG.static && CFG.repo && checkRunningOnGithub())
    .catch((e) => toast('Không tải được dữ liệu: ' + e.message));
})();
