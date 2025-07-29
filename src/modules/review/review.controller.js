export const createOrUpdateReview = async (req, res) => {
  try {
    const { userId, courseId, rating, review, userName, userAvatar } = req.body;

    // Validate rating
    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: 'Rating must be between 1 and 5',
      });
    }

    // Check if user is enrolled in the course
    const EnrollmentModel = mongoose.model('Enrollment');
    const enrollment = await EnrollmentModel.findOne({ userId, courseId });
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'You must be enrolled in this course to leave a review',
      });
    }

    // Check if review already exists
    let existingReview = await ReviewModel.findOne({ userId, courseId });

    if (existingReview) {
      // Update existing review
      existingReview.rating = rating;
      existingReview.review = review || '';
      existingReview.userName = userName;
      existingReview.userAvatar = userAvatar;

      await existingReview.save();

      // Update course rating stats
      const course = await CourseModel.findById(courseId);
      await course.updateRatingStats();

      res.status(200).json({
        success: true,
        message: 'Review updated successfully',
        data: existingReview,
      });
    } else {
      // Create new review
      const newReview = new ReviewModel({
        userId,
        courseId,
        rating,
        review: review || '',
        userName,
        userAvatar,
        isVerifiedPurchase: true,
      });

      await newReview.save();

      // Update course rating stats
      const course = await CourseModel.findById(courseId);
      await course.updateRatingStats();

      res.status(201).json({
        success: true,
        message: 'Review created successfully',
        data: newReview,
      });
    }
  } catch (error) {
    if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: 'You have already reviewed this course',
      });
    } else {
      console.error('Error creating/updating review:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  }
};

// Get reviews for a course
export const getCourseReviews = async (req, res) => {
  try {
    const { courseId } = req.params;
    const {
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
      rating,
      hasReview,
    } = req.query;

    // Build filter
    let filter = {
      courseId: new mongoose.Types.ObjectId(courseId),
      isHidden: false,
    };

    if (rating) {
      filter.rating = parseInt(rating);
    }

    if (hasReview === 'true') {
      filter.review = { $ne: '' };
    }

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const [reviews, total, course] = await Promise.all([
      ReviewModel.find(filter)
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      ReviewModel.countDocuments(filter),
      CourseModel.findById(
        courseId,
        'title averageRating totalRatings totalReviews ratingBreakdown'
      ),
    ]);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        reviews,
        course: {
          title: course.title,
          averageRating: course.averageRating,
          totalRatings: course.totalRatings,
          totalReviews: course.totalReviews,
          ratingBreakdown: course.ratingBreakdown,
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalReviews: total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching course reviews:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get user's review for a course
export const getUserReview = async (req, res) => {
  try {
    const { userId, courseId } = req.params;

    const review = await ReviewModel.findOne({ userId, courseId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    res.status(200).json({
      success: true,
      data: review,
    });
  } catch (error) {
    console.error('Error fetching user review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Delete a review
export const deleteReview = async (req, res) => {
  try {
    const { userId, courseId } = req.params;

    const review = await ReviewModel.findOneAndDelete({ userId, courseId });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Update course rating stats
    const course = await CourseModel.findById(courseId);
    await course.updateRatingStats();

    res.status(200).json({
      success: true,
      message: 'Review deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Mark review as helpful
export const markReviewHelpful = async (req, res) => {
  try {
    const { reviewId } = req.params;

    const review = await ReviewModel.findByIdAndUpdate(
      reviewId,
      { $inc: { helpfulVotes: 1 } },
      { new: true }
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    res.status(200).json({
      success: true,
      message: 'Review marked as helpful',
      data: { helpfulVotes: review.helpfulVotes },
    });
  } catch (error) {
    console.error('Error marking review as helpful:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Report a review
export const reportReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { userId, reason } = req.body;

    const review = await ReviewModel.findById(reviewId);

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Check if user already reported this review
    const alreadyReported = review.reportedBy.some(
      (report) => report.userId === userId
    );

    if (alreadyReported) {
      return res.status(400).json({
        success: false,
        message: 'You have already reported this review',
      });
    }

    review.reportedBy.push({
      userId,
      reason,
      reportedAt: new Date(),
    });

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Review reported successfully',
    });
  } catch (error) {
    console.error('Error reporting review:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Educator response to review
export const addEducatorResponse = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const { response, educatorId } = req.body;

    const review = await ReviewModel.findById(reviewId).populate(
      'courseId',
      'educatorId'
    );

    if (!review) {
      return res.status(404).json({
        success: false,
        message: 'Review not found',
      });
    }

    // Verify educator owns the course
    if (review.courseId.educatorId !== educatorId) {
      return res.status(403).json({
        success: false,
        message: 'You can only respond to reviews for your own courses',
      });
    }

    review.educatorResponse = {
      response,
      respondedAt: new Date(),
    };

    await review.save();

    res.status(200).json({
      success: true,
      message: 'Response added successfully',
      data: review.educatorResponse,
    });
  } catch (error) {
    console.error('Error adding educator response:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};

// Get rating statistics for a course
export const getCourseRatingStats = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await CourseModel.findById(
      courseId,
      'title averageRating totalRatings totalReviews ratingBreakdown'
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found',
      });
    }

    // Calculate percentages for rating breakdown
    const ratingPercentages = {};
    if (course.totalRatings > 0) {
      Object.keys(course.ratingBreakdown).forEach((key) => {
        ratingPercentages[key] = Math.round(
          (course.ratingBreakdown[key] / course.totalRatings) * 100
        );
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...course.toObject(),
        ratingPercentages,
      },
    });
  } catch (error) {
    console.error('Error fetching rating stats:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
    });
  }
};
