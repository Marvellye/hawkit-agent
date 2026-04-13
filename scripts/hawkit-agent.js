const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://api.efluence.ng';
const PROOFS_DIR = path.join(__dirname, 'proofs');
const TOKEN_FILE = path.join(__dirname, '.auth_token');
const LOOP_INTERVAL_MS = 60000; // 1 minute interval between checks
const FILE_POLL_INTERVAL_MS = 5000; // 5 seconds polling for screenshot file

// Load Environment Variables (Native Node.js support)
try {
    process.loadEnvFile();
} catch (e) {
    // If .env file is missing, we assume variables are already in environment
}

// Configuration Helpers
function getArg(flag, alias) {
    const idx = process.argv.findIndex(arg => arg === flag || (alias && arg === alias));
    return (idx !== -1 && process.argv[idx + 1]) ? process.argv[idx + 1] : null;
}

const USERNAME = getArg('--user', '-u') || process.env.USERNAME;
const PASSWORD = getArg('--pass', '-p') || process.env.PASSWORD;
const SOCIAL_USERNAME = getArg('--social', '-s') || process.env.SOCIAL_USERNAME;
const CLIENT_ID = getArg('--id') || process.env.CLIENT_ID || '1a26257c5fb5e4c7edc048035704ca0a';
const CLIENT_HASH = getArg('--hash') || process.env.CLIENT_HASH || '1a26257c5fb5e4c7edc048035704ca0a';

if (!USERNAME || !PASSWORD || !SOCIAL_USERNAME) {
    console.error("Error: Missing required configuration.");
    console.log("\nUsage: node scripts/hawkit-agent.js --user <user> --pass <pass> --social <social_handle>");
    console.log("Alternatively, provide USERNAME, PASSWORD, and SOCIAL_USERNAME in a .env file.");
    process.exit(1);
}

// Global state
let auth_token = null;

// Create proofs directory if it doesn't exist
if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR);
}

/**
 * Native Fetch-based request helper to replace Axios
 */
async function request(endpoint, options = {}) {
    const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
    
    // Initialize headers
    const headers = {
        'x-client-id': CLIENT_ID,
        'x-client-hash': CLIENT_HASH,
        ...options.headers
    };

    // Add Authorization if available
    if (auth_token) {
        headers['Authorization'] = auth_token;
    } else if (fs.existsSync(TOKEN_FILE)) {
        auth_token = fs.readFileSync(TOKEN_FILE, 'utf8');
        headers['Authorization'] = auth_token;
    }

    // Determine method and body
    const isFormData = options.body instanceof FormData;
    const method = options.method || (options.data || options.body ? 'POST' : 'GET');
    
    let body = options.body;
    if (options.data) {
        body = JSON.stringify(options.data);
        if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
        }
    }

    const fetchOptions = {
        method,
        headers,
        body
    };

    try {
        let response = await fetch(url, fetchOptions);

        // Handle 401 Unauthorized (Token expired)
        if (response.status === 401 && !options._retry) {
            console.log("Token expired or invalid. Re-authenticating...");
            if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
            auth_token = null;
            await login();
            
            // Retry the original request
            return request(endpoint, { ...options, _retry: true });
        }

        const text = await response.text();
        let responseData;
        try {
            responseData = text ? JSON.parse(text) : {};
        } catch (e) {
            responseData = { message: text };
        }

        if (!response.ok) {
            const error = new Error(responseData.message || response.statusText);
            error.response = { data: responseData, status: response.status };
            throw error;
        }

        return { data: responseData };
    } catch (error) {
        if (error.response) throw error;
        throw new Error(`Network error: ${error.message}`);
    }
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- API FUNCTIONS ---

async function login() {
    console.log("Attempting to log in...");
    try {
        const response = await request('/auth/login', {
            method: 'POST',
            data: {
                username: USERNAME,
                password: PASSWORD
            }
        });
        const token = response.data.data.auth.token;
        fs.writeFileSync(TOKEN_FILE, token);
        auth_token = token;
        console.log("Login successful. Token saved.");
        return token;
    } catch (error) {
        console.error("Login failed:", error.response?.data || error.message);
        throw error;
    }
}

async function ensureAuth() {
    if (auth_token) return;
    if (fs.existsSync(TOKEN_FILE)) {
        auth_token = fs.readFileSync(TOKEN_FILE, 'utf8');
    } else {
        await login();
    }
}

async function getPendingTasks() {
    const response = await request('/social/tasks/pending?page=1');
    return response.data.data.tasks || [];
}

async function getAvailableCategories() {
    const response = await request('/social/tasks/pricing');
    const categories = response.data.data.task_pricing;
    
    // Rank logic: Must have tasks > 0. Sort by highest tasks count.
    return categories
        .filter(c => c.tasks > 0)
        .sort((a, b) => b.tasks - a.tasks);
}

async function generateTask(categoryId) {
    const response = await request(`/social/tasks/${categoryId}/generate-task`);
    const tasks = response.data.data.tasks;
    if (!tasks || tasks.length === 0) throw new Error("No task returned during generation.");
    return tasks[0]._id;
}

async function viewTask(taskId) {
    const response = await request(`/social/task/${taskId}`);
    return response.data.data.task;
}

async function submitProof(taskId, filePath) {
    console.log(`Submitting proof for task ${taskId}...`);
    
    // Read file as a Blob for native FormData
    const buffer = fs.readFileSync(filePath);
    const blob = new Blob([buffer], { type: 'image/png' });

    const form = new FormData();
    form.append('name', SOCIAL_USERNAME);
    form.append('photos', blob, `${taskId}.png`);

    const response = await request(`/social/task/${taskId}/proof`, {
        method: 'POST',
        body: form
    });
    
    console.log(`Proof submitted successfully for task ${taskId}!`);
    return response.data;
}

// --- ORCHESTRATION LOGIC ---

async function waitForProofFile(taskId) {
    const expectedFilePath = path.join(PROOFS_DIR, `${taskId}.png`);
    console.log(`\n[ACTION REQUIRED] AI AGENT: Please perform the task and save screenshot to -> ${expectedFilePath}`);
    
    while (!fs.existsSync(expectedFilePath)) {
        await sleep(FILE_POLL_INTERVAL_MS);
    }
    
    console.log(`Screenshot found for ${taskId}! Proceeding with submission...`);
    return expectedFilePath;
}

async function processTask(taskId) {
    try {
        const taskDetails = await viewTask(taskId);
        console.log(`\n--- TASK DETAILS ---`);
        console.log(`ID: ${taskDetails._id}`);
        console.log(`Platform: ${taskDetails.social_task_order?.platform}`);
        console.log(`Action: ${taskDetails.social_task_category?.type}`);
        console.log(`Link: ${taskDetails.link}`);
        console.log(`Earnings: ${taskDetails.pricing.seller} NGN`);
        
        // Wait for AI Agent to drop the screenshot
        const proofPath = await waitForProofFile(taskId);
        
        // Submit
        await submitProof(taskId, proofPath);

        // Cleanup local file after successful submission
        fs.unlinkSync(proofPath);
        console.log(`Cleaned up local proof file for ${taskId}.`);
    } catch (error) {
        console.error(`Error processing task ${taskId}:`, error.response?.data || error.message);
    }
}

async function runLoop() {
    console.log("Starting Hawkit AI Agent Workflow...");
    
    while (true) {
        try {
            await ensureAuth();

            console.log("\nChecking for pending tasks...");
            const pendingTasks = await getPendingTasks();
            
            if (pendingTasks.length > 0) {
                console.log(`Found ${pendingTasks.length} pending task(s).`);
                for (const task of pendingTasks) {
                    await processTask(task._id);
                }
            } else {
                console.log("No pending tasks. Looking for new tasks...");
                const categories = await getAvailableCategories();
                
                if (categories.length === 0) {
                    console.log("No categories have available tasks right now.");
                } else {
                    const bestCategory = categories[0];
                    console.log(`Selecting Category: ${bestCategory.title} (${bestCategory.tasks} available)`);
                    
                    const newTaskId = await generateTask(bestCategory._id);
                    console.log(`Successfully generated new task: ${newTaskId}`);
                    
                    await processTask(newTaskId);
                }
            }

            console.log(`\nCycle complete. Sleeping for ${LOOP_INTERVAL_MS / 1000} seconds before next check...`);
            await sleep(LOOP_INTERVAL_MS);

        } catch (error) {
            console.error("Critical error in main loop:", error.message);
            console.log("Retrying in 10 seconds...");
            await sleep(10000);
        }
    }
}

// Start the daemon
runLoop();