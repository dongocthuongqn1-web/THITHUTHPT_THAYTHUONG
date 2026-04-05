import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, addDoc, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Link } from 'react-router-dom';
import { Plus, Users, FileText, LogOut, Edit, Trash2, Upload, X, AlertTriangle, Clock, Phone } from 'lucide-react';
import * as XLSX from 'xlsx';

// Secondary app for creating users without logging out the main user
const secondaryApp = getApps().find(app => app.name === 'Secondary') || initializeApp(firebaseConfig, 'Secondary');
const secondaryAuth = getAuth(secondaryApp);

export default function TeacherDashboard() {
  const { appUser, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<'exams' | 'students' | 'phones'>('exams');
  
  // Exams state
  const [exams, setExams] = useState<any[]>([]);
  
  // Students state
  const [students, setStudents] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [newStudent, setNewStudent] = useState({ name: '', email: '', password: '', className: '', phone: '' });
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [studentError, setStudentError] = useState('');
  
  const [isImporting, setIsImporting] = useState(false);
  const [editingStudent, setEditingStudent] = useState<any>(null);
  const [editStudentData, setEditStudentData] = useState({ name: '', className: '', password: '' });
  const [editingPhoneStudent, setEditingPhoneStudent] = useState<any>(null);
  const [editPhoneData, setEditPhoneData] = useState({ phone: '' });
  const [studentToDelete, setStudentToDelete] = useState<string | null>(null);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [examToDelete, setExamToDelete] = useState<string | null>(null);
  const [examToExtend, setExamToExtend] = useState<any>(null);
  const [newEndTime, setNewEndTime] = useState('');

  useEffect(() => {
    if (!appUser?.uid) return;

    const qExams = query(collection(db, 'exams'), where('teacherId', '==', appUser.uid));
    const unsubExams = onSnapshot(qExams, (snapshot) => {
      const examsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Sort exams by number in title
      examsList.sort((a: any, b: any) => {
        const titleA = a.title || '';
        const titleB = b.title || '';
        
        const matchA = titleA.match(/\d+/);
        const matchB = titleB.match(/\d+/);
        
        if (matchA && matchB) {
          const numA = parseInt(matchA[0], 10);
          const numB = parseInt(matchB[0], 10);
          if (numA !== numB) {
            return numA - numB;
          }
        }
        
        return titleA.localeCompare(titleB);
      });
      
      setExams(examsList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'exams'));

    const qStudents = query(collection(db, 'users'), where('role', '==', 'student'));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      const studentsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort students by class name, then by first name (tên)
      studentsList.sort((a: any, b: any) => {
        const classA = a.className || '';
        const classB = b.className || '';
        const classCompare = classA.localeCompare(classB, 'vi');
        
        if (classCompare !== 0) return classCompare;
        
        const nameA = a.name || '';
        const nameB = b.name || '';
        
        const getFirstName = (fullName: string) => {
          const parts = fullName.trim().split(' ');
          return parts[parts.length - 1] || '';
        };
        
        const firstNameA = getFirstName(nameA);
        const firstNameB = getFirstName(nameB);
        
        const nameCompare = firstNameA.localeCompare(firstNameB, 'vi');
        if (nameCompare !== 0) return nameCompare;
        
        return nameA.localeCompare(nameB, 'vi');
      });
      setStudents(studentsList);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'users'));

    const qSubmissions = query(collection(db, 'submissions'));
    const unsubSubmissions = onSnapshot(qSubmissions, (snapshot) => {
      setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'submissions'));

    return () => {
      unsubExams();
      unsubStudents();
      unsubSubmissions();
    };
  }, [appUser?.uid]);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingStudent(true);
    setStudentError('');
    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, newStudent.email, newStudent.password);
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        email: newStudent.email,
        name: newStudent.name,
        className: newStudent.className,
        password: newStudent.password,
        role: 'student',
        createdAt: new Date().toISOString()
      });
      await signOut(secondaryAuth);
      setNewStudent({ name: '', email: '', password: '', className: '', phone: '' });
      alert('Tạo học sinh thành công!');
    } catch (error: any) {
      console.error("Error creating student:", error);
      if (error.code === 'auth/email-already-in-use') {
        try {
          // Attempt to recover by signing in if the account exists but Firestore doc was deleted
          const signInCredential = await signInWithEmailAndPassword(secondaryAuth, newStudent.email, newStudent.password);
          await setDoc(doc(db, 'users', signInCredential.user.uid), {
            uid: signInCredential.user.uid,
            email: newStudent.email,
            name: newStudent.name,
            className: newStudent.className,
            password: newStudent.password,
            role: 'student',
            createdAt: new Date().toISOString()
          });
          await signOut(secondaryAuth);
          setNewStudent({ name: '', email: '', password: '', className: '', phone: '' });
          alert('Tài khoản đã tồn tại trong hệ thống. Đã khôi phục và cập nhật hồ sơ học sinh thành công!');
        } catch (signInError: any) {
          if (signInError.code === 'auth/wrong-password' || signInError.code === 'auth/invalid-credential') {
             setStudentError('Email này đã được sử dụng bởi một tài khoản khác với mật khẩu khác. Vui lòng sử dụng email khác.');
          } else {
             setStudentError('Email này đã được sử dụng và không thể khôi phục. Lỗi: ' + signInError.message);
          }
        }
      } else if (error.code === 'auth/operation-not-allowed') {
        setStudentError('LỖI NGHIÊM TRỌNG: Bạn CHƯA BẬT chức năng đăng nhập bằng Email/Mật khẩu trên Firebase! Vui lòng vào Firebase Console -> Authentication -> Sign-in method -> Bật "Email/Password".');
        alert('LỖI NGHIÊM TRỌNG: Bạn CHƯA BẬT chức năng đăng nhập bằng Email/Mật khẩu trên Firebase!\n\nVui lòng làm theo hướng dẫn:\n1. Vào Firebase Console\n2. Chọn Authentication -> Sign-in method\n3. Bật "Email/Password"\n4. Lưu lại và thử lại.');
      } else if (error.code === 'auth/invalid-email') {
        setStudentError('Địa chỉ email không hợp lệ (phải có dạng ten@mien.com).');
      } else if (error.code === 'auth/weak-password') {
        setStudentError('Mật khẩu quá yếu (phải có ít nhất 6 ký tự).');
      } else if (error.code === 'auth/invalid-credential') {
        setStudentError('Thông tin xác thực không hợp lệ. Vui lòng kiểm tra lại email và mật khẩu.');
      } else {
        setStudentError('Lỗi: ' + error.message);
      }
    } finally {
      setCreatingStudent(false);
    }
  };

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setStudentError('');
    
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        let successCount = 0;
        let errorCount = 0;
        let isOperationNotAllowed = false;
        let emailInUseCount = 0;
        let invalidEmailCount = 0;
        let weakPasswordCount = 0;

        for (const row of json) {
          const name = row['FullName'] || row['Họ và tên'];
          const className = row['Class'] || row['Lớp'];
          const email = row['Email']?.toString().trim();
          const password = row['Password'] || row['Mật khẩu'];
          const phone = row['Phone'] || row['Số điện thoại'] || '';
          const role = row['Role'];

          // Skip if role is explicitly set to something other than student
          if (role && String(role).toLowerCase() !== 'student') {
            continue;
          }

          if (name && className && email && password) {
            try {
              const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, String(password));
              await setDoc(doc(db, 'users', userCredential.user.uid), {
                uid: userCredential.user.uid,
                email: email,
                name: String(name).trim(),
                className: String(className).trim(),
                password: String(password),
                phone: String(phone).trim(),
                role: 'student',
                createdAt: new Date().toISOString()
              });
              await signOut(secondaryAuth);
              successCount++;
            } catch (err: any) {
              if (err.code === 'auth/email-already-in-use') {
                try {
                  // Attempt to recover by signing in
                  const signInCredential = await signInWithEmailAndPassword(secondaryAuth, email, String(password));
                  await setDoc(doc(db, 'users', signInCredential.user.uid), {
                    uid: signInCredential.user.uid,
                    email: email,
                    name: String(name).trim(),
                    className: String(className).trim(),
                    password: String(password),
                    phone: String(phone).trim(),
                    role: 'student',
                    createdAt: new Date().toISOString()
                  });
                  await signOut(secondaryAuth);
                  successCount++;
                } catch (signInErr: any) {
                  console.error("Lỗi khôi phục tài khoản cho", email, signInErr);
                  emailInUseCount++;
                  errorCount++;
                }
              } else {
                console.error("Lỗi tạo tài khoản cho", email, err);
                if (err.code === 'auth/operation-not-allowed') {
                  isOperationNotAllowed = true;
                } else if (err.code === 'auth/invalid-email') {
                  invalidEmailCount++;
                } else if (err.code === 'auth/weak-password') {
                  weakPasswordCount++;
                }
                errorCount++;
              }
            }
          } else {
            errorCount++;
          }
        }
        
        if (isOperationNotAllowed) {
          alert('LỖI NGHIÊM TRỌNG: Bạn CHƯA BẬT chức năng đăng nhập bằng Email/Mật khẩu trên Firebase!\n\nVui lòng làm theo hướng dẫn:\n1. Vào Firebase Console\n2. Chọn Authentication -> Sign-in method\n3. Bật "Email/Password"\n4. Lưu lại và thử lại.');
          setStudentError('Vui lòng bật Email/Password trong Firebase Console (Authentication -> Sign-in method).');
        } else {
          let msg = `Nhập thành công: ${successCount} học sinh.\n`;
          if (errorCount > 0) {
            msg += `Thất bại: ${errorCount} dòng.\nChi tiết lỗi:\n`;
            if (emailInUseCount > 0) msg += `- ${emailInUseCount} email đã tồn tại.\n`;
            if (invalidEmailCount > 0) msg += `- ${invalidEmailCount} email không hợp lệ (sai định dạng).\n`;
            if (weakPasswordCount > 0) msg += `- ${weakPasswordCount} mật khẩu quá yếu (dưới 6 ký tự).\n`;
            const otherErrors = errorCount - emailInUseCount - invalidEmailCount - weakPasswordCount;
            if (otherErrors > 0) msg += `- ${otherErrors} dòng thiếu dữ liệu (tên, lớp, email hoặc mật khẩu).\n`;
          }
          alert(msg);
        }
      } catch (err: any) {
        setStudentError('Lỗi đọc file Excel: ' + err.message);
      } finally {
        setIsImporting(false);
        e.target.value = ''; // Reset file input
      }
    };
    reader.onerror = () => {
      setStudentError('Lỗi đọc file.');
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUpdateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    try {
      await updateDoc(doc(db, 'users', editingStudent.id), {
        name: editStudentData.name,
        className: editStudentData.className,
        password: editStudentData.password
      });
      setEditingStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingStudent.id}`);
    }
  };

  const handleUpdatePhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPhoneStudent) return;
    try {
      await updateDoc(doc(db, 'users', editingPhoneStudent.id), {
        phone: editPhoneData.phone
      });
      setEditingPhoneStudent(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingPhoneStudent.id}`);
    }
  };

  const handleDeleteStudent = async () => {
    if (!studentToDelete) return;
    try {
      await deleteDoc(doc(db, 'users', studentToDelete));
      setStudentToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${studentToDelete}`);
    }
  };

  const handleDeleteAllStudents = async () => {
    try {
      // In a real app, you might want to do this in batches if there are many students
      const deletePromises = students.map(student => deleteDoc(doc(db, 'users', student.id)));
      await Promise.all(deletePromises);
      setIsDeletingAll(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users`);
    }
  };

  const handleDeleteExam = async () => {
    if (!examToDelete) return;
    try {
      await deleteDoc(doc(db, 'exams', examToDelete));
      setExamToDelete(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${examToDelete}`);
    }
  };

  const handleExtendTime = async () => {
    if (!examToExtend || !newEndTime) return;
    try {
      const examRef = doc(db, 'exams', examToExtend.id);
      await updateDoc(examRef, { endTime: newEndTime });
      setExamToExtend(null);
      setNewEndTime('');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `exams/${examToExtend.id}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-gradient-to-r from-indigo-600 to-purple-600 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-white tracking-wide">Giáo viên: {appUser?.name}</h1>
            </div>
            <div className="flex items-center space-x-4">
              <button onClick={logout} className="text-indigo-100 hover:text-white flex items-center transition-colors font-medium">
                <LogOut className="w-5 h-5 mr-1" /> Đăng xuất
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex space-x-4 mb-8">
          <button
            onClick={() => setActiveTab('exams')}
            className={`px-6 py-2.5 rounded-full font-semibold flex items-center transition-all duration-200 shadow-sm ${activeTab === 'exams' ? 'bg-indigo-600 text-white shadow-md transform -translate-y-0.5' : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
          >
            <FileText className="w-5 h-5 mr-2" /> Quản lý Đề thi
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`px-6 py-2.5 rounded-full font-semibold flex items-center transition-all duration-200 shadow-sm ${activeTab === 'students' ? 'bg-indigo-600 text-white shadow-md transform -translate-y-0.5' : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
          >
            <Users className="w-5 h-5 mr-2" /> Quản lý Học sinh
          </button>
          <button
            onClick={() => setActiveTab('phones')}
            className={`px-6 py-2.5 rounded-full font-semibold flex items-center transition-all duration-200 shadow-sm ${activeTab === 'phones' ? 'bg-indigo-600 text-white shadow-md transform -translate-y-0.5' : 'bg-white text-gray-600 hover:bg-indigo-50 hover:text-indigo-700'}`}
          >
            <Phone className="w-5 h-5 mr-2" /> Danh sách SĐT
          </button>
        </div>

        {activeTab === 'exams' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Danh sách Đề thi</h2>
              <Link to="/teacher/exam/new" className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-5 py-2.5 rounded-full font-medium flex items-center hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5">
                <Plus className="w-5 h-5 mr-1" /> Tạo đề thi mới
              </Link>
            </div>
            <div className="bg-white shadow-md overflow-hidden sm:rounded-2xl border border-gray-100">
              <ul className="divide-y divide-gray-100">
                {exams.length === 0 ? (
                  <li className="px-6 py-12 text-center text-gray-500">
                    <FileText className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                    <p className="text-lg font-medium">Chưa có đề thi nào.</p>
                    <p className="text-sm mt-1">Hãy tạo đề thi đầu tiên của bạn!</p>
                  </li>
                ) : exams.map((exam, index) => (
                  <li key={exam.id} className="hover:bg-indigo-50/50 transition-colors duration-150">
                    <div className="px-6 py-5 flex justify-between items-center">
                      <div className="flex items-start">
                        <span className="text-xl font-black text-indigo-200 w-8 flex-shrink-0 mt-0.5">{index + 1}.</span>
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 truncate mb-1">{exam.title}</h3>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
                            <span className="flex items-center bg-gray-100 px-2.5 py-1 rounded-md font-medium">
                              <Clock className="w-4 h-4 mr-1.5 text-gray-500" /> {exam.duration} phút
                            </span>
                            <span className={`px-2.5 py-1 rounded-md font-medium ${exam.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                              {exam.status === 'published' ? 'Đã giao' : 'Bản nháp'}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-gray-600 flex items-center">
                            <span className="font-medium mr-1">Lớp được giao:</span> {exam.assignedClasses?.join(', ') || 'Chưa giao'}
                          </p>
                          {(exam.startTime || exam.endTime) && (
                            <p className="mt-1 text-sm text-gray-500">
                              Thời gian mở: {exam.startTime ? new Date(exam.startTime).toLocaleString('vi-VN') : 'Không giới hạn'} - {exam.endTime ? new Date(exam.endTime).toLocaleString('vi-VN') : 'Không giới hạn'}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {exam.status === 'published' && (
                          <>
                            <button
                              onClick={() => {
                                setExamToExtend(exam);
                                setNewEndTime(exam.endTime || '');
                              }}
                              className="px-3 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg font-medium text-sm transition-colors"
                            >
                              Gia hạn
                            </button>
                            <Link to={`/teacher/exam/${exam.id}/results`} className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg font-medium text-sm transition-colors">
                              Xem kết quả
                            </Link>
                          </>
                        )}
                        <Link to={`/teacher/exam/${exam.id}/edit`} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Chỉnh sửa">
                          <Edit className="w-5 h-5" />
                        </Link>
                        <button 
                          onClick={() => setExamToDelete(exam.id)}
                          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                          title="Xóa"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'students' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-1">
              <div className="bg-white shadow-lg rounded-2xl p-6 border border-gray-100">
                <h3 className="text-xl font-bold text-gray-900 mb-6 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">Tạo tài khoản học sinh</h3>
                <form onSubmit={handleCreateStudent} className="space-y-5">
                  {studentError && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <AlertTriangle className="h-5 w-5 text-red-500" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm text-red-700 font-medium">{studentError}</p>
                        </div>
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Họ và tên</label>
                    <input type="text" required value={newStudent.name} onChange={e => setNewStudent({...newStudent, name: e.target.value})} className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Lớp</label>
                    <input type="text" required value={newStudent.className} onChange={e => setNewStudent({...newStudent, className: e.target.value})} className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Email</label>
                    <input type="email" required value={newStudent.email} onChange={e => setNewStudent({...newStudent, email: e.target.value})} className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Mật khẩu</label>
                    <input type="password" required minLength={6} value={newStudent.password} onChange={e => setNewStudent({...newStudent, password: e.target.value})} className="block w-full border border-gray-300 rounded-xl shadow-sm py-2.5 px-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm transition-colors" />
                  </div>
                  <button type="submit" disabled={creatingStudent} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 transition-all transform hover:-translate-y-0.5">
                    {creatingStudent ? 'Đang tạo...' : 'Tạo tài khoản'}
                  </button>
                </form>

                <div className="mt-8 pt-6 border-t border-gray-100">
                  <h4 className="text-sm font-bold text-gray-900 mb-2">Hoặc nhập từ file Excel</h4>
                  <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                    File Excel cần có các cột: <strong>FullName</strong>, <strong>Class</strong>, <strong>Email</strong>, <strong>Password</strong>, <strong>Phone</strong> (có thể thêm cột <strong>Role</strong> là "student").
                  </p>
                  <label className="w-full flex justify-center items-center py-3 px-4 border-2 border-dashed border-indigo-300 rounded-xl shadow-sm text-sm font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 cursor-pointer transition-colors">
                    {isImporting ? <span className="animate-pulse">Đang nhập...</span> : <><Upload className="w-5 h-5 mr-2" /> Chọn file Excel</>}
                    <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} disabled={isImporting} />
                  </label>
                </div>
              </div>
            </div>
            <div className="md:col-span-2">
              <div className="bg-white shadow-lg rounded-2xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-5 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-gray-900">Danh sách học sinh</h3>
                  {students.length > 0 && (
                    <button 
                      onClick={() => setIsDeletingAll(true)}
                      className="text-sm bg-red-50 text-red-600 hover:bg-red-100 px-4 py-2 rounded-lg flex items-center font-bold transition-colors"
                    >
                      <Trash2 className="w-4 h-4 mr-2" /> Xóa toàn bộ
                    </button>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full table-fixed divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="w-[22%] px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Họ tên</th>
                        <th className="w-[8%] px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lớp</th>
                        <th className="w-[24%] px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="w-[12%] px-3 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Mật khẩu</th>
                        <th className="w-[24%] px-3 py-3 text-center text-xs font-bold text-gray-500 uppercase tracking-wider">Thống kê</th>
                        <th className="w-[10%] px-3 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                      {students.map((student) => {
                        const now = new Date();
                        
                        const assignedExamsList = exams.filter(exam => 
                          exam.status === 'published' && 
                          exam.assignedClasses && 
                          exam.assignedClasses.includes(student.className)
                        );
                        
                        const totalAssignedExams = assignedExamsList.length;
                        
                        const openedExams = assignedExamsList.filter(exam => 
                          !exam.startTime || new Date(exam.startTime) <= now
                        ).length;
                        
                        const completedExams = submissions.filter(sub => sub.studentId === student.uid).length;
                        
                        return (
                        <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-3 text-sm font-semibold text-gray-900 truncate" title={student.name}>{student.name}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm text-gray-600">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {student.className}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-xs text-gray-600 truncate" title={student.email}>{student.email}</td>
                          <td className="px-3 py-3 whitespace-nowrap text-xs text-gray-500">
                            <span className="font-mono bg-gray-50 rounded px-1.5 py-1">{student.password || '***'}</span>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-center text-sm font-medium">
                            <div className="flex flex-col items-center justify-center">
                              <span className={`text-base font-bold ${completedExams === openedExams && openedExams > 0 ? 'text-emerald-600' : completedExams === 0 && openedExams > 0 ? 'text-rose-500' : 'text-indigo-600'}`}>
                                {completedExams} <span className="text-gray-400 text-xs font-normal">/ {openedExams} / {totalAssignedExams}</span>
                              </span>
                              <span className="text-[9px] text-gray-500 uppercase tracking-wider mt-0.5">Đã làm / Đã mở / Đã giao</span>
                            </div>
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-right text-sm font-medium">
                            <div className="flex justify-end space-x-2">
                              <button 
                                onClick={() => {
                                  setEditingStudent(student);
                                  setEditStudentData({ name: student.name, className: student.className || '', password: student.password || '' });
                                }}
                                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                title="Chỉnh sửa"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setStudentToDelete(student.id)}
                                className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      )})}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'phones' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          <div className="bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-gray-900">Danh sách số điện thoại học sinh</h3>
                <p className="text-sm text-gray-500 mt-1">Quản lý số điện thoại Zalo để gửi thông báo</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Họ tên</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Lớp</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Email</th>
                    <th className="px-6 py-4 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Số điện thoại (Zalo)</th>
                    <th className="px-6 py-4 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                  {students.map((student) => (
                    <tr key={student.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">{student.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {student.className}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{student.email}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {student.phone ? (
                          <span className="text-indigo-600 font-mono">{student.phone}</span>
                        ) : (
                          <span className="text-gray-400 italic">Chưa cập nhật</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => {
                            setEditingPhoneStudent(student);
                            setEditPhoneData({ phone: student.phone || '' });
                          }}
                          className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Cập nhật SĐT"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Phone Modal */}
      {editingPhoneStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Cập nhật số điện thoại</h3>
            <p className="text-sm text-gray-600 mb-4">Học sinh: <span className="font-semibold">{editingPhoneStudent.name}</span></p>
            <form onSubmit={handleUpdatePhone}>
              <div>
                <label className="block text-sm font-medium text-gray-700">Số điện thoại (Zalo)</label>
                <input type="tel" value={editPhoneData.phone} onChange={e => setEditPhoneData({...editPhoneData, phone: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" placeholder="09xxxx..." />
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setEditingPhoneStudent(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Chỉnh sửa Học sinh</h3>
              <button onClick={() => setEditingStudent(null)} className="text-gray-400 hover:text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateStudent} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Họ và tên</label>
                <input type="text" required value={editStudentData.name} onChange={e => setEditStudentData({...editStudentData, name: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Lớp</label>
                <input type="text" required value={editStudentData.className} onChange={e => setEditStudentData({...editStudentData, className: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Mật khẩu (Ghi chú)</label>
                <input type="text" value={editStudentData.password} onChange={e => setEditStudentData({...editStudentData, password: e.target.value})} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm" />
                <p className="mt-1 text-xs text-gray-500">Lưu ý: Mật khẩu ở đây chỉ để ghi nhớ, không làm thay đổi mật khẩu đăng nhập thực tế của học sinh.</p>
              </div>
              <div className="pt-4 flex justify-end space-x-3">
                <button type="button" onClick={() => setEditingStudent(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                  Hủy
                </button>
                <button type="submit" className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Student Confirm Modal */}
      {studentToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4 text-red-600">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Xác nhận xóa học sinh</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Bạn có chắc chắn muốn xóa học sinh này không? (Lưu ý: Chỉ xóa hồ sơ trên hệ thống, tài khoản đăng nhập Firebase vẫn tồn tại).
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setStudentToDelete(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Hủy
              </button>
              <button onClick={handleDeleteStudent} className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">
                Xóa học sinh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete All Students Confirm Modal */}
      {isDeletingAll && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4 text-red-600">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Xác nhận xóa TOÀN BỘ học sinh</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Bạn có chắc chắn muốn xóa <strong>tất cả {students.length} học sinh</strong> không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setIsDeletingAll(false)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Hủy
              </button>
              <button onClick={handleDeleteAllStudents} className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">
                Xóa toàn bộ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Exam Confirm Modal */}
      {examToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex items-center mb-4 text-red-600">
              <AlertTriangle className="w-6 h-6 mr-2" />
              <h3 className="text-lg font-medium text-gray-900">Xác nhận xóa đề thi</h3>
            </div>
            <p className="text-sm text-gray-500 mb-6">
              Bạn có chắc chắn muốn xóa đề thi này không? Hành động này không thể hoàn tác.
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setExamToDelete(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Hủy
              </button>
              <button onClick={handleDeleteExam} className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700">
                Xóa đề thi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Time Modal */}
      {examToExtend && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Gia hạn thời gian</h3>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Thời gian kết thúc mới</label>
              <input 
                type="datetime-local" 
                value={newEndTime} 
                onChange={(e) => setNewEndTime(e.target.value)}
                className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              />
            </div>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setExamToExtend(null)} className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                Hủy
              </button>
              <button onClick={handleExtendTime} className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
                Lưu thay đổi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
