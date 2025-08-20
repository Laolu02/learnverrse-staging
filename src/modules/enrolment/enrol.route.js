import express from 'express';
import { courseEnrollmentController } from './enrol.controller.js';
import passport from 'passport';

const router = express.Router();

router.post(
  '/enrol',
  passport.authenticate('jwt', { session: false }),
  courseEnrollmentController
);

export default router;
