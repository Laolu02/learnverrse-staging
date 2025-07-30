import { HTTPSTATUS } from '../../../configs/http.config.js';
import AsyncHandler from '../../../middlewares/asyncHandler.js';
import QuizModel from '../model/quiz.model.js';
import CourseModel from '../../course/model/course.model.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all quizzes for a course
 */
export const getQuizzesByCourse = AsyncHandler(async (req, res) => {
  const { courseId } = req.params;
  
  const quizzes = await QuizModel.find({ courseId })
    .select('quizId sectionId chapterId title description timeLimit passingScore isActive createdAt')
    .lean();
  
  // Since we're using lean(), we need to process the questions array safely if it exists
  const processedQuizzes = Array.isArray(quizzes) ? quizzes.map(quiz => 
    quiz.questions ? QuizModel.omitAnswersFromLeanDocument(quiz) : quiz
  ) : [];
  
  res.status(HTTPSTATUS.OK).json({
    success: true,
    count: processedQuizzes.length,
    data: processedQuizzes,
  });
});

/**
 * Get all quizzes for a section
 */
export const getQuizzesBySection = AsyncHandler(async (req, res) => {
  const { sectionId } = req.params;
  
  const quizzes = await QuizModel.find({ sectionId })
    .select('quizId title description timeLimit passingScore isActive createdAt')
    .lean();
  
  // Since we're using lean(), we need to process the questions array safely if it exists
  const processedQuizzes = Array.isArray(quizzes) ? quizzes.map(quiz => 
    quiz.questions ? QuizModel.omitAnswersFromLeanDocument(quiz) : quiz
  ) : [];
  
  res.status(HTTPSTATUS.OK).json({
    success: true,
    count: processedQuizzes.length,
    data: processedQuizzes,
  });
});

/**
 * Get a single quiz without answers
 */
export const getQuizById = AsyncHandler(async (req, res) => {
  const { quizId } = req.params;
  
  const quiz = await QuizModel.findOne({ quizId });
  
  if (!quiz) {
    res.status(HTTPSTATUS.NOT_FOUND).json({
      success: false,
      message: 'Quiz not found',
    });
    return;
  }
  
  // Use the custom method to omit answers
  const quizWithoutAnswers = quiz.omitAnswers();
  
  res.status(HTTPSTATUS.OK).json({
    success: true,
    data: quizWithoutAnswers,
  });
});

/**
 * Create a new quiz and associate it with a section
 */
export const createQuiz = AsyncHandler(async (req, res) => {
  const { courseId, sectionId, title, description, timeLimit, passingScore, questions } = req.body;

  // 1. Verify the course and section exist
  const course = await CourseModel.findById(courseId);
  if (!course) {
    return res.status(HTTPSTATUS.NOT_FOUND).json({ success: false, message: 'Course not found' });
  }

  const section = course.sections.find(s => s.sectionId === sectionId);
  if (!section) {
    return res.status(HTTPSTATUS.NOT_FOUND).json({ success: false, message: 'Section not found in this course' });
  }
  
  // 2. Check if a quiz already exists for this section
  if (section.quizId) {
      return res.status(HTTPSTATUS.BAD_REQUEST).json({ success: false, message: 'A quiz already exists for this section' });
  }

  // 3. Generate a unique quizId
  const quizId = uuidv4();

  // 4. Format questions with unique IDs
  const formattedQuestions = questions.map(q => ({
    questionId: uuidv4(),
    text: q.text,
    explanation: q.explanation,
    options: q.options.map(opt => ({
      id: uuidv4(),
      text: opt.text,
      isCorrect: opt.isCorrect,
    })),
  }));

  // 5. Create the new quiz
  const quiz = await QuizModel.create({
    quizId,
    courseId,
    sectionId, // A quiz is associated with a section
    title,
    description,
    timeLimit,
    passingScore,
    questions: formattedQuestions,
    isActive: true,
    createdBy: req.user.id,
  });

  // 6. Update the course's section with the new quizId
  section.quizId = quizId;
  await course.save();

  // 7. Return the created quiz (without answers)
  const safeQuiz = quiz.omitAnswers();

  res.status(HTTPSTATUS.CREATED).json({
    success: true,
    message: 'Quiz created and associated with section successfully',
    data: safeQuiz,
  });
});

/**
 * Update a quiz
 */
export const updateQuiz = AsyncHandler(async (req, res) => {
  const { quizId } = req.params;
  const { title, description, timeLimit, passingScore, questions, isActive } = req.body;
  
  // Find the quiz by quizId (not MongoDB _id)
  const quiz = await QuizModel.findOne({ quizId });
  
  if (!quiz) {
    res.status(HTTPSTATUS.NOT_FOUND).json({
      success: false,
      message: 'Quiz not found',
    });
    return;
  }
  
  // Only allow the creator to update the quiz
  if (quiz.createdBy.toString() !== req.user.id.toString()) {
    res.status(HTTPSTATUS.FORBIDDEN).json({
      success: false,
      message: 'You are not authorized to update this quiz',
    });
    return;
  }
  
  // Update fields if provided
  if (title) quiz.title = title;
  if (description) quiz.description = description;
  if (timeLimit) quiz.timeLimit = timeLimit;
  if (passingScore) quiz.passingScore = passingScore;
  if (typeof isActive === 'boolean') quiz.isActive = isActive;
  
  // Update questions if provided
  if (questions && Array.isArray(questions) && questions.length > 0) {
    const formattedQuestions = questions.map(question => ({
      questionId: question.questionId || uuidv4(),
      text: question.text,
      explanation: question.explanation,
      options: question.options.map(option => ({
        id: option.id || uuidv4(),
        text: option.text,
        isCorrect: option.isCorrect,
      })),
    }));
    
    quiz.questions = formattedQuestions;
  }
  
  await quiz.save();
  
  // Return updated quiz without answers
  const safeQuiz = quiz.omitAnswers();
  
  res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Quiz updated successfully',
    data: safeQuiz,
  });
});

/**
 * Delete a quiz
 */
export const deleteQuiz = AsyncHandler(async (req, res) => {
  const { quizId } = req.params;
  
  const quiz = await QuizModel.findOne({ quizId });
  
  if (!quiz) {
    return res.status(HTTPSTATUS.NOT_FOUND).json({
      success: false,
      message: 'Quiz not found',
    });
  }
  
  // Only allow the creator to delete the quiz
  if (quiz.createdBy.toString() !== req.user.id.toString()) {
    return res.status(HTTPSTATUS.FORBIDDEN).json({
      success: false,
      message: 'You are not authorized to delete this quiz',
    });
  }
  
  // Get quiz details before deletion for course update
  const { courseId, sectionId } = quiz;
  
  // Remove the quiz document
  await QuizModel.deleteOne({ quizId });
  
  // Remove the quiz reference from the course's section
  const courseToUpdate = await CourseModel.findById(courseId);
  if (courseToUpdate) {
    const section = courseToUpdate.sections.find(s => s.sectionId === sectionId);
    if (section && section.quizId === quizId) {
      section.quizId = null; // Remove the quiz reference
      await courseToUpdate.save();
    }
  }
  
  res.status(HTTPSTATUS.OK).json({
    success: true,
    message: 'Quiz deleted and removed from section successfully',
  });
});
