const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const path = require('path');
const app = express();


const MONGO_URI = 'mongodb+srv://fozcipi:FoxAizen@fozcipix.jwrkv44.mongodb.net/webci?retryWrites=true&w=majority&appName=fozcipix'; 

mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));


const videoSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true, index: true },
  embedUrl: String
});
const Video = mongoose.model('Video', videoSchema);

const bannedIPSchema = new mongoose.Schema({
  ip: { type: String, required: true, unique: true, index: true },
  bannedAt: { type: Date, default: Date.now }
});
const BannedIP = mongoose.model('BannedIP', bannedIPSchema);



function isPrivateIP(ip) {
    if (!ip) return false;
    
    if (ip.includes('::ffff:')) {
        ip = ip.split('::ffff:')[1];
    }
   
    if (ip === '127.0.0.1' || ip === '::1') return true;

    const parts = ip.split('.');
    if (parts.length === 4) {
        const first = parseInt(parts[0], 10);
        const second = parseInt(parts[1], 10);
        if (first === 10) return true;
        if (first === 172 && second >= 16 && second <= 31) return true;
        if (first === 192 && second === 168) return true;
    }

    if (ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80')) return true;

    return false;
}

const getClientIP = (req) => {
    
    const platformHeaders = [
        'cf-connecting-ip', 
        'true-client-ip',   
        'x-real-ip',        
        
    ];
    for (const header of platformHeaders) {
        const headerIp = req.headers[header];
        if (headerIp && !isPrivateIP(String(headerIp).split(',')[0].trim())) {
             
             const potentialIp = String(headerIp).split(',')[0].trim();
             // console.log(`IP from header '${header}': ${potentialIp}`); 
             return potentialIp;
        }
    }

   
    const reqIp = req.ip;
    if (reqIp && !isPrivateIP(reqIp)) {
        // console.log(`IP from req.ip: ${reqIp}`); 
       
        return reqIp.includes('::ffff:') ? reqIp.split('::ffff:')[1] : reqIp;
    }

  
    const xff = req.headers['x-forwarded-for'];
    if (xff) {
        const ips = String(xff).split(',');
        for (let ip of ips) {
            ip = ip.trim();
            if (ip && !isPrivateIP(ip)) {
                // console.log(`IP from XFF parse: ${ip}`); 
                return ip.includes('::ffff:') ? ip.split('::ffff:')[1] : ip;
            }
        }
    }

   
    const remoteAddress = req.connection?.remoteAddress || req.socket?.remoteAddress;
    // console.warn(`Falling back to remoteAddress: ${remoteAddress}`); 
    if (remoteAddress) {
       return remoteAddress.includes('::ffff:') ? remoteAddress.split('::ffff:')[1] : remoteAddress;
    }

    console.error("Could not determine client IP address from request.");
    return null; 
};



const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 26,
  keyGenerator: (req, res) => {
    const ip = getClientIP(req);
    if(!ip) {
        console.warn("Rate Limiter Keygen: Could not determine IP. Using fallback key.");
        return 'unknown-ip-rl'; // Consistent key for unknown IPs
    }
    return ip;
  },
  handler: async (req, res ) => {
    const ip = getClientIP(req); 
    if (!ip) {
        console.warn('Rate limit handler: Could not determine client IP for banning.');
        return res.status(429).send('Too many requests.');
    }
    if (isPrivateIP(ip)) {
        
        console.warn(`Rate limit triggered by private IP ${ip}. Not banning automatically.`);
        return res.status(429).send('Too many requests.');
    }

    try {
        const existingBan = await BannedIP.findOne({ ip });
        if (!existingBan) {
            await BannedIP.create({ ip });
            console.log(`IP ${ip} banned due to rate limiting.`);
            res.status(429).send('Too many requests. You are now banned');
        } else {
            res.status(429).send('Too many requests.');
        }
    } catch (error) {
        
        if (error.code === 11000) {
             console.warn(`Rate limit handler: Tried to ban already banned IP ${ip} (likely race condition).`);
             res.status(429).send('Too many requests [banned.]');
        } else {
            console.error(`Error banning IP ${ip} after rate limit:`, error);
            res.status(500).send('Server error during rate limit handling.');
        }
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
});


const checkBannedIP = async (req, res, next) => {
  const ip = getClientIP(req);
  if (!ip) {
      console.warn('Ban Check: Could not determine client IP.');
      return res.status(400).send('Could not identify your IP address.');
  }
  
  if (isPrivateIP(ip)) {
  
      return next(); 
  }

  try {
      const banned = await BannedIP.findOne({ ip });
      if (banned) {
          console.log(`Blocked banned IP: ${ip}`);
          return res.status(403).send('Access denied. reason: banned by spam detector.');
      }
      next();
  } catch (error) {
      console.error(`Error checking banned IP ${ip}:`, error);
      return res.status(500).send('Server error checking ban status.');
  }
};


app.use(limiter);
app.use(checkBannedIP);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));


app.post('/api/video/random', async (req, res) => {
  try {
    const count = await Video.countDocuments();
    if (count === 0) return res.status(404).json({ error: 'No videos found' });

    const randomIndex = Math.floor(Math.random() * count);
    const randomVideo = await Video.findOne().skip(randomIndex);

    if (!randomVideo) return res.status(404).json({ error: 'Video not found' });

    const nextVideo = await Video.findOne({ id: { $gt: randomVideo.id } }).sort({ id: 1 });
    const prevVideo = await Video.findOne({ id: { $lt: randomVideo.id } }).sort({ id: -1 });

    res.json({
      current: randomVideo,
      nextId: nextVideo ? nextVideo.id : null,
      prevId: prevVideo ? prevVideo.id : null
    });
  } catch (error) {
    console.error("Error fetching random video:", error);
    res.status(500).json({ error: 'Internal server error' });
  }
});


app.post('/api/video', async (req, res) => {
  if (typeof req.body.id !== 'number' || !Number.isInteger(req.body.id)) {
     return res.status(400).json({ error: 'Invalid video ID format' });
  }
  const id = req.body.id;

  try {
    const video = await Video.findOne({ id: id });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const nextVideo = await Video.findOne({ id: { $gt: video.id } }).sort({ id: 1 });
    const prevVideo = await Video.findOne({ id: { $lt: video.id } }).sort({ id: -1 });

    res.json({
      current: video,
      nextId: nextVideo ? nextVideo.id : null,
      prevId: prevVideo ? prevVideo.id : null
    });
  } catch (error) {
    console.error(`Error fetching video ID ${id}:`, error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



app.use((req, res, next) => {
    res.status(404).send("Sorry, can't find that!");
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
  
