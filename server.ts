import express from 'express';
import type { Request } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import { google } from 'googleapis';
import fs from 'fs';

import multer from 'multer';
import type { File as MulterFile } from 'multer';
import open from 'open';
// Pour que req.file soit reconnu par TypeScript
interface MulterRequest extends Request {
  file: MulterFile;
}
import readline from 'readline';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/google/callback' // Utilisé pour le serveur local
);

// Affiche l'URL d'auth Google dans le terminal au démarrage
(async () => {
  const { google } = await import('googleapis');
  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  const SCOPES = [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
  ];
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  console.log('\n=== URL d\'authentification Google à copier/coller dans ton navigateur ===\n');
  console.log(authUrl + '\n');
})();
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors()); // Autorise les requêtes cross-origin pour accès mobile
  app.use(express.json());
  app.use('/uploads', express.static(uploadsDir));

  // --- Database Initialization & Mock Fallback ---
  let isMockMode = false;
  const mockDb = {
    clients: [] as any[],
    invoices: [] as any[],
    media: [] as any[],
    user_tokens: {} as Record<string, any>
  };

  const initDb = async () => {
    console.log('Tentative de connexion à PostgreSQL...');
    try {
      // On teste la connexion avec un timeout court
      const client = await pool.connect();
      console.log('Connecté à PostgreSQL avec succès');
      
      await client.query(`
        CREATE TABLE IF NOT EXISTS clients (
          id SERIAL PRIMARY KEY,
          nom TEXT NOT NULL,
          telephone TEXT,
          adresse TEXT,
          email TEXT,
          notes TEXT
        );

        CREATE TABLE IF NOT EXISTS invoices (
          id SERIAL PRIMARY KEY,
          vendor TEXT NOT NULL,
          date DATE,
          subtotal NUMERIC,
          tps NUMERIC,
          tvq NUMERIC,
          total NUMERIC,
          category TEXT,
          tps_number TEXT,
          tvq_number TEXT,
          uid TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS media (
          id SERIAL PRIMARY KEY,
          uid TEXT NOT NULL,
          title TEXT,
          description TEXT,
          embedding JSONB,
          url TEXT,
          type TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS user_tokens (
          uid TEXT PRIMARY KEY,
          access_token TEXT,
          refresh_token TEXT,
          expiry_date BIGINT,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      client.release();
      console.log('Tables PostgreSQL vérifiées/créées');
    } catch (err) {
      console.warn('⚠️ PostgreSQL n\'est pas accessible (Normal en mode Cloud Preview). Passage en mode Mock (In-Memory).');
      isMockMode = true;
    }
  };
  
  initDb();

  // --- API Routes ---

  // Clients
  app.get('/api/clients', async (req, res) => {
    try {
      if (isMockMode) return res.json(mockDb.clients);
      const result = await pool.query('SELECT * FROM clients ORDER BY nom ASC');
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/clients', async (req, res) => {
    const { nom, telephone, adresse, email, notes } = req.body;
    try {
      if (isMockMode) {
        const newClient = { id: mockDb.clients.length + 1, nom, telephone, adresse, email, notes };
        mockDb.clients.push(newClient);
        return res.json(newClient);
      }
      const result = await pool.query(
        'INSERT INTO clients (nom, telephone, adresse, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [nom, telephone, adresse, email, notes]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Invoices
  app.get('/api/invoices', async (req, res) => {
    const { uid } = req.query;
    try {
      if (isMockMode) return res.json(mockDb.invoices.filter(i => i.uid === uid));
      const result = await pool.query('SELECT * FROM invoices WHERE uid = $1 ORDER BY date DESC', [uid]);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/invoices', async (req, res) => {
    const { vendor, date, subtotal, tps, tvq, total, category, tps_number, tvq_number, uid } = req.body;
    try {
      if (isMockMode) {
        const newInvoice = { id: mockDb.invoices.length + 1, vendor, date, subtotal, tps, tvq, total, category, tps_number, tvq_number, uid, created_at: new Date().toISOString() };
        mockDb.invoices.push(newInvoice);
        return res.json(newInvoice);
      }
      const result = await pool.query(
        'INSERT INTO invoices (vendor, date, subtotal, tps, tvq, total, category, tps_number, tvq_number, uid) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *',
        [vendor, date, subtotal, tps, tvq, total, category, tps_number, tvq_number, uid]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Media
  app.get('/api/media', async (req, res) => {
    const { uid } = req.query;
    try {
      if (isMockMode) return res.json(mockDb.media.filter(m => m.uid === uid));
      const result = await pool.query('SELECT * FROM media WHERE uid = $1 ORDER BY created_at DESC', [uid]);
      res.json(result.rows);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  app.post('/api/media', upload.single('file'), async (req, res) => {
    const { uid, title, description, embedding, type } = req.body;
    const file = (req as MulterRequest).file;
    
    try {
      const url = file ? `/uploads/${file.filename}` : req.body.url;
      const parsedEmbedding = typeof embedding === 'string' ? JSON.parse(embedding) : embedding;

      if (isMockMode) {
        const newMedia = { 
          id: mockDb.media.length + 1, 
          uid, 
          title, 
          description, 
          embedding: parsedEmbedding, 
          url, 
          type, 
          created_at: new Date().toISOString() 
        };
        mockDb.media.push(newMedia);
        return res.json(newMedia);
      }
      const result = await pool.query(
        'INSERT INTO media (uid, title, description, embedding, url, type) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [uid, title, description, JSON.stringify(parsedEmbedding), url, type]
      );
      res.json(result.rows[0]);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Auth Google
  app.get('/api/auth/google', async (req, res) => {
    const { google } = await import('googleapis');
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI // doit être http://100.84.226.26:3000/api/auth/google/callback
    );

    const SCOPES = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      prompt: 'consent',
    });

    // Ne lance plus open(authUrl), renvoie juste l'URL au frontend
    res.json({ url: authUrl });
  });

  // Route de callback pour terminer l'auth Google
  app.get('/api/auth/google/callback', async (req, res) => {
    const { google } = await import('googleapis');
    const oAuth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    const code = req.query.code as string;
    if (!code) {
      return res.status(400).send('Code manquant');
    }
    try {
      const { tokens } = await oAuth2Client.getToken(code);
      oAuth2Client.setCredentials(tokens);
      fs.writeFileSync('token.json', JSON.stringify(tokens, null, 2));
      // Redirige vers l'accueil de l'app (port 5173)
      res.redirect('http://100.84.226.26:5173');
    } catch (err) {
      res.status(500).send('Erreur lors de la récupération du token');
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Remplace l'écoute serveur si ce n'est pas déjà fait
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

// Gestion globale des erreurs pour éviter l'arrêt silencieux
process.on('uncaughtException', (err) => {
  console.error('Erreur non catchée:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Promesse rejetée non gérée:', reason);
});

startServer();
