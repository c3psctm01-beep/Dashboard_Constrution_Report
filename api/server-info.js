/**
 * api/server-info.js
 * Vercel Serverless Function to report environment info
 */

export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  res.status(200).json({
    serverMode: false,
    isVercel: true,
    hasTokenConfigured: !!process.env.GITHUB_TOKEN,
    serverTime: Date.now()
  });
}
