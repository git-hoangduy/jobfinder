// Cấu hình các nhóm việc bạn quan tâm.
// - keywords: từ khóa dùng để tìm trên các trang tuyển dụng
// - match: biểu thức so khớp (trên chữ đã bỏ dấu, chữ thường) để giữ job đúng nhóm
//          useTags=true: so khớp cả tiêu đề + tag kỹ năng; ngược lại chỉ so tiêu đề
// - exclude: loại job có tiêu đề khớp (tránh nhiễu)
// - entry: true = nhóm bạn muốn "không yêu cầu kinh nghiệm / có đào tạo"
// - anywhereIfRemote: job ở tỉnh khác vẫn giữ nếu là remote
// - itviec: các slug kỹ năng trên ITviec (chỉ nhóm IT phần mềm)

const CATEGORIES = [
  {
    id: 'php',
    name: 'Backend PHP / Laravel',
    color: '#7a6ff0',
    keywords: ['php', 'laravel', 'wordpress', 'backend php', 'php developer'],
    itviec: ['php', 'laravel'],
    useTags: true,
    match: /\b(php|laravel|wordpress|magento|codeigniter|symfony|yii2?|cakephp|lamp)\b/,
    exclude: null,
    entry: false,
    anywhereIfRemote: true,
  },
  {
    id: 'frontend',
    name: 'Frontend (HTML/CSS/JS, Vue, React)',
    color: '#0ea5e9',
    keywords: ['frontend', 'front end', 'vuejs', 'reactjs', 'javascript', 'html css', 'web developer', 'lập trình web', 'fresher frontend'],
    itviec: ['vuejs', 'reactjs', 'javascript'],
    match: /(front[\s-]?end|\bhtml\b|\bcss\b|\bvue(\.?js)?\b|\breact(\.?js)?\b|javascript|web developer|lap trinh (vien )?web|ui developer|nuxt|next\.?js|web designer)/,
    exclude: /(react native|\.net|\bjava\b)/,
    entry: true,
    anywhereIfRemote: true,
  },
  {
    id: 'network',
    name: 'IT phần cứng / Mạng',
    color: '#16a34a',
    keywords: ['kỹ thuật mạng', 'quản trị mạng', 'network engineer', 'kỹ thuật phần cứng', 'it phần cứng', 'kỹ thuật viên it', 'kỹ thuật viên máy tính', 'nhân viên it', 'system admin', 'quản trị hệ thống'],
    itviec: [],
    match: /(phan cung|hardware|mang may tinh|ky thuat mang|quan tri mang|network (engineer|admin|technician|support)|it infrastructure|ha tang (it|mang|cntt)|system admin|sysadmin|system engineer|quan tri he thong|ky thuat vien (it|may tinh|mang)|ky thuat (it|mang)\b|it ky thuat|nhan vien it\b|it engineer|it technician|camera|bao tri may tinh|lap dat mang|vien thong)/,
    exclude: /(neural|social network|mang xa hoi|kinh doanh|sales|ban hang|o to|\bxe\b|audio|visual)/,
    entry: true,
    anywhereIfRemote: false,
  },
  {
    id: 'helpdesk',
    name: 'IT Support / Helpdesk',
    color: '#f59e0b',
    keywords: ['it helpdesk', 'helpdesk', 'it support', 'hỗ trợ kỹ thuật', 'technical support', 'service desk', 'thực tập sinh it', 'fresher it'],
    itviec: [],
    match: /(helpdesk|help desk|service desk|desktop support|it support|support it|ho tro ky thuat (it|phan mem|may tinh)|ho tro it|ho tro phan mem|technical support|tech support|application support|ky thuat vien it|nhan vien it\b|it staff|it officer|it executive|it admin|it intern|thuc tap sinh it)/,
    exclude: /(kinh doanh|sales|telesale|xe cau|bang lai)/,
    entry: true,
    anywhereIfRemote: false,
  },
  {
    id: 'deploy',
    name: 'Triển khai phần mềm',
    color: '#db2777',
    keywords: ['triển khai phần mềm', 'chuyên viên triển khai', 'nhân viên triển khai', 'tư vấn triển khai', 'implementation', 'hỗ trợ phần mềm', 'triển khai erp'],
    itviec: [],
    match: /(trien khai (phan mem|he thong (phan mem|erp|crm|it)|erp|crm|hrm|san pham phan mem|giai phap (phan mem|cong nghe)|ung dung|cong nghe)|(chuyen vien|nhan vien|ky su|ky thuat|tu van) trien khai\s*($|\(|-|\/|va ho tro|phan mem)|implementation (consultant|specialist|engineer|executive|staff|officer)|software implement|implementer|erp consultant|ho tro phan mem|software support)/,
    exclude: /(ban ve|xay dung|\bbim\b|\bmep\b|hvac|\b3d\b|thiet ke|noi that|kien truc|co dien|kinh doanh|sales|marketing|audio)/,
    entry: true,
    anywhereIfRemote: false,
  },
  {
    id: 'repair',
    name: 'Sửa laptop / điện thoại',
    color: '#ea580c',
    keywords: ['sửa chữa laptop', 'sửa chữa điện thoại', 'sửa chữa máy tính', 'kỹ thuật viên điện thoại', 'kỹ thuật viên laptop', 'kỹ thuật viên sửa chữa', 'bảo hành điện thoại', 'kỹ thuật máy tính'],
    itviec: [],
    match: /(sua chua (laptop|dien thoai|may tinh|thiet bi (di dong|dien tu|it|cong nghe)|smartphone|iphone|macbook|may in|linh kien)|sua (laptop|dien thoai|may tinh)|ky thuat vien (sua chua )?(dien thoai|laptop|may tinh|smartphone|iphone|macbook)|ky thuat (dien thoai|laptop|may tinh)|(laptop|phone|mobile|computer) repair|repair technician|bao hanh (dien thoai|laptop|may tinh|thiet bi dien tu))/,
    exclude: /(o to|xe may|dieu hoa|may lanh|oto|cong trinh|kinh doanh|ban hang|sales|xe cau|bang lai)/,
    entry: true,
    anywhereIfRemote: false,
  },
];

const SOURCES = {
  vietnamworks: { name: 'VietnamWorks', color: '#0057ff' },
  topdev: { name: 'TopDev', color: '#ff5d00' },
  itviec: { name: 'ITviec', color: '#d01e2a' },
  topcv: { name: 'TopCV', color: '#00b14f' },
  careerviet: { name: 'CareerViet', color: '#1e3a8a' },
  careerlink: { name: 'CareerLink', color: '#0f766e' },
  linkedin: { name: 'LinkedIn', color: '#0a66c2' },
};

// Số trang tối đa đọc cho mỗi từ khóa ở các trang HTML (dừng sớm khi hết kết quả)
const MAX_PAGES = 5;
// Số request chi tiết chạy song song (mỗi trang vẫn được giãn cách riêng)
const DETAIL_CONCURRENCY = 4;

module.exports = { CATEGORIES, SOURCES, MAX_PAGES, DETAIL_CONCURRENCY };
