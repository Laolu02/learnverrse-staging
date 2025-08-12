import { CourseStatusEnums } from '../../enums/course-status.enum.js';
import { CourseSubscriptionEnum } from '../../enums/course-subscription.enum.js';
import AsyncHandler from '../../middlewares/asyncHandler.js';
import {
  NotFoundException,
  UnauthorizedException,
} from '../../utils/appError.js';
import { initializeProgress } from '../course-progress/course.progress.service.js';
import CourseModel from '../course/model/course.model.js';
import CoursePayment from '../payment/payment.model.js';
import { enrollInCourse } from './enrol.service.js';

export const courseEnrollmentController = AsyncHandler(async (req, res) => {
  const { userId, courseId } = req.body;

  // Check if course exists, published and approved
  const course = await CourseModel.findOne({
    _id: courseId,
    status: CourseStatusEnums.PUBLISHED,
    isApproved: true,
  });
  if (!course) {
    throw new NotFoundException('Course not found');
  }

  // If course is paid, check for user's payment
  if (course.subscription === CourseSubscriptionEnum.PAID) {
    const payment = await CoursePayment.findOne({
      student: userId,
      course: courseId,
      status: 'success',
    });

    if (!payment) {
      throw new UnauthorizedException('No valid payment found for this course');
    }
  }

  //  Proceed with enrollment
  await enrollInCourse({ userId, courseId });

  // Initialize course progress
  await initializeProgress(userId, courseId);

  res.status(201).json({
    success: true,
    message: 'Enrollment successful and progress initialized',
  });
});
