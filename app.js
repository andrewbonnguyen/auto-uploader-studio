require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();

app.use(express.json());

const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// Hàm bổ trợ để đọc file và hiển thị dưới dạng văn bản thuần (hoặc HTML đơn giản)
const renderFileContent = (fileName, res) => {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(content);
    }
    res.status(404).send(`File ${fileName} not found.`);
};

// --- ROUTES HIỂN THỊ NỘI DUNG VĂN BẢN ---

app.get('/', (req, res) => res.send('AutoUploader Studio Web Service is Running!'));

// Route hiển thị Privacy Policy
app.get('/privacy', (req, res) => renderFileContent('PRIVACY_POLICY.md', res));

// Route hiển thị Terms of Service
app.get('/terms', (req, res) => renderFileContent('TERMS_OF_SERVICE.md', res));

// Route hiển thị App Review Description
app.get('/review-desc', (req, res) => renderFileContent('APP_REVIEW_DESCRIPTION.md', res));


// --- LOGIC UPLOAD VIDEO ---

app.post('/upload-reel', async (req, res) => {
    const { video_url, caption } = req.body;

    if (!video_url) {
        return res.status(400).json({ error: "Missing video_url" });
    }

    try {
        console.log(`Starting upload for: ${video_url}`);

        // Bước 1: Khởi tạo Media Container cho Reels
        const initRes = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: video_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creationId = initRes.data.id;
        console.log(`Container created with ID: ${creationId}`);

        // Bước 2: Đăng chính thức (Publish) sau khi Meta xử lý
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
        }, 30000); // 30s delay để Meta encode video

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
