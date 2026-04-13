---
name: hawkit-agent
description: Hawkit Task Automation. Get paid for doing social media tasks.
---

# SKILL: Hawkit / Efluence Task Automation

## Description

This skill empowers the AI Agent to autonomously perform paid social media tasks via the Hawkit/Efluence API. The agent acts in tandem with a Node.js CLI script. The script manages authentication, task discovery, generation, and API submission, while the AI Agent performs the browser automation (visiting links, following/liking, taking screenshots) and saves the proof.

## Workflow Instructions for the AI Agent

1. **Setup & Configuration**
   - Ensure a `.env` file exists with `USERNAME`, `PASSWORD`, `CLIENT_ID`, `CLIENT_HASH`, and `SOCIAL_USERNAME`.
   - Install dependencies for the CLI script: `npm install axios form-data dotenv`.
   - Start the background script: `node hawkit-agent.js`.

2. **Authentication (Automated)**
   - The CLI script handles `/auth/login` and saves the `auth_token`.
   - If a 401 Unauthorized error occurs at any point, the script will automatically delete the old token and re-authenticate.

3. **Task Discovery & Ranking (Automated)**
   - The script periodically checks `/social/tasks/pending?page=1` for unfinished tasks.
   - If no pending tasks exist, it queries `/social/tasks/pricing` to list all task categories.
   - It automatically ranks them based on availability (`tasks > 0`) and ease (e.g., standard engagements like follow/like).

4. **Task Generation & Instructions**
   - The script calls `/social/tasks/{category_id}/generate-task` for the top-ranked available category.
   - It fetches task details via `/social/task/{task_id}` and outputs instructions and a specific `link` to the console.

5. **Action: Agent Execution (Your Job)**
   - **Monitor logs:** Watch the script's output for `[ACTION REQUIRED]`.
   - **Navigate:** Open the provided social media `link` in a browser/headless browser.
   - **Perform Task:** Execute the requested action (e.g., Follow, Like, Comment) as specified in the printed `task_steps`.
   - **Capture Proof:** Take a screenshot of the completed action.
   - **Save Proof:** Save the screenshot to the local filesystem EXACTLY at: `./proofs/<task_id>.png`.

6. **Submission (Automated)**
   - The Node.js script continuously polls the `./proofs/` folder.
   - Once it detects `<task_id>.png`, it automatically uploads it via `multipart/form-data` to `/social/task/{task_id}/proof` along with your `SOCIAL_USERNAME`.
   - The script then rests for the specified time interval before repeating the loop.

## Handling Edge Cases

- **Task Exhaustion:** If the script reports no tasks available, wait for the defined interval (e.g., 5-10 minutes) and let the script retry.
- **Verification Expiration:** Tasks have a `verification_expires_on` timestamp. Prioritize pending tasks before generating new ones.
