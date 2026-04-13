require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Configuration
const BASE_URL = 'https://api.efluence.ng';
const PROOFS_DIR = path.join(__dirname, 'proofs');
const TOKEN_FILE = path.join(__dirname, '.auth_token');
const LOOP_INTERVAL_MS = 60000; // 1 minute interval between checks
const FILE_POLL_INTERVAL_MS = 5000; // 5 seconds polling for screenshot file

// Environment Variables
const {
    USERNAME,
    PASSWORD,
    CLIENT_ID,
    CLIENT_HASH,
    SOCIAL_USERNAME
} = process.env;

if (!USERNAME || !PASSWORD || !CLIENT_ID || !CLIENT_HASH || !SOCIAL_USERNAME) {
    console.error("Missing required environment variables in .env");
    process.exit(1);
}

// Create proofs directory if it doesn't exist
if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR);
}

// Axios Instance with dynamic headers
const api = axios.create({
    baseURL: BASE_URL,
    headers: {
        'x-client-id': CLIENT_ID,
        'x-client-hash': CLIENT_HASH
    }
});

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- API FUNCTIONS ---

async function login() {
    console.log("Attempting to log in...");
    try {
        const response = await api.post('/auth/login', {
            username: USERNAME,
            password: PASSWORD
        });
        const token = response.data.data.auth.token;
        fs.writeFileSync(TOKEN_FILE, token);
        api.defaults.headers['Authorization'] = token;
        console.log("Login successful. Token saved.");
        return token;
    } catch (error) {
        console.error("Login failed:", error.response?.data || error.message);
        throw error;
    }
}

async function ensureAuth() {
    if (api.defaults.headers['Authorization']) return;
    if (fs.existsSync(TOKEN_FILE)) {
        api.defaults.headers['Authorization'] = fs.readFileSync(TOKEN_FILE, 'utf8');
    } else {
        await login();
    }
}

// Interceptor to handle 401s globally
api.interceptors.response.use(response => response, async error => {
    if (error.response && error.response.status === 401) {
        console.log("Token expired or invalid. Re-authenticating...");
        if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE);
        delete api.defaults.headers['Authorization'];
        await login();
        // Retry the original request
        error.config.headers['Authorization'] = api.defaults.headers['Authorization'];
        return axios(error.config);
    }
    return Promise.reject(error);
});

async function getPendingTasks() {
    const response = await api.get('/social/tasks/pending?page=1');
    return response.data.data.tasks || [];
}

async function getAvailableCategories() {
    const response = await api.get('/social/tasks/pricing');
    const categories = response.data.data.task_pricing;
    
    // Rank logic: Must have tasks > 0. Sort by highest tasks count.
    return categories
        .filter(c => c.tasks > 0)
        .sort((a, b) => b.tasks - a.tasks);
}

async function generateTask(categoryId) {
    const response = await api.get(`/social/tasks/${categoryId}/generate-task`);
    const tasks = response.data.data.tasks;
    if (!tasks || tasks.length === 0) throw new Error("No task returned during generation.");
    return tasks[0]._id;
}

async function viewTask(taskId) {
    const response = await api.get(`/social/task/${taskId}`);
    return response.data.data.task;
}

async function submitProof(taskId, filePath) {
    console.log(`Submitting proof for task ${taskId}...`);
    const form = new FormData();
    form.append('name', SOCIAL_USERNAME);
    form.append('photos', fs.createReadStream(filePath));

    const response = await api.post(`/social/task/${taskId}/proof`, form, {
        headers: {
            ...form.getHeaders()
        }
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