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
