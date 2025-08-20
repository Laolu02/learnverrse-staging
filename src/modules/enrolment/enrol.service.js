import { BadRequestException } from '../../utils/appError.js';
import EnrollmentModel from './model/enrolment.model.js';

// Idempotent enrollment function - safe to call multiple times
export const enrollInCourse = async (body) => {
  const { userId, courseId, session } = body;

  // Check if already enrolled (with session if provided)
  const query = EnrollmentModel.findOne({ userId, courseId });
  const existingEnrollment = await (session ? query.session(session) : query);

  if (existingEnrollment) {
    // Already enrolled - return existing enrollment (idempotent)
    return {
      enrollment: existingEnrollment,
      created: false,
      message: 'Already enrolled',
    };
  }

  // Verify course exists
  const courseQuery = CourseModel.findById(courseId);
  const course = await (session ? courseQuery.session(session) : courseQuery);

  if (!course) {
    throw new NotFoundException('Course not found');
  }

  // Create enrollment record
  const enrollment = new EnrollmentModel({
    userId,
    courseId,
    enrolledAt: new Date(),
    paymentStatus: 'completed',
    accessGranted: true,
  });

  // Save with session if provided
  if (session) {
    await enrollment.save({ session });
  } else {
    await enrollment.save();
  }

  return {
    enrollment,
    created: true,
    message: 'Enrollment created successfully',
  };
};
