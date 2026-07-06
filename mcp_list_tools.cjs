const { spawn } = require('child_process');

const child = spawn('codebase-memory-mcp', [], {
    stdio: ['pipe', 'pipe', 'pipe']
});

child.stdout.on('data', (data) => {
    const messages = data.toString().split('\n').filter(l => l.trim());
    for (const msg of messages) {
        try {
            const obj = JSON.parse(msg);
            if (obj.id === 1) {
                console.log(JSON.stringify(obj, null, 2));
                child.kill();
                process.exit(0);
            }
        } catch (e) {
            // ignore non-json like logs
        }
    }
});

child.stderr.on('data', (data) => {
    // console.error(data.toString());
});

const req = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
};

child.stdin.write(JSON.stringify(req) + '\n');
