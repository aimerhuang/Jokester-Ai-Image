module.exports = {
  apps: [
    {
      name: 'jokester-ai-image',
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0',
      cwd: __dirname,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
}
