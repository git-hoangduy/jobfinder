# JobFinder – Tổng hợp việc làm TP.HCM

Tự thu thập việc làm từ nhiều trang tuyển dụng, lọc theo các nhóm nghề bạn quan tâm và hiển thị theo kiểu ITviec.

## Chạy

```bash
npm install     # lần đầu
npm start       # hoặc bấm đúp start.bat
```

Mở http://localhost:3000. Lần chạy đầu tiên app tự thu thập dữ liệu (khoảng 3–6 phút).

## Nguồn dữ liệu

| Nguồn | Cách lấy |
|---|---|
| VietnamWorks | API JSON |
| TopDev | API JSON |
| ITviec | HTML (theo slug kỹ năng: php, laravel, vuejs, reactjs, javascript) |
| TopCV | HTML + trang chi tiết |
| CareerViet | HTML + trang chi tiết |
| CareerLink | HTML + trang chi tiết |
| LinkedIn | API khách (guest), mô tả chỉ tải khi mở popup. Tự bỏ qua nếu mạng không vào được LinkedIn |

Mỗi nhóm nghề có 5–10 từ khóa (xem `src/config.js`). Mỗi từ khóa đọc tối đa 5 trang với các trang HTML, và tối đa 200 job với VietnamWorks/TopDev.

Mô tả và hạn nộp hồ sơ được đọc từ dữ liệu chuẩn `JobPosting` (JSON-LD) trên trang chi tiết.

## Nút "Làm mới"

1. Đọc lại danh sách của tất cả nguồn theo từ khóa từng nhóm. Nguồn nào lỗi kết nối, hoặc lỗi 3 lần liên tiếp, sẽ được bỏ qua trong lượt đó.
2. Chỉ giữ những job đúng nhóm, ở TP.HCM (riêng PHP/Frontend thì giữ thêm job remote ở nơi khác).
3. **Loại bỏ** job không còn hiển thị trên trang nguồn, hoặc đã quá hạn nộp. Nếu một nguồn bị lỗi trong lượt đó, job của nguồn ấy được giữ nguyên.
4. Lấy chi tiết (mô tả, hạn nộp) cho các job mới.

Danh sách job đã loại bỏ nằm ở cuối trang: "Job đã loại bỏ gần đây".

## Dịch & lương

- Job có mô tả tiếng Anh có thêm tab **Tiếng Việt** trong popup. Bản dịch được làm sẵn lúc thu thập (tối đa 40 job mỗi lượt). Nếu chưa có bản dịch sẵn: Chrome trên máy tính sẽ dịch ngay trên trình duyệt; các trình duyệt khác có link mở bằng Google Dịch.
- Lương được chọn theo thứ tự: lương ở danh sách → lương trong dữ liệu chi tiết → lương ghi trong tiêu đề hoặc mô tả (đánh dấu `*` hoặc ghi "theo mô tả").

## Badge

- **Mới cập nhật hôm nay**: trang nguồn đăng hoặc làm mới tin trong hôm nay.
- **MỚI**: lần "Làm mới" gần nhất mới phát hiện ra job này.
- **Không yêu cầu KN / Đào tạo**: tiêu đề có fresher/intern/thực tập, hoặc yêu cầu 0–dưới 1 năm, hoặc mô tả ghi rõ không cần kinh nghiệm / đào tạo từ đầu.
- **Còn N ngày**: số ngày còn lại tới hạn nộp (đỏ khi ≤ 3 ngày).

## Tuỳ chỉnh

- Nhóm nghề, từ khóa và biểu thức lọc nằm trong `src/config.js`.
- Thời gian giãn cách giữa các request tới từng trang nằm ở `HOST_GAP` trong `src/util.js`. Nếu bị chặn (HTTP 403/429), hãy tăng giá trị này.
- Dữ liệu được lưu ở `data/jobs.json`. Xoá file này để thu thập lại từ đầu.
- Job đã lưu, đã ẩn hay đã xem được lưu trong trình duyệt (localStorage).

## Đưa lên mạng (GitHub Pages + GitHub Actions)

Web luôn sống, mở ở đâu cũng được, không cần bật máy tính:

- `.github/workflows/crawl.yml` tự thu thập khoảng **6h30, 11h30 và 17h30** giờ VN (GitHub thường chạy trễ thêm 10–60 phút). Kết quả lưu vào `data/jobs.json` trong repo, và web tĩnh được dựng ra rồi đăng lên GitHub Pages.
- Nút **Làm mới** trên web gọi GitHub chạy workflow ngay, mất khoảng 6–10 phút. Lần đầu bấm, web sẽ hỏi một **fine-grained token**: chỉ cấp cho repo này, quyền *Actions: Read and write*. Token chỉ lưu trong trình duyệt của thiết bị đó.
- Muốn đổi giờ chạy thì sửa dòng `cron` trong workflow. Giờ ở đó là giờ UTC, tức giờ VN trừ 7.

Thiết lập một lần:
1. Đẩy code lên một repo **public** (public thì GitHub Actions không giới hạn phút chạy).
2. Vào repo → **Settings → Pages → Source: GitHub Actions**.
3. Vào **Actions → crawl → Run workflow** để chạy lần đầu. Web sẽ có ở `https://<tên-user>.github.io/<tên-repo>/`.

Máy của GitHub đặt ở Mỹ, nên một số trang VN (vd TopCV) có thể chặn. Job của nguồn bị chặn vẫn được giữ nguyên. Ngoài ra, nếu repo không có hoạt động gì trong 60 ngày thì GitHub tự tắt lịch chạy. Khi đó vào tab Actions bật lại là được.

## Lưu ý

Các trang tuyển dụng có thể đổi giao diện bất kỳ lúc nào. Khi một nguồn báo lỗi liên tục, cần sửa bộ đọc trong `src/sources/<nguồn>.js`.
Đừng bấm "Làm mới" quá dày (vài lần mỗi ngày là đủ), để tránh bị các trang chặn tạm thời.
