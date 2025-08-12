import express from 'express';
import passport from 'passport';
import './configs/passport.config.js';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import redis from './redis/index.js';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import routes from './routes/index.js';
import errorHandler from './middlewares/errorHandler.middleware.js';
import logger from './utils/logger.js';
import { paystackCourseWebhookController } from './modules/payment/payment.controller.js';

const app = express();

// Trust proxy if behind a load balancer
app.set('trust proxy', 1);

// Passport
app.use(passport.initialize());

// HTTPS Redirect in production
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

// Helmet Security
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Config
const allowedOrigins = [
  'https://learnverrse.github.io',
  'http://localhost:5173',
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
};

// This works and avoids path-to-regexp errors
// app.use('/api', cors(corsOptions), routes);

// Public webhook route for Paystack
app.post(
  '/api/paystack/webhook',
  express.raw({ type: '*/*' }),
  async (req, res, next) => {
    logger.info(`Received ${req.method} request to ${req.url}`);
    next();
  },
  paystackCourseWebhookController
);

// Body & cookies
app.use(express.json());
app.use(cookieParser());

// Apply CORS
app.use(cors(corsOptions));

// Logging
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  next();
});

// Rate Limiting
const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'middleware',
  points: 10,
  duration: 1,
});

app.use((req, res, next) => {
  rateLimiter
    .consume(req.ip)
    .then(() => next())
    .catch(() => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
      res.status(429).json({ success: false, message: 'Too many requests' });
    });
});

// Routes
app.use('/api', routes);

// 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message:
      "Lost? 🚀 That page doesn't exist — but welcome to Learnverrse! Let's explore knowledge together.",
  });
});

// Error handler
app.use(errorHandler);

export default app;
