import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, onAuthStateChanged, signOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';

export type UserRole = 'teacher' | 'student';

export interface AppUser {
  uid: string;
  email: string;
  role: UserRole;
  name: string;
  className?: string;
  createdAt: string;
}

interface AuthContextType {
  user: User | null;
  appUser: AppUser | null;
  loading: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  appUser: null,
  loading: true,
  loginWithGoogle: async () => {},
  logout: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [appUser, setAppUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            setAppUser(userDoc.data() as AppUser);
          } else {
            // Auto-create teacher document if it's the authorized email
            if (firebaseUser.email === 'dongocthuongqn1@gmail.com') {
              const newUser: AppUser = {
                uid: firebaseUser.uid,
                email: firebaseUser.email || '',
                role: 'teacher',
                name: firebaseUser.displayName || 'Giáo viên',
                createdAt: new Date().toISOString(),
              };
              await setDoc(userDocRef, newUser);
              setAppUser(newUser);
            } else {
              // If not the authorized teacher and no student doc exists, sign out
              await signOut(auth);
              setAppUser(null);
              setUser(null);
            }
          }
        } catch (error: any) {
          console.error("Error fetching user data:", error);
          setAppUser(null);
        }
      } else {
        setAppUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    // Force prompt to select account so user isn't stuck with a wrong default account
    provider.setCustomParameters({
      prompt: 'select_account'
    });
    
    try {
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      
      if (firebaseUser.email !== 'dongocthuongqn1@gmail.com') {
        await signOut(auth);
        throw new Error('Tài khoản này không được phép đăng nhập với tư cách giáo viên. Vui lòng sử dụng tài khoản dongocthuongqn1@gmail.com.');
      }
      
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (!userDoc.exists()) {
        const newUser: AppUser = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          role: 'teacher',
          name: firebaseUser.displayName || 'Giáo viên',
          createdAt: new Date().toISOString(),
        };
        await setDoc(userDocRef, newUser);
        setAppUser(newUser);
      } else {
        setAppUser(userDoc.data() as AppUser);
      }
    } catch (error: any) {
      console.error("Error signing in with Google", error);
      const isAuthReady = auth.currentUser != null;
      const uid = auth.currentUser?.uid;
      if (error.code === 'permission-denied' || error.code === 'firestore/permission-denied' || error.message?.includes('permission')) {
        throw new Error(`Lỗi quyền truy cập (Permission Denied). Debug info: isAuthReady=${isAuthReady}, uid=${uid}. Vui lòng kiểm tra lại Firestore Rules.`);
      }
      if (error.message?.includes('offline') || error.code === 'unavailable') {
        throw new Error('Không thể kết nối đến máy chủ. Vui lòng tắt trình chặn quảng cáo (Adblock, Brave Shields...) hoặc thử mở bằng tab ẩn danh/trình duyệt khác.');
      }
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setAppUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, appUser, loading, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
