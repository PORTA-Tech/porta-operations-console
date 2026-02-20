#!/usr/bin/env node

const { execSync } = require('child_process');

const token = process.env.GITHUB_TOKEN;
const requireToken = process.argv.includes('--require-token');

if (!token) {
  if (requireToken) {
    console.error('GITHUB_TOKEN is required');
    process.exit(1);
  }

  console.log('[preinstall] GITHUB_TOKEN not set; skipping git auth rewrite.');
  process.exit(0);
}

const replacement = `https://x-access-token:${token}@github.com/`;
const patterns = [
  'ssh://git@github.com/',
  'ssh://git@github.com',
  'git@github.com:',
  'https://github.com/'
];

for (const pattern of patterns) {
  execSync(`git config --global url."${replacement}".insteadOf "${pattern}"`, { stdio: 'ignore' });
}

console.log('[preinstall] Configured git URL rewrite for GitHub using GITHUB_TOKEN.');
