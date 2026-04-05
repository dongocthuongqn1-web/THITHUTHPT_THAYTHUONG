import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { CheckCircle, AlertCircle, BookOpen } from 'lucide-react';
import MathText from '../components/MathText';

export default function StudentExamResult() {
  const { examId } = useParams<{ examId: string }>();
  const { appUser } = useAuth();
  const navigate = useNavigate();
  const [exam, setExam] = useState<any>(null);
  const [submission, setSubmission] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!examId || !appUser) return;
      try {
        const examDoc = await getDoc(doc(db, 'exams', examId));
        if (examDoc.exists()) {
          setExam({ id: examDoc.id, ...examDoc.data() });
        }

        const q = query(
          collection(db, 'submissions'),
          where('examId', '==', examId),
          where('studentId', '==', appUser.uid)
        );
        const subSnap = await getDocs(q);
        if (!subSnap.empty) {
          setSubmission({ id: subSnap.docs[0].id, ...subSnap.docs[0].data() });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'exam_result');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [examId, appUser]);

  if (loading) return <div className="flex h-screen items-center justify-center bg-gray-50 text-indigo-600 font-medium text-lg">Đang tải kết quả...</div>;
  if (!exam || !submission) return <div className="flex h-screen items-center justify-center bg-gray-50 text-red-500 font-medium text-lg">Không tìm thấy kết quả.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 flex flex-col items-center py-12 px-4">
      <div className="bg-white p-8 rounded-3xl shadow-2xl max-w-3xl w-full text-center animate-in fade-in zoom-in duration-500 border border-gray-100">
        <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-teal-500 text-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg transform hover:scale-105 transition-transform">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 to-teal-600 mb-2">Kết quả bài thi</h2>
        <p className="text-gray-500 mb-8 font-medium"><span className="font-bold text-gray-800 block mt-1">{exam.title}</span></p>
        
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 border border-gray-200 rounded-2xl p-8 mb-8 shadow-inner">
          <div className="text-sm font-bold text-gray-400 mb-3 uppercase tracking-widest">Điểm của bạn</div>
          <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600 mb-2 drop-shadow-sm">
            {submission.score.toFixed(2)}<span className="text-3xl text-gray-300 font-bold">/10</span>
          </div>
          
          {submission.incorrectQuestions && submission.incorrectQuestions.length > 0 ? (
            <div className="mt-8 text-sm text-rose-600 bg-rose-50/80 border border-rose-100 p-5 rounded-xl text-left shadow-sm">
              <span className="font-bold block mb-2 flex items-center"><AlertCircle className="w-4 h-4 mr-1.5"/> Sai các câu:</span> 
              <div className="flex flex-col gap-2">
                {submission.incorrectQuestions.map((id: string) => {
                  const idx = exam.questions.findIndex((q:any) => q.id === id);
                  const q = exam.questions[idx];
                  if (!q) return null;
                  
                  let studentAns: any = '';
                  try {
                    const parsedAnswers = typeof submission.answers === 'string' ? JSON.parse(submission.answers) : submission.answers;
                    studentAns = parsedAnswers[id];
                  } catch (e) {}
                  
                  let displayStudentAns = String(studentAns || '(Trống)');
                  let displayCorrectAns = String(q.correctAnswer || '(Trống)');
                  
                  if (q.type === 'true_false') {
                    try {
                      const sArr = Array.isArray(studentAns) ? studentAns : [];
                      const cArr = typeof q.correctAnswer === 'string' ? JSON.parse(q.correctAnswer || '[]') : (q.correctAnswer || []);
                      displayStudentAns = sArr.map((v: any) => v === true ? 'Đ' : v === false ? 'S' : '-').join('');
                      displayCorrectAns = cArr.map((v: any) => v === true ? 'Đ' : v === false ? 'S' : '-').join('');
                      if (!displayStudentAns) displayStudentAns = '(Trống)';
                    } catch(e) {}
                  }
                  
                  return (
                    <div key={id} className="bg-white px-3 py-2 rounded-md shadow-sm border border-rose-100">
                      <span className="font-bold">Câu {idx !== -1 ? idx + 1 : '?'}:</span> Bạn chọn <span className="line-through text-rose-400 font-semibold">{displayStudentAns}</span> <span className="text-emerald-600 font-bold ml-1">(Đáp án: {displayCorrectAns})</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="mt-8 text-sm text-emerald-700 bg-emerald-50/80 border border-emerald-100 p-5 rounded-xl font-bold shadow-sm flex items-center justify-center">
              <CheckCircle className="w-5 h-5 mr-2"/> Hoàn hảo! Bạn không sai câu nào.
            </div>
          )}
        </div>

        {submission.incorrectQuestions && submission.incorrectQuestions.length > 0 && (
          <div className="mb-8 text-left">
            <h3 className="text-xl font-bold text-gray-800 mb-4 flex items-center">
              <BookOpen className="w-5 h-5 mr-2 text-indigo-600" />
              Lời giải chi tiết các câu sai
            </h3>
            <div className="space-y-6">
              {submission.incorrectQuestions.map((id: string) => {
                const idx = exam.questions.findIndex((q:any) => q.id === id);
                const question = exam.questions[idx];
                if (!question) return null;

                return (
                  <div key={id} className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
                    <div className="font-bold text-lg text-indigo-700 mb-3">Câu {idx + 1}</div>
                    <div className="text-gray-800 mb-4 font-medium overflow-hidden">
                      <MathText text={question.content} />
                    </div>
                    
                    {question.imageUrls && question.imageUrls.length > 0 && (
                      <div className="mb-4 space-y-4">
                        {question.imageUrls.map((url: string, imgIdx: number) => (
                          <img key={imgIdx} src={url} alt={`Câu ${idx + 1} - ảnh ${imgIdx + 1}`} className="max-w-full h-auto rounded-md border border-gray-200" />
                        ))}
                      </div>
                    )}
                    {question.imageUrl && (!question.imageUrls || question.imageUrls.length === 0) && (
                      <div className="mb-4">
                        <img src={question.imageUrl} alt={`Câu ${idx + 1}`} className="max-w-full h-auto rounded-md border border-gray-200" />
                      </div>
                    )}

                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mt-4">
                      <div className="font-semibold text-indigo-800 mb-2">Lời giải:</div>
                      <div className="text-gray-700 overflow-hidden">
                        {question.explanation ? (
                          <MathText text={question.explanation} />
                        ) : (
                          <span className="italic text-gray-500">Giáo viên chưa cung cấp lời giải cho câu hỏi này.</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => navigate('/student')}
          className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-2xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5 text-lg"
        >
          Quay lại danh sách bài tập
        </button>
      </div>
    </div>
  );
}
