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
// Giúp tạo link https://auto-uploader-studio.onrender.com/auth/facebook/callback
passport.use(new FacebookStrategy({
    clientID: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    callbackURL: "https://auto-uploader-studio.onrender.com/auth/facebook/callback",
    profileFields: ['id', 'displayName']
  },
  (accessToken, refreshToken, profile, done) => {
    // Token này có thể dùng để cập nhật ACCESS_TOKEN trong env nếu cần
    console.log("New Access Token from Login:", accessToken);
    profile.token = accessToken;
    return done(null, profile);
  }
));

// --- 3. Hàm bổ trợ hiển thị nội dung ---
const renderHTMLContent = (fileName, title, res) => {
    const filePath = path.join(__dirname, fileName);
    if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Trả về HTML để đẹp mắt hơn khi Meta Review truy cập
        return res.send(`
            <html>
                <head><title>${title}</title><style>body{font-family:sans-serif;line-height:1.6;padding:40px;max-width:800px;margin:auto;}</style></head>
                <body>${content.replace(/\n/g, '<br>')}</body>
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

// --- 5. ROUTES XÁC THỰC (Giải quyết yêu cầu Callback URL) ---
app.get('/auth/facebook', passport.authenticate('facebook', { 
    scope: ['pages_show_list', 'instagram_basic', 'instagram_content_publish', 'pages_read_engagement'] 
}));

app.get('/auth/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/' }),
    (req, res) => {
        res.send('<h2>Xác thực thành công!</h2><p>Ứng dụng đã được cấp quyền. Bạn có thể đóng cửa sổ này.</p>');
    }
);

// --- 6. LOGIC UPLOAD REELS (Giữ nguyên từ code cũ của bạn) ---
const IG_USER_ID = process.env.INSTAGRAM_USER_ID;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN;

app.post('/upload-reel', async (req, res) => {
    const { video_url, caption } = req.body;

    if (!video_url) {
        return res.status(400).json({ error: "Missing video_url" });
    }

    try {
        console.log(`Starting upload for: ${video_url}`);

        // Bước 1: Khởi tạo Media Container
        const initRes = await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media`, {
            media_type: 'REELS',
            video_url: video_url,
            caption: caption || '',
            access_token: ACCESS_TOKEN
        });

        const creationId = initRes.data.id;
        
        // Bước 2: Publish sau 30 giây
        setTimeout(async () => {
            try {
                await axios.post(`https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`, {
                    creation_id: creationId,
                    access_token: ACCESS_TOKEN
                });
                console.log(`Successfully published Container ID: ${creationId}`);
            } catch (pError) {
                console.error('Publish Error:', pError.response?.data || pError.message);
            }
        }, 30000);

        res.status(200).json({
            success: true,
            creation_id: creationId
        });

    } catch (error) {
        console.error('API Error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.response?.data || "Internal Server Error" });
    }
});

// --- 7. KHỞI CHẠY ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`Server is live on port ${PORT}`);
});
