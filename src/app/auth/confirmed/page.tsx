import type { Metadata } from 'next';
import { AuthConfirmed } from './auth-confirmed';
import './auth-confirmed.css';

export const metadata:Metadata={
  title:'회원가입 확인 | THE FOUNT 병원 입지분석',
  robots:{index:false,follow:false}
};

export default function AuthConfirmedPage(){
  return <AuthConfirmed/>;
}
