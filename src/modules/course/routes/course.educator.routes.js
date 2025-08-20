import express from 'express';
import {
  createCourse,
  deleteCourse,
  updateCourse,
  viewAllCourses,
} from '../controllers/course.educator.controller.js';

import { getUploadFileUrl } from '../controllers/upload.controller.js';
const router = express.Router();

router.get('/', viewAllCourses);

router.post('/', createCourse);

router.put('/:courseId', updateCourse);

router.delete('/:courseId', deleteCourse);

router.post('/:courseId/uploads', getUploadFileUrl);

export default router;
