# Anki Vocabulary Helper Extension

Extension Chrome giúp thêm từ vựng tiếng Anh vào Anki một cách nhanh chóng với dịch nghĩa tiếng Việt, phiên âm IPA, ví dụ và âm thanh.

## 🚀 Tính năng

- **Thêm từ vựng nhanh**: Chọn từ trên trang web và thêm vào Anki qua context menu
- **Tự động dịch**: Sử dụng Gemini AI để dịch nghĩa tiếng Việt
- **Thông tin đầy đủ**: IPA, loại từ, ví dụ, âm thanh phát âm
- **Cloze Cards**: Tạo thẻ học với từ bị che một phần
- **Tùy chỉnh nghĩa**: Có thể nhập nghĩa tiếng Việt tùy chỉnh
- **Âm thanh**: Tự động tải và lưu file âm thanh từ nhiều nguồn

## 📋 Yêu cầu hệ thống

- **Anki Desktop** phiên bản 2.1.20 trở lên
- **AnkiConnect Add-on** 
- **Google Chrome** hoặc trình duyệt tương thích
- **Gemini API Key** (miễn phí từ Google AI Studio)

## 🔧 Hướng dẫn cài đặt

### Bước 1: Cài đặt Anki Desktop

#### Windows/Mac/Linux:
1. Truy cập [https://apps.ankiweb.net/](https://apps.ankiweb.net/)
2. Tải Anki Desktop cho hệ điều hành của bạn
3. Chạy file cài đặt và làm theo hướng dẫn

#### Ubuntu/Debian:
```bash
sudo apt update
sudo apt install anki
```

#### Arch Linux:
```bash
sudo pacman -S anki
```

#### Hoặc sử dụng Flatpak (tất cả Linux distros):
```bash
flatpak install flathub net.ankiweb.Anki
```

### Bước 2: Cài đặt AnkiConnect Add-on

AnkiConnect là add-on cho phép extension kết nối với Anki.

1. **Mở Anki Desktop**
2. **Vào Tools → Add-ons**
3. **Click "Get Add-ons..."**
4. **Nhập code**: `2055492159`
5. **Click "OK"** và chờ tải xuống
6. **Restart Anki** để kích hoạt add-on

#### Hoặc cài đặt thủ công:
1. Tải AnkiConnect từ: [https://ankiweb.net/shared/info/2055492159](https://ankiweb.net/shared/info/2055492159)
2. Vào **Tools → Add-ons → Install from file**
3. Chọn file `.ankiaddon` đã tải
4. Restart Anki

### Bước 3: Cấu hình AnkiConnect

1. **Mở Anki Desktop**
2. **Vào Tools → Add-ons**
3. **Chọn AnkiConnect** và click **Config**
4. **Đảm bảo cấu hình như sau**:
```json
{
    "apiKey": null,
    "apiLogPath": null,
    "webBindAddress": "127.0.0.1",
    "webBindPort": 8765,
    "webCorsOriginList": [
        "http://localhost",
        "https://localhost",
        "moz-extension://*",
        "chrome-extension://*"
    ]
}
```
5. **Click "OK"** và restart Anki

### Bước 4: Lấy Gemini API Key

1. **Truy cập**: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. **Đăng nhập** bằng tài khoản Google
3. **Click "Create API Key"**
4. **Chọn project** hoặc tạo mới
5. **Copy API Key** để sử dụng trong extension

> **Lưu ý**: Gemini API có quota miễn phí hàng tháng. Kiểm tra [pricing](https://ai.google.dev/pricing) để biết chi tiết.

### Bước 5: Cài đặt Extension

#### Cài từ Chrome Web Store (chưa có):
*Extension chưa được publish lên store*

#### Cài từ source code:
1. **Tải source code** về máy
2. **Mở Chrome** → **Settings** → **Extensions**
3. **Bật "Developer mode"** ở góc trên bên phải
4. **Click "Load unpacked"**
5. **Chọn thư mục** chứa extension
6. Extension sẽ xuất hiện trong danh sách

### Bước 6: Cấu hình Extension

1. **Click vào icon extension** trên thanh công cụ Chrome
2. **Chọn "Options"** hoặc click chuột phải → **Options**
3. **Nhập Gemini API Key** đã lấy ở bước 4
4. **Nhập tên Deck** (mặc định: "English Vocabulary")
5. **Click "Lưu"**

## 📖 Hướng dẫn sử dụng

### Thêm từ vựng cơ bản:
1. **Chọn từ/cụm từ** trên bất kỳ trang web nào
2. **Click chuột phải** → **"Add to Anki"**
3. Extension sẽ:
   - Tự động dịch nghĩa tiếng Việt
   - Tạo thẻ học với đầy đủ thông tin
   - Thêm vào deck đã cấu hình

### Thêm từ với nghĩa tùy chỉnh:
1. **Chọn từ/cụm từ**
2. **Click chuột phải** → **"Add to Anki with input Vietnamese meaning"**
3. **Nhập nghĩa tiếng Việt** trong popup
4. **Click "OK"**

### Thông tin thẻ học bao gồm:
- **Từ gốc** và **từ có cloze** (che một phần)
- **Nghĩa tiếng Việt** và **nghĩa có cloze**
- **Phiên âm IPA**
- **Loại từ** (noun, verb, adjective...)
- **Ví dụ** tiếng Anh và tiếng Việt
- **File âm thanh** phát âm
- **Chia âm tiết**

## ⚙️ Cấu hình nâng cao

### Thay đổi port AnkiConnect:
Nếu port 8765 bị conflict, có thể thay đổi trong AnkiConnect config và đảm bảo Anki đang chạy.

### Sử dụng deck khác:
1. Vào **Options** của extension
2. Thay đổi **Deck Name**
3. Deck sẽ được tạo tự động nếu chưa tồn tại

### Tùy chỉnh card template:
Extension tự động tạo note type "English Vocab Cloze Template 1.0". Có thể tùy chỉnh trong Anki:
1. **Tools → Manage Note Types**
2. **Chọn note type** và click **Cards**
3. **Chỉnh sửa** Front/Back template theo ý muốn

## 🔍 Xử lý sự cố

### Extension không hoạt động:
1. **Kiểm tra Anki** đang chạy
2. **Kiểm tra AnkiConnect** đã được cài và kích hoạt
3. **Kiểm tra Gemini API Key** còn quota
4. **Kiểm tra console** Chrome (F12) để xem lỗi

### Không thể kết nối Anki:
1. **Đảm bảo Anki Desktop** đang chạy
2. **Kiểm tra AnkiConnect config** có đúng port 8765
3. **Restart Anki** nếu cần
4. **Kiểm tra firewall** không chặn port 8765

### Lỗi Gemini API:
1. **Kiểm tra API Key** đã nhập đúng
2. **Kiểm tra quota** còn lại tại [Google AI Studio](https://aistudio.google.com/)
3. **Thử tạo API Key mới** nếu cần

### Không có âm thanh:
- Extension sẽ thử tải từ nhiều nguồn khác nhau
- Nếu không tải được, thẻ vẫn được tạo nhưng không có file âm thanh
- Có thể thêm âm thanh thủ công sau

## 🤝 Đóng góp

Mọi đóng góp đều được chào đón! Hãy:
1. Fork repository
2. Tạo feature branch
3. Commit changes
4. Tạo Pull Request

## 📄 License

MIT License - xem file LICENSE để biết chi tiết.

## ⭐ Hỗ trợ

Nếu extension hữu ích, hãy:
- ⭐ Star repository
- 🐛 Báo cáo bug qua Issues
- 💡 Đề xuất tính năng mới
- 📝 Đóng góp documentation

---

**Chúc bạn học tiếng Anh hiệu quả với Anki! 🎯**