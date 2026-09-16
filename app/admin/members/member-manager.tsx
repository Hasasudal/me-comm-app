'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RotateCcw, Search, UserX } from 'lucide-react';

type User={id:string;email:string;display_name:string;status:'active'|'suspended';created_at:number};
type Session={signedIn:boolean;admin:boolean};

async function getJson<T>(path:string,options?:RequestInit){const response=await fetch(path,{cache:'no-store',...options});const data=await response.json() as T&{error?:string};if(!response.ok)throw new Error(data.error||'요청을 처리하지 못했습니다.');return data;}

export default function MemberManager(){
 const [allowed,setAllowed]=useState<boolean|null>(null);const [users,setUsers]=useState<User[]>([]);const [query,setQuery]=useState('');const [status,setStatus]=useState('all');const [page,setPage]=useState(1);const [total,setTotal]=useState(0);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const load=useCallback(async(nextPage=page)=>{setBusy(true);setError('');try{const result=await getJson<{users:User[];total:number}>(`/api/admin/users?q=${encodeURIComponent(query)}&status=${status}&page=${nextPage}`);setUsers(result.users);setTotal(result.total);setPage(nextPage);}catch(cause){setError((cause as Error).message);}finally{setBusy(false);}},[page,query,status]);
 useEffect(()=>{getJson<Session>('/api/session').then(session=>{setAllowed(session.admin);if(session.admin)return load(1);}).catch(()=>setAllowed(false));},[load]);
 async function search(event:FormEvent){event.preventDefault();await load(1);}
 async function change(user:User){const next=user.status==='active'?'suspended':'active';if(!window.confirm(next==='suspended'?`${user.display_name} 회원의 이용을 정지할까요?`:`${user.display_name} 회원의 이용을 복구할까요?`))return;setBusy(true);setError('');try{await getJson(`/api/admin/users/${encodeURIComponent(user.id)}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:next})});await load(page);}catch(cause){setError((cause as Error).message);setBusy(false);}}
 if(allowed===null)return <p className="join-state">관리자 권한을 확인하고 있습니다…</p>;
 if(!allowed)return <div className="form-error">관리자 권한이 필요합니다.</div>;
 return <div className="member-manager"><form className="member-search" onSubmit={search}><div className="code-input"><Search size={17}/><input aria-label="회원 검색" value={query} onChange={event=>setQuery(event.target.value)} maxLength={100} placeholder="이름 또는 학교 이메일"/></div><select aria-label="회원 상태" value={status} onChange={event=>setStatus(event.target.value)}><option value="all">전체 상태</option><option value="active">이용 중</option><option value="suspended">정지</option></select><button className="primary" disabled={busy}>검색</button></form>{error&&<p className="form-error" role="alert">{error}</p>}<p className="member-count">총 {total}명</p><div className="managed-list">{users.map(user=><article key={user.id}><div><strong>{user.display_name}</strong><span>{user.email}</span><small className={user.status}>{user.status==='active'?'이용 중':'이용 정지'}</small></div><button className={user.status==='active'?'suspend-button':'restore-button'} disabled={busy} onClick={()=>void change(user)}>{user.status==='active'?<><UserX size={16}/>정지</>:<><RotateCcw size={16}/>복구</>}</button></article>)}{!busy&&!users.length&&<p className="empty-members">조건에 맞는 회원이 없습니다.</p>}</div><div className="member-pagination"><button className="secondary" disabled={busy||page<=1} onClick={()=>void load(page-1)}>이전</button><span>{page} 페이지</span><button className="secondary" disabled={busy||page*20>=total} onClick={()=>void load(page+1)}>다음</button></div></div>;
}
