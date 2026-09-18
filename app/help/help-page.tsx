'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../api-client';
import { AppShell, type ShellIdentity } from '../app-shell';

// The guide is readable without signing in, so people can check how to sign up.
export default function HelpPage() {
  const [identity, setIdentity] = useState<ShellIdentity & { admin?: boolean }>({ loaded: false, signedIn: false });
  useEffect(() => {
    api<ShellIdentity>('/api/session')
      .then((session) => setIdentity({ ...session, loaded: true }))
      .catch(() => setIdentity((value) => ({ ...value, loaded: true })));
  }, []);

  return (
    <AppShell
      active="help"
      identity={identity}
      breadcrumb={
        <>
          라운지 <ChevronRight size={14} /> <b>도움말</b>
        </>
      }
    >
      <section className="page-heading">
        <div>
          <p className="eyebrow">HELP</p>
          <h1>
            도움말<span className="heading-dot">.</span>
          </h1>
          <p>
            미컴 라운지 사용법입니다. 앞부분은 모든 학생, 뒷부분은 직책(학사·학생회·관리자)을 맡은 분을 위한 안내예요.
          </p>
        </div>
      </section>
      <div className="help-layout">
        <nav className="help-toc" aria-label="도움말 목차">
          <p className="help-toc-label">학생</p>
          <ol>
            <li>
              <a href="#start">가입과 로그인</a>
            </li>
            <li>
              <a href="#boards">게시판 한눈에</a>
            </li>
            <li>
              <a href="#write">글쓰기</a>
            </li>
            <li>
              <a href="#edit">수정·삭제</a>
            </li>
            <li>
              <a href="#comments">댓글과 알림</a>
            </li>
            <li>
              <a href="#search">검색과 필터</a>
            </li>
            <li>
              <a href="#news">학과 뉴스 기사 제출</a>
            </li>
            <li>
              <a href="#desk">학사문의·학생회 건의</a>
            </li>
            <li>
              <a href="#rental">대여 신청</a>
            </li>
            <li>
              <a href="#account">계정 관리</a>
            </li>
          </ol>
          <p className="help-toc-label">관리자</p>
          <ol>
            <li>
              <a href="#admin-join">직책 안내</a>
            </li>
            <li>
              <a href="#admin-review">뉴스 검토</a>
            </li>
            <li>
              <a href="#admin-desk">문의·건의 답변</a>
            </li>
            <li>
              <a href="#admin-board">게시판 관리</a>
            </li>
            <li>
              <a href="#admin-members">회원·직책 관리</a>
            </li>
          </ol>
          <p className="help-toc-label">도움말</p>
          <ol>
            <li>
              <a href="#faq">자주 묻는 질문</a>
            </li>
          </ol>
        </nav>
        <article className="help-page">
          <div className="part">
            <span className="part-label">학생 안내</span>
          </div>

          <section id="start">
            <h2>가입과 로그인</h2>
            <p>
              미컴 라운지는{' '}
              <strong>
                경성대 학교 이메일(<code>@ks.ac.kr</code>)을 인증한 학생만
              </strong>{' '}
              이용할 수 있습니다. 로그인하지 않으면 게시판 목록도, 글 내용도 볼 수 없습니다.
            </p>
            <ol className="steps">
              <li>
                오른쪽 위 <strong>회원가입</strong>을 누르고 이름, 학교 이메일, 비밀번호를 입력합니다. 이메일 칸에는{' '}
                <strong>@ks.ac.kr 앞의 메일 아이디만</strong> 넣으세요. 학번이 아니라 학교 메일에 로그인할 때 쓰는
                아이디예요.
              </li>
              <li>
                학교 메일함에 온 <strong>인증 메일</strong>의 링크를 누릅니다. 메일이 안 보이면 스팸함을 확인하세요.
              </li>
              <li>
                인증을 마친 뒤 <strong>로그인</strong>하면 모든 게시판을 이용할 수 있습니다.
              </li>
            </ol>
            <div className="note">
              휴대폰, 노트북 등 <strong>기기 5대까지 동시에 로그인</strong>할 수 있고, 로그인은 <strong>14일</strong>{' '}
              동안 유지됩니다. 6번째 기기에서 로그인하면 가장 오래된 기기가 로그아웃됩니다.
            </div>
          </section>

          <section id="boards">
            <h2>게시판 한눈에</h2>
            <p>
              왼쪽 사이드바에서 게시판을 고릅니다. 게시판마다 누가 볼 수 있는지가 다릅니다. 컴퓨터에서는 화면 왼쪽 위
              버튼으로 메뉴를 접고 펼 수 있고, 이 설정은 브라우저에 기억됩니다.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>게시판</th>
                    <th>무엇을 올리나요</th>
                    <th>누가 보나요</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>통합 게시판</td>
                    <td>아래 공개 게시판의 글을 최신순으로 모아 봅니다.</td>
                    <td>
                      <span className="pill open">모든 회원</span>
                    </td>
                  </tr>
                  <tr>
                    <td>자유게시판</td>
                    <td>일상, 질문, 정보 등 자유로운 이야기</td>
                    <td>
                      <span className="pill open">모든 회원</span>
                    </td>
                  </tr>
                  <tr>
                    <td>학사문의</td>
                    <td>장학, 휴학, 수강 등 학과 사무실에 묻는 1:1 문의</td>
                    <td>
                      <span className="pill lock">나와 학사·관리자</span>
                    </td>
                  </tr>
                  <tr>
                    <td>학생회 건의</td>
                    <td>학생회에 건의하거나 불편을 알리는 글</td>
                    <td>
                      <span className="pill lock">나와 학생회·관리자</span>
                    </td>
                  </tr>
                  <tr>
                    <td>학과 뉴스</td>
                    <td>학과 소식 기사 제출 (관리자가 검토)</td>
                    <td>
                      <span className="pill lock">나와 관리자만</span>
                    </td>
                  </tr>
                  <tr>
                    <td>동아리</td>
                    <td>동아리 소개와 부원 모집</td>
                    <td>
                      <span className="pill open">모든 회원</span>
                    </td>
                  </tr>
                  <tr>
                    <td>공모전 모집</td>
                    <td>공모전 팀원 모집</td>
                    <td>
                      <span className="pill open">모든 회원</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              비공개 게시판의 글은 통합 게시판에 나오지 않고, 다른 학생은 주소를 알아도 열 수 없습니다. 비공개 글에 올린
              사진도 똑같이 보호됩니다.
            </p>
          </section>

          <section id="write">
            <h2>글쓰기</h2>
            <p>
              게시판 오른쪽 위 <strong>글 작성하기</strong>(학사문의는 <strong>문의하기</strong>, 학과 뉴스는{' '}
              <strong>기사 제출하기</strong>)를 누릅니다. 통합 게시판에서 쓰면 <strong>게시할 공간</strong>에서 게시판을
              고를 수 있습니다.
            </p>
            <h3>입력 항목</h3>
            <ul className="plain">
              <li>
                <strong>작성자 이름</strong>: 글마다 직접 입력합니다. 실명이 아니어도 되지만, 서로 알아볼 수 있는 이름을
                권장합니다.
              </li>
              <li>
                <strong>머릿글</strong> (선택): 제목 앞에 <code>[동아리 이름]</code>처럼 붙는 말머리입니다. 예: 동아리
                게시판이면 동아리 이름, 학사문의면 “장학”·“휴학”.
              </li>
              <li>
                <strong>제목과 본문</strong>: 제목은 120자, 본문은 20,000자까지 쓸 수 있습니다.
              </li>
              <li>
                <strong>사진</strong> (선택): 글 하나에 <strong>5장</strong>까지 올릴 수 있습니다. JPG, PNG, WebP 사진을
                받고, 큰 사진은 올리기 전에 자동으로 줄어듭니다. 썸네일의 ✕ 버튼으로 뺄 수 있습니다.
              </li>
              <li>
                <strong>수정·삭제 비밀번호</strong>: 8자 이상. 다른 계정에서 이 글을 관리해야 할 때 씁니다(아래
                “수정·삭제” 참고).
              </li>
            </ul>
            <h3>동아리·공모전 모집 정보</h3>
            <p>
              동아리와 공모전 모집 글에는 <strong>모집 정보 (선택)</strong> 칸이 있습니다. 모집 상태, 마감일, 인원,
              필요한 역할을 필요한 것만 채우면 되고, 입력한 항목만 목록에 표시됩니다.
            </p>
            <div className="note">
              <strong>
                마감일이 지나면 자동으로 <span className="pill no">마감</span>으로 표시됩니다.
              </strong>{' '}
              “모집 중”으로 두었더라도 마감일 다음 날(한국 시간)부터는 마감으로 보입니다.
            </div>
          </section>

          <section id="edit">
            <h2>수정·삭제</h2>
            <p>
              글 상세 화면 아래의 <strong>수정</strong>, <strong>삭제</strong> 버튼을 씁니다.
            </p>
            <ul className="plain">
              <li>
                <strong>내가 쓴 글</strong>은 같은 계정으로 로그인해 있으면 <strong>비밀번호 없이</strong> 바로
                수정·삭제됩니다.
              </li>
              <li>
                <strong>다른 계정</strong>에서 수정·삭제하려면 글을 쓸 때 정한 비밀번호가 필요합니다. 동아리 공동
                운영진이 함께 글을 관리할 때 비밀번호를 공유하면 됩니다.
              </li>
              <li>수정할 때 사진을 빼거나 글을 삭제하면 그 사진도 함께 지워지며 되돌릴 수 없습니다.</li>
            </ul>
          </section>

          <section id="comments">
            <h2>댓글과 알림</h2>
            <p>
              학과 뉴스를 뺀 모든 글에 댓글을 달 수 있습니다. 댓글도 이름을 매번 입력하며, 1,000자까지 쓸 수 있습니다.
            </p>
            <ul className="plain">
              <li>내가 쓴 댓글은 휴지통 아이콘으로 지울 수 있습니다. 다른 사람 댓글은 지울 수 없습니다.</li>
              <li>글 목록에서 💬 옆 숫자는 댓글 수, 🖼 옆 숫자는 사진 수입니다.</li>
            </ul>
            <h3>알림</h3>
            <p>
              누군가 <strong>내 글에 댓글을 달면</strong> 오른쪽 위 🔔 종 아이콘에 빨간 점이 뜹니다. 종을 누르면 최근
              알림 20개가 보이고, 누르면 그 글로 이동합니다. 아직 안 본 알림은 파란 배경으로 표시됩니다.
            </p>
            <div className="note">
              읽음 표시는 <strong>브라우저마다 따로</strong> 기억합니다. 휴대폰에서 확인했어도 노트북에는 빨간 점이 남아
              있을 수 있습니다.
            </div>
          </section>

          <section id="search">
            <h2>검색과 필터</h2>
            <ul className="plain">
              <li>
                게시판 위 검색창에 입력하면 <strong>제목, 머릿글, 본문, 작성자 이름</strong>에서 찾습니다. 본문에서 찾은
                경우 해당 부분이 미리보기로 보입니다.
              </li>
              <li>
                동아리·공모전 게시판의 <strong>모집 중만</strong> 버튼을 누르면 마감되지 않은 모집 글만 봅니다.
              </li>
              <li>
                목록은 30개씩 보이고, 아래 <strong>더 보기</strong>로 이어서 봅니다.
              </li>
              <li>
                관리자가 <strong>고정</strong>한 공지 글은 게시판 맨 위에 <span className="pill fb">고정</span> 표시와
                함께 나옵니다.
              </li>
            </ul>
          </section>

          <section id="news">
            <h2>학과 뉴스 기사 제출</h2>
            <p>
              학과 뉴스는 학생 기자가 기사를 제출하고 관리자가 검토하는 공간입니다. 내가 제출한 기사는 나와 관리자만 볼
              수 있고, <strong>승인된 기사도 사이트에 공개되지 않습니다</strong>. 승인 기사는 관리자가 Word 파일로 모아
              학과 소식지 등에 씁니다.
            </p>
            <div className="flow" aria-label="기사 처리 흐름">
              <span className="pill wait">승인 대기</span>
              <span className="arrow">→</span>
              <span className="pill done">승인</span>
              <span>또는</span>
              <span className="pill fb">피드백</span>
              <span>또는</span>
              <span className="pill no">반려</span>
            </div>
            <dl className="status">
              <dt>
                <span className="pill wait">승인 대기</span>
              </dt>
              <dd>제출 직후 상태입니다. 관리자가 검토하기 전입니다.</dd>
              <dt>
                <span className="pill fb">피드백</span>
              </dt>
              <dd>
                고칠 부분이 있다는 뜻입니다. 기사 본문에 관리자가 남긴 형광펜, 굵게, 메모가 표시되고 전체 의견도 볼 수
                있습니다. <strong>수정해서 다시 제출</strong>하면 다시 승인 대기로 돌아가고 이전 피드백은 지워집니다.
              </dd>
              <dt>
                <span className="pill done">승인</span>
              </dt>
              <dd>기사가 채택되었습니다.</dd>
              <dt>
                <span className="pill no">반려</span>
              </dt>
              <dd>반려 사유가 함께 표시됩니다. 반려된 기사는 고칠 수 없으니 새 기사로 다시 작성하세요.</dd>
            </dl>
            <p>
              검토 결과가 나오면 사이드바의 <strong>학과 뉴스</strong> 옆에 빨간 점이 뜨고, 뉴스 탭에서 해당 기사에{' '}
              <strong>새 결과</strong> 표시가 붙습니다.
            </p>
          </section>

          <section id="desk">
            <h2>학사문의·학생회 건의</h2>
            <p>
              둘 다 <strong>비공개 게시판</strong>입니다. 학사문의는 <strong>학사</strong> 직책(학과 사무실)과 관리자만,
              학생회 건의는 <strong>학생회</strong> 직책과 관리자만 볼 수 있습니다. 글을 올리면 담당자가{' '}
              <strong>댓글로 답변</strong>합니다.
            </p>
            <dl className="status">
              <dt>
                <span className="pill wait">답변 대기</span> <span className="pill wait">처리 대기</span>
              </dt>
              <dd>아직 담당자가 답하지 않았습니다.</dd>
              <dt>
                <span className="pill done">답변 완료</span> <span className="pill done">처리 완료</span>
              </dt>
              <dd>담당자가 댓글로 답했습니다. 🔔 알림으로도 알려 줍니다.</dd>
            </dl>
            <p>
              담당자 댓글에는 <span className="role-badge academic">학사</span>,{' '}
              <span className="role-badge council">학생회</span>, <span className="role-badge admin">관리자</span>{' '}
              배지가 붙어 공식 답변인지 알 수 있습니다. 더 궁금한 점이 있으면{' '}
              <strong>그 글에 댓글로 다시 물어보세요</strong>. 자동으로 다시 대기 상태가 되어 담당자에게 알려집니다.
            </p>
          </section>

          <section id="rental">
            <h2>대여 신청</h2>
            <p>
              사이드바 아래 <strong>대여 신청</strong>에서 바로 이동합니다. 대여는 미컴 라운지 밖에서 처리됩니다.
            </p>
            <ul className="plain">
              <li>
                <strong>기자재 대여</strong>: 기자재 대여 노션 페이지가 새 탭으로 열립니다.
              </li>
              <li>
                <strong>호실 대여</strong>: 카카오톡 채널 <strong>경성대 미컴봇</strong> 채팅으로 연결됩니다.
                <ul className="plain">
                  <li>휴대폰: 카카오톡 앱에서 채팅방이 바로 열립니다.</li>
                  <li>
                    PC·맥: QR코드 창이 뜹니다. 휴대폰 카메라로 찍으면 카톡에서 열리고, <strong>웹에서 채팅 열기</strong>
                    로 브라우저에서 채팅할 수도 있습니다. PC 카카오톡에서 “경성대 미컴봇”을 검색해도 됩니다.
                  </li>
                </ul>
              </li>
            </ul>
          </section>

          <section id="account">
            <h2>계정 관리</h2>
            <p>
              오른쪽 위 ⚙ 아이콘(<strong>계정 설정</strong>)에서 할 수 있는 일입니다.
            </p>
            <ul className="plain">
              <li>
                <strong>이름 변경</strong>: 오른쪽 위에 보이는 내 이름을 바꿉니다. 글의 작성자 이름은 글마다 따로
                입력합니다.
              </li>
              <li>
                <strong>학교 이메일 변경</strong>: 새 학교 이메일로 확인 메일을 받아 바꿉니다. 바꾸면 다시 로그인해야
                합니다.
              </li>
              <li>
                <strong>비밀번호 재설정</strong>: 재설정 메일을 받아 로그인 비밀번호를 바꿉니다.
              </li>
            </ul>
            <h3>회원 탈퇴</h3>
            <p>
              확인 문구 <code>회원탈퇴</code>를 입력하고 <strong>계정 삭제</strong>를 누르면 탈퇴됩니다. 탈퇴하면:
            </p>
            <ul className="plain">
              <li>
                공개 게시판의 글과 댓글은 남고, 작성자가 <strong>탈퇴한 회원</strong>으로 바뀝니다. 같은 이메일로 다시
                가입해도 예전 글을 수정할 수 없으니, 지우고 싶은 글은 탈퇴 전에 지우세요.
              </li>
              <li>학사문의, 학생회 건의, 검토 중인 뉴스 기사는 답변·사진과 함께 삭제됩니다.</li>
              <li>승인된 뉴스 기사는 학과 기록으로 남습니다.</li>
            </ul>
          </section>

          <div className="part">
            <span className="part-label">직책 안내</span>
          </div>

          <section id="admin-join">
            <h2>직책 안내</h2>
            <p>
              회원은 <strong>일반</strong>, <strong>학사</strong>, <strong>학생회</strong>, <strong>관리자</strong> 중
              하나의 직책을 가집니다. 처음 가입하면 일반이고, <strong>관리자가 직책을 정해 줍니다</strong>. 직책이
              필요하면 관리자에게 요청하세요.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>직책</th>
                    <th>할 수 있는 일</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>일반</td>
                    <td>공개 게시판 읽기·쓰기, 내 문의·건의·기사 관리</td>
                  </tr>
                  <tr>
                    <td>학사</td>
                    <td>일반 + 모든 학사문의 보기·답변</td>
                  </tr>
                  <tr>
                    <td>학생회</td>
                    <td>일반 + 모든 학생회 건의 보기·답변</td>
                  </tr>
                  <tr>
                    <td>관리자</td>
                    <td>모든 기능: 뉴스 검토, 모든 문의·건의, 상단 고정, 글·댓글 정리, 회원 정지, 직책 관리</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="admin-review">
            <h2>뉴스 검토</h2>
            <p>
              관리자에게만 보이는 사이드바의 <strong>뉴스 승인</strong> 화면은 왼쪽 기사 목록, 오른쪽 기사 본문으로
              나뉩니다. 위쪽 탭(
              <span className="pill wait">승인 대기</span> <span className="pill fb">피드백</span>{' '}
              <span className="pill no">반려</span> <span className="pill done">승인</span>)으로 상태별 기사를 봅니다.
              목록은 30개씩 나오고 <strong>더 보기</strong>로 이어서 봅니다.
            </p>
            <h3>본문에 표시 남기기</h3>
            <p>기사 본문에서 문장을 드래그하면 작은 도구 막대가 뜹니다.</p>
            <ul className="plain">
              <li>
                <strong>형광펜</strong>, <strong>굵게</strong>: 짚어 줄 부분을 표시합니다.
              </li>
              <li>
                <strong>메모</strong>: 오른쪽 여백에 번호가 붙은 메모 카드로 의견을 남깁니다.
              </li>
              <li>
                <strong>지우기</strong>: 선택한 범위의 표시를 없앱니다.
              </li>
            </ul>
            <p>
              기사 전체에 대한 의견은 <strong>전체 의견 추가</strong>로 남깁니다.
            </p>
            <p>남긴 표시와 의견은 이 브라우저에 임시 저장되어, 창을 닫았다 와도 이어서 할 수 있습니다.</p>
            <h3>결정하기</h3>
            <ul className="plain">
              <li>
                <strong>승인</strong>: 기사를 채택합니다. 남겨 둔 표시는 보내지 않습니다.
              </li>
              <li>
                <strong>피드백 보내기</strong>: 표시와 전체 의견을 학생에게 보냅니다. 버튼의 숫자는 남긴 표시·의견
                수입니다. 학생이 고쳐서 다시 제출하면 승인 대기로 돌아옵니다.
              </li>
              <li>
                <strong>반려</strong>: 반려 사유를 적고 <strong>반려 확정</strong>을 누릅니다. 반려된 기사는 학생이 고칠
                수 없습니다.
              </li>
            </ul>
            <p>
              처리하면 다음 기사로 자동으로 넘어갑니다. 다른 관리자가 먼저 처리한 기사는 “이미 처리되었습니다”라고 알려
              줍니다.
            </p>
            <h3>Word로 내보내기</h3>
            <ul className="plain">
              <li>
                기사 오른쪽 위 <strong>⋯ 메뉴 → Word로 내보내기</strong>: 기사 한 편을 <code>.docx</code>로 받습니다.
              </li>
              <li>
                승인 탭의 <strong>승인 기사 모두 Word로</strong>: 승인된 기사 전체를 한 파일(
                <code>승인기사_날짜.docx</code>)로 받습니다. 기사마다 새 페이지에서 시작합니다.
              </li>
              <li>기사에 붙은 사진은 Word 파일에 들어가지 않습니다.</li>
            </ul>
            <p>
              같은 ⋯ 메뉴에서 기사 <strong>수정</strong>(오탈자 정리 등)과 <strong>삭제</strong>도 할 수 있습니다.
            </p>
          </section>

          <section id="admin-desk">
            <h2>문의·건의 답변</h2>
            <p>
              학사 직책은 <strong>학사문의</strong>, 학생회 직책은 <strong>학생회 건의</strong> 게시판에서 모든 학생의
              글을 봅니다. 관리자는 둘 다 봅니다. 답변이 필요한 글 수가 사이드바에 빨간 숫자로 표시됩니다.
            </p>
            <ol className="steps">
              <li>
                대기 상태(<span className="pill wait">답변 대기</span> / <span className="pill wait">처리 대기</span>)
                글을 엽니다.
              </li>
              <li>
                아래 댓글 칸에 이름(예: <code>학과사무실</code>, <code>학생회</code>)과 답변을 쓰고 등록합니다.
              </li>
              <li>
                자동으로 <span className="pill done">답변 완료</span> / <span className="pill done">처리 완료</span>가
                되고, 학생에게 🔔 알림이 갑니다. 댓글에는 직책 배지가 붙습니다.
              </li>
            </ol>
            <p>학생이 추가 질문을 댓글로 달면 다시 대기 상태로 돌아와 숫자가 올라갑니다.</p>
            <p>
              담당 게시판에 <strong>새 글</strong>이 올라오거나 학생이 <strong>추가 문의</strong>를 남기면 🔔 알림에도
              표시됩니다.
            </p>
          </section>

          <section id="admin-board">
            <h2>게시판 관리</h2>
            <ul className="plain">
              <li>
                <strong>상단 고정</strong>: 공개 게시판 글 상세 화면의 <strong>상단 고정</strong> 버튼으로 그 게시판 맨
                위에 고정합니다. 공지나 자주 묻는 안내에 씁니다. <strong>고정 해제</strong>로 원래 순서로 돌려놓습니다.
                비공개 글(뉴스·문의·건의)은 고정할 수 없습니다.
              </li>
              <li>
                <strong>글·댓글 정리</strong>: 관리자는 비밀번호 없이 모든 글을 수정·삭제하고, 모든 댓글을 지울 수
                있습니다. 부적절한 글을 정리할 때 씁니다.
              </li>
            </ul>
          </section>

          <section id="admin-members">
            <h2>회원·직책 관리</h2>
            <p>
              관리자는 <strong>뉴스 승인</strong> 화면 오른쪽 위의 <strong>회원·직책 관리</strong> 버튼으로 들어갑니다.
            </p>
            <h3>회원 찾기</h3>
            <ul className="plain">
              <li>
                검색창에 이름이나 학교 이메일 일부를 입력하고 <strong>검색</strong>을 누릅니다.
              </li>
              <li>
                <strong>직책</strong> 필터로 학사·학생회·관리자만 골라 볼 수 있고, <strong>상태</strong> 필터로 정지된
                회원만 볼 수 있습니다.
              </li>
              <li>직책이 있는 회원이 목록 위쪽에 나오고, 한 번에 20명씩 보입니다.</li>
            </ul>
            <h3>목록 보는 법</h3>
            <p>
              회원마다 한 줄에 <strong>회원 정보 · 직책 선택 · 정지 버튼</strong>이 나옵니다. 휴대폰에서는 직책 선택과
              정지 버튼이 회원 정보 아래에 나옵니다.
            </p>
            <ul className="plain">
              <li>
                이름 옆 배지로 직책을 알 수 있습니다: <span className="role-badge academic">학사</span>{' '}
                <span className="role-badge council">학생회</span> <span className="role-badge admin">관리자</span>.
                일반 회원은 배지가 없습니다.
              </li>
              <li>
                정지된 회원은 흐리게 보이고 이름 옆에 <strong>이용 정지</strong> 표시가 붙습니다.
              </li>
              <li>내 계정 줄의 직책 선택과 정지 버튼은 눌리지 않습니다.</li>
            </ul>
            <h3>가입 승인</h3>
            <p>
              학교 메일 서버가 인증 메일을 막아 인증을 못 한 학생은 로그인하면{' '}
              <span className="pill wait">승인 대기</span>로 등록됩니다. 대기 인원은 뉴스 승인 화면의{' '}
              <strong>회원·직책 관리</strong> 버튼 옆 숫자와 🔔 알림으로 알려 줍니다.
            </p>
            <ol className="steps">
              <li>
                <strong>상태</strong> 필터에서 <strong>승인 대기</strong>를 고르거나, 목록 맨 위의 승인 대기 회원을
                찾습니다.
              </li>
              <li>
                <strong>학번이나 연락처로 본인인지 꼭 확인</strong>한 뒤 <strong>승인</strong>을 누릅니다. 이메일 인증이
                없으니 이 확인이 본인 인증을 대신합니다.
              </li>
              <li>
                본인이 아니거나 알 수 없는 요청은 <strong>거절</strong>합니다. 거절된 계정은 로그인할 수 없습니다.
              </li>
            </ol>
            <p>
              승인·거절도 변경 기록에 남습니다. 나중에 인증 메일 링크를 누른 학생은 승인 없이 바로 이용할 수 있습니다.
            </p>
            <h3>직책 바꾸기</h3>
            <ol className="steps">
              <li>회원 줄의 직책 선택 상자에서 일반·학사·학생회·관리자 중 하나를 고릅니다.</li>
              <li>
                확인 창에 새 직책이 할 수 있는 일이 나옵니다. <strong>확인</strong>을 누르면 바로 적용됩니다.
              </li>
            </ol>
            <p>
              임기가 끝난 학생회나 학사 담당자는 <strong>일반</strong>으로 돌려놓으세요. 관리자도 여기서 다른 회원에게
              줄 수 있습니다.
            </p>
            <h3>정지와 복구</h3>
            <ul className="plain">
              <li>
                <strong>정지</strong>: 그 회원은 모든 기기에서 즉시 로그아웃되고 다시 로그인할 수 없습니다.
              </li>
              <li>
                <strong>복구</strong>: 정지된 회원 줄의 버튼으로 다시 이용할 수 있게 합니다.
              </li>
            </ul>
            <h3>변경 기록</h3>
            <p>
              화면 아래 <strong>변경 기록</strong>을 펼치면 최근 50건의 직책·상태 변경이 보입니다. 누가, 언제, 누구의
              직책(또는 상태)을 무엇에서 무엇으로 바꿨는지 남고, 기록은 수정하거나 지울 수 없습니다.
            </p>
            <div className="note">
              내 직책은 다른 관리자만 바꿀 수 있고, 마지막 남은 관리자는 직책 변경·정지·탈퇴가 모두 막힙니다. 인수인계
              때는 <strong>새 관리자에게 먼저 관리자 직책을 준 뒤</strong> 본인 직책을 넘기세요.
            </div>
          </section>

          <div className="part">
            <span className="part-label">도움말</span>
          </div>

          <section id="faq">
            <h2>자주 묻는 질문</h2>
            <details className="faq">
              <summary>인증 메일이 오지 않아요.</summary>
              <div>
                <p>
                  인증 메일은 <code>noreply@mecomm-project.firebaseapp.com</code>에서 옵니다. 도착까지 몇 분 걸릴 수
                  있고, 학교 메일의 <strong>스팸 메일함</strong>이나 <strong>스팸 격리함(차단 메일함)</strong>으로 갈 수
                  있으니 “firebaseapp”으로 검색해 보세요.
                </p>
                <p>
                  그래도 없으면 <strong>다시 가입하지 말고</strong> 로그인 화면에서 같은 이메일·비밀번호로 로그인한 뒤{' '}
                  <strong>인증 메일 다시 보내기</strong>를 누르세요. 다시 가입하면 “이미 가입된 이메일” 오류가 납니다.
                  이메일 주소를 잘못 입력했다면 관리자에게 알려주세요.
                </p>
                <p>
                  메일이 끝내 오지 않으면 로그인만 해두세요. <strong>관리자 승인 요청</strong>이 자동으로 접수되고,
                  관리자가 본인 확인 후 승인하면 다시 로그인해 이용할 수 있습니다.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>로그인 비밀번호를 잊어버렸어요.</summary>
              <div>
                <p>
                  로그인 화면의 <strong>비밀번호 재설정</strong>을 누르면 학교 메일로 재설정 링크가 옵니다.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>글 비밀번호를 잊어버렸어요.</summary>
              <div>
                <p>
                  글을 쓴 계정으로 로그인하면 비밀번호 없이 수정·삭제할 수 있습니다. 다른 계정에서 관리해야 한다면
                  관리자에게 요청하세요.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>내가 올린 학사문의를 다른 학생이 볼 수 있나요?</summary>
              <div>
                <p>
                  아니요. 학사문의는 작성자와 학사·관리자만, 학생회 건의는 작성자와 학생회·관리자만, 학과 뉴스는
                  작성자와 관리자만 볼 수 있고, 첨부한 사진도 마찬가지입니다.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>승인된 뉴스 기사는 어디서 볼 수 있나요?</summary>
              <div>
                <p>
                  승인 기사는 사이트에 공개되지 않고, 내 학과 뉴스 탭에서 <span className="pill done">승인</span> 상태로
                  확인할 수 있습니다. 관리자가 모아 학과 소식지 등에 싣습니다.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>사진이 올라가지 않아요.</summary>
              <div>
                <p>
                  JPG, PNG, WebP 사진만 올릴 수 있고 글 하나에 5장까지입니다. 짧은 시간에 너무 많이 올리면 1분 뒤 다시
                  시도하라는 안내가 나옵니다.
                </p>
              </div>
            </details>
            <details className="faq">
              <summary>“요청이 너무 많습니다”라고 떠요.</summary>
              <div>
                <p>짧은 시간에 글이나 댓글을 많이 올리면 잠시 막힙니다. 1분 뒤 다시 시도하세요.</p>
              </div>
            </details>
            <details className="faq">
              <summary>PC에서 호실 대여를 누르면 카톡이 안 열려요.</summary>
              <div>
                <p>
                  PC 카카오톡은 링크로 채널 채팅방을 여는 기능을 지원하지 않습니다. 창에 뜨는 QR코드를 휴대폰으로
                  찍거나, “웹에서 채팅 열기”를 쓰거나, PC 카톡에서 “경성대 미컴봇”을 검색하세요.
                </p>
              </div>
            </details>
          </section>
        </article>
      </div>
    </AppShell>
  );
}
