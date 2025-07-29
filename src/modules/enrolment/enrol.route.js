import express from 'express';
import { courseEnrollmentController } from './enrol.controller.js';

const router = express.Router();

router.post('/enrol', courseEnrollmentController);

export default router;
