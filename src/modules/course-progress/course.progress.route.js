import express from 'express';
import {
  getCourseAnalytics,
  getCourseContent,
  getCourseProgress,
  getUserAllCoursesProgress,
  markChapterCompleted,
  markSectionQuizCompleted,
  updateCurrentPosition,
} from './course.progress.controller.js';

const router = express.Router();

router.get('/analytics/:courseId', getCourseAnalytics);
router.get('/user/:userId', getUserAllCoursesProgress);
router.get('/access/:userId/:courseId', getCourseContent);

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
