/**
 * api/publish.js
 * Vercel Serverless Function for publishing Dashboard updates to GitHub.
 * Triggers automatic Vercel redeployment when a commit is pushed to main.
 */

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Passcode, X-GitHub-Token');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const passcode = req.headers['x-upload-passcode'] || body.passcode;

    // Verify Passcode
    if (passcode !== '1212312121') {
      return res.status(403).json({
        success: false,
        error: 'รหัสผ่านสำหรับการเผยแพร่ไม่ถูกต้อง (Passcode Invalid)'
      });
    }

    const repoOwner = 'c3psctm01-beep';
    const repoName = 'Dashboard_Constrution_Report';
    const branch = 'main';

    // GitHub token from environment, header, or request body
    const token = process.env.GITHUB_TOKEN || req.headers['x-github-token'] || body.githubToken;

    if (!token) {
      return res.status(200).json({
        success: false,
        needVercelConfig: true,
        message: 'กรุณาใส่ GitHub Token ในช่องตั้งค่า หรือตั้งค่า GITHUB_TOKEN ใน Vercel Environment Variables'
      });
    }

    const dataset = body.dataset;
    if (!dataset) {
      return res.status(400).json({ success: false, error: 'ไม่พบชุดข้อมูลสำหรับเผยแพร่' });
    }

    const fileName = dataset.fileName || 'สถานะงานก่อสร้าง.xlsx';
    const nowMs = Date.now();
    const nowText = new Date().toLocaleString('th-TH');

    const meta = {
      id: new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 15),
      fileName: fileName,
      lastUpdated: dataset.lastUpdated || nowText,
      savedAt: nowMs,
      savedAtText: nowText,
      uploadedBy: dataset.uploadedBy || 'กบส.'
    };

    // Helper: update or create file in GitHub repo
    async function putFile(path, contentStr, message) {
      const getUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}?ref=${branch}`;
      let sha = undefined;
      const getRes = await fetch(getUrl, {
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'PEA-Dashboard'
        }
      });
      if (getRes.ok) {
        const fileJson = await getRes.json();
        sha = fileJson.sha;
      }

      const putUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${path}`;
      const putRes = await fetch(putUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'PEA-Dashboard'
        },
        body: JSON.stringify({
          message: message,
          content: Buffer.from(contentStr, 'utf-8').toString('base64'),
          branch: branch,
          sha: sha
        })
      });

      if (!putRes.ok) {
        const errJson = await putRes.json().catch(() => ({}));
        throw new Error(errJson.message || `GitHub error HTTP ${putRes.status}`);
      }
      return putRes.json();
    }

    // 1. Commit data/latest_data.json
    await putFile(
      'data/latest_data.json',
      JSON.stringify(dataset, null, 2),
      `data: publish ${fileName} [Vercel Web Publish]`
    );

    // 2. Commit data/metadata.json
    await putFile(
      'data/metadata.json',
      JSON.stringify(meta, null, 2),
      `data: update metadata for ${fileName}`
    );

    return res.status(200).json({
      success: true,
      message: 'เผยแพร่ข้อมูลขึ้น GitHub สำเร็จ! ระบบ Vercel กำลังอัปเดตเว็บให้อัตโนมัติ (ประมาณ 1 นาที)',
      savedAt: nowMs
    });
  } catch (err) {
    console.error('Publish error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
