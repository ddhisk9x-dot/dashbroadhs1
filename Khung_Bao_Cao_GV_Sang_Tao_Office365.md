# KHUNG BÁO CÁO GIÁO VIÊN SÁNG TẠO

**TÊN ĐỀ TÀI DỰ KIẾN:** 
*Xây dựng hệ thống quản trị học tập điểm số (Dashboard) và tư vấn cá nhân hóa tích hợp Trí tuệ Nhân tạo (GenAI) lấy dữ liệu từ hệ sinh thái Office 365.*

---

## PHẦN 1: ĐẶT VẤN ĐỀ VÀ KHOẢNG TRỐNG THỰC TIỄN

**1.1. Bối cảnh thực tiễn của nhà trường**
- **Sự khó khăn trong khai thác dữ liệu:** Việc sử dụng các bảng tính Excel truyền thống (do Office 365 cấp) giải quyết được nhu cầu lưu trữ điểm số, tuy nhiên dữ liệu này mang tính "đóng". Quản lý, giáo viên chủ nhiệm (GVCN) tốn rất nhiều thời gian phân tích thủ công để viết đánh giá cuối tháng cho từng học sinh, gặp khó khăn lớn khi sĩ số lớp đông.
- **Góc nhìn học sinh:** Thông báo điểm số thường mang tính gián đoạn (cuối tháng/cuối kỳ), thiếu một lăng kính (Dashboard) trực quan giúp học sinh nhìn nhận được sự tiến bộ hay sa sút của mình một cách liên tục.

**1.2. Khung năng lực tự học (SRL) trong phân tích dữ liệu (Learning Analytics)**
- Khung năng lực tự học (Self-Regulated Learning - SRL) nhấn mạnh thành tố cốt lõi là sự "tự đánh giá" (Self-reflection). Một giao diện Dashboard cho phép học sinh theo dõi sự thay đổi năng lực qua biểu đồ là công cụ đắc lực nuôi dưỡng nhận thức học tập, chuyển từ thụ động nhận điểm sang chủ động điều chỉnh kế hoạch học tập.

**1.3. Nghiên cứu về AI trong giáo dục: Ranh giới của sự tự động hóa**
- Việc ứng dụng Trí tuệ nhân tạo (GenAI) sinh ra không phải để thay thế quyết định sư phạm của giáo viên, mà đóng vai trò như một "trợ lý phân tích dữ liệu". AI có thể đọc chuỗi điểm số, xác định xu hướng (tăng/giảm/dàn trải) và đề xuất **hành động học tập cá nhân hóa** (Study Actions), còn giáo viên duy trì quyền làm chủ và duyệt nháp cuối cùng.

**1.4. Vấn đề nghiên cứu cốt lõi**
- Làm thế nào để xây dựng một hệ thống phần mềm tinh gọn, vừa tận dụng linh hoạt cơ sở hạ tầng Dữ liệu (Enterprise Data) sẵn có của nhà trường là **Office 365 (Microsoft 365/Excel Online)**, mà lại vừa mang tới giao diện hiện đại, tích hợp AI phân tích sâu nhưng không làm mất đi tính nguyên bản sư phạm?

---

## PHẦN 2: THIẾT KẾ VÀ KIẾN TRÚC CỦA "DEEP DASHBOARD"

**2.1. Kiến trúc hệ thống lai (Hybrid Architecture) và Cấu trúc Dữ liệu**
- **Nguồn cấp dữ liệu bảo mật (Database Layer):** Sử dụng hệ sinh thái Office 365 nội bộ (nhóm tài khoản @edu.vn của nhà trường) thông qua Excel Online để làm nơi lưu trữ kết quả đầu vào.
- **Cầu nối API (Middleware Layer):** Hoạt động trên nền tảng Serverless, ứng dụng Microsoft Graph API (hoặc Power Automate/Office Scripts) để trích xuất dữ liệu tự động mà vẫn tuân thủ theo tiêu chuẩn bảo mật danh tính tuyệt đối của Microsoft Entra ID. Việc lấy dữ liệu nằm trong quyền kiểm soát nội bộ nhằm ngăn ngừa rò rỉ điểm số ra bên thứ ba.
- **Giao diện & Logic Tương tác (Frontend Layer):** Xây dựng hệ thống Web App hiển thị sử dụng công nghệ Next.js và Tailwind CSS. Tích hợp thư viện biểu đồ trực quan đa chiều (`recharts`). Hệ thống logic phân nhóm quyền hạng người dùng thành lập: Quản trị viên (`ADMIN`), Giáo viên (`TEACHER`), và Học sinh (`STUDENT`).

**2.2. Luồng Trải nghiệm Người dùng (UX/UI flow) và Tác động Sư phạm**
- **Góc nhìn Giáo viên (Teacher View):**
  - Cung cấp thao tác đưa biểu điểm hàng loạt đến mô hình AI Xử lý (`aiReport`).
  - Hệ thống tự động phân tích và sinh ra đoạn đánh giá thái độ/học lực cùng các đề xuất chiến lược hỗ trợ dành riêng cho từng em.
  - GVCN đọc, kiểm duyệt, sửa đổi nếu cần và phát hành (Publish).
- **Góc nhìn Học sinh (Student View):**
  - Cung cấp biểu đồ đồ thị sự tăng trưởng điểm số, vị trí tương đối với lớp.
  - **Danh mục Check-list năng động (Active Actions / Task Ticks):** Dựa trên đánh giá của AI, học sinh nhận các nhiệm vụ cố định (ví dụ: làm 5 bài toán khó đại số, ôn kỹ chương 2). Học sinh phải tích `completed` sau mỗi ngày làm xong.

---

## PHẦN 3: TRIỂN KHAI VÀ ĐÁNH GIÁ THỰC NGHIỆM

**3.1. Phương pháp thu thập dữ liệu thực nghiệm**
- Thí điểm áp dụng Dashboard cho một cụm học sinh nhất định (1-2 lớp).
- Thu thập dữ liệu sử dụng thông qua Tần suất hoàn thành nhiệm vụ (task completion rate).

**3.2. Hiệu quả đối với Giáo viên (Đo lường năng suất)**
- **Giảm khối lượng công việc hành chính:** Khảo sát đánh giá so sánh thời gian trước và sau khi sử dụng hệ thống khi phải lên đánh giá học tập trong đợt kiểm tra chung.
- **Độ sâu sát:** Đánh giá từ tập GVCN về chất lượng phân tích của AI (mang tính chi tiết, cá nhân hóa đến từng cá nhân thay vì nhận xét "văn mẫu" dập khuôn).

**3.3. Hiệu quả đối với Học sinh (Đo lường động lực - Nội lực hóa SRL)**
- Đánh giá sự tăng cường phản xạ ghi nhận tiến trình học (nhìn vào việc tích hoạt động 'completed').
- Lấy phiếu điều tra về sự hài lòng và tính định hướng hành động (Actionable Insights) do báo cáo gửi về.

---

## PHẦN 4: KẾT LUẬN VÀ KHUYẾN NGHỊ BÀI HỌC

**4.1. Khẳng định hiệu quả của công nghệ**
- Minh chứng tính khả thi của trường học thông minh "Data-driven education" (Giáo dục dựa trên Dữ liệu). Sử dụng kiến trúc hiện đại để tăng giá trị của tài sản dữ liệu vốn đã có của nhà trường (hệ sinh thái Office 365).

**4.2. Khả năng nhân rộng và đóng gói linh hoạt**
- Dự án `deep-dashboard-next` sở hữu cấu trúc API và biến số nội tại dễ dàng đóng gói (ví dụ các bộ setting môi trường `docs-assembler-config.json`).
- Có tiềm năng trở thành "plug-in" mềm dẻo cho bất kỳ trường học nào sử dụng Google Workspace lẫn Office 365 mà không cần đập bỏ quy trình làm việc hiện hữu của giáo viên bộ môn.

**4.3. Đề xuất hoàn thiện xa hơn**
- Triển khai tính năng cảnh báo (Early Warning) dành riêng cho HS có nguy cơ rớt hạng, liên thông dữ liệu với LMS của trường.
