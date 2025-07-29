import EnrollmentModel from '../enrolment/model/enrolment.model.js';
import CourseModel from '../course/model/course.model.js';
import CourseProgressModel from './course.progress.model.js';
import AsyncHandler from '../../middlewares/asyncHandler.js';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '../../utils/appError.js';

export const getCourseContent = AsyncHandler(async (req, res) => {
  const { userId, courseId } = req.params;

  // Verify enrollment
  const enrollment = await EnrollmentModel.findOne({
    userId,
    courseId,
    accessGranted: true,
  });

  if (!enrollment) {
    throw new UnauthorizedException('Access denied');
  }

  // Get course with all content
  const course = await CourseModel.findById(courseId);

  // Get user's progress
  const progress = await CourseProgressModel.findOne({ userId, courseId });

  res.json({
    success: true,
    data: {
      course,
      progress,
      hasAccess: true,
    },
  });
});

// Mark chapter as completed
export const markChapterCompleted = AsyncHandler(async (req, res) => {
  const { userId, courseId, sectionId, chapterId } = req.params;
  const { timeSpent } = req.body;

  const progress = await CourseProgressModel.findOne({ userId, courseId });
  if (!progress) {
    throw new NotFoundException('Course progress not found');
  }

  // Find and update the specific chapter
  const section = progress.sections.find((s) => s.sectionId === sectionId);
  if (!section) {
    throw new NotFoundException('Section not found');
  }

  const chapter = section.chapters.find((c) => c.chapterId === chapterId);
  if (!chapter) {
    throw new NotFoundException('Chapter not found');
  }

  // Update chapter progress
  chapter.isCompleted = true;
  chapter.completedAt = new Date();
  chapter.attempts += 1;

  if (timeSpent) {
    chapter.timeSpent = (chapter.timeSpent || 0) + timeSpent;
  }

  // Update overall progress
  await progress.updateProgress();

  res.status(200).json({
    success: true,
    message: 'Chapter marked as completed',
    data: {
      progress: progress.completionPercentage,
      sectionProgress: section.completionPercentage,
      isCompleted: progress.isCompleted,
    },
  });
});

// Mark section quiz as completed
export const markSectionQuizCompleted = AsyncHandler(async (req, res) => {
  const { userId, courseId, sectionId } = req.params;
  const { quizScore } = req.body;

  const progress = await CourseProgressModel.findOne({ userId, courseId });
  if (!progress) {
    throw new NotFoundException('Course progress not found');
  }

  // Find the specific section
  const section = progress.sections.find((s) => s.sectionId === sectionId);
  if (!section) {
    throw new NotFoundException('Section not found');
  }

  if (!section.quizId) {
    throw new NotFoundException('This section does not have a quiz');
  }

  // Update section quiz progress
  section.quizCompleted = true;
  section.quizCompletedAt = new Date();
  section.quizAttempts += 1;

  if (quizScore !== undefined) {
    section.quizScore = quizScore;
  }

  // Update overall progress
  await progress.updateProgress();

  res.status(200).json({
    success: true,
    message: 'Section quiz marked as completed',
    data: {
      progress: progress.completionPercentage,
      sectionProgress: section.completionPercentage,
      quizScore: section.quizScore,
      isCompleted: progress.isCompleted,
    },
  });
});
export const getCourseProgress = AsyncHandler(async (req, res) => {
  const { userId, courseId } = req.params;

  const progress = await CourseProgressModel.findOne({
    userId,
    courseId,
  }).populate('courseId', 'title description educatorName');

  if (!progress) {
    throw new NotFoundException('Course progress not found');
  }

  res.status(200).json({
    success: true,
    data: progress,
  });
});

// Get all courses progress for a user
export const getUserAllCoursesProgress = AsyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { page = 1, limit = 10, status } = req.query;

  let filter = { userId };

  // Filter by completion status if provided
  if (status === 'completed') {
    filter.isCompleted = true;
  } else if (status === 'in-progress') {
    filter.isCompleted = false;
    filter.completionPercentage = { $gt: 0 };
  } else if (status === 'not-started') {
    filter.completionPercentage = 0;
  }

  const skip = (page - 1) * limit;

  const [progressList, total] = await Promise.all([
    CourseProgressModel.find(filter)
      .populate('courseId', 'title description educatorName image category')
      .sort({ lastAccessedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    CourseProgressModel.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    data: {
      courses: progressList,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalCourses: total,
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    },
  });
});

// Update current position (for resuming)
export const updateCurrentPosition = AsyncHandler(async (req, res) => {
  const { userId, courseId } = req.params;
  const { sectionId, chapterId } = req.body;

  const progress = await CourseProgressModel.findOne({ userId, courseId });
  if (!progress) {
    throw new BadRequestException('Course progress not found');
  }

  progress.currentSection = { sectionId, chapterId };
  progress.lastAccessedAt = new Date();

  await progress.save();

  res.status(200).json({
    success: true,
    message: 'Current position updated successfully',
  });
});

// Get course analytics for educator
export const getCourseAnalytics = AsyncHandler(async (req, res) => {
  const { courseId } = req.params;

  const analytics = await CourseProgressModel.aggregate([
    { $match: { courseId: new mongoose.Types.ObjectId(courseId) } },
    {
      $group: {
        _id: null,
        totalEnrolled: { $sum: 1 },
        totalCompleted: { $sum: { $cond: ['$isCompleted', 1, 0] } },
        averageProgress: { $avg: '$completionPercentage' },
        averageTimeSpent: { $avg: '$totalTimeSpent' },
      },
    },
  ]);

  const completionRate = analytics[0]
    ? Math.round(
        (analytics[0].totalCompleted / analytics[0].totalEnrolled) * 100
      )
    : 0;

  res.status(200).json({
    success: true,
    data: {
      ...analytics[0],
      completionRate,
    },
  });
});
