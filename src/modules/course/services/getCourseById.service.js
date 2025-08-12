import CourseModel from '../model/course.model.js';
import { NotFoundException } from '../../../utils/appError.js';

export const getCourseByIdService = async (req) => {
  const courseId = req.params.courseId;

  try {
    const course = await CourseModel.findById(courseId, {
      'sections.quizId': 0,
      'sections.chapters.video': 0,
      'sections.chapters.content': 0,
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  } catch (error) {
    throw error;
  }
};
