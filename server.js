const express = require('express');
const path = require('path');
const store = require('./src/store');
const crawler = require('./src/crawler');
const { decorate, detailOf, buildPayload } = require('./src/present');

const PORT = process.env.PORT || 3000;
const app = express();

// Bản chạy trên máy: dùng API của server (bản GitHub Pages sẽ thay file này)
app.get('/config.js', (req, res) => res.type('js').send('window.JF_CONFIG = { static: false };'));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/jobs', (req, res) => {
  res.json({ ...buildPayload(store.load()), status: crawler.status });
});

app.get('/api/jobs/:id/detail', async (req, res) => {
  try {
    const j = await crawler.detailOnDemand(req.params.id);
    if (!j) return res.status(404).json({ error: 'Không tìm thấy job' });
    if (j.gone) return res.json({ gone: true, reason: j.reason });
    res.json({ ...decorate(j), ...detailOf(j) });
  } catch (e) {
    // Không lấy được chi tiết -> trả dữ liệu đang có
    const j = store.load().jobs[req.params.id];
    if (!j) return res.status(500).json({ error: e.message });
    res.json({ ...decorate(j), ...detailOf(j), detailError: e.message });
  }
});

app.post('/api/refresh', (req, res) => {
  crawler.refresh();
  res.json(crawler.status);
});

app.get('/api/status', (req, res) => res.json(crawler.status));

app.listen(PORT, () => {
  console.log(`\n  JobFinder đang chạy: http://localhost:${PORT}\n`);
  const db = store.load();
  if (!Object.keys(db.jobs).length) {
    console.log('  Chưa có dữ liệu -> tự động thu thập lần đầu...');
    crawler.refresh().then((s) => console.log('  ' + s.message));
  }
});
