import express from 'express';
import { createServer as createViteServer } from 'vite';
import multer from 'multer';
import { GoogleGenAI, Type } from '@google/genai';
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const upload = multer({ storage: multer.memoryStorage() });

let firebaseApp: admin.app.App | null = null;

function getFirebaseDb() {
  if (!firebaseApp) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase credentials are not fully configured in environment variables.');
    }

    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
    });
  }
  return admin.firestore(firebaseApp);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  app.post('/api/report-logo', async (req, res) => {
    try {
      const { analysis, imageBase64, mimeType } = req.body;
      
      if (!analysis || !imageBase64) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const db = getFirebaseDb();
      
      const reportRef = db.collection('suspicious_logos').doc();
      await reportRef.set({
        analysis,
        imageBase64, // In a real app, store this in Cloud Storage and save the URL
        mimeType,
        reportedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'pending_review'
      });

      res.json({ success: true, reportId: reportRef.id });
    } catch (error: any) {
      console.error('Error reporting logo:', error);
      res.status(500).json({ error: error.message || 'Failed to report logo' });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
