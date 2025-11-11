// Roblox Player Finder Proxy Server
// This server acts as a proxy between your Roblox game and Roblox's APIs

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const NodeCache = require('node-cache');
require('dotenv').config();

const app = express();
const cache = new NodeCache({ stdTTL: parseInt(process.env.CACHE_TTL_SECONDS) || 10 });

// Middleware
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS || '*',
    methods: ['GET', 'POST'],
}));
app.use(express.json());

// Roblox API Configuration
const ROBLOX_APIS = {
    presence: 'https://presence.roblox.com',
    games: 'https://games.roblox.com',
    users: 'https://users.roblox.com',
    thumbnails: 'https://thumbnails.roblox.com',
};

// Optional: Add .ROBLOSECURITY cookie for authenticated requests
const getHeaders = () => {
    const headers = {
        'Content-Type': 'application/json',
        'User-Agent': 'RobloxPlayerFinder/1.0',
    };

    if (process.env.ROBLOSECURITY) {
        headers['Cookie'] = `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`;
    }

    return headers;
};

// Rate limiting helper
const rateLimitMap = new Map();
const checkRateLimit = (ip) => {
    const now = Date.now();
    const windowMs = parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000;
    const maxRequests = parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 30;

    if (!rateLimitMap.has(ip)) {
        rateLimitMap.set(ip, []);
    }

    const requests = rateLimitMap.get(ip).filter(time => now - time < windowMs);

    if (requests.length >= maxRequests) {
        return false;
    }

    requests.push(now);
    rateLimitMap.set(ip, requests);
    return true;
};

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: Date.now() });
});

// Get user ID from username
app.post('/api/username-to-id', async (req, res) => {
    try {
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'Username required' });
        }

        // Check cache
        const cacheKey = `user_id_${username.toLowerCase()}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Request to Roblox API
        const response = await axios.post(
            `${ROBLOX_APIS.users}/v1/usernames/users`,
            {
                usernames: [username],
                excludeBannedUsers: false,
            },
            { headers: getHeaders() }
        );

        if (response.data.data && response.data.data.length > 0) {
            const user = response.data.data[0];
            const result = {
                success: true,
                userId: user.id,
                username: user.name,
                displayName: user.displayName,
            };
            cache.set(cacheKey, result);
            return res.json(result);
        }

        res.status(404).json({ success: false, error: 'User not found' });
    } catch (error) {
        console.error('Error in username-to-id:', error.message);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get user presence (what game they're playing)
app.post('/api/presence', async (req, res) => {
    try {
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { userIds } = req.body;
        if (!userIds || !Array.isArray(userIds)) {
            return res.status(400).json({ error: 'userIds array required' });
        }

        // Check cache
        const cacheKey = `presence_${userIds.join('_')}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            return res.json(cached);
        }

        // Request to Roblox Presence API
        const response = await axios.post(
            `${ROBLOX_APIS.presence}/v1/presence/users`,
            { userIds },
            { headers: getHeaders() }
        );

        const result = {
            success: true,
            userPresences: response.data.userPresences,
        };

        cache.set(cacheKey, result);
        res.json(result);
    } catch (error) {
        console.error('Error in presence:', error.message);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get game servers list
app.post('/api/servers', async (req, res) => {
    try {
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { placeId, cursor } = req.body;
        if (!placeId) {
            return res.status(400).json({ error: 'placeId required' });
        }

        let url = `${ROBLOX_APIS.games}/v1/games/${placeId}/servers/Public?limit=100`;
        if (cursor) {
            url += `&cursor=${cursor}`;
        }

        const response = await axios.get(url, { headers: getHeaders() });

        res.json({
            success: true,
            servers: response.data.data,
            nextPageCursor: response.data.nextPageCursor,
        });
    } catch (error) {
        console.error('Error in servers:', error.message);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Find which server a player is on
app.post('/api/find-player', async (req, res) => {
    try {
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ error: 'username required' });
        }

        // Step 1: Get user ID
        const userResponse = await axios.post(
            `${ROBLOX_APIS.users}/v1/usernames/users`,
            { usernames: [username], excludeBannedUsers: false },
            { headers: getHeaders() }
        );

        if (!userResponse.data.data || userResponse.data.data.length === 0) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        const userId = userResponse.data.data[0].id;
        const actualUsername = userResponse.data.data[0].name;
        const displayName = userResponse.data.data[0].displayName;

        // Step 2: Get user presence
        const presenceResponse = await axios.post(
            `${ROBLOX_APIS.presence}/v1/presence/users`,
            { userIds: [userId] },
            { headers: getHeaders() }
        );

        const presence = presenceResponse.data.userPresences[0];

        // Check if user is online and in a game
        if (presence.userPresenceType !== 2) { // 2 = In Game
            return res.json({
                success: true,
                found: false,
                userId,
                username: actualUsername,
                displayName,
                status: presence.userPresenceType === 0 ? 'Offline' :
                        presence.userPresenceType === 1 ? 'Online (Website)' :
                        presence.userPresenceType === 3 ? 'In Studio' : 'Unknown',
            });
        }

        // Check if presence has game info (depends on privacy settings)
        if (!presence.placeId) {
            return res.json({
                success: true,
                found: false,
                userId,
                username: actualUsername,
                displayName,
                status: 'In Game (Private)',
                error: 'User privacy settings prevent seeing which game they are in',
            });
        }

        const placeId = presence.placeId;
        const universeName = presence.lastLocation || 'Unknown Game';

        // Step 3: Scan servers to find the player
        let cursor = null;
        let foundServer = null;
        let scannedServers = 0;
        const maxServers = 500; // Limit scanning to prevent timeout

        while (scannedServers < maxServers) {
            let url = `${ROBLOX_APIS.games}/v1/games/${placeId}/servers/Public?limit=100`;
            if (cursor) {
                url += `&cursor=${cursor}`;
            }

            const serversResponse = await axios.get(url, { headers: getHeaders() });
            const servers = serversResponse.data.data;

            // Search for player in this batch
            for (const server of servers) {
                if (server.playerIds && server.playerIds.includes(userId)) {
                    foundServer = server;
                    break;
                }
            }

            if (foundServer) break;

            scannedServers += servers.length;
            cursor = serversResponse.data.nextPageCursor;

            if (!cursor) break; // No more servers
        }

        if (foundServer) {
            return res.json({
                success: true,
                found: true,
                userId,
                username: actualUsername,
                displayName,
                placeId,
                gameName: universeName,
                jobId: foundServer.id,
                serverInfo: {
                    playing: foundServer.playing,
                    maxPlayers: foundServer.maxPlayers,
                    fps: foundServer.fps,
                    ping: foundServer.ping,
                },
            });
        }

        // Player is in game but server not found (might be private/VIP server)
        res.json({
            success: true,
            found: false,
            userId,
            username: actualUsername,
            displayName,
            placeId,
            gameName: universeName,
            status: 'In Game (Private Server)',
            error: `Scanned ${scannedServers} servers but player not found. They might be in a private/VIP server.`,
        });

    } catch (error) {
        console.error('Error in find-player:', error.message);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Get player thumbnail
app.post('/api/thumbnail', async (req, res) => {
    try {
        if (!checkRateLimit(req.ip)) {
            return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { userId, size, type } = req.body;
        if (!userId) {
            return res.status(400).json({ error: 'userId required' });
        }

        const thumbnailSize = size || '420x420';
        const thumbnailType = type || 'avatar';

        const endpoint = thumbnailType === 'avatar'
            ? `${ROBLOX_APIS.thumbnails}/v1/users/avatar?userIds=${userId}&size=${thumbnailSize}&format=Png`
            : `${ROBLOX_APIS.thumbnails}/v1/users/avatar-headshot?userIds=${userId}&size=${thumbnailSize}&format=Png`;

        const response = await axios.get(endpoint, { headers: getHeaders() });

        if (response.data.data && response.data.data.length > 0) {
            return res.json({
                success: true,
                imageUrl: response.data.data[0].imageUrl,
            });
        }

        res.status(404).json({ success: false, error: 'Thumbnail not found' });
    } catch (error) {
        console.error('Error in thumbnail:', error.message);
        res.status(500).json({ error: 'Internal server error', details: error.message });
    }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Proxy server running on port ${PORT}`);
    console.log(`📡 Endpoints available:`);
    console.log(`   - POST /api/username-to-id`);
    console.log(`   - POST /api/presence`);
    console.log(`   - POST /api/servers`);
    console.log(`   - POST /api/find-player`);
    console.log(`   - POST /api/thumbnail`);
    console.log(`   - GET /health`);
});
