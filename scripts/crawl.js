// Thu thập 1 lượt rồi dựng web tĩnh (chạy trên GitHub Actions: `npm run crawl`)
const crawler = require('../src/crawler');
const { build } = require('./build-static');

(async () => {
  const t = Date.now();
  const timer = setInterval(() => console.log(`[${Math.round((Date.now() - t) / 1000)}s] ${crawler.status.message}`), 30000);
  const s = await crawler.refresh({ includeLazy: true });
  clearInterval(timer);
  console.log(s.message);
  if (s.errors.length) console.log('Lỗi (nguồn lỗi vẫn giữ job cũ):\n  ' + s.errors.join('\n  '));
  build();
  // Không làm fail workflow khi chỉ vài nguồn lỗi; chỉ fail khi lỗi nghiêm trọng
  process.exit(s.phase === 'error' ? 1 : 0);
})();
