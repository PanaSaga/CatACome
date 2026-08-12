// Pages Functions 공용 헬퍼 — 라우트 4개가 반복하는 부분만 모았다.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

/**
 * 익명 토큰 검증. anonToken()이 만드는 형식(a + 8자 + 타임스탬프36진수)만 통과시켜서
 * 아무 문자열이나 헤더에 넣어 다른 사람 프로필을 덮어쓰는 걸 막는다.
 * 인증이 아니라 "형식이 맞는 무작위 ID인가"만 본다 — 이 게임에 로그인은 없다.
 */
export function tokenOf(request) {
  const t = request.headers.get('x-player-token') || '';
  return /^[a-z0-9]{6,40}$/i.test(t) ? t : null;
}
