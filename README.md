# 🎮 Arcade Nexus: Cyberpunk Game Hub & Client-Side AI

Chào mừng bạn đến với **Arcade Nexus (Game Hub)** — Cổng trò chơi điện tử retro mang phong cách đồ họa Neon / Cyberpunk tích hợp Trí Tuệ Nhân Tạo (AI) học sâu trực tiếp trên trình duyệt của bạn!

Dự án được xây dựng trên nền tảng **Next.js**, **TypeScript** và **Vanilla CSS** với hiệu năng render Canvas mượt mà 60 FPS cùng âm thanh điện tử độc đáo.

---

## 🚀 Điểm nhấn Công nghệ: Tron Snake & Học Máy Tăng Cường (DQN AI)

Trò chơi **Tron Snake** không chỉ là một game rắn săn mồi thông thường mà là một **phòng thí nghiệm Trí tuệ nhân tạo (Reinforcement Learning)** hoạt động hoàn toàn ở phía Client (trình duyệt) thông qua thư viện **TensorFlow.js**.

### 🧠 Cơ chế hoạt động của AI Rắn:
AI học chơi game từ con số 0 bằng phương pháp thử - sai (Trial and Error) thông qua thuật toán học sâu **Deep Q-Network (DQN)**:

*   **Bộ não Mạng thần kinh nơ-ron (Neural Network)**: Mạng Sequential gồm 3 tầng với **10,371 bánh răng tham số (weights)**:
    *   *Tầng đầu vào (Input)*: **15 thông số** nhận diện trạng thái thế giới (State Vector).
    *   *Tầng ẩn (Hidden Layers)*: 2 tầng lần lượt gồm **128** và **64** nơ-ron liên kết đầy đủ.
    *   *Tầng đầu ra (Output)*: **3 hành động** di chuyển tương đối (`Đi thẳng`, `Rẽ trái`, `Rẽ phải`).
*   **Véc-tơ Trạng thái 15 chiều (15-Dimensional State Vector)**:
    1.  *Danger Straight/Left/Right (3 chiều)*: Khoảng cách vật lý báo động nguy hiểm va chạm tường hoặc thân mình.
    2.  *Current Direction (4 chiều)*: Hướng di chuyển hiện tại (`Lên`, `Xuống`, `Trái`, `Phải`).
    3.  *Food Location (4 chiều)*: Vị trí tương đối của quả táo so với đầu rắn (`Phía trên`, `Phía dưới`, `Bên trái`, `Bên phải`).
    4.  *Reachable Space (3 chiều)*: Sử dụng thuật toán **BFS / Flood Fill** tính toán thời gian thực phần trăm không gian trống khả dụng ở 3 hướng đi trước mắt, giúp rắn tuyệt đối né tránh các ngõ cụt.
    5.  *Fill Ratio (1 chiều - Mới!)*: Tỷ lệ lấp đầy của cơ thể rắn trên bản đồ (`Độ dài thân / Diện tích lưới`), giúp AI tự động điều chỉnh chiến thuật từ săn mồi (khi rắn ngắn) sang bảo thủ né tránh (khi rắn dài ra chiếm dụng bản đồ).
*   **Tăng tốc phần cứng GPU WebGL**: Toàn bộ quá trình tính toán đạo hàm ngược (Backpropagation) và cập nhật ma trận trọng số được tính toán trực tiếp trên **GPU** của bạn thông qua WebGL backend của TensorFlow.js, giúp CPU chính hoàn toàn rảnh rỗi và giữ game mượt mà 60 FPS ngay cả khi huấn luyện ở tốc độ cao.
*   **Bảng mạch trực quan bộ não (Interactive Brain Visualizer)**: Sơ đồ mạng nơ-ron thời gian thực hiển thị mức độ kích hoạt của 15 tín hiệu đầu vào, các luồng xung điện truyền dẫn qua khớp thần kinh (synapse) và giá trị kỳ vọng (Q-value) của các quyết định rẽ hướng.
*   **Nút chuyển đổi AI Exploration (Khám phá vs Lý trí)**:
    *   `AI EXPLORATION: ON`: AI kết hợp đi ngẫu nhiên ($\epsilon$-greedy) để tự khám phá chiến thuật mới. Phù hợp khi **huấn luyện (training)**.
    *   `AI EXPLORATION: OFF`: Tắt hoàn toàn đi bừa, AI đưa ra quyết định dựa trên 100% kinh nghiệm đỉnh cao đã học (Pure Exploitation). Giúp rắn biểu diễn lấy điểm tối đa mà không bị chết nhảm do Epsilon ngẫu nhiên.

---

## 🕹️ Danh sách các trò chơi khác trong Hub

### 1. 🚀 Neon Flapper (Cyberpunk Flappy Bird)
Trải nghiệm bay không giới hạn qua các chướng ngại vật neon chớp nháy:
*   Vật lý rơi tự do mượt mà với cảm giác phản hồi lực đẩy tốt.
*   Hiệu ứng ánh sáng Neon tỏa sáng rực rỡ và bám đuôi theo di chuyển của nhân vật.
*   Tốc độ trò chơi tăng dần theo thời gian tạo cảm giác thử thách.

### 2. 🧊 Synth Block (Neon Block Blast)
Tựa game xếp khối neon mang tính gây nghiện cao:
*   Cơ chế kéo thả tối ưu, hiển thị bóng ảo (Shadow Preview) trước khi hạ khối.
*   Vật lý rơi tự do (Gravity Collapse): Khi chết game và chơi lại, các khối gạch cũ sẽ rơi lả tả theo trọng lực.
*   Vỡ hàng/cột đi kèm sóng xung kích (Explosion Wave) và bụi hạt lấp lánh rực rỡ.

### 3. 🏎️ Grid Rider (GTA Style Endless Chill Drive)
Trải nghiệm lái siêu xe Hypercar Bugatti Chiron/Porsche 911 chạy bất tận trong đêm đô thị mờ ảo:
*   Mô phỏng vật lý lốp nghiêng thể thao (Negative Camber `/ \`), gai lốp chuyển động cuộn tròn và lazang xoay mâm theo tốc độ thực.
*   Đĩa phanh gốm Carbon phát sáng cam đỏ rực lửa khi phanh gấp.
*   Cánh gió chủ động (Active Spoiler) nâng cao theo tốc độ và gập nghiêng thành phanh khí động học (Airbrake) khi nhấn phanh.
*   Hiệu ứng phản quang Moon Specular Highlight chạy dọc thân vỏ xe khi vào cua.

### 4. 💥 Stack Ball (3D Helix Smash)
Đập phá tháp đĩa tròn xoay được mô phỏng giả lập 3D trên Canvas 2D:
*   Cơ chế Z-Sorting phân tầng vẽ đĩa trước/sau cột trung tâm giúp tháp đĩa quay tròn tự nhiên.
*   **6 loại Skins cao cấp**: Neon Orb, Magma Core, Matrix Cube, Saturn Ring, Disco Glitter, Plasma Arc mang các hiệu ứng hạt vật lý đặc trưng (mưa mã nhị phân, tia sét plasma, bụi sao tinh vân, tia laser disco).
*   Chế độ Fever Mode cuồng nộ hủy diệt đĩa đen đi kèm hiệu ứng thay đổi theo từng Skin.

### 5. 🪲 Bug Hunter (Retro Space Invaders)
Trò chơi bắn súng phản xạ diệt Drone phá hoại hệ thống:
*   Tích hợp hệ thống tính điểm liên hoàn (Combo Multiplier) tăng độ kịch tính.
*   Nhiều chủng loại Drone từ nhỏ gọn nhanh nhẹn đến Tanker khổng lồ nhiều máu.

---

## 🔊 Động cơ âm thanh điện tử (AudioSynth)
Toàn bộ trò chơi sử dụng một bộ tổng hợp tần số âm thanh tùy biến (`AudioSynth.ts`) viết bằng **Web Audio API**:
*   Âm thanh được render trước (Pre-render) thành dạng sóng PCM thô lưu vào buffer giúp phát ra với độ trễ bằng 0, giải quyết triệt để hiện tượng trễ tiếng khi kết nối loa Bluetooth.
*   Sử dụng dạng sóng Sine và Triangle dịu tai, tinh chỉnh cường độ vừa phải chống chói khi chơi thời gian dài.

---

## 🛠️ Hướng dẫn khởi chạy dự án tại Local

Yêu cầu máy tính đã cài đặt **Node.js** (Phiên bản 18+ khuyến nghị).

1.  **Clone mã nguồn dự án**:
    ```bash
    git clone https://github.com/Kdz198/Game-Hub.git
    cd Game-Hub/game-hub
    ```

2.  **Cài đặt các thư viện phụ thuộc (Dependencies)**:
    ```bash
    npm install
    ```

3.  **Chạy server phát triển (Development mode)**:
    ```bash
    npm run dev
    ```
    Mở trình duyệt truy cập đường dẫn: [http://localhost:3000](http://localhost:3000)

4.  **Biên dịch sản phẩm tối ưu (Production Build)**:
    ```bash
    npm run build
    ```

---

*Dự án được phát triển và tối ưu hóa bởi **Antigravity AI Pair Programmer** cùng **Kdz198**.*
