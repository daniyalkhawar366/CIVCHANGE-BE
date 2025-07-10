import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import Stripe from 'stripe';
import { Usermodel } from '../models/User.js';
import jwt from 'jsonwebtoken';

console.log('Stripe key:', process.env.STRIPE_SECRET_KEY); // DEBUG: Print Stripe secret key

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Require auth middleware (reuse from convert.js)
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

// Stripe price IDs (use lowercase keys to match frontend)
const PRICE_IDS = {
  basic: 'price_1RjGSnPrec2YpLNj8oph41sa',    // Starter
  pro: 'price_1RjGTMPrec2YpLNjO7wj82r1',      // Pro
  premium: 'price_1RjGTjPrec2YpLNjUVF74uJR'   // Business
};

// === FRONTEND TEAM PROMPT ===
// When calling /api/payments/create-checkout or /api/payments/upgrade, use one of these plan names in the request body:
// { plan: 'basic' }   // for Starter ($10)
// { plan: 'pro' }     // for Pro ($29)
// { plan: 'premium' } // for Business ($99)
// ===========================

// Helper to get plan rank
function planRank(plan) {
  if (plan === 'Starter') return 1;
  if (plan === 'Pro') return 2;
  if (plan === 'Business') return 3;
  if (plan === 'enterprise') return 4;
  return 0;
}

// Conversion limits per plan
const PLAN_LIMITS = {
  Starter: 20,
  Pro: 50,
  Business: 200
};

// POST /api/payments/create-checkout
router.post('/create-checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const user = req.user;

  if (!['basic', 'pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  const priceId = PRICE_IDS[plan];
  console.log('Stripe Checkout Debug:', { plan, priceId }); // Debug print
  if (!priceId) return res.status(400).json({ error: 'Plan not available' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription', // Changed from 'payment' to 'subscription'
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: user.email,
      success_url: `${process.env.FRONTEND_URL}/account?success=1`,
      cancel_url: `${process.env.FRONTEND_URL}/account?canceled=1`,
      metadata: {
        userId: user._id.toString(),
        plan
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    const plan = session.metadata.plan;
    const isUpgrade = session.metadata.upgrade === 'true' || session.metadata.upgrade === true;
    try {
      const user = await Usermodel.findById(userId);
      if (!user) return res.status(404).send('User not found');
      if (!['basic', 'pro', 'premium'].includes(plan)) return res.status(400).send('Invalid plan');
      user.plan = plan;
      user.conversionsLeft = PLAN_LIMITS[plan];
      if (session.customer) user.stripeCustomerId = session.customer;
      await user.save();
      console.log(`User ${user.email} upgraded to ${plan}`);
    } catch (err) {
      console.error('Failed to update user after payment:', err);
      return res.status(500).send('Failed to update user');
    }
  }
  res.status(200).send('Received');
});

// POST /api/payments/upgrade
router.post('/upgrade', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const user = req.user;

  if (!['basic', 'pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  if (planRank(plan) <= planRank(user.plan)) {
    return res.status(403).json({ error: 'You can only upgrade to a higher plan.' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(400).json({ error: 'Plan not available' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: user.email,
      success_url: `${process.env.FRONTEND_URL}/account?success=1`,
      cancel_url: `${process.env.FRONTEND_URL}/account?canceled=1`,
      metadata: {
        userId: user._id.toString(),
        plan,
        upgrade: true
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create upgrade session' });
  }
});

export default router; 