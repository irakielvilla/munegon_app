const { spawnSync } = require('child_process');
const result = spawnSync('codebase-memory-mcp', ['cli', 'get_architecture', '{"project_name":"C-Users-iraki-Desktop-MUNEGO-1-MUNEGO-1"}'], {stdio: 'inherit'});
process.exit(result.status);
