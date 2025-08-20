// Additional services for getCourseById and getEducatorCourses

import CourseModel from '../model/course.model.js';
import {
  NotFoundException,
  UnauthorizedException,
} from '../../../utils/appError.js';

/**
 * Get a specific course by ID for the educator
 */
export const getEducatorCourseByIdService = async (courseId, userId) => {
  try {
    const course = await CourseModel.findById(courseId);

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (course.educatorId.toString() !== userId.toString()) {
      throw new UnauthorizedException(
        'You are not authorized to view this course'
      );
    }

    return course;
  } catch (error) {
    throw error;
  }
};

/**
 * Get all courses for a specific educator with pagination and filtering
 */

export const getEducatorAllCoursesService = async (req) => {
  const {
    category,
    search,
    status,
    level,
    isFeatured,
    isApproved,
    sortBy = 'createdAt',
    sortOrder = 'desc',
    page = 1,
    limit = 10,
  } = req.query;

  try {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Base filter - only courses by the logged-in educator
    const filters = {
      educatorId: req.user._id,
    };

    // Filter by category
    if (category && category !== 'all') {
      filters.category = { $regex: category, $options: 'i' };
    }

    // Filter by status (values from CourseStatusEnums)
    if (status && status !== 'all') {
      filters.status = status; // Don't convert to uppercase, use exact enum values
    }

    // Filter by level (values from CourseLevelEnum)
    if (level && level !== 'all') {
      filters.level = level; // Don't convert to uppercase, use exact enum values
    }

    // Search in title, description, or educator name
    if (search && search.trim()) {
      filters.$or = [
        { title: { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { educatorName: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Filter by featured status
    if (typeof isFeatured !== 'undefined') {
      filters.isFeatured = isFeatured === 'true';
    }

    // Filter by approval status
    if (typeof isApproved !== 'undefined') {
      filters.isApproved = isApproved === 'true';
    }

    // Build sort object
    const sortObj = {};
    const validSortFields = [
      'createdAt',
      'updatedAt',
      'title',
      'price',
      'averageRating',
      'totalRatings',
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    sortObj[sortField] = sortOrder === 'asc' ? 1 : -1;

    // Execute queries in parallel
    const [courses, totalCourses] = await Promise.all([
      CourseModel.find(filters)
        .sort(sortObj)
        .select(
          [
            'educatorId',
            'educatorName',
            'title',
            'description',
            'category',
            'price',
            'image',
            'level',
            'status',
            'subscription',
            'isApproved',
            'isFeatured',
            'sections',
            'totalDuration',
            'averageRating',
            'totalRatings',
            'totalReviews',
            'ratingBreakdown',
            'createdAt',
            'updatedAt',
          ].join(' ')
        )
        .skip(skip)
        .limit(limitNum)
        .lean(),
      CourseModel.countDocuments(filters),
    ]);

    // Calculate additional course statistics
    const coursesWithStats = courses.map((course) => ({
      ...course,
      totalSections: course.sections ? course.sections.length : 0,
      totalChapters: course.sections
        ? course.sections.reduce(
            (total, section) =>
              total + (section.chapters ? section.chapters.length : 0),
            0
          )
        : 0,
      formattedPrice: course.price ? course.price.toString() : '0', // Keep as integer (already in correct format)
      formattedDuration: course.totalDuration
        ? `${Math.floor(course.totalDuration / 60)}h ${
            course.totalDuration % 60
          }m`
        : '0m',
      ratingStats: {
        averageRating: course.averageRating || 0,
        totalRatings: course.totalRatings || 0,
        totalReviews: course.totalReviews || 0,
        breakdown: course.ratingBreakdown || {
          fiveStar: 0,
          fourStar: 0,
          threeStar: 0,
          twoStar: 0,
          oneStar: 0,
        },
      },
    }));

    // Remove sections from response to keep it clean, but keep other rating fields
    const cleanCourses = coursesWithStats.map(
      ({ sections, ratingBreakdown, ...course }) => course
    );

    // Calculate pagination info
    const totalPages = Math.ceil(totalCourses / limitNum);
    const hasNextPage = pageNum < totalPages;
    const hasPrevPage = pageNum > 1;

    return {
      courses: cleanCourses,
      pagination: {
        currentPage: pageNum,
        limit: limitNum,
        totalPages,
        totalCourses,
        hasNextPage,
        hasPrevPage,
        skip,
      },
      filters: {
        category: category || 'all',
        status: status || 'all',
        level: level || 'all',
        search: search || '',
        isFeatured,
        isApproved,
        sortBy: sortField,
        sortOrder,
      },
    };
  } catch (error) {
    throw error;
  }
};
