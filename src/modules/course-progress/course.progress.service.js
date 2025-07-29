import {
  BadRequestException,
  NotFoundException,
} from '../../utils/appError.js';
import CourseModel from '../course/model/course.model.js';
import EnrollmentModel from '../enrolment/model/enrolment.model.js';
import CourseProgressModel from './course.progress.model.js';

export const initializeProgress = async (userId, courseId) => {
  const existingProgress = await CourseProgressModel.findOne({
    userId,
    courseId,
  });
  if (existingProgress) {
    throw new Error('Progress already initialized for this course');
  }

  const course = await CourseModel.findById(courseId);
  if (!course) {
    throw new NotFoundException('Course not found');
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

  await courseProgress.save();
  return courseProgress;
};
