import express from 'express';
import {
  createCourse,
  deleteCourse,
  getEducatorCourseById,
  updateCourse,
  viewAllEducatorCourses,
} from '../controllers/course.educator.controller.js';

import { getUploadFileUrl } from '../controllers/upload.controller.js';
const router = express.Router();

router.get('/', viewAllEducatorCourses);

router.get('/:courseId', getEducatorCourseById);

router.post('/', createCourse);

router.put('/:courseId', updateCourse);

router.delete('/:courseId', deleteCourse);

router.post('/:courseId/uploads', getUploadFileUrl);

export default router;
