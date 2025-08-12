import z from 'zod';

export const InitializeCoursePaymentSchema = z.object({
  courseId: z.string().min(1, 'Course ID is required'),
});
