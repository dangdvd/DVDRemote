# DVD Remote – Điều khiển TV qua Wi-Fi cho iPhone & Android

Ứng dụng điều khiển TV viết bằng **React Native (Expo)**, một mã nguồn chạy trên cả **iPhone (iOS)** và **Android**.
App kết nối trực tiếp với TV qua mạng Wi-Fi nội bộ, dùng đúng giao thức mà các ứng dụng điều khiển chính hãng sử dụng,
nên không cần hồng ngoại (IR) và không cần máy chủ trung gian.

## Hỗ trợ những TV nào?

Mỗi hãng TV dùng một hệ điều hành, và mỗi hệ điều hành có một giao thức điều khiển riêng. App có 4 "driver":

| Giao thức (driver) | Hãng / dòng TV | Cách ghép nối |
| --- | --- | --- |
| **Android TV Remote v2** (giống app Google TV) | Sony Bravia, TCL, Xiaomi (Mi TV / Xiaomi TV chạy Android TV, Google TV), Panasonic (dòng Android TV), Philips, Sharp, Toshiba, Hisense (dòng Android TV), Casper, FFalcon, Nvidia Shield, Chromecast with Google TV… | Nhập **mã 6 ký tự** hiện trên TV (chỉ lần đầu) |
| **LG webOS SSAP** | LG Smart TV webOS 2014 trở lên (cả firmware mới bắt buộc wss:3001) | Bấm **Chấp nhận** trên TV (chỉ lần đầu) |
| **Samsung Tizen** | Samsung Smart TV 2016 trở lên (port 8001 cho 2016–2017, wss:8002 + token cho 2018+) | Bấm **Cho phép** trên TV (chỉ lần đầu) |
| **Xiaomi PatchWall (đời cũ)** | Mi TV / Mi Box đời cũ không có Google TV (HTTP port 6095) | Không cần |

> Lưu ý: Samsung chạy **Tizen** (không phải Android hay webOS) nhưng vẫn được hỗ trợ đầy đủ.

## Tính năng

- **Tự tìm TV trong mạng Wi-Fi**: mDNS (`_androidtvremote2._tcp`) + quét cổng toàn bộ mạng /24 – hoạt động trên cả iOS lẫn Android.
- **Thêm TV thủ công** bằng địa chỉ IP, chọn hãng.
- Bàn phím điều hướng (D-pad) + OK, Home, Back, Menu, Cài đặt, Nguồn vào (Source).
- Âm lượng, tắt tiếng, chuyển kênh (giữ nút để lặp), bàn phím số, 4 nút màu, Info/Guide/Exit.
- Điều khiển phát media: phát/tạm dừng, tua, bài trước/sau.
- **Gõ chữ** từ bàn phím điện thoại (hỗ trợ tiếng Việt có dấu).
- **Touchpad** di chuyển con trỏ (LG webOS, Samsung).
- **Mở nhanh ứng dụng**: YouTube, Netflix, Spotify, Prime Video, Disney+.
- **Bật TV từ chế độ chờ** bằng Wake-on-LAN (tự lấy MAC của LG/Samsung, hoặc nhập tay).
- Ghi nhớ TV và thông tin ghép nối, tự kết nối lại khi mở app.
- Rung phản hồi khi bấm nút, giao diện tối, tiếng Việt.

## Cài đặt & chạy

Yêu cầu: Node.js 20+, và tài khoản [Expo](https://expo.dev) (để build trên cloud) **hoặc** Xcode / Android Studio (để build trên máy).

```bash
npm install
```

App dùng các module native (socket TCP/TLS, mDNS, UDP, OpenSSL) nên **không chạy được trong Expo Go**.
Chọn một trong các cách sau:

### Cách 1 – Build trên cloud với EAS (không cần Xcode/Android Studio)

```bash
npx eas-cli@latest login
# File APK cài thẳng lên điện thoại Android:
npx eas-cli@latest build --platform android --profile preview
# Bản cho iPhone (cần tài khoản Apple Developer):
npx eas-cli@latest build --platform ios --profile preview
```

### Cách 2 – Build và chạy trên máy

```bash
npm run android   # cần Android Studio + điện thoại/emulator
npm run ios       # cần macOS + Xcode
```

### Phát triển

```bash
npx eas-cli@latest build --profile development --platform android   # build dev client một lần
npm start                                                          # sau đó chỉ cần chạy Metro
```

### Phát hành (GitHub Releases)

Workflow `.github/workflows/release.yml` chạy test và build trên mọi pull request vào `main` (file APK/IPA tải được
ở mục *Artifacts* của lần chạy trong tab Actions), và đăng bản phát hành khi có tag phiên bản:

```bash
git tag v1.0.1
git push origin v1.0.1
```

Hoặc vào tab **Actions → Release → Run workflow** và nhập phiên bản (khi workflow đã nằm trên nhánh `main`).

Mỗi bản phát hành gồm:

| File | Dùng để |
| --- | --- |
| `DVDRemote-x.y.z.apk` | Cài trực tiếp trên điện thoại Android |
| `DVDRemote-x.y.z.aab` | Đăng lên Google Play |
| `DVDRemote-x.y.z-unsigned.ipa` | Cài trên iPhone bằng AltStore / Sideloadly / TrollStore (bản chưa ký) |

Phiên bản trong tag (`v1.2.3`) được ghi vào app (versionCode Android / buildNumber iOS = `10203`).

**Khoá ký Android (nên làm):** nếu không cấu hình, APK được ký bằng khoá debug công khai: vẫn cài được, nhưng không
đăng được Google Play. Tạo khoá riêng một lần và lưu vào *Settings → Secrets and variables → Actions* của repo:

```bash
keytool -genkeypair -v -keystore release.keystore -alias dvdremote -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 release.keystore   # dán kết quả vào secret ANDROID_KEYSTORE_BASE64
```

Các secret: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
Giữ file keystore cẩn thận: mất khoá thì không cập nhật được app trên Google Play. Lưu ý: đổi khoá ký thì người dùng
phải gỡ bản cũ trước khi cài bản mới.

**iPhone:** muốn phát hành qua App Store / TestFlight cần tài khoản Apple Developer, dùng
`npx eas-cli build --platform ios --profile production` rồi `npx eas-cli submit --platform ios`.

### Kiểm tra

```bash
npm run typecheck
npm test
```

Bộ test gồm test đơn vị cho mã hoá (protobuf, WebSocket, UTF-8, mã ghép nối…) và **test tích hợp chạy driver thật
với các "TV giả lập"** trên Node: một Android TV giả (TLS + chứng chỉ client, ghép nối mã PIN), một LG webOS giả
(wss:3001 + pointer socket) và một Samsung Tizen giả (ws:8001).

## Hướng dẫn sử dụng

1. Điện thoại và TV phải dùng **chung một mạng Wi-Fi**. Bật TV.
2. Mở app → **Tìm TV** (hoặc **Thêm bằng IP**: xem IP trong Cài đặt → Mạng của TV).
3. Chạm vào TV để kết nối:
   - **Android TV / Google TV**: TV hiện mã 6 ký tự → nhập vào điện thoại.
   - **LG**: chọn *Chấp nhận* trên TV.
   - **Samsung**: chọn *Cho phép* trên TV.
4. Nhấn giữ một TV trong danh sách để xoá hoặc bật TV bằng Wake-on-LAN.

### Mẹo khi không kết nối được

- **Android TV**: ứng dụng hệ thống *Android TV Remote Service* phải có trên TV (có sẵn trên hầu hết TV). Nếu ghép nối lỗi
  liên tục: Cài đặt → Ứng dụng → Hiện ứng dụng hệ thống → Android TV Remote Service → Xoá dữ liệu.
- **LG**: bật *Cài đặt → Kết nối → LG Connect Apps* (tên có thể khác tuỳ đời TV). Để bật TV từ chế độ chờ, bật
  *Turn on via Wi-Fi / Mobile TV On*.
- **Samsung**: nếu lỡ bấm *Từ chối*, vào *Cài đặt → Chung → Trình quản lý thiết bị ngoài → Trình quản lý kết nối thiết bị*
  để cho phép lại. Bật *Power On with Mobile* để dùng Wake-on-LAN.
- **iPhone**: lần đầu app sẽ xin quyền *Mạng cục bộ* – hãy chọn *Cho phép* (nếu lỡ từ chối: Cài đặt → Quyền riêng tư →
  Mạng cục bộ).

## Kiến trúc

```
App.tsx                      Điều hướng giữa danh sách TV và màn hình remote
src/core/                    Kiểu dữ liệu chung, protobuf tối giản, xử lý byte/UTF-8
src/net/                     Socket TCP/TLS, WebSocket client tự viết, Wake-on-LAN, sinh khoá RSA
src/drivers/androidtv/       Android TV Remote v2: chứng chỉ client, ghép nối (port 6467), điều khiển (port 6466)
src/drivers/webos.ts         LG webOS (SSAP qua WebSocket + pointer socket)
src/drivers/tizen.ts         Samsung Tizen (WebSocket samsung.remote.control)
src/drivers/xiaomi-legacy.ts Xiaomi PatchWall đời cũ (HTTP 6095)
src/discovery/               Tìm TV: mDNS + quét cổng
src/ui/                      Giao diện: danh sách TV, remote, touchpad, hộp nhập mã
__tests__/                   Test đơn vị + TV giả lập cho test tích hợp
plugins/                     Config plugin Expo (ký APK bản phát hành)
scripts/set-version.js       Ghi phiên bản từ tag vào app.json
.github/workflows/release.yml Build APK/AAB/IPA và đăng GitHub Releases
```

Mọi driver cài đặt cùng một interface `TvDriver` (`src/core/types.ts`), nên giao diện không phụ thuộc vào hãng TV.
Thêm một hãng mới chỉ cần viết thêm một driver và khai báo trong `src/drivers/index.ts`.

Vì sao tự viết WebSocket? TV LG đời mới (wss:3001) và Samsung 2018+ (wss:8002) dùng chứng chỉ tự ký, WebSocket có sẵn
của React Native sẽ từ chối kết nối. App tự cài đặt WebSocket (RFC 6455) trên socket TLS của `react-native-tcp-socket`.

## Giới hạn đã biết

- **Wake-on-LAN trên iPhone**: Apple chỉ cho gửi gói broadcast khi app có entitlement
  `com.apple.developer.networking.multicast` (phải xin Apple duyệt). Khi được duyệt, thêm entitlement đó vào
  `ios.entitlements` trong `app.json`. Trên Android không cần.
- TV Samsung trước 2016 (Orsay, port 55000), Panasonic chạy My Home Screen / Fire TV, Roku TV chưa được hỗ trợ.
- Nhập văn bản trên Android TV chỉ hoạt động khi trên TV đang mở ô nhập liệu; với Samsung cần mở bàn phím ảo trên TV.
- Mã ứng dụng (YouTube, Netflix…) có thể khác nhau tuỳ khu vực/đời TV.
