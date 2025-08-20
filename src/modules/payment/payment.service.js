import dotenv from 'dotenv';
dotenv.config();
import crypto from 'crypto';
import mongoose from 'mongoose';
import CoursePayment from './payment.model.js';
import CourseModel from '../../modules/course/model/course.model.js';
import logger from '../../utils/logger.js';
import {
  InternalServerException,
  BadRequestException,
  NotFoundException,
} from '../../utils/appError.js';

import Paystack from 'paystack';
import { enrollInCourse } from '../enrolment/enrol.service.js';
import { initializeProgress } from '../course-progress/course.progress.service.js';

// Initialize Paystack with the secret key
const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY || '';
const paystack = Paystack(paystackSecretKey);

// Initialize Paystack payment for course purchase
export const initializePaystackPayment = async (
  amount,
  email,
  reference,
  metadata = {}
) => {
  try {
    const paymentData = {
      amount: amount * 100, // Paystack expects amount in kobo
      email: email,
      reference: reference || generateTransactionReference(),
      metadata: metadata,
    };

    const response = await paystack.transaction.initialize(paymentData);

    console.log(response);

    if (!response.status) {
      logger.error(
        `Failed to initialize Paystack payment: ${JSON.stringify(response)}`
      );
      throw new InternalServerException('Failed to initialize payment');
    }

    return response.data;
  } catch (error) {
    logger.error(`Error initializing Paystack payment: ${error}`);
    throw new InternalServerException('Payment service unavailable');
  }
};

// Verify Paystack payment transaction
export const verifyPaystackPayment = async (reference) => {
  try {
    const response = await paystack.transaction.verify(reference);

    if (!response.status) {
      logger.error(
        `Failed to verify Paystack payment: ${JSON.stringify(response)}`
      );
      throw new BadRequestException('Failed to verify payment');
    }

    return response.data;
  } catch (error) {
    logger.error(`Error verifying Paystack payment: ${error}`);
    throw new InternalServerException(
      'Payment verification service unavailable'
    );
  }
};

// Create a course payment record
export const createCoursePaymentRecord = async (
  paymentData,
  session = null
) => {
  try {
    // Validate that the course exists and get course details
    const course = await CourseModel.findById(paymentData.course).session(
      session
    );

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    // Ensure the course is published and approved
    if (course.status !== 'PUBLISHED' || !course.isApproved) {
      throw new BadRequestException('Course is not available for purchase');
    }

    // Check if student already owns the course
    const existingPayment = await CoursePayment.findOne({
      student: paymentData.student,
      course: paymentData.course,
      status: 'success',
    }).session(session);

    if (existingPayment) {
      throw new BadRequestException('You already own this course');
    }

    const payment = new CoursePayment({
      ...paymentData,
      educator: course.educatorId,
      platform: paymentData.platform || 'Paystack',
    });

    await payment.save({ session });

    return payment;
  } catch (error) {
    logger.error(`Error creating course payment record: ${error}`);
    if (error instanceof mongoose.Error.ValidationError) {
      throw new BadRequestException(error.message);
    }
    if (
      error instanceof BadRequestException ||
      error instanceof NotFoundException
    ) {
      throw error;
    }
    throw new InternalServerException('Failed to create payment record');
  }
};

// Update payment status
export const updatePaymentStatus = async (
  reference,
  status,
  transactionId = null,
  session = null
) => {
  try {
    // Use upsert with specific conditions to handle race conditions
    const filter = {
      transactionReference: reference,
      // Only update if status is not already at target or higher
      $or: [
        { status: { $ne: status } },
        { transactionId: { $exists: false } },
        { transactionId: null },
      ],
    };

    const updateData = {
      $set: {
        status,
        updatedAt: new Date(),
        ...(transactionId && { transactionId }),
      },
    };

    let query = CoursePayment.findOneAndUpdate(filter, updateData, {
      new: true,
      runValidators: true,
      upsert: false, // Don't create if doesn't exist
    });

    if (session) {
      query = query.session(session);
    }

    const payment = await query;

    if (!payment) {
      // Check if payment exists but wasn't updated due to filter conditions
      const existingPayment = await CoursePayment.findOne({
        transactionReference: reference,
      }).session(session);

      if (!existingPayment) {
        throw new BadRequestException('Payment record not found');
      }

      // Payment exists but already in desired state
      return payment;
    }

    logger.info(`Payment ${reference} status updated to ${status}`);

    return payment;
  } catch (error) {
    logger.error(
      `Error updating payment status for ${reference}: ${error.message}`,
      {
        reference,
        status,
        transactionId,
        error: error.stack,
      }
    );

    if (error instanceof BadRequestException) throw error;
    throw new InternalServerException('Failed to update payment status');
  }
};

// Get payment by transaction reference
export const getPaymentByReference = async (reference) => {
  try {
    const payment = await CoursePayment.findOne({
      transactionReference: reference,
    })
      .populate('student', 'name email')
      .populate('educator', 'name email')
      .populate('course', 'title description price image level category');

    if (!payment) {
      throw new BadRequestException('Payment record not found');
    }

    return payment;
  } catch (error) {
    logger.error(`Error fetching payment by reference: ${error}`);
    if (error instanceof BadRequestException) {
      throw error;
    }
    throw new InternalServerException('Failed to fetch payment record');
  }
};

// Generate unique transaction reference
export const generateTransactionReference = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return `COURSE-${timestamp}-${random}`;
};

// Get student's course purchases
export const getStudentPayments = async (userId, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    const [payments, totalRecords] = await Promise.all([
      CoursePayment.find({ student: userId })
        .populate(
          'course',
          'title description price image level category educatorName'
        )
        .populate('educator', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      CoursePayment.countDocuments({ student: userId }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return {
      payments,
      meta: {
        totalRecords,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    };
  } catch (error) {
    logger.error(`Error fetching student payments: ${error}`);
    throw new InternalServerException('Failed to fetch payment records');
  }
};

// Get educator's course sales
export const getEducatorSales = async (educatorId, page = 1, limit = 10) => {
  try {
    const skip = (page - 1) * limit;

    const [payments, totalRecords] = await Promise.all([
      CoursePayment.find({ educator: educatorId, status: 'success' })
        .populate('student', 'name email')
        .populate('course', 'title description price image')
        .sort({ paidAt: -1 })
        .skip(skip)
        .limit(limit),
      CoursePayment.countDocuments({ educator: educatorId, status: 'success' }),
    ]);

    const totalPages = Math.ceil(totalRecords / limit);

    return {
      payments,
      meta: {
        totalRecords,
        totalPages,
        currentPage: page,
        pageSize: limit,
      },
    };
  } catch (error) {
    logger.error(`Error fetching educator sales: ${error}`);
    throw new InternalServerException('Failed to fetch sales records');
  }
};

// Check if student owns a course
export const checkCourseOwnership = async (studentId, courseId) => {
  try {
    const payment = await CoursePayment.findOne({
      student: studentId,
      course: courseId,
      status: 'success',
    });

    return !!payment;
  } catch (error) {
    logger.error(`Error checking course ownership: ${error}`);
    return false;
  }
};

// Get student's owned courses
export const getStudentOwnedCourses = async (studentId) => {
  try {
    const payments = await CoursePayment.find({
      student: studentId,
      status: 'success',
    })
      .populate(
        'course',
        'title description image level category educatorName totalDuration averageRating'
      )
      .sort({ paidAt: -1 });

    return payments.map((payment) => ({
      purchaseDate: payment.paidAt,
      amountPaid: payment.amount,
      course: payment.course,
    }));
  } catch (error) {
    logger.error(`Error fetching owned courses: ${error}`);
    throw new InternalServerException('Failed to fetch owned courses');
  }
};

// Verify Paystack webhook signature
export const verifyPaystackWebhookSignature = (signature, payload) => {
  try {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      logger.error('Paystack secret key not configured');
      return false;
    }

    // Ensure payload is a string or buffer for HMAC
    const payloadString = Buffer.isBuffer(payload)
      ? payload.toString()
      : payload;

    const computedHash = crypto
      .createHmac('sha512', secretKey)
      .update(payloadString)
      .digest('hex');

    // Compare the hashes
    return signature === computedHash;
  } catch (error) {
    logger.error(`Error verifying webhook signature: ${error.message}`);
    return false;
  }
};

// Handle Paystack webhook event for course payments
export const handlePaystackWebhookEvent = async (event) => {
  try {
    const eventType = event.event;

    if (eventType === 'charge.success') {
      const data = event.data;
      const reference = data.reference;

      // Update payment status to success
      const payment = await updatePaymentStatus(
        reference,
        'success',
        data.id.toString()
      );

      // In your webhook handler
      await enrollInCourse({
        userId: payment.student,
        courseId: payment.course,
      });

      await initializeProgress(payment.student, payment.course);

      logger.info(`Course payment successful for reference: ${reference}`);
      return { success: true, message: 'Course payment successful' };
    } else if (eventType === 'charge.failed') {
      const data = event.data;
      const reference = data.reference;

      // Update payment status to failed
      await updatePaymentStatus(reference, 'failed');

      logger.info(`Course payment failed for reference: ${reference}`);
      return { success: true, message: 'Course payment failed status updated' };
    }

    return { success: true, message: 'Event processed' };
  } catch (error) {
    logger.error(`Error handling webhook event: ${error}`);
    return { success: false, message: 'Error processing event' };
  }
};

// Get course purchase analytics for educator
export const getCourseAnalytics = async (
  educatorId,
  courseId = null,
  period = '30d'
) => {
  try {
    const matchStage = {
      educator: new mongoose.Types.ObjectId(educatorId),
      status: 'success',
    };

    if (courseId) {
      matchStage.course = new mongoose.Types.ObjectId(courseId);
    }

    // Set date range based on period
    const now = new Date();
    let startDate;

    switch (period) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    matchStage.paidAt = { $gte: startDate, $lte: now };

    const analytics = await CoursePayment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalRevenue: { $sum: '$amount' },
          totalEarnings: { $sum: '$educatorEarnings' },
          averageSaleAmount: { $avg: '$amount' },
        },
      },
    ]);

    // Get sales by course if no specific course requested
    let salesByCourse = [];
    if (!courseId) {
      salesByCourse = await CoursePayment.aggregate([
        { $match: { ...matchStage, course: { $exists: true } } },
        {
          $group: {
            _id: '$course',
            sales: { $sum: 1 },
            revenue: { $sum: '$amount' },
            earnings: { $sum: '$educatorEarnings' },
          },
        },
        {
          $lookup: {
            from: 'courses',
            localField: '_id',
            foreignField: '_id',
            as: 'course',
          },
        },
        { $unwind: '$course' },
        {
          $project: {
            courseTitle: '$course.title',
            sales: 1,
            revenue: 1,
            earnings: 1,
          },
        },
        { $sort: { sales: -1 } },
      ]);
    }

    return {
      summary: analytics[0] || {
        totalSales: 0,
        totalRevenue: 0,
        totalEarnings: 0,
        averageSaleAmount: 0,
      },
      salesByCourse,
      period,
    };
  } catch (error) {
    logger.error(`Error getting course analytics: ${error}`);
    throw new InternalServerException('Failed to fetch analytics');
  }
};
