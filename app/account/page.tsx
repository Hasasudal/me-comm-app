import Link from 'next/link';
import AuthFrame from '../auth/auth-frame';
import AccountPanel from './account-panel';

export default function AccountPage(){return <AuthFrame eyebrow="MY ACCOUNT" title="계정 관리" description="학교 계정 정보와 미컴 라운지 이용 상태를 관리합니다." footer={<Link href="/">라운지로 돌아가기</Link>}><AccountPanel/></AuthFrame>;}
