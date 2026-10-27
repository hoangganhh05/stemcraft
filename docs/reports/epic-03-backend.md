# EPIC-03 — Backend Node.js

Ngày: 27/10/2026 (Asia/Saigon). Nhánh làm việc: `develop`.
Phạm vi: backend local; chưa xây frontend hoặc public deployment.

**Kết luận: BE-01–BE-08 hoàn tất theo phạm vi local đã kiểm tra.**

## Những phần đã triển khai

| Task | Triển khai | Kiểm tra |
|---|---|---|
| BE-01 | Express 5, config validation, request ID/log an toàn, health | Health 200; cấu hình sai bị từ chối |
| BE-02 | Prisma 6.19.3, schema và migration MySQL `audio_jobs` | Deploy vào `vocal_studio_dev`, deploy lần hai không có migration thừa; test DB riêng cũng chạy hai lần |
| BE-03 | Multipart disk upload, giới hạn bytes/duration/codec, FFprobe, private storage | WAV hợp lệ nhận; file hỏng, quá lớn, quá dài bị từ chối; không rò input lỗi |
| BE-04 | DB queue, claim có điều kiện, một worker, khóa server trong dự án, recovery | Không chạy song song; giữ QUEUED, PROCESSING cũ → FAILED/WORKER_INTERRUPTED |
| BE-05 | Python worker dùng `ai-profile.json`, decode thật, progress chunk, validate/publish 2 WAV | PASS: API → MySQL → worker thật → COMPLETED → download 2 WAV và preview 206 |
| BE-06 | Token ngẫu nhiên 256 bit, chỉ lưu SHA-256, Range preview, WAV attachment | Sai/mất token 404; chưa sẵn sàng 409; Range 206; không nhận stem/path tùy ý |
| BE-07 | Hủy, timeout, RAM guard, parent monitoring, TTL cleanup | API hủy đúng job; test dừng cây tiến trình thật; test timeout/RAM bằng child ngủ; expiry xóa audio |
| BE-08 | Rate limit, queue/disk caps, error handler, Origin local, log không secrets | Các trường hợp lỗi/abuse chính đạt trong bộ API tests |

## Bằng chứng đã có

- `npm.cmd run check`: lint, format, 2 foundation tests, registry/profile validation đạt.
- `npm.cmd run db:validate`: schema hợp lệ.
- `npm.cmd run test:backend`: **8/8 PASS**, MySQL/FFprobe thật, worker giả lập.
- `npm.cmd run test:worker`: **3/3 PASS**, không chạy model.
- Prisma migration chạy thành công trên dev và lặp lại an toàn.

`test:backend` tạo database tên ngẫu nhiên riêng; chỉ drop đúng database test
do script vừa tạo. Không reset hoặc drop database khác.

## AI thật và lỗi đã phát hiện

Báo cáo hiện hành: `docs/reports/epic-03-real-ai.json`; các attempt trước
được lưu riêng. Một job 1 giây là kiểm tra đường đi hệ thống, không phải
nghiệm thu chất lượng mới hoặc benchmark toàn bài.

- Attempt đầu bị `MEMORY_LIMIT`; giữ nguyên guard RSS 3500 MiB / RAM khả
  dụng 256 MiB, không tự đóng ứng dụng của người dùng.
- Attempt tiếp theo thực sự tạo đủ WAV, child exit 0 nhưng bị báo nhầm
  `WORKER_INTERRUPTED` do child thoát giữa lúc lấy mẫu psutil. Đã sửa race,
  thêm test tái hiện và chạy lại. Không coi attempt này là PASS end-to-end.
- Test Range ban đầu trả 404 vì Express bỏ qua đường dẫn `.cache`; đã sửa
  `dotfiles: allow` chỉ cho hai đường dẫn WAV cố định đã xác thực, không mở
  static storage. Bộ kiểm tra chạy lại đạt.

## Kết quả AI thật sau sửa

`epic-03-real-ai.json`: **PASS**. Job `3dd8bc07-a098-4c9a-89c4-51c5ad029983`.
Worker 113.188 giây, tổng kiểm tra 129.585 giây; peak RSS 1821.21 MiB;
RAM khả dụng nhỏ nhất quan sát 278.95 MiB, vẫn trên ngưỡng bảo vệ.

Cả hai WAV 44100 frames/1 giây, stereo 44.1 kHz; peak vocal 0.681488,
instrumental 0.764648; dữ liệu hữu hạn trước encode và khi đọc lại.
Download hai stem 200, Range preview 206. SHA-256 nằm trong JSON.
Output được giữ tại
`.cache/epic3-real-ai-Ymf2Ti/3dd8bc07-a098-4c9a-89c4-51c5ad029983/stems/`.

Entry point `node backend/src/server.mjs` đã khởi động thực tế;
health tại `http://127.0.0.1:3000/api/v1/health` trả 200/ok.

## Vận hành và giới hạn

Xem [hướng dẫn backend](../../backend/README.md). Không đổi cấu hình audio
đã được người dùng chấp nhận. Chưa có fallback tự động hoặc inference resume
cho API job. Giới hạn đầu vào 600 giây không phải bằng chứng đã nghiệm thu
toàn bài; kiểm tra kỹ thuật đầu tiên chỉ dùng 1 giây để tiết kiệm CPU.
Giấy phép weights vẫn chưa xác minh, server chỉ chạy loopback.

`.env` được Git ignore; mật khẩu/URL DB/token không đưa vào báo cáo hoặc log.
Repository ban đầu chưa có commit; đã chuyển HEAD sang `develop`, không push.
