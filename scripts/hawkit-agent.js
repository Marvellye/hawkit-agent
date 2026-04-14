const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const HawkitClient = require('./api-client');

// Configuration
const PROOFS_DIR = path.join(__dirname, 'proofs');
const LOOP_INTERVAL_MS = 60000;

// Ensure proofs directory exists
if (!fs.existsSync(PROOFS_DIR)) {
    fs.mkdirSync(PROOFS_DIR, { recursive: true });
}

/**
 * Hawkit Automated Agent
 * This script runs autonomously using task-specific scripts in the tasks/ folder.
 */

// Load Environment Variables
try {
    process.loadEnvFile();
} catch (e) {}

function getArg(flag, alias) {
    const idx = process.argv.findIndex(arg => arg === flag || (alias && arg === alias));
    return (idx !== -1 && process.argv[idx + 1]) ? process.argv[idx + 1] : null;
}

const config = {
    username: getArg('--user', '-u') || process.env.USERNAME,
    password: getArg('--pass', '-p') || process.env.PASSWORD,
    socialUsername: getArg('--social', '-s') || process.env.SOCIAL_USERNAME,
    clientId: getArg('--id') || process.env.CLIENT_ID || '1a26257c5fb5e4c7edc048035704ca0a',
    clientHash: getArg('--hash') || process.env.CLIENT_HASH || '1a26257c5fb5e4c7edc048035704ca0a',
    baseUrl: 'https://api.efluence.ng'
};

if (!config.username || !config.password || !config.socialUsername) {
    console.error("Error: Missing required configuration.");
    console.log("\nUsage: node scripts/hawkit-agent.js --user <user> --pass <pass> --social <social_handle>");
    process.exit(1);
}

const client = new HawkitClient(config);

// Mapping of Platform + Action to Script
const TASK_SCRIPTS = {
    'instagram': {
        'follow': 'tasks/instagram-follow.js',
    },
    'tiktok': {
        'like': 'tasks/tiktok-like.js',
    }
};

async function runTaskScript(platform, action, link, taskId) {
    const scripts = TASK_SCRIPTS[platform.toLowerCase()];
    if (!scripts || !scripts[action.toLowerCase()]) {
        throw new Error(`No script found for platform: ${platform}, action: ${action}`);
    }

    const scriptFile = scripts[action.toLowerCase()];
    const scriptPath = path.join(__dirname, scriptFile);
    const outputPath = path.normalize(`${taskId}.png`); // Using normalized path for reliability

    return new Promise((resolve, reject) => {
        // The scripts are expected to be in the same directory (scripts/)
        // and follow the pattern: node <script> <link> -o <filename>
        const command = `node "${scriptPath}" "${link}" -o "${outputPath}"`;
        console.log(`[EXECUTING] ${command}`);
        
        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`[SCRIPT ERROR] ${stderr}`);
                return reject(new Error(`Script failed: ${error.message}`));
            }
            console.log(stdout);
            
            const proofPath = path.join(PROOFS_DIR, outputPath);
            if (fs.existsSync(proofPath)) {
                resolve(proofPath);
            } else {
                reject(new Error(`Screenshot not found at ${proofPath}`));
            }
        });
    });
}

async function processTask(taskId) {
    try {
        const taskDetails = await client.viewTask(taskId);
        const platform = taskDetails.social_task_order?.platform;
        const action = taskDetails.social_task_category?.type;
        const link = taskDetails.link;

        console.log(`\n--- PROCESSING TASK: ${taskId} ---`);
        console.log(`Platform: ${platform} | Action: ${action}`);
        console.log(`Link: ${link}`);

        // Run the appropriate script instead of waiting for AI
        const proofPath = await runTaskScript(platform, action, link, taskId);
        
        // Submit proof
        await client.submitProof(taskId, proofPath, config.socialUsername);

        // Cleanup
        fs.unlinkSync(proofPath);
        console.log(`Cleaned up local proof file for ${taskId}.`);

    } catch (error) {
        console.error(`Error processing task ${taskId}:`, error.message);
    }
}

async function runLoop() {
    console.log("Starting Hawkit Automated Workflow...");
    
    while (true) {
        try {
            await client.ensureAuth();

            console.log("\nChecking for pending tasks...");
            const pendingTasks = await client.getPendingTasks();
            
            if (pendingTasks.length > 0) {
                console.log(`Found ${pendingTasks.length} pending task(s).`);
                for (const task of pendingTasks) {
                    await processTask(task._id);
                }
            } else {
                console.log("No pending tasks. Looking for new tasks...");
                const categories = await client.getAvailableCategories();
                
                if (categories.length === 0) {
                    console.log("No categories have available tasks right now.");
                } else {
                    const bestCategory = categories[0];
                    console.log(`Selecting Category: ${bestCategory.title} (${bestCategory.tasks} available)`);
                    
                    const newTaskId = await client.generateTask(bestCategory._id);
                    console.log(`Successfully generated new task: ${newTaskId}`);
                    
                    await processTask(newTaskId);
                }
            }

            console.log(`\nCycle complete. Sleeping for ${LOOP_INTERVAL_MS / 1000} seconds...`);
            await new Promise(r => setTimeout(r, LOOP_INTERVAL_MS));

        } catch (error) {
            console.error("Critical error in main loop:", error.message);
            await new Promise(r => setTimeout(r, 10000));
        }
    }
}

// Start
runLoop();