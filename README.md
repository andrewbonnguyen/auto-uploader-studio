# AutoUploader Studio - Instagram Reels Service

Web service built with Express.js to automate Instagram Reels publishing via Meta Graph API.

### Setup
1. Clone the repository.
2. Install dependencies: `npm install`.
3. Configure your `.env` with Meta App credentials.
4. Deploy to Render.com.

### API Endpoint
- **POST `/upload-reel`**
- Body: `{"video_url": "...", "caption": "..."}`
