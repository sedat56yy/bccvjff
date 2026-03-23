import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import path from 'path';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(cookieParser());

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-key-for-dev';

// In-memory DB for settings
const settingsDb = new Map();

app.get('/api/auth/url', (req, res) => {
  const redirectUri = req.query.redirectUri as string;
  if (!redirectUri) {
    return res.status(400).json({ error: 'Missing redirectUri parameter' });
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return res.status(500).json({ error: 'Lütfen Settings menüsünden DISCORD_CLIENT_ID ve DISCORD_CLIENT_SECRET değişkenlerini ayarlayın.' });
  }

  const state = Buffer.from(JSON.stringify({ redirectUri })).toString('base64');
  const url = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=identify%20guilds&state=${state}`;
  res.json({ url });
});

app.get(['/auth/callback', '/auth/callback/'], async (req, res) => {
  const { code, state } = req.query;
  
  let redirectUri = '';
  try {
    if (state) {
      const decodedState = JSON.parse(Buffer.from(state as string, 'base64').toString('utf-8'));
      redirectUri = decodedState.redirectUri;
    }
  } catch (e) {
    return res.status(400).send('Invalid state parameter');
  }

  if (!redirectUri) {
    return res.status(400).send('Missing redirect URI in state');
  }

  if (!code) {
    return res.status(400).send('No code provided by Discord');
  }
  
  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID!,
        client_secret: process.env.DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: redirectUri,
      })
    });
    
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenData.error_description || 'Failed to get token');

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const userData = await userRes.json();

    const token = jwt.sign({
      id: userData.id,
      username: userData.username,
      avatar: userData.avatar,
      accessToken: tokenData.access_token
    }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'none',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.send(`
      <html>
        <body>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Authentication successful. You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    res.status(500).send(`Authentication failed: ${error.message}`);
  }
});

const requireAuth = (req: any, res: any, next: any) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

app.get('/api/me', requireAuth, (req: any, res: any) => {
  res.json({ id: req.user.id, username: req.user.username, avatar: req.user.avatar });
});

app.get('/api/guilds', requireAuth, async (req: any, res: any) => {
  try {
    const guildRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${req.user.accessToken}` }
    });
    const guilds = await guildRes.json();
    if (!guildRes.ok) throw new Error('Failed to fetch guilds');
    
    // Filter for Manage Server permission (0x20)
    const adminGuilds = guilds.filter((g: any) => (BigInt(g.permissions) & BigInt(0x20)) === BigInt(0x20));
    res.json(adminGuilds);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/guild/:id', requireAuth, async (req: any, res: any) => {
  const guildId = req.params.id;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  
  let channels = [];
  let roles = [];
  let guildDetails = { id: guildId, name: 'Unknown Server', memberCount: 0, icon: null };

  if (botToken) {
    try {
      const gRes = await fetch(`https://discord.com/api/guilds/${guildId}?with_counts=true`, { headers: { Authorization: `Bot ${botToken}` } });
      const cRes = await fetch(`https://discord.com/api/guilds/${guildId}/channels`, { headers: { Authorization: `Bot ${botToken}` } });
      const rRes = await fetch(`https://discord.com/api/guilds/${guildId}/roles`, { headers: { Authorization: `Bot ${botToken}` } });
      
      if (gRes.ok) {
        const gData = await gRes.json();
        guildDetails = { 
          id: gData.id, 
          name: gData.name, 
          icon: gData.icon ? `https://cdn.discordapp.com/icons/${gData.id}/${gData.icon}.png` : null, 
          memberCount: gData.approximate_member_count || 0 
        };
      }
      if (cRes.ok) {
        const allChannels = await cRes.json();
        channels = allChannels.filter((c: any) => c.type === 0); // Only text channels
      }
      if (rRes.ok) {
        roles = await rRes.json();
      }
    } catch (e) {
      console.error('Failed to fetch guild details from Discord', e);
    }
  }

  const settings = settingsDb.get(guildId) || {
    welcomeMsg: { enabled: false, channelId: '', message: '' },
    autoRole: null,
    logChannel: null,
    ticketChannel: null,
    protection: { antiSpam: false, antiLink: false, antiMention: false }
  };

  res.json({ guild: guildDetails, channels, roles, settings });
});

app.post('/api/guild/:id/settings', requireAuth, (req: any, res: any) => {
  const guildId = req.params.id;
  const { type, value } = req.body;
  
  let settings = settingsDb.get(guildId) || {
    welcomeMsg: { enabled: false, channelId: '', message: '' },
    autoRole: null,
    logChannel: null,
    ticketChannel: null,
    protection: { antiSpam: false, antiLink: false, antiMention: false }
  };

  if (type === 'welcomeMsg') settings.welcomeMsg = value;
  else if (type === 'autoRole') settings.autoRole = value;
  else if (type === 'logChannel') settings.logChannel = value;
  else if (type === 'ticketChannel') settings.ticketChannel = value;
  else if (type === 'protection') settings.protection = value;

  settingsDb.set(guildId, settings);
  res.json({ success: true });
});

app.get('/auth/logout', (req, res) => {
  res.clearCookie('auth_token', { secure: true, sameSite: 'none' });
  res.redirect('/');
});

async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.join(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

start();
