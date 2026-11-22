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

/* ---------- 공부방 공통: 시간대 · XP ---------- */
export const TZ = CONFIG.timeZone || "Australia/Brisbane";   // Word Hop과 같은 기준 (이안이 시간)
export const LEVEL_XP = 300, STAR_XP = 20;                    // 300 XP마다 레벨 업, Word Hop 별 1개 = 20 XP
const FMT = new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
export function localDate(t = Date.now()){ const p = {}; FMT.formatToParts(new Date(t)).forEach(x => p[x.type] = x.value); return `${p.year}-${p.month}-${p.day}`; }
export function addDays(d, n){ const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
export function weekStart(d){ const x = new Date(d + "T00:00:00Z"); return addDays(d, -((x.getUTCDay() + 6) % 7)); }  // 월요일 시작
export function sessionXP(s){
  const pd = s.problems.reduce((a,p)=>a+(p.practiceDone||0),0), bf = s.problems.filter(p=>p.bugFound).length;
  return s.correct*10 + (s.total>0 && s.correct===s.total ? 30 : 0) + pd*15 + bf*5;
}
export function wordHopStars(wh){ return wh ? Object.values(wh.stars||{}).reduce((a,v)=>a+(+v||0),0) + (+wh.bonus||0) : 0; }
export function wordHopXP(wh){ return wordHopStars(wh) * STAR_XP; }

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
  // Word Hop 기록 읽기 (Word Hop 데이터는 읽기만 하고 바꾸지 않아요)
  // 아빠(관리자) 계정은 학생 목록에서 이안이 기록을, 이안이 계정은 자기 기록을 읽어요.
  async getWordHop(){
    const { F, db, auth } = await loadFirebase();
    const me = auth.currentUser; if (!me) return null;
    let pick = null;
    try {
      const snap = await F.getDocs(F.collection(db, "wordhop"));
      const want = String(CONFIG.wordHopStudent || "").toLowerCase();
      let docs = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
      if (want) docs = docs.filter(d => JSON.stringify(d.profile || {}).toLowerCase().includes(want));
      else if (docs.length > 1) docs = docs.filter(d => d.uid !== me.uid);
      pick = docs.sort((a,b) => (b.updatedAt||0) - (a.updatedAt||0))[0] || null;
    } catch(_) { /* 학생 계정은 목록 대신 자기 기록만 볼 수 있어요 */ }
    if (!pick){ try { const d = await F.getDoc(F.doc(db, "wordhop", me.uid)); if (d.exists()) pick = { uid: me.uid, ...d.data() }; } catch(_){} }
    if (!pick) return null;
    let bonus = 0;
    try { const c = await F.getDoc(F.doc(db, "wordhop", pick.uid, "control", "main")); if (c.exists()) bonus = (c.data().msgs || []).reduce((a,m)=>a+(+m.bonus||0),0); } catch(_){}
    return { stars: pick.stars || {}, bonus, log: pick.log || [], days: pick.days || {}, name: (pick.profile && pick.profile.name) || "" };
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
  async grade(){ await new Promise(r=>setTimeout(r,1200)); return structuredClone(DEMO_RESULT); },
  async getWordHop(){
    const now = Date.now(), day = 864e5;
    const log = [0,1,2,4].map((d,i) => ({ t: now - d*day - 3600e3, sid: "d"+(10+i), kind: ["learn","write","speak","learn"][i], label: `Day ${10+i}`, n: 10, score: [9,8,10,7][i], ms: 300000 }));
    return { stars: { d1:3, d2:3, d3:2, d4:3, d5:3, d6:2, d7:3, d8:3, d9:2, d10:3 }, bonus: 2, log, days: {}, name: "Ian" };
  }
};

export const backend = DEMO ? demo : real;
export { CONFIG };
