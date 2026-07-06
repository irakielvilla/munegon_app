const { spawn } = require('child_process');
const fs = require('fs');

const child = spawn('codebase-memory-mcp', [], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';
child.stdout.on('data', (data) => {
    buffer += data.toString();
    const messages = buffer.split('\n');
    buffer = messages.pop();
    for (const msg of messages) {
        if (!msg.trim()) continue;
        try {
            const obj = JSON.parse(msg);
            if (obj.id === 1) {
                fs.writeFileSync('architecture.json', JSON.stringify(obj, null, 2));
                child.kill();
                process.exit(0);
            }
        } catch (e) {}
    }
});

const req = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
        name: "get_architecture",
        arguments: {
            project: "C-Users-iraki-Desktop-MUNEGO-1-MUNEGO-1"
        }
    }
};

child.stdin.write(JSON.stringify(req) + '\n');
