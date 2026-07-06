const { spawnSync } = require('child_process');
const result = spawnSync('codebase-memory-mcp', ['cli', 'index_repository', '{"repo_path":"C:/Users/iraki/Desktop/MUNEGO~1/MUNEGO~1"}'], {stdio: 'inherit'});
process.exit(result.status);
