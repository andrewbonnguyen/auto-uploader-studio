# App Review: instagram_content_publish

**Core Functionality:**
AutoUploader Studio is a personal productivity tool that automates the uploading of video content from cloud storage (GCS) to Instagram Reels.

**Permission Usage:**
We require `instagram_content_publish` to programmatically create media containers and publish them as Reels. This allows our backend system to synchronize video content across multiple social platforms without manual intervention.

**Process Flow:**
1. System sends Video URL and Caption to our backend.
2. Backend calls /{ig-user-id}/media to initialize.
3. Backend calls /{ig-user-id}/media_publish to make the Reel live.
