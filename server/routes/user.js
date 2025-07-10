import express from 'express';
import { Usermodel } from '../models/User.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

// Require auth middleware
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Usermodel.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

router.get('/account', requireAuth, async (req, res) => {
  const user = req.user;
  res.json({
    plan: user.plan,
    conversionsLeft: user.conversionsLeft,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionEndDate: user.subscriptionEndDate,
    pendingPlan: user.pendingPlan
  });
});

export default router; 