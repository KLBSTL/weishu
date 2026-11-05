/* global location, document, window */

const token = location.hash.slice(1);
const status = document.querySelector('#status');
const turns = document.querySelector('#turns');
const error = document.querySelector('#error');
const watch = document.querySelector('#watch');
const question = document.querySelector('#question');
const send = document.querySelector('#send');
const cancel = document.querySelector('#cancel');
const goals = [...document.querySelectorAll('[data-goal]')];
const phaseNames = {
  INFO_CHECK: '确认信息', BAND_DRAFT: '选择策略', BATTLE_CHECK: '协议启动', ROUND_START: '回合开始',
  SP_DRAFT: '机变阶段', PREP: '整备', COMBAT: '作战', UNITE: '联防', SETTLE: '结算',
  FINAL_ASSAULT: '最终攻势', HIDDEN_CORE: '隐秘核心',
};
let state;
let active;
let busy = false;
let lastTurns = '';

async function request(path, body) {
  const response = await fetch(path, {
    headers: { Authorization: 'Bearer ' + token, ...(body && { 'Content-Type': 'application/json' }) },
    ...(body && { method: 'POST', body: JSON.stringify(body) }),
  });
  return { status: response.status, data: await response.json() };
}

function controls() {
  const online = state?.playerOnline && !busy;
  question.disabled = send.disabled = !online || !!active;
  cancel.disabled = !online || !active;
  watch.disabled = !state;
  for (const goal of goals) goal.disabled = !online;
}

function line(parent, text) {
  const p = document.createElement('p');
  p.textContent = text;
  parent.append(p);
}

function render() {
  controls();
  if (!state) {
    lastTurns = '';
    turns.replaceChildren();
    return;
  }
  const { round, phase } = state.status;
  const pet = { online: '已连接', paused: '演出已暂停', 'http-403': '等待本机授权' }[state.petStatus] ?? '连接中';
  status.textContent = `${state.room} · R${round} · ${phaseNames[phase] ?? phase} · 桌宠${pet}`
    + (state.playerOnline ? '' : ' · 等待玩家重连');
  const key = JSON.stringify(state.turns);
  if (key === lastTurns) return;
  lastTurns = key;
  turns.replaceChildren(...state.turns.map(turn => {
    const row = document.createElement('article');
    if (turn.question) line(row, turn.question);
    line(row, `R${turn.referenceRound} · ${turn.text || (turn.state === 'cancelled' ? '回复已取消' : '正在回复…')}`);
    if (turn.goal?.action) line(row, turn.goal.action.type === 'level' ? '调度中心已升级' : `已购入 ${turn.goal.action.unit}`);
    if (turn.goal?.antiAirDeployed != null) line(row, `实际有 ${turn.goal.antiAirDeployed} 名干员可对空`);
    if (turn.goal?.estimatedLpSaved != null) line(row, `试打预计少扣 ${turn.goal.estimatedLpSaved} LP`);
    return row;
  }));
  turns.scrollTop = turns.scrollHeight;
}

async function refresh() {
  if (!token) {
    status.textContent = '请在卫戍对局的「AI 对话」里绑定桌宠。';
    return false;
  }
  try {
    const result = await request('/state');
    state = result.status === 200 ? result.data : null;
    if (!state) status.textContent = '此对局的绑定已结束。请从当前对局重新打开聊天。';
  } catch {
    state = null;
    status.textContent = '正在重连本机卫戍服务…';
  }
  active = state?.turns.find(turn => turn.state === 'streaming');
  render();
  return true;
}

async function submit(path, body) {
  if (!state?.playerOnline || busy) return false;
  busy = true;
  controls();
  error.textContent = '';
  try {
    const { status: code, data } = await request(path, body);
    if (code === 200) return true;
    error.textContent = data.error === 'RATE' ? '上一条问题仍在处理，请稍后再试。' : '发送失败，请检查对局连接。';
  } catch {
    error.textContent = '本机卫戍服务连接失败。';
  } finally {
    await refresh();
    busy = false;
    controls();
  }
  return false;
}

document.querySelector('form').addEventListener('submit', async event => {
  event.preventDefault();
  const text = question.value.trim();
  if (text && await submit('/ask', { text, requestId: crypto.randomUUID() })) question.value = '';
});
for (const button of goals) button.addEventListener('click', () =>
  submit('/ask', { text: button.textContent, goal: button.dataset.goal, requestId: crypto.randomUUID() }));
cancel.addEventListener('click', () => active && submit('/cancel', { requestId: active.requestId }));
watch.addEventListener('click', () => state && window.open(state.watch, 'stronghold-desktop-watch', 'popup,width=960,height=640'));
document.querySelector('#preview').addEventListener('click', () =>
  window.open('/preview', 'stronghold-desktop-preview', 'popup,width=480,height=360'));

async function poll() {
  if (await refresh()) setTimeout(poll, 500);
}
void poll();
