import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import centrifugoRoutes from './routes/centrifugo';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true,
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/centrifugo', centrifugoRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log('Endpoints:');
  console.log('  POST /api/auth/login - Login with username');
  console.log('  POST /centrifugo/connect - Centrifugo connect proxy');
  console.log('  POST /centrifugo/subscribe - Centrifugo subscribe proxy');
  console.log('  POST /centrifugo/publish - Centrifugo publish proxy');
});
