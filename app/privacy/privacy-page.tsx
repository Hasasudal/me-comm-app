'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { api } from '../api-client';
import { AppShell, type ShellIdentity } from '../app-shell';

// Readable without signing in, like the help page. Content follows docs/privacy-legal-check.md (sections 1 and 2).
export default function PrivacyPage() {
  const [identity, setIdentity] = useState<ShellIdentity & { admin?: boolean }>({ loaded: false, signedIn: false });
  useEffect(() => {
    api<ShellIdentity>('/api/session')
      .then((session) => setIdentity({ ...session, loaded: true }))
      .catch(() => setIdentity((value) => ({ ...value, loaded: true })));
  }, []);

  return (
    <AppShell
      active="privacy"
      identity={identity}
      breadcrumb={
        <>
          라운지 <ChevronRight size={14} /> <b>개인정보 처리방침</b>
        </>
      }
    >
      <section className="page-heading">
        <div>
          <p className="eyebrow">PRIVACY</p>
          <h1>
            개인정보 처리방침<span className="heading-dot">.</span>
          </h1>
          <p>운영: 미컴 라운지 운영진(경성대 미디어커뮤니케이션학과 학생 커뮤니티)</p>
          <p>시행일: 2026년 12월 1일 (초안)</p>
        </div>
      </section>
      <article className="help-page">
        <section id="purpose">
          <h2>1. 처리 목적</h2>
          <p>미컴 라운지는 아래 목적으로만 개인정보를 처리합니다.</p>
          <ul className="plain">
            <li>회원 가입과 학교 이메일 인증, 로그인 유지</li>
            <li>게시판, 댓글, 학사문의·학생회 건의, 학과 뉴스 기사 제출 등 커뮤니티 서비스 제공</li>
            <li>문의와 건의에 대한 답변, 알림</li>
            <li>학과 소식 뉴스레터 발송(동의한 회원만)</li>
            <li>운영진 직책·정지·가입 승인 관리와 변경 기록 보관</li>
            <li>과도한 요청 제한 등 안정적인 서비스 운영</li>
          </ul>
        </section>

        <section id="items">
          <h2>2. 처리 항목</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>구분</th>
                  <th>항목</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>필수</td>
                  <td>학교 이메일, 이름, 비밀번호(Google Firebase가 보관하며 사이트 데이터베이스에는 없음)</td>
                </tr>
                <tr>
                  <td>서비스 이용 중 생기는 정보</td>
                  <td>
                    글·댓글·별명·문의·건의·기사 내용, 업로드한 사진(위치정보 제거), 직책과 이용 상태, 인증 시각,
                    관리자가 직책·정지·승인·거절을 처리한 기록(처리자와 대상의 이름·이메일)
                  </td>
                </tr>
                <tr>
                  <td>선택</td>
                  <td>뉴스레터 수신 여부</td>
                </tr>
                <tr>
                  <td>자동 수집</td>
                  <td>
                    로그인 유지용 세션 쿠키(<code>micom_session</code>). 요청 제한을 위한 IP는 원본을 저장하지 않고
                    해시 값으로만 저장합니다.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section id="basis">
          <h2>3. 처리 근거</h2>
          <ul className="plain">
            <li>
              <strong>계약 이행</strong>: 이메일, 이름, 작성한 글은 회원 가입과 커뮤니티 이용에 꼭 필요해서 별도
              동의 없이 처리합니다.
            </li>
            <li>
              <strong>동의</strong>: 뉴스레터 수신은 선택 사항이며, 동의한 회원에게만 보냅니다. 동의하지 않아도
              서비스를 이용할 수 있습니다.
            </li>
          </ul>
        </section>

        <section id="retention">
          <h2>4. 보유 기간과 파기</h2>
          <ul className="plain">
            <li>
              <strong>로그인 세션</strong>: 14일 동안 보관하고 지나면 삭제합니다.
            </li>
            <li>
              <strong>회원 탈퇴 시</strong>: 계정, 로그인 세션, 학사문의, 학생회 건의, 승인되지 않은 뉴스 기사, 뉴스레터
              발송 기록을 즉시 삭제합니다. 공개 게시판의 글과 댓글은 남기되 작성자를 ‘탈퇴한 회원’으로 바꿔
              익명화합니다. 승인된 뉴스 기사는 학과 기록으로 남습니다.
            </li>
            <li>
              <strong>미인증 가입 대기 계정</strong>: 30일 동안 보관하고 지나면 삭제합니다.
            </li>
            <li>
              <strong>백업</strong>: 서비스 장애에 대비한 백업은 최대 180일 보관한 뒤 삭제합니다. 탈퇴한 회원의
              정보도 이 기간 동안 백업에 남을 수 있습니다.
            </li>
            <li>
              <strong>관리 감사 기록</strong>(직책·정지·승인·거절 변경 기록): 3년 보관한 뒤 삭제합니다.
            </li>
            <li>
              법령에 따라 보존해야 하는 정보는 다른 정보와 분리해 보관하고, 보존 기간이 끝나면 지체 없이 파기합니다.
            </li>
          </ul>
        </section>

        <section id="third-party">
          <h2>5. 제3자 제공</h2>
          <p>미컴 라운지는 이용자의 개인정보를 제3자에게 제공하지 않습니다.</p>
        </section>

        <section id="outsourcing">
          <h2>6. 처리위탁과 국외 이전</h2>
          <p>서비스 운영을 위해 아래와 같이 개인정보 처리를 맡기고 있으며, 이 과정에서 국외로 이전됩니다.</p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>받는 곳</th>
                  <th>맡기는 일(목적)</th>
                  <th>이전 항목</th>
                  <th>이전 국가</th>
                  <th>이전 시기·방법</th>
                  <th>보유 기간</th>
                  <th>연락처</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Google LLC</td>
                  <td>Firebase 인증과 인증 메일 발송, Apps Script·Gmail을 통한 뉴스레터 발송</td>
                  <td>이메일, 이름, 비밀번호, 뉴스레터 수신자 이메일과 내용</td>
                  <td>미국 등 각 사업자의 데이터센터 소재국</td>
                  <td>서비스 이용 시 네트워크를 통해 전송</td>
                  <td>위탁 계약 종료 또는 회원 탈퇴 시까지</td>
                  <td>
                    <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">
                      https://policies.google.com/privacy
                    </a>
                  </td>
                </tr>
                <tr>
                  <td>Cloudflare, Inc.</td>
                  <td>서비스 호스팅, 데이터베이스, 파일(사진) 저장</td>
                  <td>서비스 이용 중 생기는 정보 전부</td>
                  <td>미국 등 각 사업자의 데이터센터 소재국</td>
                  <td>서비스 이용 시 네트워크를 통해 전송</td>
                  <td>위탁 계약 종료 또는 회원 탈퇴 시까지</td>
                  <td>
                    <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">
                      https://www.cloudflare.com/privacypolicy/
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p>
            <strong>거부 방법</strong>: 거부하면 회원 서비스를 이용할 수 없습니다. 뉴스레터는 수신을 거부하면 발송
            위탁이 중단됩니다.
          </p>
        </section>

        <section id="rights">
          <h2>7. 이용자 권리와 행사 방법</h2>
          <ul className="plain">
            <li>
              <strong>계정 설정</strong>에서 이름, 이메일을 직접 수정하고 회원 탈퇴를 할 수 있습니다.
            </li>
            <li>
              뉴스레터는 메일 하단의 <strong>뉴스레터 받지 않기</strong> 링크나 <strong>계정 설정</strong>에서 언제든
              수신을 거부할 수 있습니다.
            </li>
            <li>
              그 밖의 열람, 정정, 삭제, 처리정지 요청은 아래 개인정보 보호책임자 이메일로 보내 주세요. 요청을 받으면
              10일 안에 처리합니다.
            </li>
          </ul>
        </section>

        <section id="safety">
          <h2>8. 안전성 확보조치</h2>
          <ul className="plain">
            <li>접근 권한을 관리자, 학사, 학생회 등 직책별로 나누어 필요한 사람만 볼 수 있게 합니다.</li>
            <li>비밀번호는 Google Firebase가 보관하고 이 사이트는 저장하지 않습니다.</li>
            <li>로그인 세션은 해시 값으로만 저장합니다.</li>
            <li>모든 구간에서 HTTPS로 통신합니다.</li>
            <li>업로드한 사진의 위치정보(EXIF)를 제거합니다.</li>
          </ul>
        </section>

        <section id="cookies">
          <h2>9. 자동 수집 장치(쿠키 등)</h2>
          <ul className="plain">
            <li>
              로그인 유지용 쿠키 <code>micom_session</code> 하나만 사용합니다.
            </li>
            <li>브라우저 저장소는 테마, 임시 저장 같은 기능용으로만 씁니다.</li>
            <li>광고·분석 쿠키는 쓰지 않습니다.</li>
            <li>브라우저 설정에서 쿠키를 거부할 수 있지만, 거부하면 로그인할 수 없습니다.</li>
            <li>
              화면 글꼴(Google Fonts)과 로그인 보안 확인(reCAPTCHA)은 이용자의 브라우저가 Google에 직접 접속하며,
              이때 IP가 Google에 전달될 수 있습니다.
            </li>
          </ul>
        </section>

        <section id="officer">
          <h2>10. 개인정보 보호책임자</h2>
          {/* TODO: 운영진이 채움 */}
          <ul className="plain">
            <li>
              이름: <strong>[주현준]</strong>
            </li>
            <li>
              이메일: <strong>[tofubread@ks.ac.kr]</strong>
            </li>
          </ul>
        </section>

        <section id="remedy">
          <h2>11. 권익침해 구제 방법</h2>
          <p>개인정보 침해로 도움이 필요하면 아래 기관에 문의할 수 있습니다.</p>
          <ul className="plain">
            <li>개인정보침해신고센터: privacy.kisa.or.kr, 118</li>
            <li>개인정보분쟁조정위원회: kopico.go.kr, 1833-6972</li>
            <li>대검찰청: 1301</li>
            <li>경찰청: ecrm.police.go.kr, 182</li>
          </ul>
        </section>

        <section id="changes">
          <h2>12. 처리방침 변경</h2>
          <p>
            처리방침이 바뀌면 사이트 공지로 알리고, 시행일과 이전 버전을 기록해 둡니다. 현재 버전의 시행일은 2026년
            12월 1일(초안)입니다.
          </p>
        </section>
      </article>
    </AppShell>
  );
}
