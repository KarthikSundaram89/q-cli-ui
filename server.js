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
        console.error('Q CLI stderr:', data.toString());
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
