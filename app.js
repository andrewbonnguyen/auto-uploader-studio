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
    console.log("New Access Token from Login:", accessToken);
    profile.token = accessToken;
    return done(null, profile);
  }
));

// --- 3. Hàm bổ trợ hiển thị nội dung Markdown ---
const renderHTMLContent = (fileName, title, res) => {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return res.send(`
            <html>
                <head>
                    <title>${title}</title>
                    <style>
                        body{font-family:sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:auto;background:#f4f7f6;}
                        .container{background:white;padding:30px;border-radius:10px;box-shadow:0 4px 6px rgba(0,0,0,0.1);}
                        h1{color:#2c3e50;}
                    </style>
                </head>
                <body>
                    <div class="container">
                        <h1>${title}</h1>
                        <hr>
                        ${content.replace(/\n/g, '<br>')}
                    </div>
                </body>
            </html>
        `);
    }
    res.status(404).send(`File ${fileName} không tồn tại trên server.`);
};

// --- 4. ROUTES PHÁP LÝ & REVIEW (Bắt buộc cho Meta Review) ---
app.get('/', (req, res) => res.send('AutoUploader Studio Web Service is Running!'));
app.get('/privacy', (req, res) => renderHTMLContent('PRIVACY_POLICY.md', 'Privacy Policy', res));
app.get('/terms', (req, res) => renderHTMLContent('TERMS_OF_SERVICE.md', 'Terms of Service', res));
app.get('/review-desc', (req, res) => renderHTMLContent('APP_REVIEW_DESCRIPTION.md', 'App Review Info', res));

// --- 5. ROUTES XÁC THỰC FACEBOOK ---
app.get('/auth/facebook', passport.authenticate('facebook', { 
    scope: ['pages_show_list', 'instagram_basic', 'instagram_content_publish', 'pages_read_engagement'] 
}));

app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (req, res) => {
        res.send('<h2>Xác thực thành công!</h2><p>Ứng dụng đã được cấp quyền. Bạn có thể kiểm tra Log trên Render để lấy Token.</p>');
    }
);

// --- 6. ROUTE TEST: ĐĂNG ẢNH LÊN INSTAGRAM (CÓ CƠ CHẾ ĐỢI XỬ LÝ) ---
// Đường dẫn: https://auto-uploader-studio.onrender.com/test-publish
app.get('/test-publish', async (req, res) => {
    const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
    const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

    if (!IG_USER_ID || !ACCESS_TOKEN) {
        return res.status(500).json({ error: "Chưa cấu hình INSTAGRAM_USER_ID hoặc ACCESS_TOKEN trên Render!" });
    }

    try {
        console.log(`[TEST] Đang khởi tạo Container cho ID: ${IG_USER_ID}`);

        // Bước 1: Gửi yêu cầu tạo Container
        const containerRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
            image_url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1000',
            caption: 'Test post từ AutoUploader Studio (Auto-delay mode) 🚀',
            access_token: ACCESS_TOKEN
        });

        const creationId = containerRes.data.id;
        console.log(`[TEST] Container created: ${creationId}. Waiting 15s for processing...`);

        // Bước 2: Đặt lịch Publish sau 15 giây để Meta kịp xử lý ảnh
        setTimeout(async () => {
            try {
                const publishRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
                    creation_id: creationId,
                    access_token: ACCESS_TOKEN
                });
                console.log(`[TEST] 🎉 Đã đăng bài thành công! Media ID: ${publishRes.data.id}`);
            } catch (pError) {
                console.error('[TEST] Lỗi khi Publish:', pError.response?.data || pError.message);
            }
        }, 15000); // Đợi 15 giây

        res.json({
            success: true,
            message: "Yêu cầu đăng bài đã được gửi. Ảnh sẽ xuất hiện trên Instagram sau khoảng 15-20 giây.",
            container_id: creationId
        });

    } catch (error) {
        console.error('[TEST] Lỗi khởi tạo:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || error.message });
    }
});

// --- 7. LOGIC UPLOAD REELS (DÀNH CHO PRODUCTION) ---
app.post('/upload-reel', async (req, res) => {
    const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
    const ACCESS_TOKEN = process.env.ACCESS_TOKEN;
    const { video_url, caption } = req.body;

    if (!video_url) return res.status(400).json({ error: "Missing video_url" });

    try {
        console.log(`[REELS] Đang khởi tạo cho video: ${video_url}`);

        const initRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: video_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creationId = initRes.data.id;
        console.log(`[REELS] Container ID: ${creationId}. Waiting 45s for video encoding...`);
        
        // Reels nặng hơn nên cần đợi ít nhất 45 giây
        setTimeout(async () => {
            try {
                const publishRes = await axios.post(`https://graph.facebook.com/v21.0/${IG_USER_ID}/media_publish`, {
                    creation_id: creationId,
                    access_token: ACCESS_TOKEN
                });
                console.log(`[REELS] Successfully published: ${creationId}`);
            } catch (pError) {
                console.error('[REELS] Publish Error:', pError.response?.data || pError.message);
            }
        }, 45000);

        res.status(200).json({ success: true, creation_id: creationId });

    } catch (error) {
        console.error('[REELS] API Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || "Internal Server Error" });
    }
});

// --- 8. KHỞI CHẠY SERVER ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`>>> AutoUploader Studio is Live on port ${PORT}`);
});
