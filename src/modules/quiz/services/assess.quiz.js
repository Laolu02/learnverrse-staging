import AssessmentModel from "../model/assessment.model.js";
import QuizModel from "../model/quiz.model.js";

export const assessQuizService = async ({ chapterId, userAnswers, userId }) => {
  const quiz = await QuizModel.findOne({ chapterId });
  if (!quiz) {
    throw new Error(`Quiz not found for chapterId: ${chapterId}`);
  }

  let score = 0;
  const questionsAttempted = [];
  const totalQuestions = quiz.questions.length;
  let percentageScore = 0;
  let passed = false;

  for (const userAnswer of userAnswers) {
    const { questionId, selectedOptionId } = userAnswer;

    // Find the corresponding question in the actual quiz
    const quizQuestion = quiz.questions.find(
      (q) => q.questionId === questionId
    );
    if (!quizQuestion) {
      console.warn(
        `Question with ID ${questionId} not found in quiz ${quiz.quizId}. Skipping.`
      );
      continue;
    }

    // Find the option selected by the user in the actual quiz options
    const selectedOptionInQuiz = quizQuestion.options.find(
      (opt) => opt.id === selectedOptionId
    );
    const isCorrectForThisQuestion = selectedOptionInQuiz
      ? selectedOptionInQuiz.isCorrect
      : false;
    if (isCorrectForThisQuestion) {
      score++;
    }

    // Find the actual correct option's ID for feedback
    const correctOption = quizQuestion.options.find((opt) => opt.isCorrect);
    const correctOptionId = correctOption ? correctOption.id : null;

    // Populate the questionsAttempted array for the assessment record
    questionsAttempted.push({
      questionId: quizQuestion.questionId,
      questionText: quizQuestion.text,
      selectedOption: {
        id: selectedOptionInQuiz ? selectedOptionInQuiz.id : "N/A",
        text: selectedOptionInQuiz ? selectedOptionInQuiz.text : "N/A",
        isCorrectAttempt: isCorrectForThisQuestion,
      },
      correctOptionId: correctOptionId,
      isCorrect: isCorrectForThisQuestion,
      explanation: quizQuestion.explanation || null, // Ensure explanation is captured
    });
  }

  if (totalQuestions > 0) {
    percentageScore = (score / totalQuestions) * 100;
  }
  //if (percentageScore >= quiz.passingScore){passed = true} else {passed = false}
  passed = percentageScore >= quiz.passingScore;

  const newAssessment = new AssessmentModel({
    userId,
    quizId: quiz._id,
    courseId: quiz.courseId,
    sectionId: quiz.sectionId,
    chapterId: quiz.chapterId,
    quizTitle: quiz.title,
    score: score,
    totalQuestions: totalQuestions,
    percentageScore: percentageScore,
    passed: passed,
    questionsAttempted: questionsAttempted,
    attemptDate: new Date(),
  });

  await newAssessment.save();

  const responseResults = questionsAttempted.map((qa) => ({
    questionId: qa.questionId,
    questionText: qa.questionText,
    isCorrect: qa.isCorrect,
    selectedOption: {
      id: qa.selectedOption.id,
      text: qa.selectedOption.text,
    },
    correctOptionId: qa.correctOptionId,
    explanation: qa.explanation,
  }));

  return {
    score: score,
    totalQuestions: totalQuestions,
    percentageScore: percentageScore,
    passed: passed,
    results: responseResults,
  };
};
