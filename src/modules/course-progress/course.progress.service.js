import {
  BadRequestException,
  NotFoundException,
} from '../../utils/appError.js';
import CourseModel from '../course/model/course.model.js';
import EnrollmentModel from '../enrolment/model/enrolment.model.js';
import CourseProgressModel from './course.progress.model.js';

export const initializeProgress = async (userId, courseId, session) => {
  // Check if progress already exists (with session if provided)
  const query = CourseProgressModel.findOne({ userId, courseId });
  const existingProgress = await (session ? query.session(session) : query);

  if (existingProgress) {
    // Progress already exists - return existing progress (idempotent)
    return {
      progress: existingProgress,
      created: false,
      message: 'Progress already initialized',
    };
  }

  const courseQuery = CourseModel.findById(courseId);
  const course = await (session ? courseQuery.session(session) : courseQuery);

  if (!course) {
    throw new NotFoundException('Course not found');
  }

  // Ensure course has sections before proceeding
  if (!course.sections || course.sections.length === 0) {
    throw new BadRequestException(
      'Course has no sections to initialize progress'
    );
  }

  const progressSections = course.sections.map((section) => ({
    sectionId: section.sectionId,
    isCompleted: false,
    chapters: section.chapters.map((chapter) => ({
      chapterId: chapter.chapterId,
      isCompleted: false,
      timeSpent: 0,
      attempts: 0,
    })),
    ...(section.quizId && {
      quizId: section.quizId,
      quizCompleted: false,
      quizScore: null,
      quizAttempts: 0,
    }),
    completionPercentage: 0,
  }));

  const courseProgress = new CourseProgressModel({
    userId,
    courseId,
    sections: progressSections,
    completionPercentage: 0,
    currentSection: {
      sectionId: course.sections[0]?.sectionId,
      chapterId: course.sections[0]?.chapters[0]?.chapterId,
    },
  });

  // Save with session if provided
  if (session) {
    await courseProgress.save({ session });
  } else {
    await courseProgress.save();
  }

  return {
    progress: courseProgress,
    created: true,
    message: 'Progress initialized successfully',
  };
};
