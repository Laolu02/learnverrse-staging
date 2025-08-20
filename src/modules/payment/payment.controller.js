import mongoose from 'mongoose';
import AsyncHandler from '../../middlewares/asyncHandler.js';
import { HTTPSTATUS } from '../../configs/http.config.js';
import {
  BadRequestException,
  NotFoundException,
} from '../../utils/appError.js';
import CourseModel from '../course/model/course.model.js';
import logger from '../../utils/logger.js';
import {
  initializePaystackPayment,
  verifyPaystackPayment,
  createCoursePaymentRecord,
  updatePaymentStatus,
  getPaymentByReference,
  generateTransactionReference,
  getStudentPayments,
  getEducatorSales,
  checkCourseOwnership,
  getStudentOwnedCourses,
  handlePaystackWebhookEvent,
  verifyPaystackWebhookSignature,
  getCourseAnalytics,
} from './payment.service.js';
import { InitializeCoursePaymentSchema } from './payment.validation.js';
import { enrollInCourse } from '../enrolment/enrol.service.js';
import { initializeProgress } from '../course-progress/course.progress.service.js';

// Schema for payment initialization validation

// Initialize payment for course purchase
export const initializeCoursePaymentController = AsyncHandler(
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { courseId } = InitializeCoursePaymentSchema.parse({ ...req.body });

      // Validate course exists and is available for purchase
      const course = await CourseModel.findById(courseId).session(session);

      if (!course) {
        throw new NotFoundException('Course not found');
      }

      if (course.status !== 'PUBLISHED' || !course.isApproved) {
        throw new BadRequestException('Course is not available for purchase');
      }

      // Check if student already owns the course
      const alreadyOwned = await checkCourseOwnership(req.user._id, courseId);
      if (alreadyOwned) {
        throw new BadRequestException('You already own this course');
      }
      console.log(course.price);
      const reference = generateTransactionReference();

      const metadata = {
        courseId,
        studentId: req.user._id,
        educatorId: course.educatorId,
        courseTitle: course.title,
        studentEmail: req.user.email,
      };

      // Initialize payment with Paystack
      const paymentInitResult = await initializePaystackPayment(
        course.price,
        req.user.email,
        reference,
        metadata
      );

      // Create payment record in database
      await createCoursePaymentRecord(
        {
          student: req.user._id.toString(),
          course: courseId,
          amount: course.price,
          transactionReference: reference,
          status: 'pending',
          metadata,
        },
        session
      );

      await session.commitTransaction();
      session.endSession();

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        data: {
          authorizationUrl: paymentInitResult.authorization_url,
          accessCode: paymentInitResult.access_code,
          reference: paymentInitResult.reference,
          amount: course.price,
          courseTitle: course.title,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return next(error);
    }
  }
);

// Verify course payment
export const verifyCoursePaymentController = AsyncHandler(
  async (req, res, next) => {
    // Start a database session for transaction
    const session = await mongoose.startSession();

    try {
      const { reference } = req.params;

      if (!reference) {
        throw new BadRequestException('Payment reference is required');
      }

      // Verify payment with Paystack first
      const verificationResult = await verifyPaystackPayment(reference);

      if (verificationResult.status === 'success') {
        // Start transaction
        await session.withTransaction(async () => {
          // Step 1: Update payment status to success
          const payment = await updatePaymentStatus(
            reference,
            'success',
            verificationResult.id.toString(),
            session
          );

          if (!payment) {
            throw new BadRequestException('Payment record not found');
          }

          // Step 2: Enroll in course (idempotent - won't fail if already enrolled)
          const enrollmentResult = await enrollInCourse({
            userId: payment.student,
            courseId: payment.course,
            session,
          });

          // Step 3: Initialize progress (idempotent - won't fail if already initialized)
          const progressResult = await initializeProgress(
            payment.student,
            payment.course,
            session
          );

          // Log what actions were taken (useful for debugging)
          console.log('Enrollment result:', enrollmentResult.message);
          console.log('Progress result:', progressResult.message);
        });

        const { id, status, paid_at, amount } = verificationResult;

        return res.status(HTTPSTATUS.OK).json({
          success: true,
          message:
            'Course payment verified successfully and enrollment created',
          data: {
            transactionId: id,
            amount: amount / 100, // Convert from kobo to naira
            status,
            date: paid_at,
          },
        });
      } else {
        // Update payment status to failed (outside transaction since it's just one operation)
        await updatePaymentStatus(reference, 'failed', null);

        return res.status(HTTPSTATUS.BAD_REQUEST).json({
          success: false,
          message: 'Course payment verification failed',
          data: {
            status: verificationResult.status,
            reason: verificationResult.gateway_response,
          },
        });
      }
    } catch (error) {
      // Log the error for debugging
      console.error('Payment verification error:', error);
      return next(error);
    } finally {
      // Always end the session
      await session.endSession();
    }
  }
);

// Paystack webhook handler for course payments
export const paystackCourseWebhookController = AsyncHandler(
  async (req, res, next) => {
    try {
      // Verify webhook signature
      const signature = req.headers['x-paystack-signature'];
      if (!signature) {
        logger.error('No Paystack signature found in webhook request');
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid webhook signature',
        });
      }

      // Get the raw body
      const payload = req.body;

      const isValidSignature = verifyPaystackWebhookSignature(
        signature,
        payload
      );

      if (!isValidSignature) {
        logger.error('Invalid Paystack webhook signature');
        return res.status(HTTPSTATUS.BAD_REQUEST).json({
          success: false,
          message: 'Invalid webhook signature',
        });
      }

      // Parse the JSON body for processing
      const eventData = JSON.parse(payload.toString());

      // Process the webhook event
      await handlePaystackWebhookEvent(eventData);

      // Always respond with 200 to acknowledge receipt
      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Webhook received and processed',
      });
    } catch (error) {
      logger.error(`Webhook processing error: ${error.message}`);
      // Return 200 even on error to prevent Paystack retries for processing errors
      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Webhook received',
      });
    }
  }
);

// Get course payment details
export const getCoursePaymentController = AsyncHandler(
  async (req, res, next) => {
    try {
      const { reference } = req.params;
      const payment = await getPaymentByReference(reference);

      // Check authorization - student, educator, or admin can access
      const isAuthorized =
        payment.student._id.toString() === req.user._id.toString() ||
        payment.educator._id.toString() === req.user._id.toString() ||
        req.user.role === 'admin';

      if (!isAuthorized) {
        throw new BadRequestException(
          'You are not authorized to access this payment'
        );
      }

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        data: payment,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Get student's course purchases
export const getStudentPaymentsController = AsyncHandler(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const payments = await getStudentPayments(req.user._id, page, limit);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Course purchases retrieved successfully',
        ...payments,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Get educator's course sales
export const getEducatorSalesController = AsyncHandler(
  async (req, res, next) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;

      const sales = await getEducatorSales(req.user._id, page, limit);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Course sales retrieved successfully',
        ...sales,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Check if student owns a specific course
export const checkCourseOwnershipController = AsyncHandler(
  async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const owned = await checkCourseOwnership(req.user._id, courseId);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        data: {
          courseId,
          owned,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Get student's owned courses
export const getOwnedCoursesController = AsyncHandler(
  async (req, res, next) => {
    try {
      const ownedCourses = await getStudentOwnedCourses(req.user._id);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Owned courses retrieved successfully',
        data: ownedCourses,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Get course analytics for educator
export const getCourseAnalyticsController = AsyncHandler(
  async (req, res, next) => {
    try {
      const { courseId } = req.params;
      const { period = '30d' } = req.query;

      // Validate period
      const validPeriods = ['7d', '30d', '90d', '1y'];
      if (!validPeriods.includes(period)) {
        throw new BadRequestException(
          'Invalid period. Valid periods: 7d, 30d, 90d, 1y'
        );
      }

      const analytics = await getCourseAnalytics(
        req.user._id,
        courseId,
        period
      );

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Course analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Get educator's overall sales analytics
export const getEducatorAnalyticsController = AsyncHandler(
  async (req, res, next) => {
    try {
      const { period = '30d' } = req.query;

      // Validate period
      const validPeriods = ['7d', '30d', '90d', '1y'];
      if (!validPeriods.includes(period)) {
        throw new BadRequestException(
          'Invalid period. Valid periods: 7d, 30d, 90d, 1y'
        );
      }

      const analytics = await getCourseAnalytics(req.user._id, null, period);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Educator analytics retrieved successfully',
        data: analytics,
      });
    } catch (error) {
      return next(error);
    }
  }
);

// Refund course payment (admin only)
export const refundCoursePaymentController = AsyncHandler(
  async (req, res, next) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { reference } = req.params;
      const { reason } = req.body;

      // Only admin can process refunds
      if (req.user.role !== 'admin') {
        throw new BadRequestException(
          'Only administrators can process refunds'
        );
      }

      const payment = await getPaymentByReference(reference);

      if (!payment.canBeRefunded()) {
        throw new BadRequestException('This payment cannot be refunded');
      }

      // Update payment status to refunded
      payment.status = 'refunded';
      payment.refundReason = reason;
      payment.refundedAt = new Date();

      await payment.save({ session });

      await session.commitTransaction();
      session.endSession();

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Payment refunded successfully',
        data: {
          reference: payment.transactionReference,
          amount: payment.amount,
          refundedAt: payment.refundedAt,
          reason: payment.refundReason,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      return next(error);
    }
  }
);

// Get payment statistics (admin only)
export const getPaymentStatisticsController = AsyncHandler(
  async (req, res, next) => {
    try {
      // Only admin can access payment statistics
      if (req.user.role !== 'admin') {
        throw new BadRequestException(
          'Only administrators can access payment statistics'
        );
      }

      const { startDate, endDate } = req.query;

      const matchStage = {};
      if (startDate && endDate) {
        matchStage.createdAt = {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        };
      }

      const [totalStats, statusStats, recentPayments] = await Promise.all([
        // Overall statistics
        mongoose.model('CoursePayment').aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: null,
              totalTransactions: { $sum: 1 },
              totalRevenue: { $sum: '$amount' },
              totalPlatformFees: { $sum: '$platformFee' },
              totalEducatorEarnings: { $sum: '$educatorEarnings' },
              averageTransactionAmount: { $avg: '$amount' },
            },
          },
        ]),

        // Status breakdown
        mongoose.model('CoursePayment').aggregate([
          { $match: matchStage },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
              totalAmount: { $sum: '$amount' },
            },
          },
        ]),

        // Recent payments
        mongoose
          .model('CoursePayment')
          .find(matchStage)
          .populate('student', 'name email')
          .populate('course', 'title')
          .populate('educator', 'name')
          .sort({ createdAt: -1 })
          .limit(10),
      ]);

      return res.status(HTTPSTATUS.OK).json({
        success: true,
        message: 'Payment statistics retrieved successfully',
        data: {
          summary: totalStats[0] || {
            totalTransactions: 0,
            totalRevenue: 0,
            totalPlatformFees: 0,
            totalEducatorEarnings: 0,
            averageTransactionAmount: 0,
          },
          statusBreakdown: statusStats,
          recentPayments,
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);
