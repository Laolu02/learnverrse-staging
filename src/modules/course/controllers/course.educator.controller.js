import AsyncHandler from '../../../middlewares/asyncHandler.js';
import { BadRequestException } from '../../../utils/appError.js';
import { HTTPSTATUS } from '../../../configs/http.config.js';
import { createCourseService } from '../services/create.course.service.js';
import { updateCourseService } from '../services/update.course.service.js';
import { deleteCourseService } from '../services/delete.course.service.js';
import {
  getEducatorAllCoursesService,
  getEducatorCourseByIdService,
} from '../services/getEducatorCourses.service.js';

/**
 * @desc    View all courses on platform with filtering options
 * @route   GET /api/educator/courses
 */
export const viewAllEducatorCourses = AsyncHandler(async (req, res) => {
  const result = await getEducatorAllCoursesService(req);

  // Return response
  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Courses retrieved successfully',
    count: result.courses.length,
    totalCourses: result.pagination.totalCourses,
    pagination: {
      currentPage: result.pagination.currentPage,
      totalPages: result.pagination.totalPages,
      hasNextPage: result.pagination.hasNextPage,
      hasPrevPage: result.pagination.hasPrevPage,
      limit: result.pagination.limit,
      skip: result.pagination.skip,
    },
    filters: result.filters,
    data: result.courses,
  });
});

/**
 * @desc    Get a specific course by ID (for editing)
 * @route   GET /api/educator/courses/:courseId
 * @access  Private (Educator)
 */
export const getEducatorCourseById = AsyncHandler(async (req, res) => {
  const courseId = req.params.courseId;
  const userId = req.user._id;

  const course = await getEducatorCourseByIdService(courseId, userId);

  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Course retrieved successfully',
    data: course,
  });
});

/**
 * @desc    Create a new course
 * @route   POST /api/educator/courses
 */
export const createCourse = AsyncHandler(async (req, res) => {
  const newCourse = await createCourseService(req);

  // Return response
  return res.status(HTTPSTATUS.CREATED).json({
    success: true,
    message: 'Course created successfully',
    data: newCourse,
  });
});

/**
 * @desc    Update an existing course
 * @route   PUT /api/educator/courses/:courseId
 */
export const updateCourse = AsyncHandler(async (req, res) => {
  const courseId = req.params.courseId;
  const userId = req.user._id;
  const body = req.body;

  const updatedCourse = await updateCourseService(courseId, userId, body);

  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Course updated successfully',
    data: updatedCourse,
  });
});

/**
 * @desc    Delete a course
 * @route   DELETE /api/educator/courses/:courseId
 */
export const deleteCourse = AsyncHandler(async (req, res) => {
  const courseId = req.params.courseId;
  const educatorId = req.user._id;

  await deleteCourseService(courseId, educatorId);

  return res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Course deleted successfully',
  });
});
