const fs = require('fs');
const path = require('path');

class HawkitClient {
    constructor(config) {
        this.baseUrl = config.baseUrl || 'https://api.efluence.ng';
        this.tokenFile = config.tokenFile || path.join(__dirname, '.auth_token');
        this.clientId = config.clientId;
        this.clientHash = config.clientHash;
        this.username = config.username;
        this.password = config.password;
        this.authToken = null;
    }

    async request(endpoint, options = {}) {
        const url = endpoint.startsWith('http') ? endpoint : `${this.baseUrl}${endpoint}`;
        
        const headers = {
            'x-client-id': this.clientId,
            'x-client-hash': this.clientHash,
            ...options.headers
        };

        if (this.authToken) {
            headers['Authorization'] = this.authToken;
        } else if (fs.existsSync(this.tokenFile)) {
            this.authToken = fs.readFileSync(this.tokenFile, 'utf8');
            headers['Authorization'] = this.authToken;
        }

        const method = options.method || (options.data || options.body ? 'POST' : 'GET');
        
        let body = options.body;
        if (options.data) {
            body = JSON.stringify(options.data);
            if (!headers['Content-Type']) {
                headers['Content-Type'] = 'application/json';
            }
        }

        try {
            let response = await fetch(url, { method, headers, body });

            if (response.status === 401 && !options._retry) {
                console.log("Token expired or invalid. Re-authenticating...");
                if (fs.existsSync(this.tokenFile)) fs.unlinkSync(this.tokenFile);
                this.authToken = null;
                await this.login();
                return this.request(endpoint, { ...options, _retry: true });
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

    async login() {
        console.log("Attempting to log in...");
        try {
            const response = await this.request('/auth/login', {
                method: 'POST',
                data: {
                    username: this.username,
                    password: this.password
                }
            });
            const token = response.data.data.auth.token;
            fs.writeFileSync(this.tokenFile, token);
            this.authToken = token;
            console.log("Login successful. Token saved.");
            return token;
        } catch (error) {
            console.error("Login failed:", error.response?.data || error.message);
            throw error;
        }
    }

    async ensureAuth() {
        if (this.authToken) return;
        if (fs.existsSync(this.tokenFile)) {
            this.authToken = fs.readFileSync(this.tokenFile, 'utf8');
        } else {
            await this.login();
        }
    }

    async getPendingTasks() {
        const response = await this.request('/social/tasks/pending?page=1');
        return response.data.data.tasks || [];
    }

    async getAvailableCategories() {
        const response = await this.request('/social/tasks/pricing');
        const categories = response.data.data.task_pricing;
        return categories
            .filter(c => c.tasks > 0)
            .sort((a, b) => b.tasks - a.tasks);
    }

    async generateTask(categoryId) {
        const response = await this.request(`/social/tasks/${categoryId}/generate-task`);
        const tasks = response.data.data.tasks;
        if (!tasks || tasks.length === 0) throw new Error("No task returned during generation.");
        return tasks[0]._id;
    }

    async viewTask(taskId) {
        const response = await this.request(`/social/task/${taskId}`);
        return response.data.data.task;
    }

    async submitProof(taskId, filePath, socialUsername) {
        console.log(`Submitting proof for task ${taskId}...`);
        const buffer = fs.readFileSync(filePath);
        const blob = new Blob([buffer], { type: 'image/png' });

        const form = new FormData();
        form.append('name', socialUsername);
        form.append('photos', blob, `${taskId}.png`);

        const response = await this.request(`/social/task/${taskId}/proof`, {
            method: 'POST',
            body: form
        });
        
        console.log(`Proof submitted successfully for task ${taskId}!`);
        return response.data;
    }

    async cancelTask(taskId) {
        console.log(`Canceling task ${taskId}...`);
        const response = await this.request(`/social/task/${taskId}/cancel`, {
            method: 'POST'
        });
        console.log(`Task ${taskId} canceled successfully!`);
        return response.data;
    }
}

module.exports = HawkitClient;
