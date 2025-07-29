import { Router } from 'express';
import authRoutes from '../modules/auth/auth.route.js';
import courseRoutes from '../modules/course/routes/index.js';
import progressRoutes from '../modules/course-progress/course.progress.route.js';
import enrollmentRoutes from '../modules/enrolment/enrol.route.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/courses', courseRoutes);
router.use('/progress', progressRoutes);
router.use('/enrollment', enrollmentRoutes);

export default router;
