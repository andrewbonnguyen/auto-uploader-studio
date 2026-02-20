require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Route kiểm tra server
app.get('/', (req, res) => res.send('AutoUploader Studio Web Service is Running!'));

// Route chính để nhận lệnh upload từ Activepieces/Worker
app.post('/upload-reel', async (req, res) => {
    const { video_url, caption } = req.body;

    if (!video_url) {
        return res.status(400).json({ error: "Missing video_url" });
    }

    try {
        console.log(`Starting upload for: ${video_url}`);

        // Bước 1: Khởi tạo Media Container cho Reels
        // Sử dụng endpoint từ tài liệu Meta: /{ig-user-id}/media
        const initRes = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: video_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creationId = initRes.data.id;
        console.log(`Container created with ID: ${creationId}`);

        // Bước 2: Đăng chính thức (Publish)
        // Lưu ý: Meta cần thời gian xử lý video, logic đơn giản này gọi publish ngay
        // Nếu video nặng, bạn nên tách bước này ra hoặc thêm delay/polling
        setTimeout(async () => {
            try {
                const publishRes = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`, {
                    creation_id: creationId,
                    access_token: ACCESS_TOKEN
                });
                console.log('Successfully published to Instagram!');
            } catch (pError) {
                console.error('Publish Error:', pError.response?.data || pError.message);
            }
        }, 30000); // Tạm dừng 30 giây để Meta xử lý video

        res.status(200).json({
            success: true,
            message: "Upload initiated. Video will be published after processing.",
            creation_id: creationId
        });

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(500).json({
            success: false, 
            error: error.response?.data || "Internal Server Error"
        });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is live on port ${PORT}`);
});
