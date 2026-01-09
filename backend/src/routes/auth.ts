import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { generateToken, generateCentrifugoToken } from '../services/jwt';

const router = Router();

// Simple in-memory user store
const users = new Map<string, { id: string; name: string }>();

// Login/Register - simplified: just provide a username
router.post('/login', (req: Request, res: Response) => {
  const { username } = req.body;

  if (!username || typeof username !== 'string' || username.trim().length === 0) {
    res.status(400).json({ error: 'Username is required' });
    return;
  }

  const trimmedName = username.trim();

  // Check if user exists by name, or create new
  let user = Array.from(users.values()).find(u => u.name === trimmedName);

  if (!user) {
    user = {
      id: uuidv4(),
      name: trimmedName,
    };
    users.set(user.id, user);
  }

  const token = generateToken(user.id, user.name);
  const centrifugoToken = generateCentrifugoToken(user.id, user.name);

  res.json({
    user: {
      id: user.id,
      name: user.name,
    },
    token,
    centrifugoToken,
  });
});

export default router;
