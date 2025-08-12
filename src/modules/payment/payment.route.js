import express from 'express';
import {
  initializeCoursePaymentController,
  verifyCoursePaymentController,
  getCoursePaymentController,
  getStudentPaymentsController,
  getEducatorSalesController,
  checkCourseOwnershipController,
  getOwnedCoursesController,
  getCourseAnalyticsController,
  getEducatorAnalyticsController,
  refundCoursePaymentController,
  getPaymentStatisticsController,
} from './payment.controller.js';
import passport from 'passport';

const router = express.Router();

// Initialize course payment
router.post(
  '/initialize',
  passport.authenticate('jwt', { session: false }),
  initializeCoursePaymentController
);

// Verify course payment
router.get('/verify/:reference/status', verifyCoursePaymentController);

// Get specific payment details
router.get(
  '/payment/:reference',
  passport.authenticate('jwt', { session: false }),
  getCoursePaymentController
);

// Student-specific routes
router.get(
  '/my-purchases',
  passport.authenticate('jwt', { session: false }),
  getStudentPaymentsController
);
// router.get(
//   '/owned-courses',
//   passport.authenticate('jwt', { session: false }),
//   getOwnedCoursesController
// );
router.get(
  '/check-ownership/:courseId',
  passport.authenticate('jwt', { session: false }),
  checkCourseOwnershipController
);

// // Educator-specific routes (requires educator role)
// router.get(
//   '/my-sales',
//   authorize(['educator', 'admin']),
//   getEducatorSalesController
// );
// router.get(
//   '/analytics/overview',
//   authorize(['educator', 'admin']),
//   getEducatorAnalyticsController
// );
// router.get(
//   '/analytics/course/:courseId',
//   authorize(['educator', 'admin']),
//   getCourseAnalyticsController
// );

// // Admin-only routes
// router.post(
//   '/refund/:reference',
//   authorize(['admin']),
//   refundCoursePaymentController
// );
// router.get('/statistics', authorize(['admin']), getPaymentStatisticsController);

export default router;
