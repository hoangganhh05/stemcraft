# Setup Windows — Epic 1

Máy hiện tại: Windows x64, Node 25.2.1/npm 11.6.2, Python 3.11.17,
CPU i5-6440HQ, RAM 7.9 GiB, PyTorch CPU; chưa có CUDA khả dụng.

## Trên workspace hiện có

```powershell
npm.cmd ci --cache .cache/npm
. .\scripts\activate-local.ps1
npm.cmd run check
npm.cmd run test:python
node scripts/check-environment.mjs
python ai-worker/check_environment.py
```

`npm ci` dùng package-lock.json; ESLint/Prettier được pin phiên bản chính xác.
Test Python ở đây kiểm tra validator inventory, không chạy model hoặc tách audio.
Chẩn đoán môi trường không tải checkpoint. `probe_blocked` là bị chặn thực thi,
không đồng nghĩa công cụ chưa cài. Kiểm tra lại ở terminal được phép thực thi.

## Trên máy mới

Cài Node/npm, uv và Python 3.11 x64, FFmpeg/FFprobe; đặt FFmpeg trong PATH.
Từ thư mục gốc:

```powershell
uv venv .venv --python 3.11
uv pip sync ai-worker/requirements.lock.txt --python .venv/Scripts/python.exe
npm.cmd ci
Copy-Item .env.example .env
```

Không ghi đè `.env` đã có. Sau đó chạy các kiểm tra phía trên.
Không cài thêm torchaudio hoặc dùng phiên bản torch tự suy đoán: lockfile là
nguồn phiên bản đã kiểm tra. Bản hiện tại dùng torch 2.14.1, runtime báo CPU.
Việc tái tạo đã được kiểm tra trong venv mới trên máy Windows hiện tại từ
package cache; không phải kiểm chứng trên một máy Windows khác hoàn toàn.
Model và audio không đi kèm Git; chưa cần tải để hoàn tất Epic 1.

## Tái hiện kiểm tra clean environment

Dùng đường dẫn mới, chưa tồn tại; giữ nguyên `.venv` đang sử dụng. Với uv
trong PATH, chạy từ thư mục gốc:

```powershell
uv venv .cache/epic1-clean-venv --python .tools/python/cpython-3.11.17-windows-x86_64-none/python.exe --no-project --offline --cache-dir .cache/uv
uv pip sync ai-worker/requirements.lock.txt --python .cache/epic1-clean-venv/Scripts/python.exe --offline --cache-dir .cache/uv
uv pip check --python .cache/epic1-clean-venv/Scripts/python.exe --cache-dir .cache/uv
.cache\epic1-clean-venv\Scripts\python.exe ai-worker/verify_foundation_environment.py
.cache\epic1-clean-venv\Scripts\python.exe -m unittest discover -s ai-worker -p test_validate_samples.py -v
```

Lần kiểm tra đầu dùng venv mới hoàn toàn, không có system-site-packages;
script xác nhận cả 61 phiên bản và đường dẫn package đều thuộc venv mới,
import Separator, thực hiện phép tính PyTorch và vòng ghi/đọc WAV ngắn.
Không load model, không kiểm thử lại chất lượng tách. `--offline` cần cache
đầy đủ; khi setup online lần đầu bỏ `--offline`. Có thể đổi tên thư mục để
thực hiện một lần clean install khác; không xóa môi trường đang dùng.

Kiểm tra cài Node độc lập đã dùng:

```powershell
New-Item -ItemType Directory -Force .cache/epic1-clean-node
Copy-Item -LiteralPath package.json,package-lock.json -Destination .cache/epic1-clean-node
npm.cmd ci --prefix .cache/epic1-clean-node --cache .cache/npm --offline --no-audit --no-fund
node .cache/epic1-clean-node/node_modules/eslint/bin/eslint.js .
node .cache/epic1-clean-node/node_modules/prettier/bin/prettier.cjs --check 'scripts/**/*.mjs' eslint.config.mjs package.json .prettierrc.json
npm.cmd run check
```

Lần kiểm tra đầu thư mục Node chưa có node_modules: `npm ci` cài 80 package.
Lint dùng CLI vừa cài; file cấu hình ESLint vẫn import preset từ root workspace.

ESLint áp dụng JavaScript module `.mjs`; Prettier hiện kiểm tra các script Node
và cấu hình tooling. Python dùng unittest, chưa áp dụng formatter Python.
Không đưa `.env`, `.venv`, `.tools`, `.cache`, model, audio hay output vào Git.

Tham khảo cấu hình: [ESLint](https://eslint.org/docs/latest/use/configure/configuration-files),
[Prettier](https://prettier.io/docs/install).

## MVP local — Epic 6

### Cài trên máy Windows mới

1. Clone repository, cài Node/npm, uv, Python 3.11 x64, MySQL local và FFmpeg/FFprobe.
2. Chạy `powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1` từ thư mục dự án.
   Script cài dependency từ lockfile, tạo venv khi chưa có, giữ nguyên `.env` hiện hữu;
   không tự tải checkpoint. Lệnh `uv pip sync` đồng bộ môi trường theo lockfile.
3. Điền `DATABASE_URL` vào `.env` trên máy, URL-encode ký tự đặc biệt trong mật khẩu.
   Không gửi mật khẩu vào chat/issue hoặc commit `.env`.
4. Chạy `npm.cmd run db:init`, sau đó `npm.cmd run db:migrate`.
5. Cung cấp checkpoint/YAML đúng SHA-256 trong `config/ai-profile.json` vào `models/`.
   GitHub không chứa các file này. Giấy phép weights chưa được xác minh cho public.
6. Chạy `npm.cmd run doctor`; các bước phải PASS. Nếu RAM cảnh báo, đóng bớt ứng dụng
   hoặc dùng đoạn ngắn; PASS prerequisite không bảo đảm toàn bài chạy được.
7. Chạy `npm.cmd run dev`, mở http://127.0.0.1:5173. Ctrl+C dừng hai server do lệnh này tạo.
   Có thể giữ cách cũ với hai terminal `dev:backend` và `dev:frontend`.

Không có tài khoản/đăng nhập; token tác vụ nằm trong sessionStorage của tab.
Sau reload cùng tab có thể phục hồi, đóng tab/mất token có thể mất quyền truy cập;
không chia sẻ token. TTL mặc định 24 giờ, file hết hạn bị dọn.

### Demo nghiệm thu

Dùng đoạn nhạc ngắn bạn có quyền xử lý (khuyến nghị 1–8 giây trên máy hiện tại),
upload từ trình duyệt, chờ COMPLETED, nghe/seek cả ba player, tải hai WAV,
reload cùng tab để xác nhận khôi phục. Đối chiếu duration, 44.1 kHz stereo và
không clipping. Không đưa fixture worker giả vào bằng chứng AI thực.

`npm.cmd run test:qa` kiểm tra regression fixture. `npm.cmd run test:release`
kiểm tra công cụ release. `npm.cmd run audit:release` quét file chuẩn bị đưa lên Git.
`npm.cmd run release:check` ghi quyết định public trong report, không deploy,
không tạo tag và không đồng nghĩa public GO khi exit code bằng 0.

### Troubleshooting

| Hiện tượng | Kiểm tra / xử lý |
|---|---|
| Port 5173/3000 đang dùng | Mở trang hiện có hoặc Ctrl+C terminal cũ trước khi chạy lại; launcher không tự giết tiến trình khác |
| 0% lâu | AI chỉ tăng khi một chunk xong; xem storage/<job-id>/progress.json và worker.log; HTTP GET 200 chỉ là polling thành công |
| MEMORY_LIMIT | Xem runtime.json; có thể do RAM toàn máy <256 MiB dù RSS worker chưa tới 3500 MiB. Đóng ứng dụng, dùng đoạn ngắn; không tắt guard |
| Backend offline | Chạy doctor, kiểm tra MySQL và DATABASE_URL trong .env, không in URL chứa mật khẩu |
| PROBE_UNAVAILABLE | Cài FFmpeg/FFprobe hoặc điền FFMPEG_PATH/FFPROBE_PATH |
| Model/hash fail | Cần đúng cả checkpoint và YAML; không đổi SHA trong profile để bỏ qua xác minh |
| WORKER_INTERRUPTED | Server/worker bị ngắt; restart giữ queue, tác vụ đang xử lý chuyển FAILED, chọn file upload lại |
| JOB_EXPIRED hoặc 404 | File hết TTL hoặc token không còn đúng; upload mới, không thử token của job khác |
| Không phát/tải được WAV | Dùng http://127.0.0.1:5173, kiểm tra service worker trong trình duyệt; không mở dist/index.html bằng file:// |

Cài sạch trên máy Windows khác và demo trình duyệt → AI thật sau thay đổi release
chưa được xác minh; xem báo cáo Epic 6 để biết các mục còn chờ.

### Nghiệm thu AI thật tự động

Khi hai server dev đang chạy và có ít nhất 2,5 GiB RAM khả dụng:

```powershell
npm.cmd run verify:release-demo
npm.cmd run release:check
```

Demo dùng clip kỹ thuật 1 giây từ `samples/repair-hoa-sua-8s.wav` có sẵn trên máy
hiện tại; audio không đi kèm Git. Máy khác cần cung cấp mẫu này hợp lệ trước khi
chạy. Demo tải WAV qua UI, kiểm tra metadata/hash khớp worker và reload.
File nghe/screenshot nằm trong `.cache/epic6-demo-*`, không đưa lên GitHub.
Không đánh giá lại chất lượng vocal hoặc tự chạy toàn bài.
Nếu thiếu RAM, lệnh ghi BLOCKED và exit 2 trước khi tạo job. `release:check`
exit 1 khi thiếu bằng chứng local hoặc demo chưa PASS, kể cả fixture đã PASS.

`npm.cmd run verify:clean-node` kiểm tra lại bản cài tách riêng đã có tại
`.cache/epic6-clean-node-20261027` trên máy hiện tại; không phải lệnh cài mới.
Không dùng kết quả này để tuyên bố đã kiểm thử một máy Windows khác.
