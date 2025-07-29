import { BadRequestException } from '../../utils/appError.js';
import EnrollmentModel from './model/enrolment.model.js';

export const enrollInCourse = async (body) => {
  const { userId, courseId } = body;

  // Check if already enrolled
  const existingEnrollment = await EnrollmentModel.findOne({
    userId,
    courseId,
  });
  if (existingEnrollment) {
    throw new BadRequestException('Already enrolled');
  }

  // Create enrollment record
  const enrollment = new EnrollmentModel({
    userId,
    courseId,
    enrolledAt: new Date(),
    paymentStatus: 'completed',
    accessGranted: true,
  });

  await enrollment.save();
};
