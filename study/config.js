// ===== 이안이 공부방 설정 =====
// 1) firebase: Word Hop과 같은 프로젝트 값으로 이미 채워져 있어요.
// 2) workerUrl: Cloudflare Worker 배포 후 나온 주소 (끝에 / 없이)
// 3) wordHopUrl: Word Hop 앱 주소 (같은 사이트 안이면 상대 경로도 가능)
export const CONFIG = {
  firebase: {
    // Word Hop(ian-voca)과 같은 Firebase 프로젝트 — 웹 설정값은 공개돼도 괜찮은 값이에요(보안은 규칙이 담당).
    apiKey: "AIzaSyAEF-7ELO76cQBBnbXqpmG9Hc4vxRo8juA",
    authDomain: "ian-voca-85951.firebaseapp.com",
    projectId: "ian-voca-85951",
    appId: "1:513167044992:web:4578cc34668fa46f319165"
  },

  workerUrl: "https://ian-math-grader.swk810620.workers.dev",
  wordHopUrl: "../",   // study 폴더 바로 위가 Word Hop (crazii81.github.io/ian-voca/)
  kidName: "이안",
  grade: 4,
  // 학생 기록을 저장할 Firestore 문서 ID. 아빠 계정과 이안이 계정이 같은 기록을 함께 봐요.
  studentId: "ian"
};
