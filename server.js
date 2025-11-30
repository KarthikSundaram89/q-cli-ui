const express = require('express');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static('.'));

let qProcess = null;
let conversationActive = false;
let conversationLog = [];

// Start persistent Q CLI session
function startQSession() {
    if (qProcess) return;
    
    qProcess = spawn('q', ['chat'], { 
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, TERM: 'xterm-256color' }
    });
    
    qProcess.on('exit', (code) => {
        console.log(`Q CLI process exited with code ${code}`);
        qProcess = null;
        conversationActive = false;
    });
    
    qProcess.on('error', (error) => {
        console.error('Q CLI process error:', error);
        qProcess = null;
        conversationActive = false;
    });
    
    // Handle stderr to catch any errors
    qProcess.stderr.on('data', (data) => {
        const error = data.toString();
        console.error('Q CLI stderr:', error);
        
        // Check for auth errors and attempt relogin
        if (error.includes('authentication') || error.includes('login') || error.includes('expired')) {
            console.log('Auth error detected, attempting relogin...');
            setTimeout(() => {
                const { spawn } = require('child_process');
                const reauth = spawn('q', ['login', '--refresh-token'], { stdio: 'inherit' });
                reauth.on('close', () => {
                    console.log('Reauth completed, restarting Q session...');
                    qProcess = null;
                    startQSession();
                });
            }, 1000);
        }
    });
}

function saveConversation() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `conversation-${timestamp}.json`;
    const filepath = path.join(__dirname, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(conversationLog, null, 2));
    console.log(`Conversation saved to ${filename}`);
}

app.post('/api/chat', (req, res) => {
    const { message } = req.body;
    
    // Always ensure we have a fresh Q CLI process
    if (!qProcess || qProcess.killed) {
        startQSession();
        // Give it a moment to start
        setTimeout(() => processMessage(message, res), 500);
    } else {
        processMessage(message, res);
    }
});

app.get('/api/auth-status', (req, res) => {
    const { spawn } = require('child_process');
    const whoami = spawn('q', ['whoami'], { stdio: 'pipe' });
    
    let output = '';
    whoami.stdout.on('data', (data) => output += data.toString());
    
    whoami.on('close', (code) => {
        if (code === 0 && output.trim()) {
            res.json({ authenticated: true, status: `Logged in as: ${output.trim()}` });
        } else {
            res.json({ authenticated: false, status: 'Not authenticated' });
        }
    });
});

app.post('/api/relogin', (req, res) => {
    const { spawn } = require('child_process');
    const login = spawn('q', ['login', '--refresh-token'], { stdio: 'pipe' });
    
    login.on('close', (code) => {
        if (code === 0) {
            // Kill existing Q process to force restart
            if (qProcess) {
                qProcess.kill();
                qProcess = null;
            }
            res.json({ success: true, message: 'Relogin successful' });
        } else {
            res.json({ success: false, message: 'Relogin failed' });
        }
    });
});

app.post('/api/relogin-interactive', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/plain',
        'Transfer-Encoding': 'chunked'
    });
    
    const sendStep = (step, status, output) => {
        res.write(JSON.stringify({ step, status, output }) + '\n');
    };
    
    // Step 1: Start login
    sendStep(1, 'active', 'Starting Q CLI login process...');
    
    const { spawn } = require('child_process');
    const login = spawn('q', ['login'], { stdio: 'pipe' });
    
    let output = '';
    
    let foundUrl = '';
    let deviceCode = '';
    
    const processOutput = (data) => {
        const text = data.toString();
        output += text;
        
        // Extract device code
        const codeMatch = text.match(/Code:\s*([A-Z0-9-]+)/);
        if (codeMatch && !deviceCode) {
            deviceCode = codeMatch[1];
        }
        
        // Look for "Open this URL:" line
        const urlMatch = text.match(/Open this URL:\s*(https:\/\/[^\s\n\r]+)/);
        if (urlMatch && !foundUrl) {
            foundUrl = urlMatch[1].replace('view.awsapps.com', 'altisource.awsapps.com');
        }
        
        if (text.includes('browser') || text.includes('open') || text.includes('success')) {
            sendStep(1, 'completed', 'Login command initiated successfully');
            sendStep(2, 'active', 'Q CLI is opening your browser for authentication.\n\nPlease complete the login process in the browser window that opened.\n\nThis will authenticate with your configured SSO provider.');
        }
        
        if (text.includes('success') || text.includes('logged in') || text.includes('Welcome')) {
            sendStep(2, 'completed', 'Browser authentication completed');
            sendStep(3, 'active', 'Verifying login status...');
        }
    };
    
    login.stdout.on('data', processOutput);
    login.stderr.on('data', processOutput);
    
    login.stderr.on('data', (data) => {
        const text = data.toString();
        if (text.includes('error') || text.includes('failed')) {
            sendStep(1, 'error', 'Login failed: ' + text);
        }
    });
    
    login.on('close', (code) => {
        if (code === 0) {
            sendStep(3, 'completed', 'Login successful! Q CLI is now authenticated.');
            // Kill existing Q process to force restart
            if (qProcess) {
                qProcess.kill();
                qProcess = null;
            }
        } else {
            sendStep(3, 'error', 'Login verification failed');
        }
        res.end();
    });
    
    // Timeout after 60 seconds
    setTimeout(() => {
        if (!login.killed) {
            login.kill();
            sendStep(3, 'error', 'Login timeout - please try again');
            res.end();
        }
    }, 60000);
});

function processMessage(message, res) {
    let output = '';
    let responseTimer;
    let toolInProgress = false;
    let responded = false;
    
    const dataHandler = (data) => {
        const text = data.toString();
        output += text;
        
        // Check if tool is being used
        if (text.includes('🛠️') || text.includes('Using tool:') || text.includes('⋮')) {
            toolInProgress = true;
        }
        
        // Check if tool completed
        if (toolInProgress && (text.includes('Completed in') || text.includes('●'))) {
            toolInProgress = false;
        }
        
        // Clear existing timer and set new one
        clearTimeout(responseTimer);
        
        // Wait longer if tool is in progress
        const waitTime = toolInProgress ? 8000 : 3000;
        
        responseTimer = setTimeout(() => {
            if (responded) return;
            responded = true;
            
            qProcess.stdout.off('data', dataHandler);
            
            // Clean up the output
            let cleanOutput = output
                .replace(/\x1b\[[0-9;]*m/g, '') // Remove ANSI codes
                .replace(/.*Amazon Q Developer.*\n/g, '') // Remove banner
                .replace(/.*Type \/quit to quit.*\n/g, '') // Remove quit message
                .replace(/^\s*>\s*/gm, '') // Remove prompts at start of lines
                .replace(/^\s*\n/gm, '') // Remove empty lines
                .trim();
            
            // Log conversation
            conversationLog.push({
                timestamp: new Date().toISOString(),
                user: message,
                assistant: cleanOutput
            });
            
            // Save every 5 messages
            if (conversationLog.length % 5 === 0) {
                saveConversation();
            }
            
            res.json({ response: cleanOutput || 'No response' });
        }, waitTime);
    };
    
    const errorHandler = () => {
        if (responded) return;
        responded = true;
        clearTimeout(responseTimer);
        res.status(500).json({ response: 'Q CLI process error. Please try again.' });
    };
    
    // Set up handlers
    qProcess.stdout.on('data', dataHandler);
    qProcess.on('error', errorHandler);
    qProcess.on('exit', errorHandler);
    
    // Send message
    try {
        qProcess.stdin.write(message + '\n');
    } catch (error) {
        errorHandler();
    }
}

// Save conversation on server shutdown
process.on('SIGINT', () => {
    if (conversationLog.length > 0) {
        saveConversation();
    }
    process.exit();
});

app.listen(8080, () => {
    console.log('Q CLI UI running at http://localhost:8080');
});
