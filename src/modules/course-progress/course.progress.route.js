import express from 'express';
import {
  getCourseAnalytics,
  getCourseProgress,
  getUserAllCoursesProgress,
  markChapterCompleted,
  markSectionQuizCompleted,
  updateCurrentPosition,
} from './course.progress.controller.js';

const router = express.Router();

// Mark chapter as completed
// Most specific paths FIRST
router.get('/analytics/:courseId', getCourseAnalytics);
router.get('/user/:userId', getUserAllCoursesProgress);

// Then the ones with dynamic segments
router.get('/:userId/:courseId', getCourseProgress);
router.patch('/:userId/:courseId/position', updateCurrentPosition);
router.patch(
  '/:userId/:courseId/sections/:sectionId/chapters/:chapterId/complete',
  markChapterCompleted
);
router.patch(
  '/:userId/:courseId/sections/:sectionId/quiz/complete',
  markSectionQuizCompleted
);

export default router;
