// 공부방 공통 백엔드: Firebase 로그인 · Firestore 기록 · 채점 서버 호출
// 주소에 ?demo 를 붙이면 로그인 없이 가짜 데이터로 화면만 미리 볼 수 있어요.
import { CONFIG } from "./config.js";

const DEMO = new URLSearchParams(location.search).has("demo");
const V = "10.12.2";
let fb = null;

async function loadFirebase(){
  if (fb) return fb;
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
  ]);
  const app = initializeApp(CONFIG.firebase);
  fb = { A, F, auth: A.getAuth(app), db: F.getFirestore(app) };
  return fb;
}

function blobToB64(blob){
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
}

/* ---------------- real backend ---------------- */
const real = {
  demo: false,
  async currentUser(){
    const { A, auth } = await loadFirebase();
    try { await A.getRedirectResult(auth); } catch(_) {}
    return await new Promise(r => { const un = A.onAuthStateChanged(auth, u => { un(); r(u); }); });
  },
  async login(){
    const { A, auth } = await loadFirebase();
    const p = new A.GoogleAuthProvider();
    p.setCustomParameters({ prompt: "select_account" });
    try { await A.signInWithPopup(auth, p); }
    catch(e){
      if (["auth/popup-blocked","auth/operation-not-supported-in-this-environment","auth/cancelled-popup-request"].includes(e.code)) await A.signInWithRedirect(auth, p);
      else throw e;
    }
    return auth.currentUser;
  },
  async logout(){ const { A, auth } = await loadFirebase(); await A.signOut(auth); },
  async listSessions(){
    const { F, db } = await loadFirebase();
    const q = F.query(F.collection(db, "mathStudy", CONFIG.studentId, "sessions"), F.orderBy("ts","desc"), F.limit(300));
    const snap = await F.getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  },
  async saveSession(s){
    const { F, db } = await loadFirebase();
    const { id, ...body } = s;
    await F.setDoc(F.doc(db, "mathStudy", CONFIG.studentId, "sessions", id), JSON.parse(JSON.stringify(body)));
  },
  async deleteSession(id){
    const { F, db } = await loadFirebase();
    await F.deleteDoc(F.doc(db, "mathStudy", CONFIG.studentId, "sessions", id));
  },
  async getSettings(){
    const { F, db } = await loadFirebase();
    const d = await F.getDoc(F.doc(db, "mathStudy", CONFIG.studentId));
    return d.exists() ? d.data() : {};
  },
  async setSettings(obj){
    const { F, db } = await loadFirebase();
    await F.setDoc(F.doc(db, "mathStudy", CONFIG.studentId), obj, { merge: true });
  },
  async grade(blob, mentor){
    const { auth } = await loadFirebase();
    if (!auth.currentUser) throw { code: "unauthorized" };
    const token = await auth.currentUser.getIdToken();
    const image = await blobToB64(blob);
    let r;
    try {
      r = await fetch(CONFIG.workerUrl + "/grade", {
        method: "POST",
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ image, mentor })
      });
    } catch(e){ throw { code: "network" }; }
    const data = await r.json().catch(() => null);
    if (!r.ok){ if (data && data.detail) console.warn("grade error detail:", data.status, data.detail); throw { code: (data && data.code) || ("http_" + r.status), message: data && data.error, status: data && data.status }; }
    return data;
  }
};

/* ---------------- demo backend ---------------- */
const DEMO_RESULT = {
  sheet: "G-256b 두 자리 수 ÷ 한 자리 수 (데모)",
  overall_praise: "10문제 중 대부분을 정확하게 풀었어. 특히 42 ÷ 3처럼 받아내림이 있는 나눗셈을 깔끔하게 해냈어.",
  habit_tip: "나눠지는 수에 0이 있으면 '0 ÷ 나누는 수 = 0'을 몫에 꼭 써 주기.",
  problems: [
    { no:"(11)", type:"division", question:"36 ÷ 6", student:"6", answer:"6", status:"correct", tags:[], praise:"구구단 6단을 바로 떠올렸어.", box:[0.25,0.24,0.2,0.08], visual:{kind:"long_division",dividend:36,divisor:6}, practice:[] },
    { no:"(13)", type:"division", question:"40 ÷ 2", student:"22", answer:"20", status:"wrong", tags:["0 처리"], where:"일의 자리 몫을 0이 아니라 2로 썼어요.", explain:"십의 자리 4 ÷ 2 = 2, 일의 자리 0 ÷ 2 = 0이에요. 그래서 몫은 20이에요.", praise:"십의 자리 몫 2는 정확했어.", box:[0.22,0.48,0.2,0.1], visual:{kind:"long_division",dividend:40,divisor:2,student_work:{quotient:"22",rows:["8","4"]}}, practice:[{q:"60 ÷ 3",a:"20"},{q:"80 ÷ 4",a:"20"}] },
    { no:"(17)", type:"division", question:"42 ÷ 3", student:"14", answer:"14", status:"correct", tags:[], praise:"12를 내려서 다시 나누는 과정을 정확히 했어.", box:[0.6,0.33,0.2,0.1], visual:{kind:"long_division",dividend:42,divisor:3}, practice:[] },
    { no:"(10)", type:"multiplication", question:"287 × 6", student:"2282", answer:"1722", status:"wrong", tags:["받아올림 실수"], where:"올린 숫자를 다음 자리에 더하지 않았어요.", explain:"7 × 6 = 42에서 4를 올리고, 8 × 6 = 48에 4를 더해 52가 돼요. 올린 숫자를 꼭 더해요.", box:[0.6,0.6,0.2,0.1], visual:{kind:"multiply",a:287,b:6,student_work:{result:"2282"}}, practice:[{q:"365 × 3",a:"1095"},{q:"148 × 5",a:"740"}] },
    { no:"4", type:"word", question:"수건 25장을 3장씩 포장하면 남는 수건은?", student:"1", answer:"25 ÷ 3 = 8 … 1, 1장", status:"incomplete", tags:["식 미완성"], where:"답은 맞았지만 식을 끝까지 쓰지 않았어요.", explain:"문장제는 식과 답을 둘 다 써야 해요. 25 ÷ 3 = 8 … 1에서 나머지 1이 남는 수건이에요.", praise:"나머지가 답이라는 걸 정확히 알았어.", box:[0.1,0.8,0.5,0.1], visual:{kind:"steps",steps:[{label:"3장씩 몇 상자?",expr:"25 ÷ 3",result:"8 … 1"},{label:"남는 수건은 나머지",expr:"나머지",result:"1장"}]}, practice:[{q:"26 ÷ 4 의 나머지",a:"2"}] }
  ]
};
const demoStore = { sessions: [], settings: {} };
const demo = {
  demo: true,
  async currentUser(){ return { displayName: "데모", email: "demo@example.com" }; },
  async login(){ return this.currentUser(); },
  async logout(){},
  async listSessions(){ return demoStore.sessions.slice(); },
  async saveSession(s){ const i = demoStore.sessions.findIndex(x=>x.id===s.id); if(i>=0) demoStore.sessions[i]=structuredClone(s); else demoStore.sessions.unshift(structuredClone(s)); },
  async deleteSession(id){ demoStore.sessions = demoStore.sessions.filter(s=>s.id!==id); },
  async getSettings(){ return { ...demoStore.settings }; },
  async setSettings(o){ Object.assign(demoStore.settings, o); },
  async grade(){ await new Promise(r=>setTimeout(r,1200)); return structuredClone(DEMO_RESULT); }
};

export const backend = DEMO ? demo : real;
export { CONFIG };
