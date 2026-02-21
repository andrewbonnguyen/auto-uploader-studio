require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const passport = require('passport');
const FacebookStrategy = require('passport-facebook').Strategy;
const session = require('express-session');

const app = express();

// --- 1. Cấu hình Middleware & Session ---
app.use(express.json());
app.use(session({
    secret: 'gridbon_studio_secret',
    resave: false,
    saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// --- 2. Cấu hình Facebook Strategy (Dành cho App Authentication) ---
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "https://auto-uploader-studio.onrender.com/auth/facebook/callback",
    profileFields: ['id', 'displayName']
  },
  (accessToken, refreshToken, profile, done) => {
    // Token này được log ra console của Render để bạn có thể lấy dùng lâu dài
    console.log("New Access Token generated from Login:", accessToken);
    profile.token = accessToken;
    return done(null, profile);
  }
));

// --- 3. Hàm bổ trợ hiển thị nội dung file Markdown ---
const renderHTMLContent = (fileName, title, res) => {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return res.send(`
            <html>
                <head><title>${title}</title><style>body{font-family:sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:auto;background:#f9f9f9;}</style></head>
                <body><div style="background:white;padding:30px;border-radius:8px;box-shadow:0 2px 5px rgba(0,0,0,0.1)">${content.replace(/\n/g, '<br>')}</div></body>
            </html>
        `);
    }
    res.status(404).send(`File ${fileName} không tồn tại trên server.`);
};

// --- 4. ROUTES PHÁP LÝ & REVIEW (Bắt buộc cho Meta App Review) ---
app.get('/', (req, res) => res.send('AutoUploader Studio Web Service is Running!'));

app.get('/privacy', (req, res) => renderHTMLContent('PRIVACY_POLICY.md', 'Privacy Policy', res));
app.get('/terms', (req, res) => renderHTMLContent('TERMS_OF_SERVICE.md', 'Terms of Service', res));
app.get('/review-desc', (req, res) => renderHTMLContent('APP_REVIEW_DESCRIPTION.md', 'App Review Info', res));

// --- 5. ROUTES XÁC THỰC FACEBOOK (Dành cho Meta Login) ---
app.get('/auth/facebook', passport.authenticate('facebook', { 
    scope: ['pages_show_list', 'instagram_basic', 'instagram_content_publish', 'pages_read_engagement'] 
}));

app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (req, res) => {
        res.send('<h2>Xác thực thành công!</h2><p>Mã token mới đã được ghi nhận trong hệ thống console.</p>');
    }
);

// Biến cấu hình lấy từ Render Environment
const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

// --- 6. ROUTE TEST: ĐĂNG ẢNH LÊN INSTAGRAM (DÙNG ĐỂ KIỂM TRA KẾT NỐI) ---
// Truy cập: https://auto-uploader-studio.onrender.com/test-publish
app.get('/test-publish', async (req, res) => {
    if (!IG_USER_ID || !ACCESS_TOKEN) {
        return res.status(500).json({ error: "Thiếu cấu hình INSTAGRAM_USER_ID hoặc ACCESS_TOKEN trên Render." });
    }

    try {
        console.log(`--- Test Publish started for ID: ${IG_USER_ID} ---`);

        // Bước 1: Tạo container cho ảnh mẫu
        const containerRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
            image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000',
            caption: 'Auto-test from Gridbon AutoUploader Studio! 🚀',
            access_token: ACCESS_TOKEN
        });

        const creationId = containerRes.data.id;

        // Bước 2: Publish ngay lập tức
        const publishRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
            creation_id: creationId,
            access_token: ACCESS_TOKEN
        });

        res.json({
            success: true,
            message: "Bài viết test đã đăng thành công lên Instagram!",
            media_id: publishRes.data.id
        });

    } catch (error) {
        console.error('Test Route Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// --- 7. LOGIC UPLOAD REELS (Dành cho API Request) ---
app.post('/upload-reel', async (req, res) => {
    const { video_url, caption } = req.body;

    if (!video_url) {
        return res.status(400).json({ error: "Missing video_url" });
    }

    try {
        console.log(`Processing Reel: ${video_url}`);

        // Bước 1: Khởi tạo Reels Container
        const initRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: video_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creationId = initRes.data.id;
        
        // Bước 2: Đợi 30 giây để video được xử lý rồi mới Publish
        setTimeout(async () => {
            try {
                await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
                    creation_id: creationId,
                    access_token: ACCESS_TOKEN
                });
                console.log(`Published Reel successfully: ${creationId}`);
            } catch (pError) {
                console.error('Publish Error Detail:', pError.response?.data || pError.message);
            }
        }, 30000);

        res.status(200).json({ success: true, creation_id: creationId });

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || "Internal Server Error" });
    }
});

// --- 8. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`>>> AutoUploader Studio is Live on port ${PORT}`);
});
