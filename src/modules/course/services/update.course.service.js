import { v4 as uuidv4 } from 'uuid';
import CourseModel from '../model/course.model.js';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '../../../utils/appError.js';

export const updateCourseService = async (courseId, userId, body) => {
  const updateData = { ...body };

  try {
    const course = await CourseModel.findById(courseId);
    if (!course) {
      throw new NotFoundException('Course does not exist');
    }

    if (course.educatorId.toString() !== userId.toString()) {
      throw new UnauthorizedException('Not allowed to edit selected course');
    }

    // Handle price conversion (keep as integer, don't convert to cents)
    if (updateData.price !== undefined) {
      const price = parseFloat(updateData.price);
      if (isNaN(price) || price < 0) {
        throw new BadRequestException(
          'Invalid price format, Price must be a valid positive number'
        );
      }
      updateData.price = Math.round(price); // Keep as whole number
    }

    // Handle sections data with full flexibility
    if (updateData.sections) {
      const sectionsData =
        typeof updateData.sections === 'string'
          ? JSON.parse(updateData.sections)
          : updateData.sections;

      updateData.sections = sectionsData.map((section) => {
        // Preserve all section properties from frontend
        const processedSection = {
          ...section,
          sectionId: section.sectionId || uuidv4(),
          chapters: (section.chapters || []).map((chapter) => {
            // Preserve all chapter properties from frontend
            const processedChapter = {
              ...chapter,
              chapterId: chapter.chapterId || uuidv4(),
            };

            // Ensure duration is a number if provided
            if (chapter.duration !== undefined) {
              const duration = parseInt(chapter.duration);
              processedChapter.duration = isNaN(duration) ? 0 : duration;
            }

            return processedChapter;
          }),
        };

        // Ensure quizId is handled properly
        if (!section.quizId) {
          processedSection.quizId = '';
        }

        return processedSection;
      });
    }

    // Validate enum fields if they exist in updateData
    if (updateData.level) {
      const { CourseLevelEnum } = await import(
        '../../../enums/course-level.enum.js'
      );
      if (!Object.values(CourseLevelEnum).includes(updateData.level)) {
        throw new BadRequestException(
          `Invalid course level: ${updateData.level}`
        );
      }
    }

    if (updateData.status) {
      const { CourseStatusEnums } = await import(
        '../../../enums/course-status.enum.js'
      );
      if (!Object.values(CourseStatusEnums).includes(updateData.status)) {
        throw new BadRequestException(
          `Invalid course status: ${updateData.status}`
        );
      }
    }

    if (updateData.subscription) {
      const { CourseSubscriptionEnum } = await import(
        '../../../enums/course-subscription.enum.js'
      );
      if (
        !Object.values(CourseSubscriptionEnum).includes(updateData.subscription)
      ) {
        throw new BadRequestException(
          `Invalid subscription type: ${updateData.subscription}`
        );
      }
    }

    // Prevent updating certain protected fields
    const protectedFields = [
      'educatorId',
      'averageRating',
      'totalRatings',
      'totalReviews',
      'ratingBreakdown',
    ];
    protectedFields.forEach((field) => {
      if (updateData.hasOwnProperty(field)) {
        delete updateData[field];
      }
    });

    // Update the course with new data (completely flexible)
    Object.assign(course, updateData);

    // Recalculate total duration if sections were updated
    if (updateData.sections) {
      course.calculateTotalDuration();
    }

    await course.save();
    return course;
  } catch (error) {
    // Handle JSON parsing errors specifically
    if (error instanceof SyntaxError && error.message.includes('JSON')) {
      throw new BadRequestException('Invalid JSON format in request data');
    }
    throw error;
  }
};
