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

const app = express();

// Trust proxy if behind a load balancer (Render sets this)
app.set('trust proxy', 1);

// Initialize Passport
app.use(passport.initialize());

// Middleware: HTTPS Redirect (Production only)
app.use((req, res, next) => {
  if (
    process.env.NODE_ENV === 'production' &&
    req.headers['x-forwarded-proto'] !== 'https'
  ) {
    return res.redirect(`https://${req.headers.host}${req.url}`);
  }
  next();
});

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"], //  Block all content loading
        scriptSrc: ["'none'"], // Block any script loading
        styleSrc: ["'none'"], // No CSS needed on an API server
        imgSrc: ["'none'"], //  No image content allowed
        connectSrc: ["'self'"], //  Only allow outbound connections to self
        frameAncestors: ["'none'"], //  Disallow embedding
      },
    },
    crossOriginEmbedderPolicy: false, // Safe to disable — avoids blocking frontend fetches
  })
);

// CORS: Restrict to production frontend domain
const allowedOrigins = [
  'https://learnverrse.github.io/learnverrse/',
  'http://localhost:5173',
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  })
);

// Body Parsing & Cookies
app.use(express.json());
app.use(cookieParser());

// Logging
app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  next();
});

// Rate Limiting Middleware (Redis)
const rateLimiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: 'middleware',
  points: 10, // Allow 10 requests
  duration: 1, // Per second
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

// API Routes
app.use('/api', routes);

// 404 Fallback
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message:
      "Lost? 🚀 That page doesn't exist — but welcome to Learnverrse! Let's explore knowledge together.",
  });
});

// Global Error Handler
app.use(errorHandler);

export default app;
