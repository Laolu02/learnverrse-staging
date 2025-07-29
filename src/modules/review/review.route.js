import express from 'express';

const router = express.Router();

// Create or update review
router.post('/', createOrUpdateReview);

// Get reviews for a course
router.get('/course/:courseId', getCourseReviews);

// Get user's review for a course
router.get('/user/:userId/course/:courseId', getUserReview);

// Delete user's review
router.delete('/user/:userId/course/:courseId', deleteReview);

// Mark review as helpful
router.patch('/:reviewId/helpful', markReviewHelpful);

// Report a review
router.post('/:reviewId/report', reportReview);

// Educator response to review
router.post('/:reviewId/respond', addEducatorResponse);

// Get course rating statistics
router.get('/stats/:courseId', getCourseRatingStats);
