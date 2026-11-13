// Dựng bản web tĩnh vào thư mục _site/ (dùng cho GitHub Pages)
// - copy giao diện từ public/
// - xuất data.json (đã kèm mô tả job cho popup)
// - config.js: bật chế độ tĩnh + thông tin repo để nút "Làm mới" gọi GitHub Actions
const fs = require('fs');
const path = require('path');
const store = require('../src/store');
const { buildPayload } = require('../src/present');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, '_site');

function build() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'public'), OUT, { recursive: true });

  const payload = buildPayload(store.load(), { withDetail: true });
  fs.writeFileSync(path.join(OUT, 'data.json'), JSON.stringify(payload));

  const config = {
    static: true,
    repo: process.env.GITHUB_REPOSITORY || process.env.JF_REPO || '',
    workflow: 'crawl.yml',
    branch: process.env.GITHUB_REF_NAME || 'main',
  };
  fs.writeFileSync(path.join(OUT, 'config.js'), `window.JF_CONFIG = ${JSON.stringify(config)};`);
  fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
  console.log(`Đã dựng _site/ với ${payload.jobs.length} việc làm`);
}

if (require.main === module) build();
module.exports = { build };
