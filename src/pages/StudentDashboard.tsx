import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { LogOut, PlayCircle, CheckCircle, XCircle } from 'lucide-react';

export default function StudentDashboard() {
  const { appUser, logout } = useAuth();
  const [exams, setExams] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);

  useEffect(() => {
    if (!appUser?.uid || !appUser?.className) return;

    // Fetch published exams assigned to student's class
    const qExams = query(
      collection(db, 'exams'),
      where('status', '==', 'published'),
      where('assignedClasses', 'array-contains', appUser.className)
    );
    
    const unsubExams = onSnapshot(qExams, (snapshot) => {
      setExams(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'exams'));

    // Fetch student's submissions
    const qSubmissions = query(
      collection(db, 'submissions'),
      where('studentId', '==', appUser.uid)
    );
    
    const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'submissions'));

    return () => {
      unsubExams();
      unsubSubmissions();
    };
  }, [appUser?.uid, appUser?.className]);

  const getSubmission = (examId: string) => {
    return submissions.find(s => s.examId === examId);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white tracking-wide">Học sinh: {appUser?.name} <span className="font-normal opacity-80">({appUser?.className})</span></h1>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={logout} className="text-blue-100 hover:text-white flex items-center transition-colors font-medium">
                <LogOut className="w-5 h-5 mr-1" /> Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-6">Đề thi của bạn</h2>
        
        <div className="bg-white shadow-md overflow-hidden sm:rounded-2xl border border-gray-100">
          <ul className="divide-y divide-gray-100">
            {exams.length === 0 ? (
              <li className="px-6 py-12 text-center text-gray-500">
                <CheckCircle className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                <p className="text-lg font-medium">Chưa có đề thi nào được giao.</p>
                <p className="text-sm mt-1">Hãy quay lại sau nhé!</p>
              </li>
            ) : exams.map((exam) => {
              const sub = getSubmission(exam.id);
              const now = new Date().getTime();
              const startTime = exam.startTime ? new Date(exam.startTime).getTime() : null;
              const endTime = exam.endTime ? new Date(exam.endTime).getTime() : null;
              
              const isBeforeStart = startTime && now < startTime;
              const isAfterEnd = endTime && now > endTime;
              
              return (
                <li key={exam.id} className="hover:bg-blue-50/50 transition-colors duration-150">
                  <div className="px-6 py-5 sm:flex sm:justify-between sm:items-center">
                    <div className="mb-4 sm:mb-0">
                      <h3 className="text-lg font-bold text-gray-900 truncate mb-1">{exam.title}</h3>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                        <span className="flex items-center bg-gray-100 px-2.5 py-1 rounded-md font-medium">
                          Thời gian làm bài: {exam.duration} phút
                        </span>
                      </div>
                      {(exam.startTime || exam.endTime) && (
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-medium mr-1">Mở:</span> {exam.startTime ? new Date(exam.startTime).toLocaleString('vi-VN') : 'Không giới hạn'} - {exam.endTime ? new Date(exam.endTime).toLocaleString('vi-VN') : 'Không giới hạn'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center space-x-4">
                      {sub ? (
                        <div className="flex flex-col items-end">
                          <div className="flex items-center text-emerald-600 font-semibold text-sm mb-2 bg-emerald-50 px-3 py-1 rounded-full">
                            <CheckCircle className="w-4 h-4 mr-1.5" />
                            Đã hoàn thành
                          </div>
                          <Link
                            to={`/student/exam/${exam.id}/result`}
                            className="inline-flex items-center px-5 py-2.5 border border-gray-200 shadow-sm text-sm font-semibold rounded-xl text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-300 transition-all transform hover:-translate-y-0.5"
                          >
                            Xem kết quả
                          </Link>
                        </div>
                      ) : isBeforeStart ? (
                        <div className="text-gray-500 font-semibold bg-gray-100 px-5 py-2.5 rounded-xl border border-gray-200">
                          Chưa mở
                        </div>
                      ) : isAfterEnd ? (
                        <div className="text-red-500 font-semibold bg-red-50 px-5 py-2.5 rounded-xl border border-red-100">
                          Đã đóng
                        </div>
                      ) : (
                        <Link
                          to={`/student/exam/${exam.id}`}
                          className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-semibold rounded-xl shadow-md text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all transform hover:-translate-y-0.5"
                        >
                          <PlayCircle className="w-5 h-5 mr-2" /> Bắt đầu làm bài
                        </Link>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
