import express from 'express';
import {
  createCourse,
  deleteCourse,
  getUploadUrl,
  updateCourse,
  viewAllCourses,
} from '../controllers/course.educator.controller.js';
const router = express.Router();

router.get('/', viewAllCourses);

router.post('/', createCourse);

router.put('/:courseId', updateCourse);

router.delete('/:courseId', deleteCourse);

router.post(
  '/:courseId/sections/:sectionId/chapters/:chapterId/get-upload-url',
  getUploadUrl
);
router.post('/:courseId/uploads', getUploadUrl);

export default router;
