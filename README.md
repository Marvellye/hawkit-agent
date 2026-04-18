# Hawkit Automated Agent

An autonomous bot for performing paid social media tasks on the Hawkit/Efluence platform. This tool uses a modular architecture where the main agent handles API logic and task discovery, while platform-specific scripts handle browser automation.

## 🚀 Features

- **Autonomous Workflow**: Automatically fetches, generates, and performs tasks.
- **Modular Design**: Platform-specific logic is separated into independent scripts in the `tasks/` directory.
- **Persistent Sessions**: Uses Playwright's persistent contexts to maintain social media logins and avoid repeated verification.
- **Automatic Proof Submission**: Takes screenshots as proof and uploads them directly to the Hawkit API.
- **Cycle-based Checking**: Periodically polls for new tasks when none are pending.

## 📂 Directory Structure

```text
hawkit/
├── scripts/
│   ├── hawkit-agent.js  # Main runner and task orchestrator
│   ├── api-client.js    # Modular API wrapper for Hawkit/Efluence
│   ├── proofs/          # Temporary storage for task screenshots
│   └── tasks/           # Platform-specific automation scripts
│       ├── instagram-follow.js
│       ├── instagram-login.js
│       ├── tiktok-like.js
│       ├── tiktok-login.js
│       ├── twitter-follow.js
│       └── twitter-login.js
├── ig-profile/          # Persistent Instagram session data
├── tiktok-profile/      # Persistent TikTok session data
├── twitter-profile/     # Persistent Twitter session data
└── package.json
```

## 🛠️ Setup

1. **Install Dependencies**:

   ```bash
   npm install
   npx playwright install chromium
   ```

2. **Login to Social Media**:
   Run the login script for the platform you want to use and log in manually in the browser window that opens.
   - **Instagram**: `node scripts/tasks/instagram-login.js`
   - **TikTok**: `node scripts/tasks/tiktok-login.js`
   - **Twitter/X**: `node scripts/tasks/twitter-login.js`

3. **Configure Credentials**:
   You can provide credentials via command-line flags or a `.env` file.

   **Required Fields**:
   - `USERNAME`: Hawkit login username
   - `PASSWORD`: Hawkit login password
   - `SOCIAL_USERNAME`: Your handle on the social platform (e.g., `@your_ig_handle`)

## 🏃 Usage

Start the agent loop:

```bash
node scripts/hawkit-agent.js --user YOUR_USER --pass YOUR_PASS --social YOUR_HANDLE
node scripts/hawkit-agent -u smarte -p smartearners -s smart.earners_
```

### Command Line Arguments

- `-u, --user`: Hawkit username
- `-p, --pass`: Hawkit password
- `-s, --social`: Your social media handle (used for proof submission)
- `--id`: (Optional) Client ID
- `--hash`: (Optional) Client Hash

## 🧩 Adding New Tasks

To add support for a new platform or action:

1. **Create the Script**: Add a new `.js` file in `scripts/tasks/` (e.g., `instagram-like.js`).
2. **Accept Arguments**: Your script should accept a URL as the first argument and an output filename via the `-o` flag.
3. **Register the Script**: Add the new script to the `TASK_SCRIPTS` mapping in `scripts/hawkit-agent.js`:

```javascript
const TASK_SCRIPTS = {
  instagram: {
    follow: "tasks/instagram-follow.js",
    like: "tasks/instagram-like.js", // New action
  },
};
```

## ⚠️ Disclaimer

This tool is for educational purposes. Use it in compliance with the Terms of Service of both Hawkit and the social media platforms involved. Using automation may lead to account restrictions if used excessively.
