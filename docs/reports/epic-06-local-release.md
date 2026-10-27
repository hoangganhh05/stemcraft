# Epic 6 — Local release candidate preparation

Ngày 27/10/2026. Nhánh `chore/epic-06-local-release` tiếp nối Epic 5.
Epic 5 đã push lên `origin/test/epic-05-quality-security`; không tự merge vào develop/main.

## Kết quả và phạm vi

| Task | Trạng thái | Bằng chứng / việc còn thiếu |
|---|---|---|
| REL-01 scripts/setup | PARTIAL | setup-local.ps1 dùng lockfiles, không ghi đè .env, không tải weights; dev launcher và doctor. Cú pháp PowerShell đạt; chưa chạy full setup trên máy Windows khác |
| REL-02 tài liệu Windows | IMPLEMENTED | docs/SETUP.md có setup, chạy, demo và troubleshooting; chưa có lượt người dùng xác minh trên máy mới |
| REL-03 E2E/audit | PARTIAL | Regression Epic 5 PASS và audit hiện tại PASS; UI fixture không thay thế demo browser → AI thật mới |
| REL-04 RC local | PREPARED, NOT ACCEPTED | Có entrypoint chạy local và prerequisite PASS. Chưa nghiệm thu demo mới hoặc toàn bài |
| REL-05 readiness | DONE — NO-GO public | Chưa rõ license weights, thiếu CPU/GPU comparison, chưa chứng minh capacity toàn bài và clean-machine/browser-real-AI demo |

## Công cụ bàn giao

- `scripts/setup-local.ps1`: npm ci, Prisma generate, uv venv nếu chưa có,
  uv pip sync lockfile, chỉ copy .env.example khi .env chưa tồn tại.
  Có tải dependency khi chạy; không tự cài MySQL, không tải checkpoint.
- `npm.cmd run doctor`: kiểm tra config, Python/dependency, FFmpeg, hash model,
  truy vấn schema MySQL. Không migrate hay chạy inference; không in credentials.
- `npm.cmd run dev`: hai server cùng terminal, kiểm tra cổng trước khi tạo server,
  Ctrl+C dừng các tiến trình do launcher tạo; không giết server khác.
- `npm.cmd run test:release`: test scanner và launcher từ chối cổng đang dùng.
- `npm.cmd run audit:release`: file tracked và untracked không bị ignore;
  chặn private artifacts/storage/audio/model, private keys, các mẫu access keys,
  URL MySQL có mật khẩu không phải placeholder. Symlink và file >16 MiB cần review;
  không đọc file lớn vào RAM. Đây là heuristic, không phải chứng minh mọi secret đều vắng mặt.
- `npm.cmd run release:check`: ghi quyết định NO_GO trong JSON, không deploy/tag.
  Exit 0 chỉ cho biết các kiểm tra kỹ thuật đã PASS, không đồng nghĩa public GO.

## Xác minh hiện tại

Doctor: configuration, Python/FFmpeg/model hashes, Python dependencies và MySQL
schema đều PASS. RAM khả dụng lúc đo 1225 MiB. So với peak RSS AI trước đó
khoảng 1821 MiB, không chủ động mở thêm lượt inference/demo mới trong phiên này.
Không hạ guard RAM hoặc thay model đã được người dùng chấp nhận.
Bằng chứng AI thực trước đó vẫn tại `epic-03-real-ai.json`, không gọi đó là lượt
E2E mới sau thay đổi release. Không tạo tag phát hành khi các gate còn thiếu.

Regression gần nhất: `epic-05-regression.json` (fixture, không GPU/inference).
Doctor: `epic-06-doctor.json`. Audit: `epic-06-audit.json`.
Quyết định: `epic-06-readiness.json`.

Bước nghiệm thu còn lại: trên máy có đủ RAM, làm demo clip 1–8 giây theo
`docs/SETUP.md` từ browser qua AI thật và tải hai WAV; xác minh full setup trên
môi trường đích mới. Cần phần cứng GPU để hoàn thành QA-07, kiểm tra quyền sử dụng
weights và capacity trước khi cân nhắc public. Không tự đánh dấu toàn Epic 6 DONE.

## Tiếp tục nghiệm thu — 27/10/2026

- Code đã đồng bộ từ `origin/develop` tại `95a239b` sau merge PR Epic 5.
- Cài Node sạch đã kết thúc exit 0. `verify:clean-node` đối chiếu SHA-256 lockfile
  và toàn bộ dependency trực tiếp với thư mục cài riêng: PASS.
  Nguồn: `epic-06-clean-node.json`. Đã dùng `--offline --ignore-scripts`, nên
  không coi đây là xác minh Prisma postinstall/full setup trên Windows khác.
- Đã bổ sung `npm.cmd run verify:release-demo`: clip 1 giây từ mẫu hiện có,
  browser upload qua server dev thật, chờ worker, phát/pause/seek ba player,
  tải hai WAV, kiểm tra frames/rate/channels/peak/hash khớp metadata worker,
  reload phục hồi. Chỉ lưu UUID và số đo; không lưu token vào report.
- Lượt demo hiện tại BLOCKED trước khi tạo job: RAM khả dụng 494 MiB,
  thấp hơn mức khởi động bảo thủ 2560 MiB (model + browser + RAM dự phòng).
  Không có lượt inference mới và không có WAV demo mới để nghiệm thu.
  Nguồn: `epic-06-real-demo.json`. Đây không phải PASS E2E.
- 4 test release PASS, check/lint/format/foundation/profile PASS.
  Readiness hiện kiểm tra cả clean Node và demo; BLOCKED/thiếu/sai profile không
  được coi là local GO, ngay cả khi audit và regression fixture đều PASS.
- Local acceptance: NOT_ACCEPTED; public: NO_GO. Exit 1 của `release:check`
  trong trạng thái này là kết quả gate chưa đạt, không phải lỗi công cụ.

Phần code/công cụ Epic 6 đã được chuẩn bị để review. Các gate còn thiếu giữ
nguyên: demo AI thật khi có RAM, full setup trên máy Windows đích khác,
GPU đối chứng và license/capacity trước public. Không tự gắn tag hoặc phát hành.
