# EPIC-01 — Project Foundation

Cập nhật: 27/10/2026, múi giờ Asia/Saigon. Theo yêu cầu người dùng,
hoàn thiện Epic 1 trước khi bắt đầu backend.

**Kết luận: EPIC-01 hoàn tất trên máy Windows hiện tại.** Đã kiểm chứng
cài dependency vào môi trường mới, độc lập với `.venv` đang sử dụng.

| Task | Trạng thái | Bằng chứng / phần còn lại |
|---|---|---|
| FND-01 | DONE trên máy hiện tại | environment.json: i5-6440HQ, RAM 7.9 GiB, Node 25.2.1; Python 3.11.17, FFmpeg/FFprobe 9.0.2; PyTorch 2.14.1+cpu, CUDA false |
| FND-02 | DONE | Các thư mục monorepo; Git ignore secrets/audio/model/storage; test kiểm tra ignore đạt |
| FND-03 | DONE | Venv mới `.cache/epic1-clean-venv`: cài 61 package đúng lockfile, uv pip check đạt; npm ci cài 80 package trong `.cache/epic1-clean-node` mới |
| FND-04 | DONE | .env.example, README, docs/SETUP.md, ADR-001; đã sửa hướng dẫn setup dựa trên lệnh cài thực tế |
| FND-05 | DONE | ESLint, Prettier pin phiên bản; Node test runner, Python unittest; các lệnh bên dưới đạt |

Kiểm tra đã chạy:

- `npm.cmd run check`: lint, format, 2 Node tests và model registry validation đạt.
- `npm.cmd run test:python`: 1 Python test đạt, có nhiều trường hợp biên inventory.
- `node scripts/check-environment.mjs`: đạt sau activate-local.ps1.
- `python ai-worker/check_environment.py`: đạt; CUDA không khả dụng.

Các test trên kiểm tra công cụ/nền tảng, không tách nhạc, không tải model.
Lệnh test Python ban đầu dùng dấu `/` bị cmd.exe từ chối; đã sửa thành đường
dẫn Windows và chạy lại đạt. Không sửa script full-track hay khởi động lại AI.

Người dùng đã duyệt chất lượng đoạn 25 giây và bỏ benchmark mở rộng.
Toàn bài vẫn tạm dừng; không đánh dấu 20 mẫu/blind scoring đã làm xong.
Giấy phép weights chưa xác minh; registry vẫn giữ trạng thái chưa khả dụng công khai.

## Bằng chứng bổ sung — FND-03

- `uv venv` tạo Python 3.11.17 venv mới với `include-system-site-packages=false`.
- `uv pip sync ... --offline`: cài 61 package trong 1 phút 53 giây từ cache.
- `uv pip check`: toàn bộ package tương thích.
- `verify_foundation_environment.py`: PASS; đối chiếu đủ 61 phiên bản và
  xác nhận mọi package nằm trong venv mới, không mượn từ `.venv` cũ.
- Import `Separator`, PyTorch CPU, phép tính tensor và vòng đọc/ghi WAV đạt.
- Báo cáo máy đọc được: [epic-01-clean-python.json](epic-01-clean-python.json).
- `npm ci` độc lập: cài 80 package; CLI ESLint và Prettier vừa cài chạy đạt.
- `npm run check` chạy lại đạt: lint, format, 2 tests, registry validation.

Script xác minh ban đầu chưa xử lý BOM đầu lockfile, đã sửa đọc `utf-8-sig`
và chạy lại PASS. Các lệnh cần spawn/tempfile phải chạy trong terminal được
phép thực thi; sandbox từng gây EPERM, không phải lỗi dependency.

Phạm vi clean install: venv và node_modules mới trên cùng host, dùng cache
artifact sẵn có, giữ nguyên Python base và công cụ hệ thống. Chưa chứng minh
setup trên máy Windows khác hoặc tải lại toàn bộ package từ mạng.
Không cài đè môi trường đang dùng, không tải model, không chạy inference.
Chưa bắt đầu BE-01, chưa có API hoặc giao diện.
